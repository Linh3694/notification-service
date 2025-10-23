/**
 * Database Migration Script
 * Apply optimized indexes cho MongoDB collections
 * Chạy: node scripts/migrate-database-indexes.js
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: '../config.env' });

async function migrateDatabaseIndexes() {
  console.log('🚀 Starting Database Index Migration...\n');

  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/notification_service');
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const collections = ['notifications', 'notification_reads'];

    // Migration results
    const results = {};

    for (const collectionName of collections) {
      console.log(`📊 Migrating indexes for collection: ${collectionName}`);

      const collection = db.collection(collectionName);
      const existingIndexes = await collection.indexes();
      const existingIndexNames = existingIndexes.map(idx => idx.name);

      results[collectionName] = { created: [], skipped: [] };

      // Define indexes based on collection
      let indexesToCreate = [];

      if (collectionName === 'notifications') {
        indexesToCreate = [
          // User notification list - optimized
          {
            key: { recipients: 1, createdAt: -1 },
            name: 'recipients_createdAt_compound',
            background: true
          },
          // Type filtering
          {
            key: { type: 1, createdAt: -1 },
            name: 'type_createdAt_compound',
            background: true
          },
          // Priority filtering
          {
            key: { priority: 1, createdAt: -1 },
            name: 'priority_createdAt_compound',
            background: true
          },
          // Channel filtering
          {
            key: { channel: 1, createdAt: -1 },
            name: 'channel_createdAt_compound',
            background: true
          },
          // Analytics queries
          {
            key: { createdBy: 1, createdAt: -1 },
            name: 'createdBy_createdAt_compound',
            background: true
          },
          // Partial index cho active notifications
          {
            key: { recipients: 1, createdAt: -1 },
            name: 'recipients_active_partial',
            partialFilterExpression: { totalRecipients: { $gt: 0 } },
            background: true
          },
          // TTL index cho auto cleanup (90 days)
          {
            key: { createdAt: 1 },
            name: 'createdAt_ttl',
            expireAfterSeconds: 90 * 24 * 60 * 60,
            partialFilterExpression: { readCount: { $gte: 0 } },
            background: true
          }
        ];
      } else if (collectionName === 'notification_reads') {
        indexesToCreate = [
          // Primary lookup - unique
          {
            key: { notificationId: 1, userId: 1 },
            name: 'notificationId_userId_unique',
            unique: true,
            background: true
          },
          // User notification history
          {
            key: { userId: 1, createdAt: -1 },
            name: 'userId_createdAt_compound',
            background: true
          },
          // Unread count queries
          {
            key: { userId: 1, read: 1, createdAt: -1 },
            name: 'userId_read_createdAt_compound',
            background: true
          },
          // Delivery analytics
          {
            key: { deliveryStatus: 1, createdAt: -1 },
            name: 'deliveryStatus_createdAt_compound',
            background: true
          },
          // Platform analytics
          {
            key: { platform: 1, createdAt: -1 },
            name: 'platform_createdAt_compound',
            background: true
          },
          // Soft delete queries
          {
            key: { deleted: 1, userId: 1, createdAt: -1 },
            name: 'deleted_userId_createdAt_compound',
            background: true
          },
          // Partial index cho active records
          {
            key: { userId: 1, read: 1, createdAt: -1 },
            name: 'userId_read_active_partial',
            partialFilterExpression: { deleted: { $ne: true } },
            background: true
          },
          // TTL index cho cleanup (180 days)
          {
            key: { createdAt: 1 },
            name: 'createdAt_read_ttl',
            expireAfterSeconds: 180 * 24 * 60 * 60,
            partialFilterExpression: {
              read: true,
              deleted: { $ne: true }
            },
            background: true
          }
        ];
      }

      // Create indexes
      for (const indexDef of indexesToCreate) {
        try {
          if (existingIndexNames.includes(indexDef.name)) {
            console.log(`  ⏭️  Skipped existing index: ${indexDef.name}`);
            results[collectionName].skipped.push(indexDef.name);
            continue;
          }

          await collection.createIndex(indexDef.key, {
            name: indexDef.name,
            unique: indexDef.unique || false,
            partialFilterExpression: indexDef.partialFilterExpression,
            expireAfterSeconds: indexDef.expireAfterSeconds,
            background: indexDef.background
          });

          console.log(`  ✅ Created index: ${indexDef.name}`);
          results[collectionName].created.push(indexDef.name);

        } catch (error) {
          console.error(`  ❌ Failed to create index ${indexDef.name}:`, error.message);
        }
      }

      console.log(`📊 ${collectionName} migration completed\n`);
    }

    // Summary
    console.log('🎉 Database Index Migration Summary:');
    for (const [collection, result] of Object.entries(results)) {
      console.log(`\n${collection}:`);
      console.log(`  ✅ Created: ${result.created.length} indexes`);
      console.log(`  ⏭️  Skipped: ${result.skipped.length} indexes`);

      if (result.created.length > 0) {
        console.log(`  📝 Created indexes: ${result.created.join(', ')}`);
      }
    }

    console.log('\n✅ Database index migration completed successfully!');
    console.log('💡 Indexes will improve query performance significantly.');

  } catch (error) {
    console.error('❌ Database migration failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run migration
migrateDatabaseIndexes();
