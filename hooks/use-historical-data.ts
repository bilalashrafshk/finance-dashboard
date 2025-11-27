"use client"

import { useState, useEffect, useCallback } from 'react'
import { useToast } from "@/hooks/use-toast"

export interface PriceDataPoint {
    date: string
    close: number
    open?: number
    high?: number
    low?: number
    volume?: number
}

interface UseHistoricalDataOptions {
    assetType: string
    symbol: string
    limit?: number
    enabled?: boolean
}

interface UseHistoricalDataResult {
    data: PriceDataPoint[]
    loading: boolean
    error: string | null
    refetch: () => Promise<void>
}

export function useHistoricalData({
    assetType,
    symbol,
    limit,
    enabled = true
}: UseHistoricalDataOptions): UseHistoricalDataResult {
    const [data, setData] = useState<PriceDataPoint[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const { toast } = useToast()

    const fetchData = useCallback(async () => {
        if (!enabled || !symbol) return

        setLoading(true)
        setError(null)

        try {
            // Construct API URL
            let apiUrl = `/api/historical-data?assetType=${assetType}&symbol=${encodeURIComponent(symbol)}`
            if (limit) apiUrl += `&limit=${limit}`

            // Add market param for equities
            if (assetType === 'pk-equity') apiUrl += '&market=PSX'
            if (assetType === 'us-equity') apiUrl += '&market=US'

            const response = await fetch(apiUrl)

            if (!response.ok) {
                throw new Error(`Failed to fetch data: ${response.statusText}`)
            }

            const result = await response.json()

            // Check if client-side fetch is needed (for Metals, SPX500 etc. protected by Cloudflare)
            if (result.needsClientFetch && result.instrumentId) {
                console.log(`[useHistoricalData] Client-side fetch required for ${symbol}`)

                // Dynamically import client fetcher to keep bundle size small
                const { fetchInvestingHistoricalDataClient } = await import('@/lib/portfolio/investing-client-api')

                // Fetch all historical data (defaulting to a reasonable range if not specified)
                // For charts we usually want a good amount of history, say from 2000 or 2010
                const startDate = '2010-01-01'
                const endDate = new Date().toISOString().split('T')[0]

                const clientData = await fetchInvestingHistoricalDataClient(
                    result.instrumentId,
                    startDate,
                    endDate
                )

                if (clientData && clientData.length > 0) {
                    // Store the fetched data in the database for future use
                    try {
                        await fetch('/api/historical-data/store', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                assetType,
                                symbol,
                                data: clientData,
                                source: 'investing',
                            }),
                        })
                    } catch (storeError) {
                        console.error('[useHistoricalData] Failed to store client-fetched data:', storeError)
                        // Continue anyway since we have the data
                    }

                    // Transform to PriceDataPoint format
                    const formattedData: PriceDataPoint[] = clientData.map(d => ({
                        date: d.date,
                        close: d.close,
                        open: d.open,
                        high: d.high,
                        low: d.low,
                        volume: d.volume || undefined
                    })).sort((a, b) => a.date.localeCompare(b.date))

                    // Apply limit if needed
                    const finalData = limit ? formattedData.slice(-limit) : formattedData
                    setData(finalData)
                } else {
                    throw new Error('Failed to fetch data from client-side source')
                }
            } else if (result.data) {
                // Normal server-side data
                const formattedData: PriceDataPoint[] = result.data.map((record: any) => ({
                    date: record.date,
                    close: parseFloat(record.close) || 0,
                    open: parseFloat(record.open) || parseFloat(record.close) || 0,
                    high: parseFloat(record.high) || parseFloat(record.close) || 0,
                    low: parseFloat(record.low) || parseFloat(record.close) || 0,
                    volume: record.volume ? parseFloat(record.volume) : undefined,
                }))
                    .filter((point: PriceDataPoint) => point.close > 0)
                    .sort((a: PriceDataPoint, b: PriceDataPoint) => a.date.localeCompare(b.date))

                setData(formattedData)
            } else {
                setData([])
            }
        } catch (err: any) {
            console.error('[useHistoricalData] Error:', err)
            setError(err.message || 'Failed to load price data')
            toast({
                title: "Error loading data",
                description: `Could not load data for ${symbol}. ${err.message}`,
                variant: "destructive",
            })
            setData([])
        } finally {
            setLoading(false)
        }
    }, [assetType, symbol, limit, enabled, toast])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    return { data, loading, error, refetch: fetchData }
}
