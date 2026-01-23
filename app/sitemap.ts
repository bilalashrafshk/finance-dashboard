import { MetadataRoute } from 'next'
import { getPool } from '@/lib/db'
import { generateAssetSlug } from '@/lib/asset-screener/url-utils'

const BASE_URL = 'https://www.convictionpays.com'

async function getPSXStocks(): Promise<string[]> {
    try {
        const pool = getPool()
        const res = await pool.query('SELECT symbol FROM stocks WHERE market = $1', ['PSX'])
        return res.rows.map(r => generateAssetSlug('pk-equity', r.symbol))
    } catch (e) {
        console.error('Sitemap PSX Fetch Error', e)
        return []
    }
}

async function getCryptoAssets(): Promise<string[]> {
    // Hardcoded major assets + potentially fetch more
    // Standardizing crypto slugs as 'crypto-SYMBOL' based on url-utils if applicable
    // But current url-utils: generateAssetSlug('crypto', 'BTC') -> 'crypto-BTC'
    const majorCryptos = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX']
    return majorCryptos.map(c => generateAssetSlug('crypto', c))
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {

    // 1. Static Routes
    const staticRoutes = [
        '',
        '/dashboard',
        '/screener',
        '/portfolio',
        '/charts',
        '/pricing',
        '/login'
    ].map((route) => ({
        url: `${BASE_URL}${route}`,
        lastModified: new Date(),
        changeFrequency: 'daily' as const,
        priority: route === '' ? 1 : 0.8,
    }))

    // 2. Dynamic Asset Routes
    const psxSlugs = await getPSXStocks()
    const cryptoSlugs = await getCryptoAssets()

    const assetRoutes = [...psxSlugs, ...cryptoSlugs].map(slug => ({
        url: `${BASE_URL}/asset/${slug}`,
        lastModified: new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.6
    }))

    return [...staticRoutes, ...assetRoutes]
}
