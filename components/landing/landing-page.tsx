'use client'

import React from 'react'
import LandingNavbar from '@/components/landing/navbar'
import HeroSection from '@/components/landing/hero-section'
import AnalyticsShowcase from '@/components/landing/analytics-showcase'
import FeaturesSection from '@/components/landing/features-section'
import DashboardPreview from '@/components/landing/dashboard-preview'
import PortfolioTrackerPreview from '@/components/landing/portfolio-tracker-preview'
import CtaSection from '@/components/landing/cta-section'
import Footer from '@/components/landing/footer'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <LandingNavbar />
      <HeroSection />
      <AnalyticsShowcase />
      <FeaturesSection />
      <DashboardPreview />
      <PortfolioTrackerPreview />
      <CtaSection />
      <Footer />
    </div>
  )
}

