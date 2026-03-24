import { HttpContextContract } from '@adonisjs/core/http'
import { User } from '#models/user'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'

export default class AuthController {
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
      let user = await User.findBy('email', decoded.email)
      
      if (!user) {
        // Create user if doesn't exist in current platform
        user = await User.create({
          email: decoded.email,
          username: decoded.username || decoded.email.split('@')[0],
          firstName: decoded.firstName || '',
          lastName: decoded.lastName || '',
          role: decoded.role || 'student',
          platform: platform,
          ssoId: decoded.id || decoded.sub,
          isActive: true,
          emailVerified: decoded.emailVerified || false
        })
      } else {
        // Update user's SSO information
        user.merge({
          ssoId: decoded.id || decoded.sub,
          lastLoginAt: new Date(),
          platform: platform
        })
        await user.save()
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
      const user = await User.findBy('ssoId', decoded.id || decoded.sub)
      
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
      const user = await User.query()
        .where('email', credentials.email)
        .where('platform', 'offline')
        .first()

      if (!user) {
        return response.status(404).json({
          success: false,
          message: 'User not found in offline platform',
          code: 'USER_NOT_FOUND'
        })
      }

      // Verify password (if using password authentication)
      // For now, we'll use a simple verification
      if (!await Hash.verify(user.password, credentials.password)) {
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
      const user = await User.find(decoded.id)
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
   * Create user session
   */
  private async createSession(userId: number, sessionId: string, platform: string, ipAddress: string) {
    // This would typically be stored in Redis or database
    // For now, we'll use a simple in-memory approach
    const sessionData = {
      userId,
      sessionId,
      platform,
      ipAddress,
      createdAt: new Date(),
      lastActivity: new Date(),
      isActive: true
    }

    // Store session (implementation depends on your session store)
    await this.storeSession(sessionId, sessionData)
  }

  /**
   * Invalidate session
   */
  private async invalidateSession(sessionId: string) {
    // Remove session from store
    await this.removeSession(sessionId)
  }

  /**
   * Get pending sync data for user
   */
  private async getPendingSyncData(userId: number) {
    // This would query your sync queue for pending data
    // For now, return empty array
    return []
  }

  /**
   * Blacklist token
   */
  private async blacklistToken(token: string) {
    // Add token to blacklist store
    // Implementation depends on your blacklist strategy
  }

  /**
   * Store session
   */
  private async storeSession(sessionId: string, sessionData: any) {
    // Store session in your preferred session store
    // Redis implementation recommended for production
  }

  /**
   * Remove session
   */
  private async removeSession(sessionId: string) {
    // Remove session from your session store
  }
}