import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import HybridUser from './hybrid_user'

export default class HybridSession extends BaseModel {
  @column({ isPrimary: true })
  public id: number

  @column()
  public sessionId: string // Unique session identifier

  @column()
  public userId: number

  @column()
  public platform: 'academy' | 'offline' | 'hybrid'

  @column()
  public ipAddress: string

  @column()
  public userAgent?: string

  @column()
  public deviceInfo?: object // Device and browser information

  @column()
  public token: string // JWT token for the session

  @column()
  public refreshToken?: string // Refresh token for session renewal

  @column()
  public isActive: boolean

  @column()
  public isSynced: boolean // Whether session is synced across platforms

  @column()
  public lastActivityAt: DateTime

  @column()
  public expiresAt: DateTime

  @column()
  public revokedAt?: DateTime

  @column()
  public revokeReason?: string

  @column()
  public metadata: object // Additional session metadata

  @column.dateTime({ autoCreate: true })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  public updatedAt: DateTime

  // Relationships
  @belongsTo(() => HybridUser, {
    foreignKey: 'userId'
  })
  public user: BelongsTo<typeof HybridUser>

  /**
   * Check if session is expired
   */
  public get isExpired(): boolean {
    return this.expiresAt < DateTime.now()
  }

  /**
   * Check if session is revoked
   */
  public get isRevoked(): boolean {
    return !!this.revokedAt
  }

  /**
   * Check if session is valid
   */
  public get isValid(): boolean {
    return this.isActive && !this.isExpired && !this.isRevoked
  }

  /**
   * Check if session needs refresh
   */
  public get needsRefresh(): boolean {
    // Refresh if expires within 30 minutes
    return this.expiresAt.diffNow('minutes') < 30
  }

  /**
   * Get session age in minutes
   */
  public get ageInMinutes(): number {
    return this.createdAt.diffNow('minutes')
  }

  /**
   * Get session idle time in minutes
   */
  public get idleTimeInMinutes(): number {
    return this.lastActivityAt.diffNow('minutes')
  }

  /**
   * Update last activity timestamp
   */
  public async updateLastActivity() {
    this.lastActivityAt = new DateTime()
    await this.save()
  }

  /**
   * Extend session expiration
   */
  public async extendSession(minutes: number = 30) {
    this.expiresAt = DateTime.now().plus({ minutes })
    await this.save()
  }

  /**
   * Revoke session
   */
  public async revoke(reason?: string) {
    this.isActive = false
    this.revokedAt = new DateTime()
    this.revokeReason = reason
    await this.save()
  }

  /**
   * Check if session belongs to user
   */
  public belongsToUser(userId: number): boolean {
    return this.userId === userId
  }

  /**
   * Check if session is from platform
   */
  public isFromPlatform(platform: 'academy' | 'offline' | 'hybrid'): boolean {
    return this.platform === platform
  }

  /**
   * Get device information
   */
  public getDeviceInfo() {
    return {
      ...this.deviceInfo,
      ipAddress: this.ipAddress,
      userAgent: this.userAgent
    }
  }

  /**
   * Update device information
   */
  public async updateDeviceInfo(deviceInfo: object) {
    this.deviceInfo = { ...this.deviceInfo, ...deviceInfo }
    await this.save()
  }

  /**
   * Get session metadata
   */
  public getMetadata(defaults: any = {}) {
    return {
      loginMethod: 'sso',
      syncStatus: 'pending',
      ...defaults,
      ...this.metadata
    }
  }

  /**
   * Update session metadata
   */
  public async updateMetadata(metadata: object) {
    this.metadata = { ...this.metadata, ...metadata }
    await this.save()
  }

  /**
   * Mark session as synced
   */
  public async markAsSynced() {
    this.isSynced = true
    await this.save()
  }

  /**
   * Mark session as needing sync
   */
  public async markAsNeedingSync() {
    this.isSynced = false
    await this.save()
  }

  /**
   * Serialize session for API response
   */
  public serializeForAPI() {
    return {
      id: this.id,
      sessionId: this.sessionId,
      userId: this.userId,
      platform: this.platform,
      deviceInfo: this.getDeviceInfo(),
      isActive: this.isActive,
      isSynced: this.isSynced,
      lastActivityAt: this.lastActivityAt,
      expiresAt: this.expiresAt,
      ageInMinutes: this.ageInMinutes,
      idleTimeInMinutes: this.idleTimeInMinutes,
      needsRefresh: this.needsRefresh,
      isValid: this.isValid,
      isExpired: this.isExpired,
      isRevoked: this.isRevoked,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    }
  }

  /**
   * Serialize session for sync
   */
  public serializeForSync() {
    return {
      sessionId: this.sessionId,
      userId: this.userId,
      platform: this.platform,
      isActive: this.isActive,
      lastActivityAt: this.lastActivityAt,
      expiresAt: this.expiresAt,
      deviceInfo: this.getDeviceInfo(),
      metadata: this.getMetadata()
    }
  }

  /**
   * Clean up expired sessions
   */
  public static async cleanupExpired() {
    return await this.query()
      .where('expiresAt', '<', DateTime.now())
      .delete()
  }

  /**
   * Clean up revoked sessions older than 7 days
   */
  public static async cleanupRevoked() {
    const sevenDaysAgo = DateTime.now().minus({ days: 7 })
    return await this.query()
      .where('revokedAt', '<', sevenDaysAgo)
      .delete()
  }

  /**
   * Get active sessions for user
   */
  public static async getActiveForUser(userId: number) {
    return await this.query()
      .where('userId', userId)
      .where('isActive', true)
      .where('expiresAt', '>', DateTime.now())
      .orderBy('lastActivityAt', 'desc')
      .exec()
  }

  /**
   * Get sessions by platform
   */
  public static async getByPlatform(platform: 'academy' | 'offline' | 'hybrid') {
    return await this.query()
      .where('platform', platform)
      .where('isActive', true)
      .orderBy('createdAt', 'desc')
      .exec()
  }

  /**
   * Revoke all sessions for user
   */
  public static async revokeAllForUser(userId: number, reason?: string) {
    return await this.query()
      .where('userId', userId)
      .where('isActive', true)
      .update({
        isActive: false,
        revokedAt: new DateTime(),
        revokeReason: reason || 'User logout'
      })
  }

  /**
   * Get session statistics
   */
  public static async getStats() {
    const now = DateTime.now()
    const oneHourAgo = now.minus({ hours: 1 })
    const oneDayAgo = now.minus({ days: 1 })
    const oneWeekAgo = now.minus({ weeks: 1 })

    const [
      totalSessions,
      activeSessions,
      expiredSessions,
      revokedSessions,
      recentSessions,
      dailySessions,
      weeklySessions
    ] = await Promise.all([
      this.query().count('* as total'),
      this.query().where('isActive', true).where('expiresAt', '>', now).count('* as active'),
      this.query().where('expiresAt', '<', now).count('* as expired'),
      this.query().whereNotNull('revokedAt').count('* as revoked'),
      this.query().where('createdAt', '>', oneHourAgo).count('* as recent'),
      this.query().where('createdAt', '>', oneDayAgo).count('* as daily'),
      this.query().where('createdAt', '>', oneWeekAgo).count('* as weekly')
    ])

    return {
      total: total[0]?.total || 0,
      active: active[0]?.active || 0,
      expired: expired[0]?.expired || 0,
      revoked: revoked[0]?.revoked || 0,
      recent: recent[0]?.recent || 0,
      daily: daily[0]?.daily || 0,
      weekly: weekly[0]?.weekly || 0
    }
  }
}