import { NextRequest, NextResponse } from 'next/server'
import { createPasswordResetToken, getUserByEmail } from '@/lib/auth/password-reset-utils'
import { sendPasswordResetEmail } from '@/lib/auth/email-service'
import { forgotPasswordSchema } from '@/validations/auth'
import { rateLimit } from '@/lib/rate-limit'
import { z } from 'zod'


/**
 * POST /api/auth/forgot-password
 * Request a password reset email
 */
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    const limitResult = await rateLimit(ip, 5, 60 * 1000)
    if (!limitResult.success) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': Math.ceil((limitResult.reset - Date.now()) / 1000).toString() } }
      )
    }

    const body = await request.json()
    const validated = forgotPasswordSchema.parse(body)

    // Find user by email
    const user = await getUserByEmail(validated.email)

    // Always return success (don't reveal if email exists)
    if (!user) {
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
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to send reset email:', emailError)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.',
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.errors[0].message, code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    console.error('Forgot password error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to process password reset request', code: 'INTERNAL_SERVER_ERROR' },
      { status: 500 }
    )
  }
}
