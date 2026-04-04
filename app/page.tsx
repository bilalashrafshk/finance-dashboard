"use client"

import { useAuth } from "@/lib/auth/auth-context"
import LandingPage from "@/components/landing/landing-page"
import { SharedNavbar } from "@/components/shared-navbar"

import { DashboardView } from "@/components/dashboard/dashboard-view"

function DashboardHome() {
  return (
    <div className="min-h-screen bg-background">
      <SharedNavbar />
      <DashboardView />
    </div>
  )
}

export default function Home() {
  const { user, loading } = useAuth()

  // Show loading state or landing page while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        {/* Skeleton navbar */}
        <div className="h-16 border-b border-border px-6 flex items-center gap-4">
          <div className="h-7 w-32 bg-muted rounded-md animate-pulse" />
          <div className="hidden md:flex gap-3 flex-1 ml-8">
            {[80, 60, 70, 90, 50].map((w, i) => (
              <div key={i} style={{ width: `${w}px` }} className="h-4 bg-muted rounded animate-pulse" />
            ))}
          </div>
          <div className="ml-auto h-9 w-9 bg-muted rounded-full animate-pulse" />
        </div>
        {/* Skeleton content */}
        <div className="max-w-7xl mx-auto p-6 md:p-8 space-y-8">
          <div className="space-y-2">
            <div className="h-8 w-64 bg-muted rounded animate-pulse" />
            <div className="h-4 w-96 bg-muted/60 rounded animate-pulse" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-card border border-border rounded-xl p-5 space-y-3">
                <div className="h-3 w-16 bg-muted rounded animate-pulse" />
                <div className="h-5 w-full bg-muted rounded animate-pulse" />
                <div className="h-20 w-full bg-muted/50 rounded-lg animate-pulse" />
                <div className="h-3 w-24 bg-muted/40 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Show landing page for logged out users, dashboard for logged in users
  if (!user) {
    return <LandingPage />
  }

  return <DashboardHome />
}
