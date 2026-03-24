import { BaseSchema } from '@adonisjs/lucid/schema'

export default class CreateHybridSyncDataTable extends BaseSchema {
  protected tableName = 'hybrid_sync_data'

  public async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      
      // User and entity identification
      table.integer('userId').unsigned().notNullable()
      table.string('dataType', 50).notNullable()
      table.string('direction', 20).notNullable()
      table.string('sourcePlatform', 20).notNullable()
      table.string('targetPlatform', 20).notNullable()
      table.string('entityId', 255).notNullable()
      table.string('entityType', 100).notNullable()
      table.string('action', 20).notNullable()
      
      // Data storage
      table.json('data').notNullable()
      table.json('previousData').nullable()
      
      // Status and priority
      table.enum('status', ['pending', 'processing', 'completed', 'failed', 'conflict', 'retrying']).default('pending')
      table.enum('priority', ['low', 'medium', 'high', 'critical']).default('medium')
      
      // Retry mechanism
      table.integer('retryCount').default(0)
      table.integer('maxRetries').default(3)
      table.dateTime('nextRetryAt').nullable()
      
      // Completion and error tracking
      table.dateTime('completedAt').nullable()
      table.string('errorMessage').nullable()
      table.json('errorDetails').nullable()
      
      // Conflict resolution
      table.enum('conflictResolution', ['manual', 'auto', 'skip']).nullable()
      table.integer('resolvedBy').unsigned().nullable()
      table.dateTime('resolvedAt').nullable()
      
      // Scheduling
      table.dateTime('syncAt').nullable()
      
      // Data integrity
      table.string('checksum').nullable()
      table.integer('version').default(1)
      
      // Metadata
      table.json('metadata').nullable()
      
      // Foreign key constraint
      table.foreign('userId')
        .references('id')
        .inTable('hybrid_users')
        .onDelete('CASCADE')
        .onUpdate('CASCADE')
      
      // Timestamps
      table.dateTime('createdAt').notNullable()
      table.dateTime('updatedAt').notNullable()
    })

    // Create indexes
    this.schema.alterTable(this.tableName, (table) => {
      table.index(['userId'], 'hybrid_sync_data_user_id_index')
      table.index(['dataType'], 'hybrid_sync_data_data_type_index')
      table.index(['status'], 'hybrid_sync_data_status_index')
      table.index(['direction'], 'hybrid_sync_data_direction_index')
      table.index(['sourcePlatform'], 'hybrid_sync_data_source_platform_index')
      table.index(['targetPlatform'], 'hybrid_sync_data_target_platform_index')
      table.index(['entityId'], 'hybrid_sync_data_entity_id_index')
      table.index(['priority'], 'hybrid_sync_data_priority_index')
      table.index(['nextRetryAt'], 'hybrid_sync_data_next_retry_at_index')
      table.index(['createdAt'], 'hybrid_sync_data_created_at_index')
      table.index(['completedAt'], 'hybrid_sync_data_completed_at_index')
    })
  }

  public async down() {
    this.schema.dropTable(this.tableName)
  }
}