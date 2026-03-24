import { HttpContextContract } from '@adonisjs/core/http'
import { Response } from '@adonisjs/core/http'
import HybridUser from '#models/hybrid_user'
import HybridSession from '#models/hybrid_session'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'

export interface AuthenticatedUser {
  id: number
  email: string
  username: string
  role: string
  platform: string
  ssoId: string
  sessionId: string
}

/**
 * Authentication middleware for hybrid platform
 */
export class HybridAuthMiddleware {
  /**
   * Handle authentication
   */
  public async handle({ request, response }: HttpContextContract, next: () => Promise<void>) {
    try {
      const token = this.extractToken(request)
      
      if (!token) {
        return this.unauthorized(response, 'No token provided')
      }

      const user = await this.authenticateToken(token)
      if (!user) {
        return this.unauthorized(response, 'Invalid token')
      }

      // Check if session is valid
      const session = await this.validateSession(user.sessionId, request.ip())
      if (!session || !session.isValid) {
        return this.unauthorized(response, 'Invalid or expired session')
      }

      // Update last activity
      await session.updateLastActivity()

      // Attach user to request
      request.user = user
      request.session = session

      await next()

    } catch (error) {
      return this.unauthorized(response, 'Authentication failed')
    }
  }

  /**
   * Extract token from request
   */
  private extractToken(request: HttpContextContract): string | null {
    const authHeader = request.header('Authorization')
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7)
    }

    // Also check for token in query parameters (for WebSocket connections)
    const tokenParam = request.qs().token
    if (typeof tokenParam === 'string') {
      return tokenParam
    }

    return null
  }

  /**
   * Authenticate JWT token
   */
  private async authenticateToken(token: string): Promise<AuthenticatedUser | null> {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
      
      // Find user in database
      const user = await HybridUser.find(decoded.id)
      if (!user || !user.isActive) {
        return null
      }

      // Verify token matches user
      if (user.email !== decoded.email || user.ssoId !== decoded.ssoId) {
        return null
      }

      return {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        platform: user.platform,
        ssoId: user.ssoId,
        sessionId: decoded.sessionId
      }

    } catch (error) {
      return null
    }
  }

  /**
   * Validate session
   */
  private async validateSession(sessionId: string, ipAddress: string): Promise<HybridSession | null> {
    const session = await HybridSession.query()
      .where('sessionId', sessionId)
      .preload('user')
      .first()

    if (!session) {
      return null
    }

    // Check if IP address matches (optional security measure)
    if (session.ipAddress !== ipAddress) {
      // Log suspicious activity but don't block (mobile IPs can change)
      console.warn(`IP address mismatch for session ${sessionId}: ${session.ipAddress} vs ${ipAddress}`)
    }

    return session
  }

  /**
   * Return unauthorized response
   */
  private unauthorized(response: Response, message: string) {
    return response.status(401).json({
      success: false,
      message,
      code: 'UNAUTHORIZED'
    })
  }
}

/**
 * Role-based authorization middleware
 */
export class RoleAuthorizationMiddleware {
  /**
   * Handle role-based authorization
   */
  public async handle({ request, response }: HttpContextContract, next: () => Promise<void>, roles: string[]) {
    const user = request.user as AuthenticatedUser

    if (!user) {
      return response.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED'
      })
    }

    if (!this.hasRequiredRole(user.role, roles)) {
      return response.status(403).json({
        success: false,
        message: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS'
      })
    }

    await next()
  }

  /**
   * Check if user has required role
   */
  private hasRequiredRole(userRole: string, requiredRoles: string[]): boolean {
    // Admin has access to everything
    if (userRole === 'admin') {
      return true
    }

    // Check if user's role is in required roles
    return requiredRoles.includes(userRole)
  }
}

/**
 * Platform access middleware
 */
export class PlatformAccessMiddleware {
  /**
   * Handle platform access authorization
   */
  public async handle({ request, response }: HttpContextContract, next: () => Promise<void>, platforms: string[]) {
    const user = request.user as AuthenticatedUser

    if (!user) {
      return response.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED'
      })
    }

    if (!this.hasPlatformAccess(user.platform, platforms)) {
      return response.status(403).json({
        success: false,
        message: 'Platform access denied',
        code: 'PLATFORM_ACCESS_DENIED'
      })
    }

    await next()
  }

  /**
   * Check if user has access to platform
   */
  private hasPlatformAccess(userPlatform: string, requiredPlatforms: string[]): boolean {
    // Hybrid users have access to all platforms
    if (userPlatform === 'hybrid') {
      return true
    }

    // Check if user's platform is in required platforms
    return requiredPlatforms.includes(userPlatform)
  }
}

/**
 * Rate limiting middleware
 */
export class RateLimitMiddleware {
  private static requests = new Map<string, { count: number; resetTime: number }>()
  private static readonly WINDOW_SIZE = 60 * 1000 // 1 minute
  private static readonly MAX_REQUESTS = 100 // 100 requests per minute

  /**
   * Handle rate limiting
   */
  public async handle({ request, response }: HttpContextContract, next: () => Promise<void>, options: { windowSize?: number; maxRequests?: number } = {}) {
    const windowSize = options.windowSize || RateLimitMiddleware.WINDOW_SIZE
    const maxRequests = options.maxRequests || RateLimitMiddleware.MAX_REQUESTS
    
    const clientId = this.getClientId(request)
    const now = Date.now()

    // Get or create client rate limit data
    let clientData = RateLimitMiddleware.requests.get(clientId)
    
    if (!clientData || now > clientData.resetTime) {
      // Reset or initialize client data
      clientData = {
        count: 1,
        resetTime: now + windowSize
      }
      RateLimitMiddleware.requests.set(clientId, clientData)
    } else {
      // Increment request count
      clientData.count++
    }

    // Check if rate limit exceeded
    if (clientData.count > maxRequests) {
      const resetIn = Math.ceil((clientData.resetTime - now) / 1000)
      
      return response.status(429).json({
        success: false,
        message: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        data: {
          resetIn: `${resetIn} seconds`,
          limit: maxRequests,
          window: `${windowSize / 1000} seconds`
        }
      })
    }

    // Add rate limit headers
    response.header('X-RateLimit-Limit', maxRequests.toString())
    response.header('X-RateLimit-Remaining', Math.max(0, maxRequests - clientData.count).toString())
    response.header('X-RateLimit-Reset', new Date(clientData.resetTime).toISOString())

    await next()
  }

  /**
   * Get client identifier for rate limiting
   */
  private getClientId(request: HttpContextContract): string {
    // Use IP address as client identifier
    return request.ip()
  }

  /**
   * Clean up old rate limit data
   */
  public static cleanup(): void {
    const now = Date.now()
    
    for (const [clientId, data] of this.requests.entries()) {
      if (now > data.resetTime) {
        this.requests.delete(clientId)
      }
    }
  }
}

/**
 * CORS middleware for cross-platform requests
 */
export class CORSMiddleware {
  /**
   * Handle CORS
   */
  public async handle({ request, response }: HttpContextContract, next: () => Promise<void>, options: { origins?: string[]; methods?: string[]; headers?: string[] } = {}) {
    const origins = options.origins || ['http://localhost:8080', 'https://inr99.academy', 'https://inr99-schoolserver.com']
    const methods = options.methods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    const headers = options.headers || ['Content-Type', 'Authorization', 'X-Requested-With']

    const origin = request.header('Origin')
    
    if (origin && origins.includes(origin)) {
      response.header('Access-Control-Allow-Origin', origin)
    } else if (!origin || origins.includes('*')) {
      response.header('Access-Control-Allow-Origin', '*')
    }

    response.header('Access-Control-Allow-Methods', methods.join(', '))
    response.header('Access-Control-Allow-Headers', headers.join(', '))
    response.header('Access-Control-Allow-Credentials', 'true')
    response.header('Access-Control-Max-Age', '86400') // 24 hours

    // Handle preflight requests
    if (request.method() === 'OPTIONS') {
      return response.status(200).json({
        success: true,
        message: 'CORS preflight request successful'
      })
    }

    await next()
  }
}

/**
 * Request validation middleware
 */
export class ValidationMiddleware {
  /**
   * Validate request data
   */
  public static validate(schema: any) {
    return async ({ request, response }: HttpContextContract, next: () => Promise<void>) => {
      try {
        await request.validate(schema)
        await next()
      } catch (error) {
        return response.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: error.messages
        })
      }
    }
  }

  /**
   * Sanitize input data
   */
  public static sanitize(data: any): any {
    if (typeof data !== 'object' || data === null) {
      return data
    }

    const sanitized: any = {}
    
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        // Remove potentially dangerous characters
        sanitized[key] = value
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '')
          .trim()
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitize(value)
      } else {
        sanitized[key] = value
      }
    }

    return sanitized
  }
}

/**
 * Security headers middleware
 */
export class SecurityHeadersMiddleware {
  /**
   * Add security headers
   */
  public async handle({ response }: HttpContextContract, next: () => Promise<void>) {
    // Prevent clickjacking
    response.header('X-Frame-Options', 'DENY')
    
    // Prevent MIME type sniffing
    response.header('X-Content-Type-Options', 'nosniff')
    
    // Enable XSS protection
    response.header('X-XSS-Protection', '1; mode=block')
    
    // Enforce HTTPS
    response.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    
    // Content Security Policy
    response.header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https:; connect-src 'self' https:; frame-ancestors 'none';")
    
    // Referrer policy
    response.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    
    // Permissions policy
    response.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')

    await next()
  }
}

/**
 * API key authentication middleware (for external API access)
 */
export class ApiKeyAuthMiddleware {
  /**
   * Handle API key authentication
   */
  public async handle({ request, response }: HttpContextContract, next: () => Promise<void>) {
    const apiKey = this.extractApiKey(request)
    
    if (!apiKey) {
      return response.status(401).json({
        success: false,
        message: 'API key required',
        code: 'API_KEY_REQUIRED'
      })
    }

    const isValid = await this.validateApiKey(apiKey)
    if (!isValid) {
      return response.status(401).json({
        success: false,
        message: 'Invalid API key',
        code: 'INVALID_API_KEY'
      })
    }

    // Add API key info to request
    request.apiKey = apiKey

    await next()
  }

  /**
   * Extract API key from request
   */
  private extractApiKey(request: HttpContextContract): string | null {
    // Check header first
    const headerKey = request.header('X-API-Key')
    if (headerKey) {
      return headerKey
    }

    // Check query parameter
    const queryKey = request.qs().api_key
    if (typeof queryKey === 'string') {
      return queryKey
    }

    return null
  }

  /**
   * Validate API key
   */
  private async validateApiKey(apiKey: string): Promise<boolean> {
    // Implementation would validate API key against database
    // For now, check against environment variable
    const validApiKeys = process.env.VALID_API_KEYS?.split(',') || []
    return validApiKeys.includes(apiKey)
  }
}

/**
 * Audit logging middleware
 */
export class AuditLogMiddleware {
  /**
   * Log API requests for audit purposes
   */
  public async handle({ request, response }: HttpContextContract, next: () => Promise<void>) {
    const startTime = Date.now()
    
    await next()
    
    const endTime = Date.now()
    const duration = endTime - startTime

    // Log request details
    const logData = {
      method: request.method(),
      url: request.url(),
      ip: request.ip(),
      userAgent: request.header('User-Agent'),
      userId: (request.user as AuthenticatedUser)?.id,
      statusCode: response.response.statusCode,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    }

    // Log to console (in production, use proper logging service)
    console.log('AUDIT:', JSON.stringify(logData))

    // Add audit info to response headers (optional)
    response.header('X-Request-ID', crypto.randomUUID())
    response.header('X-Response-Time', `${duration}ms`)
  }
}

// Clean up rate limit data periodically
setInterval(() => {
  RateLimitMiddleware.cleanup()
}, 5 * 60 * 1000) // Every 5 minutes