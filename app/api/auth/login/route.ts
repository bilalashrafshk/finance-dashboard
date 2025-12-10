import { NextRequest, NextResponse } from 'next/server'
import { loginUser } from '@/lib/auth/db-auth'
import { loginSchema } from '@/validations/auth'
import { rateLimit } from '@/lib/rate-limit'
import { z } from 'zod'




export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || 'unknown'

    // 1. Rate Limiting (5 requests per minute)
    const limitResult = await rateLimit(ip, 5, 60 * 1000)
    if (!limitResult.success) {
      return NextResponse.json(
        { success: false, error: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': Math.ceil((limitResult.reset - Date.now()) / 1000).toString() } }
      )
    }

    const body = await request.json()

    // 2. Input Validation
    const validated = loginSchema.parse(body)

    // 3. Login User (Async Hash, Lean Query)
    const { user, token } = await loginUser({
      email: validated.email,
      password: validated.password,
    })

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        subscriptionTier: user.subscriptionTier,
        accountStatus: user.accountStatus
        // token is sent separately mainly, but kept here for existing contract if needed, 
        // though usually HttpOnly cookie is better. Stick to existing contract.
      },
      token,
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.errors[0].message, code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    if (error.message === 'Invalid email or password') {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password', code: 'AUTH_FAILED' },
        { status: 401 }
      )
    }

    if (error.message?.includes('banned') || error.message?.includes('suspended')) {
      return NextResponse.json(
        { success: false, error: error.message, code: 'ACCOUNT_SUSPENDED' },
        { status: 403 }
      )
    }

    console.error('Login error:', error)
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred', code: 'INTERNAL_SERVER_ERROR' },
      { status: 500 }
    )
  }
}


