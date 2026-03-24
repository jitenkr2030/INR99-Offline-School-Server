import { BaseModel, column, hasMany, manyToMany } from '@adonisjs/lucid/orm'
import type { HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import UserSession from './user_session.js'
import StudentProgress from './student_progress.js'

export default class SchoolUser extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: string

  @column()
  declare name: string

  @column()
  declare email: string

  @column()
  declare password: string

  @column()
  declare role: 'admin' | 'teacher' | 'student'

  @column()
  declare gradeLevel?: string

  @column()
  declare section?: string

  @column()
  declare subject?: string

  @column()
  declare classTeacher?: string

  @column()
  declare subjects?: string[]

  @column()
  declare rollNumber?: string

  @column()
  declare isActive: boolean

  @column.dateTime()
  declare lastLogin?: Date

  @column()
  declare loginToken?: string

  @column()
  declare parentName?: string

  @column()
  declare parentContact?: string

  @column()
  declare parentEmail?: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: Date

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: Date

  // Relationships
  @hasMany(() => UserSession, {
    foreignKey: 'userId',
  })
  declare sessions: HasMany<typeof UserSession>

  @hasMany(() => StudentProgress, {
    foreignKey: 'studentId',
  })
  declare progress: HasMany<typeof StudentProgress>

  // Helper methods
  public isTeacher(): boolean {
    return this.role === 'teacher'
  }

  public isStudent(): boolean {
    return this.role === 'student'
  }

  public isAdmin(): boolean {
    return this.role === 'admin'
  }

  public getDisplayName(): string {
    return this.name
  }

  public getClassInfo(): string {
    if (this.isStudent() && this.gradeLevel && this.section) {
      return `${this.gradeLevel} - Section ${this.section}`
    }
    return ''
  }
}