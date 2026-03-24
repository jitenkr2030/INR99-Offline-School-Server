import Route from '@adonisjs/core/http'

// Authentication routes
Route.group(() => {
  Route.post('/sso/login', 'HybridAuthController.ssoLogin')
  Route.post('/validate-token', 'HybridAuthController.validateToken')
  Route.post('/sync-login', 'HybridAuthController.syncLogin')
  Route.post('/logout', 'HybridAuthController.logout')
  Route.post('/refresh-token', 'HybridAuthController.refreshToken')
}).prefix('/auth/hybrid').middleware(['cors'])

// Sync API routes
Route.group(() => {
  Route.post('/queue', 'HybridApiController.queueSync')
  Route.get('/status', 'HybridApiController.getSyncStatus')
  Route.get('/pending', 'HybridApiController.getPendingSync')
  Route.post('/force', 'HybridApiController.forceSync')
  Route.put('/resolve-conflict/:syncId', 'HybridApiController.resolveConflict')
  Route.get('/stats', 'HybridApiController.getSyncStats')
  Route.get('/health', 'HybridApiController.getSyncHealth')
  Route.post('/trigger', 'HybridApiController.triggerManualSync')
  Route.delete('/cleanup', 'HybridApiController.cleanupSyncData')
}).prefix('/sync').middleware(['cors'])

// User sync routes
Route.group(() => {
  Route.get('/history/:userId', 'HybridApiController.getUserSyncHistory')
  Route.get('/cross-platform/:userId', 'HybridApiController.getCrossPlatformUserData')
  Route.post('/sync-user/:userId', 'HybridApiController.syncUserAcrossPlatforms')
}).prefix('/sync').middleware(['cors'])

// Platform sync routes
Route.group(() => {
  Route.get('/platform/:platform/status', 'HybridApiController.getPlatformSyncStatus')
  Route.get('/conflicts', 'HybridApiController.getSyncConflicts')
}).prefix('/sync').middleware(['cors'])

// Protected routes (require authentication)
Route.group(() => {
  // Authenticated user routes
  Route.group(() => {
    Route.get('/profile', 'HybridUserController.getProfile')
    Route.put('/profile', 'HybridUserController.updateProfile')
    Route.get('/sessions', 'HybridUserController.getSessions')
    Route.delete('/sessions/:sessionId', 'HybridUserController.revokeSession')
    Route.get('/sync-data', 'HybridUserController.getSyncData')
    Route.post('/sync-trigger', 'HybridUserController.triggerSync')
  }).prefix('/user').middleware(['auth'])

  // Admin routes
  Route.group(() => {
    Route.get('/users', 'HybridAdminController.getUsers')
    Route.get('/users/:id', 'HybridAdminController.getUser')
    Route.put('/users/:id', 'HybridAdminController.updateUser')
    Route.delete('/users/:id', 'HybridAdminController.deleteUser')
    Route.get('/sync/all', 'HybridAdminController.getAllSyncData')
    Route.post('/sync/process', 'HybridAdminController.processSyncQueue')
    Route.get('/stats/overview', 'HybridAdminController.getOverviewStats')
  }).prefix('/admin').middleware(['auth', 'role:admin'])

  // Teacher routes
  Route.group(() => {
    Route.get('/students', 'HybridTeacherController.getStudents')
    Route.get('/students/:id/progress', 'HybridTeacherController.getStudentProgress')
    Route.post('/assignments', 'HybridTeacherController.createAssignment')
    Route.put('/assignments/:id', 'HybridTeacherController.updateAssignment')
    Route.get('/courses', 'HybridTeacherController.getCourses')
    Route.post('/courses', 'HybridTeacherController.createCourse')
  }).prefix('/teacher').middleware(['auth', 'role:teacher,admin'])

  // Student routes
  Route.group(() => {
    Route.get('/courses', 'HybridStudentController.getCourses')
    Route.get('/courses/:id', 'HybridStudentController.getCourse')
    Route.get('/progress', 'HybridStudentController.getProgress')
    Route.post('/assignments/:id/submit', 'HybridStudentController.submitAssignment')
    Route.get('/grades', 'HybridStudentController.getGrades')
  }).prefix('/student').middleware(['auth', 'role:student,teacher,admin'])

  // Parent routes
  Route.group(() => {
    Route.get('/children', 'HybridParentController.getChildren')
    Route.get('/children/:id/progress', 'HybridParentController.getChildProgress')
    Route.get('/children/:id/grades', 'HybridParentController.getChildGrades')
  }).prefix('/parent').middleware(['auth', 'role:parent,admin'])
}).prefix('/api/v1/hybrid').middleware(['cors', 'security'])

// WebSocket routes for real-time sync
Route.group(() => {
  Route.get('/ws/sync', 'HybridWebSocketController.handleSync')
  Route.get('/ws/notifications', 'HybridWebSocketController.handleNotifications')
}).prefix('/ws').middleware(['cors'])

// Health check and status routes
Route.group(() => {
  Route.get('/health', 'HybridStatusController.health')
  Route.get('/status', 'HybridStatusController.status')
  Route.get('/version', 'HybridStatusController.version')
  Route.get('/ping', 'HybridStatusController.ping')
}).prefix('/hybrid').middleware(['cors'])

// Webhook routes for external integrations
Route.group(() => {
  Route.post('/webhook/sync-completed', 'HybridWebhookController.syncCompleted')
  Route.post('/webhook/sync-failed', 'HybridWebhookController.syncFailed')
  Route.post('/webhook/user-updated', 'HybridWebhookController.userUpdated')
  Route.post('/webhook/progress-updated', 'HybridWebhookController.progressUpdated')
}).prefix('/webhooks').middleware(['cors', 'security'])

// Export routes for modular loading
export default {
  auth: Route.group(() => {
    Route.post('/sso/login', 'HybridAuthController.ssoLogin')
    Route.post('/validate-token', 'HybridAuthController.validateToken')
    Route.post('/sync-login', 'HybridAuthController.syncLogin')
    Route.post('/logout', 'HybridAuthController.logout')
    Route.post('/refresh-token', 'HybridAuthController.refreshToken')
  }).prefix('/auth/hybrid').middleware(['cors']),

  sync: Route.group(() => {
    Route.post('/queue', 'HybridApiController.queueSync')
    Route.get('/status', 'HybridApiController.getSyncStatus')
    Route.get('/pending', 'HybridApiController.getPendingSync')
    Route.post('/force', 'HybridApiController.forceSync')
    Route.put('/resolve-conflict/:syncId', 'HybridApiController.resolveConflict')
    Route.get('/stats', 'HybridApiController.getSyncStats')
    Route.get('/health', 'HybridApiController.getSyncHealth')
    Route.post('/trigger', 'HybridApiController.triggerManualSync')
    Route.delete('/cleanup', 'HybridApiController.cleanupSyncData')
  }).prefix('/sync').middleware(['cors']),

  api: Route.group(() => {
    Route.group(() => {
      Route.get('/profile', 'HybridUserController.getProfile')
      Route.put('/profile', 'HybridUserController.updateProfile')
      Route.get('/sessions', 'HybridUserController.getSessions')
      Route.delete('/sessions/:sessionId', 'HybridUserController.revokeSession')
      Route.get('/sync-data', 'HybridUserController.getSyncData')
      Route.post('/sync-trigger', 'HybridUserController.triggerSync')
    }).prefix('/user').middleware(['auth'])

    Route.group(() => {
      Route.get('/users', 'HybridAdminController.getUsers')
      Route.get('/users/:id', 'HybridAdminController.getUser')
      Route.put('/users/:id', 'HybridAdminController.updateUser')
      Route.delete('/users/:id', 'HybridAdminController.deleteUser')
      Route.get('/sync/all', 'HybridAdminController.getAllSyncData')
      Route.post('/sync/process', 'HybridAdminController.processSyncQueue')
      Route.get('/stats/overview', 'HybridAdminController.getOverviewStats')
    }).prefix('/admin').middleware(['auth', 'role:admin'])
  }).prefix('/api/v1/hybrid').middleware(['cors', 'security'])
}