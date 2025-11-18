import { EthRiskDashboard } from "@/components/eth-risk-dashboard"
import { SharedNavbar } from "@/components/shared-navbar"

export default function EthRiskPage() {
  return (
    <div className="min-h-screen bg-background">
      <SharedNavbar />
      <main>
        <EthRiskDashboard />
      </main>
    </div>
  )
}

