"use client"

import { useState, useEffect } from "react"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Check, ChevronsUpDown, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatMetalForDisplay } from "@/lib/portfolio/metals-api"

interface Metal {
  symbol: string
  name: string
  displayName: string
}

interface MetalsSelectorProps {
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
}

export function MetalsSelector({ value, onValueChange, disabled }: MetalsSelectorProps) {
  const [open, setOpen] = useState(false)
  const [metals, setMetals] = useState<Metal[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    fetchMetals()
  }, [])

  const fetchMetals = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/metals/list')
      if (response.ok) {
        const data = await response.json()
        setMetals(data.metals || [])
      }
    } catch (error) {
      console.error('Error fetching metals:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredMetals = metals.filter((metal) => {
    const displayName = formatMetalForDisplay(metal.symbol)
    return displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
           metal.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
           metal.name.toLowerCase().includes(searchQuery.toLowerCase())
  })

  const selectedMetal = value ? formatMetalForDisplay(value) : "Select metal..."

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
              Loading metals...
            </>
          ) : (
            <>
              {selectedMetal}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput 
            placeholder="Search metals..." 
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            <CommandEmpty>No metals found.</CommandEmpty>
            <CommandGroup>
              {filteredMetals.map((metal) => {
                const displayName = formatMetalForDisplay(metal.symbol)
                const isSelected = value === metal.symbol
                return (
                  <CommandItem
                    key={metal.symbol}
                    value={metal.symbol}
                    onSelect={() => {
                      onValueChange(metal.symbol)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        isSelected ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {displayName}
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






