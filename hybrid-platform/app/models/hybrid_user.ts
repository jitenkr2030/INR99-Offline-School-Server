import { BaseModel, column, hasMany, manyToMany } from '@adonisjs/lucid/orm'
import type { HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'

export default class HybridUser extends BaseModel {
  @column({ isPrimary: true })
  public id: number

  @column()
  public username: string

  @column()
  public email: string

  @column({ serializeAs: 'password' })
  public password: string

  @column()
  public firstName: string

  @column()
  public lastName: string

  @column()
  public role: 'student' | 'teacher' | 'admin' | 'parent'

  @column()
  public platform: 'academy' | 'offline' | 'hybrid'

  @column()
  public ssoId: string // Single Sign-On identifier

  @column()
  public phoneNumber?: string

  @column()
  public avatar?: string

  @column()
  public bio?: string

  @column()
  public isActive: boolean

  @column()
  public isEmailVerified: boolean

  @column()
  public lastLoginAt?: DateTime

  @column()
  public lastSyncAt?: DateTime

  @column()
  public lastActiveAt?: DateTime

  @column()
  public preferences: object

  @column()
  public metadata: object

  @column.dateTime({ autoCreate: true })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  public updatedAt: DateTime

  /**
   * Get full name
   */
  public get fullName(): string {
    return `${this.firstName} ${this.lastName}`.trim()
  }

  /**
   * Check if user is admin
   */
  public get isAdmin(): boolean {
    return this.role === 'admin'
  }

  /**
   * Check if user is teacher
   */
  public get isTeacher(): boolean {
    return this.role === 'teacher' || this.role === 'admin'
  }

  /**
   * Check if user is student
   */
  public get isStudent(): boolean {
    return this.role === 'student'
  }

  /**
   * Check if user is parent
   */
  public get isParent(): boolean {
    return this.role === 'parent'
  }

  /**
   * Get user's display name
   */
  public get displayName(): string {
    if (this.firstName && this.lastName) {
      return this.fullName
    }
    return this.username || this.email
  }

  /**
   * Check if user has access to platform
   */
  public hasPlatformAccess(platform: 'academy' | 'offline' | 'hybrid'): boolean {
    return this.platform === platform || this.platform === 'hybrid'
  }

  /**
   * Update last login timestamp
   */
  public async updateLastLogin() {
    this.lastLoginAt = new DateTime()
    this.lastActiveAt = new DateTime()
    await this.save()
  }

  /**
   * Update last sync timestamp
   */
  public async updateLastSync() {
    this.lastSyncAt = new DateTime()
    this.lastActiveAt = new DateTime()
    await this.save()
  }

  /**
   * Update last activity timestamp
   */
  public async updateLastActivity() {
    this.lastActiveAt = new DateTime()
    await this.save()
  }

  /**
   * Get user preferences with defaults
   */
  public getPreferences(defaults: any = {}) {
    return {
      theme: 'light',
      language: 'en',
      notifications: true,
      autoSync: true,
      offlineMode: false,
      ...defaults,
      ...this.preferences
    }
  }

  /**
   * Update user preferences
   */
  public async updatePreferences(preferences: object) {
    this.preferences = { ...this.preferences, ...preferences }
    await this.save()
  }

  /**
   * Get user metadata
   */
  public getMetadata(defaults: any = {}) {
    return {
      deviceInfo: {},
      loginHistory: [],
      syncHistory: [],
      ...defaults,
      ...this.metadata
    }
  }

  /**
   * Update user metadata
   */
  public async updateMetadata(metadata: object) {
    this.metadata = { ...this.metadata, ...metadata }
    await this.save()
  }

  /**
   * Get user's sync status
   */
  public getSyncStatus() {
    return {
      lastSyncAt: this.lastSyncAt,
      pendingSyncCount: 0, // Would be calculated from syncData
      isOnline: this.lastActiveAt ? 
        this.lastActiveAt.diffNow('minutes') < 5 : false,
      syncEnabled: this.getPreferences().autoSync
    }
  }

  /**
   * Serialize user for API response
   */
  public serializeForAPI() {
    return {
      id: this.id,
      username: this.username,
      email: this.email,
      firstName: this.firstName,
      lastName: this.lastName,
      fullName: this.fullName,
      displayName: this.displayName,
      role: this.role,
      platform: this.platform,
      ssoId: this.ssoId,
      phoneNumber: this.phoneNumber,
      avatar: this.avatar,
      bio: this.bio,
      isActive: this.isActive,
      isEmailVerified: this.isEmailVerified,
      lastLoginAt: this.lastLoginAt,
      lastSyncAt: this.lastSyncAt,
      lastActiveAt: this.lastActiveAt,
      preferences: this.getPreferences(),
      syncStatus: this.getSyncStatus(),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    }
  }

  /**
   * Serialize user for SSO
   */
  public serializeForSSO() {
    return {
      id: this.id,
      sub: this.ssoId,
      email: this.email,
      username: this.username,
      firstName: this.firstName,
      lastName: this.lastName,
      role: this.role,
      platform: this.platform,
      emailVerified: this.isEmailVerified,
      isActive: this.isActive
    }
  }
}