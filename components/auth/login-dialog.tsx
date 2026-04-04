"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Loader2 } from "lucide-react"
import { ForgotPasswordDialog } from "@/components/auth/forgot-password-dialog"

export function LoginDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const { login, loginWithGoogle } = useAuth()
  const { toast } = useToast()

  useEffect(() => {
    // Initialize Google Identity Services
    const interval = setInterval(() => {
      if (typeof window !== "undefined" && (window as any).google) {
        clearInterval(interval)
        ;(window as any).google.accounts.id.initialize({
          client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
          callback: handleGoogleResponse,
        })
      }
    }, 100)

    return () => clearInterval(interval)
  }, [])

  const handleGoogleResponse = async (response: any) => {
    setLoading(true)
    try {
      await loginWithGoogle(response.credential)
      toast({
        title: "Success",
        description: "Logged in with Google successfully",
      })
      setOpen(false)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Google sign-in failed",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleClick = () => {
    if (typeof window !== "undefined" && (window as any).google) {
      ;(window as any).google.accounts.id.prompt((notification: any) => {
        if (notification.isNotDisplayed()) {
          // If prompt is not displayed (e.g. suppressed or already signed in), 
          // we can try to force a choice or show a message.
          // For a better UX, we could also use a hidden renderButton and click it.
          console.log("Prompt not displayed:", notification.getNotDisplayedReason())
        }
      })
    } else {
      toast({
        title: "Error",
        description: "Google Sign-In is still loading. Please try again in a moment.",
        variant: "destructive",
      })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      await login(email, password)
      toast({
        title: "Success",
        description: "Logged in successfully",
      })
      setOpen(false)
      setEmail("")
      setPassword("")
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to login",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Login</DialogTitle>
          <DialogDescription>
            Enter your email and password to login
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="bg-background/50 border-muted-foreground/20 focus:border-primary/50 transition-all"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    setShowForgotPassword(true)
                  }}
                  className="text-xs text-primary/80 hover:text-primary transition-colors hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                className="bg-background/50 border-muted-foreground/20 focus:border-primary/50 transition-all"
              />
            </div>
            <Button type="submit" className="w-full shadow-lg hover:shadow-primary/20 transition-all" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-muted" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground font-medium">Or continue with</span>
            </div>
          </div>

          <div className="grid gap-2">
            <Button
              variant="outline"
              type="button"
              disabled={loading}
              onClick={handleGoogleClick}
              className="bg-white hover:bg-slate-50 text-slate-950 border-slate-200 transition-colors font-medium flex items-center justify-center gap-2 group"
            >
              <svg className="w-4 h-4 transition-transform group-hover:scale-110" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Google
            </Button>
          </div>
        </div>
      </DialogContent>
      <ForgotPasswordDialog
        open={showForgotPassword}
        onOpenChange={setShowForgotPassword}
      />
    </Dialog>
  )
}

