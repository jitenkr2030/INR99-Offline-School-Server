import { HttpContextContract } from '@adonisjs/core/http'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'

export default class HybridAuthController {
  /**
   * Single Sign-On (SSO) authentication for hybrid platform
   */
  public async ssoLogin({ request, response }: HttpContextContract) {
    try {
      const { token, platform } = request.only(['token', 'platform'])
      
      // Validate platform (academy or offline)
      if (!['academy', 'offline'].includes(platform)) {
        return response.status(400).json({
          success: false,
          message: 'Invalid platform specified',
          code: 'INVALID_PLATFORM'
        })
      }

      // Verify JWT token from originating platform
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
      
      // Find or create user in current platform
      let user = await this.findUser(decoded.email)
      
      if (!user) {
        // Create user if doesn't exist in current platform
        user = await this.createUser(decoded)
      } else {
        // Update user's SSO information
        user = await this.updateUser(user, decoded)
      }

      // Generate new token for current platform
      const newToken = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
          platform: platform,
          ssoId: user.ssoId
        },
        process.env.JWT_SECRET!,
        { expiresIn: '24h' }
      )

      // Create session
      const sessionId = crypto.randomUUID()
      await this.createSession(user.id, sessionId, platform, request.ip())

      return response.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            platform: platform
          },
          token: newToken,
          sessionId: sessionId,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        },
        message: 'SSO login successful'
      })

    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        return response.status(401).json({
          success: false,
          message: 'Invalid token',
          code: 'INVALID_TOKEN'
        })
      }

      return response.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      })
    }
  }

  /**
   * Validate token from partner platform
   */
  public async validateToken({ request, response }: HttpContextContract) {
    try {
      const { token, partnerPlatform } = request.only(['token', 'partnerPlatform'])
      
      // Validate partner platform
      const validPartners = ['inr99-academy', 'inr99-offline']
      if (!validPartners.includes(partnerPlatform)) {
        return response.status(400).json({
          success: false,
          message: 'Invalid partner platform',
          code: 'INVALID_PARTNER'
        })
      }

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any

      // Check if user exists in current platform
      const user = await this.findUser(decoded.email)
      
      if (!user) {
        return response.status(404).json({
          success: false,
          message: 'User not found in current platform',
          code: 'USER_NOT_FOUND'
        })
      }

      // Check if user is active
      if (!user.isActive) {
        return response.status(403).json({
          success: false,
          message: 'User account is inactive',
          code: 'ACCOUNT_INACTIVE'
        })
      }

      return response.json({
        success: true,
        data: {
          valid: true,
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            role: user.role,
            platform: user.platform
          }
        },
        message: 'Token is valid'
      })

    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        return response.status(401).json({
          success: false,
          message: 'Invalid or expired token',
          code: 'INVALID_TOKEN'
        })
      }

      return response.status(500).json({
        success: false,
        message: 'Token validation failed',
        code: 'VALIDATION_ERROR'
      })
    }
  }

  /**
   * Sync login for offline mode
   */
  public async syncLogin({ request, response }: HttpContextContract) {
    try {
      const { credentials, offlineData } = request.only(['credentials', 'offlineData'])
      
      // Validate offline credentials
      const user = await this.findUser(credentials.email)
      
      if (!user) {
        return response.status(404).json({
          success: false,
          message: 'User not found in offline platform',
          code: 'USER_NOT_FOUND'
        })
      }

      // Verify password (if using password authentication)
      if (!await this.verifyPassword(user.password, credentials.password)) {
        return response.status(401).json({
          success: false,
          message: 'Invalid credentials',
          code: 'INVALID_CREDENTIALS'
        })
      }

      // Check for pending sync data
      const pendingSync = await this.getPendingSyncData(user.id)

      // Generate sync token
      const syncToken = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
          syncMode: true,
          pendingSync: pendingSync.length
        },
        process.env.JWT_SECRET!,
        { expiresIn: '1h' }
      )

      return response.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            role: user.role,
            platform: user.platform
          },
          syncToken: syncToken,
          pendingSync: pendingSync,
          lastSyncAt: user.lastSyncAt
        },
        message: 'Sync login successful'
      })

    } catch (error) {
      return response.status(500).json({
        success: false,
        message: 'Sync login failed',
        code: 'SYNC_LOGIN_ERROR'
      })
    }
  }

  /**
   * Logout and invalidate session
   */
  public async logout({ request, response }: HttpContextContract) {
    try {
      const { sessionId, token } = request.only(['sessionId', 'token'])
      
      // Invalidate session
      if (sessionId) {
        await this.invalidateSession(sessionId)
      }

      // Add token to blacklist (optional implementation)
      await this.blacklistToken(token)

      return response.json({
        success: true,
        message: 'Logout successful'
      })

    } catch (error) {
      return response.status(500).json({
        success: false,
        message: 'Logout failed',
        code: 'LOGOUT_ERROR'
      })
    }
  }

  /**
   * Refresh token
   */
  public async refreshToken({ request, response }: HttpContextContract) {
    try {
      const { refreshToken } = request.only(['refreshToken'])
      
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as any
      
      // Find user
      const user = await this.findUser(decoded.id)
      if (!user || !user.isActive) {
        return response.status(401).json({
          success: false,
          message: 'Invalid refresh token',
          code: 'INVALID_REFRESH_TOKEN'
        })
      }

      // Generate new access token
      const newToken = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
          platform: user.platform
        },
        process.env.JWT_SECRET!,
        { expiresIn: '15m' }
      )

      return response.json({
        success: true,
        data: {
          token: newToken,
          expiresIn: 15 * 60 // 15 minutes in seconds
        },
        message: 'Token refreshed successfully'
      })

    } catch (error) {
      return response.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token',
        code: 'INVALID_REFRESH_TOKEN'
      })
    }
  }

  /**
   * Find user by email
   */
  private async findUser(email: string): Promise<any> {
    // This would typically query your user database
    // For now, return null as placeholder
    return null
  }

  /**
   * Create new user
   */
  private async createUser(userData: any): Promise<any> {
    // This would typically create a user in your database
    // For now, return a placeholder user object
    return {
      id: 1,
      email: userData.email,
      username: userData.username || userData.email.split('@')[0],
      firstName: userData.firstName || '',
      lastName: userData.lastName || '',
      role: userData.role || 'student',
      platform: 'hybrid',
      ssoId: userData.id || userData.sub,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }

  /**
   * Update user information
   */
  private async updateUser(user: any, userData: any): Promise<any> {
    // This would typically update the user in your database
    // For now, return the updated user object
    user.merge({
      firstName: userData.firstName || user.firstName,
      lastName: userData.lastName || user.lastName,
      ssoId: userData.id || userData.sub || user.ssoId,
      updatedAt: new Date()
    })
    return user
  }

  /**
   * Verify password
   */
  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    // This would typically use a password hashing library like bcrypt
    // For now, return true as placeholder
    return true
  }

  /**
   * Create user session
   */
  private async createSession(userId: number, sessionId: string, platform: string, ipAddress: string): Promise<void> {
    // This would typically create a session in your database
    // For now, just log the session creation
    console.log(`Session created: ${sessionId} for user ${userId} on ${platform}`)
  }

  /**
   * Invalidate session
   */
  private async invalidateSession(sessionId: string): Promise<void> {
    // This would typically invalidate the session in your database
    // For now, just log the session invalidation
    console.log(`Session invalidated: ${sessionId}`)
  }

  /**
   * Blacklist token
   */
  private async blacklistToken(token: string): Promise<void> {
    // This would typically add the token to a blacklist store
    // For now, just log the token blacklisting
    console.log(`Token blacklisted: ${token}`)
  }

  /**
   * Get pending sync data for user
   */
  private async getPendingSyncData(userId: number): Promise<any[]> {
    // This would typically query your sync data database
    // For now, return empty array as placeholder
    return []
  }
}