"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { SharedNavbar } from "@/components/shared-navbar"
import { AddAssetDialog } from "@/components/asset-screener/add-asset-dialog"
import { AssetTable } from "@/components/asset-screener/asset-table"
import type { TrackedAsset } from "@/components/asset-screener/add-asset-dialog"
import { LoginDialog } from "@/components/auth/login-dialog"
import { RegisterDialog } from "@/components/auth/register-dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function AssetScreenerPage() {
  const { user, loading: authLoading } = useAuth()
  const [assets, setAssets] = useState<TrackedAsset[]>([])
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!authLoading && user) {
      loadAssets()
    } else if (!authLoading && !user) {
      setLoading(false)
    }
  }, [authLoading, user])

  const loadAssets = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('auth_token')
      if (!token) {
        setAssets([])
        return
      }

      const response = await fetch('/api/user/tracked-assets', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setAssets(data.assets)
        }
      } else if (response.status === 401) {
        setAssets([])
      }
    } catch (error) {
      console.error('Error loading assets:', error)
      setAssets([])
    } finally {
      setLoading(false)
    }
  }

  const handleAddAsset = async (assetData: Omit<TrackedAsset, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const token = localStorage.getItem('auth_token')
      if (!token) {
        throw new Error('Authentication required')
      }

      const response = await fetch('/api/user/tracked-assets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(assetData),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to add asset')
      }

      const data = await response.json()
      if (data.success) {
        await loadAssets()
      }
    } catch (error: any) {
      console.error('Error adding asset:', error)
      throw error
    }
  }

  const handleDeleteAsset = async (id: string) => {
    try {
      const token = localStorage.getItem('auth_token')
      if (!token) {
        throw new Error('Authentication required')
      }

      const response = await fetch(`/api/user/tracked-assets/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete asset')
      }

      await loadAssets()
    } catch (error: any) {
      console.error('Error deleting asset:', error)
      throw error
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background">
        <SharedNavbar />
        <main>
          <div className="container mx-auto px-4 py-8">
            <div className="flex items-center justify-center py-12">
              <p className="text-foreground">Loading...</p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <SharedNavbar />
        <main>
          <div className="container mx-auto px-4 py-8">
            <div className="max-w-2xl mx-auto">
              <Card>
                <CardHeader>
                  <CardTitle>My List</CardTitle>
                  <CardDescription>
                    Track and analyze assets. Sign in to get started.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <LoginDialog>
                      <Button>Login</Button>
                    </LoginDialog>
                    <RegisterDialog>
                      <Button variant="outline">Sign Up</Button>
                    </RegisterDialog>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <SharedNavbar />
      <main>
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold">My List</h1>
              <p className="text-muted-foreground mt-1">
                Track and analyze your assets with key metrics
              </p>
            </div>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Asset
            </Button>
          </div>

          {!loading && assets.length > 0 && (
            <div className="mb-6">
              <p className="text-sm text-muted-foreground">
                Tracking <span className="font-semibold">{assets.length}</span> asset{assets.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}

          <AssetTable
            assets={assets}
            onDelete={handleDeleteAsset}
            loading={loading}
          />

          <AddAssetDialog
            open={isAddDialogOpen}
            onOpenChange={setIsAddDialogOpen}
            onSave={handleAddAsset}
          />
        </div>
      </main>
    </div>
  )
}

