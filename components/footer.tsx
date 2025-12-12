
import React from 'react'
import { Logo } from '@/components/logo'
import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#020617] pt-20 pb-10 relative z-10">
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-12 mb-16">
        <div className="col-span-1 md:col-span-1">
          <Logo />
          <p className="text-slate-500 text-sm leading-relaxed mb-6 mt-4">
            Professional quantitative research platform for Pakistani equities, with research capabilities for US equities, crypto, and metals.
          </p>
        </div>

        <div>
          <h4 className="font-bold text-white mb-6">Company</h4>
          <ul className="space-y-4 text-sm text-slate-400">
            <li><Link href="/about" className="hover:text-cyan-400 transition-colors">About</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="font-bold text-white mb-6">Legal</h4>
          <ul className="space-y-4 text-sm text-slate-400">
            <li><Link href="/privacy" className="hover:text-cyan-400 transition-colors">Privacy</Link></li>
            <li><Link href="/terms" className="hover:text-cyan-400 transition-colors">Terms</Link></li>
            <li><Link href="/security" className="hover:text-cyan-400 transition-colors">Security</Link></li>
          </ul>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 mb-8">
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
          <p className="text-yellow-200/80 text-xs leading-relaxed text-center">
            <span className="font-bold text-yellow-500">DISCLAIMER:</span> The data and information provided on this platform are for informational purposes only and do not constitute financial advice. Investment decisions should be made based on your own research and consultation with a qualified financial advisor.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center pt-8 border-t border-white/5">
        <div className="text-slate-600 text-sm mb-4 md:mb-0">
          &copy; 2025 ConvictionPays. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
