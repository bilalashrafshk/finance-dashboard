import { NextRequest, NextResponse } from 'next/server'
import { registerUser } from '@/lib/auth/db-auth'
import { z } from 'zod'

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Validate input
    const validated = registerSchema.parse(body)
    
    // Register user
    const { user, token } = await registerUser({
      email: validated.email,
      password: validated.password,
      name: validated.name,
    })
    
    return NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        token,
      },
      { status: 201 }
    )
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.errors[0].message },
        { status: 400 }
      )
    }
    
    if (error.message === 'User with this email already exists') {
      return NextResponse.json(
        { success: false, error: 'User with this email already exists' },
        { status: 409 }
      )
    }
    
    // Log the full error for debugging
    console.error('Registration error:', error)
    console.error('Error stack:', error.stack)
    console.error('Error message:', error.message)
    
    // Return more detailed error in development
    const errorMessage = process.env.NODE_ENV === 'development' 
      ? error.message || 'Registration failed'
      : 'Registration failed'
    
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}

