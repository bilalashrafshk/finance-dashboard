"use client"

import * as React from "react"
import { Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth/auth-context"

import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"

interface SearchResult {
    symbol: string
    full_name: string
    sector: string
    asset_type: string
}

export function GlobalSearch() {
    const [open, setOpen] = React.useState(false)
    const [query, setQuery] = React.useState("")
    const [data, setData] = React.useState<SearchResult[]>([])
    const router = useRouter()
    const { user } = useAuth()

    React.useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                setOpen((open) => !open)
            }
        }
        document.addEventListener("keydown", down)
        return () => document.removeEventListener("keydown", down)
    }, [])

    // Fetch stocks on mount/open
    React.useEffect(() => {
        if (open && data.length === 0) {
            fetch("/api/screener/stocks")
                .then((res) => res.json())
                .then((json) => {
                    if (json.success && Array.isArray(json.stocks)) {
                        const mapped = json.stocks.map((item: any) => ({
                            symbol: item.symbol,
                            full_name: item.name,
                            sector: item.sector,
                            asset_type: 'pk-equity' // defaulting since endpoint is currently PK only
                        }))
                        setData(mapped)
                    }
                })
                .catch(console.error)
        }
    }, [open, data.length])

    const runCommand = React.useCallback((command: () => unknown) => {
        setOpen(false)
        command()
    }, [])

    // Simple client-side filtering
    const filteredData = React.useMemo(() => {
        const indices = [
            { symbol: 'KSE100', full_name: 'KSE 100 Index', sector: 'Index', asset_type: 'index' }
        ];

        let mixedData = [...indices, ...data];

        if (!query) return mixedData.slice(0, 20)
        const lower = query.toLowerCase()
        return mixedData.filter(item =>
            item.symbol.toLowerCase().includes(lower) ||
            item.full_name?.toLowerCase().includes(lower)
        ).slice(0, 20)
    }, [data, query])

    if (!user) return null;

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="relative h-9 w-full justify-start rounded-[0.5rem] bg-slate-900/50 text-sm font-normal text-slate-400 shadow-none sm:pr-12 md:w-40 lg:w-64 border border-white/10 hover:bg-slate-900 transition-colors px-4 flex items-center gap-2"
            >
                <Search className="h-4 w-4" />
                <span className="hidden lg:inline-flex">Search...</span>
                <span className="inline-flex lg:hidden">Search...</span>
                <kbd className="pointer-events-none absolute right-[0.3rem] top-[0.3rem] hidden h-5 select-none items-center gap-1 rounded border bg-slate-800 px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
                    <span className="text-xs">⌘</span>K
                </kbd>
            </button>
            <CommandDialog open={open} onOpenChange={setOpen}>
                <CommandInput
                    placeholder="Search assets..."
                    value={query}
                    onValueChange={setQuery}
                />
                <CommandList>
                    <CommandEmpty>No results found.</CommandEmpty>
                    <CommandGroup heading="Assets">
                        {filteredData.map((item) => (
                            <CommandItem
                                key={`${item.asset_type}-${item.symbol}`}
                                value={`${item.symbol} ${item.full_name}`}
                                onSelect={() => {
                                    if (item.asset_type === 'index') {
                                        runCommand(() => router.push(`/charts`))
                                    } else {
                                        runCommand(() => router.push(`/asset/psx-${item.symbol}`))
                                    }
                                }}
                            >
                                <div className="flex items-center gap-2">
                                    <span className="font-bold w-16">{item.symbol}</span>
                                    <span className="text-slate-500 truncate">{item.full_name}</span>
                                    {item.asset_type === 'index' && <span className="text-xs bg-slate-800 px-1 rounded text-slate-400">Index</span>}
                                </div>
                            </CommandItem>
                        ))}
                    </CommandGroup>
                </CommandList>
            </CommandDialog>
        </>
    )
}
