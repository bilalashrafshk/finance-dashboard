import { PortfolioDashboard } from "@/components/portfolio/portfolio-dashboard"
import { SharedNavbar } from "@/components/shared-navbar"

export default function PortfolioPage() {
  return (
    <div className="min-h-screen bg-background">
      <SharedNavbar />
      <main>
        <PortfolioDashboard />
      </main>
    </div>
  )
}




