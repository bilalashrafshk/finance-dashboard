"use client"

import { useAuth } from "@/lib/auth/auth-context"
import LandingPage from "@/components/landing/landing-page"
import { SharedNavbar } from "@/components/shared-navbar"

import { DashboardView } from "@/components/dashboard/dashboard-view"

function DashboardHome() {
  return (
    <div className="min-h-screen bg-slate-950">
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground">Loading...</div>
      </div>
    )
  }

  // Show landing page for logged out users, dashboard for logged in users
  if (!user) {
    return <LandingPage />
  }

  return <DashboardHome />
}
