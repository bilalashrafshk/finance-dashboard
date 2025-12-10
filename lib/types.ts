/**
 * Shared Frontend Types
 * 
 * These types match the Backend DTOs and standardized API responses.
 * Use these throughout the frontend to ensure type safety.
 */

/**
 * User DTO (Data Transfer Object)
 * Matching the "Lean User" response from backend.
 * NO sensitive data (passwords, hashes).
 */
export interface UserDTO {
    id: number
    name: string | null
    email: string
    role: string
    tier: string
    status: string
    avatarUrl: string | null
    createdAt?: string
}

/**
 * Standard Market Price Interface
 * Used for all asset types (Crypto, Stocks, etc.)
 */
export interface MarketPrice {
    symbol: string
    price: number
    currency: string
    change_24h: number
    last_updated: string | Date
}

/**
 * Generic API Response Wrapper
 */
export interface ApiResponse<T = any> {
    success?: boolean
    data?: T
    error?: string
    message?: string
    // For pagination
    meta?: {
        page: number
        limit: number
        total: number
    }
}
