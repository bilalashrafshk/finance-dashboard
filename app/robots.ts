import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: '*',
            allow: '/',
            disallow: ['/api/*'], // Generally good to hide API routes from crawlers unless they serve content
        },
        sitemap: 'https://www.convictionpays.com/sitemap.xml',
    }
}
