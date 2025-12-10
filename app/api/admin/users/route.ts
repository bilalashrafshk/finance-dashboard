
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth/middleware'
import { getAllUsers, createUser, getUserById } from '@/lib/auth/db-auth'
import { registerSchema, formatZodError, updateUserSchema } from '@/lib/validation/auth'
import { toUserDTO } from '@/lib/dto/user'
import { z } from 'zod'

// Helper to check admin status
async function verifyAdmin(request: NextRequest) {
    const authUser = await getAuthenticatedUser(request)
    if (!authUser) return null

    const user = await getUserById(authUser.id)
    if (!user || user.role !== 'admin') return null

    return user
}

export async function GET(request: NextRequest) {
    try {
        const admin = await verifyAdmin(request)
        if (!admin) {
            return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const page = parseInt(searchParams.get('page') || '1')
        const limit = parseInt(searchParams.get('limit') || '20')
        const offset = (page - 1) * limit

        // Max limit to prevent DB overload
        const safeLimit = Math.min(limit, 100)

        const { users, total } = await getAllUsers(safeLimit, offset)

        return NextResponse.json({
            success: true,
            users: users.map(toUserDTO),
            pagination: {
                page,
                limit: safeLimit,
                total,
                totalPages: Math.ceil(total / safeLimit)
            }
        })
    } catch (error) {
        console.error('Error fetching users:', error)
        return NextResponse.json({ error: 'Failed to fetch users', code: 'INTERNAL_SERVER_ERROR' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const admin = await verifyAdmin(request)
        if (!admin) {
            return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
        }

        const body = await request.json()

        // Admin creation schema: register schema + optional administrative fields
        const adminCreateUserSchema = registerSchema.extend({
            role: z.enum(['admin', 'staff', 'tier_1_customer', 'tier_2_customer', 'tier_3_customer']).optional(),
            subscriptionTier: z.enum(['free', 'pro', 'enterprise']).optional(),
            accountStatus: z.enum(['active', 'banned', 'suspended']).optional(),
        })

        const validated = adminCreateUserSchema.parse(body)

        const newUser = await createUser({
            email: validated.email,
            password: validated.password,
            name: validated.name,
            role: validated.role,
            subscriptionTier: validated.subscriptionTier,
            accountStatus: validated.accountStatus
        })

        return NextResponse.json({ success: true, user: toUserDTO(newUser) }, { status: 201 })
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: formatZodError(error), code: 'VALIDATION_ERROR' },
                { status: 400 }
            )
        }

        console.error('Error creating user:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to create user', code: 'INTERNAL_SERVER_ERROR' },
            { status: 500 }
        )
    }
}
