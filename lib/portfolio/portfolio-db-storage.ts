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
      cache: 'no-store', // Prevent browser caching - holdings are calculated from transactions in real-time
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
      // Preserve error details for cash checking
      const errorObj: any = new Error(error.error || 'Failed to add holding')
      errorObj.details = error
      throw errorObj
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

/**
 * Sell a holding
 * @deprecated Use addTransaction with tradeType='sell' instead
 */
export async function sellHolding(
  holdingId: string,
  quantity: number,
  price: number,
  date: string,
  fees?: number,
  notes?: string
): Promise<{ realizedPnL: number; proceeds: number; message: string }> {
  const token = getAuthToken()
  if (!token) {
    throw new Error('Authentication required')
  }

  try {
    const response = await fetch(`${API_BASE}/sell`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        holdingId,
        quantity,
        price,
        date,
        fees,
        notes,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to sell holding')
    }

    const data = await response.json()
    if (data.success) {
      return {
        realizedPnL: data.realizedPnL,
        proceeds: data.proceeds,
        message: data.message,
      }
    }

    throw new Error('Failed to sell holding')
  } catch (error: any) {
    console.error('Error selling holding:', error)
    throw error
  }
}

// Transaction-based functions (new approach)

const TRADES_API_BASE = '/api/user/trades'

export interface Trade {
  id: number
  tradeType: 'buy' | 'sell' | 'add' | 'remove'
  assetType: string
  symbol: string
  name: string
  quantity: number
  price: number
  totalAmount: number
  currency: string
  tradeDate: string
  notes: string | null
}

/**
 * Add a new transaction
 */
export async function addTransaction(trade: Omit<Trade, 'id'>): Promise<Trade> {
  const token = getAuthToken()
  if (!token) {
    throw new Error('Authentication required')
  }

  try {
    const response = await fetch(TRADES_API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(trade),
    })

    if (!response.ok) {
      const error = await response.json()
      // Preserve error details for cash checking
      const errorObj: any = new Error(error.error || 'Failed to add transaction')
      errorObj.details = error
      throw errorObj
    }

    const data = await response.json()
    if (data.success) {
      return data.trade
    }

    throw new Error('Failed to add transaction')
  } catch (error: any) {
    console.error('Error adding transaction:', error)
    throw error
  }
}

/**
 * Update an existing transaction
 */
export async function updateTransaction(id: number, trade: Partial<Omit<Trade, 'id'>>): Promise<Trade> {
  const token = getAuthToken()
  if (!token) {
    throw new Error('Authentication required')
  }

  try {
    const response = await fetch(`${TRADES_API_BASE}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(trade),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to update transaction')
    }

    const data = await response.json()
    if (data.success) {
      return data.trade
    }

    throw new Error('Failed to update transaction')
  } catch (error: any) {
    console.error('Error updating transaction:', error)
    throw error
  }
}

/**
 * Delete a transaction
 */
export async function deleteTransaction(id: number): Promise<boolean> {
  const token = getAuthToken()
  if (!token) {
    throw new Error('Authentication required')
  }

  try {
    const response = await fetch(`${TRADES_API_BASE}/${id}`, {
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
      throw new Error(error.error || 'Failed to delete transaction')
    }

    const data = await response.json()
    return data.success
  } catch (error: any) {
    console.error('Error deleting transaction:', error)
    throw error
  }
}

/**
 * Get all transactions
 */
export async function getTransactions(): Promise<Trade[]> {
  const token = getAuthToken()
  if (!token) {
    return []
  }

  try {
    const response = await fetch(TRADES_API_BASE, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      console.error('Error loading transactions:', response.statusText)
      return []
    }

    const data = await response.json()
    if (data.success) {
      return data.trades
    }

    return []
  } catch (error) {
    console.error('Error loading transactions:', error)
    return []
  }
}

