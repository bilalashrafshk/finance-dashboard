import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth/middleware'
import { getUserById, updateUser, deleteUser } from '@/lib/auth/db-auth'
import { userUpdateSchema } from '@/validations/auth'
import { z } from 'zod'

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
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const admin = await verifyAdmin(request)
        if (!admin) {
            return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
        }

        const userId = parseInt(params.id)
        if (isNaN(userId)) {
            return NextResponse.json({ error: 'Invalid user ID', code: 'INVALID_ID' }, { status: 400 })
        }

        const body = await request.json()

        // Validate input
        const validated = userUpdateSchema.parse(body)

        // Prevent admin from removing their own admin status (safety check)
        if (userId === admin.id && validated.role && validated.role !== 'admin') {
            return NextResponse.json(
                { error: 'Cannot remove your own admin status', code: 'OPERATION_NOT_ALLOWED' },
                { status: 400 }
            )
        }

        // Prevent admin from banning themselves
        if (userId === admin.id && validated.accountStatus && validated.accountStatus !== 'active') {
            return NextResponse.json(
                { error: 'Cannot ban/suspend your own account', code: 'OPERATION_NOT_ALLOWED' },
                { status: 400 }
            )
        }

        const updatedUser = await updateUser(userId, {
            name: validated.name,
            role: validated.role,
            subscriptionTier: validated.subscriptionTier,
            accountStatus: validated.accountStatus
        })

        return NextResponse.json({ success: true, user: updatedUser })
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: error.errors[0].message, code: 'VALIDATION_ERROR' },
                { status: 400 }
            )
        }

        console.error('Error updating user:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to update user', code: 'INTERNAL_SERVER_ERROR' },
            { status: 500 }
        )
    }
}

export async function DELETE(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
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
