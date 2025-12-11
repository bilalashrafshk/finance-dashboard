import { NextRequest, NextResponse } from 'next/server'
import { TrackedAsset } from '@/components/asset-screener/add-asset-dialog'
import { getCachedAssetMetrics } from '@/lib/asset-screener/server-metrics'

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { assets } = body as { assets: TrackedAsset[] }

        if (!assets || !Array.isArray(assets)) {
            return NextResponse.json({ error: 'Invalid assets data' }, { status: 400 })
        }

        // Get base URL from request
        const protocol = req.headers.get('x-forwarded-proto') || 'http'
        const host = req.headers.get('host') || 'localhost:3000'
        const baseUrl = `${protocol}://${host}`

        // Process assets in parallel
        // We limit concurrency if needed, but for < 50 assets Promise.all is fine

        const results = await Promise.all(
            assets.map(async (asset) => {
                try {
                    const metrics = await getCachedAssetMetrics(asset, baseUrl)
                    return {
                        id: asset.id,
                        metrics
                    }
                } catch (e) {
                    console.error(`[API] Error fetching metrics for ${asset.symbol}:`, e)
                    return {
                        id: asset.id,
                        metrics: { loading: false, error: true }
                    }
                }
            })
        )

        // Convert to map
        const metricsMap = results.reduce((acc, curr) => {
            acc[curr.id] = curr.metrics
            return acc
        }, {} as Record<string, any>)

        return NextResponse.json({ metrics: metricsMap })
    } catch (error) {
        console.error('Error in bulk metrics API:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
