import { NextRequest, NextResponse } from 'next/server'
import { loginUser } from '@/lib/auth/db-auth'
import { z } from 'zod'

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Validate input
    const validated = loginSchema.parse(body)
    
    // Login user
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
      },
      token,
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.errors[0].message },
        { status: 400 }
      )
    }
    
    if (error.message === 'Invalid email or password') {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      )
    }
    
    console.error('Login error:', error)
    return NextResponse.json(
      { success: false, error: 'Login failed' },
      { status: 500 }
    )
  }
}

