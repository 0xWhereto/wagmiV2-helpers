import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

export const config = {
  // Sonic RPC
  rpcUrl: process.env.RPC_URL || 'https://rpc.soniclabs.com',
  chainId: 146,

  // Uniswap V3 Contracts on Sonic
  contracts: {
    factory: '0x3a1713B6C3734cfC883A3897647f3128Fe789f39',
    swapRouter: '0x8BbF9fF8CE8060B85DFe48d7b7E897d09418De9B',
    positionManager: '0x5826e10B513C891910032F15292B2F1b3041C3Df',
    quoterV2: '0x57e3e0a9DfB3DA34cc164B2C8dD1EBc404c45d47',
    weth9: '0xBFF7867E7e5e8D656Fc0B567cE7672140D208235',
  },

  // Database
  dbPath: process.env.DB_PATH || './data/indexer.db',

  // API Server
  port: parseInt(process.env.PORT || '3001'),

  // Indexer settings
  indexer: {
    // How often to sync prices (in seconds)
    priceUpdateInterval: 60,
    // Start from this block (0 for genesis, or set to recent block for faster startup)
    startBlock: 57000000, // Set to ~500k blocks before current for faster initial sync
    // Batch size for event queries
    batchSize: 5000,
  },

  // Price history retention (1 year in seconds)
  priceHistoryRetention: 365 * 24 * 60 * 60,
};

// Fee tier tick spacings
export const FEE_TIER_TICK_SPACING: Record<number, number> = {
  100: 1,    // 0.01%
  500: 10,   // 0.05%
  3000: 60,  // 0.3%
  10000: 200, // 1%
};

// Common fee tiers
export const FEE_TIERS = [500, 3000, 10000];

