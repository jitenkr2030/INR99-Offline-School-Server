import { inject } from '@adonisjs/core'
import { HttpContext } from '@adonisjs/core/http'
import { Response } from '@adonisjs/core/http'

import { AuthService } from '../services/auth_service.js'
import { InsufficientPermissionsError, TokenExpiredError } from '../interfaces/auth.js'

/**
 * Authentication Middleware
 * Protects routes by requiring valid authentication
 */
@inject()
export class AuthMiddleware {
  constructor(
    private authService: AuthService
  ) {}

  /**
   * Handle authentication middleware
   */
  public async handle({ request, response }: HttpContext, next: () => Promise<void>) {
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

      // Update session activity
      if (user.sessionId) {
        await this.authService.updateSessionActivity(user.sessionId)
      }

      // Attach user to request context
      request.user = user

      await next()

    } catch (error) {
      console.error('Auth middleware error:', error)
      
      if (error instanceof TokenExpiredError) {
        return response.status(401).json({
          success: false,
          error: {
            code: 'TOKEN_EXPIRED',
            message: 'Token has expired'
          }
        })
      }

      return response.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_FAILED',
          message: 'Authentication failed'
        }
      })
    }
  }

  /**
   * Role-based authentication middleware
   */
  public static requireRole(allowedRoles: string[]) {
    return async ({ request, response }: HttpContext, next: () => Promise<void>) => {
      try {
        const user = request.user
        
        if (!user) {
          return response.status(401).json({
            success: false,
            error: {
              code: 'NO_USER',
              message: 'User not authenticated'
            }
          })
        }

        if (!allowedRoles.includes(user.role)) {
          return response.status(403).json({
            success: false,
            error: {
              code: 'INSUFFICIENT_PERMISSIONS',
              message: `Access denied. Required roles: ${allowedRoles.join(', ')}`
            }
          })
        }

        await next()

      } catch (error) {
        console.error('Role-based auth error:', error)
        return response.status(500).json({
          success: false,
          error: {
            code: 'ROLE_CHECK_FAILED',
            message: 'Failed to check user role'
          }
        })
      }
    }
  }

  /**
   * Permission-based authentication middleware
   */
  public static requirePermission(permission: string) {
    return async ({ request, response }: HttpContext, next: () => Promise<void>) => {
      try {
        const user = request.user
        
        if (!user) {
          return response.status(401).json({
            success: false,
            error: {
              code: 'NO_USER',
              message: 'User not authenticated'
            }
          })
        }

        if (!user.permissions.includes(permission) && user.role !== 'admin') {
          return response.status(403).json({
            success: false,
            error: {
              code: 'INSUFFICIENT_PERMISSIONS',
              message: `Access denied. Required permission: ${permission}`
            }
          })
        }

        await next()

      } catch (error) {
        console.error('Permission-based auth error:', error)
        return response.status(500).json({
          success: false,
          error: {
            code: 'PERMISSION_CHECK_FAILED',
            message: 'Failed to check user permission'
          }
        })
      }
    }

  /**
   * Optional authentication middleware
   * Attaches user to request if authenticated, but doesn't block if not
   */
  public static optional({ request, response }: HttpContext, next: () => Promise<void>) {
    try {
      const token = request.header('authorization')?.replace('Bearer ', '')
      
      if (token) {
        const authService = new AuthService(null as any, { request, response } as any)
        const user = await authService.validateToken(token)
        
        if (user) {
          request.user = user
        }
      }

      await next()

    } catch (error) {
      // Don't block the request for optional auth
      console.error('Optional auth error:', error)
      await next()
    }
  }

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
}

/**
 * Helper function to create role-based middleware
 */
export const requireRole = (allowedRoles: string[]) => {
  return AuthMiddleware.requireRole(allowedRoles)
}

/**
 * Helper function to create permission-based middleware
 */
export const requirePermission = (permission: string) => {
  return AuthMiddleware.requirePermission(permission)
}

/**
 * Helper function for optional authentication
 */
export const optionalAuth = AuthMiddleware.optional