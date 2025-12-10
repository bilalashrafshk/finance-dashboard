"use client"

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { UserDTO, ApiResponse } from '@/lib/types'
import { apiClient } from '@/lib/api-client'

interface AuthContextType {
  user: UserDTO | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name?: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
  updateUser: (updatedUser: UserDTO) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_user'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDTO | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const doLogout = () => {
    setUser(null)
    setToken(null)
    if (typeof window !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
    }
  }

  const refreshUserLogic = async (currentToken: string) => {
    try {
      // apiClient automatically attaches the token from localStorage if it exists.
      // However, on init, we might want to be explicit or ensure LS is set.
      // But since we are verifying the *stored* token, we should probably set it first or rely on apiClient reading it.
      // The safest way here is to rely on apiClient reading the key we just confirmed exists.

      // The backend returns { success: true, user: UserDTO } directly
      const response = await apiClient.get<{ success: boolean; user: UserDTO }>('/auth/me')

      if (response.success && response.user) {
        setUser(response.user)
        localStorage.setItem(USER_KEY, JSON.stringify(response.user))
      } else {
        // If success is false or user is missing, consider it an invalid token
        doLogout()
      }
    } catch (err) {
      console.error('Error verifying token:', err)
      // If 401, apiClient throws. We should logout.
      doLogout()
    }
  }

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
          await refreshUserLogic(storedToken)
        } catch (e) {
          // Invalid stored data, clear it
          doLogout()
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
      doLogout()
      return
    }
    await refreshUserLogic(storedToken)
  }

  const login = async (email: string, password: string) => {
    // Defines response structure: { success: boolean, token: string, user: UserDTO }
    const data = await apiClient.post<{ success: boolean; token: string; user: UserDTO }>(
      '/auth/login',
      { email, password }
    )

    if (data.success && data.token && data.user) {
      setUser(data.user)
      setToken(data.token)
      localStorage.setItem(TOKEN_KEY, data.token)
      localStorage.setItem(USER_KEY, JSON.stringify(data.user))
    } else {
      throw new Error((data as any).message || 'Login failed')
    }
  }

  const register = async (email: string, password: string, name?: string) => {
    const data = await apiClient.post<{ success: boolean; token: string; user: UserDTO }>(
      '/auth/register',
      { email, password, name }
    )

    if (data.success && data.token && data.user) {
      setUser(data.user)
      setToken(data.token)
      localStorage.setItem(TOKEN_KEY, data.token)
      localStorage.setItem(USER_KEY, JSON.stringify(data.user))
    } else {
      throw new Error((data as any).message || 'Registration failed')
    }
  }

  const logout = () => {
    doLogout()
  }

  const updateUser = (updatedUser: UserDTO) => {
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
 * @deprecated Use apiClient automatic injection instead
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}
