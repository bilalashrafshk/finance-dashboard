import { PortfolioDashboardV2 } from "@/components/portfolio/portfolio-dashboard-v2"
import { SharedNavbar } from "@/components/shared-navbar"

export default function PortfolioPage() {
  return (
    <div className="min-h-screen bg-background">
      <SharedNavbar />
      <main>
        <PortfolioDashboardV2 />
      </main>
    </div>
  )
}




