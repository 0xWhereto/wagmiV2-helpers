import { db, dbHelpers, Pool, PriceSnapshot, Candle } from '../db/database';
import { config } from '../config';
import { sqrtPriceX96ToPrice, tickToPrice } from '../utils/price';

export class PriceTracker {
  /**
   * Take price snapshot for all pools
   */
  async snapshotAllPrices(): Promise<void> {
    const pools = dbHelpers.getAllPools();
    const timestamp = Math.floor(Date.now() / 1000);
    let count = 0;

    for (const pool of pools) {
      if (pool.sqrt_price_x96) {
        const token0 = dbHelpers.getToken(pool.token0);
        const token1 = dbHelpers.getToken(pool.token1);
        
        if (token0 && token1) {
          await this.snapshotPoolPrice(pool, token0.decimals, token1.decimals, timestamp);
          count++;
        }
      }
    }

    await db.write();
    console.log(`📸 Snapshot taken for ${count} pools`);
  }

  /**
   * Take price snapshot for a single pool
   */
  private async snapshotPoolPrice(
    pool: Pool,
    decimals0: number,
    decimals1: number,
    timestamp: number
  ): Promise<void> {
    if (!pool.sqrt_price_x96) return;

    const { price0, price1 } = sqrtPriceX96ToPrice(
      pool.sqrt_price_x96,
      decimals0,
      decimals1
    );

    dbHelpers.addPriceSnapshot({
      pool_address: pool.address,
      timestamp,
      price_token0_in_token1: price0,
      price_token1_in_token0: price1,
      sqrt_price_x96: pool.sqrt_price_x96,
      tick: pool.tick || 0,
      liquidity: pool.liquidity || '0',
      volume_token0: '0',
      volume_token1: '0',
      tvl_token0: '0',
      tvl_token1: '0',
    });
  }

  /**
   * Get current price for a pool
   */
  getCurrentPrice(poolAddress: string): { price0: string; price1: string } | null {
    const pool = dbHelpers.getPool(poolAddress);
    if (!pool || !pool.sqrt_price_x96) return null;

    const token0 = dbHelpers.getToken(pool.token0);
    const token1 = dbHelpers.getToken(pool.token1);
    if (!token0 || !token1) return null;

    return sqrtPriceX96ToPrice(pool.sqrt_price_x96, token0.decimals, token1.decimals);
  }

  /**
   * Get price history for a pool
   */
  getPriceHistory(
    poolAddress: string,
    fromTimestamp: number,
    toTimestamp: number,
    limit: number = 1000
  ): PriceSnapshot[] {
    return dbHelpers.getPriceSnapshots(poolAddress, fromTimestamp, toTimestamp, limit);
  }

  /**
   * Build OHLCV candles from price snapshots
   */
  buildCandles(
    poolAddress: string,
    interval: string,
    fromTimestamp: number,
    toTimestamp: number
  ): Candle[] {
    const intervalSeconds = this.getIntervalSeconds(interval);
    const snapshots = this.getPriceHistory(poolAddress, fromTimestamp, toTimestamp, 100000);
    
    if (snapshots.length === 0) return [];

    const candles: Candle[] = [];
    let currentCandle: Candle | null = null;
    let candleStart = Math.floor(fromTimestamp / intervalSeconds) * intervalSeconds;

    for (const snapshot of snapshots) {
      const snapshotCandle = Math.floor(snapshot.timestamp / intervalSeconds) * intervalSeconds;

      if (currentCandle === null || snapshotCandle > candleStart) {
        if (currentCandle !== null) {
          candles.push(currentCandle);
        }
        
        candleStart = snapshotCandle;
        currentCandle = {
          pool_address: poolAddress.toLowerCase(),
          interval,
          timestamp: candleStart,
          open: snapshot.price_token0_in_token1,
          high: snapshot.price_token0_in_token1,
          low: snapshot.price_token0_in_token1,
          close: snapshot.price_token0_in_token1,
          volume_token0: '0',
          volume_token1: '0',
        };
      } else {
        const price = parseFloat(snapshot.price_token0_in_token1);
        const high = parseFloat(currentCandle.high);
        const low = parseFloat(currentCandle.low);

        if (price > high) currentCandle.high = snapshot.price_token0_in_token1;
        if (price < low) currentCandle.low = snapshot.price_token0_in_token1;
        currentCandle.close = snapshot.price_token0_in_token1;
      }
    }

    if (currentCandle !== null) {
      candles.push(currentCandle);
    }

    return candles;
  }

  /**
   * Get or build candles with caching
   */
  getCandles(
    poolAddress: string,
    interval: string,
    fromTimestamp: number,
    toTimestamp: number
  ): Candle[] {
    // Try cached first
    const cached = dbHelpers.getCandles(poolAddress, interval, fromTimestamp, toTimestamp);
    if (cached.length > 0) {
      return cached;
    }

    // Build from snapshots
    const candles = this.buildCandles(poolAddress, interval, fromTimestamp, toTimestamp);

    // Cache
    for (const candle of candles) {
      dbHelpers.upsertCandle(candle);
    }

    return candles;
  }

  /**
   * Get interval in seconds
   */
  private getIntervalSeconds(interval: string): number {
    const map: Record<string, number> = {
      '1m': 60,
      '5m': 300,
      '15m': 900,
      '1h': 3600,
      '4h': 14400,
      '1d': 86400,
      '1w': 604800,
    };
    return map[interval] || 3600;
  }

  /**
   * Clean old price snapshots
   */
  async cleanOldSnapshots(): Promise<void> {
    const cutoff = Math.floor(Date.now() / 1000) - config.priceHistoryRetention;
    const deleted = dbHelpers.cleanOldSnapshots(cutoff);
    await db.write();
    console.log(`🧹 Cleaned ${deleted} old price snapshots`);
  }

  /**
   * Get 24h price change
   */
  get24hChange(poolAddress: string): { change: number; changePercent: number } | null {
    const now = Math.floor(Date.now() / 1000);
    const dayAgo = now - 86400;

    const current = dbHelpers.getLatestSnapshot(poolAddress);
    if (!current) return null;

    const pastSnapshots = dbHelpers.getPriceSnapshots(poolAddress, dayAgo - 3600, dayAgo + 3600, 1);
    const past = pastSnapshots[0];
    if (!past) return null;

    const currentPrice = parseFloat(current.price_token0_in_token1);
    const pastPrice = parseFloat(past.price_token0_in_token1);

    if (pastPrice === 0) return null;

    const change = currentPrice - pastPrice;
    const changePercent = (change / pastPrice) * 100;

    return { change, changePercent };
  }

  /**
   * Get price at specific timestamp
   */
  getPriceAt(poolAddress: string, timestamp: number): { price0: string; price1: string } | null {
    const snapshots = dbHelpers.getPriceSnapshots(poolAddress, 0, timestamp, 1);
    const snapshot = snapshots[snapshots.length - 1];
    
    if (!snapshot) return null;

    return {
      price0: snapshot.price_token0_in_token1,
      price1: snapshot.price_token1_in_token0,
    };
  }
}

export const priceTracker = new PriceTracker();
