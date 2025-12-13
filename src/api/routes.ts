import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { db, dbHelpers } from '../db/database';
import { priceTracker } from '../services/priceTracker';
import { poolIndexer } from '../services/poolIndexer';
import { sqrtPriceX96ToPrice } from '../utils/price';
import { config } from '../config';
import { QuoterV2ABI } from '../abis';

const router = Router();

// ============================================================================
// POOLS
// ============================================================================

router.get('/pools', (req: Request, res: Response) => {
  try {
    const pools = dbHelpers.getAllPools();
    
    const poolsWithPrices = pools.map(pool => {
      const token0 = dbHelpers.getToken(pool.token0);
      const token1 = dbHelpers.getToken(pool.token1);
      
      let price0 = null;
      let price1 = null;

      if (pool.sqrt_price_x96 && token0 && token1) {
        const prices = sqrtPriceX96ToPrice(
          pool.sqrt_price_x96,
          token0.decimals,
          token1.decimals
        );
        price0 = prices.price0;
        price1 = prices.price1;
      }

      return {
        ...pool,
        token0_symbol: token0?.symbol || '???',
        token0_name: token0?.name || 'Unknown',
        token0_decimals: token0?.decimals || 18,
        token1_symbol: token1?.symbol || '???',
        token1_name: token1?.name || 'Unknown',
        token1_decimals: token1?.decimals || 18,
        price_token0_in_token1: price0,
        price_token1_in_token0: price1,
        fee_percent: pool.fee / 10000,
      };
    });

    res.json({ success: true, data: poolsWithPrices });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/pools/:address', (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const pool = dbHelpers.getPool(address);

    if (!pool) {
      return res.status(404).json({ success: false, error: 'Pool not found' });
    }

    const token0 = dbHelpers.getToken(pool.token0);
    const token1 = dbHelpers.getToken(pool.token1);
    
    let price0 = null;
    let price1 = null;

    if (pool.sqrt_price_x96 && token0 && token1) {
      const prices = sqrtPriceX96ToPrice(
        pool.sqrt_price_x96,
        token0.decimals,
        token1.decimals
      );
      price0 = prices.price0;
      price1 = prices.price1;
    }

    const change24h = priceTracker.get24hChange(address);

    res.json({
      success: true,
      data: {
        ...pool,
        token0_symbol: token0?.symbol || '???',
        token0_name: token0?.name || 'Unknown',
        token0_decimals: token0?.decimals || 18,
        token1_symbol: token1?.symbol || '???',
        token1_name: token1?.name || 'Unknown',
        token1_decimals: token1?.decimals || 18,
        price_token0_in_token1: price0,
        price_token1_in_token0: price1,
        fee_percent: pool.fee / 10000,
        change_24h: change24h,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/pools/pair/:token0/:token1', (req: Request, res: Response) => {
  try {
    const { token0, token1 } = req.params;
    const fee = req.query.fee ? parseInt(req.query.fee as string) : null;

    let pools = dbHelpers.getPoolsByPair(token0, token1);
    
    if (fee) {
      pools = pools.filter(p => p.fee === fee);
    }

    res.json({ success: true, data: pools.map(p => ({ address: p.address, fee: p.fee })) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// PRICES & CHARTS
// ============================================================================

router.get('/prices/:poolAddress', (req: Request, res: Response) => {
  try {
    const { poolAddress } = req.params;
    const prices = priceTracker.getCurrentPrice(poolAddress);

    if (!prices) {
      return res.status(404).json({ success: false, error: 'Price not found' });
    }

    const change24h = priceTracker.get24hChange(poolAddress);

    res.json({
      success: true,
      data: {
        ...prices,
        change_24h: change24h,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/prices/:poolAddress/history', (req: Request, res: Response) => {
  try {
    const { poolAddress } = req.params;
    const {
      from = Math.floor(Date.now() / 1000) - 86400 * 7,
      to = Math.floor(Date.now() / 1000),
      limit = 1000,
    } = req.query;

    const history = priceTracker.getPriceHistory(
      poolAddress,
      parseInt(from as string),
      parseInt(to as string),
      parseInt(limit as string)
    );

    res.json({ success: true, data: history });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/prices/:poolAddress/candles', (req: Request, res: Response) => {
  try {
    const { poolAddress } = req.params;
    const {
      interval = '1h',
      from = Math.floor(Date.now() / 1000) - 86400 * 30,
      to = Math.floor(Date.now() / 1000),
    } = req.query;

    const candles = priceTracker.getCandles(
      poolAddress,
      interval as string,
      parseInt(from as string),
      parseInt(to as string)
    );

    res.json({ success: true, data: candles });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// TOKENS
// ============================================================================

router.get('/tokens', (req: Request, res: Response) => {
  try {
    const tokens = dbHelpers.getAllTokens();
    res.json({ success: true, data: tokens });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/tokens/:address', (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const token = dbHelpers.getToken(address);

    if (!token) {
      return res.status(404).json({ success: false, error: 'Token not found' });
    }

    const pools = dbHelpers.getAllPools().filter(
      p => p.token0.toLowerCase() === address.toLowerCase() || 
           p.token1.toLowerCase() === address.toLowerCase()
    );

    res.json({
      success: true,
      data: {
        ...token,
        pools: pools.map(p => ({ address: p.address, fee: p.fee, token0: p.token0, token1: p.token1 })),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// SWAP HELPER
// ============================================================================

router.get('/quote', async (req: Request, res: Response) => {
  try {
    const { tokenIn, tokenOut, amountIn, fee = '3000' } = req.query;

    if (!tokenIn || !tokenOut || !amountIn) {
      return res.status(400).json({
        success: false,
        error: 'Missing required params: tokenIn, tokenOut, amountIn',
      });
    }

    const token0 = dbHelpers.getToken(tokenIn as string);
    const token1 = dbHelpers.getToken(tokenOut as string);

    if (!token0 || !token1) {
      return res.status(404).json({ success: false, error: 'Token not found' });
    }

    const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    const quoter = new ethers.Contract(config.contracts.quoterV2, QuoterV2ABI, provider);

    const amountInWei = ethers.utils.parseUnits(amountIn as string, token0.decimals);

    try {
      const quote = await quoter.callStatic.quoteExactInputSingle({
        tokenIn: tokenIn as string,
        tokenOut: tokenOut as string,
        amountIn: amountInWei,
        fee: parseInt(fee as string),
        sqrtPriceLimitX96: 0,
      });

      const amountOut = ethers.utils.formatUnits(quote.amountOut, token1.decimals);

      res.json({
        success: true,
        data: {
          amountIn: amountIn,
          amountOut: amountOut,
          sqrtPriceX96After: quote.sqrtPriceX96After.toString(),
          initializedTicksCrossed: quote.initializedTicksCrossed,
          gasEstimate: quote.gasEstimate.toString(),
          fee: parseInt(fee as string),
        },
      });
    } catch (quoteError: any) {
      const feeTiers = [500, 3000, 10000];
      for (const feeTier of feeTiers) {
        if (feeTier === parseInt(fee as string)) continue;
        
        try {
          const quote = await quoter.callStatic.quoteExactInputSingle({
            tokenIn: tokenIn as string,
            tokenOut: tokenOut as string,
            amountIn: amountInWei,
            fee: feeTier,
            sqrtPriceLimitX96: 0,
          });

          const amountOut = ethers.utils.formatUnits(quote.amountOut, token1.decimals);

          return res.json({
            success: true,
            data: {
              amountIn: amountIn,
              amountOut: amountOut,
              sqrtPriceX96After: quote.sqrtPriceX96After.toString(),
              initializedTicksCrossed: quote.initializedTicksCrossed,
              gasEstimate: quote.gasEstimate.toString(),
              fee: feeTier,
            },
          });
        } catch {
          continue;
        }
      }

      res.status(400).json({
        success: false,
        error: 'No liquidity available for this pair',
      });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/route', async (req: Request, res: Response) => {
  try {
    const { tokenIn, tokenOut, amountIn } = req.query;

    if (!tokenIn || !tokenOut || !amountIn) {
      return res.status(400).json({
        success: false,
        error: 'Missing required params: tokenIn, tokenOut, amountIn',
      });
    }

    const token0 = dbHelpers.getToken(tokenIn as string);
    const token1 = dbHelpers.getToken(tokenOut as string);

    if (!token0 || !token1) {
      return res.status(404).json({ success: false, error: 'Token not found' });
    }

    const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    const quoter = new ethers.Contract(config.contracts.quoterV2, QuoterV2ABI, provider);

    const amountInWei = ethers.utils.parseUnits(amountIn as string, token0.decimals);
    const feeTiers = [500, 3000, 10000];
    
    const quotes = [];

    for (const fee of feeTiers) {
      try {
        const quote = await quoter.callStatic.quoteExactInputSingle({
          tokenIn: tokenIn as string,
          tokenOut: tokenOut as string,
          amountIn: amountInWei,
          fee: fee,
          sqrtPriceLimitX96: 0,
        });

        quotes.push({
          fee,
          amountOut: ethers.utils.formatUnits(quote.amountOut, token1.decimals),
          amountOutRaw: quote.amountOut.toString(),
          gasEstimate: quote.gasEstimate.toString(),
        });
      } catch {
        // No pool for this fee tier
      }
    }

    if (quotes.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No liquidity available for this pair',
      });
    }

    const best = quotes.reduce((a, b) =>
      parseFloat(a.amountOut) > parseFloat(b.amountOut) ? a : b
    );

    res.json({
      success: true,
      data: {
        tokenIn,
        tokenOut,
        amountIn,
        bestRoute: best,
        allRoutes: quotes,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// ADMIN
// ============================================================================

router.post('/admin/sync/pools', async (req: Request, res: Response) => {
  try {
    await poolIndexer.indexAllPools();
    res.json({ success: true, message: 'Pool sync complete' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/admin/sync/prices', async (req: Request, res: Response) => {
  try {
    await poolIndexer.updateAllPoolStates();
    await priceTracker.snapshotAllPrices();
    res.json({ success: true, message: 'Price snapshot taken' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/admin/status', (req: Request, res: Response) => {
  try {
    const pools = dbHelpers.getAllPools();
    const tokens = dbHelpers.getAllTokens();
    const lastIndexed = dbHelpers.getState('last_indexed_block');
    const priceSnapshots = db.get('price_snapshots').size().value();

    res.json({
      success: true,
      data: {
        pools: pools.length,
        tokens: tokens.length,
        priceSnapshots: priceSnapshots || 0,
        lastIndexedBlock: lastIndexed || null,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
