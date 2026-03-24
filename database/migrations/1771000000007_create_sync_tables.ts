import { BaseSchema } from '@adonisjs/lucid/schema'

export default class CreateSyncTables extends BaseSchema {
  protected tableName = 'sync_tables'

  public async up() {
    // Create sync_queue table
    this.schema.createTable('sync_queue', (table) => {
      table.uuid('id').primary()
      table.enum('type', ['user', 'progress', 'content', 'session', 'assignment']).notNullable()
      table.uuid('user_id').notNullable()
      table.enum('platform', ['online', 'offline']).notNullable()
      table.enum('operation', ['create', 'update', 'delete']).notNullable()
      table.json('data').notNullable()
      table.timestamp('timestamp', { useTz: true }).notNullable()
      table.enum('status', ['pending', 'in_progress', 'completed', 'failed', 'manual_review']).notNullable().defaultTo('pending')
      table.text('error_message').nullable()
      table.integer('retry_count').notNullable().defaultTo(0)
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      // Indexes
      table.index('type')
      table.index('user_id')
      table.index('platform')
      table.index('status')
      table.index('timestamp')
      table.index('retry_count')

      // Foreign key
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE')
    })

    // Create content_cache table
    this.schema.createTable('content_cache', (table) => {
      table.uuid('id').primary()
      table.enum('type', ['video', 'document', 'image', 'audio', 'interactive']).notNullable()
      table.string('title', 255).notNullable()
      table.text('description').nullable()
      table.string('url', 500).nullable()
      table.string('file_path', 500).nullable()
      table.integer('file_size').nullable()
      table.string('mime_type', 100).nullable()
      table.json('metadata').nullable()
      table.timestamp('cached_at', { useTz: true }).notNullable()
      table.timestamp('expires_at', { useTz: true }).nullable()
      table.boolean('is_expired').notNullable().defaultTo(false)
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      // Indexes
      table.index('type')
      table.index('expires_at')
      table.index('is_expired')
      table.index('cached_at')
    })

    // Create platform_sync_log table
    this.schema.createTable('platform_sync_log', (table) => {
      table.uuid('id').primary()
      table.uuid('user_id').notNullable()
      table.enum('source_platform', ['online', 'offline']).notNullable()
      table.enum('target_platform', ['online', 'offline']).notNullable()
      table.enum('sync_type', ['user', 'progress', 'content', 'session', 'assignment']).notNullable()
      table.enum('status', ['pending', 'in_progress', 'completed', 'failed']).notNullable()
      table.json('sync_data').nullable()
      table.text('error_message').nullable()
      table.timestamp('started_at', { useTz: true }).notNullable()
      table.timestamp('completed_at', { useTz: true }).nullable()
      table.integer('duration_ms').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      // Indexes
      table.index('user_id')
      table.index('source_platform')
      table.index('target_platform')
      table.index('sync_type')
      table.index('status')
      table.index('started_at')
      table.index('duration_ms')

      // Foreign key
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE')
    })

    // Create sync_conflicts table
    this.schema.createTable('sync_conflicts', (table) => {
      table.uuid('id').primary()
      table.uuid('sync_queue_id').notNullable()
      table.uuid('user_id').notNullable()
      table.enum('data_type', ['user', 'progress', 'content', 'session', 'assignment']).notNullable()
      table.json('online_data').nullable()
      table.json('offline_data').nullable()
      table.enum('resolution_strategy', ['online_wins', 'offline_wins', 'manual']).notNullable()
      table.json('resolved_data').nullable()
      table.enum('status', ['pending', 'resolved', 'manual_review']).notNullable().defaultTo('pending')
      table.text('resolution_notes').nullable()
      table.uuid('resolved_by').nullable()
      table.timestamp('resolved_at', { useTz: true }).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      // Indexes
      table.index('sync_queue_id')
      table.index('user_id')
      table.index('data_type')
      table.index('status')
      table.index('resolution_strategy')
      table.index('resolved_at')

      // Foreign keys
      table.foreign('sync_queue_id').references('id').inTable('sync_queue').onDelete('CASCADE')
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE')
      table.foreign('resolved_by').references('id').inTable('users').onDelete('SET NULL')
    })

    // Create sync_metrics table
    this.schema.createTable('sync_metrics', (table) => {
      table.uuid('id').primary()
      table.date('date').notNullable()
      table.enum('platform', ['online', 'offline', 'both']).notNullable()
      table.enum('data_type', ['user', 'progress', 'content', 'session', 'assignment']).notNullable()
      table.integer('total_synced').notNullable().defaultTo(0)
      table.integer('successful_synced').notNullable().defaultTo(0)
      table.integer('failed_synced').notNullable().defaultTo(0)
      table.integer('conflicts').notNullable().defaultTo(0)
      table.integer('avg_duration_ms').notNullable().defaultTo(0)
      table.json('metadata').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      // Indexes
      table.index('date')
      table.index('platform')
      table.index('data_type')
      table.index('created_at')

      // Unique constraint
      table.unique(['date', 'platform', 'data_type'])
    })

    // Create sync_settings table
    this.schema.createTable('sync_settings', (table) => {
      table.uuid('id').primary()
      table.string('key', 100).notNullable().unique()
      table.json('value').notNullable()
      table.string('description').nullable()
      table.enum('category', ['general', 'security', 'performance', 'conflict_resolution']).notNullable()
      table.boolean('is_active').notNullable().defaultTo(true)
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      // Indexes
      table.index('key')
      table.index('category')
      table.index('is_active')
    })

    // Insert default sync settings
    await this.db.table('sync_settings').insert([
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        key: 'auto_sync_enabled',
        value: JSON.stringify(true),
        description: 'Enable automatic synchronization',
        category: 'general',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        key: 'sync_interval_minutes',
        value: JSON.stringify(5),
        description: 'Automatic sync interval in minutes',
        category: 'general',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440003',
        key: 'batch_size',
        value: JSON.stringify(100),
        description: 'Number of items to process in each sync batch',
        category: 'performance',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440004',
        key: 'retry_attempts',
        value: JSON.stringify(3),
        description: 'Number of retry attempts for failed sync operations',
        category: 'performance',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440005',
        key: 'conflict_resolution',
        value: JSON.stringify('online_wins'),
        description: 'Default conflict resolution strategy',
        category: 'conflict_resolution',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440006',
        key: 'max_sync_age_hours',
        value: JSON.stringify(24),
        description: 'Maximum age of sync items before cleanup',
        category: 'performance',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440007',
        key: 'enable_conflict_detection',
        value: JSON.stringify(true),
        description: 'Enable automatic conflict detection',
        category: 'conflict_resolution',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440008',
        key: 'sync_timeout_seconds',
        value: JSON.stringify(300),
        description: 'Timeout for sync operations in seconds',
        category: 'performance',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ])
  }

  public async down() {
    this.schema.dropTableIfExists('sync_settings')
    this.schema.dropTableIfExists('sync_metrics')
    this.schema.dropTableIfExists('sync_conflicts')
    this.schema.dropTableIfExists('platform_sync_log')
    this.schema.dropTableIfExists('content_cache')
    this.schema.dropTableIfExists('sync_queue')
  }
}