'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { TrendingUp, Menu, X, LogOut, BarChart3, Wallet, Search } from 'lucide-react'
import { useAuth } from '@/lib/auth/auth-context'
import LoginModal from '@/components/landing/login-modal'
import { ThemeToggle } from '@/components/theme-toggle'
import { useTheme } from 'next-themes'

export function SharedNavbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [loginModalOpen, setLoginModalOpen] = useState(false)
  const { user, logout } = useAuth()
  const pathname = usePathname()
  const { theme } = useTheme()

  const handleLogout = () => {
    logout()
  }

  const isActive = (path: string) => pathname === path
  const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <>
      <nav className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-2 group">
              <span className="text-lg font-bold text-foreground inline-flex items-baseline">
                {"STACK THEM GAINS".split("").map((char, index) => {
                  const scale = Math.pow(1.06, index); // Compounding factor of 6% per letter
                  // Round to 4 decimal places to prevent hydration mismatch
                  const fontSize = Math.round(scale * 10000) / 10000;
                  return (
                    <span
                      key={index}
                      className="text-foreground"
                      style={{
                        fontSize: `${fontSize}em`,
                      }}
                    >
                      {char === " " ? "\u00A0" : char}
                    </span>
                  );
                })}
              </span>
              <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg group-hover:shadow-lg group-hover:shadow-blue-500/20 transition-all">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-6">
              {user && (
                <>
                  <Link 
                    href="/eth-risk" 
                    className={`px-4 py-2 rounded-lg transition-colors ${
                      isActive('/eth-risk') 
                        ? 'bg-blue-600/20 text-blue-600 dark:text-blue-400 border border-blue-600/30' 
                        : 'text-foreground hover:text-blue-600 dark:hover:text-blue-400'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      <span>ETH Risk</span>
                    </div>
                  </Link>
                  <Link 
                    href="/portfolio" 
                    className={`px-4 py-2 rounded-lg transition-colors ${
                      isActive('/portfolio') 
                        ? 'bg-blue-600/20 text-blue-600 dark:text-blue-400 border border-blue-600/30' 
                        : 'text-foreground hover:text-blue-600 dark:hover:text-blue-400'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4" />
                      <span>Portfolio</span>
                    </div>
                  </Link>
                  <Link 
                    href="/asset-screener" 
                    className={`px-4 py-2 rounded-lg transition-colors ${
                      isActive('/asset-screener') 
                        ? 'bg-blue-600/20 text-blue-600 dark:text-blue-400 border border-blue-600/30' 
                        : 'text-foreground hover:text-blue-600 dark:hover:text-blue-400'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Search className="w-4 h-4" />
                      <span>Asset Screener</span>
                    </div>
                  </Link>
                </>
              )}
            </div>

            <div className="hidden md:flex items-center gap-4">
              <ThemeToggle />
              {user ? (
                <>
                  <div className="flex items-center gap-3 px-4 py-2 bg-muted rounded-lg">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                      {user.name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <span className="text-sm text-foreground">{user.name || 'User'}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="p-2 text-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setLoginModalOpen(true)}
                    className="px-6 py-2 text-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
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
              className="md:hidden text-foreground"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-border py-4 space-y-4">
              {user && (
                <div className="space-y-2">
                  <Link 
                    href="/eth-risk" 
                    className={`block px-4 py-2 rounded-lg transition-colors ${
                      isActive('/eth-risk') 
                        ? 'bg-blue-600/20 text-blue-600 dark:text-blue-400 border border-blue-600/30' 
                        : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      <span>ETH Risk</span>
                    </div>
                  </Link>
                  <Link 
                    href="/portfolio" 
                    className={`block px-4 py-2 rounded-lg transition-colors ${
                      isActive('/portfolio') 
                        ? 'bg-blue-600/20 text-blue-600 dark:text-blue-400 border border-blue-600/30' 
                        : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4" />
                      <span>Portfolio</span>
                    </div>
                  </Link>
                  <Link 
                    href="/asset-screener" 
                    className={`block px-4 py-2 rounded-lg transition-colors ${
                      isActive('/asset-screener') 
                        ? 'bg-blue-600/20 text-blue-600 dark:text-blue-400 border border-blue-600/30' 
                        : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Search className="w-4 h-4" />
                      <span>Asset Screener</span>
                    </div>
                  </Link>
                </div>
              )}
              <div className="pt-4 border-t border-border space-y-3">
                <div className="flex items-center justify-between px-4">
                  <span className="text-sm text-muted-foreground">Theme</span>
                  <ThemeToggle />
                </div>
                {user ? (
                  <>
                    <button
                      onClick={handleLogout}
                      className="w-full px-4 py-2 text-white bg-red-600 dark:bg-red-900/50 border border-red-600 dark:border-red-800 rounded-lg hover:bg-red-700 dark:hover:bg-red-900 transition-colors"
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setLoginModalOpen(true)}
                      className="block w-full px-4 py-2 text-foreground border border-border rounded-lg hover:bg-muted transition-colors"
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

