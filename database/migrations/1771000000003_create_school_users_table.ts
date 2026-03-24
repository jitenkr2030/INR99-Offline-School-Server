import BaseSchema from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'school_users'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      
      // User information
      table.string('user_id').unique().notNullable() // School-generated ID
      table.string('name').notNullable()
      table.string('email').unique().notNullable()
      table.string('password').notNullable()
      
      // Role and classification
      table.enum('role', ['admin', 'teacher', 'student']).notNullable()
      table.string('grade_level').nullable() // For students: "Grade 1", "Grade 2", etc.
      table.string('section').nullable() // For students: "A", "B", "C", etc.
      table.string('subject').nullable() // For teachers: "Mathematics", "Science", etc.
      
      // School information
      table.string('class_teacher').nullable() // For students: assigned teacher
      table.json('subjects').nullable() // For students: array of subjects
      table.string('roll_number').nullable() // For students: roll number in class
      
      // Access control
      table.boolean('is_active').defaultTo(true)
      table.datetime('last_login').nullable()
      table.string('login_token').nullable()
      
      // Parent information (for students)
      table.string('parent_name').nullable()
      table.string('parent_contact').nullable()
      table.string('parent_email').nullable()
      
      // Timestamps
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}