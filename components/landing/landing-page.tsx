"use client"

import React, { useState, useEffect, useRef, useMemo } from 'react';
import LoginModal from '@/components/landing/login-modal';
// Combined imports from existing and new requirements
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
  Globe,
  Layers,
  Filter,
  Command,
  Wallet,
  Coins,
  Activity,
  Flame,
  Calculator,
  ListPlus,
  Scale,
  Gem,
  Landmark,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

/**
 * ANIMATION HELPERS
 */

const FadeIn = ({ children, delay = 0, className = "" }: { children: React.ReactNode, delay?: number, className?: string }) => {
  const [isVisible, setIsVisible] = useState(false);
  const domRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        // FIX: Only trigger once (when it enters view), then stop observing.
        // This prevents flickering when scrolling up/down at the threshold.
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (entry.target) observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

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

const SpotlightCard = ({ children, className = "", spotlightColor = "rgba(59, 130, 246, 0.15)" }: { children: React.ReactNode, className?: string, spotlightColor?: string }) => {
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
      <div
        className="pointer-events-none absolute -inset-px transition duration-300"
        style={{
          opacity,
          background: `radial-gradient(600px circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 40%)`,
        }}
      />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
};

// --- VISUAL COMPONENTS ---

// 1. Precise Cycle Scanner
const CycleScanner = () => {
  const [scanIndex, setScanIndex] = useState(50);
  const [isHovering, setIsHovering] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const dataPoints = useMemo(() => {
    const points = [];
    for (let i = 0; i <= 100; i++) {
      let y = 80;
      if (i < 25) y = 80 + Math.sin(i * 0.8) * 5;
      else if (i < 50) y = 80 - ((i - 25) * 2.4) + Math.sin(i * 0.5) * 2;
      else if (i < 75) y = 20 + Math.sin(i * 0.8) * 8;
      else y = 20 + ((i - 75) * 2.4) + Math.sin(i * 0.5) * 3;
      points.push({ x: i, y });
    }
    return points;
  }, []);

  const pathD = `M ${dataPoints.map(p => `${p.x * 3},${p.y}`).join(" L ")}`;
  const areaD = `${pathD} L 300,120 L 0,120 Z`;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    setIsHovering(true);
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const rawIndex = Math.floor((x / rect.width) * 100);
    const clampedIndex = Math.max(0, Math.min(100, rawIndex));
    setScanIndex(clampedIndex);
  };

  const currentPoint = dataPoints[scanIndex] || dataPoints[0];

  let phaseLabel = "ACCUMULATION";
  let phaseColor = "text-blue-400";
  if (scanIndex > 25 && scanIndex < 50) { phaseLabel = "MARKUP (BULL)"; phaseColor = "text-emerald-400"; }
  else if (scanIndex >= 50 && scanIndex < 75) { phaseLabel = "DISTRIBUTION (TOP)"; phaseColor = "text-rose-400"; }
  else if (scanIndex >= 75) { phaseLabel = "MARKDOWN (BEAR)"; phaseColor = "text-orange-400"; }

  return (
    <div
      ref={containerRef}
      className="mt-6 w-full h-32 relative cursor-crosshair group overflow-hidden bg-slate-950/30 rounded-lg border border-white/5"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setIsHovering(false)}
    >
      <div className="absolute inset-0 flex opacity-10 pointer-events-none">
        <div className="w-[25%] bg-blue-500/20 border-r border-white/5"></div>
        <div className="w-[25%] bg-emerald-500/20 border-r border-white/5"></div>
        <div className="w-[25%] bg-rose-500/20 border-r border-white/5"></div>
        <div className="w-[25%] bg-orange-500/20"></div>
      </div>

      <div className="absolute top-2 left-3 z-20 flex gap-4 text-[10px] font-mono tracking-wider font-bold">
        <div className="text-slate-500">PHASE: <span className={phaseColor}>{phaseLabel}</span></div>
        <div className="text-slate-500">VAL: <span className="text-white">{Math.round(100 - currentPoint.y)}</span></div>
      </div>

      <svg viewBox="0 0 300 100" className="w-full h-full overflow-visible" preserveAspectRatio="none">
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="50%" stopColor="#10b981" />
            <stop offset="75%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#lineGrad)" fillOpacity="0.1" />
        <path d={pathD} fill="none" stroke="url(#lineGrad)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>

      <div
        className="absolute top-0 bottom-0 pointer-events-none transition-opacity duration-150 ease-out"
        style={{
          left: `${currentPoint.x}%`,
          opacity: isHovering ? 1 : 0
        }}
      >
        <div className="absolute top-0 bottom-0 w-px bg-white/50 border-r border-dashed border-white/50" />
        <div
          className="absolute w-3 h-3 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)] -translate-x-[5px] -translate-y-[5px]"
          style={{ top: `${currentPoint.y}%` }}
        >
          <div className="absolute inset-0 border border-slate-900 rounded-full" />
        </div>
        <div
          className="absolute w-8 h-8 border border-white/20 rounded-full -translate-x-[15px] -translate-y-[15px]"
          style={{ top: `${currentPoint.y}%` }}
        />
      </div>
    </div>
  );
};

// 2. Macro Dashboard Grid (HUD Style)
const MacroDashboard = () => {
  return (
    <div className="mt-auto grid grid-cols-3 gap-2 w-full h-24">
      <div className="bg-slate-950/50 border border-white/5 rounded-lg p-2 flex flex-col justify-between group hover:border-cyan-500/30 transition-colors">
        <div className="flex justify-between items-start">
          <span className="text-[9px] text-slate-500 font-bold tracking-wider">LIQUIDITY</span>
          <TrendingUp className="w-3 h-3 text-cyan-400" />
        </div>
        <div className="flex items-end gap-0.5 h-8">
          {[20, 40, 35, 60, 50, 75, 90, 60].map((h, i) => (
            <div key={i} style={{ height: `${h}%` }} className="flex-1 bg-cyan-500/20 rounded-t-[1px]"></div>
          ))}
        </div>
        <div className="text-xs font-mono text-cyan-400">+2.4T <span className="text-[8px] text-slate-500">PKR</span></div>
      </div>

      <div className="bg-slate-950/50 border border-white/5 rounded-lg p-2 flex flex-col justify-between group hover:border-purple-500/30 transition-colors">
        <div className="flex justify-between items-start">
          <span className="text-[9px] text-slate-500 font-bold tracking-wider">SBP RATES</span>
          <Activity className="w-3 h-3 text-purple-400" />
        </div>
        <div className="relative h-8 w-full">
          <div className="absolute bottom-2 left-0 w-1/3 h-1 bg-purple-500/30"></div>
          <div className="absolute bottom-3 left-1/3 w-1/3 h-1 bg-purple-500/50"></div>
          <div className="absolute bottom-5 right-0 w-1/3 h-1 bg-purple-500"></div>
        </div>
        <div className="text-xs font-mono text-purple-400">17.5% <span className="text-[8px] text-slate-500">bps</span></div>
      </div>

      <div className="bg-slate-950/50 border border-white/5 rounded-lg p-2 flex flex-col justify-between group hover:border-emerald-500/30 transition-colors">
        <div className="flex justify-between items-start">
          <span className="text-[9px] text-slate-500 font-bold tracking-wider">REAL GDP</span>
          <Globe className="w-3 h-3 text-emerald-400" />
        </div>
        <div className="flex items-center gap-1 h-8">
          <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full w-[70%] bg-emerald-500"></div>
          </div>
        </div>
        <div className="text-xs font-mono text-emerald-400">3.2% <span className="text-[8px] text-slate-500">YoY</span></div>
      </div>
    </div>
  );
};

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

      {/* 1. NAVBAR */}
      <header className="sticky top-0 z-50 bg-[#020617]/80 backdrop-blur-xl border-b border-white/5 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer group">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-500 blur-lg opacity-20 group-hover:opacity-40 transition-opacity"></div>
              <div className="relative bg-gradient-to-br from-blue-600 to-cyan-500 p-2.5 rounded-xl shadow-lg shadow-blue-500/20 group-hover:shadow-blue-500/40 transition-all duration-500 group-hover:scale-105">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="font-bold text-xl tracking-tight text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-slate-400 transition-all">
              CONVICTION <span className="text-cyan-400">PAYS</span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-8">
            {['Platform', 'Markets', 'Pricing'].map((item) => {
              if (item === 'Markets') {
                return (
                  <button
                    key={item}
                    onClick={handleOpenAuth}
                    className="text-sm font-medium text-slate-400 hover:text-white transition-colors relative group"
                  >
                    {item}
                    <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-cyan-400 transition-all group-hover:w-full"></span>
                  </button>
                );
              }
              return (
                <a key={item} href={`#${item.toLowerCase()}`} className="text-sm font-medium text-slate-400 hover:text-white transition-colors relative group">
                  {item}
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-cyan-400 transition-all group-hover:w-full"></span>
                </a>
              );
            })}
          </nav>

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

          <button className="md:hidden text-slate-400" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/10 bg-[#020617] p-6 space-y-4 animate-in slide-in-from-top-5">
            <a href="#platform" className="block text-slate-300 hover:text-white">Platform</a>
            <button onClick={handleOpenAuth} className="block text-slate-300 hover:text-white w-full text-left">Markets</button>
            <a href="#pricing" className="block text-slate-300 hover:text-white">Pricing</a>
            <div className="pt-4 border-t border-white/10 flex flex-col gap-3">
              <button
                onClick={handleOpenAuth}
                className="w-full text-center text-white font-medium py-2"
              >
                Log In
              </button>
              <button
                onClick={handleOpenAuth}
                className="w-full bg-white text-black py-3 rounded-full font-bold"
              >
                Get Started
              </button>
            </div>
          </div>
        )}
      </header>

      {/* 2. HERO SECTION */}
      <section className="relative pt-32 pb-40 overflow-hidden">
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
            <p className="text-lg md:text-xl text-slate-400 max-w-3xl mx-auto mb-12 leading-relaxed font-light">
              <span className="text-white font-medium">Maximize Upside. Minimize Downturn.</span><br />
              The precision operating system for the modern, savvy investor.
            </p>
          </FadeIn>

          {/* Launchpad Search */}
          <FadeIn delay={500}>
            <div className="max-w-2xl mx-auto relative group z-20">
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-2xl blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200"></div>
              <div className="relative bg-[#0B1121] border border-white/10 rounded-2xl p-2 flex items-center shadow-2xl transition-transform duration-300 group-hover:scale-[1.01]">
                <div className="pl-4 pr-3 text-slate-500 group-hover:text-cyan-400 transition-colors">
                  <Search className="w-6 h-6" />
                </div>
                <input
                  type="text"
                  placeholder="Search (e.g. Bitcoin, Gold, LUCK, Oil)..."
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
              <div className="flex flex-wrap justify-center gap-6 mt-6 text-sm text-slate-500">
                <span onClick={handleOpenAuth} className="flex items-center gap-1.5 hover:text-cyan-400 transition-colors cursor-pointer"><Activity className="w-3 h-3 text-cyan-500" /> Cycle Indicators</span>
                <span onClick={handleOpenAuth} className="flex items-center gap-1.5 hover:text-purple-400 transition-colors cursor-pointer"><Coins className="w-3 h-3 text-purple-500" /> Crypto Risk</span>
                <span onClick={handleOpenAuth} className="flex items-center gap-1.5 hover:text-emerald-400 transition-colors cursor-pointer"><Gem className="w-3 h-3 text-emerald-500" /> Metals & Commodities</span>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* 3. HERO FEATURE: UNIFIED PORTFOLIO */}
      <section id="platform" className="py-24 relative bg-slate-950/50">
        <div className="max-w-7xl mx-auto px-6">
          <FadeIn>
            <div className="flex flex-col lg:flex-row items-center gap-16 mb-24">
              <div className="flex-1">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-6">
                  <Wallet className="w-3 h-3" /> Flagship Feature
                </div>
                <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-6 leading-tight">
                  One Net Worth.<br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
                    Every Asset Class.
                  </span>
                </h2>
                <p className="text-lg text-slate-400 mb-8 leading-relaxed max-w-lg">
                  Track your entire financial life in one high precision dashboard. See your <strong>Real Net Worth</strong> with advanced features like <strong>Dollarized Returns</strong> and <strong>Mark to Market</strong> valuations.
                </p>

                <ul className="grid grid-cols-2 gap-4">
                  {[
                    'PK Stocks (PSX)',
                    'US Equities',
                    'Crypto (Live)',
                    'Precious Metals',
                    'Commodities',
                    'Mutual Funds',
                    'Cash / Forex',
                    'Mark to Market'
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-3 text-slate-300 text-sm">
                      <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                        <Check className="w-3 h-3 text-emerald-400" />
                      </div>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* VISUAL: PORTFOLIO MOCKUP */}
              <div className="flex-1 w-full perspective-1000">
                <div className="relative bg-gradient-to-b from-[#0F172A] to-[#020617] border border-white/10 rounded-2xl p-6 shadow-2xl transform rotate-y-12 hover:rotate-0 transition-transform duration-700 ease-out group">
                  {/* Glow behind */}
                  <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 rounded-2xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity" />

                  <div className="relative z-10">
                    {/* Header */}
                    <div className="flex justify-between items-end mb-8 border-b border-white/5 pb-6">
                      <div>
                        <div className="text-slate-400 text-sm mb-1 font-medium">Total Net Worth (USD)</div>
                        <div className="text-4xl font-bold text-white tracking-tight">$142,093.45</div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded text-sm font-bold">
                          <TrendingUp className="w-4 h-4" /> +12.4%
                        </div>
                        <span className="text-[10px] text-slate-500 uppercase">Dollarized Return</span>
                      </div>
                    </div>

                    {/* Assets List */}
                    <div className="space-y-3">
                      {[
                        { name: 'Bitcoin', sub: 'Crypto', val: '$68,420', change: '+4.2%', icon: Coins, color: 'text-orange-400', bg: 'bg-orange-500/10' },
                        { name: 'Gold Oz', sub: 'Metals', val: '$22,150', change: '+0.8%', icon: Gem, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
                        { name: 'Lucky Cement', sub: 'PK Stocks', val: '$15,230', change: '-1.2%', icon: TrendingUp, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                        { name: 'NVIDIA', sub: 'US Stocks', val: '$36,293', change: '+2.1%', icon: Activity, color: 'text-green-400', bg: 'bg-green-500/10' },
                      ].map((asset, i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-lg ${asset.bg} flex items-center justify-center ${asset.color}`}>
                              <asset.icon className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="text-white font-bold text-sm">{asset.name}</div>
                              <div className="text-slate-500 text-xs">{asset.sub}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-white font-mono text-sm">{asset.val}</div>
                            <div className={`text-xs ${asset.change.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'}`}>{asset.change}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </FadeIn>

          {/* 4. COMPREHENSIVE FEATURES GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

            {/* Card: Cycle Indicators - UPDATED VISUAL */}
            <FadeIn delay={200} className="md:col-span-2 lg:col-span-2">
              <SpotlightCard className="h-full bg-slate-900/40 border border-white/10 rounded-3xl p-8 hover:border-white/20 transition-colors group">
                <div className="absolute top-0 right-0 p-12 bg-blue-600/20 blur-[80px] rounded-full pointer-events-none group-hover:bg-blue-600/30 transition-all duration-700" />
                <div className="relative z-10 flex flex-col h-full justify-between min-h-[300px]">
                  <div>
                    <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center mb-6 text-blue-400">
                      <Activity className="w-6 h-6" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">Cycle Top and Bottom Indicators</h3>
                    <p className="text-slate-400 max-w-lg">
                      Proprietary <strong>Top and Bottom Indicators</strong> for Bitcoin and KSE-100. Don't just hold—know when the cycle turns using our advanced algorithmic signals.
                    </p>
                  </div>
                  {/* NEW: Interactive Cycle Visual */}
                  <CycleScanner />
                </div>
              </SpotlightCard>
            </FadeIn>

            {/* Card: Screener & Wishlist */}
            <FadeIn delay={300}>
              <SpotlightCard className="h-full bg-slate-900/40 border border-white/10 rounded-3xl p-8 hover:border-white/20 transition-colors group" spotlightColor="rgba(168, 85, 247, 0.15)">
                <div className="relative z-10 h-full flex flex-col">
                  <div className="w-12 h-12 bg-purple-500/20 rounded-2xl flex items-center justify-center mb-6 text-purple-400">
                    <Filter className="w-6 h-6" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">Smart Screener</h3>
                  <p className="text-slate-400 mb-8">
                    Filter for value using P/E, PEG, and technicals. Save your favorites to a <strong>Smart Wishlist</strong> for instant tracking.
                  </p>
                  <div className="mt-auto flex justify-end">
                    <div className="w-12 h-12 rounded-full border border-white/10 bg-white/5 flex items-center justify-center group-hover:scale-110 group-hover:bg-purple-500 group-hover:text-white transition-all duration-300 cursor-pointer">
                      <ListPlus className="w-5 h-5" />
                    </div>
                  </div>
                </div>
              </SpotlightCard>
            </FadeIn>

            {/* Card: Risk & MPT */}
            <FadeIn delay={400}>
              <SpotlightCard className="h-full bg-slate-900/40 border border-white/10 rounded-3xl p-8 hover:border-white/20 transition-colors group" spotlightColor="rgba(249, 115, 22, 0.15)">
                <div className="relative z-10 h-full flex flex-col">
                  <div className="w-12 h-12 bg-orange-500/20 rounded-2xl flex items-center justify-center mb-6 text-orange-400">
                    <Shield className="w-6 h-6" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">Risk Management</h3>
                  <p className="text-slate-400 mb-8">
                    Minimize downturns with <strong>Modern Portfolio Theory (MPT)</strong>, Sharpe Ratios, Drawdown analysis, and Crypto Risk Profiles.
                  </p>
                  {/* Visual Meter */}
                  <div className="mt-auto w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full w-2/3 bg-gradient-to-r from-emerald-500 via-yellow-500 to-orange-500" />
                  </div>
                </div>
              </SpotlightCard>
            </FadeIn>

            {/* Card: DCA & Planning */}
            <FadeIn delay={500}>
              <SpotlightCard className="h-full bg-slate-900/40 border border-white/10 rounded-3xl p-8 hover:border-white/20 transition-colors group" spotlightColor="rgba(16, 185, 129, 0.15)">
                <div className="relative z-10">
                  <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center mb-6 text-emerald-400">
                    <Calculator className="w-6 h-6" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">DCA Strategy</h3>
                  <p className="text-slate-400">
                    Visualize returns with our <strong>DCA Calculator</strong>. Plan your entries and exits systematically to average out volatility.
                  </p>
                </div>
              </SpotlightCard>
            </FadeIn>

            {/* Large Card: Macroeconomic Indicators - UPDATED VISUAL */}
            <FadeIn delay={600} className="md:col-span-2 lg:col-span-1">
              <SpotlightCard className="h-full bg-slate-900/40 border border-white/10 rounded-3xl p-8 hover:border-white/20 transition-colors group" spotlightColor="rgba(245, 158, 11, 0.15)">
                <div className="relative z-10 flex flex-col h-full">
                  <div className="mb-6">
                    <div className="w-12 h-12 bg-amber-500/20 rounded-2xl flex items-center justify-center mb-6 text-amber-400">
                      <Globe className="w-6 h-6" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">Macroeconomic Indicators</h3>
                    <p className="text-slate-400">
                      Institutional grade <strong>Liquidity Maps (Lipi)</strong>, SBP Rates, GDP, and Balance of Payments. See the big picture.
                    </p>
                  </div>
                  {/* NEW: Macro Terminal Visual */}
                  <MacroDashboard />
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

      {/* 5. PRICING */}
      <section id="pricing" className="py-24 relative overflow-hidden">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-emerald-500/10 blur-[100px] rounded-[100%] pointer-events-none animate-pulse-slow" />

        <div className="relative z-10 max-w-2xl mx-auto px-6 text-center">
          <FadeIn>
            <h2 className="text-4xl font-bold text-white mb-12">Made for you, <span className="text-emerald-400">with you.</span></h2>
          </FadeIn>

          <FadeIn delay={200}>
            <div className="h-full p-8 rounded-3xl bg-slate-900/50 border border-white/10 hover:bg-slate-900 transition-colors hover:border-white/20 shadow-2xl">
              <h3 className="font-bold text-2xl text-white mb-2">Scout</h3>
              <p className="text-slate-400 text-sm mb-6">Start your journey today</p>
              <div className="text-5xl font-extrabold text-white mb-8">Free <span className="text-lg font-normal text-slate-500">forever</span></div>

              <ul className="space-y-4 mb-8 text-left max-w-md mx-auto">
                {[
                  'Proprietary Cycle Indicators',
                  'Multi Asset Net Worth Tracker',
                  'Risk & Macro Dashboards',
                  'Stock Screener & Wishlist'
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

      <LoginModal isOpen={loginModalOpen} onClose={() => setLoginModalOpen(false)} />
    </div>
  );
};

export default LandingPage;
