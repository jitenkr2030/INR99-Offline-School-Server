import { Service } from '@adonisjs/core'
import HybridSyncData from '#models/hybrid_sync_data'
import HybridUser from '#models/hybrid_user'
import HybridSession from '#models/hybrid_session'
import Event from '@adonisjs/core/services/event'
import logger from '@adonisjs/core/services/logger'

export interface SyncPayload {
  userId: number
  dataType: string
  direction: 'online_to_offline' | 'offline_to_online' | 'bidirectional'
  sourcePlatform: string
  targetPlatform: string
  entityId: string
  entityType: string
  action: string
  data: any
  previousData?: any
  priority?: 'low' | 'medium' | 'high' | 'critical'
  metadata?: any
}

export interface SyncResult {
  success: boolean
  data?: any
  error?: string
  conflict?: any
}

@Service()
export class HybridSyncService {
  private isProcessing: boolean = false
  private processingQueue: any[] = []

  /**
   * Queue data for synchronization
   */
  public async queueSync(payload: SyncPayload): Promise<HybridSyncData> {
    try {
      // Check for existing pending sync for same entity
      const existingSync = await HybridSyncData.query()
        .where('userId', payload.userId)
        .where('entityId', payload.entityId)
        .where('entityType', payload.entityType)
        .where('status', 'pending')
        .first()

      if (existingSync) {
        // Update existing sync with new data
        existingSync.data = payload.data
        existingSync.previousData = payload.previousData || existingSync.data
        existingSync.updatedAt = new Date()
        await existingSync.save()
        return existingSync
      }

      // Create new sync record
      const syncData = await HybridSyncData.create({
        userId: payload.userId,
        dataType: payload.dataType,
        direction: payload.direction,
        sourcePlatform: payload.sourcePlatform,
        targetPlatform: payload.targetPlatform,
        entityId: payload.entityId,
        entityType: payload.entityType,
        action: payload.action,
        data: payload.data,
        previousData: payload.previousData,
        status: 'pending',
        priority: payload.priority || 'medium',
        retryCount: 0,
        maxRetries: this.getMaxRetries(payload.dataType),
        version: 1,
        metadata: {
          ...payload.metadata,
          queuedAt: new Date().toISOString(),
          queueId: this.generateQueueId()
        }
      })

      // Calculate and store checksum
      await syncData.updateChecksum()

      // Trigger sync processing
      this.processSyncQueue()

      return syncData

    } catch (error) {
      logger.error('Error queuing sync data:', error)
      throw error
    }
  }

  /**
   * Process the sync queue
   */
  public async processSyncQueue(): Promise<void> {
    if (this.isProcessing) {
      return
    }

    this.isProcessing = true

    try {
      // Get pending sync data ordered by priority
      const pendingSync = await HybridSyncData.getPendingByType('progress', 20)
      
      for (const syncData of pendingSync) {
        try {
          await this.processSyncData(syncData)
        } catch (error) {
          logger.error(`Error processing sync data ${syncData.id}:`, error)
          await syncData.markAsFailed(error.message, { stack: error.stack })
        }
      }

      // Process retryable failed sync data
      const retryableFailed = await HybridSyncData.getRetryableFailed(10)
      for (const syncData of retryableFailed) {
        try {
          await syncData.markAsRetrying()
          await this.processSyncData(syncData)
        } catch (error) {
          logger.error(`Error retrying sync data ${syncData.id}:`, error)
          await syncData.markAsFailed(error.message, { stack: error.stack })
        }
      }

    } catch (error) {
      logger.error('Error processing sync queue:', error)
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Process individual sync data
   */
  private async processSyncData(syncData: HybridSyncData): Promise<void> {
    await syncData.markAsProcessing()

    try {
      // Verify data integrity
      if (!syncData.verifyIntegrity()) {
        throw new Error('Data integrity check failed')
      }

      // Route to appropriate handler based on data type
      let result: SyncResult
      switch (syncData.dataType) {
        case 'progress':
          result = await this.syncProgressData(syncData)
          break
        case 'assignment':
          result = await this.syncAssignmentData(syncData)
          break
        case 'user':
          result = await this.syncUserData(syncData)
          break
        case 'course':
          result = await this.syncCourseData(syncData)
          break
        case 'grade':
          result = await this.syncGradeData(syncData)
          break
        default:
          result = await this.syncGenericData(syncData)
          break
      }

      if (result.success) {
        await syncData.markAsCompleted()
        
        // Emit success event
        Event.emit('sync:completed', {
          syncId: syncData.id,
          dataType: syncData.dataType,
          userId: syncData.userId,
          result: result.data
        })

      } else if (result.conflict) {
        await syncData.markAsConflict(result.conflict)
        
        // Emit conflict event
        Event.emit('sync:conflict', {
          syncId: syncData.id,
          dataType: syncData.dataType,
          userId: syncData.userId,
          conflict: result.conflict
        })

      } else {
        throw new Error(result.error || 'Sync failed')
      }

    } catch (error) {
      await syncData.markAsFailed(error.message)
      
      // Emit error event
      Event.emit('sync:failed', {
        syncId: syncData.id,
        dataType: syncData.dataType,
        userId: syncData.userId,
        error: error.message
      })

      throw error
    }
  }

  /**
   * Sync progress data
   */
  private async syncProgressData(syncData: HybridSyncData): Promise<SyncResult> {
    const progressData = syncData.data
    
    // Check for existing progress in target platform
    const existingProgress = await this.findExistingProgress(
      syncData.userId,
      progressData.courseId,
      progressData.lessonId
    )

    if (existingProgress) {
      // Handle conflict resolution
      if (this.hasProgressConflict(existingProgress, progressData)) {
        return {
          success: false,
          conflict: {
            type: 'progress_conflict',
            existing: existingProgress,
            incoming: progressData,
            resolution: 'manual'
          }
        }
      }

      // Merge progress data
      const mergedProgress = this.mergeProgressData(existingProgress, progressData)
      
      // Update in target platform
      await this.updateProgressInTarget(syncData.targetPlatform, mergedProgress)
      
      return {
        success: true,
        data: mergedProgress
      }
    } else {
      // Create new progress record
      await this.createProgressInTarget(syncData.targetPlatform, progressData)
      
      return {
        success: true,
        data: progressData
      }
    }
  }

  /**
   * Sync assignment data
   */
  private async syncAssignmentData(syncData: HybridSyncData): Promise<SyncResult> {
    const assignmentData = syncData.data
    
    // Check for existing assignment
    const existingAssignment = await this.findExistingAssignment(
      syncData.userId,
      assignmentData.id
    )

    if (existingAssignment) {
      // Handle conflict resolution
      if (this.hasAssignmentConflict(existingAssignment, assignmentData)) {
        return {
          success: false,
          conflict: {
            type: 'assignment_conflict',
            existing: existingAssignment,
            incoming: assignmentData,
            resolution: 'manual'
          }
        }
      }

      // Merge assignment data
      const mergedAssignment = this.mergeAssignmentData(existingAssignment, assignmentData)
      
      // Update in target platform
      await this.updateAssignmentInTarget(syncData.targetPlatform, mergedAssignment)
      
      return {
        success: true,
        data: mergedAssignment
      }
    } else {
      // Create new assignment
      await this.createAssignmentInTarget(syncData.targetPlatform, assignmentData)
      
      return {
        success: true,
        data: assignmentData
      }
    }
  }

  /**
   * Sync user data
   */
  private async syncUserData(syncData: HybridSyncData): Promise<SyncResult> {
    const userData = syncData.data
    
    // Find user in target platform
    const targetUser = await HybridUser.query()
      .where('ssoId', userData.ssoId)
      .orWhere('email', userData.email)
      .first()

    if (targetUser) {
      // Merge user data
      const mergedUserData = this.mergeUserData(targetUser, userData)
      
      // Update user in target platform
      targetUser.merge(mergedUserData)
      await targetUser.save()
      
      return {
        success: true,
        data: targetUser.serializeForAPI()
      }
    } else {
      // Create new user in target platform
      const newUser = await HybridUser.create({
        ...userData,
        platform: syncData.targetPlatform,
        isActive: true
      })
      
      return {
        success: true,
        data: newUser.serializeForAPI()
      }
    }
  }

  /**
   * Sync course data
   */
  private async syncCourseData(syncData: HybridSyncData): Promise<SyncResult> {
    const courseData = syncData.data
    
    // Implementation would depend on your course model
    // For now, return success
    return {
      success: true,
      data: courseData
    }
  }

  /**
   * Sync grade data
   */
  private async syncGradeData(syncData: HybridSyncData): Promise<SyncResult> {
    const gradeData = syncData.data
    
    // Implementation would depend on your grade model
    // For now, return success
    return {
      success: true,
      data: gradeData
    }
  }

  /**
   * Sync generic data
   */
  private async syncGenericData(syncData: HybridSyncData): Promise<SyncResult> {
    // Handle generic data synchronization
    return {
      success: true,
      data: syncData.data
    }
  }

  /**
   * Find existing progress
   */
  private async findExistingProgress(userId: number, courseId: string, lessonId?: string) {
    // Implementation would query your progress model
    // For now, return null
    return null
  }

  /**
   * Find existing assignment
   */
  private async findExistingAssignment(userId: number, assignmentId: string) {
    // Implementation would query your assignment model
    // For now, return null
    return null
  }

  /**
   * Check for progress conflict
   */
  private hasProgressConflict(existing: any, incoming: any): boolean {
    // Compare timestamps to detect conflicts
    const existingTime = new Date(existing.updatedAt || existing.createdAt)
    const incomingTime = new Date(incoming.updatedAt || incoming.createdAt)
    
    // If both were updated around the same time, there might be a conflict
    return Math.abs(existingTime.getTime() - incomingTime.getTime()) < 5000 // 5 seconds
  }

  /**
   * Check for assignment conflict
   */
  private hasAssignmentConflict(existing: any, incoming: any): boolean {
    // Similar conflict detection for assignments
    const existingTime = new Date(existing.updatedAt || existing.createdAt)
    const incomingTime = new Date(incoming.updatedAt || incoming.createdAt)
    
    return Math.abs(existingTime.getTime() - incomingTime.getTime()) < 5000
  }

  /**
   * Merge progress data
   */
  private mergeProgressData(existing: any, incoming: any): any {
    return {
      ...existing,
      ...incoming,
      // Use the maximum progress
      progress: Math.max(existing.progress || 0, incoming.progress || 0),
      // Use the maximum time spent
      timeSpent: (existing.timeSpent || 0) + (incoming.timeSpent || 0),
      // Use the most recent completion date
      completedAt: incoming.completedAt || existing.completedAt,
      // Merge notes
      notes: [...(existing.notes || []), ...(incoming.notes || [])],
      // Merge scores
      scores: [...(existing.scores || []), ...(incoming.scores || [])],
      // Update timestamps
      updatedAt: new Date()
    }
  }

  /**
   * Merge assignment data
   */
  private mergeAssignmentData(existing: any, incoming: any): any {
    return {
      ...existing,
      ...incoming,
      // Use the most recent submission
      submittedAt: incoming.submittedAt || existing.submittedAt,
      // Use the most recent grade if available
      grade: incoming.grade || existing.grade,
      // Merge feedback
      feedback: incoming.feedback || existing.feedback,
      // Update timestamps
      updatedAt: new Date()
    }
  }

  /**
   * Merge user data
   */
  private mergeUserData(existing: HybridUser, incoming: any): any {
    return {
      firstName: incoming.firstName || existing.firstName,
      lastName: incoming.lastName || existing.lastName,
      phoneNumber: incoming.phoneNumber || existing.phoneNumber,
      avatar: incoming.avatar || existing.avatar,
      bio: incoming.bio || existing.bio,
      preferences: {
        ...existing.preferences,
        ...incoming.preferences
      },
      metadata: {
        ...existing.metadata,
        ...incoming.metadata
      },
      updatedAt: new Date()
    }
  }

  /**
   * Update progress in target platform
   */
  private async updateProgressInTarget(platform: string, progressData: any): Promise<void> {
    // Implementation would call the target platform's API
    // For now, just log the action
    logger.info(`Updating progress in ${platform}:`, progressData)
  }

  /**
   * Create progress in target platform
   */
  private async createProgressInTarget(platform: string, progressData: any): Promise<void> {
    // Implementation would call the target platform's API
    logger.info(`Creating progress in ${platform}:`, progressData)
  }

  /**
   * Update assignment in target platform
   */
  private async updateAssignmentInTarget(platform: string, assignmentData: any): Promise<void> {
    // Implementation would call the target platform's API
    logger.info(`Updating assignment in ${platform}:`, assignmentData)
  }

  /**
   * Create assignment in target platform
   */
  private async createAssignmentInTarget(platform: string, assignmentData: any): Promise<void> {
    // Implementation would call the target platform's API
    logger.info(`Creating assignment in ${platform}:`, assignmentData)
  }

  /**
   * Get maximum retries for data type
   */
  private getMaxRetries(dataType: string): number {
    const retryConfig = {
      'progress': 3,
      'assignment': 5,
      'user': 3,
      'course': 2,
      'grade': 2,
      'content': 1
    }
    
    return retryConfig[dataType] || 3
  }

  /**
   * Generate unique queue ID
   */
  private generateQueueId(): string {
    return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get sync statistics
   */
  public async getStats(userId?: number) {
    return await HybridSyncData.getStats(userId)
  }

  /**
   * Force sync of specific data
   */
  public async forceSync(payload: SyncPayload): Promise<SyncResult> {
    const syncData = await this.queueSync(payload)
    
    try {
      await this.processSyncData(syncData)
      
      return {
        success: true,
        data: syncData.data
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Resolve sync conflict
   */
  public async resolveConflict(syncId: number, resolution: any, resolvedBy: number): Promise<void> {
    const syncData = await HybridSyncData.find(syncId)
    if (!syncData) {
      throw new Error('Sync data not found')
    }

    await syncData.resolveConflict(resolvedBy, resolution)
    
    // Apply resolution to target platform
    await this.applyConflictResolution(syncData, resolution)
    
    // Emit resolution event
    Event.emit('sync:resolved', {
      syncId: syncData.id,
      dataType: syncData.dataType,
      userId: syncData.userId,
      resolvedBy,
      resolution
    })
  }

  /**
   * Apply conflict resolution to target platform
   */
  private async applyConflictResolution(syncData: HybridSyncData, resolution: any): Promise<void> {
    // Implementation would apply the resolved data to the target platform
    logger.info(`Applying conflict resolution for sync ${syncData.id}:`, resolution)
  }

  /**
   * Clean up old sync data
   */
  public async cleanup(): Promise<void> {
    await HybridSyncData.cleanupOld(30)
    await HybridSyncData.cleanupFailed()
  }
}