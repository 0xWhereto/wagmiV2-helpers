import low from 'lowdb';
import FileSync from 'lowdb/adapters/FileSync';
import path from 'path';
import fs from 'fs';
import { config } from '../config';

// Database schema
export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  created_at: number;
}

export interface Pool {
  address: string;
  token0: string;
  token1: string;
  fee: number;
  tick_spacing: number;
  sqrt_price_x96: string | null;
  tick: number | null;
  liquidity: string | null;
  fee_growth_global0_x128: string | null;
  fee_growth_global1_x128: string | null;
  last_updated: number | null;
  created_at: number;
}

export interface PriceSnapshot {
  id: number;
  pool_address: string;
  timestamp: number;
  price_token0_in_token1: string;
  price_token1_in_token0: string;
  sqrt_price_x96: string;
  tick: number;
  liquidity: string;
  volume_token0: string;
  volume_token1: string;
  tvl_token0: string;
  tvl_token1: string;
}

export interface Swap {
  id: number;
  pool_address: string;
  tx_hash: string;
  block_number: number;
  timestamp: number;
  sender: string;
  recipient: string;
  amount0: string;
  amount1: string;
  sqrt_price_x96: string;
  tick: number;
  liquidity: string;
}

export interface Candle {
  pool_address: string;
  interval: string;
  timestamp: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume_token0: string;
  volume_token1: string;
}

export interface IndexerState {
  key: string;
  value: string;
  updated_at: number;
}

export interface DatabaseSchema {
  tokens: Token[];
  pools: Pool[];
  price_snapshots: PriceSnapshot[];
  swaps: Swap[];
  candles: Candle[];
  indexer_state: IndexerState[];
  _snapshot_id_counter: number;
  _swap_id_counter: number;
}

// Ensure data directory exists
const dbDir = path.dirname(config.dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize database
const adapter = new FileSync<DatabaseSchema>(config.dbPath);
export const db = low(adapter);

// Set defaults
db.defaults({
  tokens: [],
  pools: [],
  price_snapshots: [],
  swaps: [],
  candles: [],
  indexer_state: [],
  _snapshot_id_counter: 0,
  _swap_id_counter: 0,
}).write();

// Initialize function
export function initDatabase(): void {
  console.log('✅ Database initialized');
}

// Helper functions for common operations
export const dbHelpers = {
  // Tokens
  getToken(address: string): Token | undefined {
    return db.get('tokens')
      .find({ address: address.toLowerCase() })
      .value();
  },
  
  addToken(token: Omit<Token, 'created_at'>): void {
    const existing = this.getToken(token.address);
    if (!existing) {
      db.get('tokens')
        .push({
          ...token,
          address: token.address.toLowerCase(),
          created_at: Math.floor(Date.now() / 1000),
        })
        .write();
    }
  },
  
  getAllTokens(): Token[] {
    return db.get('tokens').value() || [];
  },
  
  // Pools
  getPool(address: string): Pool | undefined {
    return db.get('pools')
      .find({ address: address.toLowerCase() })
      .value();
  },
  
  addPool(pool: Omit<Pool, 'created_at' | 'last_updated' | 'sqrt_price_x96' | 'tick' | 'liquidity' | 'fee_growth_global0_x128' | 'fee_growth_global1_x128'>): void {
    const existing = this.getPool(pool.address);
    if (!existing) {
      db.get('pools')
        .push({
          ...pool,
          address: pool.address.toLowerCase(),
          token0: pool.token0.toLowerCase(),
          token1: pool.token1.toLowerCase(),
          sqrt_price_x96: null,
          tick: null,
          liquidity: null,
          fee_growth_global0_x128: null,
          fee_growth_global1_x128: null,
          last_updated: null,
          created_at: Math.floor(Date.now() / 1000),
        })
        .write();
    }
  },
  
  updatePool(address: string, updates: Partial<Pool>): void {
    db.get('pools')
      .find({ address: address.toLowerCase() })
      .assign(updates)
      .write();
  },
  
  getAllPools(): Pool[] {
    return db.get('pools').value() || [];
  },
  
  getPoolsByPair(token0: string, token1: string): Pool[] {
    const t0 = token0.toLowerCase();
    const t1 = token1.toLowerCase();
    return db.get('pools')
      .filter((p: Pool) => 
        (p.token0 === t0 && p.token1 === t1) ||
        (p.token0 === t1 && p.token1 === t0)
      )
      .value() || [];
  },
  
  // Price Snapshots
  addPriceSnapshot(snapshot: Omit<PriceSnapshot, 'id'>): number {
    const counter = db.get('_snapshot_id_counter').value() + 1;
    db.set('_snapshot_id_counter', counter).write();
    
    db.get('price_snapshots')
      .push({ ...snapshot, id: counter })
      .write();
    
    return counter;
  },
  
  getPriceSnapshots(poolAddress: string, fromTs: number, toTs: number, limit: number = 1000): PriceSnapshot[] {
    return db.get('price_snapshots')
      .filter((s: PriceSnapshot) => 
        s.pool_address.toLowerCase() === poolAddress.toLowerCase() &&
        s.timestamp >= fromTs &&
        s.timestamp <= toTs
      )
      .sortBy('timestamp')
      .take(limit)
      .value() || [];
  },
  
  getLatestSnapshot(poolAddress: string): PriceSnapshot | undefined {
    return db.get('price_snapshots')
      .filter({ pool_address: poolAddress.toLowerCase() })
      .sortBy('timestamp')
      .last()
      .value();
  },
  
  cleanOldSnapshots(cutoffTimestamp: number): number {
    const before = db.get('price_snapshots').size().value();
    db.get('price_snapshots')
      .remove((s: PriceSnapshot) => s.timestamp < cutoffTimestamp)
      .write();
    const after = db.get('price_snapshots').size().value();
    return before - after;
  },
  
  // Candles
  getCandles(poolAddress: string, interval: string, fromTs: number, toTs: number): Candle[] {
    return db.get('candles')
      .filter((c: Candle) => 
        c.pool_address.toLowerCase() === poolAddress.toLowerCase() &&
        c.interval === interval &&
        c.timestamp >= fromTs &&
        c.timestamp <= toTs
      )
      .sortBy('timestamp')
      .value() || [];
  },
  
  upsertCandle(candle: Candle): void {
    const existing = db.get('candles')
      .find({
        pool_address: candle.pool_address.toLowerCase(),
        interval: candle.interval,
        timestamp: candle.timestamp,
      })
      .value();
    
    if (existing) {
      db.get('candles')
        .find({
          pool_address: candle.pool_address.toLowerCase(),
          interval: candle.interval,
          timestamp: candle.timestamp,
        })
        .assign(candle)
        .write();
    } else {
      db.get('candles')
        .push({ ...candle, pool_address: candle.pool_address.toLowerCase() })
        .write();
    }
  },
  
  // Indexer State
  getState(key: string): string | undefined {
    const state = db.get('indexer_state')
      .find({ key })
      .value();
    return state?.value;
  },
  
  setState(key: string, value: string): void {
    const existing = db.get('indexer_state')
      .find({ key })
      .value();
    
    if (existing) {
      db.get('indexer_state')
        .find({ key })
        .assign({ value, updated_at: Math.floor(Date.now() / 1000) })
        .write();
    } else {
      db.get('indexer_state')
        .push({
          key,
          value,
          updated_at: Math.floor(Date.now() / 1000),
        })
        .write();
    }
  },
  
  // Save (for compatibility)
  save(): void {
    // lowdb v1 writes automatically
  },
};

export default db;
