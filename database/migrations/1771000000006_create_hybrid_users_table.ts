import { BaseSchema } from '@adonisjs/lucid/schema'

export default class HybridUsers extends BaseSchema {
  protected tableName = 'hybrid_users'

  public async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      
      // Basic user information
      table.string('username', 100).unique().notNullable()
      table.string('email', 255).unique().notNullable()
      table.string('password', 255).notNullable()
      table.string('firstName', 100).nullable()
      table.string('lastName', 100).nullable()
      
      // Role and platform information
      table.enum('role', ['student', 'teacher', 'admin', 'parent']).default('student')
      table.enum('platform', ['academy', 'offline', 'hybrid']).default('offline')
      table.string('ssoId', 255).nullable() // Single Sign-On identifier
      
      // Additional profile information
      table.string('phoneNumber', 20).nullable()
      table.string('avatar', 500).nullable()
      table.text('bio').nullable()
      
      // Account status
      table.boolean('isActive').default(true)
      table.boolean('isEmailVerified').default(false)
      table.string('emailVerificationToken', 255).nullable()
      table.string('passwordResetToken', 255).nullable()
      
      // Timestamps
      table.dateTime('lastLoginAt').nullable()
      table.dateTime('lastSyncAt').nullable()
      table.dateTime('lastActiveAt').nullable()
      
      // JSON fields for preferences and metadata
      table.json('preferences').nullable()
      table.json('metadata').nullable()
      
      // Timestamps
      table.dateTime('createdAt').notNullable()
      table.dateTime('updatedAt').notNullable()
    })

    // Create indexes
    this.schema.alterTable(this.tableName, (table) => {
      table.index(['email'], 'hybrid_users_email_index')
      table.index(['username'], 'hybrid_users_username_index')
      table.index(['ssoId'], 'hybrid_users_sso_id_index')
      table.index(['platform'], 'hybrid_users_platform_index')
      table.index(['role'], 'hybrid_users_role_index')
      table.index(['isActive'], 'hybrid_users_is_active_index')
      table.index(['lastActiveAt'], 'hybrid_users_last_active_index')
    })
  }

  public async down() {
    this.schema.dropTable(this.tableName)
  }
}