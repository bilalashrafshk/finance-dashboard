# Password Reset Functionality Setup

## Overview

The forgot password functionality has been fully implemented with the following features:

- ✅ Secure token generation
- ✅ Token expiration (1 hour)
- ✅ Email sending (with development mode logging)
- ✅ Password reset page
- ✅ Integration with login dialogs

## Database Setup

Run the password reset schema migration:

```sql
-- Run this SQL in your database
\i lib/auth/password-reset-schema.sql
```

Or manually execute:

```sql
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);
```

## How It Works

### 1. User Requests Password Reset

- User clicks "Forgot password?" in login dialog
- Enters their email address
- System generates a secure random token
- Token is stored in database with 1-hour expiration
- Email is sent with reset link (or logged in development)

### 2. User Resets Password

- User clicks link in email: `/reset-password?token=...`
- User enters new password (minimum 6 characters)
- System validates token (not expired, not used)
- Password is hashed and updated
- Token is marked as used
- User is redirected to login

## Email Configuration

### Development Mode

In development, reset links are logged to the console instead of being sent via email. Check your server logs for the reset link.

### Production Mode

To enable actual email sending, configure one of these services:

#### Option 1: Resend (Recommended)

1. Install Resend:
```bash
npm install resend
```

2. Get API key from [resend.com](https://resend.com)

3. Add to `.env`:
```
RESEND_API_KEY=re_xxxxxxxxxxxxx
```

4. Uncomment Resend code in `lib/auth/email-service.ts`

#### Option 2: SendGrid

1. Install SendGrid:
```bash
npm install @sendgrid/mail
```

2. Get API key from [sendgrid.com](https://sendgrid.com)

3. Add to `.env`:
```
SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
```

4. Uncomment SendGrid code in `lib/auth/email-service.ts`

#### Option 3: Nodemailer (SMTP)

1. Install Nodemailer:
```bash
npm install nodemailer
```

2. Configure SMTP settings in `lib/auth/email-service.ts`

## Environment Variables

Add these to your `.env` file:

```env
# Required for email links
NEXT_PUBLIC_APP_URL=https://yourdomain.com

# Or if using Vercel, it's automatically set
VERCEL_URL=your-app.vercel.app
```

## Security Features

- ✅ Tokens expire after 1 hour
- ✅ Tokens can only be used once
- ✅ Secure random token generation (32 bytes)
- ✅ Email enumeration protection (always returns success)
- ✅ Password validation (minimum 6 characters)
- ✅ Token validation before password reset

## API Endpoints

### POST `/api/auth/forgot-password`

Request a password reset email.

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "If an account with that email exists, a password reset link has been sent."
}
```

### POST `/api/auth/reset-password`

Reset password using a valid token.

**Request:**
```json
{
  "token": "abc123...",
  "password": "newpassword123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password has been reset successfully"
}
```

## Testing

### Test Password Reset Flow

1. Start your development server
2. Go to login page
3. Click "Forgot password?"
4. Enter your email
5. Check server console for reset link (development mode)
6. Click the reset link
7. Enter new password
8. Try logging in with new password

### Test Token Expiration

1. Request password reset
2. Wait 1 hour (or manually expire token in database)
3. Try using the token - should fail with "Invalid or expired reset token"

### Test Token Reuse

1. Request password reset
2. Use token to reset password
3. Try using same token again - should fail

## Cleanup

To clean up expired tokens periodically, run this SQL:

```sql
DELETE FROM password_reset_tokens 
WHERE expires_at < NOW() OR used = TRUE;
```

Or set up a cron job to run this automatically.

## Troubleshooting

### Reset link not working

- Check that `NEXT_PUBLIC_APP_URL` is set correctly
- Verify token hasn't expired (1 hour limit)
- Check database for token existence

### Email not sending

- In development, check console logs
- In production, verify email service API key is set
- Check email service logs/status

### Token already used

- Each token can only be used once
- Request a new password reset if needed

## Files Created/Modified

### New Files:
- `lib/auth/password-reset-schema.sql` - Database schema
- `lib/auth/password-reset-utils.ts` - Token utilities
- `lib/auth/email-service.ts` - Email sending service
- `app/api/auth/forgot-password/route.ts` - Request reset API
- `app/api/auth/reset-password/route.ts` - Reset password API
- `components/auth/forgot-password-dialog.tsx` - Forgot password dialog
- `app/reset-password/page.tsx` - Reset password page

### Modified Files:
- `components/landing/login-modal.tsx` - Added forgot password link
- `components/auth/login-dialog.tsx` - Added forgot password link

