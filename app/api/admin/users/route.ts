
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth/middleware'
import { getAllUsers, createUser, getUserById } from '@/lib/auth/db-auth'

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
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const users = await getAllUsers()
        return NextResponse.json({ users })
    } catch (error) {
        console.error('Error fetching users:', error)
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const admin = await verifyAdmin(request)
        if (!admin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { email, password, name, role } = body

        if (!email || !password) {
            return NextResponse.json(
                { error: 'Email and password are required' },
                { status: 400 }
            )
        }

        // Role validation
        const allowedRoles = ['admin', 'staff', 'tier_1_customer', 'tier_2_customer', 'tier_3_customer']
        if (role && !allowedRoles.includes(role)) {
            return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
        }

        const newUser = await createUser({
            email,
            password,
            name,
            role
        })

        return NextResponse.json({ user: newUser }, { status: 201 })
    } catch (error: any) {
        console.error('Error creating user:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to create user' },
            { status: 500 }
        )
    }
}
