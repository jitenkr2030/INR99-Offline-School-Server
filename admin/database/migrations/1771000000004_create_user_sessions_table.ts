import BaseSchema from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user_sessions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      
      // Session information
      table.string('session_id').unique().notNullable()
      table.integer('user_id').unsigned().references('id').inTable('school_users').onDelete('CASCADE')
      table.string('device_info').nullable()
      table.string('ip_address').nullable()
      
      // Session timing
      table.datetime('login_time').notNullable()
      table.datetime('logout_time').nullable()
      table.integer('duration_minutes').nullable()
      
      // Activity tracking
      table.json('pages_visited').nullable() // Array of visited pages
      table.json('features_used').nullable() // Array of features used
      table.integer('ai_queries_count').defaultTo(0)
      table.integer('downloads_count').defaultTo(0)
      
      // Timestamps
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}