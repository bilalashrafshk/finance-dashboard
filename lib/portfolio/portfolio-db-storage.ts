/**
 * Portfolio Database Storage
 * 
 * Handles persistence of portfolio data to database (replaces localStorage)
 */

import type { Holding, Portfolio } from './types'
import { getAuthToken } from '@/lib/auth/auth-context'

const API_BASE = '/api/user/holdings'

/**
 * Load portfolio from database
 */
export async function loadPortfolio(): Promise<Portfolio> {
  const token = getAuthToken()
  if (!token) {
    return { holdings: [], lastUpdated: new Date().toISOString() }
  }

  try {
    const response = await fetch(API_BASE, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      console.error('Error loading portfolio from database:', response.statusText)
      return { holdings: [], lastUpdated: new Date().toISOString() }
    }

    const data = await response.json()
    if (data.success) {
      return {
        holdings: data.holdings,
        lastUpdated: new Date().toISOString(),
      }
    }

    return { holdings: [], lastUpdated: new Date().toISOString() }
  } catch (error) {
    console.error('Error loading portfolio from database:', error)
    return { holdings: [], lastUpdated: new Date().toISOString() }
  }
}

/**
 * Save portfolio to database (creates/updates holdings)
 */
export async function savePortfolio(portfolio: Portfolio): Promise<void> {
  const token = getAuthToken()
  if (!token) {
    console.warn('Cannot save portfolio: not authenticated')
    return
  }

  // Note: This function is kept for compatibility, but individual holdings
  // should be managed via addHolding, updateHolding, deleteHolding
  // This could be used for bulk operations in the future
}

/**
 * Add a new holding
 */
export async function addHolding(holding: Omit<Holding, 'id' | 'createdAt' | 'updatedAt'>): Promise<Holding> {
  const token = getAuthToken()
  if (!token) {
    throw new Error('Authentication required')
  }

  try {
    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(holding),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to add holding')
    }

    const data = await response.json()
    if (data.success) {
      return data.holding
    }

    throw new Error('Failed to add holding')
  } catch (error: any) {
    console.error('Error adding holding:', error)
    throw error
  }
}

/**
 * Update an existing holding
 */
export async function updateHolding(id: string, updates: Partial<Omit<Holding, 'id' | 'createdAt'>>): Promise<Holding | null> {
  const token = getAuthToken()
  if (!token) {
    throw new Error('Authentication required')
  }

  try {
    const response = await fetch(`${API_BASE}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(updates),
    })

    if (!response.ok) {
      if (response.status === 404) {
        return null
      }
      const error = await response.json()
      throw new Error(error.error || 'Failed to update holding')
    }

    const data = await response.json()
    if (data.success) {
      return data.holding
    }

    return null
  } catch (error: any) {
    console.error('Error updating holding:', error)
    throw error
  }
}

/**
 * Delete a holding
 */
export async function deleteHolding(id: string): Promise<boolean> {
  const token = getAuthToken()
  if (!token) {
    throw new Error('Authentication required')
  }

  try {
    const response = await fetch(`${API_BASE}/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        return false
      }
      const error = await response.json()
      throw new Error(error.error || 'Failed to delete holding')
    }

    const data = await response.json()
    return data.success
  } catch (error: any) {
    console.error('Error deleting holding:', error)
    throw error
  }
}

/**
 * Get a holding by ID
 */
export async function getHolding(id: string): Promise<Holding | null> {
  const portfolio = await loadPortfolio()
  return portfolio.holdings.find((h) => h.id === id) || null
}

