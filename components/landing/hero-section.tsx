'use client'

import React, { useEffect, useRef } from 'react'
import { ChevronRight } from 'lucide-react'
import Link from 'next/link'

export default function HeroSection() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight

    let animationId: number
    let time = 0

    const animate = () => {
      // Clear canvas
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const padding = 40
      const width = canvas.width - padding * 2
      const height = canvas.height - padding * 2

      
      // Draw grid lines
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.1)'
      ctx.lineWidth = 1
      
      // Horizontal grid lines
      for (let i = 0; i <= 5; i++) {
        const y = padding + (height / 5) * i
        ctx.beginPath()
        ctx.moveTo(padding, y)
        ctx.lineTo(canvas.width - padding, y)
        ctx.stroke()
      }

      // Vertical grid lines
      for (let i = 0; i <= 10; i++) {
        const x = padding + (width / 10) * i
        ctx.beginPath()
        ctx.moveTo(x, padding)
        ctx.lineTo(x, canvas.height - padding)
        ctx.stroke()
      }

      // Draw axes
      ctx.strokeStyle = 'rgba(100, 150, 255, 0.3)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(padding, canvas.height - padding)
      ctx.lineTo(padding, padding)
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(padding, canvas.height - padding)
      ctx.lineTo(canvas.width - padding, canvas.height - padding)
      ctx.stroke()

      // Generate data points with upward trend
      const dataPoints = 40
      const points: { x: number; y: number }[] = []
      
      for (let i = 0; i < dataPoints; i++) {
        const x = padding + (i / (dataPoints - 1)) * width
        const baseValue = (i / (dataPoints - 1)) * 0.8
        const noise = Math.sin((i + time * 0.05) * 0.3) * 0.15
        const volatility = Math.sin((i * 0.7 + time * 0.02) * Math.PI) * 0.08
        const y = canvas.height - padding - (baseValue + noise + volatility) * height
        points.push({ x, y })
      }

      // Draw main trend line with gradient
      const gradient = ctx.createLinearGradient(0, padding, 0, canvas.height - padding)
      gradient.addColorStop(0, 'rgba(34, 197, 245, 0.8)')
      gradient.addColorStop(1, 'rgba(59, 130, 246, 0.3)')

      ctx.strokeStyle = gradient
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(points[0].x, points[0].y)
      
      for (let i = 1; i < points.length; i++) {
        const xc = (points[i].x + points[i - 1].x) / 2
        const yc = (points[i].y + points[i - 1].y) / 2
        ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, xc, yc)
      }
      ctx.stroke()

      // Draw fill under curve
      const fillGradient = ctx.createLinearGradient(0, padding, 0, canvas.height - padding)
      fillGradient.addColorStop(0, 'rgba(34, 197, 245, 0.2)')
      fillGradient.addColorStop(1, 'rgba(59, 130, 246, 0.02)')

      ctx.fillStyle = fillGradient
      ctx.beginPath()
      ctx.moveTo(points[0].x, points[0].y)
      
      for (let i = 1; i < points.length; i++) {
        const xc = (points[i].x + points[i - 1].x) / 2
        const yc = (points[i].y + points[i - 1].y) / 2
        ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, xc, yc)
      }
      ctx.lineTo(canvas.width - padding, canvas.height - padding)
      ctx.lineTo(padding, canvas.height - padding)
      ctx.fill()

      // Draw data point circles at the end
      ctx.fillStyle = 'rgba(34, 197, 245, 0.8)'
      for (let i = Math.max(0, points.length - 5); i < points.length; i++) {
        const size = 2 + (i - (points.length - 5)) * 0.8
        ctx.beginPath()
        ctx.arc(points[i].x, points[i].y, size, 0, Math.PI * 2)
        ctx.fill()
      }

      // Draw animated pulse at current point
      const lastPoint = points[points.length - 1]
      const pulseRadius = 6 + Math.sin(time * 0.08) * 3
      ctx.strokeStyle = `rgba(34, 197, 245, ${0.6 - (pulseRadius - 6) / 6})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(lastPoint.x, lastPoint.y, pulseRadius, 0, Math.PI * 2)
      ctx.stroke()

      time++
      animationId = requestAnimationFrame(animate)
    }

    animate()

    // Handle window resize
    const handleResize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }

    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden px-4">
      {/* Background gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-blue-950/20 via-transparent to-transparent pointer-events-none" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 max-w-7xl mx-auto items-center z-10">
        {/* Left content */}
        <div className="flex flex-col gap-8">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-950/50 border border-blue-800/50 rounded-full w-fit">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-sm text-blue-300">Multi-Asset Portfolio Management</span>
            </div>

            <h1 className="text-5xl lg:text-6xl font-bold text-white leading-tight">
              Quantitative Insights{' '}
              <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
                tailored for you
              </span>
            </h1>

            <p className="text-lg text-white/90 max-w-lg leading-relaxed">
              Tailor Made for Pakistan Stock Exchange, Crypto and US Stocks. Risk metrics, valuation analysis, and portfolio optimization in one powerful platform.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/portfolio" className="group px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold rounded-xl hover:shadow-xl hover:shadow-blue-500/30 transition-all inline-flex items-center gap-2 justify-center">
              Get Started
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link href="/asset-screener" className="px-8 py-4 bg-slate-800/50 border border-slate-700 text-white font-semibold rounded-xl hover:bg-slate-800 transition-colors text-center">
              Explore Assets
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-4">
            <div>
              <div className="text-2xl font-bold text-blue-400">10+</div>
              <div className="text-sm text-white/80">Asset Types</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-cyan-400">50+</div>
              <div className="text-sm text-white/80">Risk Metrics</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-400">Real-time</div>
              <div className="text-sm text-white/80">Data</div>
            </div>
          </div>
        </div>

        {/* Right visual - Canvas graph */}
        <div className="relative h-96 lg:h-full min-h-96">
          <canvas
            ref={canvasRef}
            className="w-full h-full rounded-2xl"
          />
        </div>
      </div>
    </section>
  )
}

