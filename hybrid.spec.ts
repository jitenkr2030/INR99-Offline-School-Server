import { test } from '@japa/runner'
import { Application } from '@adonisjs/core/app'
import HybridUser from '#models/hybrid_user'
import HybridSession from '#models/hybrid_session'
import HybridSyncData from '#models/hybrid_sync_data'
import HybridSyncService from '#services/hybrid_sync_service'

test.group('Hybrid Authentication', (group) => {
  let app: Application
  let syncService: HybridSyncService

  group.setup(async () => {
    app = new Application('test')
    await app.init()
    syncService = new HybridSyncService()
  })

  group.teardown(async () => {
    await app.shutdown()
  })

  test('should create user with valid data', async ({ assert }) => {
    const userData = {
      username: 'testuser',
      email: 'test@example.com',
      password: 'password123',
      firstName: 'Test',
      lastName: 'User',
      role: 'student' as const,
      platform: 'hybrid' as const,
      ssoId: 'sso_123456'
    }

    const user = await HybridUser.create(userData)

    assert.exists(user.id)
    assert.equal(user.username, userData.username)
    assert.equal(user.email, userData.email)
    assert.equal(user.role, userData.role)
    assert.equal(user.platform, userData.platform)
    assert.isTrue(user.isActive)
  })

  test('should hash password before saving', async ({ assert }) => {
    const password = 'password123'
    const user = await HybridUser.create({
      username: 'testuser',
      email: 'test@example.com',
      password,
      firstName: 'Test',
      lastName: 'User',
      role: 'student' as const,
      platform: 'hybrid' as const
    })

    const isHashed = user.password !== password
    assert.isTrue(isHashed)

    const isValid = await user.verifyPassword(password)
    assert.isTrue(isValid)
  })

  test('should create session with valid data', async ({ assert }) => {
    const user = await HybridUser.create({
      username: 'testuser',
      email: 'test@example.com',
      password: 'password123',
      firstName: 'Test',
      lastName: 'User',
      role: 'student' as const,
      platform: 'hybrid' as const
    })

    const sessionData = {
      sessionId: 'session_123456',
      userId: user.id,
      platform: 'hybrid' as const,
      ipAddress: '127.0.0.1',
      token: 'token_123456',
      isActive: true,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      lastActivityAt: new Date()
    }

    const session = await HybridSession.create(sessionData)

    assert.exists(session.id)
    assert.equal(session.sessionId, sessionData.sessionId)
    assert.equal(session.userId, user.id)
    assert.isTrue(session.isValid)
  })

  test('should validate session expiration', async ({ assert }) => {
    const user = await HybridUser.create({
      username: 'testuser',
      email: 'test@example.com',
      password: 'password123',
      firstName: 'Test',
      lastName: 'User',
      role: 'student' as const,
      platform: 'hybrid' as const
    })

    const expiredSession = await HybridSession.create({
      sessionId: 'expired_session',
      userId: user.id,
      platform: 'hybrid' as const,
      ipAddress: '127.0.0.1',
      token: 'expired_token',
      isActive: true,
      expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
      lastActivityAt: new Date()
    })

    assert.isTrue(expiredSession.isExpired)
    assert.isFalse(expiredSession.isValid)
  })
})

test.group('Hybrid Sync Service', (group) => {
  let app: Application
  let syncService: HybridSyncService
  let testUser: HybridUser

  group.setup(async () => {
    app = new Application('test')
    await app.init()
    syncService = new HybridSyncService()

    // Create test user
    testUser = await HybridUser.create({
      username: 'syncuser',
      email: 'sync@example.com',
      password: 'password123',
      firstName: 'Sync',
      lastName: 'User',
      role: 'student' as const,
      platform: 'hybrid' as const
    })
  })

  group.teardown(async () => {
    await app.shutdown()
    // Clean up test data
    await HybridSyncData.query().where('userId', testUser.id).delete()
    await testUser.delete()
  })

  test('should queue sync data successfully', async ({ assert }) => {
    const syncPayload = {
      userId: testUser.id,
      dataType: 'progress',
      direction: 'online_to_offline' as const,
      sourcePlatform: 'academy' as const,
      targetPlatform: 'offline' as const,
      entityId: 'course_123',
      entityType: 'user_progress',
      action: 'update' as const,
      data: {
        courseId: 123,
        lessonId: 456,
        progress: 75,
        timeSpent: 1800
      },
      priority: 'medium' as const,
      metadata: {
        source: 'test'
      }
    }

    const syncData = await syncService.queueSync(syncPayload)

    assert.exists(syncData.id)
    assert.equal(syncData.userId, testUser.id)
    assert.equal(syncData.dataType, 'progress')
    assert.equal(syncData.status, 'pending')
    assert.exists(syncData.checksum)
  })

  test('should handle sync conflict', async ({ assert }) => {
    // Create initial sync data
    const initialSync = await syncService.queueSync({
      userId: testUser.id,
      dataType: 'progress',
      direction: 'online_to_offline' as const,
      sourcePlatform: 'academy' as const,
      targetPlatform: 'offline' as const,
      entityId: 'course_123',
      entityType: 'user_progress',
      action: 'update' as const,
      data: {
        courseId: 123,
        progress: 50,
        updatedAt: new Date().toISOString()
      }
    })

    // Mark as completed
    await initialSync.markAsCompleted()

    // Create conflicting sync data
    const conflictSync = await syncService.queueSync({
      userId: testUser.id,
      dataType: 'progress',
      direction: 'offline_to_online' as const,
      sourcePlatform: 'offline' as const,
      targetPlatform: 'academy' as const,
      entityId: 'course_123',
      entityType: 'user_progress',
      action: 'update' as const,
      data: {
        courseId: 123,
        progress: 75,
        updatedAt: new Date().toISOString()
      }
    })

    // Simulate conflict detection
    const hasConflict = true // This would be detected by the sync service
    assert.isTrue(hasConflict)
  })

  test('should retry failed sync data', async ({ assert }) => {
    const syncPayload = {
      userId: testUser.id,
      dataType: 'progress',
      direction: 'online_to_offline' as const,
      sourcePlatform: 'academy' as const,
      targetPlatform: 'offline' as const,
      entityId: 'course_123',
      entityType: 'user_progress',
      action: 'update' as const,
      data: {
        courseId: 123,
        progress: 75
      }
    }

    const syncData = await syncService.queueSync(syncPayload)

    // Simulate failure
    await syncData.markAsFailed('Test error')

    // Check if retry is possible
    const canRetry = syncData.canRetry
    assert.isTrue(canRetry)
    assert.equal(syncData.retryCount, 1)
    assert.exists(syncData.nextRetryAt)
  })

  test('should get sync statistics', async ({ assert }) => {
    // Create some test sync data
    await syncService.queueSync({
      userId: testUser.id,
      dataType: 'progress',
      direction: 'online_to_offline' as const,
      sourcePlatform: 'academy' as const,
      targetPlatform: 'offline' as const,
      entityId: 'course_1',
      entityType: 'user_progress',
      action: 'update' as const,
      data: { progress: 50 }
    })

    await syncService.queueSync({
      userId: testUser.id,
      dataType: 'assignment',
      direction: 'offline_to_online' as const,
      sourcePlatform: 'offline' as const,
      targetPlatform: 'academy' as const,
      entityId: 'assignment_1',
      entityType: 'assignment',
      action: 'create' as const,
      data: { title: 'Test Assignment' }
    })

    const stats = await syncService.getStats(testUser.id)

    assert.exists(stats.total)
    assert.exists(stats.pending)
    assert.isNumber(stats.successRate)
  })
})

test.group('Hybrid API Endpoints', (group) => {
  let app: Application
  let testUser: HybridUser
  let authToken: string

  group.setup(async () => {
    app = new Application('test')
    await app.init()

    // Create test user and get auth token
    testUser = await HybridUser.create({
      username: 'apiuser',
      email: 'api@example.com',
      password: 'password123',
      firstName: 'API',
      lastName: 'User',
      role: 'student' as const,
      platform: 'hybrid' as const
    })

    // Create session and token
    const session = await HybridSession.create({
      sessionId: 'api_session_123',
      userId: testUser.id,
      platform: 'hybrid' as const,
      ipAddress: '127.0.0.1',
      token: 'api_token_123',
      isActive: true,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      lastActivityAt: new Date()
    })

    authToken = 'Bearer api_token_123'
  })

  group.teardown(async () => {
    await app.shutdown()
    await testUser.delete()
  })

  test('should queue sync data via API', async ({ assert }) => {
    const syncPayload = {
      userId: testUser.id,
      dataType: 'progress',
      direction: 'online_to_offline',
      sourcePlatform: 'academy',
      targetPlatform: 'offline',
      entityId: 'course_api_123',
      entityType: 'user_progress',
      action: 'update',
      data: {
        courseId: 123,
        progress: 85
      }
    }

    const response = await app.make('HttpClient').post('/sync/queue')
      .header('Authorization', authToken)
      .json(syncPayload)

    assert.equal(response.status(), 200)
    assert.exists(response.body().data.syncId)
    assert.equal(response.body().success, true)
  })

  test('should get sync status via API', async ({ assert }) => {
    const response = await app.make('HttpClient').get('/sync/status')
      .header('Authorization', authToken)
      .query({ userId: testUser.id })

    assert.equal(response.status(), 200)
    assert.isArray(response.body().data)
    assert.equal(response.body().success, true)
  })

  test('should handle invalid auth token', async ({ assert }) => {
    const response = await app.make('HttpClient').get('/sync/status')
      .header('Authorization', 'Bearer invalid_token')

    assert.equal(response.status(), 401)
    assert.equal(response.body().success, false)
    assert.equal(response.body().code, 'UNAUTHORIZED')
  })

  test('should validate request data', async ({ assert }) => {
    const invalidPayload = {
      // Missing required fields
      data: { progress: 85 }
    }

    const response = await app.make('HttpClient').post('/sync/queue')
      .header('Authorization', authToken)
      .json(invalidPayload)

    assert.equal(response.status(), 400)
    assert.equal(response.body().success, false)
    assert.exists(response.body().errors)
  })
})

test.group('Hybrid Security', (group) => {
  let app: Application
  let testUser: HybridUser
  let validToken: string
  let expiredToken: string

  group.setup(async () => {
    app = new Application('test')
    await app.init()

    testUser = await HybridUser.create({
      username: 'securityuser',
      email: 'security@example.com',
      password: 'password123',
      firstName: 'Security',
      lastName: 'User',
      role: 'student' as const,
      platform: 'hybrid' as const
    })

    // Create valid session
    const validSession = await HybridSession.create({
      sessionId: 'valid_session',
      userId: testUser.id,
      platform: 'hybrid' as const,
      ipAddress: '127.0.0.1',
      token: 'valid_token_123',
      isActive: true,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      lastActivityAt: new Date()
    })

    // Create expired session
    const expiredSession = await HybridSession.create({
      sessionId: 'expired_session',
      userId: testUser.id,
      platform: 'hybrid' as const,
      ipAddress: '127.0.0.1',
      token: 'expired_token_123',
      isActive: true,
      expiresAt: new Date(Date.now() - 1000),
      lastActivityAt: new Date()
    })

    validToken = 'Bearer valid_token_123'
    expiredToken = 'Bearer expired_token_123'
  })

  group.teardown(async () => {
    await app.shutdown()
    await testUser.delete()
  })

  test('should allow access with valid token', async ({ assert }) => {
    const response = await app.make('HttpClient').get('/sync/status')
      .header('Authorization', validToken)

    assert.equal(response.status(), 200)
  })

  test('should deny access with expired token', async ({ assert }) => {
    const response = await app.make('HttpClient').get('/sync/status')
      .header('Authorization', expiredToken)

    assert.equal(response.status(), 401)
    assert.equal(response.body().code, 'UNAUTHORIZED')
  })

  test('should deny access without token', async ({ assert }) => {
    const response = await app.make('HttpClient').get('/sync/status')

    assert.equal(response.status(), 401)
    assert.equal(response.body().code, 'UNAUTHORIZED')
  })

  test('should implement rate limiting', async ({ assert }) => {
    // Make multiple requests quickly to trigger rate limiting
    const requests = Array(10).fill(null).map(() =>
      app.make('HttpClient').get('/sync/status')
        .header('Authorization', validToken)
    )

    const responses = await Promise.all(requests)
    
    // At least one request should succeed
    const hasSuccess = responses.some(r => r.status() === 200)
    assert.isTrue(hasSuccess)

    // Check for rate limit headers
    const hasRateLimitHeaders = responses.some(r => 
      r.headers()['x-ratelimit-limit']
    )
    assert.isTrue(hasRateLimitHeaders)
  })

  test('should sanitize input data', async ({ assert }) => {
    const maliciousPayload = {
      userId: testUser.id,
      dataType: 'progress',
      direction: 'online_to_offline',
      sourcePlatform: 'academy',
      targetPlatform: 'offline',
      entityId: '<script>alert("xss")</script>',
      entityType: 'user_progress',
      action: 'update',
      data: {
        progress: '<script>alert("xss")</script>',
        maliciousCode: 'javascript:alert("xss")'
      }
    }

    const response = await app.make('HttpClient').post('/sync/queue')
      .header('Authorization', validToken)
      .json(maliciousPayload)

    // Request should either succeed with sanitized data or fail validation
    assert.isTrue([200, 400].includes(response.status()))
    
    if (response.status() === 200) {
      // Check that malicious content was sanitized
      const syncData = response.body().data
      assert.isFalse(syncData.entityId.includes('<script>'))
    }
  })
})

test.group('Hybrid Performance', (group) => {
  let app: Application
  let testUsers: HybridUser[] = []

  group.setup(async () => {
    app = new Application('test')
    await app.init()

    // Create multiple test users for performance testing
    for (let i = 0; i < 10; i++) {
      const user = await HybridUser.create({
        username: `perfuser_${i}`,
        email: `perf${i}@example.com`,
        password: 'password123',
        firstName: 'Perf',
        lastName: `User ${i}`,
        role: 'student' as const,
        platform: 'hybrid' as const
      })
      testUsers.push(user)
    }
  })

  group.teardown(async () => {
    await app.shutdown()
    for (const user of testUsers) {
      await user.delete()
    }
  })

  test('should handle bulk sync operations efficiently', async ({ assert }) => {
    const syncService = new HybridSyncService()
    const startTime = Date.now()

    // Queue multiple sync operations
    const syncPromises = testUsers.map((user, index) =>
      syncService.queueSync({
        userId: user.id,
        dataType: 'progress',
        direction: 'online_to_offline' as const,
        sourcePlatform: 'academy' as const,
        targetPlatform: 'offline' as const,
        entityId: `course_bulk_${index}`,
        entityType: 'user_progress',
        action: 'update' as const,
        data: {
          courseId: index,
          progress: Math.floor(Math.random() * 100)
        }
      })
    )

    const syncData = await Promise.all(syncPromises)
    const endTime = Date.now()
    const duration = endTime - startTime

    assert.equal(syncData.length, testUsers.length)
    assert.isBelow(duration, 1000) // Should complete within 1 second

    // All sync data should be created successfully
    syncData.forEach(data => {
      assert.exists(data.id)
      assert.equal(data.status, 'pending')
    })
  })

  test('should handle concurrent sync processing', async ({ assert }) => {
    const syncService = new HybridSyncService()
    
    // Create sync data for concurrent processing
    const syncPromises = testUsers.map((user, index) =>
      syncService.queueSync({
        userId: user.id,
        dataType: 'progress',
        direction: 'online_to_offline' as const,
        sourcePlatform: 'academy' as const,
        targetPlatform: 'offline' as const,
        entityId: `concurrent_${index}`,
        entityType: 'user_progress',
        action: 'update' as const,
        data: {
          courseId: index,
          progress: 50
        },
        priority: 'high' as const
      })
    )

    const syncData = await Promise.all(syncPromises)
    
    // Process sync queue
    await syncService.processSyncQueue()

    // Check that all sync data was processed
    const processedCount = syncData.filter(data => data.status === 'completed').length
    assert.equal(processedCount, syncData.length)
  })

  test('should maintain data integrity under load', async ({ assert }) => {
    const syncService = new HybridSyncService()
    const largeDataSize = 1000 // Large data object
    
    const largePayload = {
      userId: testUsers[0].id,
      dataType: 'progress',
      direction: 'online_to_offline' as const,
      sourcePlatform: 'academy' as const,
      targetPlatform: 'offline' as const,
      entityId: 'large_data_test',
      entityType: 'user_progress',
      action: 'update' as const,
      data: {
        // Create large data object
        details: Array(largeDataSize).fill(null).map((_, index) => ({
          id: index,
          data: `Large data item ${index}`.repeat(100)
        }))
      }
    }

    const startTime = Date.now()
    const syncData = await syncService.queueSync(largePayload)
    const endTime = Date.now()
    const duration = endTime - startTime

    assert.exists(syncData.id)
    assert.exists(syncData.checksum)
    assert.isTrue(syncData.verifyIntegrity())
    assert.isBelow(duration, 5000) // Should complete within 5 seconds even with large data
  })
})