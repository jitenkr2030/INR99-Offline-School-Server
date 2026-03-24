import { inject } from '@adonisjs/core'
import { HttpContext } from '@adonisjs/core/http'
import { Database } from '@adonisjs/lucid/database'
import crypto from 'crypto'
import { DateTime } from 'luxon'

/**
 * Security Service
 * Handles security-related operations including encryption, rate limiting, and audit logging
 */
export interface SecurityConfig {
  encryption: {
    algorithm: string
    keyLength: number
    ivLength: number
    tagLength: number
  }
  rateLimit: {
    windowMs: number
    maxRequests: number
    skipSuccessfulRequests: boolean
  }
  audit: {
    logLevel: 'info' | 'warn' | 'error' | 'debug'
    retentionDays: number
    includeRequestBody: boolean
    includeResponseBody: boolean
  }
  csrf: {
    enabled: boolean
    tokenLength: number
    expiresMinutes: number
  }
  headers: {
    allowedOrigins: string[]
    allowedMethods: string[]
    allowedHeaders: string[]
    maxAge: number
  }
}

export interface SecurityEvent {
  id: string
  type: 'auth' | 'data_access' | 'data_modification' | 'security_violation' | 'system'
  severity: 'low' | 'medium' | 'high' | 'critical'
  userId?: string
  ipAddress: string
  userAgent: string
  resource: string
  action: string
  status: 'success' | 'failure' | 'warning'
  details: Record<string, any>
  timestamp: DateTime
  metadata?: Record<string, any>
}

export interface RateLimitInfo {
  remaining: number
  resetTime: DateTime
  limit: number
  windowMs: number
}

export interface EncryptionResult {
  encrypted: string
  iv: string
  tag: string
  algorithm: string
}

@inject()
export class SecurityService {
  constructor(
    private db: Database,
    private ctx: HttpContext
  ) {}

  /**
   * Get security configuration
   */
  private getConfig(): SecurityConfig {
    return {
      encryption: {
        algorithm: 'aes-256-gcm',
        keyLength: 32,
        ivLength: 12,
        tagLength: 16
      },
      rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 100,
        skipSuccessfulRequests: false
      },
      audit: {
        logLevel: 'info',
        retentionDays: 90,
        includeRequestBody: false,
        includeResponseBody: false
      },
      csrf: {
        enabled: true,
        tokenLength: 32,
        expiresMinutes: 60
      },
      headers: {
        allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:8080'],
        allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token'],
        maxAge: 86400 // 24 hours
      }
    }
  }

  /**
   * Encrypt sensitive data
   */
  async encrypt(data: string, key?: string): Promise<EncryptionResult> {
    const config = this.getConfig()
    const encryptionKey = key || process.env.ENCRYPTION_KEY || this.generateEncryptionKey()
    
    try {
      const iv = crypto.randomBytes(config.encryption.ivLength)
      const cipher = crypto.createCipher(config.encryption.algorithm, encryptionKey)
      cipher.setAAD(Buffer.from('INR99-Hybrid-Platform'))
      
      let encrypted = cipher.update(data, 'utf8', 'hex')
      encrypted += cipher.final('hex')
      
      const tag = cipher.getAuthTag()
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        algorithm: config.encryption.algorithm
      }

    } catch (error) {
      console.error('Encryption error:', error)
      throw new Error('Failed to encrypt data')
    }
  }

  /**
   * Decrypt sensitive data
   */
  async decrypt(encryptedData: string, iv: string, tag: string, key?: string): Promise<string> {
    const config = this.getConfig()
    const encryptionKey = key || process.env.ENCRYPTION_KEY || this.generateEncryptionKey()
    
    try {
      const decipher = crypto.createDecipher(config.encryption.algorithm, encryptionKey)
      decipher.setAAD(Buffer.from('INR99-Hybrid-Platform'))
      decipher.setAuthTag(Buffer.from(tag, 'hex'))
      
      let decrypted = decipher.update(encryptedData, 'hex', 'utf8')
      decrypted += decipher.final('utf8')
      
      return decrypted

    } catch (error) {
      console.error('Decryption error:', error)
      throw new Error('Failed to decrypt data')
    }
  }

  /**
   * Generate secure random token
   */
  generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex')
  }

  /**
   * Generate encryption key
   */
  private generateEncryptionKey(): string {
    return crypto.randomBytes(this.getConfig().encryption.keyLength).toString('hex')
  }

  /**
   * Hash password with salt
   */
  async hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
    const saltValue = salt || crypto.randomBytes(16).toString('hex')
    const hash = crypto.pbkdf2Sync(password, saltValue, 100000, 64, 'sha512').toString('hex')
    
    return {
      hash,
      salt: saltValue
    }
  }

  /**
   * Verify password against hash
   */
  verifyPassword(password: string, hash: string, salt: string): boolean {
    const computedHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex')
    return computedHash === hash
  }

  /**
   * Generate CSRF token
   */
  generateCSRFToken(sessionId: string): string {
    const config = this.getConfig()
    const timestamp = DateTime.now().toMillis()
    const data = `${sessionId}:${timestamp}`
    
    return crypto
      .createHmac('sha256', process.env.CSRF_SECRET || 'csrf-secret-key')
      .update(data)
      .digest('hex')
  }

  /**
   * Validate CSRF token
   */
  validateCSRFToken(token: string, sessionId: string): boolean {
    const config = this.getConfig()
    const generatedToken = this.generateCSRFToken(sessionId)
    
    // For simplicity, we'll use a time-based validation
    // In production, you'd want to store the token timestamp
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(generatedToken))
  }

  /**
   * Check rate limiting
   */
  async checkRateLimit(identifier: string, limit?: number): Promise<RateLimitInfo> {
    const config = this.getConfig()
    const maxRequests = limit || config.rateLimit.maxRequests
    const windowMs = config.rateLimit.windowMs
    const now = DateTime.now()
    const windowStart = now.minus({ milliseconds: windowMs })

    try {
      // Clean up old entries
      await this.db
        .from('rate_limits')
        .where('timestamp', '<', windowStart.toISO())
        .delete()

      // Get current request count
      const requests = await this.db
        .from('rate_limits')
        .where('identifier', identifier)
        .where('timestamp', '>=', windowStart.toISO())

      const requestCount = requests.length

      // Create new request entry
      await this.db.table('rate_limits').insert({
        id: this.generateId(),
        identifier,
        timestamp: now.toISO(),
        created_at: now.toISO()
      })

      const remaining = Math.max(0, maxRequests - requestCount - 1)
      const resetTime = now.plus({ milliseconds: windowMs })

      return {
        remaining,
        resetTime,
        limit: maxRequests,
        windowMs
      }

    } catch (error) {
      console.error('Rate limit check error:', error)
      // Fail open - allow the request
      return {
        remaining: maxRequests - 1,
        resetTime: DateTime.now().plus({ milliseconds: windowMs }),
        limit: maxRequests,
        windowMs
      }
    }
  }

  /**
   * Validate and sanitize input
   */
  sanitizeInput(input: string, maxLength: number = 1000): string {
    if (!input) return ''
    
    // Remove potentially dangerous characters
    const sanitized = input
      .replace(/[<>]/g, '') // Remove HTML tags
      .replace(/javascript:/gi, '') // Remove JavaScript URLs
      .replace(/on\w+=/gi, '') // Remove event handlers
      .substring(0, maxLength) // Limit length

    return sanitized.trim()
  }

  /**
   * Validate email format
   */
  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  /**
   * Validate password strength
   */
  validatePasswordStrength(password: string): {
    isValid: boolean
    score: number
    feedback: string[]
  } {
    const feedback: string[] = []
    let score = 0

    // Length check
    if (password.length >= 8) {
      score += 20
    } else {
      feedback.push('Password must be at least 8 characters long')
    }

    // Uppercase check
    if (/[A-Z]/.test(password)) {
      score += 20
    } else {
      feedback.push('Password must contain at least one uppercase letter')
    }

    // Lowercase check
    if (/[a-z]/.test(password)) {
      score += 20
    } else {
      feedback.push('Password must contain at least one lowercase letter')
    }

    // Numbers check
    if (/\d/.test(password)) {
      score += 20
    } else {
      feedback.push('Password must contain at least one number')
    }

    // Special characters check
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      score += 20
    } else {
      feedback.push('Password must contain at least one special character')
    }

    return {
      isValid: feedback.length === 0,
      score,
      feedback
    }
  }

  /**
   * Log security event
   */
  async logSecurityEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>): Promise<void> {
    try {
      const securityEvent: SecurityEvent = {
        id: this.generateId(),
        ...event,
        timestamp: DateTime.now()
      }

      await this.db.table('security_audit_log').insert({
        id: securityEvent.id,
        type: securityEvent.type,
        severity: securityEvent.severity,
        user_id: securityEvent.userId,
        ip_address: securityEvent.ipAddress,
        user_agent: securityEvent.userAgent,
        resource: securityEvent.resource,
        action: securityEvent.action,
        status: securityEvent.status,
        details: JSON.stringify(securityEvent.details),
        metadata: securityEvent.metadata ? JSON.stringify(securityEvent.metadata) : null,
        created_at: securityEvent.timestamp.toISO()
      })

      // Also log to console for critical events
      if (securityEvent.severity === 'critical' || securityEvent.severity === 'high') {
        console.warn(`SECURITY EVENT [${securityEvent.severity.toUpperCase()}]:`, {
          type: securityEvent.type,
          action: securityEvent.action,
          userId: securityEvent.userId,
          ipAddress: securityEvent.ipAddress,
          details: securityEvent.details
        })
      }

    } catch (error) {
      console.error('Failed to log security event:', error)
    }
  }

  /**
   * Check for suspicious activity
   */
  async checkSuspiciousActivity(userId: string, ipAddress: string): Promise<{
    isSuspicious: boolean
    reasons: string[]
    riskScore: number
  }> {
    const reasons: string[] = []
    let riskScore = 0

    try {
      const now = DateTime.now()
      const recentTime = now.minus({ hours: 1 })

      // Check for multiple failed logins
      const failedLogins = await this.db
        .from('security_audit_log')
        .where('user_id', userId)
        .where('action', 'login')
        .where('status', 'failure')
        .where('created_at', '>=', recentTime.toISO())
        .count()

      if (failedLogins >= 5) {
        reasons.push('Multiple failed login attempts')
        riskScore += 30
      }

      // Check for logins from multiple IPs
      const uniqueIPs = await this.db
        .from('security_audit_log')
        .where('user_id', userId)
        .where('action', 'login')
        .where('status', 'success')
        .where('created_at', '>=', recentTime.toISO())
        .distinct('ip_address')

      if (uniqueIPs.length >= 3) {
        reasons.push('Multiple login locations detected')
        riskScore += 20
      }

      // Check for unusual user agent changes
      const recentLogins = await this.db
        .from('security_audit_log')
        .where('user_id', userId)
        .where('action', 'login')
        .where('status', 'success')
        .where('created_at', '>=', recentTime.toISO())
        .orderBy('created_at', 'desc')
        .limit(5)

      if (recentLogins.length > 1) {
        const userAgents = recentLogins.map(login => login.user_agent)
        const uniqueUserAgents = [...new Set(userAgents)]
        
        if (uniqueUserAgents.length > 2) {
          reasons.push('Unusual device or browser usage')
          riskScore += 15
        }
      }

      // Check for rapid API calls
      const recentAPICalls = await this.db
        .from('security_audit_log')
        .where('ip_address', ipAddress)
        .where('type', 'data_access')
        .where('created_at', '>=', now.minus({ minutes: 1 }).toISO())
        .count()

      if (recentAPICalls >= 100) {
        reasons.push('Unusually high API call rate')
        riskScore += 25
      }

      const isSuspicious = riskScore >= 30 || reasons.length > 0

      if (isSuspicious) {
        await this.logSecurityEvent({
          type: 'security_violation',
          severity: riskScore >= 50 ? 'high' : 'medium',
          userId,
          ipAddress,
          userAgent: this.ctx.request.header('user-agent') || 'Unknown',
          resource: 'security_check',
          action: 'suspicious_activity_detected',
          status: 'warning',
          details: {
            riskScore,
            reasons,
            recentFailedLogins: failedLogins,
            uniqueIPs: uniqueIPs.length
          }
        })
      }

      return {
        isSuspicious,
        reasons,
        riskScore
      }

    } catch (error) {
      console.error('Error checking suspicious activity:', error)
      return {
        isSuspicious: false,
        reasons: [],
        riskScore: 0
      }
    }
  }

  /**
   * Generate API key
   */
  async generateAPIKey(userId: string, permissions: string[]): Promise<string> {
    const payload = {
      userId,
      permissions,
      generatedAt: DateTime.now().toMillis(),
      random: this.generateSecureToken(16)
    }

    const apiKey = crypto
      .createHmac('sha256', process.env.API_KEY_SECRET || 'api-key-secret')
      .update(JSON.stringify(payload))
      .digest('hex')

    // Store API key hash for validation
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex')
    
    await this.db.table('api_keys').insert({
      id: this.generateId(),
      user_id: userId,
      key_hash: keyHash,
      permissions: JSON.stringify(permissions),
      expires_at: DateTime.now().plus({ years: 1 }).toISO(),
      is_active: true,
      created_at: DateTime.now().toISO(),
      updated_at: DateTime.now().toISO()
    })

    return `inr99_${apiKey}`
  }

  /**
   * Validate API key
   */
  async validateAPIKey(apiKey: string): Promise<{
    isValid: boolean
    userId?: string
    permissions?: string[]
  }> {
    try {
      // Remove prefix
      const keyWithoutPrefix = apiKey.replace('inr99_', '')
      const keyHash = crypto.createHash('sha256').update(keyWithoutPrefix).digest('hex')

      const storedKey = await this.db
        .from('api_keys')
        .where('key_hash', keyHash)
        .where('is_active', true)
        .where('expires_at', '>', DateTime.now().toISO())
        .first()

      if (!storedKey) {
        return { isValid: false }
      }

      return {
        isValid: true,
        userId: storedKey.user_id,
        permissions: JSON.parse(storedKey.permissions)
      }

    } catch (error) {
      console.error('API key validation error:', error)
      return { isValid: false }
    }
  }

  /**
   * Setup security headers
   */
  setupSecurityHeaders(response: any): void {
    const config = this.getConfig()

    // Content Security Policy
    response.header('Content-Security-Policy', 
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: https:; " +
      "font-src 'self' data:; " +
      "connect-src 'self' https:; " +
      "frame-ancestors 'none';"
    )

    // Other security headers
    response.header('X-Content-Type-Options', 'nosniff')
    response.header('X-Frame-Options', 'DENY')
    response.header('X-XSS-Protection', '1; mode=block')
    response.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    response.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

    // CORS headers
    const origin = this.ctx.request.header('origin')
    if (config.headers.allowedOrigins.includes('*') || (origin && config.headers.allowedOrigins.includes(origin))) {
      response.header('Access-Control-Allow-Origin', origin || '*')
    }

    response.header('Access-Control-Allow-Methods', config.headers.allowedMethods.join(', '))
    response.header('Access-Control-Allow-Headers', config.headers.allowedHeaders.join(', '))
    response.header('Access-Control-Allow-Credentials', 'true')
    response.header('Access-Control-Max-Age', config.headers.maxAge.toString())
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return crypto.randomBytes(16).toString('hex')
  }

  /**
   * Clean up old security logs
   */
  async cleanupOldLogs(): Promise<void> {
    try {
      const config = this.getConfig()
      const cutoffDate = DateTime.now().minus({ days: config.audit.retentionDays })

      await this.db
        .from('security_audit_log')
        .where('created_at', '<', cutoffDate.toISO())
        .delete()

      await this.db
        .from('rate_limits')
        .where('timestamp', '<', cutoffDate.toISO())
        .delete()

    } catch (error) {
      console.error('Error cleaning up old logs:', error)
    }
  }

  /**
   * Get security metrics
   */
  async getSecurityMetrics(): Promise<any> {
    try {
      const now = DateTime.now()
      const last24Hours = now.minus({ hours: 24 })
      const last7Days = now.minus({ days: 7 })

      const [
        totalEvents,
        criticalEvents,
        failedLogins,
        suspiciousActivities,
        activeAPIKeys
      ] = await Promise.all([
        this.db.from('security_audit_log').count('* as total'),
        this.db.from('security_audit_log').where('severity', 'critical').count('* as total'),
        this.db.from('security_audit_log').where('action', 'login').where('status', 'failure').where('created_at', '>=', last24Hours.toISO()).count('* as total'),
        this.db.from('security_audit_log').where('type', 'security_violation').where('created_at', '>=', last7Days.toISO()).count('* as total'),
        this.db.from('api_keys').where('is_active', true).where('expires_at', '>', now.toISO()).count('* as total')
      ])

      return {
        totalEvents: totalEvents[0].total,
        criticalEvents: criticalEvents[0].total,
        failedLogins24h: failedLogins[0].total,
        suspiciousActivities7d: suspiciousActivities[0].total,
        activeAPIKeys: activeAPIKeys[0].total,
        lastCleanup: now.toISO()
      }

    } catch (error) {
      console.error('Error getting security metrics:', error)
      return {
        totalEvents: 0,
        criticalEvents: 0,
        failedLogins24h: 0,
        suspiciousActivities7d: 0,
        activeAPIKeys: 0,
        lastCleanup: null
      }
    }
  }
}