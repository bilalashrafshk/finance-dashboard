
"use client"

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { EditUserDialog } from "./edit-user-dialog"
import { Loader2, Trash2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { getAuthToken } from "@/lib/auth/auth-context"
import { useState } from "react"

interface User {
    id: number
    email: string
    name: string | null
    role: string
    createdAt: string
    updatedAt: string
}

interface UserListProps {
    users: User[]
    loading: boolean
}

export function UserList({ users, loading, onUserUpdated }: { users: User[], loading: boolean, onUserUpdated: () => void }) {
    const { toast } = useToast()
    const [deleteLoading, setDeleteLoading] = useState<number | null>(null)

    const handleDelete = async (userId: number) => {
        if (!confirm("Are you sure you want to delete this user? This action cannot be undone.")) {
            return
        }

        setDeleteLoading(userId)
        const token = getAuthToken()

        try {
            const response = await fetch(`/api/admin/users/${userId}`, {
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || "Failed to delete user")
            }

            toast({
                title: "User deleted",
                description: "User has been successfully deleted.",
            })

            onUserUpdated()
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error",
                description: error.message,
            })
        } finally {
            setDeleteLoading(null)
        }
    }

    if (loading) {
        return (
            <div className="flex justify-center items-center py-8 text-muted-foreground">
                Loading users...
            </div>
        )
    }

    if (users.length === 0) {
        return (
            <div className="flex justify-center items-center py-8 text-muted-foreground border rounded-md">
                No users found.
            </div>
        )
    }

    const getRoleBadgeColor = (role: string) => {
        switch (role) {
            case 'admin':
                return 'destructive'
            case 'staff':
                return 'default'
            case 'tier_1_customer':
                return 'secondary'
            case 'tier_2_customer':
                return 'outline'
            case 'tier_3_customer':
                return 'outline'
            default:
                return 'secondary'
        }
    }

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Created At</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {users.map((user) => (
                        <TableRow key={user.id}>
                            <TableCell className="font-medium">{user.name || '-'}</TableCell>
                            <TableCell>{user.email}</TableCell>
                            <TableCell>
                                <Badge variant={getRoleBadgeColor(user.role) as any}>
                                    {user.role.replace(/_/g, ' ')}
                                </Badge>
                            </TableCell>
                            <TableCell>{format(new Date(user.createdAt), "MMM d, yyyy")}</TableCell>
                            <TableCell className="text-right">
                                <div className="flex justify-end items-center gap-2">
                                    <EditUserDialog user={user} onUserUpdated={onUserUpdated} />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleDelete(user.id)}
                                        disabled={deleteLoading === user.id}
                                    >
                                        {deleteLoading === user.id ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        )}
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}
