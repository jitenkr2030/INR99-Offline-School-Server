import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import SchoolUser from './school_user.js'

export default class UserSession extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare sessionId: string

  @column()
  declare userId: number

  @column()
  declare deviceInfo?: string

  @column()
  declare ipAddress?: string

  @column.dateTime()
  declare loginTime: Date

  @column.dateTime()
  declare logoutTime?: Date

  @column()
  declare durationMinutes?: number

  @column()
  declare pagesVisited?: string[]

  @column()
  declare featuresUsed?: string[]

  @column()
  declare aiQueriesCount: number

  @column()
  declare downloadsCount: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: Date

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: Date

  // Relationships
  @belongsTo(() => SchoolUser, {
    foreignKey: 'userId',
  })
  declare user: BelongsTo<typeof SchoolUser>

  // Helper methods
  public isActive(): boolean {
    return !this.logoutTime
  }

  public getDuration(): number {
    if (this.logoutTime) {
      return Math.floor((this.logoutTime.getTime() - this.loginTime.getTime()) / (1000 * 60))
    }
    return Math.floor((new Date().getTime() - this.loginTime.getTime()) / (1000 * 60))
  }

  public addPageVisit(page: string): void {
    if (!this.pagesVisited) {
      this.pagesVisited = []
    }
    this.pagesVisited.push(page)
  }

  public addFeatureUsed(feature: string): void {
    if (!this.featuresUsed) {
      this.featuresUsed = []
    }
    this.featuresUsed.push(feature)
  }
}