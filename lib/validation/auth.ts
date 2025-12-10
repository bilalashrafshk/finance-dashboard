import { z } from 'zod'

export const emailSchema = z
    .string()
    .email({ message: 'Invalid email address' })
    .toLowerCase()
    .trim()

export const passwordSchema = z
    .string()
    .min(8, { message: 'Password must be at least 8 characters long' })

export const loginSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
})

export const registerSchema = z.object({
    name: z.string().min(2, { message: 'Name must be at least 2 characters long' }).trim(),
    email: emailSchema,
    password: passwordSchema,
})

export const updateUserSchema = z.object({
    name: z.string().min(2).optional(),
    role: z.enum(['admin', 'staff', 'tier_1_customer', 'tier_2_customer', 'tier_3_customer']).optional(),
    subscriptionTier: z.enum(['free', 'pro', 'enterprise']).optional(),
    accountStatus: z.enum(['active', 'banned', 'suspended']).optional(),
})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>

/**
 * Helper to format Zod error messages into a single user-friendly string
 */
export function formatZodError(error: z.ZodError): string {
    if (!error.errors || error.errors.length === 0) return 'Validation error'
    return error.errors.map(e => e.message).join(', ')
}
