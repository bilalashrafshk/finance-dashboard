# Authentication Setup Guide

## Overview

The application now includes user authentication with registration, login, and sign out functionality. User holdings and trades are stored in the database and are user-specific.

## Database Schema

The authentication system requires the following tables (already included in `lib/portfolio/db-schema.sql`):

1. **`users`**: Stores user accounts with email, password hash, and name
2. **`user_holdings`**: Stores portfolio holdings for each user
3. **`user_trades`**: Stores trade history for each user

## Setup Steps

### 1. Environment Variables

Add the following environment variables to `.env.local`:

```bash
# Database connection (required)
DATABASE_URL=postgresql://neondb_owner:npg_IJRM7Z3bivKr@ep-ancient-lake-a11r3s06-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require

# JWT secret for token signing (required for production)
JWT_SECRET=your-very-secure-random-secret-key-change-this-in-production
```

**Important:**
- `JWT_SECRET` should be a long, random string (at least 32 characters)
- In production, use a strong, randomly generated secret
- Never commit the actual secret to git

### 2. Initialize Database Schema

Run the updated SQL schema file to create the authentication tables:

1. **Go to Neon Console:** https://console.neon.tech
2. **Open SQL Editor**
3. **Copy the contents** of `lib/portfolio/db-schema.sql`
4. **Paste and execute** the SQL in the Neon SQL Editor

This creates:
- `users` table
- `user_holdings` table
- `user_trades` table
- All necessary indexes

### 3. For Vercel Deployment

Add both environment variables to Vercel:

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add `DATABASE_URL` (or `POSTGRES_URL`)
3. Add `JWT_SECRET` with a strong random value
4. Add to **all environments** (Production, Preview, Development)

## Features

### User Registration
- Users can create accounts with email and password
- Password is hashed using bcrypt before storage
- Email must be unique

### User Login
- Users can login with email and password
- Returns a JWT token valid for 7 days
- Token is stored in localStorage

### User Holdings
- Each user has their own portfolio holdings
- Holdings are stored in the database
- Automatically synced across devices

### Trade History
- All trades are recorded in `user_trades` table
- Trades are linked to holdings
- Supports buy, sell, add, and remove operations

## API Routes

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login a user
- `GET /api/auth/me` - Get current user info

### User Holdings
- `GET /api/user/holdings` - Get all holdings for authenticated user
- `POST /api/user/holdings` - Create a new holding
- `PUT /api/user/holdings/[id]` - Update a holding
- `DELETE /api/user/holdings/[id]` - Delete a holding

### User Trades
- `GET /api/user/trades` - Get trade history
- `POST /api/user/trades` - Record a new trade

## Usage

### Client-Side

The authentication context is available throughout the app:

```tsx
import { useAuth } from '@/lib/auth/auth-context'

function MyComponent() {
  const { user, token, login, logout, register } = useAuth()
  
  // Check if user is authenticated
  if (!user) {
    return <div>Please login</div>
  }
  
  return <div>Welcome, {user.email}!</div>
}
```

### Making Authenticated API Calls

```tsx
import { getAuthToken } from '@/lib/auth/auth-context'

const token = getAuthToken()
const response = await fetch('/api/user/holdings', {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
})
```

## Security Notes

1. **Password Hashing**: Passwords are hashed using bcrypt with salt rounds of 10
2. **JWT Tokens**: Tokens expire after 7 days
3. **Token Storage**: Tokens are stored in localStorage (consider httpOnly cookies for production)
4. **API Protection**: All user-specific endpoints require authentication
5. **Password Requirements**: Minimum 6 characters (consider increasing for production)

## Migration from localStorage

The portfolio system has been migrated from localStorage to database storage:

- **Old**: Holdings stored in browser localStorage
- **New**: Holdings stored in database, user-specific
- **Benefit**: Data persists across devices and browsers

Users will need to:
1. Register/login
2. Re-add their holdings (or we could create a migration script)

## Troubleshooting

### "Authentication required" error
- User is not logged in
- Token has expired (login again)
- Token is invalid

### "User with this email already exists"
- Email is already registered
- Try logging in instead

### Database connection errors
- Verify `DATABASE_URL` is set correctly
- Check that database schema is initialized
- Ensure database is accessible

### Holdings not loading
- Check if user is authenticated
- Verify database connection
- Check browser console for errors

