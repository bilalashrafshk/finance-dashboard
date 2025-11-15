import { NextResponse } from 'next/server'
import { getAvailableMetals } from '@/lib/portfolio/metals-api'

export async function GET() {
  try {
    const metals = getAvailableMetals()
    return NextResponse.json({ metals })
  } catch (error) {
    console.error('Error fetching metals list:', error)
    return NextResponse.json(
      { error: 'Failed to fetch metals list' },
      { status: 500 }
    )
  }
}


