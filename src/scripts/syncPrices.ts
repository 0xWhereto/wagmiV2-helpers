/**
 * Script to sync prices and take snapshots
 * Run with: npm run sync
 */

import { initDatabase } from '../db/database';
import { poolIndexer } from '../services/poolIndexer';
import { priceTracker } from '../services/priceTracker';

async function main() {
  console.log('📸 Starting price sync...\n');
  
  // Initialize database
  await initDatabase();
  
  // Update pool states
  console.log('Updating pool states...');
  await poolIndexer.updateAllPoolStates();
  
  // Take price snapshot
  console.log('Taking price snapshot...');
  await priceTracker.snapshotAllPrices();
  
  console.log('\n✅ Price sync complete!');
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
