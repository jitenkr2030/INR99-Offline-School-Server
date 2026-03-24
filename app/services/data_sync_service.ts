import { inject } from '@adonisjs/core'
import { DateTime } from 'luxon'
import { Database } from '@adonisjs/lucid/database'
import { fetch } from 'undici'

import { UserProfile } from '../interfaces/auth.js'

/**
 * Data Synchronization Service
 * Handles synchronization of data between INR99 Academy and Offline Server
 */
export interface SyncData {
  id: string
  type: 'user' | 'progress' | 'content' | 'session' | 'assignment'
  userId: string
  platform: 'online' | 'offline'
  operation: 'create' | 'update' | 'delete'
  data: any
  timestamp: DateTime
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  errorMessage?: string
  retryCount: number
}

export interface SyncConfig {
  online: {
    apiUrl: string
    apiKey: string
    endpoints: {
      users: string
      progress: string
      content: string
      sessions: string
    }
  }
  offline: {
    apiUrl: string
    secretKey: string
    endpoints: {
      users: string
      progress: string
      content: string
      sessions: string
    }
  }
  sync: {
    batchSize: number
    retryAttempts: number
    retryDelay: number
    conflictResolution: 'online_wins' | 'offline_wins' | 'manual'
    autoSync: boolean
    syncInterval: number
  }
}

/**
 * Conflict Resolution Strategy
 */
export interface ConflictResolution {
  strategy: 'online_wins' | 'offline_wins' | 'manual'
  timestamp: DateTime
  data: any
  requiresManualIntervention: boolean
}

/**
 * Synchronization Result
 */
export interface SyncResult {
  success: boolean
  processed: number
  failed: number
  conflicts: number
  errors: string[]
  duration: number
}

@inject()
export class DataSyncService {
  constructor(
    private db: Database
  ) {}

  /**
   * Get synchronization configuration
   */
  private getConfig(): SyncConfig {
    return {
      online: {
        apiUrl: process.env.INR99_ACADEMY_API_URL || 'https://api.inr99.academy',
        apiKey: process.env.INR99_ACADEMY_API_KEY || 'api-key',
        endpoints: {
          users: '/api/sync/users',
          progress: '/api/sync/progress',
          content: '/api/sync/content',
          sessions: '/api/sync/sessions'
        }
      },
      offline: {
        apiUrl: process.env.INR99_OFFLINE_API_URL || 'http://localhost:8080',
        secretKey: process.env.INR99_OFFLINE_SECRET_KEY || 'offline-secret-key',
        endpoints: {
          users: '/api/sync/users',
          progress: '/api/sync/progress',
          content: '/api/sync/content',
          sessions: '/api/sync/sessions'
        }
      },
      sync: {
        batchSize: 100,
        retryAttempts: 3,
        retryDelay: 5000,
        conflictResolution: 'online_wins',
        autoSync: true,
        syncInterval: 5 * 60 * 1000 // 5 minutes
      }
    }
  }

  /**
   * Queue data for synchronization
   */
  async queueSyncData(syncData: Omit<SyncData, 'id' | 'status' | 'retryCount'>): Promise<string> {
    const id = await this.generateId()
    
    await this.db.table('sync_queue').insert({
      id,
      type: syncData.type,
      user_id: syncData.userId,
      platform: syncData.platform,
      operation: syncData.operation,
      data: JSON.stringify(syncData.data),
      timestamp: syncData.timestamp.toISO(),
      status: 'pending',
      retry_count: 0,
      created_at: DateTime.now().toISO(),
      updated_at: DateTime.now().toISO()
    })

    return id
  }

  /**
   * Process synchronization queue
   */
  async processSyncQueue(): Promise<SyncResult> {
    const config = this.getConfig()
    const startTime = DateTime.now()
    
    let processed = 0
    let failed = 0
    let conflicts = 0
    const errors: string[] = []

    try {
      // Get pending sync items
      const pendingItems = await this.db
        .from('sync_queue')
        .where('status', 'pending')
        .orderBy('timestamp', 'asc')
        .limit(config.sync.batchSize)

      for (const item of pendingItems) {
        try {
          // Mark as in progress
          await this.updateSyncStatus(item.id, 'in_progress')

          // Process based on type and platform
          const success = await this.processSyncItem(item)
          
          if (success) {
            await this.updateSyncStatus(item.id, 'completed')
            processed++
          } else {
            failed++
            errors.push(`Failed to sync ${item.type} ${item.id}`)
          }

        } catch (error) {
          console.error(`Error processing sync item ${item.id}:`, error)
          
          // Update retry count
          const retryCount = item.retry_count + 1
          
          if (retryCount >= config.sync.retryAttempts) {
            await this.updateSyncStatus(item.id, 'failed', error.message)
            failed++
            errors.push(`Failed to sync ${item.type} ${item.id}: ${error.message}`)
          } else {
            // Re-queue for retry
            await this.updateSyncStatus(item.id, 'pending', undefined, retryCount)
          }
        }
      }

    } catch (error) {
      console.error('Error processing sync queue:', error)
      errors.push(`Queue processing error: ${error.message}`)
    }

    const duration = DateTime.now().diff(startTime, 'milliseconds').milliseconds

    return {
      success: failed === 0,
      processed,
      failed,
      conflicts,
      errors,
      duration
    }
  }

  /**
   * Process individual sync item
   */
  private async processSyncItem(item: any): Promise<boolean> {
    const config = this.getConfig()
    const targetPlatform = item.platform === 'online' ? 'offline' : 'online'
    
    try {
      switch (item.type) {
        case 'user':
          return await this.syncUser(item, targetPlatform)
        case 'progress':
          return await this.syncProgress(item, targetPlatform)
        case 'content':
          return await this.syncContent(item, targetPlatform)
        case 'session':
          return await this.syncSession(item, targetPlatform)
        case 'assignment':
          return await this.syncAssignment(item, targetPlatform)
        default:
          console.warn(`Unknown sync type: ${item.type}`)
          return false
      }
    } catch (error) {
      console.error(`Error processing sync item ${item.id}:`, error)
      return false
    }
  }

  /**
   * Sync user data
   */
  private async syncUser(item: any, targetPlatform: 'online' | 'offline'): Promise<boolean> {
    const config = this.getConfig()
    const userData = JSON.parse(item.data)
    
    try {
      if (targetPlatform === 'online') {
        // Sync to INR99 Academy
        const response = await fetch(`${config.online.apiUrl}${config.online.endpoints.users}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.online.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            operation: item.operation,
            user: userData,
            sourcePlatform: 'offline'
          })
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const result = await response.json()
        return result.success

      } else {
        // Sync to Offline Server (local)
        return await this.syncUserOffline(item.operation, userData)
      }

    } catch (error) {
      console.error(`Error syncing user to ${targetPlatform}:`, error)
      return false
    }
  }

  /**
   * Sync user data to offline server
   */
  private async syncUserOffline(operation: string, userData: any): Promise<boolean> {
    try {
      switch (operation) {
        case 'create':
          await this.db.table('users').insert({
            id: userData.id,
            email: userData.email,
            first_name: userData.firstName,
            last_name: userData.lastName,
            role: userData.role,
            school_id: userData.schoolId,
            class_id: userData.classId,
            preferences: userData.preferences,
            permissions: userData.permissions,
            is_active: userData.isActive,
            created_at: DateTime.now().toISO(),
            updated_at: DateTime.now().toISO()
          })
          break

        case 'update':
          await this.db
            .from('users')
            .where('id', userData.id)
            .update({
              email: userData.email,
              first_name: userData.firstName,
              last_name: userData.lastName,
              role: userData.role,
              school_id: userData.schoolId,
              class_id: userData.classId,
              preferences: userData.preferences,
              permissions: userData.permissions,
              is_active: userData.isActive,
              updated_at: DateTime.now().toISO()
            })
          break

        case 'delete':
          await this.db
            .from('users')
            .where('id', userData.id)
            .delete()
          break

        default:
          return false
      }

      return true

    } catch (error) {
      console.error('Error syncing user offline:', error)
      return false
    }
  }

  /**
   * Sync progress data
   */
  private async syncProgress(item: any, targetPlatform: 'online' | 'offline'): Promise<boolean> {
    const config = this.getConfig()
    const progressData = JSON.parse(item.data)
    
    try {
      if (targetPlatform === 'online') {
        // Sync to INR99 Academy
        const response = await fetch(`${config.online.apiUrl}${config.online.endpoints.progress}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.online.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            operation: item.operation,
            progress: progressData,
            sourcePlatform: 'offline'
          })
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const result = await response.json()
        return result.success

      } else {
        // Sync to Offline Server (local)
        return await this.syncProgressOffline(item.operation, progressData)
      }

    } catch (error) {
      console.error(`Error syncing progress to ${targetPlatform}:`, error)
      return false
    }
  }

  /**
   * Sync progress data to offline server
   */
  private async syncProgressOffline(operation: string, progressData: any): Promise<boolean> {
    try {
      switch (operation) {
        case 'create':
        case 'update':
          await this.db.table('student_progress').upsert({
            id: progressData.id,
            student_id: progressData.studentId,
            course_id: progressData.courseId,
            lesson_id: progressData.lessonId,
            progress: progressData.progress,
            time_spent: progressData.timeSpent,
            completion_date: progressData.completionDate,
            quiz_scores: JSON.stringify(progressData.quizScores),
            notes: JSON.stringify(progressData.notes),
            last_synced: DateTime.now().toISO(),
            created_at: DateTime.now().toISO(),
            updated_at: DateTime.now().toISO()
          }, ['id'])
          break

        case 'delete':
          await this.db
            .from('student_progress')
            .where('id', progressData.id)
            .delete()
          break

        default:
          return false
      }

      return true

    } catch (error) {
      console.error('Error syncing progress offline:', error)
      return false
    }
  }

  /**
   * Sync content data
   */
  private async syncContent(item: any, targetPlatform: 'online' | 'offline'): Promise<boolean> {
    const config = this.getConfig()
    const contentData = JSON.parse(item.data)
    
    try {
      if (targetPlatform === 'online') {
        // Sync to INR99 Academy
        const response = await fetch(`${config.online.apiUrl}${config.online.endpoints.content}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.online.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            operation: item.operation,
            content: contentData,
            sourcePlatform: 'offline'
          })
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const result = await response.json()
        return result.success

      } else {
        // Sync to Offline Server (local)
        return await this.syncContentOffline(item.operation, contentData)
      }

    } catch (error) {
      console.error(`Error syncing content to ${targetPlatform}:`, error)
      return false
    }
  }

  /**
   * Sync content data to offline server
   */
  private async syncContentOffline(operation: string, contentData: any): Promise<boolean> {
    try {
      switch (operation) {
        case 'create':
        case 'update':
          await this.db.table('content_cache').upsert({
            id: contentData.id,
            type: contentData.type,
            title: contentData.title,
            description: contentData.description,
            url: contentData.url,
            file_path: contentData.filePath,
            file_size: contentData.fileSize,
            mime_type: contentData.mimeType,
            metadata: JSON.stringify(contentData.metadata),
            cached_at: DateTime.now().toISO(),
            expires_at: contentData.expiresAt,
            created_at: DateTime.now().toISO(),
            updated_at: DateTime.now().toISO()
          }, ['id'])
          break

        case 'delete':
          await this.db
            .from('content_cache')
            .where('id', contentData.id)
            .delete()
          break

        default:
          return false
      }

      return true

    } catch (error) {
      console.error('Error syncing content offline:', error)
      return false
    }
  }

  /**
   * Sync session data
   */
  private async syncSession(item: any, targetPlatform: 'online' | 'offline'): Promise<boolean> {
    const config = this.getConfig()
    const sessionData = JSON.parse(item.data)
    
    try {
      if (targetPlatform === 'online') {
        // Sync to INR99 Academy
        const response = await fetch(`${config.online.apiUrl}${config.online.endpoints.sessions}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.online.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            operation: item.operation,
            session: sessionData,
            sourcePlatform: 'offline'
          })
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const result = await response.json()
        return result.success

      } else {
        // Sync to Offline Server (local)
        return await this.syncSessionOffline(item.operation, sessionData)
      }

    } catch (error) {
      console.error(`Error syncing session to ${targetPlatform}:`, error)
      return false
    }
  }

  /**
   * Sync session data to offline server
   */
  private async syncSessionOffline(operation: string, sessionData: any): Promise<boolean> {
    try {
      switch (operation) {
        case 'create':
        case 'update':
          await this.db.table('user_sessions').upsert({
            id: sessionData.sessionId,
            user_id: sessionData.userId,
            user_email: sessionData.userEmail,
            user_role: sessionData.userRole,
            platform: sessionData.platform,
            login_time: sessionData.loginTime,
            last_activity: sessionData.lastActivity,
            expires_at: sessionData.expiresAt,
            ip_address: sessionData.ipAddress,
            user_agent: sessionData.userAgent,
            is_active: sessionData.isActive,
            created_at: DateTime.now().toISO(),
            updated_at: DateTime.now().toISO()
          }, ['id'])
          break

        case 'delete':
          await this.db
            .from('user_sessions')
            .where('id', sessionData.sessionId)
            .delete()
          break

        default:
          return false
      }

      return true

    } catch (error) {
      console.error('Error syncing session offline:', error)
      return false
    }
  }

  /**
   * Sync assignment data
   */
  private async syncAssignment(item: any, targetPlatform: 'online' | 'offline'): Promise<boolean> {
    const config = this.getConfig()
    const assignmentData = JSON.parse(item.data)
    
    try {
      if (targetPlatform === 'online') {
        // Sync to INR99 Academy
        const response = await fetch(`${config.online.apiUrl}/api/sync/assignments`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.online.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            operation: item.operation,
            assignment: assignmentData,
            sourcePlatform: 'offline'
          })
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const result = await response.json()
        return result.success

      } else {
        // Sync to Offline Server (local)
        return await this.syncAssignmentOffline(item.operation, assignmentData)
      }

    } catch (error) {
      console.error(`Error syncing assignment to ${targetPlatform}:`, error)
      return false
    }
  }

  /**
   * Sync assignment data to offline server
   */
  private async syncAssignmentOffline(operation: string, assignmentData: any): Promise<boolean> {
    try {
      switch (operation) {
        case 'create':
        case 'update':
          await this.db.table('assignments').upsert({
            id: assignmentData.id,
            title: assignmentData.title,
            description: assignmentData.description,
            course_id: assignmentData.courseId,
            teacher_id: assignmentData.teacherId,
            due_date: assignmentData.dueDate,
            max_score: assignmentData.maxScore,
            instructions: assignmentData.instructions,
            attachments: JSON.stringify(assignmentData.attachments),
            created_at: DateTime.now().toISO(),
            updated_at: DateTime.now().toISO()
          }, ['id'])
          break

        case 'delete':
          await this.db
            .from('assignments')
            .where('id', assignmentData.id)
            .delete()
          break

        default:
          return false
      }

      return true

    } catch (error) {
      console.error('Error syncing assignment offline:', error)
      return false
    }
  }

  /**
   * Update sync status
   */
  private async updateSyncStatus(
    id: string, 
    status: 'pending' | 'in_progress' | 'completed' | 'failed', 
    errorMessage?: string, 
    retryCount?: number
  ): Promise<void> {
    const updateData: any = {
      status,
      updated_at: DateTime.now().toISO()
    }

    if (errorMessage) {
      updateData.error_message = errorMessage
    }

    if (retryCount !== undefined) {
      updateData.retry_count = retryCount
    }

    await this.db
      .from('sync_queue')
      .where('id', id)
      .update(updateData)
  }

  /**
   * Generate unique ID
   */
  private async generateId(): Promise<string> {
    const { v4: uuidv4 } = await import('uuid')
    return uuidv4()
  }

  /**
   * Get sync statistics
   */
  async getSyncStatistics(): Promise<any> {
    try {
      const stats = await this.db
        .from('sync_queue')
        .select('status')
        .count('* as count')

      const total = await this.db
        .from('sync_queue')
        .count('* as total')

      const lastSync = await this.db
        .from('sync_queue')
        .where('status', 'completed')
        .orderBy('updated_at', 'desc')
        .first()

      return {
        total: total[0].total,
        byStatus: stats.reduce((acc: any, row: any) => {
          acc[row.status] = row.count
          return acc
        }, {}),
        lastSyncTime: lastSync ? lastSync.updated_at : null,
        pendingCount: stats.find((s: any) => s.status === 'pending')?.count || 0
      }

    } catch (error) {
      console.error('Error getting sync statistics:', error)
      return {
        total: 0,
        byStatus: {},
        lastSyncTime: null,
        pendingCount: 0
      }
    }
  }

  /**
   * Force sync of specific data type
   */
  async forceSync(type: string, userId?: string): Promise<SyncResult> {
    const config = this.getConfig()
    
    try {
      let query = this.db.from('sync_queue').where('type', type)
      
      if (userId) {
        query = query.where('user_id', userId)
      }

      const items = await query
      
      let processed = 0
      let failed = 0
      let conflicts = 0
      const errors: string[] = []

      for (const item of items) {
        try {
          await this.updateSyncStatus(item.id, 'in_progress')
          const success = await this.processSyncItem(item)
          
          if (success) {
            await this.updateSyncStatus(item.id, 'completed')
            processed++
          } else {
            failed++
            errors.push(`Failed to force sync ${item.type} ${item.id}`)
          }

        } catch (error) {
          console.error(`Error force syncing ${item.id}:`, error)
          await this.updateSyncStatus(item.id, 'failed', error.message)
          failed++
          errors.push(`Force sync error for ${item.id}: ${error.message}`)
        }
      }

      return {
        success: failed === 0,
        processed,
        failed,
        conflicts,
        errors,
        duration: 0 // TODO: Implement timing
      }

    } catch (error) {
      console.error('Error in force sync:', error)
      return {
        success: false,
        processed: 0,
        failed: 0,
        conflicts: 0,
        errors: [error.message],
        duration: 0
      }
    }
  }

  /**
   * Resolve sync conflicts
   */
  async resolveConflict(syncId: string, resolution: 'online' | 'offline' | 'manual'): Promise<boolean> {
    try {
      const item = await this.db
        .from('sync_queue')
        .where('id', syncId)
        .first()

      if (!item) {
        return false
      }

      // Apply conflict resolution
      const syncData = JSON.parse(item.data)
      
      if (resolution === 'online') {
        // Keep online version, update offline
        await this.syncUserOffline('update', syncData)
      } else if (resolution === 'offline') {
        // Keep offline version, update online
        await this.syncUserOnline('update', syncData)
      } else {
        // Manual resolution - mark for manual review
        await this.db
          .from('sync_queue')
          .where('id', syncId)
          .update({
            status: 'manual_review',
            updated_at: DateTime.now().toISO()
          })
      }

      // Mark as resolved
      await this.updateSyncStatus(syncId, 'completed')
      
      return true

    } catch (error) {
      console.error('Error resolving conflict:', error)
      return false
    }
  }

  /**
   * Sync user to online platform
   */
  private async syncUserOnline(operation: string, userData: any): Promise<boolean> {
    const config = this.getConfig()
    
    try {
      const response = await fetch(`${config.online.apiUrl}/api/sync/users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.online.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          operation,
          user: userData,
          sourcePlatform: 'offline'
        })
      })

      return response.ok

    } catch (error) {
      console.error('Error syncing user to online platform:', error)
      return false
    }
  }
}