import { BaseSchema } from '@adonisjs/lucid/schema'

export default class CreateSecurityTables extends BaseSchema {
  protected tableName = 'security_tables'

  public async up() {
    // Create security_audit_log table
    this.schema.createTable('security_audit_log', (table) => {
      table.uuid('id').primary()
      table.enum('type', ['auth', 'data_access', 'data_modification', 'security_violation', 'system']).notNullable()
      table.enum('severity', ['low', 'medium', 'high', 'critical']).notNullable()
      table.uuid('user_id').nullable()
      table.string('ip_address', 45).notNullable()
      table.text('user_agent').nullable()
      table.string('resource', 255).notNullable()
      table.string('action', 100).notNullable()
      table.enum('status', ['success', 'failure', 'warning']).notNullable()
      table.json('details').nullable()
      table.json('metadata').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()

      // Indexes
      table.index('type')
      table.index('severity')
      table.index('user_id')
      table.index('ip_address')
      table.index('action')
      table.index('status')
      table.index('created_at')

      // Foreign key
      table.foreign('user_id').references('id').inTable('users').onDelete('SET NULL')
    })

    // Create rate_limits table
    this.schema.createTable('rate_limits', (table) => {
      table.uuid('id').primary()
      table.string('identifier', 255).notNullable() // IP address or user ID
      table.timestamp('timestamp', { useTz: true }).notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable()

      // Indexes
      table.index('identifier')
      table.index('timestamp')
      table.index(['identifier', 'timestamp'])
    })

    // Create api_keys table
    this.schema.createTable('api_keys', (table) => {
      table.uuid('id').primary()
      table.uuid('user_id').notNullable()
      table.string('key_hash', 64).notNullable().unique()
      table.json('permissions').notNullable()
      table.string('name', 255).nullable()
      table.text('description').nullable()
      table.timestamp('expires_at', { useTz: true }).notNullable()
      table.timestamp('last_used_at', { useTz: true }).nullable()
      table.boolean('is_active').notNullable().defaultTo(true)
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      // Indexes
      table.index('user_id')
      table.index('key_hash')
      table.index('expires_at')
      table.index('is_active')
      table.index('last_used_at')

      // Foreign key
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE')
    })

    // Create security_incidents table
    this.schema.createTable('security_incidents', (table) => {
      table.uuid('id').primary()
      table.string('title', 255).notNullable()
      table.enum('severity', ['low', 'medium', 'high', 'critical']).notNullable()
      table.enum('status', ['open', 'investigating', 'resolved', 'closed']).notNullable().defaultTo('open')
      table.text('description').notNullable()
      table.json('details').nullable()
      table.uuid('user_id').nullable()
      table.string('ip_address', 45).nullable()
      table.string('affected_resources').nullable() // JSON array
      table.string('resolution').nullable()
      table.uuid('resolved_by').nullable()
      table.timestamp('resolved_at', { useTz: true }).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      // Indexes
      table.index('severity')
      table.index('status')
      table.index('user_id')
      table.index('created_at')
      table.index('resolved_at')

      // Foreign keys
      table.foreign('user_id').references('id').inTable('users').onDelete('SET NULL')
      table.foreign('resolved_by').references('id').inTable('users').onDelete('SET NULL')
    })

    // Create blocked_ips table
    this.schema.createTable('blocked_ips', (table) => {
      table.uuid('id').primary()
      table.string('ip_address', 45).notNullable()
      table.string('reason', 255).notNullable()
      table.text('notes').nullable()
      table.enum('block_type', ['temporary', 'permanent']).notNullable()
      table.timestamp('blocked_until', { useTz: true }).nullable()
      table.uuid('blocked_by').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      // Indexes
      table.index('ip_address')
      table.index('block_type')
      table.index('blocked_until')
      table.index('created_at')

      // Foreign key
      table.foreign('blocked_by').references('id').inTable('users').onDelete('SET NULL')
    })

    // Create security_settings table
    this.schema.createTable('security_settings', (table) => {
      table.uuid('id').primary()
      table.string('key', 100).notNullable().unique()
      table.json('value').notNullable()
      table.string('description').nullable()
      table.enum('category', ['authentication', 'authorization', 'encryption', 'audit', 'rate_limiting', 'csrf', 'cors']).notNullable()
      table.boolean('is_active').notNullable().defaultTo(true)
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      // Indexes
      table.index('key')
      table.index('category')
      table.index('is_active')
    })

    // Insert default security settings
    await this.db.table('security_settings').insert([
      {
        id: '660e8400-e29b-41d4-a716-446655440001',
        key: 'password_min_length',
        value: JSON.stringify(8),
        description: 'Minimum password length',
        category: 'authentication',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440002',
        key: 'password_require_uppercase',
        value: JSON.stringify(true),
        description: 'Require uppercase letters in passwords',
        category: 'authentication',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440003',
        key: 'password_require_lowercase',
        value: JSON.stringify(true),
        description: 'Require lowercase letters in passwords',
        category: 'authentication',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440004',
        key: 'password_require_numbers',
        value: JSON.stringify(true),
        description: 'Require numbers in passwords',
        category: 'authentication',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440005',
        key: 'password_require_special_chars',
        value: JSON.stringify(true),
        description: 'Require special characters in passwords',
        category: 'authentication',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440006',
        key: 'session_timeout_minutes',
        value: JSON.stringify(24 * 60),
        description: 'Session timeout in minutes',
        category: 'authentication',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440007',
        key: 'max_login_attempts',
        value: JSON.stringify(5),
        description: 'Maximum failed login attempts before lockout',
        category: 'authentication',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440008',
        key: 'lockout_duration_minutes',
        value: JSON.stringify(15),
        description: 'Account lockout duration in minutes',
        category: 'authentication',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440009',
        key: 'rate_limit_window_minutes',
        value: JSON.stringify(15),
        description: 'Rate limiting time window in minutes',
        category: 'rate_limiting',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440010',
        key: 'rate_limit_max_requests',
        value: JSON.stringify(100),
        description: 'Maximum requests per time window',
        category: 'rate_limiting',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440011',
        key: 'api_key_expiry_days',
        value: JSON.stringify(365),
        description: 'API key expiry in days',
        category: 'authorization',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440012',
        key: 'audit_log_retention_days',
        value: JSON.stringify(90),
        description: 'Security audit log retention period in days',
        category: 'audit',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440013',
        key: 'csrf_token_expires_minutes',
        value: JSON.stringify(60),
        description: 'CSRF token expiry in minutes',
        category: 'csrf',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440014',
        key: 'enable_csrf_protection',
        value: JSON.stringify(true),
        description: 'Enable CSRF protection',
        category: 'csrf',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440015',
        key: 'cors_allowed_origins',
        value: JSON.stringify(['http://localhost:3000', 'http://localhost:8080']),
        description: 'Allowed CORS origins',
        category: 'cors',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440016',
        key: 'enable_suspicious_activity_detection',
        value: JSON.stringify(true),
        description: 'Enable suspicious activity detection',
        category: 'audit',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440017',
        key: 'suspicious_activity_risk_threshold',
        value: JSON.stringify(30),
        description: 'Risk score threshold for suspicious activity',
        category: 'audit',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ])
  }

  public async down() {
    this.schema.dropTableIfExists('security_settings')
    this.schema.dropTableIfExists('blocked_ips')
    this.schema.dropTableIfExists('security_incidents')
    this.schema.dropTableIfExists('api_keys')
    this.schema.dropTableIfExists('rate_limits')
    this.schema.dropTableIfExists('security_audit_log')
  }
}