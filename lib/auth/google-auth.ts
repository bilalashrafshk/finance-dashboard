import { OAuth2Client } from 'google-auth-library'
import { getPool } from '@/lib/db'
import { generateToken, UserPayload } from './auth-utils'
import { User } from './db-auth'

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

export interface GoogleAuthResponse {
  user: User
  token: string
}

/**
 * Verify Google ID Token and login/register user
 */
export async function verifyGoogleToken(idToken: string): Promise<GoogleAuthResponse> {
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    })

    const payload = ticket.getPayload()
    if (!payload || !payload.email) {
      throw new Error('Invalid Google token payload')
    }

    const { email, sub: googleId, name, picture: image } = payload

    const dbClient = await getPool().connect()
    try {
      // 1. Check if user exists by google_id
      let result = await dbClient.query(
        'SELECT id, email, name, role, subscription_tier, account_status, permissions, image FROM users WHERE google_id = $1',
        [googleId]
      )

      let userRow = result.rows[0]

      // 2. If not found by google_id, check by email
      if (!userRow) {
        result = await dbClient.query(
          'SELECT id, email, name, role, subscription_tier, account_status, permissions, image, google_id FROM users WHERE email = $1',
          [email.toLowerCase()]
        )
        userRow = result.rows[0]

        if (userRow) {
          // Link existing account with Google
          await dbClient.query(
            'UPDATE users SET google_id = $1, image = COALESCE(image, $2), updated_at = NOW() WHERE id = $3',
            [googleId, image, userRow.id]
          )
        }
      }

      // 3. If still not found, create new user
      if (!userRow) {
        // Default values match registerUser in db-auth.ts
        const insertResult = await dbClient.query(
          `INSERT INTO users (email, google_id, name, image, role, subscription_tier, account_status, permissions)
           VALUES ($1, $2, $3, $4, 'tier_1_customer', 'free', 'active', '[]'::jsonb)
           RETURNING id, email, name, role, subscription_tier, account_status, permissions, image, created_at, updated_at`,
          [email.toLowerCase(), googleId, name || null, image || null]
        )
        userRow = insertResult.rows[0]
      }

      // 4. Construct user object
      const user: User = {
        id: userRow.id,
        email: userRow.email,
        name: userRow.name,
        role: userRow.role,
        subscriptionTier: userRow.subscription_tier,
        accountStatus: userRow.account_status,
        permissions: userRow.permissions,
        createdAt: userRow.created_at ? userRow.created_at.toISOString() : new Date().toISOString(),
        updatedAt: userRow.updated_at ? userRow.updated_at.toISOString() : new Date().toISOString(),
      }

      // 5. Generate session token (JWT)
      const token = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        subscriptionTier: user.subscriptionTier,
        accountStatus: user.accountStatus,
        permissions: user.permissions
      })

      return { user, token }
    } finally {
      dbClient.release()
    }
  } catch (error: any) {
    console.error('Google Auth Error:', error)
    throw new Error('Failed to authenticate with Google')
  }
}
