/**
 * Cleanup Conflicting MongoDB Indexes
 * Remove duplicate indexes that conflict with new optimized ones
 * Chạy: node scripts/cleanup-conflicting-indexes.js
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: '../config.env' });

async function cleanupConflictingIndexes() {
  console.log('🧹 Starting Index Cleanup...\n');

  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/notification_service');
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const collections = ['notifications', 'notification_reads'];

    for (const collectionName of collections) {
      console.log(`📊 Cleaning indexes for collection: ${collectionName}`);

      const collection = db.collection(collectionName);
      const indexes = await collection.indexes();

      // Indexes to keep (our optimized ones)
      const keepIndexes = {
        notifications: [
          'recipients_1_createdAt_-1', // Our main compound index
          'recipients_active_partial',  // Partial index for active notifications
          'createdAt_ttl',             // TTL index from schema
          '_id_'                       // Default MongoDB index
        ],
        notification_reads: [
          'notificationId_1_userId_1', // Unique constraint
          'userId_1_createdAt_-1',     // User history
          'userId_1_read_1_createdAt_-1', // Unread queries
          'deliveryStatus_1_createdAt_-1', // Analytics
          'platform_1_createdAt_-1',   // Platform analytics
          'deleted_1_userId_1_createdAt_-1', // Soft delete queries
          'userId_read_active_partial', // Active records partial
          // 'createdAt_read_ttl',        // TTL from schema (will be added later)
          '_id_'                       // Default MongoDB index
        ]
      };

      const indexesToKeep = keepIndexes[collectionName] || [];
      const currentIndexes = indexes.map(idx => idx.name);

      console.log(`   Current indexes: ${currentIndexes.join(', ')}`);
      console.log(`   Keep indexes: ${indexesToKeep.join(', ')}`);

      // Find indexes to drop (those not in keep list)
      const indexesToDrop = currentIndexes.filter(idxName =>
        !indexesToKeep.includes(idxName) && idxName !== '_id_'
      );

      console.log(`   Will drop indexes: ${indexesToDrop.join(', ')}\n`);

      // Drop conflicting indexes
      for (const indexName of indexesToDrop) {
        try {
          await collection.dropIndex(indexName);
          console.log(`   ✅ Dropped conflicting index: ${indexName}`);
        } catch (error) {
          console.warn(`   ⚠️  Failed to drop index ${indexName}:`, error.message);
        }
      }

      console.log(`✅ ${collectionName} cleanup completed\n`);
    }

    console.log('🎉 Index cleanup completed!');
    console.log('💡 Now you can re-run the migration script to apply optimized indexes.');

  } catch (error) {
    console.error('❌ Index cleanup failed:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run cleanup
cleanupConflictingIndexes();
