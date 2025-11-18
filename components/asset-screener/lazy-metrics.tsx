"use client"

import { useEffect, useRef, useState, ReactNode } from "react"

interface LazyMetricsProps {
  children: ReactNode
  /**
   * Root margin for Intersection Observer
   * Default: "100px" - starts loading 100px before element is visible
   */
  rootMargin?: string
  /**
   * Threshold for Intersection Observer
   * Default: 0.1 - triggers when 10% of element is visible
   */
  threshold?: number
  /**
   * Fallback content to show while not visible
   */
  fallback?: ReactNode
}

/**
 * LazyMetrics - Lazy loads content when it becomes visible in viewport
 * 
 * Uses Intersection Observer API to detect when the component enters viewport
 * Only renders children when visible, reducing initial load
 */
export function LazyMetrics({ 
  children, 
  rootMargin = "100px", 
  threshold = 0.1,
  fallback = null 
}: LazyMetricsProps) {
  const [isVisible, setIsVisible] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // If already visible, don't set up observer
    if (isVisible) return

    // Create Intersection Observer
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true)
            // Once visible, we can disconnect the observer
            observer.disconnect()
          }
        })
      },
      {
        rootMargin,
        threshold,
      }
    )

    observer.observe(container)

    // Cleanup
    return () => {
      observer.disconnect()
    }
  }, [rootMargin, threshold, isVisible])

  return (
    <div ref={containerRef}>
      {isVisible ? children : fallback}
    </div>
  )
}

