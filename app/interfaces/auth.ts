import { DateTime } from 'luxon'

export interface AuthToken {
  token: string
  refreshToken: string
  expiresAt: DateTime
  userId: string
  userEmail: string
  userRole: string
  platform: 'online' | 'offline' | 'hybrid'
  permissions: string[]
}

export interface UserCredentials {
  email: string
  password: string
  platform?: 'online' | 'offline' | 'hybrid'
}

export interface UserProfile {
  id: string
  email: string
  firstName: string
  lastName: string
  role: 'student' | 'teacher' | 'admin' | 'parent'
  schoolId: string
  classId?: string
  isActive: boolean
  lastLogin?: DateTime
  preferences: Record<string, any>
  permissions: string[]
}

export interface SessionData {
  sessionId: string
  userId: string
  userEmail: string
  userRole: string
  platform: string
  loginTime: DateTime
  lastActivity: DateTime
  expiresAt: DateTime
  ipAddress: string
  userAgent: string
  isActive: boolean
}

/**
 * Authentication Service Interface
 * Handles unified authentication across INR99 Academy and Offline Server
 */
export interface IAuthService {
  // Core Authentication
  authenticate(credentials: UserCredentials): Promise<AuthToken>
  validateToken(token: string): Promise<UserProfile | null>
  refreshToken(refreshToken: string): Promise<AuthToken>
  logout(token: string): Promise<void>

  // Cross-Platform Authentication
  validateOnlineToken(token: string): Promise<UserProfile | null>
  validateOfflineToken(token: string): Promise<UserProfile | null>
  syncAuthData(user: UserProfile): Promise<void>

  // Session Management
  createSession(user: UserProfile, platform: string, context: any): Promise<SessionData>
  validateSession(sessionId: string): Promise<SessionData | null>
  updateSessionActivity(sessionId: string): Promise<void>
  destroySession(sessionId: string): Promise<void>

  // User Management
  getUserProfile(userId: string): Promise<UserProfile | null>
  updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<UserProfile>
  syncUserFromOnline(onlineUserId: string): Promise<UserProfile>
  syncUserFromOffline(offlineUserId: string): Promise<UserProfile>

  // Security
  hashPassword(password: string): Promise<string>
  verifyPassword(password: string, hash: string): Promise<boolean>
  generateSecureToken(length: number): Promise<string>
  validateStrength(password: string): Promise<{ isValid: boolean; score: number; feedback: string[] }>
}

/**
 * JWT Token Configuration
 */
export interface JWTConfig {
  secret: string
  algorithm: string
  expiresIn: string
  refreshTokenExpiresIn: string
  issuer: string
  audience: string
}

/**
 * Authentication Configuration
 */
export interface AuthConfig {
  jwt: JWTConfig
  platforms: {
    online: {
      apiUrl: string
      oauthUrl: string
      clientId: string
      clientSecret: string
      redirectUri: string
    }
    offline: {
      apiUrl: string
      secretKey: string
      tokenValidationEndpoint: string
    }
  }
  security: {
    maxLoginAttempts: number
    lockoutDuration: number
    sessionTimeout: number
    passwordPolicy: {
      minLength: number
      requireUppercase: boolean
      requireLowercase: boolean
      requireNumbers: boolean
      requireSpecialChars: boolean
    }
  }
  sync: {
    autoSyncUsers: boolean
    syncInterval: number
    conflictResolution: 'online_wins' | 'offline_wins' | 'manual'
  }
}

/**
 * Authentication Error Types
 */
export class AuthenticationError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 401
  ) {
    super(message)
    this.name = 'AuthenticationError'
  }
}

export class InvalidCredentialsError extends AuthenticationError {
  constructor(message: string = 'Invalid credentials') {
    super(message, 'INVALID_CREDENTIALS', 401)
  }
}

export class TokenExpiredError extends AuthenticationError {
  constructor(message: string = 'Token has expired') {
    super(message, 'TOKEN_EXPIRED', 401)
  }
}

export class UserNotFoundError extends AuthenticationError {
  constructor(message: string = 'User not found') {
    super(message, 'USER_NOT_FOUND', 404)
  }
}

export class AccountLockedError extends AuthenticationError {
  constructor(message: string = 'Account is locked') {
    super(message, 'ACCOUNT_LOCKED', 423)
  }
}

export class InsufficientPermissionsError extends AuthenticationError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'INSUFFICIENT_PERMISSIONS', 403)
  }
}