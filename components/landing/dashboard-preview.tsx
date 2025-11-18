import React from 'react'
import { ArrowUpRight, ArrowDownRight } from 'lucide-react'

export default function DashboardPreview() {
  return (
    <section className="py-20 px-4 relative">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12 space-y-4">
          <h2 className="text-4xl font-bold text-white">
            Dashboard Overview
          </h2>
          <p className="text-lg text-slate-400">
            Visualize your entire portfolio with advanced analytics
          </p>
        </div>

        <div className="relative bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-8 overflow-hidden">
          {/* Grid background */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute inset-0" style={{
              backgroundImage: 'linear-gradient(rgba(59, 130, 246, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(59, 130, 246, 0.1) 1px, transparent 1px)',
              backgroundSize: '40px 40px'
            }} />
          </div>

          <div className="relative z-10">
            {/* Mock dashboard content */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
              {[
                { label: 'Portfolio Value', value: '$125,430', change: '+12.5%', positive: true },
                { label: 'Sharpe Ratio', value: '1.84', change: '+0.3', positive: true },
                { label: 'Max Drawdown', value: '-8.2%', change: '-1.2%', positive: true },
                { label: 'CAGR', value: '18.3%', change: '+3.1%', positive: true }
              ].map((stat, idx) => (
                <div key={idx} className="p-4 bg-slate-900/50 border border-slate-800 rounded-lg">
                  <div className="text-sm text-slate-400 mb-1">{stat.label}</div>
                  <div className="text-2xl font-bold text-white mb-2">{stat.value}</div>
                  <div className="flex items-center gap-1">
                    {stat.positive ? (
                      <>
                        <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm text-emerald-400">{stat.change}</span>
                      </>
                    ) : (
                      <>
                        <ArrowDownRight className="w-4 h-4 text-red-400" />
                        <span className="text-sm text-red-400">{stat.change}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Mock chart area */}
            <div className="bg-slate-900/30 border border-slate-800 rounded-lg p-6 h-64 flex items-center justify-center">
              <div className="text-center text-slate-500">
                <div className="text-sm mb-2">Interactive Charts & Analytics</div>
                <div className="w-full h-32 bg-gradient-to-t from-blue-600/10 to-transparent rounded flex items-end justify-around px-4 py-8">
                  {[30, 45, 60, 40, 75, 55, 65].map((height, i) => (
                    <div
                      key={i}
                      className="w-full bg-gradient-to-t from-blue-500 to-cyan-500 rounded-t opacity-70 hover:opacity-100 transition-opacity"
                      style={{ height: `${height}%` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

