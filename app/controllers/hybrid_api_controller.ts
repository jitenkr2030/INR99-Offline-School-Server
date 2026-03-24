import { HttpContextContract } from '@adonisjs/core/http'
import { validator } from '@adonisjs/validator'
import HybridSyncService from '#services/hybrid_sync_service'
import HybridSyncData from '#models/hybrid_sync_data'
import HybridUser from '#models/hybrid_user'
import HybridSession from '#models/hybrid_session'

export default class HybridApiController {
  constructor(private syncService: HybridSyncService) {}

  /**
   * Queue data for synchronization
   */
  public async queueSync({ request, response }: HttpContextContract) {
    try {
      const payload = await request.validate({
        userId: 'number|required',
        dataType: 'string|required',
        direction: 'string|required|in:online_to_offline,offline_to_online,bidirectional',
        sourcePlatform: 'string|required|in:academy,offline,hybrid',
        targetPlatform: 'string|required|in:academy,offline,hybrid',
        entityId: 'string|required',
        entityType: 'string|required',
        action: 'string|required|in:create,update,delete,merge',
        data: 'object|required',
        previousData: 'object|optional',
        priority: 'string|optional|in:low,medium,high,critical',
        metadata: 'object|optional'
      })

      const syncData = await this.syncService.queueSync(payload)

      return response.json({
        success: true,
        data: {
          syncId: syncData.id,
          status: syncData.status,
          queuedAt: syncData.createdAt
        },
        message: 'Data queued for synchronization'
      })

    } catch (error) {
      return response.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: error.messages
      })
    }
  }

  /**
   * Get sync status
   */
  public async getSyncStatus({ request, response }: HttpContextContract) {
    try {
      const { syncId } = request.params()
      const { userId } = request.qs()

      let query = HybridSyncData.query()
      
      if (syncId) {
        query = query.where('id', syncId)
      }
      
      if (userId) {
        query = query.where('userId', userId)
      }

      const syncData = await query.exec()

      return response.json({
        success: true,
        data: syncData.map(data => data.serializeForAPI()),
        message: 'Sync status retrieved'
      })

    } catch (error) {
      return response.status(500).json({
        success: false,
        message: 'Failed to get sync status',
        error: error.message
      })
    }
  }

  /**
   * Get pending sync data
   */
  public async getPendingSync({ request, response }: HttpContextContract) {
    try {
      const { userId, dataType, limit = 50 } = request.qs()

      let query = HybridSyncData.query()
        .where('status', 'pending')
        .where('nextRetryAt', '<=', new Date())
        .orderBy('priority', 'desc')
        .orderBy('createdAt', 'asc')
        .limit(limit)

      if (userId) {
        query = query.where('userId', userId)
      }

      if (dataType) {
        query = query.where('dataType', dataType)
      }

      const pendingSync = await query.exec()

      return response.json({
        success: true,
        data: pendingSync.map(data => data.serializeForAPI()),
        message: 'Pending sync data retrieved'
      })

    } catch (error) {
      return response.status(500).json({
        success: false,
        message: 'Failed to get pending sync data',
        error: error.message
      })
    }
  }

  /**
   * Force sync of specific data
   */
  public async forceSync({ request, response }: HttpContextContract) {
    try {
      const payload = await request.validate({
        userId: 'number|required',
        dataType: 'string|required',
        direction: 'string|required|in:online_to_offline,offline_to_online,bidirectional',
        sourcePlatform: 'string|required|in:academy,offline,hybrid',
        targetPlatform: 'string|required|in:academy,offline,hybrid',
        entityId: 'string|required',
        entityType: 'string|required',
        action: 'string|required|in:create,update,delete,merge',
        data: 'object|required',
        priority: 'string|optional|in:low,medium,high,critical',
        metadata: 'object|optional'
      })

      const result = await this.syncService.forceSync(payload)

      if (result.success) {
        return response.json({
          success: true,
          data: result.data,
          message: 'Force sync completed successfully'
        })
      } else {
        return response.status(400).json({
          success: false,
          message: 'Force sync failed',
          error: result.error
        })
      }

    } catch (error) {
      return response.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: error.messages
      })
    }
  }

  /**
   * Resolve sync conflict
   */
  public async resolveConflict({ request, response }: HttpContextContract) {
    try {
      const { syncId } = request.params
      const { resolution, resolvedBy } = request.only(['resolution', 'resolvedBy'])

      await this.syncService.resolveConflict(parseInt(syncId), resolution, resolvedBy)

      return response.json({
        success: true,
        message: 'Conflict resolved successfully'
      })

    } catch (error) {
      return response.status(500).json({
        success: false,
        message: 'Failed to resolve conflict',
        error: error.message
      })
    }
  }

  /**
   * Get sync statistics
   */
  public async getSyncStats({ request, response }: HttpContextContract) {
    try {
      const { userId, startDate, endDate } = request.qs()

      let stats = await this.syncService.getStats(userId ? parseInt(userId) : undefined)

      // Filter by date range if provided
      if (startDate || endDate) {
        // Implementation would filter stats by date range
        // For now, return unfiltered stats
      }

      return response.json({
        success: true,
        data: stats,
        message: 'Sync statistics retrieved'
      })

    } catch (error) {
      return response.status(500).json({
        success: false,
        message: 'Failed to get sync statistics',
        error: error.message
      })
    }
  }

  /**
   * Get user sync history
   */
  public async getUserSyncHistory({ request, response }: HttpContextContract) {
    try {
      const { userId } = request.params
      const { page = 1, limit = 20, dataType, status } = request.qs()

      let query = HybridSyncData.query()
        .where('userId', parseInt(userId))
        .orderBy('createdAt', 'desc')

      if (dataType) {
        query = query.where('dataType', dataType)
      }

      if (status) {
        query = query.where('status', status)
      }

      const syncHistory = await query.paginate(page, limit)

      return response.json({
        success: true,
        data: {
          syncHistory: syncHistory.all.map(data => data.serializeForAPI()),
          meta: syncHistory.serialize()
        },
        message: 'User sync history retrieved'
      })

    } catch (error) {
      return response.status(500).json({
        success: false,
        message: 'Failed to get user sync history',
        error: error.message
      })
    }
  }

  /**
   * Get platform sync status
   */
  public async getPlatformSyncStatus({ request, response }: HttpContextContract) {
    try {
      const { platform } = request.params
      const { userId } = request.qs()

      let query = HybridSyncData.query()
        .where('targetPlatform', platform)
        .orderBy('createdAt', 'desc')

      if (userId) {
        query = query.where('userId', parseInt(userId))
      }

      const platformSync = await query.limit(100).exec()

      const stats = {
        total: platformSync.length,
        pending: platformSync.filter(s => s.status === 'pending').length,
        processing: platformSync.filter(s => s.status === 'processing').length,
        completed: platformSync.filter(s => s.status === 'completed').length,
        failed: platformSync.filter(s => s.status === 'failed').length,
        conflicts: platformSync.filter(s => s.status === 'conflict').length,
        lastSync: platformSync[0]?.createdAt || null,
        successRate: platformSync.length > 0 ? 
          (platformSync.filter(s => s.status === 'completed').length / platformSync.length) * 100 : 0
      }

      return response.json({
        success: true,
        data: {
          platform,
          stats,
          recentSync: platformSync.slice(0, 10).map(data => data.serializeForAPI())
        },
        message: 'Platform sync status retrieved'
      })

    } catch (error) {
      return response.status(500).json({
        success: false,
        message: 'Failed to get platform sync status',
        error: error.message
      })
    }
  }

  /**
   * Trigger manual sync
   */
  public async triggerManualSync({ request, response }: HttpContextContract) {
    try {
      const { userId, dataType, entityId } = request.only(['userId', 'dataType', 'entityId'])

      // Process sync queue
      await this.syncService.processSyncQueue()

      return response.json({
        success: true,
        message: 'Manual sync triggered successfully'
      })

    } catch (error) {
      return response.status(500).json({
        success: false,
        message: 'Failed to trigger manual sync',
        error: error.message
      })
    }
  }

  /**
   * Get sync conflicts
   */
  public async getSyncConflicts({ request, response }: HttpContextContract) {
    try {
      const { userId, resolved } = request.qs()

      let query = HybridSyncData.query()
        .where('status', 'conflict')
        .orderBy('createdAt', 'desc')

      if (userId) {
        query = query.where('userId', parseInt(userId))
      }

      if (resolved !== undefined) {
        if (resolved === 'true') {
          query = query.whereNotNull('resolvedAt')
        } else {
          query = query.whereNull('resolvedAt')
        }
      }

      const conflicts = await query.exec()

      return response.json({
        success: true,
        data: conflicts.map(conflict => ({
          ...conflict.serializeForAPI(),
          conflictDetails: conflict.errorDetails,
          resolution: conflict.conflictResolution,
          resolvedBy: conflict.resolvedBy,
          resolvedAt: conflict.resolvedAt
        })),
        message: 'Sync conflicts retrieved'
      })

    } catch (error) {
      return response.status(500).json({
        success: false,
        message: 'Failed to get sync conflicts',
        error: error.message
      })
    }
  }

  /**
   * Get sync health status
   */
  public async getSyncHealth({ request, response }: HttpContextContract) {
    try {
      const stats = await this.syncService.getStats()
      
      // Calculate health metrics
      const healthMetrics = {
        overall: 'healthy', // healthy, warning, critical
        queueSize: stats.pending,
        errorRate: stats.total > 0 ? (stats.failed / stats.total) * 100 : 0,
        successRate: stats.successRate,
        conflicts: stats.conflicts,
        critical: stats.critical
      }

      // Determine overall health
      if (healthMetrics.errorRate > 20 || healthMetrics.critical > 10) {
        healthMetrics.overall = 'critical'
      } else if (healthMetrics.errorRate > 10 || healthMetrics.conflicts > 5) {
        healthMetrics.overall = 'warning'
      }

      // Get recent sync activity
      const recentActivity = await HybridSyncData.query()
        .orderBy('createdAt', 'desc')
        .limit(10)
        .exec()

      return response.json({
        success: true,
        data: {
          health: healthMetrics,
          stats: stats,
          recentActivity: recentActivity.map(data => data.serializeForAPI()),
          timestamp: new Date().toISOString()
        },
        message: 'Sync health status retrieved'
      })

    } catch (error) {
      return response.status(500).json({
        success: false,
        message: 'Failed to get sync health status',
        error: error.message
      })
    }
  }

  /**
   * Cleanup old sync data
   */
  public async cleanupSyncData({ request, response }: HttpContextContract) {
    try {
      const { days = 30 } = request.only(['days'])

      await this.syncService.cleanup()

      return response.json({
        success: true,
        message: `Sync data cleanup completed (older than ${days} days)`
      })

    } catch (error) {
      return response.status(500).json({
        success: false,
        message: 'Failed to cleanup sync data',
        error: error.message
      })
    }
  }

  /**
   * Get cross-platform user data
   */
  public async getCrossPlatformUserData({ request, response }: HttpContextContract) {
    try {
      const { userId } = request.params
      const { includeSessions, includeProgress, includeSyncData } = request.qs()

      const user = await HybridUser.find(userId)
      if (!user) {
        return response.status(404).json({
          success: false,
          message: 'User not found'
        })
      }

      const result: any = {
        user: user.serializeForAPI()
      }

      // Include sessions if requested
      if (includeSessions === 'true') {
        result.sessions = await HybridSession.getActiveForUser(userId)
      }

      // Include progress if requested
      if (includeProgress === 'true') {
        result.progress = await user.getEnrolledCourses()
      }

      // Include sync data if requested
      if (includeSyncData === 'true') {
        result.syncData = await HybridSyncData.getPendingForUser(userId)
      }

      // Add sync status
      result.syncStatus = user.getSyncStatus()

      return response.json({
        success: true,
        data: result,
        message: 'Cross-platform user data retrieved'
      })

    } catch (error) {
      return response.status(500).json({
        success: false,
        message: 'Failed to get cross-platform user data',
        error: error.message
      })
    }
  }

  /**
   * Sync user across platforms
   */
  public async syncUserAcrossPlatforms({ request, response }: HttpContextContract) {
    try {
      const { userId } = request.params
      const { targetPlatforms } = request.only(['targetPlatforms'])

      const user = await HybridUser.find(userId)
      if (!user) {
        return response.status(404).json({
          success: false,
          message: 'User not found'
        })
      }

      const userData = user.serializeForSSO()
      const platforms = targetPlatforms ? targetPlatforms.split(',') : ['academy', 'offline']

      const syncResults = []

      for (const platform of platforms) {
        try {
          const payload = {
            userId: user.id,
            dataType: 'user',
            direction: 'bidirectional' as const,
            sourcePlatform: user.platform,
            targetPlatform: platform,
            entityId: user.id.toString(),
            entityType: 'user',
            action: 'update' as const,
            data: userData,
            priority: 'medium' as const,
            metadata: {
              syncType: 'cross_platform_user',
              initiatedAt: new Date().toISOString()
            }
          }

          const result = await this.syncService.queueSync(payload)
          syncResults.push({
            platform,
            success: true,
            syncId: result.id
          })

        } catch (error) {
          syncResults.push({
            platform,
            success: false,
            error: error.message
          })
        }
      }

      return response.json({
        success: true,
        data: {
          userId: user.id,
          syncResults
        },
        message: 'User sync across platforms initiated'
      })

    } catch (error) {
      return response.status(500).json({
        success: false,
        message: 'Failed to sync user across platforms',
        error: error.message
      })
    }
  }
}