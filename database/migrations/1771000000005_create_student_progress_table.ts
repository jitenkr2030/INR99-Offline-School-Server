import BaseSchema from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'student_progress'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      
      // Student and content reference
      table.integer('student_id').unsigned().references('id').inTable('school_users').onDelete('CASCADE')
      table.string('content_type').notNullable() // 'video', 'exercise', 'article', 'quiz'
      table.string('content_id').notNullable() // ID of the specific content
      table.string('subject').notNullable()
      table.string('topic').nullable()
      
      // Progress tracking
      table.enum('status', ['not_started', 'in_progress', 'completed']).defaultTo('not_started')
      table.integer('progress_percentage').defaultTo(0)
      table.datetime('started_at').nullable()
      table.datetime('completed_at').nullable()
      table.integer('time_spent_minutes').defaultTo(0)
      
      // Performance metrics
      table.decimal('score', 5, 2).nullable() // Quiz/exercise scores
      table.integer('attempts').defaultTo(0)
      table.json('quiz_answers').nullable() // Store quiz attempt data
      
      // Teacher feedback
      table.text('teacher_notes').nullable()
      table.integer('teacher_rating').nullable() // 1-5 scale
      table.string('teacher_id').unsigned().references('id').inTable('school_users').onDelete('SET NULL').nullable()
      
      // Timestamps
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
      
      // Indexes for performance
      table.index(['student_id', 'subject'])
      table.index(['student_id', 'status'])
      table.index(['content_type', 'subject'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}