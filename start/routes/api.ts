import router from '@adonisjs/core/http'
import { AuthController } from '../../app/controllers/auth_controller.js'
import { DataSyncService } from '../../app/services/data_sync_service.js'

// Authentication routes
router.post('/auth/login', [AuthController, 'authenticate'])
router.post('/auth/validate', [AuthController, 'validateToken'])
router.post('/auth/refresh', [AuthController, 'refreshToken'])
router.post('/auth/logout', [AuthController, 'logout'])

// User profile routes
router.get('/auth/profile', [AuthController, 'getProfile'])
router.put('/auth/profile', [AuthController, 'updateProfile'])
router.post('/auth/change-password', [AuthController, 'changePassword'])

// Session management routes
router.get('/auth/sessions', [AuthController, 'getSessions'])
router.delete('/auth/sessions/:sessionId', [AuthController, 'destroySession'])
router.get('/auth/check', [AuthController, 'checkAuth'])

// Cross-platform validation routes
router.post('/auth/validate-online', [AuthController, 'validateOnlineToken'])
router.post('/auth/validate-offline', [AuthController, 'validateOfflineToken'])
router.post('/auth/sync-user/:onlineUserId', [AuthController, 'syncUserFromOnline'])

// Data synchronization routes
router.post('/sync/queue', async ({ request, response }) => {
  const syncService = new DataSyncService(null as any)
  
  try {
    const syncData = request.body()
    const syncId = await syncService.queueSyncData(syncData)
    
    return response.json({
      success: true,
      data: { syncId }
    })
  } catch (error) {
    return response.status(500).json({
      success: false,
      error: {
        code: 'SYNC_QUEUE_FAILED',
        message: 'Failed to queue sync data'
      }
    })
  }
})

router.post('/sync/process', async ({ request, response }) => {
  const syncService = new DataSyncService(null as any)
  
  try {
    const result = await syncService.processSyncQueue()
    
    return response.json({
      success: true,
      data: result
    })
  } catch (error) {
    return response.status(500).json({
      success: false,
      error: {
        code: 'SYNC_PROCESS_FAILED',
        message: 'Failed to process sync queue'
      }
    })
  }
})

router.get('/sync/statistics', async ({ request, response }) => {
  const syncService = new DataSyncService(null as any)
  
  try {
    const stats = await syncService.getSyncStatistics()
    
    return response.json({
      success: true,
      data: stats
    })
  } catch (error) {
    return response.status(500).json({
      success: false,
      error: {
        code: 'SYNC_STATS_FAILED',
        message: 'Failed to get sync statistics'
      }
    })
  }
})

router.post('/sync/force/:type', async ({ request, response, params }) => {
  const syncService = new DataSyncService(null as any)
  
  try {
    const { userId } = request.body()
    const result = await syncService.forceSync(params.type, userId)
    
    return response.json({
      success: true,
      data: result
    })
  } catch (error) {
    return response.status(500).json({
      success: false,
      error: {
        code: 'FORCE_SYNC_FAILED',
        message: 'Failed to force sync'
      }
    })
  }
})

router.post('/sync/resolve-conflict/:syncId', async ({ request, response, params }) => {
  const syncService = new DataSyncService(null as any)
  
  try {
    const { resolution } = request.body()
    const success = await syncService.resolveConflict(params.syncId, resolution)
    
    return response.json({
      success,
      message: success ? 'Conflict resolved successfully' : 'Failed to resolve conflict'
    })
  } catch (error) {
    return response.status(500).json({
      success: false,
      error: {
        code: 'RESOLVE_CONFLICT_FAILED',
        message: 'Failed to resolve conflict'
      }
    })
  }
})

// Health check route
router.get('/health', async ({ response }) => {
  return response.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      authentication: 'operational',
      synchronization: 'operational',
      database: 'operational'
    }
  })
})

// API version and info
router.get('/api/info', async ({ response }) => {
  return response.json({
    name: 'INR99 Hybrid Platform API',
    version: '1.0.0',
    description: 'Hybrid education platform API for INR99 Academy and Offline Server',
    endpoints: {
      authentication: '/auth/*',
      synchronization: '/sync/*',
      health: '/health'
    },
    documentation: '/api/docs',
    status: 'operational'
  })
})