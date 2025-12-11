import React from 'react'
import { TrendingUp } from 'lucide-react'
import { Logo } from '@/components/logo'
import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="border-t border-slate-800 bg-slate-950/50 backdrop-blur-sm py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Logo />
            </div>
            <p className="text-sm text-white/80">
              Professional investment analytics for PSX, US Stocks, and Crypto.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-4">Legal</h4>
            <div className="space-y-2 text-sm text-white/80">
              <Link href="/privacy" className="hover:text-blue-400 transition-colors">Privacy Policy</Link>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-white/80">
            <p>&copy; 2025 Conviction Pays. All rights reserved.</p>
            <div className="flex gap-6">
              <Link href="#" className="hover:text-blue-400 transition-colors">Twitter</Link>
              <Link href="#" className="hover:text-blue-400 transition-colors">LinkedIn</Link>
              <Link href="#" className="hover:text-blue-400 transition-colors">Discord</Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

