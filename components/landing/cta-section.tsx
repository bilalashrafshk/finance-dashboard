import React from 'react'
import { ChevronRight } from 'lucide-react'
import Link from 'next/link'

export default function CtaSection() {
  return (
    <section className="py-20 px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-blue-950/20 via-cyan-950/20 to-blue-950/20 pointer-events-none" />
      
      <div className="max-w-4xl mx-auto relative z-10 text-center space-y-8">
        <h2 className="text-4xl lg:text-5xl font-bold text-white leading-tight">
          Ready to stack your gains?
        </h2>
        
        <p className="text-lg text-slate-300 max-w-2xl mx-auto">
          Join thousands of investors using Stack Them Gains to optimize their portfolio across PSX, US stocks, and crypto markets.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/portfolio" className="group px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold rounded-xl hover:shadow-xl hover:shadow-blue-500/30 transition-all inline-flex items-center justify-center gap-2">
            Get Started
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link href="/asset-screener" className="px-8 py-4 bg-slate-800/50 border border-slate-700 text-white font-semibold rounded-xl hover:bg-slate-800 transition-colors">
            Explore Assets
          </Link>
        </div>

        <p className="text-sm text-slate-400">
          Get instant access to quantitative analysis tools and portfolio optimization.
        </p>
      </div>
    </section>
  )
}

