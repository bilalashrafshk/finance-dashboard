import { NextRequest, NextResponse } from 'next/server'
import { registerUser } from '@/lib/auth/db-auth'
import { registerSchema, formatZodError } from '@/lib/validation/auth'
import { toUserDTO } from '@/lib/dto/user'
import { rateLimit } from '@/lib/rate-limit'
import { z } from 'zod'

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || 'unknown'

    // 1. Rate Limiting (5 requests per minute)
    const limitResult = await rateLimit(ip, 5, 60 * 1000)
    if (!limitResult.success) {
      return NextResponse.json(
        { success: false, error: 'Too many registration attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': Math.ceil((limitResult.reset - Date.now()) / 1000).toString() } }
      )
    }

    const body = await request.json()

    // 2. Validate input
    const validated = registerSchema.parse(body)

    // 3. Register user (includes default subscription_tier='free', account_status='active')
    const { user, token } = await registerUser({
      email: validated.email,
      password: validated.password,
      name: validated.name,
    })

    return NextResponse.json(
      {
        success: true,
        user: toUserDTO(user),
        token,
      },
      { status: 201 }
    )
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: formatZodError(error), code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    if (error.message === 'User with this email already exists') {
      return NextResponse.json(
        { success: false, error: 'User with this email already exists', code: 'USER_EXISTS' },
        { status: 409 }
      )
    }

    console.error('Registration error:', error)

    return NextResponse.json(
      { success: false, error: 'Registration failed', code: 'REGISTRATION_FAILED' },
      { status: 500 }
    )
  }
}

