export interface UserDTO {
    id: number
    name: string
    email: string
    role: string
    subscriptionTier: string
    accountStatus: string
    avatarUrl?: string | null
    createdAt?: Date | string
}

/**
 * Transforms a raw database user object into a sanitized DTO.
 * Explicitly excludes sensitive fields like password_hash.
 */
export function toUserDTO(user: any): UserDTO {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        subscriptionTier: user.subscription_tier || user.subscriptionTier || 'free',
        accountStatus: user.account_status || user.accountStatus || 'active',
        avatarUrl: user.avatar_url || user.avatarUrl || null,
        createdAt: user.created_at || user.createdAt
    }
}
