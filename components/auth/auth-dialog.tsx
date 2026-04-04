"use client"

import { useState, useEffect, useRef } from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Mail, Lock, User, Eye, EyeOff } from "lucide-react"
import { ForgotPasswordDialog } from "@/components/auth/forgot-password-dialog"

interface AuthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialMode?: "login" | "register"
}

export function AuthDialog({ open, onOpenChange, initialMode = "login" }: AuthDialogProps) {
  const [mode, setMode] = useState<"login" | "register">(initialMode)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [clientId, setClientId] = useState<string | null>(null)
  
  const googleBtnRef = useRef<HTMLDivElement>(null)
  const { login, register, loginWithGoogle, refreshUser } = useAuth()
  const { toast } = useToast()

  // Reset fields when mode changes or dialog opens
  useEffect(() => {
    if (open) {
      setMode(initialMode)
      setEmail("")
      setPassword("")
      setName("")
      setError(null)
    }
  }, [open, initialMode])

  const [error, setError] = useState<string | null>(null)

  // Fetch Google Client ID
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch("/api/auth/google/config")
        const data = await res.json()
        if (data.clientId) {
          setClientId(data.clientId)
        }
      } catch (err) {
        console.error("Failed to fetch Google config:", err)
      }
    }
    fetchConfig()
  }, [])

  // Initialize Google Button
  useEffect(() => {
    if (!open || !clientId || !googleBtnRef.current) return

    const initGoogle = () => {
      try {
        if (typeof window !== "undefined" && (window as any).google && googleBtnRef.current) {
          (window as any).google.accounts.id.initialize({
            client_id: clientId,
            callback: handleGoogleResponse,
          })
          
          (window as any).google.accounts.id.renderButton(googleBtnRef.current, {
            theme: "outline",
            size: "large",
            width: googleBtnRef.current.offsetWidth || 350,
            text: mode === "login" ? "signin_with" : "signup_with",
            shape: "rectangular",
          })
        }
      } catch (err) {
        console.error("Google button error:", err)
      }
    }

    // Check if script is loaded, otherwise wait
    if ((window as any).google) {
      initGoogle()
    } else {
      const interval = setInterval(() => {
        if ((window as any).google) {
          clearInterval(interval)
          initGoogle()
        }
      }, 100)
      return () => clearInterval(interval)
    }
  }, [open, clientId, mode])

  const handleGoogleResponse = async (response: any) => {
    setLoading(true)
    try {
      await loginWithGoogle(response.credential)
      await refreshUser()
      toast({
        title: "Success",
        description: `Successfully ${mode === "login" ? "logged in" : "registered"} with Google`,
      })
      onOpenChange(false)
    } catch (err: any) {
      setError(err.message || "Google authentication failed")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (mode === "register") {
        await register(email, password, name)
      } else {
        await login(email, password)
      }
      
      await refreshUser()
      toast({
        title: "Success",
        description: `Successfully ${mode === "login" ? "logged in" : "registered"}`,
      })
      onOpenChange(false)
    } catch (err: any) {
      setError(err.message || "Authentication failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-slate-950 border-slate-800 text-white shadow-2xl">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-2xl font-bold">
            {mode === "login" ? "Welcome Back" : "Create Account"}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {mode === "login" 
              ? "Sign in to access your dashboard" 
              : "Start tracking your portfolio today"}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 mb-4 bg-red-950/40 border border-red-900/50 rounded-lg text-red-200 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input
                    id="name"
                    placeholder="John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required={mode === "register"}
                    className="pl-10 bg-slate-900 border-slate-800 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="pl-10 bg-slate-900 border-slate-800 focus:border-blue-500 transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {mode === "login" && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenChange(false)
                      setShowForgotPassword(true)
                    }}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pl-10 pr-10 bg-slate-900 border-slate-800 focus:border-blue-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-6 shadow-lg shadow-blue-900/20" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "login" ? "Sign In" : "Get Started"}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-800" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-slate-950 px-2 text-slate-500 font-medium whitespace-nowrap">
                Or continue with
              </span>
            </div>
          </div>

          {/* This is where Google will render the REAL button */}
          <div ref={googleBtnRef} className="w-full min-h-[44px] flex justify-center overflow-hidden" />
          {!clientId && (
            <p className="text-center text-[10px] text-slate-600">
              Loading Google Sign-In...
            </p>
          )}

          <div className="text-center text-sm">
            <span className="text-slate-400">
              {mode === "login" ? "Don't have an account?" : "Already have an account?"}
            </span>
            <button
              onClick={() => setMode(mode === "login" ? "register" : "login")}
              className="ml-2 text-blue-400 hover:text-blue-300 font-semibold"
            >
              {mode === "login" ? "Sign Up" : "Log In"}
            </button>
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
