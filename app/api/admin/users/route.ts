
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, extractTokenFromHeader } from '@/lib/auth/auth-utils'
import { getUserById, registerUser, getAllUsers } from '@/lib/auth/db-auth'

// Middleware helper to verify admin access
async function verifyAdmin(req: NextRequest) {
    const token = extractTokenFromHeader(req.headers.get('Authorization'))

    if (!token) {
        return { error: 'Unauthorized', status: 401 }
    }

    const payload = verifyToken(token)
    if (!payload) {
        return { error: 'Invalid token', status: 401 }
    }

    const user = await getUserById(payload.userId)
    if (!user) {
        return { error: 'User not found', status: 404 }
    }

    if (user.role !== 'admin') {
        return { error: 'Forbidden: Admin access required', status: 403 }
    }

    return { user }
}

export async function GET(req: NextRequest) {
    try {
        const auth = await verifyAdmin(req)
        if (auth.error) {
            return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
        }

        const users = await getAllUsers()

        return NextResponse.json({
            success: true,
            users
        })
    } catch (error: any) {
        console.error('Error fetching users:', error)
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to fetch users' },
            { status: 500 }
        )
    }
}

export async function POST(req: NextRequest) {
    try {
        const auth = await verifyAdmin(req)
        if (auth.error) {
            return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
        }

        const body = await req.json()
        const { email, password, name, role } = body

        if (!email || !password || !role) {
            return NextResponse.json(
                { success: false, error: 'Email, password, and role are required' },
                { status: 400 }
            )
        }

        // Validate role
        const validRoles = ['admin', 'staff', 'tier_1_customer', 'tier_2_customer', 'tier_3_customer']
        if (!validRoles.includes(role)) {
            return NextResponse.json(
                { success: false, error: 'Invalid role' },
                { status: 400 }
            )
        }

        const { user } = await registerUser({
            email,
            password,
            name,
            role
        })

        return NextResponse.json({
            success: true,
            user
        })
    } catch (error: any) {
        console.error('Error creating user:', error)
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to create user' },
            { status: 500 }
        )
    }
}
