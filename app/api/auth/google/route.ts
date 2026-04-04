import { NextRequest, NextResponse } from 'next/server'
import { verifyGoogleToken } from '@/lib/auth/google-auth'
import { toUserDTO } from '@/lib/dto/user'

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json()

    if (!idToken) {
      return NextResponse.json(
        { success: false, error: 'Missing ID token', code: 'MISSING_TOKEN' },
        { status: 400 }
      )
    }

    const { user, token } = await verifyGoogleToken(idToken)

    return NextResponse.json(
      {
        success: true,
        user: toUserDTO(user),
        token,
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('Google Auth API Error:', error)
    return NextResponse.json(
      { success: false, error: 'Authentication failed', code: 'AUTH_FAILED' },
      { status: 401 }
    )
  }
}
