import { NextResponse } from 'next/server'
import { fetchBinanceSymbols } from '@/lib/portfolio/binance-api'

export async function GET() {
  try {
    const symbols = await fetchBinanceSymbols()
    return NextResponse.json({ symbols })
  } catch (error) {
    console.error('Error in Binance symbols API:', error)
    return NextResponse.json(
      { error: 'Failed to fetch symbols from Binance' },
      { status: 500 }
    )
  }
}





