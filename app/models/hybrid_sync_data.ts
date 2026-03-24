import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import HybridUser from './hybrid_user'

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
  public entityId: string // ID of the entity being synced (e.g., course_id, assignment_id)

  @column()
  public entityType: string // Type of entity (e.g., 'course', 'assignment', 'user_progress')

  @column()
  public action: 'create' | 'update' | 'delete' | 'merge'

  @column()
  public data: object // The actual data being synced

  @column()
  public previousData?: object // Previous data for conflict resolution

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
  public syncAt?: DateTime // When to attempt the sync

  @column()
  public completedAt?: DateTime

  @column()
  public errorMessage?: string

  @column()
  public errorDetails?: object

  @column()
  public conflictResolution?: 'manual' | 'auto' | 'skip'

  @column()
  public resolvedBy?: number // User ID who resolved conflict

  @column()
  public resolvedAt?: DateTime

  @column()
  public metadata: object // Additional sync metadata

  @column()
  public checksum?: string // Data integrity checksum

  @column()
  public version: number // Data version for conflict resolution

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
   * Create sync data for user progress
   */
  public static async createProgressSync(userId: number, progressData: any, direction: string) {
    return await this.create({
      userId,
      dataType: 'progress',
      direction,
      sourcePlatform: direction === 'online_to_offline' ? 'academy' : 'offline',
      targetPlatform: direction === 'online_to_offline' ? 'offline' : 'academy',
      entityId: progressData.id?.toString() || progressData.courseId?.toString(),
      entityType: 'user_progress',
      action: progressData.id ? 'update' : 'create',
      data: progressData,
      status: 'pending',
      priority: 'medium',
      retryCount: 0,
      maxRetries: 3,
      version: 1,
      metadata: {
        syncType: 'progress',
        timestamp: new Date().toISOString()
      }
    })
  }

  /**
   * Create sync data for assignment
   */
  public static async createAssignmentSync(userId: number, assignmentData: any, direction: string) {
    return await this.create({
      userId,
      dataType: 'assignment',
      direction,
      sourcePlatform: direction === 'online_to_offline' ? 'academy' : 'offline',
      targetPlatform: direction === 'online_to_offline' ? 'offline' : 'academy',
      entityId: assignmentData.id?.toString(),
      entityType: 'assignment',
      action: assignmentData.id ? 'update' : 'create',
      data: assignmentData,
      status: 'pending',
      priority: 'high',
      retryCount: 0,
      maxRetries: 5,
      version: 1,
      metadata: {
        syncType: 'assignment',
        timestamp: new Date().toISOString()
      }
    })
  }

  /**
   * Create sync data for user profile
   */
  public static async createUserSync(userId: number, userData: any, direction: string) {
    return await this.create({
      userId,
      dataType: 'user',
      direction,
      sourcePlatform: direction === 'online_to_offline' ? 'academy' : 'offline',
      targetPlatform: direction === 'online_to_offline' ? 'offline' : 'academy',
      entityId: userId.toString(),
      entityType: 'user',
      action: 'update',
      data: userData,
      status: 'pending',
      priority: 'medium',
      retryCount: 0,
      maxRetries: 3,
      version: 1,
      metadata: {
        syncType: 'user_profile',
        timestamp: new Date().toISOString()
      }
    })
  }

  /**
   * Get pending sync data for user
   */
  public static async getPendingForUser(userId: number) {
    return await this.query()
      .where('userId', userId)
      .where('status', 'pending')
      .where('nextRetryAt', '<=', DateTime.now())
      .orderBy('priority', 'desc')
      .orderBy('createdAt', 'asc')
      .exec()
  }

  /**
   * Get pending sync data by type
   */
  public static async getPendingByType(dataType: string, limit: number = 50) {
    return await this.query()
      .where('dataType', dataType)
      .where('status', 'pending')
      .where('nextRetryAt', '<=', DateTime.now())
      .orderBy('priority', 'desc')
      .orderBy('createdAt', 'asc')
      .limit(limit)
      .exec()
  }

  /**
   * Get failed sync data that can be retried
   */
  public static async getRetryableFailed(limit: number = 20) {
    return await this.query()
      .where('status', 'failed')
      .where('retryCount', '<', 'maxRetries')
      .where('nextRetryAt', '<=', DateTime.now())
      .orderBy('priority', 'desc')
      .orderBy('nextRetryAt', 'asc')
      .limit(limit)
      .exec()
  }

  /**
   * Get sync statistics
   */
  public static async getStats(userId?: number) {
    const query = userId ? this.query().where('userId', userId) : this.query()
    
    const [
      total,
      pending,
      processing,
      completed,
      failed,
      conflicts,
      critical
    ] = await Promise.all([
      query.count('* as total'),
      query.clone().where('status', 'pending').count('* as pending'),
      query.clone().where('status', 'processing').count('* as processing'),
      query.clone().where('status', 'completed').count('* as completed'),
      query.clone().where('status', 'failed').count('* as failed'),
      query.clone().where('status', 'conflict').count('* as conflicts'),
      query.clone().where('priority', 'critical').count('* as critical')
    ])

    return {
      total: total[0]?.total || 0,
      pending: pending[0]?.pending || 0,
      processing: processing[0]?.processing || 0,
      completed: completed[0]?.completed || 0,
      failed: failed[0]?.failed || 0,
      conflicts: conflicts[0]?.conflicts || 0,
      critical: critical[0]?.critical || 0,
      successRate: total[0]?.total ? (completed[0]?.completed / total[0]?.total) * 100 : 0
    }
  }

  /**
   * Clean up old completed sync data
   */
  public static async cleanupOld(days: number = 30) {
    const cutoffDate = DateTime.now().minus({ days })
    return await this.query()
      .where('status', 'completed')
      .where('completedAt', '<', cutoffDate)
      .delete()
  }

  /**
   * Clean up failed sync data past max retries
   */
  public static async cleanupFailed() {
    return await this.query()
      .where('status', 'failed')
      .where('retryCount', '>=', 'maxRetries')
      .delete()
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
      ageInMinutes: this.ageInMinutes,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    }
  }
}