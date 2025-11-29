import { NextRequest, NextResponse } from 'next/server'
import { createPasswordResetToken, getUserByEmail } from '@/lib/auth/password-reset-utils'
import { sendPasswordResetEmail } from '@/lib/auth/email-service'

/**
 * POST /api/auth/forgot-password
 * Request a password reset email
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email } = body

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      )
    }

    // Find user by email
    const user = await getUserByEmail(email)

    // Always return success (don't reveal if email exists)
    // This prevents email enumeration attacks
    if (!user) {
      // Still return success to prevent user enumeration
      return NextResponse.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.',
      })
    }

    // Create reset token
    const resetToken = await createPasswordResetToken(user.id)

    // Send reset email
    try {
      await sendPasswordResetEmail(user.email, resetToken)
    } catch (emailError: any) {
      // Log error for debugging but still return success to prevent revealing email service issues
      // In production, you might want to log this to a monitoring service
      if (process.env.NODE_ENV === 'development') {
        // In development, we can be more helpful
        // The error is already handled in email-service.ts
      }
      // Still return success to prevent user enumeration
    }

    return NextResponse.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.',
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: 'Failed to process password reset request' },
      { status: 500 }
    )
  }
}

