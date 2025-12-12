import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
    const baseUrl = 'https://www.convictionpays.com'

    // You can extend this list dynamically by fetching from your API/DB if needed
    const routes = [
        '',
        '/dashboard',
        '/screener',
        '/portfolio',
        '/settings',
    ]

    return routes.map((route) => ({
        url: `${baseUrl}${route}`,
        lastModified: new Date(),
        changeFrequency: 'daily',
        priority: route === '' ? 1 : 0.8,
    }))
}
