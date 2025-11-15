"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Settings, Save } from "lucide-react"

const STORAGE_KEY_US = 'asset-screener-risk-free-rate-us'
const STORAGE_KEY_PK = 'asset-screener-risk-free-rate-pk'

const DEFAULT_US_RATE = 2.5
const DEFAULT_PK_RATE = 3.5

export interface RiskFreeRates {
  us: number
  pk: number
}

export function loadRiskFreeRates(): RiskFreeRates {
  if (typeof window === 'undefined') {
    return { us: DEFAULT_US_RATE, pk: DEFAULT_PK_RATE }
  }

  try {
    const usRate = localStorage.getItem(STORAGE_KEY_US)
    const pkRate = localStorage.getItem(STORAGE_KEY_PK)
    
    return {
      us: usRate ? parseFloat(usRate) : DEFAULT_US_RATE,
      pk: pkRate ? parseFloat(pkRate) : DEFAULT_PK_RATE,
    }
  } catch (error) {
    console.error('Error loading risk-free rates:', error)
    return { us: DEFAULT_US_RATE, pk: DEFAULT_PK_RATE }
  }
}

export function saveRiskFreeRates(rates: RiskFreeRates): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(STORAGE_KEY_US, rates.us.toString())
    localStorage.setItem(STORAGE_KEY_PK, rates.pk.toString())
  } catch (error) {
    console.error('Error saving risk-free rates:', error)
  }
}

interface RiskFreeRateSettingsProps {
  onRatesChange?: (rates: RiskFreeRates) => void
}

export function RiskFreeRateSettings({ onRatesChange }: RiskFreeRateSettingsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [usRate, setUsRate] = useState<string>(DEFAULT_US_RATE.toString())
  const [pkRate, setPkRate] = useState<string>(DEFAULT_PK_RATE.toString())
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const rates = loadRiskFreeRates()
    setUsRate(rates.us.toString())
    setPkRate(rates.pk.toString())
  }, [])

  const handleSave = () => {
    const us = parseFloat(usRate)
    const pk = parseFloat(pkRate)

    if (isNaN(us) || isNaN(pk) || us < 0 || pk < 0 || us > 100 || pk > 100) {
      alert('Please enter valid risk-free rates (0-100%)')
      return
    }

    const rates: RiskFreeRates = { us, pk }
    saveRiskFreeRates(rates)
    setSaved(true)
    
    if (onRatesChange) {
      onRatesChange(rates)
    }

    setTimeout(() => {
      setSaved(false)
      setIsOpen(false)
    }, 1500)
  }

  const handleReset = () => {
    setUsRate(DEFAULT_US_RATE.toString())
    setPkRate(DEFAULT_PK_RATE.toString())
  }

  return (
    <div className="mb-6">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full sm:w-auto"
      >
        <Settings className="mr-2 h-4 w-4" />
        Risk-Free Rate Settings
      </Button>

      {isOpen && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-lg">Risk-Free Rate Settings</CardTitle>
            <CardDescription>
              Configure risk-free rates for Sharpe Ratio calculations. These rates are used when calculating Sharpe Ratio for US and PK equities.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="us-rate">US Equities Risk-Free Rate (%)</Label>
                <Input
                  id="us-rate"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={usRate}
                  onChange={(e) => setUsRate(e.target.value)}
                  placeholder="2.5"
                />
                <p className="text-xs text-muted-foreground">
                  Typically 2-3% (10-year Treasury yield)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pk-rate">PK Equities Risk-Free Rate (%)</Label>
                <Input
                  id="pk-rate"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={pkRate}
                  onChange={(e) => setPkRate(e.target.value)}
                  placeholder="3.5"
                />
                <p className="text-xs text-muted-foreground">
                  Typically 3-4% (Pakistan Treasury yield)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={handleSave} size="sm">
                <Save className="mr-2 h-4 w-4" />
                {saved ? 'Saved!' : 'Save'}
              </Button>
              <Button variant="outline" onClick={handleReset} size="sm">
                Reset to Defaults
              </Button>
              <Button variant="ghost" onClick={() => setIsOpen(false)} size="sm">
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

