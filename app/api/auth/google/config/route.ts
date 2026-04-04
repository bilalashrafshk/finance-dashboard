import { NextResponse } from 'next/server'

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  
  if (!clientId) {
    console.error('GOOGLE_CLIENT_ID is not defined in environment variables')
    return NextResponse.json(
      { error: 'Google configuration is missing on the server' },
      { status: 500 }
    )
  }

  return NextResponse.json({ clientId })
}
