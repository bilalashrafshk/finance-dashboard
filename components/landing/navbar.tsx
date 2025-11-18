'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { TrendingUp, Menu, X, LogOut } from 'lucide-react'
import { useAuth } from '@/lib/auth/auth-context'
import LoginModal from '@/components/landing/login-modal'

export default function LandingNavbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [loginModalOpen, setLoginModalOpen] = useState(false)
  const { user, logout } = useAuth()

  const handleLogout = () => {
    logout()
  }

  return (
    <>
      <nav className="sticky top-0 z-50 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg group-hover:shadow-lg group-hover:shadow-blue-500/20 transition-all">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-bold text-white">Stack Them Gains</span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
            </div>

            <div className="hidden md:flex items-center gap-4">
              {user ? (
                <>
                  <Link href="/portfolio" className="px-4 py-2 text-slate-300 hover:text-white transition-colors">
                    Portfolio
                  </Link>
                  <div className="flex items-center gap-3 px-4 py-2 bg-slate-800/50 rounded-lg">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                      {user.name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <span className="text-sm text-white">{user.name || 'User'}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="p-2 text-slate-300 hover:text-red-400 transition-colors"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setLoginModalOpen(true)}
                    className="px-6 py-2 text-slate-300 hover:text-white transition-colors"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => setLoginModalOpen(true)}
                    className="px-6 py-2 rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-medium hover:shadow-lg hover:shadow-blue-500/20 transition-all"
                  >
                    Sign Up
                  </button>
                </>
              )}
            </div>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden text-white"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-slate-800 py-4 space-y-4">
              <div className="pt-4 border-t border-slate-800 space-y-3">
                {user ? (
                  <>
                    <Link href="/portfolio" className="block px-4 py-2 text-white bg-slate-800 rounded-lg">
                      Portfolio
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="w-full px-4 py-2 text-white bg-red-900/50 border border-red-800 rounded-lg hover:bg-red-900 transition-colors"
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setLoginModalOpen(true)}
                      className="block w-full px-4 py-2 text-white border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors"
                    >
                      Sign In
                    </button>
                    <button
                      onClick={() => setLoginModalOpen(true)}
                      className="block w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg"
                    >
                      Sign Up
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </nav>

      <LoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
      />
    </>
  )
}

