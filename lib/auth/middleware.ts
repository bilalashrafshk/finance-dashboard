/**
 * Authentication Middleware
 * 
 * Middleware to verify JWT tokens and extract user information
 */

import { NextRequest } from 'next/server'
import { verifyToken, extractTokenFromHeader } from './auth-utils'
import { getUserById } from './db-auth'

export interface AuthenticatedRequest extends NextRequest {
  user?: {
    id: number
    email: string
  }
}

/**
 * Get authenticated user from request
 * Returns null if not authenticated
 */
export async function getAuthenticatedUser(request: NextRequest): Promise<{ id: number; email: string } | null> {
  const authHeader = request.headers.get('authorization')
  const token = extractTokenFromHeader(authHeader)
  
  if (!token) {
    return null
  }
  
  const payload = verifyToken(token)
  if (!payload) {
    return null
  }
  
  // Verify user still exists
  const user = await getUserById(payload.userId)
  if (!user) {
    return null
  }
  
  return {
    id: user.id,
    email: user.email,
  }
}

/**
 * Require authentication - throws error if not authenticated
 */
export async function requireAuth(request: NextRequest): Promise<{ id: number; email: string }> {
  const user = await getAuthenticatedUser(request)
  if (!user) {
    throw new Error('Authentication required')
  }
  return user
}

