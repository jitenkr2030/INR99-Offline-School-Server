import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'

export default class HybridSyncData extends BaseModel {
  @column({ isPrimary: true })
  public id: number

  @column()
  public userId: number

  @column()
  public dataType: 'progress' | 'assignment' | 'course' | 'user' | 'content' | 'grade' | 'attendance'

  @column()
  public direction: 'online_to_offline' | 'offline_to_online' | 'bidirectional'

  @column()
  public sourcePlatform: 'academy' | 'offline' | 'hybrid'

  @column()
  public targetPlatform: 'academy' | 'offline' | 'hybrid'

  @column()
  public entityId: string

  @column()
  public entityType: string

  @column()
  public action: 'create' | 'update' | 'delete' | 'merge'

  @column()
  public data: object

  @column()
  public previousData?: object

  @column()
  public status: 'pending' | 'processing' | 'completed' | 'failed' | 'conflict' | 'retrying'

  @column()
  public priority: 'low' | 'medium' | 'high' | 'critical'

  @column()
  public retryCount: number

  @column()
  public maxRetries: number

  @column()
  public nextRetryAt?: DateTime

  @column()
  public completedAt?: DateTime

  @column()
  public errorMessage?: string

  @column()
  public errorDetails?: object

  @column()
  public conflictResolution?: 'manual' | 'auto' | 'skip'

  @column()
  public resolvedBy?: number

  @column()
  public resolvedAt?: DateTime

  @column()
  public syncAt?: DateTime

  @column()
  public checksum?: string

  @column()
  public version: number

  @column()
  public metadata: object

  @column.dateTime({ autoCreate: true })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  public updatedAt: DateTime

  /**
   * Check if sync can be retried
   */
  public get canRetry(): boolean {
    return this.retryCount < this.maxRetries && this.status === 'failed'
  }

  /**
   * Check if sync has conflict
   */
  public get hasConflict(): boolean {
    return this.status === 'conflict'
  }

  /**
   * Check if sync is ready to be processed
   */
  public get isReadyToProcess(): boolean {
    return this.status === 'pending' && 
           (!this.syncAt || this.syncAt <= DateTime.now())
  }

  /**
   * Get sync age in minutes
   */
  public get ageInMinutes(): number {
    return this.createdAt.diffNow('minutes')
  }

  /**
   * Get time since last retry
   */
  public get timeSinceLastRetry(): number {
    return this.updatedAt.diffNow('minutes')
  }

  /**
   * Increment retry count
   */
  public async incrementRetry() {
    this.retryCount++
    this.updatedAt = new DateTime()
    
    // Calculate next retry time with exponential backoff
    const backoffMinutes = Math.min(30, Math.pow(2, this.retryCount))
    this.nextRetryAt = DateTime.now().plus({ minutes: backoffMinutes })
    
    await this.save()
  }

  /**
   * Mark as processing
   */
  public async markAsProcessing() {
    this.status = 'processing'
    this.updatedAt = new DateTime()
    await this.save()
  }

  /**
   * Mark as completed
   */
  public async markAsCompleted() {
    this.status = 'completed'
    this.completedAt = new DateTime()
    this.updatedAt = new DateTime()
    await this.save()
  }

  /**
   * Mark as failed
   */
  public async markAsFailed(errorMessage: string, errorDetails?: object) {
    this.status = 'failed'
    this.errorMessage = errorMessage
    this.errorDetails = errorDetails
    this.updatedAt = new DateTime()
    
    if (this.canRetry) {
      await this.incrementRetry()
    }
    
    await this.save()
  }

  /**
   * Mark as conflict
   */
  public async markAsConflict(conflictDetails: object) {
    this.status = 'conflict'
    this.errorDetails = conflictDetails
    this.updatedAt = new DateTime()
    await this.save()
  }

  /**
   * Mark as retrying
   */
  public async markAsRetrying() {
    this.status = 'retrying'
    this.updatedAt = new DateTime()
    await this.save()
  }

  /**
   * Resolve conflict
   */
  public async resolveConflict(resolvedBy: number, resolution: any) {
    this.status = 'completed'
    this.conflictResolution = 'manual'
    this.resolvedBy = resolvedBy
    this.resolvedAt = new DateTime()
    this.data = resolution
    this.updatedAt = new DateTime()
    await this.save()
  }

  /**
   * Calculate data checksum
   */
  public calculateChecksum(): string {
    const crypto = require('crypto')
    const dataString = JSON.stringify(this.data)
    return crypto.createHash('sha256').update(dataString).digest('hex')
  }

  /**
   * Verify data integrity
   */
  public verifyIntegrity(): boolean {
    if (!this.checksum) return true // No checksum to verify against
    
    const currentChecksum = this.calculateChecksum()
    return currentChecksum === this.checksum
  }

  /**
   * Update checksum
   */
  public async updateChecksum() {
    this.checksum = this.calculateChecksum()
    await this.save()
  }

  /**
   * Get sync duration
   */
  public getSyncDuration(): number | null {
    if (!this.completedAt) return null
    return this.completedAt.diff(this.createdAt, 'seconds')
  }

  /**
   * Get sync payload for API
   */
  public getPayload() {
    return {
      id: this.id,
      userId: this.userId,
      dataType: this.dataType,
      direction: this.direction,
      sourcePlatform: this.sourcePlatform,
      targetPlatform: this.targetPlatform,
      entityId: this.entityId,
      entityType: this.entityType,
      action: this.action,
      data: this.data,
      previousData: this.previousData,
      version: this.version,
      metadata: this.metadata
    }
  }

  /**
   * Serialize for API response
   */
  public serializeForAPI() {
    return {
      id: this.id,
      userId: this.userId,
      dataType: this.dataType,
      direction: this.direction,
      sourcePlatform: this.sourcePlatform,
      targetPlatform: this.targetPlatform,
      entityId: this.entityId,
      entityType: this.entityType,
      action: this.action,
      status: this.status,
      priority: this.priority,
      retryCount: this.retryCount,
      maxRetries: this.maxRetries,
      nextRetryAt: this.nextRetryAt,
      completedAt: this.completedAt,
      syncDuration: this.getSyncDuration(),
      errorMessage: this.errorMessage,
      hasConflict: this.hasConflict,
      conflictResolution: this.conflictResolution,
      resolvedBy: this.resolvedBy,
      resolvedAt: this.resolvedAt,
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
   * Serialize for sync
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
   * Get device information
   */
  public getDeviceInfo() {
    return {
      ipAddress: this.ipAddress,
      userAgent: this.userAgent,
      platform: this.platform
    }
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
   * Update device information
   */
  public async updateDeviceInfo(deviceInfo: object) {
    this.deviceInfo = { ...this.deviceInfo, ...deviceInfo }
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
   * Get idle time in minutes
   */
  public get idleTimeInMinutes(): number {
    return this.lastActivityAt.diffNow('minutes')
  }

  /**
   * Check if session needs refresh
   */
  public get needsRefresh(): boolean {
    return this.expiresAt.diffNow('minutes') < 30
  }

  /**
   * Check if session is valid
   */
  public get isValid(): boolean {
    return this.isActive && !this.isExpired && !this.isRevoked
  }

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
}