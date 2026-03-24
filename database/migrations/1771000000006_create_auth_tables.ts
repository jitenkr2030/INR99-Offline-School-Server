import { BaseSchema } from '@adonisjs/lucid/schema'

export default class CreateAuthTables extends BaseSchema {
  protected tableName = 'auth_tables'

  public async up() {
    // Create users table
    this.schema.createTable('users', (table) => {
      table.uuid('id').primary()
      table.string('email', 255).notNullable().unique()
      table.string('first_name', 100).notNullable()
      table.string('last_name', 100).notNullable()
      table.enum('role', ['student', 'teacher', 'admin', 'parent']).notNullable()
      table.uuid('school_id').notNullable()
      table.uuid('class_id').nullable()
      table.string('password_hash', 255).notNullable()
      table.json('preferences').nullable()
      table.json('permissions').nullable()
      table.boolean('is_active').notNullable().defaultTo(true)
      table.timestamp('last_login', { useTz: true }).nullable()
      table.timestamp('password_changed_at', { useTz: true }).nullable()
      table.integer('failed_login_attempts').notNullable().defaultTo(0)
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      // Indexes
      table.index('email')
      table.index('school_id')
      table.index('role')
      table.index('is_active')
    })

    // Create user_sessions table
    this.schema.createTable('user_sessions', (table) => {
      table.uuid('id').primary()
      table.uuid('user_id').notNullable()
      table.string('user_email', 255).notNullable()
      table.enum('user_role', ['student', 'teacher', 'admin', 'parent']).notNullable()
      table.enum('platform', ['online', 'offline', 'hybrid']).notNullable()
      table.timestamp('login_time', { useTz: true }).notNullable()
      table.timestamp('last_activity', { useTz: true }).notNullable()
      table.timestamp('expires_at', { useTz: true }).notNullable()
      table.string('ip_address', 45).notNullable()
      table.text('user_agent').nullable()
      table.boolean('is_active').notNullable().defaultTo(true)
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      // Indexes
      table.index('user_id')
      table.index('expires_at')
      table.index('is_active')
      table.index('platform')

      // Foreign key
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE')
    })

    // Create user_lockouts table
    this.schema.createTable('user_lockouts', (table) => {
      table.uuid('id').primary()
      table.uuid('user_id').notNullable()
      table.timestamp('locked_until', { useTz: true }).notNullable()
      table.string('reason', 255).notNullable()
      table.json('metadata').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      // Indexes
      table.index('user_id')
      table.index('locked_until')

      // Foreign key
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE')
    })

    // Create auth_tokens table for token management
    this.schema.createTable('auth_tokens', (table) => {
      table.uuid('id').primary()
      table.uuid('user_id').notNullable()
      table.string('token_type', 50).notNullable() // access, refresh, reset
      table.string('token_hash', 255).notNullable()
      table.timestamp('expires_at', { useTz: true }).notNullable()
      table.string('platform', 50).nullable()
      table.string('device_id', 255).nullable()
      table.string('ip_address', 45).nullable()
      table.text('user_agent').nullable()
      table.boolean('is_revoked').notNullable().defaultTo(false)
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      // Indexes
      table.index('user_id')
      table.index('token_type')
      table.index('expires_at')
      table.index('is_revoked')

      // Foreign key
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE')
    })

    // Create platform_sync_log table for tracking synchronization
    this.schema.createTable('platform_sync_log', (table) => {
      table.uuid('id').primary()
      table.uuid('user_id').notNullable()
      table.enum('source_platform', ['online', 'offline']).notNullable()
      table.enum('target_platform', ['online', 'offline']).notNullable()
      table.enum('sync_type', ['user', 'progress', 'content', 'session']).notNullable()
      table.enum('status', ['pending', 'in_progress', 'completed', 'failed']).notNullable()
      table.json('sync_data').nullable()
      table.text('error_message').nullable()
      table.timestamp('started_at', { useTz: true }).notNullable()
      table.timestamp('completed_at', { useTz: true }).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      // Indexes
      table.index('user_id')
      table.index('source_platform')
      table.index('target_platform')
      table.index('sync_type')
      table.index('status')
      table.index('started_at')

      // Foreign key
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE')
    })

    // Create auth_audit_log table for security auditing
    this.schema.createTable('auth_audit_log', (table) => {
      table.uuid('id').primary()
      table.uuid('user_id').nullable()
      table.string('action', 100).notNullable() // login, logout, password_change, etc.
      table.string('resource', 255).nullable()
      table.enum('status', ['success', 'failure', 'warning']).notNullable()
      table.string('ip_address', 45).notNullable()
      table.text('user_agent').nullable()
      table.json('metadata').nullable()
      table.text('error_message').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()

      // Indexes
      table.index('user_id')
      table.index('action')
      table.index('status')
      table.index('ip_address')
      table.index('created_at')

      // Foreign key
      table.foreign('user_id').references('id').inTable('users').onDelete('SET NULL')
    })
  }

  public async down() {
    this.schema.dropTableIfExists('auth_audit_log')
    this.schema.dropTableIfExists('platform_sync_log')
    this.schema.dropTableIfExists('auth_tokens')
    this.schema.dropTableIfExists('user_lockouts')
    this.schema.dropTableIfExists('user_sessions')
    this.schema.dropTableIfExists('users')
  }
}