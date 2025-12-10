import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth/middleware'
import { getUserById } from '@/lib/auth/db-auth'
import { toUserDTO } from '@/lib/dto/user'

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request)

    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }

    // Optimization: We could rely on authUser payload if it had everything, 
    // but fetching Fresh from DB is safer for role/status changes.
    const user = await getUserById(authUser.id)

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found', code: 'USER_NOT_FOUND' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      user: toUserDTO(user),
    })
  } catch (error) {
    console.error('Get user error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get user', code: 'INTERNAL_SERVER_ERROR' },
      { status: 500 }
    )
  }
}
