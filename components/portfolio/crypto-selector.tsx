"use client"

import { useState, useEffect } from "react"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Check, ChevronsUpDown, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatSymbolForDisplay } from "@/lib/portfolio/binance-api"

interface CryptoSelectorProps {
  value?: string
  onValueChange: (value: string) => void
  disabled?: boolean
}

export function CryptoSelector({ value, onValueChange, disabled }: CryptoSelectorProps) {
  const [open, setOpen] = useState(false)
  const [symbols, setSymbols] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    fetchSymbols()
  }, [])

  const fetchSymbols = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/binance/symbols')
      if (response.ok) {
        const data = await response.json()
        setSymbols(data.symbols || [])
      }
    } catch (error) {
      console.error('Error fetching crypto symbols:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredSymbols = symbols.filter((symbol) => {
    const displaySymbol = formatSymbolForDisplay(symbol)
    return displaySymbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
           symbol.toLowerCase().includes(searchQuery.toLowerCase())
  })

  const selectedSymbol = value ? formatSymbolForDisplay(value) : "Select crypto..."

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled || loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading cryptos...
            </>
          ) : (
            <>
              {selectedSymbol}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command>
          <CommandInput 
            placeholder="Search crypto..." 
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            <CommandEmpty>No crypto found.</CommandEmpty>
            <CommandGroup>
              {filteredSymbols.slice(0, 100).map((symbol) => {
                const displaySymbol = formatSymbolForDisplay(symbol)
                const isSelected = value === symbol
                return (
                  <CommandItem
                    key={symbol}
                    value={symbol}
                    onSelect={() => {
                      onValueChange(symbol)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        isSelected ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {displaySymbol}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}


