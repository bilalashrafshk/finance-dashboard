
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth, getAuthToken } from "@/lib/auth/auth-context"
import { CreateUserDialog } from "@/components/admin/create-user-dialog"
import { UserList } from "@/components/admin/user-list"
import { Separator } from "@/components/ui/separator"
import { Loader2 } from "lucide-react"

interface User {
    id: number
    email: string
    name: string | null
    role: string
    createdAt: string
    updatedAt: string
}

export default function AdminUsersPage() {
    const { user, loading: authLoading } = useAuth()
    const router = useRouter()
    const [users, setUsers] = useState<User[]>([])
    const [loadingUsers, setLoadingUsers] = useState(true)

    const fetchUsers = async () => {
        setLoadingUsers(true)
        const token = getAuthToken()
        try {
            const response = await fetch("/api/admin/users", {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            })

            if (response.ok) {
                const data = await response.json()
                setUsers(data.users)
            } else {
                console.error("Failed to fetch users")
            }
        } catch (error) {
            console.error("Error fetching users:", error)
        } finally {
            setLoadingUsers(false)
        }
    }

    useEffect(() => {
        if (!authLoading) {
            if (!user) {
                router.push("/auth/login")
            } else if (user.role !== "admin") {
                router.push("/dashboard")
            } else {
                fetchUsers()
            }
        }
    }, [user, authLoading, router])

    if (authLoading) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    if (!user || user.role !== "admin") {
        return null // Will redirect in useEffect
    }

    return (
        <div className="container mx-auto py-10 space-y-8">
            <div className="flex items-center justify-between space-y-2">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">User Management</h2>
                    <p className="text-muted-foreground">
                        Manage users, roles, and permissions.
                    </p>
                </div>
                <div className="flex items-center space-x-2">
                    <CreateUserDialog onUserCreated={fetchUsers} />
                </div>
            </div>
            <Separator />
            <UserList users={users} loading={loadingUsers} onUserUpdated={fetchUsers} />
        </div>
    )
}
