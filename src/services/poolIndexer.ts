import { ethers, Contract, BigNumber } from 'ethers';
import { db, dbHelpers } from '../db/database';
import { config } from '../config';
import { UniswapV3FactoryABI, UniswapV3PoolABI, ERC20ABI } from '../abis';
import { sqrtPriceX96ToPrice, tickToPrice } from '../utils/price';

export class PoolIndexer {
  private provider: ethers.providers.JsonRpcProvider;
  private factory: Contract;

  constructor() {
    this.provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    this.factory = new ethers.Contract(
      config.contracts.factory,
      UniswapV3FactoryABI,
      this.provider
    );
  }

  /**
   * Index all pools created by the factory
   */
  async indexAllPools(fromBlock?: number): Promise<void> {
    console.log('🔍 Indexing all pools...');
    
    const lastIndexed = dbHelpers.getState('last_indexed_block');
    const startBlock = fromBlock || (lastIndexed ? parseInt(lastIndexed) : config.indexer.startBlock);
    const currentBlock = await this.provider.getBlockNumber();
    
    console.log(`  Scanning from block ${startBlock} to ${currentBlock}`);
    
    const filter = this.factory.filters.PoolCreated();
    
    // Query in batches
    for (let from = startBlock; from <= currentBlock; from += config.indexer.batchSize) {
      const to = Math.min(from + config.indexer.batchSize - 1, currentBlock);
      
      try {
        const events = await this.factory.queryFilter(filter, from, to);
        
        for (const event of events) {
          if (event.args) {
            await this.processPoolCreated(event);
          }
        }
        
        if (events.length > 0) {
          console.log(`  Processed blocks ${from} - ${to}: ${events.length} pools`);
        }
      } catch (error) {
        console.error(`  Error processing blocks ${from} - ${to}:`, error);
      }
    }
    
    dbHelpers.setState('last_indexed_block', currentBlock.toString());
    await db.write();
    
    console.log('✅ Pool indexing complete');
  }

  /**
   * Process a PoolCreated event
   */
  private async processPoolCreated(event: ethers.Event): Promise<void> {
    const { token0, token1, fee, tickSpacing, pool } = event.args!;
    
    // Get or create tokens
    await this.ensureToken(token0);
    await this.ensureToken(token1);
    
    // Insert pool
    dbHelpers.addPool({
      address: pool,
      token0: token0,
      token1: token1,
      fee: fee,
      tick_spacing: tickSpacing,
    });
    
    // Update pool state
    await this.updatePoolState(pool);
    
    console.log(`    📊 Pool: ${pool} (${fee / 10000}%)`);
  }

  /**
   * Ensure a token exists in the database
   */
  private async ensureToken(address: string): Promise<void> {
    const existing = dbHelpers.getToken(address);
    
    if (!existing) {
      try {
        const token = new ethers.Contract(address, ERC20ABI, this.provider);
        const [name, symbol, decimals] = await Promise.all([
          token.name().catch(() => 'Unknown'),
          token.symbol().catch(() => '???'),
          token.decimals().catch(() => 18),
        ]);
        
        dbHelpers.addToken({
          address,
          symbol,
          name,
          decimals,
        });
        
        console.log(`    🪙 Token: ${symbol} (${address})`);
      } catch (error) {
        console.error(`    Error fetching token ${address}:`, error);
      }
    }
  }

  /**
   * Update pool state (liquidity, price, tick)
   */
  async updatePoolState(poolAddress: string): Promise<void> {
    try {
      const pool = new ethers.Contract(poolAddress, UniswapV3PoolABI, this.provider);
      
      const [slot0, liquidity, feeGrowth0, feeGrowth1] = await Promise.all([
        pool.slot0(),
        pool.liquidity(),
        pool.feeGrowthGlobal0X128(),
        pool.feeGrowthGlobal1X128(),
      ]);
      
      dbHelpers.updatePool(poolAddress, {
        sqrt_price_x96: slot0.sqrtPriceX96.toString(),
        tick: slot0.tick,
        liquidity: liquidity.toString(),
        fee_growth_global0_x128: feeGrowth0.toString(),
        fee_growth_global1_x128: feeGrowth1.toString(),
        last_updated: Math.floor(Date.now() / 1000),
      });
    } catch (error) {
      console.error(`Error updating pool state ${poolAddress}:`, error);
    }
  }

  /**
   * Update all pool states
   */
  async updateAllPoolStates(): Promise<void> {
    const pools = dbHelpers.getAllPools();
    
    console.log(`🔄 Updating ${pools.length} pool states...`);
    
    for (const pool of pools) {
      await this.updatePoolState(pool.address);
    }
    
    await db.write();
    console.log('✅ Pool states updated');
  }

  /**
   * Index swap events for a pool
   */
  async indexSwapEvents(poolAddress: string, fromBlock?: number): Promise<void> {
    const pool = new ethers.Contract(poolAddress, UniswapV3PoolABI, this.provider);
    
    const startBlock = fromBlock || 0;
    const currentBlock = await this.provider.getBlockNumber();
    
    const filter = pool.filters.Swap();
    
    for (let from = startBlock; from <= currentBlock; from += config.indexer.batchSize) {
      const to = Math.min(from + config.indexer.batchSize - 1, currentBlock);
      
      try {
        const events = await pool.queryFilter(filter, from, to);
        
        for (const event of events) {
          await this.processSwapEvent(poolAddress, event);
        }
      } catch (error) {
        console.error(`Error indexing swaps for ${poolAddress}:`, error);
      }
    }
    
    await db.write();
  }

  /**
   * Process a swap event
   */
  private async processSwapEvent(poolAddress: string, event: ethers.Event): Promise<void> {
    const block = await event.getBlock();
    const { sender, recipient, amount0, amount1, sqrtPriceX96, liquidity, tick } = event.args!;
    
    // Note: For simplicity, we're not storing all swaps to keep the JSON file small
    // In a production system, you'd use a proper database
  }
}

export const poolIndexer = new PoolIndexer();
