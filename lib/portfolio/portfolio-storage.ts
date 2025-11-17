/**
 * Portfolio LocalStorage Management
 * 
 * Handles persistence of portfolio data to browser localStorage.
 */

import type { Holding, Portfolio } from './types'

const STORAGE_KEY = 'portfolio-tracker-data'

/**
 * Load portfolio from localStorage
 */
export function loadPortfolio(): Portfolio {
  if (typeof window === 'undefined') {
    return { holdings: [], lastUpdated: new Date().toISOString() }
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return { holdings: [], lastUpdated: new Date().toISOString() }
    }
    return JSON.parse(stored) as Portfolio
  } catch (error) {
    console.error('Error loading portfolio from localStorage:', error)
    return { holdings: [], lastUpdated: new Date().toISOString() }
  }
}

/**
 * Save portfolio to localStorage
 */
export function savePortfolio(portfolio: Portfolio): void {
  if (typeof window === 'undefined') return

  try {
    const updated = {
      ...portfolio,
      lastUpdated: new Date().toISOString(),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch (error) {
    console.error('Error saving portfolio to localStorage:', error)
  }
}

/**
 * Add a new holding
 */
export function addHolding(holding: Omit<Holding, 'id' | 'createdAt' | 'updatedAt'>): Holding {
  const portfolio = loadPortfolio()
  const newHolding: Holding = {
    ...holding,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  
  portfolio.holdings.push(newHolding)
  savePortfolio(portfolio)
  return newHolding
}

/**
 * Update an existing holding
 */
export function updateHolding(id: string, updates: Partial<Omit<Holding, 'id' | 'createdAt'>>): Holding | null {
  const portfolio = loadPortfolio()
  const index = portfolio.holdings.findIndex((h) => h.id === id)
  
  if (index === -1) return null

  portfolio.holdings[index] = {
    ...portfolio.holdings[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  }
  
  savePortfolio(portfolio)
  return portfolio.holdings[index]
}

/**
 * Delete a holding
 */
export function deleteHolding(id: string): boolean {
  const portfolio = loadPortfolio()
  const index = portfolio.holdings.findIndex((h) => h.id === id)
  
  if (index === -1) return false

  portfolio.holdings.splice(index, 1)
  savePortfolio(portfolio)
  return true
}

/**
 * Get a holding by ID
 */
export function getHolding(id: string): Holding | null {
  const portfolio = loadPortfolio()
  return portfolio.holdings.find((h) => h.id === id) || null
}



