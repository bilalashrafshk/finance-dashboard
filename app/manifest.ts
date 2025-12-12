import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Conviction Pays - Risk Metric Dashboard',
        short_name: 'Conviction Pays',
        description: 'Advanced investment risk analysis and portfolio management tools.',
        start_url: '/',
        display: 'standalone',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
            {
                src: '/icon-only-transparent.png',
                sizes: 'any',
                type: 'image/png',
            },
            {
                src: '/apple-icon',
                sizes: '180x180',
                type: 'image/png',
            },
        ],
    }
}
