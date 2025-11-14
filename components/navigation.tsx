"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { BarChart3, Wallet } from "lucide-react"

export function Navigation() {
  const pathname = usePathname()

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <BarChart3 className="h-5 w-5" />
            <span>Risk Dashboard</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button
              variant={pathname === "/" ? "secondary" : "ghost"}
              size="sm"
              asChild
            >
              <Link href="/">
                <BarChart3 className="mr-2 h-4 w-4" />
                ETH Risk
              </Link>
            </Button>
            <Button
              variant={pathname === "/portfolio" ? "secondary" : "ghost"}
              size="sm"
              asChild
            >
              <Link href="/portfolio">
                <Wallet className="mr-2 h-4 w-4" />
                Portfolio
              </Link>
            </Button>
          </div>
        </div>
        <ThemeToggle />
      </div>
    </nav>
  )
}

