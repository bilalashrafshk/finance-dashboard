
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth/middleware'
import { getUserById, updateUser, deleteUser } from '@/lib/auth/db-auth'

// Helper to verify admin access
async function verifyAdmin(request: NextRequest) {
    const authUser = await getAuthenticatedUser(request)
    if (!authUser) return null

    const user = await getUserById(authUser.id)
    if (!user || user.role !== 'admin') return null

    return user
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const admin = await verifyAdmin(request)
        if (!admin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const userId = parseInt(params.id)
        if (isNaN(userId)) {
            return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
        }

        const body = await request.json()
        const { name, role } = body

        // Prevent admin from removing their own admin status (optional safety check)
        if (userId === admin.id && role && role !== 'admin') {
            return NextResponse.json(
                { error: 'Cannot remove your own admin status' },
                { status: 400 }
            )
        }

        // Role validation
        const allowedRoles = ['admin', 'staff', 'tier_1_customer', 'tier_2_customer', 'tier_3_customer']
        if (role && !allowedRoles.includes(role)) {
            return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
        }

        const updatedUser = await updateUser(userId, { name, role })

        return NextResponse.json({ user: updatedUser })
    } catch (error: any) {
        console.error('Error updating user:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to update user' },
            { status: 500 }
        )
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const admin = await verifyAdmin(request)
        if (!admin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const userId = parseInt(params.id)
        if (isNaN(userId)) {
            return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
        }

        // Prevent admin from deleting themselves
        if (userId === admin.id) {
            return NextResponse.json(
                { error: 'Cannot delete your own account' },
                { status: 400 }
            )
        }

        await deleteUser(userId)

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Error deleting user:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to delete user' },
            { status: 500 }
        )
    }
}
