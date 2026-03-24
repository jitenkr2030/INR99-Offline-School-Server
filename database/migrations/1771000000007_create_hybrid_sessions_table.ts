import { BaseSchema } from '@adonisjs/lucid/schema'

export default class HybridSessions extends BaseSchema {
  protected tableName = 'hybrid_sessions'

  public async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      
      // Session identification
      table.string('sessionId', 255).unique().notNullable()
      table.integer('userId').unsigned().notNullable()
      
      // Platform and device information
      table.enum('platform', ['academy', 'offline', 'hybrid']).notNullable()
      table.string('ipAddress', 45).notNullable()
      table.text('userAgent').nullable()
      table.json('deviceInfo').nullable()
      
      // Authentication tokens
      table.string('token', 2000).notNullable()
      table.string('refreshToken', 2000).nullable()
      
      // Session status
      table.boolean('isActive').default(true)
      table.boolean('isSynced').default(false)
      
      // Timestamps
      table.dateTime('lastActivityAt').notNullable()
      table.dateTime('expiresAt').notNullable()
      table.dateTime('revokedAt').nullable()
      table.string('revokeReason', 255).nullable()
      
      // JSON fields for metadata
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
      table.index(['sessionId'], 'hybrid_sessions_session_id_index')
      table.index(['userId'], 'hybrid_sessions_user_id_index')
      table.index(['platform'], 'hybrid_sessions_platform_index')
      table.index(['isActive'], 'hybrid_sessions_is_active_index')
      table.index(['expiresAt'], 'hybrid_sessions_expires_at_index')
      table.index(['lastActivityAt'], 'hybrid_sessions_last_activity_index')
      table.index(['revokedAt'], 'hybrid_sessions_revoked_at_index')
    })
  }

  public async down() {
    this.schema.dropTable(this.tableName)
  }
}