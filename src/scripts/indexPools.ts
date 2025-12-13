/**
 * Script to index all pools from the Uniswap V3 Factory
 * Run with: npm run index
 */

import { initDatabase } from '../db/database';
import { poolIndexer } from '../services/poolIndexer';

async function main() {
  console.log('🔍 Starting pool indexer...\n');
  
  // Initialize database
  await initDatabase();
  
  // Index all pools
  await poolIndexer.indexAllPools();
  
  // Update pool states
  await poolIndexer.updateAllPoolStates();
  
  console.log('\n✅ Pool indexing complete!');
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
