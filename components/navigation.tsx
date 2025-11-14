"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { LoginDialog } from "@/components/auth/login-dialog"
import { RegisterDialog } from "@/components/auth/register-dialog"
import { useAuth } from "@/lib/auth/auth-context"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { BarChart3, Wallet, User, LogOut } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

export function Navigation() {
  const pathname = usePathname()
  const { user, logout } = useAuth()

  const getUserInitials = (email: string, name?: string | null) => {
    if (name) {
      return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    }
    return email[0].toUpperCase()
  }

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
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="relative h-8 w-8 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      {getUserInitials(user.email, user.name)}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user.name || "User"}</p>
                    <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-2">
              <LoginDialog>
                <Button variant="ghost" size="sm">
                  Login
                </Button>
              </LoginDialog>
              <RegisterDialog>
                <Button size="sm">
                  Sign Up
                </Button>
              </RegisterDialog>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}

