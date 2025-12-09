"use client"

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface User {
  id: number
  email: string
  name: string | null
  role: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name?: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
  updateUser: (updatedUser: User) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_user'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Load auth state from localStorage on mount
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem(TOKEN_KEY)
      const storedUser = localStorage.getItem(USER_KEY)

      if (storedToken && storedUser) {
        setToken(storedToken)
        try {
          setUser(JSON.parse(storedUser))
          // Verify token with server
          try {
            const response = await fetch('/api/auth/me', {
              headers: {
                'Authorization': `Bearer ${storedToken}`,
              },
            })

            if (!response.ok) {
              // Token invalid, clear auth
              console.warn('Token invalid on init, logging out')
              localStorage.removeItem(TOKEN_KEY)
              localStorage.removeItem(USER_KEY)
              setToken(null)
              setUser(null)
            } else {
              // Update user data from server to ensure fresh role/data
              const data = await response.json()
              if (data.success) {
                setUser(data.user)
                localStorage.setItem(USER_KEY, JSON.stringify(data.user))
              }
            }
          } catch (err) {
            console.error('Error verifying token on init:', err)
          }
        } catch (e) {
          // Invalid stored user, clear it
          localStorage.removeItem(TOKEN_KEY)
          localStorage.removeItem(USER_KEY)
          setToken(null)
          setUser(null)
        }
      }

      setLoading(false)
    }

    initAuth()
  }, [])

  // Verify token and refresh user data
  const refreshUser = async () => {
    const storedToken = localStorage.getItem(TOKEN_KEY)
    if (!storedToken) {
      setUser(null)
      setToken(null)
      return
    }

    try {
      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${storedToken}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setUser(data.user)
          setToken(storedToken)
          localStorage.setItem(USER_KEY, JSON.stringify(data.user))
        } else {
          // Token invalid, clear auth
          logout()
        }
      } else {
        // Token invalid, clear auth
        logout()
      }
    } catch (error) {
      console.error('Error refreshing user:', error)
      logout()
    }
  }

  const login = async (email: string, password: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    })

    const data = await response.json()

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Login failed')
    }

    setUser(data.user)
    setToken(data.token)
    localStorage.setItem(TOKEN_KEY, data.token)
    localStorage.setItem(USER_KEY, JSON.stringify(data.user))
  }

  const register = async (email: string, password: string, name?: string) => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password, name }),
    })

    const data = await response.json()

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Registration failed')
    }

    setUser(data.user)
    setToken(data.token)
    localStorage.setItem(TOKEN_KEY, data.token)
    localStorage.setItem(USER_KEY, JSON.stringify(data.user))
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser)
    localStorage.setItem(USER_KEY, JSON.stringify(updatedUser))
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, refreshUser, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

/**
 * Get auth token for API calls
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}
