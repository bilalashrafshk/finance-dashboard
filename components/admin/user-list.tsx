
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

export function UserList({ users, loading }: UserListProps) {
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
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}
