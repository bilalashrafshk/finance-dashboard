import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth/middleware'
import { getUserById } from '@/lib/auth/db-auth'

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request)

    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }

    // Optimization: If payload has all data, return it directly
    // authUser comes from payload in getAuthenticatedUser
    // We need to typecase it as UserPayload or compatible if we expanded middleware

    // However, getAuthenticatedUser currently only returns { id, email }
    // We should probably update getAuthenticatedUser to return the full payload
    // OR we just fetch from DB here as a sanity check (safest for now)

    // Since the requirement is "Optimize", let's be smart. 
    // db-auth.ts getUserById is already efficient.
    const user = await getUserById(authUser.id)

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found', code: 'USER_NOT_FOUND' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        subscriptionTier: user.subscriptionTier,
        accountStatus: user.accountStatus
      },
      // Note: We could issue a fresh token here if we wanted to implement sliding sessions
    })
  } catch (error) {
    console.error('Get user error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get user', code: 'INTERNAL_SERVER_ERROR' },
      { status: 500 }
    )
  }
}
