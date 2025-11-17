"use client"

import { useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { generateAssetSlug } from "@/lib/asset-screener/url-utils"
import type { TrackedAsset } from "@/components/asset-screener/add-asset-dialog"

/**
 * Legacy route handler for /asset-screener/[id]
 * Redirects to the new /asset-screener/[slug] format
 */
export default function LegacyAssetDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const assetId = params.id as string

  useEffect(() => {
    // If the ID contains a hyphen, it's likely a slug format - don't handle it here
    // Let it fall through to the [slug] route
    if (assetId && assetId.includes('-')) {
      return
    }

    if (!authLoading && user) {
      redirectToNewFormat()
    } else if (!authLoading && !user) {
      router.push('/asset-screener')
    }
  }, [authLoading, user, assetId])

  const redirectToNewFormat = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      if (!token) {
        router.push('/asset-screener')
        return
      }

      // Fetch all assets and find the one with matching ID
      const response = await fetch('/api/user/tracked-assets', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          const foundAsset = data.assets.find((a: TrackedAsset) => a.id === assetId)
          if (foundAsset) {
            // Redirect to new slug format
            const slug = generateAssetSlug(foundAsset.assetType, foundAsset.symbol)
            router.replace(`/asset-screener/${slug}`)
          } else {
            router.push('/asset-screener')
          }
        }
      } else {
        router.push('/asset-screener')
      }
    } catch (error) {
      console.error('Error redirecting asset:', error)
      router.push('/asset-screener')
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    </main>
  )
}

