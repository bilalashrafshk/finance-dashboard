'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { TrendingUp, Menu, X, LogOut, BarChart3, Wallet, Search, User, Settings, Crown, Filter, Grid3x3, Bell, Bot, MessageCircle } from 'lucide-react'
import { Logo } from '@/components/logo'
import { useAuth } from '@/lib/auth/auth-context'
import LoginModal from '@/components/landing/login-modal'
import { ThemeToggle } from '@/components/theme-toggle'
import { useTheme } from 'next-themes'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SettingsDialog } from '@/components/auth/settings-dialog'
import { GlobalSearch } from '@/components/global-search'

export function SharedNavbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [loginModalOpen, setLoginModalOpen] = useState(false)
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
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
      <nav className="sticky top-0 z-50 bg-[#020617]/80 backdrop-blur-xl border-b border-white/5 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-2 group">
              <Logo />
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-6">
              {user && (
                <>
                  <Link
                    href="/charts"
                    className={`px-4 py-2 rounded-lg transition-colors ${isActive('/charts')
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                      : 'text-slate-400 hover:text-white'
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      <span>Charts</span>
                    </div>
                  </Link>
                  <Link
                    href="/portfolio"
                    className={`px-4 py-2 rounded-lg transition-colors ${isActive('/portfolio')
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                      : 'text-slate-400 hover:text-white'
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4" />
                      <span>Portfolio</span>
                    </div>
                  </Link>
                  <Link
                    href="/my-list"
                    className={`px-4 py-2 rounded-lg transition-colors ${isActive('/my-list')
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                      : 'text-slate-400 hover:text-white'
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <Search className="w-4 h-4" />
                      <span>My List</span>
                    </div>
                  </Link>
                  <Link
                    href="/screener"
                    className={`px-4 py-2 rounded-lg transition-colors ${isActive('/screener')
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                      : 'text-slate-400 hover:text-white'
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <Filter className="w-4 h-4" />
                      <span>Screener</span>
                    </div>
                  </Link>
                  <Link
                    href="/events"
                    className={`px-4 py-2 rounded-lg transition-colors ${isActive('/events')
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                      : 'text-slate-400 hover:text-white'
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4" />
                      <span>Events</span>
                    </div>
                  </Link>
                  <a
                    href="https://discord.gg/TKxquPQf3V"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-lg transition-colors text-slate-400 hover:text-white"
                  >
                    <div className="flex items-center gap-2">
                      <MessageCircle className="w-4 h-4" />
                      <span>Community</span>
                    </div>
                  </a>
                </>
              )}
            </div>

            <div className="hidden md:flex items-center gap-4">
              {user && <GlobalSearch />}
              <ThemeToggle />
              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-3 px-4 py-2 bg-muted rounded-lg hover:bg-muted/80 transition-colors cursor-pointer">
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                        {user.name?.charAt(0).toUpperCase() || 'U'}
                      </div>
                      <span className="text-sm text-foreground">{user.name || 'User'}</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium">{user.name || 'User'}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                        <div className="flex flex-col gap-0.5 mt-1 pt-1 border-t border-border">
                          <p className="text-xs text-muted-foreground">Plan: <span className="font-medium">Lite</span></p>
                        </div>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="cursor-pointer">
                      <Crown className="mr-2 h-4 w-4 text-yellow-500" />
                      <span>Subscription & Tiers</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {(user.role === 'admin' || user.role === 'staff') && (
                      <>
                        <DropdownMenuLabel className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest px-2 py-1.5">
                          {user.role === 'admin' ? 'Admin Panel' : 'Staff Panel'}
                        </DropdownMenuLabel>

                        {(user.role === 'admin' || user.permissions?.includes('x-copilot')) && (
                          <DropdownMenuItem className="cursor-pointer" asChild>
                            <Link href="/admin/x-copilot" className="flex items-center">
                              <Bot className="mr-2 h-4 w-4 text-cyan-400" />
                              <span>X-Copilot</span>
                            </Link>
                          </DropdownMenuItem>
                        )}

                        {user.role === 'admin' && (
                          <DropdownMenuItem className="cursor-pointer" asChild>
                            <Link href="/admin/users" className="flex items-center">
                              <User className="mr-2 h-4 w-4" />
                              <span>User Management</span>
                            </Link>
                          </DropdownMenuItem>
                        )}

                        {user.role === 'admin' && (
                          <DropdownMenuItem className="cursor-pointer" asChild>
                            <Link href="/admin/price-viewer" className="flex items-center">
                              <BarChart3 className="mr-2 h-4 w-4" />
                              <span>Price Viewer</span>
                            </Link>
                          </DropdownMenuItem>
                        )}

                        {(user.role === 'admin' || user.permissions?.includes('prompts')) && (
                          <DropdownMenuItem className="cursor-pointer" asChild>
                            <Link href="/admin/prompts" className="flex items-center">
                              <Bot className="mr-2 h-4 w-4" />
                              <span>AI Prompts</span>
                            </Link>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                      </>
                    )}

                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => setSettingsDialogOpen(true)}
                    >
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Settings</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleLogout}
                      className="cursor-pointer text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Logout</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <>
                  <button
                    onClick={() => setLoginModalOpen(true)}
                    className="text-sm font-medium text-white hover:text-cyan-400 transition-colors"
                  >
                    Log In
                  </button>
                  <button
                    onClick={() => setLoginModalOpen(true)}
                    className="bg-white text-black hover:bg-cyan-50 px-5 py-2.5 rounded-full text-sm font-bold transition-all shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)] hover:shadow-[0_0_25px_-5px_rgba(6,182,212,0.5)] hover:-translate-y-0.5 active:translate-y-0"
                  >
                    Get Started
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
                    href="/charts"
                    className={`block px-4 py-2 rounded-lg transition-colors ${isActive('/charts')
                      ? 'bg-blue-600/20 text-blue-600 dark:text-blue-400 border border-blue-600/30'
                      : 'text-foreground hover:bg-muted'
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      <span>Charts</span>
                    </div>
                  </Link>
                  <Link
                    href="/portfolio"
                    className={`block px-4 py-2 rounded-lg transition-colors ${isActive('/portfolio')
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
                    href="/my-list"
                    className={`block px-4 py-2 rounded-lg transition-colors ${isActive('/my-list')
                      ? 'bg-blue-600/20 text-blue-600 dark:text-blue-400 border border-blue-600/30'
                      : 'text-foreground hover:bg-muted'
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <Search className="w-4 h-4" />
                      <span>My List</span>
                    </div>
                  </Link>
                  <Link
                    href="/screener"
                    className={`block px-4 py-2 rounded-lg transition-colors ${isActive('/screener')
                      ? 'bg-blue-600/20 text-blue-600 dark:text-blue-400 border border-blue-600/30'
                      : 'text-foreground hover:bg-muted'
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <Filter className="w-4 h-4" />
                      <span>Screener</span>
                    </div>
                  </Link>
                  <Link
                    href="/events"
                    className={`block px-4 py-2 rounded-lg transition-colors ${isActive('/events')
                      ? 'bg-blue-600/20 text-blue-600 dark:text-blue-400 border border-blue-600/30'
                      : 'text-foreground hover:bg-muted'
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4" />
                      <span>Events</span>
                    </div>
                  </Link>
                  <a
                    href="https://discord.gg/TKxquPQf3V"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-4 py-2 rounded-lg transition-colors text-foreground hover:bg-muted"
                  >
                    <div className="flex items-center gap-2">
                      <MessageCircle className="w-4 h-4" />
                      <span>Community</span>
                    </div>
                  </a>
                </div>
              )}
              <div className="pt-4 border-t border-border space-y-3">
                <div className="flex items-center justify-between px-4">
                  <span className="text-sm text-muted-foreground">Theme</span>
                  <ThemeToggle />
                </div>
                {user ? (
                  <>
                    <div className="flex items-center gap-3 px-4 py-2 bg-muted rounded-lg">
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                        {user.name?.charAt(0).toUpperCase() || 'U'}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{user.name || 'User'}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="w-full px-4 py-2 text-foreground border border-border rounded-lg hover:bg-muted transition-colors flex items-center justify-between">
                          <span>Account</span>
                          <Menu className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem className="cursor-pointer">
                          <Crown className="mr-2 h-4 w-4 text-yellow-500" />
                          <span>Subscription & Tiers</span>
                        </DropdownMenuItem>
                        {(user.role === 'admin' || user.role === 'staff') && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest px-2 py-1.5">
                              {user.role === 'admin' ? 'Admin Panel' : 'Staff Panel'}
                            </DropdownMenuLabel>

                            {(user.role === 'admin' || user.permissions?.includes('x-copilot')) && (
                              <DropdownMenuItem className="cursor-pointer" asChild>
                                <Link href="/admin/x-copilot" className="flex items-center">
                                  <Bot className="mr-2 h-4 w-4 text-cyan-400" />
                                  <span>X-Copilot</span>
                                </Link>
                              </DropdownMenuItem>
                            )}

                            {user.role === 'admin' && (
                              <DropdownMenuItem className="cursor-pointer" asChild>
                                <Link href="/admin/users" className="flex items-center">
                                  <User className="mr-2 h-4 w-4" />
                                  <span>User Management</span>
                                </Link>
                              </DropdownMenuItem>
                            )}

                            {user.role === 'admin' && (
                              <DropdownMenuItem className="cursor-pointer" asChild>
                                <Link href="/admin/price-viewer" className="flex items-center">
                                  <BarChart3 className="mr-2 h-4 w-4" />
                                  <span>Price Viewer</span>
                                </Link>
                              </DropdownMenuItem>
                            )}

                            {(user.role === 'admin' || user.permissions?.includes('prompts')) && (
                              <DropdownMenuItem className="cursor-pointer" asChild>
                                <Link href="/admin/prompts" className="flex items-center">
                                  <Bot className="mr-2 h-4 w-4" />
                                  <span>AI Prompts</span>
                                </Link>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                          </>
                        )}
                        <DropdownMenuItem
                          className="cursor-pointer"
                          onClick={() => setSettingsDialogOpen(true)}
                        >
                          <Settings className="mr-2 h-4 w-4" />
                          <span>Settings</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={handleLogout}
                          className="cursor-pointer text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
                        >
                          <LogOut className="mr-2 h-4 w-4" />
                          <span>Logout</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
        </div >
      </nav >

      <LoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
      />

      <SettingsDialog
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
      />
    </>
  )
}
