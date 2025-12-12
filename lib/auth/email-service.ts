/**
 * Email Service
 * 
 * Uses Resend for sending emails (free tier: 100 emails/day)
 * Get your free API key at: https://resend.com/api-keys
 */

import { Resend } from 'resend'

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY

  if (!resendApiKey) {
    throw new Error('RESEND_API_KEY is not configured. Please add it to your .env.local file.')
  }

  // Prioritize production URL, falling back to env vars or localhost
  const baseUrl = 'https://www.convictionpays.com'

  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`

  const resend = new Resend(resendApiKey)

  // Modern "Spaceship" Dark Theme Styles
  // Background: #020617 (slate-950)
  // Card: #0f172a (slate-900)
  // Accent: Cyan/Blue gradients
  // Text: Slate-300/100

  await resend.emails.send({
    from: `Support ConvictionPays <${process.env.EMAIL_FROM || 'support@convictionpays.com'}>`,
    to: email,
    subject: 'Reset Your Password - ConvictionPays',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset Your Password</title>
        </head>
        <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #cbd5e1; background-color: #020617; margin: 0; padding: 0;">
          <div style="max-width: 600px; margin: 40px auto; background-color: #0f172a; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -1px rgba(0, 0, 0, 0.3); border: 1px solid #1e293b;">
            
            <!-- Header -->
            <div style="padding: 30px; text-align: center; border-bottom: 1px solid #1e293b; background: radial-gradient(circle at center, #1e293b 0%, #0f172a 100%);">
              <img src="https://www.convictionpays.com/convictionpaysfulllogoplustext.png" alt="ConvictionPays" style="height: 40px; width: auto;" />
            </div>
            
            <!-- Body -->
            <div style="padding: 40px 30px; text-align: center;">
              <h1 style="color: #f8fafc; font-size: 20px; margin-bottom: 24px; font-weight: 600;">Password Reset Request</h1>
              
              <p style="margin-bottom: 30px; font-size: 16px; color: #94a3b8;">
                We received a request to reset your password. If this was you, please click the button below to secure your account.
              </p>
              
              <!-- CTA Button -->
              <div style="margin: 35px 0;">
                <a href="${resetUrl}" style="background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 12px rgba(6, 182, 212, 0.25);">
                  Reset Password
                </a>
              </div>
              
              <p style="font-size: 14px; color: #64748b; margin-top: 30px; border-top: 1px solid #1e293b; padding-top: 20px;">
                Or copy this link to your browser:
              </p>
              <p style="font-size: 13px; color: #06b6d4; word-break: break-all; font-family: monospace; background: #020617; padding: 10px; border-radius: 6px; border: 1px solid #1e293b;">
                ${resetUrl}
              </p>
              
              <p style="font-size: 13px; color: #64748b; margin-top: 20px;">
                This link will expire in 1 hour.
              </p>
            </div>
            
            <!-- Footer -->
            <div style="background-color: #020617; padding: 20px; text-align: center; border-top: 1px solid #1e293b;">
              <p style="font-size: 12px; color: #475569; margin: 0;">
                &copy; ${new Date().getFullYear()} ConvictionPays. All rights reserved.
              </p>
              <p style="font-size: 12px; color: #475569; margin: 8px 0 0;">
                If you didn't request this, you can safely ignore this email.
              </p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `Reset Your Password - ConvictionPays
    
We received a request to reset your password. Use the link below to create a new password:

${resetUrl}

This link will expire in 1 hour.

If you didn't request this password reset, please ignore this email.`,
  })
}
