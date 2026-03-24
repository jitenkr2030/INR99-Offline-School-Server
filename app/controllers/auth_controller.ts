import { inject } from '@adonisjs/core'
import { HttpContext } from '@adonisjs/core/http'
import { Response } from '@adonisjs/core/http'
import { Validator } from '@adonisjs/core/validator'

import { AuthService } from '../services/auth_service.js'
import {
  AuthToken,
  UserCredentials,
  UserProfile,
  SessionData,
  InvalidCredentialsError,
  TokenExpiredError,
  UserNotFoundError,
  AccountLockedError,
  InsufficientPermissionsError
} from '../interfaces/auth.js'

/**
 * Authentication Controller
 * Handles HTTP requests for authentication operations
 */
@inject()
export class AuthController {
  constructor(
    private authService: AuthService,
    private ctx: HttpContext
  ) {}

  /**
   * Authenticate user and return tokens
   */
  public async authenticate({ request, response }: HttpContext): Promise<Response> {
    try {
      const credentials = await request.validate({
        email: 'required|email',
        password: 'required|string',
        platform: 'optional|string|in:online,offline,hybrid'
      } as any)

      const authToken = await this.authService.authenticate(credentials)

      return response.json({
        success: true,
        data: {
          token: authToken.token,
          refreshToken: authToken.refreshToken,
          expiresAt: authToken.expiresAt.toISO(),
          user: {
            id: authToken.userId,
            email: authToken.userEmail,
            role: authToken.userRole,
            platform: authToken.platform,
            permissions: authToken.permissions
          }
        }
      })

    } catch (error) {
      return this.handleAuthError(error, response)
    }
  }

  /**
   * Validate JWT token
   */
  public async validateToken({ request, response }: HttpContext): Promise<Response> {
    try {
      const { token } = await request.validate({
        token: 'required|string'
      } as any)

      const user = await this.authService.validateToken(token)

      if (!user) {
        return response.status(401).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid or expired token'
          }
        })
      }

      return response.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            schoolId: user.schoolId,
            classId: user.classId,
            permissions: user.permissions
          }
        }
      })

    } catch (error) {
      return this.handleAuthError(error, response)
    }
  }

  /**
   * Refresh access token
   */
  public async refreshToken({ request, response }: HttpContext): Promise<Response> {
    try {
      const { refreshToken } = await request.validate({
        refreshToken: 'required|string'
      } as any)

      const authToken = await this.authService.refreshToken(refreshToken)

      return response.json({
        success: true,
        data: {
          token: authToken.token,
          refreshToken: authToken.refreshToken,
          expiresAt: authToken.expiresAt.toISO(),
          user: {
            id: authToken.userId,
            email: authToken.userEmail,
            role: authToken.userRole,
            platform: authToken.platform,
            permissions: authToken.permissions
          }
        }
      })

    } catch (error) {
      return this.handleAuthError(error, response)
    }
  }

  /**
   * Logout user
   */
  public async logout({ request, response }: HttpContext): Promise<Response> {
    try {
      const { token } = await request.validate({
        token: 'required|string'
      } as any)

      await this.authService.logout(token)

      return response.json({
        success: true,
        message: 'Logged out successfully'
      })

    } catch (error) {
      return response.status(500).json({
        success: false,
        error: {
          code: 'LOGOUT_FAILED',
          message: 'Failed to logout'
        }
      })
    }
  }

  /**
   * Get current user profile
   */
  public async getProfile({ request, response }: HttpContext): Promise<Response> {
    try {
      const token = this.extractTokenFromRequest(request)
      if (!token) {
        return response.status(401).json({
          success: false,
          error: {
            code: 'NO_TOKEN',
            message: 'No authentication token provided'
          }
        })
      }

      const user = await this.authService.validateToken(token)
      if (!user) {
        return response.status(401).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid or expired token'
          }
        })
      }

      return response.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            schoolId: user.schoolId,
            classId: user.classId,
            isActive: user.isActive,
            lastLogin: user.lastLogin?.toISO(),
            preferences: user.preferences,
            permissions: user.permissions
          }
        }
      })

    } catch (error) {
      return this.handleAuthError(error, response)
    }
  }

  /**
   * Update user profile
   */
  public async updateProfile({ request, response }: HttpContext): Promise<Response> {
    try {
      const token = this.extractTokenFromRequest(request)
      if (!token) {
        return response.status(401).json({
          success: false,
          error: {
            code: 'NO_TOKEN',
            message: 'No authentication token provided'
          }
        })
      }

      const currentUser = await this.authService.validateToken(token)
      if (!currentUser) {
        return response.status(401).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid or expired token'
          }
        })
      }

      const updates = await request.validate({
        firstName: 'optional|string',
        lastName: 'optional|string',
        preferences: 'optional|object',
        classId: 'optional|string'
      } as any)

      const updatedUser = await this.authService.updateUserProfile(currentUser.id, updates)

      return response.json({
        success: true,
        data: {
          user: {
            id: updatedUser.id,
            email: updatedUser.email,
            firstName: updatedUser.firstName,
            lastName: updatedUser.lastName,
            role: updatedUser.role,
            schoolId: updatedUser.schoolId,
            classId: updatedUser.classId,
            isActive: updatedUser.isActive,
            lastLogin: updatedUser.lastLogin?.toISO(),
            preferences: updatedUser.preferences,
            permissions: updatedUser.permissions
          }
        }
      })

    } catch (error) {
      return this.handleAuthError(error, response)
    }
  }

  /**
   * Change password
   */
  public async changePassword({ request, response }: HttpContext): Promise<Response> {
    try {
      const token = this.extractTokenFromRequest(request)
      if (!token) {
        return response.status(401).json({
          success: false,
          error: {
            code: 'NO_TOKEN',
            message: 'No authentication token provided'
          }
        })
      }

      const currentUser = await this.authService.validateToken(token)
      if (!currentUser) {
        return response.status(401).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid or expired token'
          }
        })
      }

      const { currentPassword, newPassword } = await request.validate({
        currentPassword: 'required|string',
        newPassword: 'required|string|minLength:8'
      } as any)

      // Validate current password
      const userRecord = await this.db
        .from('users')
        .where('id', currentUser.id)
        .first()

      if (!userRecord) {
        return response.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found'
          }
        })
      }

      const isValidCurrentPassword = await this.authService.verifyPassword(currentPassword, userRecord.password_hash)
      if (!isValidCurrentPassword) {
        return response.status(400).json({
          success: false,
          error: {
            code: 'INVALID_CURRENT_PASSWORD',
            message: 'Current password is incorrect'
          }
        })
      }

      // Validate new password strength
      const passwordValidation = await this.authService.validateStrength(newPassword)
      if (!passwordValidation.isValid) {
        return response.status(400).json({
          success: false,
          error: {
            code: 'WEAK_PASSWORD',
            message: 'Password does not meet security requirements',
            feedback: passwordValidation.feedback
          }
        })
      }

      // Update password
      const newPasswordHash = await this.authService.hashPassword(newPassword)
      await this.db
        .from('users')
        .where('id', currentUser.id)
        .update({
          password_hash: newPasswordHash,
          password_changed_at: DateTime.now().toISO(),
          updated_at: DateTime.now().toISO()
        })

      return response.json({
        success: true,
        message: 'Password changed successfully'
      })

    } catch (error) {
      return this.handleAuthError(error, response)
    }
  }

  /**
   * Validate online platform token
   */
  public async validateOnlineToken({ request, response }: HttpContext): Promise<Response> {
    try {
      const { token } = await request.validate({
        token: 'required|string'
      } as any)

      const user = await this.authService.validateOnlineToken(token)

      if (!user) {
        return response.status(401).json({
          success: false,
          error: {
            code: 'INVALID_ONLINE_TOKEN',
            message: 'Invalid or expired online platform token'
          }
        })
      }

      return response.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            schoolId: user.schoolId,
            classId: user.classId,
            permissions: user.permissions
          },
          platform: 'online'
        }
      })

    } catch (error) {
      return this.handleAuthError(error, response)
    }
  }

  /**
   * Validate offline platform token
   */
  public async validateOfflineToken({ request, response }: HttpContext): Promise<Response> {
    try {
      const { token } = await request.validate({
        token: 'required|string'
      } as any)

      const user = await this.authService.validateOfflineToken(token)

      if (!user) {
        return response.status(401).json({
          success: false,
          error: {
            code: 'INVALID_OFFLINE_TOKEN',
            message: 'Invalid or expired offline platform token'
          }
        })
      }

      return response.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            schoolId: user.schoolId,
            classId: user.classId,
            permissions: user.permissions
          },
          platform: 'offline'
        }
      })

    } catch (error) {
      return this.handleAuthError(error, response)
    }
  }

  /**
   * Sync user from online platform
   */
  public async syncUserFromOnline({ request, response }: HttpContext): Promise<Response> {
    try {
      const { onlineUserId } = await request.validate({
        onlineUserId: 'required|string'
      } as any)

      const user = await this.authService.syncUserFromOnline(onlineUserId)

      return response.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            schoolId: user.schoolId,
            classId: user.classId,
            isActive: user.isActive,
            permissions: user.permissions
          }
        }
      })

    } catch (error) {
      return this.handleAuthError(error, response)
    }
  }

  /**
   * Get active sessions
   */
  public async getSessions({ request, response }: HttpContext): Promise<Response> {
    try {
      const token = this.extractTokenFromRequest(request)
      if (!token) {
        return response.status(401).json({
          success: false,
          error: {
            code: 'NO_TOKEN',
            message: 'No authentication token provided'
          }
        })
      }

      const currentUser = await this.authService.validateToken(token)
      if (!currentUser) {
        return response.status(401).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid or expired token'
          }
        })
      }

      const sessions = await this.getActiveUserSessions(currentUser.id)

      return response.json({
        success: true,
        data: {
          sessions: sessions.map(session => ({
            sessionId: session.sessionId,
            platform: session.platform,
            loginTime: session.loginTime.toISO(),
            lastActivity: session.lastActivity.toISO(),
            expiresAt: session.expiresAt.toISO(),
            ipAddress: session.ipAddress,
            userAgent: session.userAgent,
            isActive: session.isActive
          }))
        }
      })

    } catch (error) {
      return this.handleAuthError(error, response)
    }
  }

  /**
   * Destroy session
   */
  public async destroySession({ request, response }: HttpContext): Promise<Response> {
    try {
      const { sessionId } = await request.validate({
        sessionId: 'required|string'
      } as any)

      await this.authService.destroySession(sessionId)

      return response.json({
        success: true,
        message: 'Session destroyed successfully'
      })

    } catch (error) {
      return this.handleAuthError(error, response)
    }
  }

  /**
   * Check authentication status
   */
  public async checkAuth({ request, response }: HttpContext): Promise<Response> {
    try {
      const token = this.extractTokenFromRequest(request)
      
      if (!token) {
        return response.json({
          success: false,
          authenticated: false,
          message: 'No authentication token provided'
        })
      }

      const user = await this.authService.validateToken(token)
      
      if (!user) {
        return response.json({
          success: false,
          authenticated: false,
          message: 'Invalid or expired token'
        })
      }

      const session = await this.authService.validateSession(user.sessionId || '')
      
      return response.json({
        success: true,
        authenticated: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
            permissions: user.permissions
          },
          session: session ? {
            sessionId: session.sessionId,
            platform: session.platform,
            expiresAt: session.expiresAt.toISO()
          } : null
        }
      })

    } catch (error) {
      return response.json({
        success: false,
        authenticated: false,
        message: 'Authentication check failed'
      })
    }
  }

  // Private helper methods

  /**
   * Extract token from request
   */
  private extractTokenFromRequest(request: any): string | null {
    const authHeader = request.header('authorization')
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7)
    }
    
    // Also check for token in query parameter (for WebSocket connections)
    const tokenParam = request.qs().token
    if (typeof tokenParam === 'string') {
      return tokenParam
    }
    
    return null
  }

  /**
   * Handle authentication errors
   */
  private handleAuthError(error: any, response: Response): Response {
    console.error('Authentication error:', error)

    if (error instanceof InvalidCredentialsError) {
      return response.status(401).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      })
    }

    if (error instanceof TokenExpiredError) {
      return response.status(401).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      })
    }

    if (error instanceof UserNotFoundError) {
      return response.status(404).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      })
    }

    if (error instanceof AccountLockedError) {
      return response.status(423).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      })
    }

    if (error instanceof InsufficientPermissionsError) {
      return response.status(403).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      })
    }

    // Generic error
    return response.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error'
      }
    })
  }

  /**
   * Get active user sessions (helper method)
   */
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
}