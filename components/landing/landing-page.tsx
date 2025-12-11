"use client"

import React, { useState, useEffect, useRef } from 'react';
import {
  TrendingUp,
  BarChart2,
  PieChart,
  Search,
  Shield,
  Zap,
  Check,
  ArrowRight,
  Menu,
  X,
  ChevronRight,
  Globe,
  Clock,
  Layers,
  Filter,
  Command,
  Star,
  MousePointer2,
  Wallet,
  Coins,
  Activity,
  Flame
} from 'lucide-react';

/**
 * ANIMATION HELPERS
 */

// 1. Fade In on Scroll Component
interface FadeInProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}

const FadeIn = ({ children, delay = 0, className = "" }: FadeInProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const domRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => setIsVisible(entry.isIntersecting));
    }, { threshold: 0.1 }); // Trigger when 10% visible

    const currentElement = domRef.current;
    if (currentElement) observer.observe(currentElement);

    return () => {
      if (currentElement) observer.unobserve(currentElement);
    };
  }, []);

  return (
    <div
      ref={domRef}
      className={`transition-all duration-1000 ease-out transform ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
        } ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
};

// 2. Spotlight Card Effect (Tracks Mouse)
interface SpotlightCardProps {
  children: React.ReactNode;
  className?: string;
  spotlightColor?: string;
}

const SpotlightCard = ({ children, className = "", spotlightColor = "rgba(59, 130, 246, 0.15)" }: SpotlightCardProps) => {
  const divRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: -500, y: -500 });
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!divRef.current) return;
    const rect = divRef.current.getBoundingClientRect();
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setOpacity(1);
  };

  const handleMouseLeave = () => {
    setOpacity(0);
  };

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`relative overflow-hidden ${className}`}
    >
      {/* The Moving Spotlight Gradient */}
      <div
        className="pointer-events-none absolute -inset-px transition duration-300"
        style={{
          opacity,
          background: `radial-gradient(600px circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 40%)`,
        }}
      />
      {/* Content */}
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
};


import LoginModal from '@/components/landing/login-modal';
import Link from 'next/link';

import { Logo } from '@/components/logo';

const LandingPage = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  const handleOpenAuth = () => setLoginModalOpen(true);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleOpenAuth();
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 font-sans selection:bg-cyan-500/30 overflow-x-hidden">

      {/* 1. NAVBAR (Public) */}
      <header className="sticky top-0 z-50 bg-[#020617]/80 backdrop-blur-xl border-b border-white/5 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          {/* Logo */}
          <Logo />

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-8">
            {['Platform', 'Markets', 'Pricing'].map((item) => (
              item === 'Markets' ? (
                <button
                  key={item}
                  onClick={handleOpenAuth}
                  className="text-sm font-medium text-slate-400 hover:text-white transition-colors relative group"
                >
                  {item}
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-cyan-400 transition-all group-hover:w-full"></span>
                </button>
              ) : (
                <a key={item} href={`#${item.toLowerCase()}`} className="text-sm font-medium text-slate-400 hover:text-white transition-colors relative group">
                  {item}
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-cyan-400 transition-all group-hover:w-full"></span>
                </a>
              )
            ))}
          </nav>

          {/* Auth Buttons */}
          <div className="hidden md:flex items-center gap-4">
            <button
              onClick={handleOpenAuth}
              className="text-sm font-medium text-white hover:text-cyan-400 transition-colors"
            >
              Log In
            </button>
            <button
              onClick={handleOpenAuth}
              className="bg-white text-black hover:bg-cyan-50 px-5 py-2.5 rounded-full text-sm font-bold transition-all shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)] hover:shadow-[0_0_25px_-5px_rgba(6,182,212,0.5)] hover:-translate-y-0.5 active:translate-y-0"
            >
              Get Started
            </button>
          </div>

          {/* Mobile Menu Toggle */}
          <button className="md:hidden text-slate-400" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/10 bg-[#020617] p-6 space-y-4 animate-in slide-in-from-top-5">
            <a href="#platform" className="block text-slate-300 hover:text-white">Platform</a>
            <button onClick={handleOpenAuth} className="block text-slate-300 hover:text-white text-left w-full">Markets</button>
            <a href="#pricing" className="block text-slate-300 hover:text-white">Pricing</a>
            <div className="pt-4 border-t border-white/10 flex flex-col gap-3">
              <button onClick={handleOpenAuth} className="w-full text-center text-white font-medium py-2">Log In</button>
              <button onClick={handleOpenAuth} className="w-full bg-white text-black py-3 rounded-full font-bold">Get Started</button>
            </div>
          </div>
        )}
      </header>

      {/* 2. HERO SECTION */}
      <section className="relative pt-32 pb-40 overflow-hidden">
        {/* Animated Background Effects */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[1000px] opacity-30 animate-pulse-slow">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 blur-[100px] rounded-full mix-blend-screen" />
          </div>
          <div className="absolute top-20 right-20 w-2 h-2 bg-white rounded-full blur-[1px] animate-ping opacity-50 duration-1000"></div>
          <div className="absolute bottom-40 left-20 w-1 h-1 bg-cyan-400 rounded-full blur-[1px] animate-pulse opacity-70"></div>
        </div>

        <div className="relative max-w-5xl mx-auto px-6 text-center z-10">
          <FadeIn delay={100}>
            <h1 className="text-6xl md:text-8xl font-extrabold text-white tracking-tight mb-8 leading-none drop-shadow-2xl">
              Conviction <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-emerald-400">
                Always Pays Off.
              </span>
            </h1>
          </FadeIn>

          <FadeIn delay={300}>
            <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed font-light">
              Invest with zero noise. Track <strong>Crypto</strong>, <strong>Stocks</strong>, and <strong>Net Worth</strong> on a dashboard built for speed.
              Spot cycle tops and manage risk without the spreadsheet headache.
            </p>
          </FadeIn>

          {/* The "Launchpad" Search Bar - Hover Glow Effect */}
          <FadeIn delay={500}>
            <div className="max-w-2xl mx-auto relative group z-20">
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-2xl blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200"></div>
              <div className="relative bg-[#0B1121] border border-white/10 rounded-2xl p-2 flex items-center shadow-2xl transition-transform duration-300 group-hover:scale-[1.01]">
                <div className="pl-4 pr-3 text-slate-500 group-hover:text-cyan-400 transition-colors">
                  <Search className="w-6 h-6" />
                </div>
                <input
                  type="text"
                  placeholder="Search Tickers (e.g. BTC, LUCK, Gold)..."
                  onKeyDown={handleSearchKeyDown}
                  className="w-full bg-transparent border-none text-white text-lg placeholder:text-slate-600 focus:ring-0 h-14 outline-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleOpenAuth}
                    className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold uppercase tracking-wider hover:bg-slate-700 transition-colors"
                  >
                    <Zap className="w-3 h-3 text-amber-400" /> Pro Mode
                  </button>
                  <button
                    onClick={handleOpenAuth}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-8 rounded-xl text-base font-bold transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-600/50"
                  >
                    Analyze
                  </button>
                </div>
              </div>
              {/* Quick links below search */}
              <div className="flex flex-wrap justify-center gap-6 mt-6 text-sm text-slate-500">
                <span onClick={handleOpenAuth} className="flex items-center gap-1.5 hover:text-cyan-400 transition-colors cursor-pointer"><Activity className="w-3 h-3 text-cyan-500" /> Cycle Indicators</span>
                <span onClick={handleOpenAuth} className="flex items-center gap-1.5 hover:text-purple-400 transition-colors cursor-pointer"><Coins className="w-3 h-3 text-purple-500" /> Crypto Risk</span>
                <span onClick={handleOpenAuth} className="flex items-center gap-1.5 hover:text-emerald-400 transition-colors cursor-pointer"><Wallet className="w-3 h-3 text-emerald-500" /> Net Worth</span>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* 3. BENTO GRID FEATURES - "BUILD AROUND YOUR STRATEGY" */}
      <section id="platform" className="py-24 relative">
        <div className="max-w-7xl mx-auto px-6">
          <FadeIn>
            <div className="mb-16 text-center md:text-left">
              <h2 className="text-4xl font-bold text-white mb-4">Your money, <span className="text-cyan-400">upgraded.</span></h2>
              <p className="text-slate-400 max-w-xl">All your assets. All the data. One beautiful interface made for your convenience.</p>
            </div>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* Large Card: Market Cycles */}
            <FadeIn delay={200} className="md:col-span-2">
              <SpotlightCard className="h-full bg-slate-900/40 border border-white/10 rounded-3xl p-8 hover:border-white/20 transition-colors group">
                <div className="absolute top-0 right-0 p-12 bg-blue-600/20 blur-[80px] rounded-full pointer-events-none group-hover:bg-blue-600/30 transition-all duration-700" />
                <div className="relative z-10 flex flex-col h-full justify-between min-h-[300px]">
                  <div>
                    <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center mb-6 text-blue-400 group-hover:scale-110 transition-transform duration-500">
                      <Activity className="w-6 h-6" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">Cycle Hunters</h3>
                    <p className="text-slate-400 max-w-md group-hover:text-slate-200 transition-colors">
                      Stop guessing. Use proprietary <strong>Top & Bottom Indicators</strong> for Bitcoin and KSE-100 to know exactly when to enter and exit.
                    </p>
                  </div>
                  {/* Mock Cycle Visual */}
                  <div className="mt-8 flex items-end gap-1 h-32 w-full opacity-50 group-hover:opacity-100 transition-opacity duration-500">
                    <svg viewBox="0 0 100 40" className="w-full h-full overflow-visible">
                      <path d="M0 35 Q 20 40, 40 20 T 100 5" fill="none" stroke="url(#gradientLine)" strokeWidth="3" />
                      <defs>
                        <linearGradient id="gradientLine" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#3b82f6" />
                          <stop offset="50%" stopColor="#8b5cf6" />
                          <stop offset="100%" stopColor="#ef4444" />
                        </linearGradient>
                      </defs>
                      {/* Top Indicator */}
                      <circle cx="95" cy="5" r="3" fill="#ef4444" className="animate-pulse" />
                      <text x="85" y="-5" fill="#ef4444" fontSize="8" fontWeight="bold">SELL</text>
                    </svg>
                  </div>
                </div>
              </SpotlightCard>
            </FadeIn>

            {/* Card: Crypto Risk */}
            <FadeIn delay={400}>
              <SpotlightCard className="h-full bg-slate-900/40 border border-white/10 rounded-3xl p-8 hover:border-white/20 transition-colors group" spotlightColor="rgba(249, 115, 22, 0.15)">
                <div className="relative z-10 h-full flex flex-col">
                  <div className="w-12 h-12 bg-orange-500/20 rounded-2xl flex items-center justify-center mb-6 text-orange-400 group-hover:rotate-12 transition-transform duration-500">
                    <Flame className="w-6 h-6" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">Crypto Risk</h3>
                  <p className="text-slate-400 mb-8 group-hover:text-slate-200 transition-colors">
                    Deep-dive risk profiles. See Fair Value Trendlines and know if BTC is overheated instantly.
                  </p>
                  <div className="mt-auto flex justify-end">
                    <div className="w-12 h-12 rounded-full border border-white/10 bg-white/5 flex items-center justify-center group-hover:scale-110 group-hover:bg-orange-500 group-hover:text-white transition-all duration-300 cursor-pointer">
                      <ArrowRight className="w-5 h-5" />
                    </div>
                  </div>
                </div>
              </SpotlightCard>
            </FadeIn>

            {/* Card: Net Worth Tracker */}
            <FadeIn delay={200}>
              <SpotlightCard className="h-full bg-slate-900/40 border border-white/10 rounded-3xl p-8 hover:border-white/20 transition-colors group" spotlightColor="rgba(16, 185, 129, 0.15)">
                <div className="relative z-10">
                  <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center mb-6 text-emerald-400 group-hover:scale-110 transition-transform">
                    <Wallet className="w-6 h-6" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">Total Net Worth</h3>
                  <p className="text-slate-400 group-hover:text-slate-200 transition-colors">
                    One number for everything. Track PK & US Stocks, Crypto, Metals, Commodities, and Cash in real-time.
                  </p>
                </div>
              </SpotlightCard>
            </FadeIn>

            {/* Large Card: Macro & Liquidity */}
            <FadeIn delay={400} className="md:col-span-2">
              <SpotlightCard className="h-full bg-slate-900/40 border border-white/10 rounded-3xl p-8 hover:border-white/20 transition-colors group" spotlightColor="rgba(245, 158, 11, 0.15)">
                <div className="absolute bottom-0 left-0 p-12 bg-amber-600/10 blur-[80px] rounded-full pointer-events-none group-hover:bg-amber-600/20 transition-all duration-700" />
                <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
                  <div className="flex-1">
                    <div className="w-12 h-12 bg-amber-500/20 rounded-2xl flex items-center justify-center mb-6 text-amber-400 group-hover:scale-110 transition-transform">
                      <Layers className="w-6 h-6" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">Macro & Liquidity</h3>
                    <p className="text-slate-400 group-hover:text-slate-200 transition-colors">
                      See where the money is moving. Institutional Liquidity Maps (Lipi), SBP Interest Rates, and Balance of Payments data.
                    </p>
                  </div>
                  <div className="flex-1 w-full bg-slate-950/50 border border-white/5 rounded-xl p-4 group-hover:border-amber-500/30 transition-colors">
                    <div className="grid grid-cols-4 gap-1 h-24 opacity-70 group-hover:opacity-100 transition-opacity">
                      {[...Array(16)].map((_, i) => (
                        <div key={i} className={`rounded-sm ${i % 3 === 0 ? 'bg-emerald-500/40' : i % 2 === 0 ? 'bg-rose-500/40' : 'bg-slate-800'}`}></div>
                      ))}
                    </div>
                  </div>
                </div>
              </SpotlightCard>
            </FadeIn>

          </div>
        </div>
      </section>

      {/* 4. "LAUNCHPAD" SECTION - "ACCESS EVERYTHING" */}
      <section className="py-24 bg-gradient-to-b from-[#020617] to-blue-950/20 overflow-hidden relative">
        {/* Background glow for launchpad */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/5 blur-[120px] rounded-full pointer-events-none" />

        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center gap-16 relative z-10">
          <FadeIn className="flex-1">
            <h2 className="text-5xl font-extrabold text-white mb-6 leading-tight">Your command <br />center.</h2>
            <p className="text-lg text-slate-400 mb-8 leading-relaxed">
              Switch between Bitcoin Risk Charts, KSE-100 cycles, and your Net Worth in milliseconds. Technology that remembers your strategy.
            </p>
            <div className="flex items-center gap-4 text-slate-500 text-sm font-medium">
              <span className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10 group cursor-pointer hover:bg-white/10 transition-colors">
                <Command className="w-4 h-4 group-hover:text-white transition-colors" /> K
              </span>
              to activate Launchpad
            </div>
          </FadeIn>

          <FadeIn delay={200} className="flex-1 w-full">
            <div className="bg-[#0B1121] border border-white/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden group hover:border-blue-500/30 transition-colors duration-500">
              <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 blur-[60px] rounded-full pointer-events-none group-hover:bg-cyan-500/20 transition-colors" />

              <div className="flex items-center gap-4 mb-6 border-b border-white/5 pb-4">
                <Search className="w-5 h-5 text-slate-400 group-hover:text-cyan-400 transition-colors" />
                <span className="text-xl text-white">BTC</span>
                <span className="ml-auto text-xs text-slate-500 bg-white/5 px-2 py-1 rounded">ESC</span>
              </div>

              <div className="space-y-2">
                <div onClick={handleOpenAuth} className="flex items-center gap-4 p-3 bg-blue-600/10 border border-blue-500/20 rounded-xl cursor-pointer hover:bg-blue-600/20 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center text-white font-bold text-xs shadow-lg shadow-orange-500/30">B</div>
                  <div>
                    <div className="text-white font-bold">Bitcoin</div>
                    <div className="text-xs text-blue-400">Open in Crypto Dashboard</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-blue-400 ml-auto" />
                </div>

                <div onClick={handleOpenAuth} className="flex items-center gap-4 p-3 hover:bg-white/5 rounded-xl cursor-pointer transition-colors group/item">
                  <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-white font-bold text-xs border border-white/10 group-hover/item:border-emerald-500/50 group-hover/item:text-emerald-400 transition-colors">
                    <Wallet className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-slate-200 group-hover/item:text-white transition-colors">Add to Net Worth</div>
                    <div className="text-xs text-slate-500">Action</div>
                  </div>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* 5. PRICING - "POWERFUL CONNECTIONS" */}
      <section id="pricing" className="py-24 relative overflow-hidden">
        {/* Floor Light Effect - from video */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-emerald-500/10 blur-[100px] rounded-[100%] pointer-events-none animate-pulse-slow" />

        <div className="relative z-10 max-w-2xl mx-auto px-6 text-center">
          <FadeIn>
            <h2 className="text-4xl font-bold text-white mb-12">Made for you, <span className="text-emerald-400">with you.</span></h2>
          </FadeIn>

          {/* Single Free Plan Card */}
          <FadeIn delay={200}>
            <div className="h-full p-8 rounded-3xl bg-slate-900/50 border border-white/10 hover:bg-slate-900 transition-colors hover:border-white/20 shadow-2xl">
              <h3 className="font-bold text-2xl text-white mb-2">Scout</h3>
              <p className="text-slate-400 text-sm mb-6">Start your journey today</p>
              <div className="text-5xl font-extrabold text-white mb-8">Free <span className="text-lg font-normal text-slate-500">forever</span></div>

              <ul className="space-y-4 mb-8 text-left max-w-md mx-auto">
                {[
                  'Standard Market Charts & Analytics',
                  'Basic Portfolio Tracking',
                  'Stock Screener & Watchlist',
                  'KSE-100 & Crypto Data'
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-300 text-sm">
                    <div className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center shrink-0"><Check className="w-3 h-3 text-white" /></div> {item}
                  </li>
                ))}
              </ul>
              <button
                onClick={handleOpenAuth}
                className="w-full py-4 rounded-xl bg-white text-black font-bold hover:bg-slate-200 transition-all hover:scale-[1.02] shadow-[0_0_20px_-5px_rgba(255,255,255,0.2)]"
              >
                Start Journey
              </button>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* 6. FOOTER */}
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
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center pt-8 border-t border-white/5">
          <div className="text-slate-600 text-sm mb-4 md:mb-0">
            &copy; 2025 Conviction Pays. All rights reserved.
          </div>
        </div>
      </footer>
      <LoginModal isOpen={loginModalOpen} onClose={() => setLoginModalOpen(false)} />
    </div>
  );
};

export default LandingPage;
