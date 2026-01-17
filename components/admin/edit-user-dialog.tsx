
"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Loader2, Pencil, Shield } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { getAuthToken } from "@/lib/auth/auth-context"

const formSchema = z.object({
    name: z.string().min(2, {
        message: "Name must be at least 2 characters.",
    }),
    role: z.enum(["admin", "staff", "tier_1_customer", "tier_2_customer", "tier_3_customer"], {
        required_error: "Please select a role.",
    }),
    permissions: z.array(z.string()).default([]),
})

interface EditUserDialogProps {
    user: {
        id: number
        name: string | null
        role: string
        permissions: string[] | null
    }
    onUserUpdated: () => void
}

export function EditUserDialog({ user, onUserUpdated }: EditUserDialogProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const { toast } = useToast()

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: user.name || "",
            role: user.role as any,
            permissions: user.permissions || [],
        },
    })

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setLoading(true)
        const token = getAuthToken()

        try {
            const response = await fetch(`/api/admin/users/${user.id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(values),
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || "Failed to update user")
            }

            toast({
                title: "User updated",
                description: "User details have been successfully updated.",
            })

            setOpen(false)
            onUserUpdated()
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error",
                description: error.message,
            })
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon">
                    <Pencil className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Edit User</DialogTitle>
                    <DialogDescription>
                        Update user details and role permissions.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="John Doe" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="role"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Role</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select a role" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="tier_1_customer">Tier 1 Customer</SelectItem>
                                            <SelectItem value="tier_2_customer">Tier 2 Customer</SelectItem>
                                            <SelectItem value="tier_3_customer">Tier 3 Customer</SelectItem>
                                            <SelectItem value="staff">Staff</SelectItem>
                                            <SelectItem value="admin">Admin</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormDescription>
                                        The role determines user permissions.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {form.watch("role") === "staff" && (
                            <FormField
                                control={form.control}
                                name="permissions"
                                render={() => (
                                    <FormItem>
                                        <div className="mb-4">
                                            <FormLabel className="text-base flex items-center gap-2">
                                                <Shield className="h-4 w-4" /> Staff Permissions
                                            </FormLabel>
                                            <FormDescription>
                                                Select the pages this staff member can access.
                                            </FormDescription>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            {[
                                                { id: "x-copilot", label: "X-Copilot" },
                                                { id: "brand", label: "Brand Settings" },
                                                { id: "prompts", label: "AI Center" },
                                            ].map((item) => (
                                                <FormField
                                                    key={item.id}
                                                    control={form.control}
                                                    name="permissions"
                                                    render={({ field }) => {
                                                        return (
                                                            <FormItem
                                                                key={item.id}
                                                                className="flex flex-row items-start space-x-3 space-y-0"
                                                            >
                                                                <FormControl>
                                                                    <Checkbox
                                                                        checked={field.value?.includes(item.id)}
                                                                        onCheckedChange={(checked) => {
                                                                            return checked
                                                                                ? field.onChange([...(field.value || []), item.id])
                                                                                : field.onChange(
                                                                                    field.value?.filter(
                                                                                        (value: string) => value !== item.id
                                                                                    )
                                                                                )
                                                                        }}
                                                                    />
                                                                </FormControl>
                                                                <FormLabel className="font-normal cursor-pointer">
                                                                    {item.label}
                                                                </FormLabel>
                                                            </FormItem>
                                                        )
                                                    }}
                                                />
                                            ))}
                                        </div>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        <DialogFooter>
                            <Button type="submit" disabled={loading}>
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save Changes
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}
