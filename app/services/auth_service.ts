import { inject } from '@adonisjs/core'
import { HttpContext } from '@adonisjs/core/http'
import jwt from 'jsonwebtoken'
import { DateTime } from 'luxon'
import { Database } from '@adonisjs/lucid/database'
import Hash from '@adonisjs/core/hash'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'

import {
  IAuthService,
  AuthToken,
  UserCredentials,
  UserProfile,
  SessionData,
  AuthConfig,
  JWTConfig,
  AuthenticationError,
  InvalidCredentialsError,
  TokenExpiredError,
  UserNotFoundError,
  AccountLockedError,
  InsufficientPermissionsError
} from '../interfaces/auth.js'

/**
 * Authentication Service Implementation
 * Provides unified authentication across INR99 Academy and Offline Server
 */
@inject()
export class AuthService implements IAuthService {
  constructor(
    private db: Database,
    private ctx: HttpContext
  ) {}

  /**
   * Get authentication configuration
   */
  private getConfig(): AuthConfig {
    return {
      jwt: {
        secret: process.env.JWT_SECRET || 'inr99-hybrid-secret-key-change-in-production',
        algorithm: 'HS256',
        expiresIn: '1h',
        refreshTokenExpiresIn: '7d',
        issuer: 'inr99-hybrid-platform',
        audience: 'inr99-users'
      },
      platforms: {
        online: {
          apiUrl: process.env.INR99_ACADEMY_API_URL || 'https://api.inr99.academy',
          oauthUrl: process.env.INR99_ACADEMY_OAUTH_URL || 'https://auth.inr99.academy',
          clientId: process.env.INR99_ACADEMY_CLIENT_ID || 'inr99-hybrid-client',
          clientSecret: process.env.INR99_ACADEMY_CLIENT_SECRET || 'client-secret',
          redirectUri: process.env.INR99_ACADEMY_REDIRECT_URI || 'http://localhost:8080/auth/callback'
        },
        offline: {
          apiUrl: process.env.INR99_OFFLINE_API_URL || 'http://localhost:8080',
          secretKey: process.env.INR99_OFFLINE_SECRET_KEY || 'offline-secret-key',
          tokenValidationEndpoint: '/api/auth/validate'
        }
      },
      security: {
        maxLoginAttempts: 5,
        lockoutDuration: 15 * 60 * 1000, // 15 minutes
        sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
        passwordPolicy: {
          minLength: 8,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSpecialChars: false
        }
      },
      sync: {
        autoSyncUsers: true,
        syncInterval: 5 * 60 * 1000, // 5 minutes
        conflictResolution: 'online_wins' // online_wins, offline_wins, manual
      }
    }
  }

  /**
   * Core Authentication Method
   * Authenticates user against both online and offline platforms
   */
  async authenticate(credentials: UserCredentials): Promise<AuthToken> {
    const config = this.getConfig()
    
    try {
      // Check if user exists and is active
      const user = await this.getUserByEmail(credentials.email)
      if (!user || !user.isActive) {
        throw new InvalidCredentialsError('Invalid email or password')
      }

      // Check if account is locked
      if (await this.isAccountLocked(user.id)) {
        throw new AccountLockedError('Account is temporarily locked due to multiple failed login attempts')
      }

      // Verify password
      const isValidPassword = await this.verifyPassword(credentials.password, user.passwordHash)
      if (!isValidPassword) {
        await this.recordFailedLogin(user.id)
        throw new InvalidCredentialsError('Invalid email or password')
      }

      // Reset failed login attempts on successful authentication
      await this.resetFailedLoginAttempts(user.id)

      // Generate tokens
      const token = await this.generateTokens(user, credentials.platform || 'hybrid')

      // Create session
      await this.createSession(user, credentials.platform || 'hybrid', this.ctx)

      // Update last login
      await this.updateLastLogin(user.id)

      return token

    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error
      }
      throw new AuthenticationError('Authentication failed', 'AUTH_ERROR', 500)
    }
  }

  /**
   * Validate JWT Token
   */
  async validateToken(token: string): Promise<UserProfile | null> {
    try {
      const config = this.getConfig()
      const decoded = jwt.verify(token, config.jwt.secret) as any

      // Check if token is expired
      if (DateTime.fromMillis(decoded.exp * 1000) < DateTime.now()) {
        throw new TokenExpiredError()
      }

      // Get user profile
      const user = await this.getUserProfile(decoded.userId)
      if (!user || !user.isActive) {
        return null
      }

      return user

    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw error
      }
      return null
    }
  }

  /**
   * Refresh Access Token
   */
  async refreshToken(refreshToken: string): Promise<AuthToken> {
    try {
      const config = this.getConfig()
      const decoded = jwt.verify(refreshToken, config.jwt.secret) as any

      // Check if refresh token is expired
      if (DateTime.fromMillis(decoded.exp * 1000) < DateTime.now()) {
        throw new TokenExpiredError('Refresh token has expired')
      }

      // Get user profile
      const user = await this.getUserProfile(decoded.userId)
      if (!user || !user.isActive) {
        throw new UserNotFoundError('User not found or inactive')
      }

      // Generate new tokens
      return await this.generateTokens(user, decoded.platform)

    } catch (error) {
      throw new AuthenticationError('Token refresh failed', 'REFRESH_FAILED', 401)
    }
  }

  /**
   * Logout User
   */
  async logout(token: string): Promise<void> {
    try {
      const decoded = jwt.decode(token) as any
      if (decoded && decoded.sessionId) {
        await this.destroySession(decoded.sessionId)
      }
    } catch (error) {
      // Log error but don't throw - logout should always succeed
      console.error('Logout error:', error)
    }
  }

  /**
   * Validate Online Platform Token
   */
  async validateOnlineToken(token: string): Promise<UserProfile | null> {
    try {
      const config = this.getConfig()
      
      // Call INR99 Academy API to validate token
      const response = await fetch(`${config.platforms.online.apiUrl}/api/auth/validate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        return null
      }

      const data = await response.json()
      
      // Sync user data to offline server
      if (data.user && config.sync.autoSyncUsers) {
        await this.syncUserFromOnline(data.user)
      }

      return data.user

    } catch (error) {
      console.error('Online token validation error:', error)
      return null
    }
  }

  /**
   * Validate Offline Platform Token
   */
  async validateOfflineToken(token: string): Promise<UserProfile | null> {
    try {
      const config = this.getConfig()
      
      // Validate token locally
      const user = await this.validateToken(token)
      if (!user) {
        return null
      }

      return user

    } catch (error) {
      console.error('Offline token validation error:', error)
      return null
    }
  }

  /**
   * Sync Authentication Data
   */
  async syncAuthData(user: UserProfile): Promise<void> {
    try {
      // Update user profile in local database
      await this.updateUserProfile(user.id, user)
      
      // Sync session data if user has active sessions
      const activeSessions = await this.getActiveUserSessions(user.id)
      for (const session of activeSessions) {
        await this.updateSessionActivity(session.sessionId)
      }

    } catch (error) {
      console.error('Auth data sync error:', error)
    }
  }

  /**
   * Create User Session
   */
  async createSession(user: UserProfile, platform: string, context: HttpContext): Promise<SessionData> {
    const sessionId = uuidv4()
    const now = DateTime.now()
    const expiresAt = now.plus({ milliseconds: this.getConfig().security.sessionTimeout })

    const sessionData: SessionData = {
      sessionId,
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      platform,
      loginTime: now,
      lastActivity: now,
      expiresAt,
      ipAddress: context.ip(),
      userAgent: context.request.header('user-agent') || 'Unknown',
      isActive: true
    }

    // Store session in database
    await this.db.table('user_sessions').insert({
      id: sessionId,
      user_id: user.id,
      user_email: user.email,
      user_role: user.role,
      platform,
      login_time: now.toISO(),
      last_activity: now.toISO(),
      expires_at: expiresAt.toISO(),
      ip_address: context.ip(),
      user_agent: context.request.header('user-agent'),
      is_active: true,
      created_at: now.toISO(),
      updated_at: now.toISO()
    })

    return sessionData
  }

  /**
   * Validate Session
   */
  async validateSession(sessionId: string): Promise<SessionData | null> {
    try {
      const session = await this.db
        .from('user_sessions')
        .where('id', sessionId)
        .andWhere('is_active', true)
        .andWhere('expires_at', '>', DateTime.now().toISO())
        .first()

      if (!session) {
        return null
      }

      return {
        sessionId: session.id,
        userId: session.user_id,
        userEmail: session.user_email,
        userRole: session.user_role,
        platform: session.platform,
        loginTime: DateTime.fromISO(session.login_time),
        lastActivity: DateTime.fromISO(session.last_activity),
        expiresAt: DateTime.fromISO(session.expires_at),
        ipAddress: session.ip_address,
        userAgent: session.user_agent,
        isActive: session.is_active
      }

    } catch (error) {
      console.error('Session validation error:', error)
      return null
    }
  }

  /**
   * Update Session Activity
   */
  async updateSessionActivity(sessionId: string): Promise<void> {
    try {
      await this.db
        .from('user_sessions')
        .where('id', sessionId)
        .update({
          last_activity: DateTime.now().toISO(),
          updated_at: DateTime.now().toISO()
        })
    } catch (error) {
      console.error('Session activity update error:', error)
    }
  }

  /**
   * Destroy Session
   */
  async destroySession(sessionId: string): Promise<void> {
    try {
      await this.db
        .from('user_sessions')
        .where('id', sessionId)
        .update({
          is_active: false,
          updated_at: DateTime.now().toISO()
        })
    } catch (error) {
      console.error('Session destroy error:', error)
    }
  }

  /**
   * Get User Profile
   */
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
      const user = await this.db
        .from('users')
        .where('id', userId)
        .andWhere('is_active', true)
        .first()

      if (!user) {
        return null
      }

      return {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        schoolId: user.school_id,
        classId: user.class_id,
        isActive: user.is_active,
        lastLogin: user.last_login ? DateTime.fromISO(user.last_login) : undefined,
        preferences: user.preferences || {},
        permissions: user.permissions || []
      }

    } catch (error) {
      console.error('Get user profile error:', error)
      return null
    }
  }

  /**
   * Update User Profile
   */
  async updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<UserProfile> {
    try {
      const updateData: any = {
        updated_at: DateTime.now().toISO()
      }

      if (updates.firstName) updateData.first_name = updates.firstName
      if (updates.lastName) updateData.last_name = updates.lastName
      if (updates.role) updateData.role = updates.role
      if (updates.schoolId) updateData.school_id = updates.schoolId
      if (updates.classId) updateData.class_id = updates.classId
      if (updates.isActive !== undefined) updateData.is_active = updates.isActive
      if (updates.preferences) updateData.preferences = updates.preferences
      if (updates.permissions) updateData.permissions = updates.permissions

      await this.db
        .from('users')
        .where('id', userId)
        .update(updateData)

      const updatedUser = await this.getUserProfile(userId)
      if (!updatedUser) {
        throw new UserNotFoundError('User not found after update')
      }

      return updatedUser

    } catch (error) {
      console.error('Update user profile error:', error)
      throw new AuthenticationError('Failed to update user profile', 'UPDATE_FAILED', 500)
    }
  }

  /**
   * Sync User from Online Platform
   */
  async syncUserFromOnline(onlineUserId: string): Promise<UserProfile> {
    try {
      const config = this.getConfig()
      
      // Fetch user data from INR99 Academy
      const response = await fetch(`${config.platforms.online.apiUrl}/api/users/${onlineUserId}`, {
        headers: {
          'Authorization': `Bearer ${await this.getPlatformToken()}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch user from online platform')
      }

      const onlineUser = await response.json()

      // Check if user exists locally
      let localUser = await this.getUserByEmail(onlineUser.email)

      if (localUser) {
        // Update existing user
        const updatedUser = await this.updateUserProfile(localUser.id, {
          firstName: onlineUser.firstName,
          lastName: onlineUser.lastName,
          role: onlineUser.role,
          preferences: { ...localUser.preferences, ...onlineUser.preferences },
          permissions: onlineUser.permissions || []
        })
        return updatedUser
      } else {
        // Create new user
        const newUser = await this.createUser({
          email: onlineUser.email,
          firstName: onlineUser.firstName,
          lastName: onlineUser.lastName,
          role: onlineUser.role,
          schoolId: onlineUser.schoolId,
          classId: onlineUser.classId,
          password: await this.generateSecureToken(12), // Random password for synced users
          preferences: onlineUser.preferences || {},
          permissions: onlineUser.permissions || []
        })
        return newUser
      }

    } catch (error) {
      console.error('Sync user from online error:', error)
      throw new AuthenticationError('Failed to sync user from online platform', 'SYNC_FAILED', 500)
    }
  }

  /**
   * Sync User from Offline Platform
   */
  async syncUserFromOffline(offlineUserId: string): Promise<UserProfile> {
    try {
      // For offline users, we already have the data locally
      const user = await this.getUserProfile(offlineUserId)
      if (!user) {
        throw new UserNotFoundError('Offline user not found')
      }

      // Sync to online platform if needed
      const config = this.getConfig()
      if (config.sync.autoSyncUsers) {
        await this.syncUserToOnline(user)
      }

      return user

    } catch (error) {
      console.error('Sync user from offline error:', error)
      throw new AuthenticationError('Failed to sync user from offline platform', 'SYNC_FAILED', 500)
    }
  }

  /**
   * Hash Password
   */
  async hashPassword(password: string): Promise<string> {
    return await Hash.make(password)
  }

  /**
   * Verify Password
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return await Hash.verify(password, hash)
  }

  /**
   * Generate Secure Token
   */
  async generateSecureToken(length: number = 32): Promise<string> {
    return crypto.randomBytes(length).toString('hex')
  }

  /**
   * Validate Password Strength
   */
  async validateStrength(password: string): Promise<{ isValid: boolean; score: number; feedback: string[] }> {
    const config = this.getConfig()
    const feedback: string[] = []
    let score = 0

    // Length check
    if (password.length >= config.security.passwordPolicy.minLength) {
      score += 20
    } else {
      feedback.push(`Password must be at least ${config.security.passwordPolicy.minLength} characters long`)
    }

    // Uppercase check
    if (config.security.passwordPolicy.requireUppercase && /[A-Z]/.test(password)) {
      score += 20
    } else if (config.security.passwordPolicy.requireUppercase) {
      feedback.push('Password must contain at least one uppercase letter')
    }

    // Lowercase check
    if (config.security.passwordPolicy.requireLowercase && /[a-z]/.test(password)) {
      score += 20
    } else if (config.security.passwordPolicy.requireLowercase) {
      feedback.push('Password must contain at least one lowercase letter')
    }

    // Numbers check
    if (config.security.passwordPolicy.requireNumbers && /\d/.test(password)) {
      score += 20
    } else if (config.security.passwordPolicy.requireNumbers) {
      feedback.push('Password must contain at least one number')
    }

    // Special characters check
    if (config.security.passwordPolicy.requireSpecialChars && /[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      score += 20
    } else if (config.security.passwordPolicy.requireSpecialChars) {
      feedback.push('Password must contain at least one special character')
    }

    return {
      isValid: feedback.length === 0,
      score,
      feedback
    }
  }

  // Private helper methods

  private async generateTokens(user: UserProfile, platform: string): Promise<AuthToken> {
    const config = this.getConfig()
    const now = DateTime.now()

    const payload = {
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      platform,
      permissions: user.permissions,
      sessionId: uuidv4(),
      iat: Math.floor(now.toSeconds()),
      exp: Math.floor(now.plus({ seconds: 3600 }).toSeconds()), // 1 hour
      iss: config.jwt.issuer,
      aud: config.jwt.audience
    }

    const refreshTokenPayload = {
      userId: user.id,
      platform,
      type: 'refresh',
      iat: Math.floor(now.toSeconds()),
      exp: Math.floor(now.plus({ days: 7 }).toSeconds()), // 7 days
      iss: config.jwt.issuer,
      aud: config.jwt.audience
    }

    const token = jwt.sign(payload, config.jwt.secret, { algorithm: config.jwt.algorithm as jwt.Algorithm })
    const refreshToken = jwt.sign(refreshTokenPayload, config.jwt.secret, { algorithm: config.jwt.algorithm as jwt.Algorithm })

    return {
      token,
      refreshToken,
      expiresAt: now.plus({ seconds: 3600 }),
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      platform: platform as 'online' | 'offline' | 'hybrid',
      permissions: user.permissions
    }
  }

  private async getUserByEmail(email: string): Promise<UserProfile | null> {
    try {
      const user = await this.db
        .from('users')
        .where('email', email.toLowerCase())
        .first()

      if (!user) {
        return null
      }

      return {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        schoolId: user.school_id,
        classId: user.class_id,
        isActive: user.is_active,
        lastLogin: user.last_login ? DateTime.fromISO(user.last_login) : undefined,
        preferences: user.preferences || {},
        permissions: user.permissions || []
      }

    } catch (error) {
      console.error('Get user by email error:', error)
      return null
    }
  }

  private async createUser(userData: any): Promise<UserProfile> {
    try {
      const now = DateTime.now()
      
      const [user] = await this.db.table('users').insert({
        email: userData.email.toLowerCase(),
        first_name: userData.firstName,
        last_name: userData.lastName,
        role: userData.role,
        school_id: userData.schoolId,
        class_id: userData.classId,
        password_hash: userData.password,
        preferences: userData.preferences,
        permissions: userData.permissions,
        is_active: true,
        created_at: now.toISO(),
        updated_at: now.toISO()
      }).returning('*')

      return {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        schoolId: user.school_id,
        classId: user.class_id,
        isActive: user.is_active,
        lastLogin: user.last_login ? DateTime.fromISO(user.last_login) : undefined,
        preferences: user.preferences || {},
        permissions: user.permissions || []
      }

    } catch (error) {
      console.error('Create user error:', error)
      throw new AuthenticationError('Failed to create user', 'CREATE_FAILED', 500)
    }
  }

  private async isAccountLocked(userId: string): Promise<boolean> {
    try {
      const lockoutRecord = await this.db
        .from('user_lockouts')
        .where('user_id', userId)
        .where('locked_until', '>', DateTime.now().toISO())
        .first()

      return !!lockoutRecord

    } catch (error) {
      console.error('Check account lock status error:', error)
      return false
    }
  }

  private async recordFailedLogin(userId: string): Promise<void> {
    try {
      const now = DateTime.now()
      const config = this.getConfig()

      // Increment failed login attempts
      await this.db
        .from('users')
        .where('id', userId)
        .increment('failed_login_attempts')

      // Get current failed attempts
      const user = await this.db
        .from('users')
        .where('id', userId)
        .first()

      if (user && user.failed_login_attempts >= config.security.maxLoginAttempts) {
        // Lock account
        await this.db.table('user_lockouts').insert({
          user_id: userId,
          locked_until: now.plus({ milliseconds: config.security.lockoutDuration }).toISO(),
          reason: 'Too many failed login attempts',
          created_at: now.toISO()
        })

        // Reset failed attempts
        await this.db
          .from('users')
          .where('id', userId)
          .update({ failed_login_attempts: 0 })
      }

    } catch (error) {
      console.error('Record failed login error:', error)
    }
  }

  private async resetFailedLoginAttempts(userId: string): Promise<void> {
    try {
      await this.db
        .from('users')
        .where('id', userId)
        .update({
          failed_login_attempts: 0,
          updated_at: DateTime.now().toISO()
        })

      // Remove any existing lockouts
      await this.db
        .from('user_lockouts')
        .where('user_id', userId)
        .delete()

    } catch (error) {
      console.error('Reset failed login attempts error:', error)
    }
  }

  private async updateLastLogin(userId: string): Promise<void> {
    try {
      await this.db
        .from('users')
        .where('id', userId)
        .update({
          last_login: DateTime.now().toISO(),
          updated_at: DateTime.now().toISO()
        })
    } catch (error) {
      console.error('Update last login error:', error)
    }
  }

  private async getActiveUserSessions(userId: string): Promise<SessionData[]> {
    try {
      const sessions = await this.db
        .from('user_sessions')
        .where('user_id', userId)
        .andWhere('is_active', true)
        .andWhere('expires_at', '>', DateTime.now().toISO())

      return sessions.map(session => ({
        sessionId: session.id,
        userId: session.user_id,
        userEmail: session.user_email,
        userRole: session.user_role,
        platform: session.platform,
        loginTime: DateTime.fromISO(session.login_time),
        lastActivity: DateTime.fromISO(session.last_activity),
        expiresAt: DateTime.fromISO(session.expires_at),
        ipAddress: session.ip_address,
        userAgent: session.user_agent,
        isActive: session.is_active
      }))

    } catch (error) {
      console.error('Get active user sessions error:', error)
      return []
    }
  }

  private async getPlatformToken(): Promise<string> {
    // This would implement OAuth client credentials flow
    // For now, return a placeholder
    return 'platform-token-placeholder'
  }

  private async syncUserToOnline(user: UserProfile): Promise<void> {
    // This would sync user data to INR99 Academy
    // Implementation depends on Academy API specifications
    console.log('Syncing user to online platform:', user.email)
  }
}