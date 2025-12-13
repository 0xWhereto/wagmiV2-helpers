import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { config } from './config';
import { db, initDatabase } from './db/database';
import routes from './api/routes';
import { poolIndexer } from './services/poolIndexer';
import { priceTracker } from './services/priceTracker';

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║         🔮 WAGMI Omnichain Indexer & Price Tracker 🔮        ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);

  // Initialize database
  await initDatabase();

  // Create Express app
  const app = express();
  app.use(cors());
  app.use(express.json());

  // API routes
  app.use('/api', routes);

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Start server
  app.listen(config.port, () => {
    console.log(`\n🚀 API Server running on http://localhost:${config.port}`);
    console.log(`   - GET /api/pools - List all pools`);
    console.log(`   - GET /api/pools/:address - Get pool details`);
    console.log(`   - GET /api/prices/:poolAddress - Get current price`);
    console.log(`   - GET /api/prices/:poolAddress/history - Price history`);
    console.log(`   - GET /api/prices/:poolAddress/candles - OHLCV candles`);
    console.log(`   - GET /api/quote - Get swap quote`);
    console.log(`   - GET /api/route - Find best swap route`);
    console.log(`   - GET /api/tokens - List all tokens`);
    console.log(`   - POST /api/admin/sync/pools - Sync pools`);
    console.log(`   - POST /api/admin/sync/prices - Take price snapshot`);
    console.log(`   - GET /api/admin/status - Indexer status\n`);
  });

  // Initial sync
  console.log('\n📡 Starting initial sync...');
  
  try {
    await poolIndexer.indexAllPools();
    await poolIndexer.updateAllPoolStates();
    await priceTracker.snapshotAllPrices();
  } catch (error) {
    console.error('Initial sync error:', error);
  }

  // Schedule periodic tasks
  // Update pool states every minute
  cron.schedule('* * * * *', async () => {
    try {
      await poolIndexer.updateAllPoolStates();
      await priceTracker.snapshotAllPrices();
      console.log(`✅ [${new Date().toISOString()}] Price snapshot taken`);
    } catch (error) {
      console.error('Scheduled sync error:', error);
    }
  });

  // Clean old snapshots daily
  cron.schedule('0 0 * * *', async () => {
    await priceTracker.cleanOldSnapshots();
  });

  // Re-index pools every hour
  cron.schedule('0 * * * *', async () => {
    try {
      await poolIndexer.indexAllPools();
      console.log(`✅ [${new Date().toISOString()}] Pool re-index complete`);
    } catch (error) {
      console.error('Pool re-index error:', error);
    }
  });

  console.log('\n⏰ Scheduled tasks:');
  console.log('   - Price snapshots: every minute');
  console.log('   - Pool re-index: every hour');
  console.log('   - Cleanup old data: daily at midnight\n');
}

main().catch(console.error);
