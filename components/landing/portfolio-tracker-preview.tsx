import React from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { TrendingUp, TrendingDown, DollarSign, Percent } from 'lucide-react'

const portfolioData = [
  { name: 'US Equities', value: 45, color: '#3B82F6' },
  { name: 'PSX Stocks', value: 25, color: '#06B6D4' },
  { name: 'Crypto', value: 20, color: '#8B5CF6' },
  { name: 'Bonds', value: 8, color: '#10B981' },
  { name: 'Metals', value: 2, color: '#F59E0B' }
]

const holdings = [
  { symbol: 'AAPL', name: 'Apple Inc', shares: 15, price: 228.50, value: 3427.50, gain: 12.3, positive: true },
  { symbol: 'MSFT', name: 'Microsoft Corp', shares: 8, price: 416.75, value: 3334.00, gain: 8.9, positive: true },
  { symbol: 'HBL', name: 'Habib Bank', shares: 500, price: 68.20, value: 34100.00, gain: -2.1, positive: false },
  { symbol: 'BTC', name: 'Bitcoin', shares: 0.25, price: 42500.00, value: 10625.00, gain: 45.2, positive: true },
  { symbol: 'ETH', name: 'Ethereum', shares: 1.5, price: 2280.00, value: 3420.00, gain: 38.5, positive: true },
  { symbol: 'TLVF', name: 'TransformData', shares: 1000, price: 1.82, value: 1820.00, gain: 5.4, positive: true }
]

export default function PortfolioTrackerPreview() {
  return (
    <section className="py-20 px-4 relative bg-gradient-to-b from-slate-900/50 to-slate-950">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12 space-y-4">
          <h2 className="text-4xl font-bold text-white">
            Multi-Asset <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">Portfolio Management</span>
          </h2>
          <p className="text-lg text-slate-400">
            Unified tracking across PSX, US Stocks, Crypto, and more
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {/* Allocation Pie Chart */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-8">
            <h3 className="text-lg font-semibold text-white mb-6">Portfolio Allocation</h3>
            <div className="h-64 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={portfolioData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name} ${value}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {portfolioData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value) => `${value}%`}
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                    labelStyle={{ color: '#e2e8f0' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Portfolio Summary Cards */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Total Value', value: '$62,726.50', icon: DollarSign, color: 'from-blue-600 to-cyan-600' },
                { label: 'Total Return', value: '+18.7%', icon: TrendingUp, color: 'from-emerald-600 to-teal-600' },
                { label: 'YTD Performance', value: '+22.3%', icon: Percent, color: 'from-purple-600 to-pink-600' },
                { label: 'Diversification', value: '5 Assets', icon: TrendingDown, color: 'from-orange-600 to-red-600' }
              ].map((stat, idx) => {
                const Icon = stat.icon
                return (
                  <div key={idx} className={`p-4 bg-gradient-to-br ${stat.color} bg-opacity-10 border border-slate-700 rounded-lg hover:border-slate-600 transition-colors`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="w-4 h-4 text-slate-300" />
                      <div className="text-xs text-slate-400">{stat.label}</div>
                    </div>
                    <div className="text-2xl font-bold text-white">{stat.value}</div>
                  </div>
                )
              })}
            </div>

            {/* Asset Type Breakdown */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-white mb-3">Asset Types</h4>
              <div className="space-y-2">
                {portfolioData.map((asset) => (
                  <div key={asset.name} className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: asset.color }} />
                    <div className="flex-1">
                      <div className="text-sm text-slate-300">{asset.name}</div>
                    </div>
                    <div className="text-sm font-semibold text-white">{asset.value}%</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Holdings Table */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 overflow-x-auto">
          <h3 className="text-lg font-semibold text-white mb-6">Your Holdings</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-3 px-4 text-slate-400 font-medium">Symbol</th>
                <th className="text-right py-3 px-4 text-slate-400 font-medium">Shares</th>
                <th className="text-right py-3 px-4 text-slate-400 font-medium">Price</th>
                <th className="text-right py-3 px-4 text-slate-400 font-medium">Value</th>
                <th className="text-right py-3 px-4 text-slate-400 font-medium">Gain/Loss</th>
                <th className="text-right py-3 px-4 text-slate-400 font-medium">%</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((holding) => (
                <tr key={holding.symbol} className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                  <td className="py-4 px-4">
                    <div className="font-semibold text-white">{holding.symbol}</div>
                    <div className="text-xs text-slate-400">{holding.name}</div>
                  </td>
                  <td className="text-right py-4 px-4 text-slate-300">{holding.shares}</td>
                  <td className="text-right py-4 px-4 text-slate-300">${holding.price.toLocaleString()}</td>
                  <td className="text-right py-4 px-4 font-semibold text-white">${holding.value.toLocaleString()}</td>
                  <td className={`text-right py-4 px-4 font-semibold ${holding.positive ? 'text-emerald-400' : 'text-red-400'}`}>
                    {holding.positive ? '+' : ''}{holding.gain.toFixed(1)}%
                  </td>
                  <td className="text-right py-4 px-4">
                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full ${
                      holding.positive 
                        ? 'bg-emerald-900/50 text-emerald-300' 
                        : 'bg-red-900/50 text-red-300'
                    }`}>
                      {holding.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Supported Assets Info */}
        <div className="mt-12 p-8 bg-gradient-to-r from-blue-950/30 to-cyan-950/30 border border-blue-800/30 rounded-xl">
          <h3 className="text-lg font-semibold text-white mb-4">Comprehensive Asset Coverage</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { emoji: '🇺🇸', label: 'US Stocks', count: '5,000+' },
              { emoji: '🇵🇰', label: 'PSX Listed', count: '500+' },
              { emoji: '₿', label: 'Cryptocurrencies', count: '1,000+' },
              { emoji: '📊', label: 'Indices', count: '200+' },
              { emoji: '🏦', label: 'Bonds', count: '100+' },
              { emoji: '⛓️', label: 'DeFi Assets', count: '500+' },
              { emoji: '🥇', label: 'Precious Metals', count: '10+' },
              { emoji: '📈', label: 'ETFs', count: '2,000+' }
            ].map((asset, idx) => (
              <div key={idx} className="text-center">
                <div className="text-3xl mb-2">{asset.emoji}</div>
                <div className="text-sm font-medium text-white">{asset.label}</div>
                <div className="text-xs text-slate-400">{asset.count}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

