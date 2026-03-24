import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import SchoolUser from './school_user.js'

export default class StudentProgress extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare studentId: number

  @column()
  declare contentType: 'video' | 'exercise' | 'article' | 'quiz'

  @column()
  declare contentId: string

  @column()
  declare subject: string

  @column()
  declare topic?: string

  @column()
  declare status: 'not_started' | 'in_progress' | 'completed'

  @column()
  declare progressPercentage: number

  @column.dateTime()
  declare startedAt?: Date

  @column.dateTime()
  declare completedAt?: Date

  @column()
  declare timeSpentMinutes: number

  @column()
  declare score?: number

  @column()
  declare attempts: number

  @column()
  declare quizAnswers?: any

  @column()
  declare teacherNotes?: string

  @column()
  declare teacherRating?: number

  @column()
  declare teacherId?: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: Date

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: Date

  // Relationships
  @belongsTo(() => SchoolUser, {
    foreignKey: 'studentId',
  })
  declare student: BelongsTo<typeof SchoolUser>

  @belongsTo(() => SchoolUser, {
    foreignKey: 'teacherId',
  })
  declare teacher: BelongsTo<typeof SchoolUser>

  // Helper methods
  public startProgress(): void {
    if (this.status === 'not_started') {
      this.status = 'in_progress'
      this.startedAt = new Date()
    }
  }

  public updateProgress(percentage: number): void {
    this.progressPercentage = Math.min(100, Math.max(0, percentage))
    if (this.progressPercentage >= 100 && this.status !== 'completed') {
      this.completeProgress()
    }
  }

  public completeProgress(): void {
    this.status = 'completed'
    this.completedAt = new Date()
    this.progressPercentage = 100
  }

  public addTimeSpent(minutes: number): void {
    this.timeSpentMinutes += minutes
  }

  public setScore(score: number): void {
    this.score = score
    this.attempts += 1
  }

  public isCompleted(): boolean {
    return this.status === 'completed'
  }

  public getGrade(): string {
    if (!this.score) return 'N/A'
    if (this.score >= 90) return 'A+'
    if (this.score >= 80) return 'A'
    if (this.score >= 70) return 'B+'
    if (this.score >= 60) return 'B'
    if (this.score >= 50) return 'C'
    return 'Needs Improvement'
  }
}