import { z } from 'zod'

// Shared schemas
const emailSchema = z
    .string()
    .trim()
    .toLowerCase()
    .email('Invalid email address')

const passwordSchema = z
    .string()
    .min(6, 'Password must be at least 6 characters')

// Login
export const loginSchema = z.object({
    email: emailSchema,
    password: z.string().min(1, 'Password is required'), // Allow empty string check to fail gracefully if needed
})

// Register
export const registerSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
    name: z.string().min(2, 'Name must be at least 2 characters').optional(),
})

// Update User (Admin/Self)
export const userUpdateSchema = z.object({
    name: z.string().min(2).optional(),
    role: z.enum(['admin', 'staff', 'tier_1_customer', 'tier_2_customer', 'tier_3_customer']).optional(),
    subscriptionTier: z.enum(['free', 'pro', 'enterprise']).optional(),
    accountStatus: z.enum(['active', 'banned', 'suspended']).optional(),
})

// Forgot Password
export const forgotPasswordSchema = z.object({
    email: emailSchema,
})

// Reset Password
export const resetPasswordSchema = z.object({
    token: z.string().min(1, 'Token is required'),
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm Password is required'),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
})
