import React from 'react'
import { TrendingUp, PieChart, Zap, Lock, Database, BarChart3 } from 'lucide-react'

const features = [
  {
    icon: TrendingUp,
    title: 'Risk-Adjusted Returns',
    description: 'Calculate Sharpe ratio, Sortino ratio, and other risk metrics to compare investments on equal footing.'
  },
  {
    icon: PieChart,
    title: 'Asset Outperformance Analysis',
    description: 'Identify which assets beat their benchmarks historically and which ones consistently underperform markets.'
  },
  {
    icon: BarChart3,
    title: 'Historic Data Deep Dive',
    description: 'Access 10+ years of historical data with seasonality patterns, drawdown analysis, and recovery metrics.'
  },
  {
    icon: Zap,
    title: 'Smart Optimization',
    description: 'Portfolio optimization using Modern Portfolio Theory and risk-adjusted return calculations.'
  },
  {
    icon: Lock,
    title: 'Secure Auth',
    description: 'Protected user accounts with secure authentication and role-based access controls.'
  },
  {
    icon: Database,
    title: 'Multiple Data Sources',
    description: 'Integration with premium data providers for US stocks, PSX, crypto, and global indices.'
  }
]

export default function FeaturesSection() {
  return (
    <section className="py-20 px-4 relative">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16 space-y-4">
          <h2 className="text-4xl lg:text-5xl font-bold text-white">
            Comprehensive <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">Investment Tools</span>
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Everything you need to analyze, optimize, and manage your investment portfolio with professional-grade metrics.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group p-6 bg-slate-900/50 border border-slate-800 rounded-xl hover:border-blue-600/50 hover:bg-slate-900/80 transition-all duration-300"
            >
              <div className="mb-4 inline-flex p-3 bg-gradient-to-br from-blue-600/20 to-cyan-600/20 rounded-lg group-hover:from-blue-600/30 group-hover:to-cyan-600/30 transition-colors">
                <feature.icon className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

