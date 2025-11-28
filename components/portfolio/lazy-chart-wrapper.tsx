"use client"

import { useState, useEffect, useRef, ReactNode } from "react"
import { ChartSkeleton, PieChartSkeleton } from "./chart-skeleton"

interface LazyChartWrapperProps {
  children: ReactNode
  skeleton?: ReactNode
  pieChart?: boolean
  title?: string
  threshold?: number
}

/**
 * LazyChartWrapper - Only loads chart content when it becomes visible
 * Uses Intersection Observer to detect when component enters viewport
 */
export function LazyChartWrapper({ 
  children, 
  skeleton, 
  pieChart = false,
  title,
  threshold = 0.1 
}: LazyChartWrapperProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [shouldLoad, setShouldLoad] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true)
            // Start loading after a small delay to prioritize visible content
            setTimeout(() => {
              setShouldLoad(true)
            }, 100)
            // Once visible, we can disconnect the observer
            observer.disconnect()
          }
        })
      },
      {
        threshold,
        rootMargin: '50px', // Start loading 50px before entering viewport
      }
    )

    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => {
      observer.disconnect()
    }
  }, [threshold])

  // Show skeleton while not visible or loading
  if (!shouldLoad) {
    return (
      <div ref={ref}>
        {skeleton || (pieChart ? <PieChartSkeleton title={title} /> : <ChartSkeleton title={title} />)}
      </div>
    )
  }

  return <div ref={ref}>{children}</div>
}

