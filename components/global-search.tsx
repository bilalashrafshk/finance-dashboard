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
    name: string
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

    // Fetch assets on mount
    React.useEffect(() => {
        if (open && data.length === 0) {
            fetch("/api/global-search")
                .then((res) => res.json())
                .then((json) => {
                    if (json.success && Array.isArray(json.assets)) {
                        setData(json.assets)
                    }
                })
                .catch(console.error)
        }
    }, [open, data.length])

    const runCommand = React.useCallback((command: () => unknown) => {
        setOpen(false)
        command()
    }, [])

    // Client-side filtering
    const filteredData = React.useMemo(() => {
        if (!query) return data.slice(0, 20)
        const lower = query.toLowerCase()
        return data.filter(item =>
            item.symbol.toLowerCase().includes(lower) ||
            item.name?.toLowerCase().includes(lower)
        ).slice(0, 20)
    }, [data, query])

    if (!user) return null;

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="relative h-9 w-full justify-start rounded-lg bg-slate-900 border border-slate-700/50 text-sm font-normal text-slate-400 shadow-sm hover:bg-slate-800 transition-colors px-4 flex items-center gap-2 sm:pr-12 md:w-40 lg:w-64"
            >
                <Search className="h-4 w-4" />
                <span className="hidden lg:inline-flex">Search assets...</span>
                <span className="inline-flex lg:hidden">Search...</span>
                <kbd className="pointer-events-none absolute right-[0.3rem] top-[0.3rem] hidden h-5 select-none items-center gap-1 rounded border border-slate-700 bg-slate-800 px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex text-slate-400">
                    <span className="text-xs">⌘</span>K
                </kbd>
            </button>
            <CommandDialog open={open} onOpenChange={setOpen}>
                <CommandInput
                    placeholder="Search across all markets..."
                    value={query}
                    onValueChange={setQuery}
                    className="border-none focus:ring-0"
                />
                <CommandList className="bg-slate-950 border-t border-slate-800">
                    <CommandEmpty>No results found.</CommandEmpty>
                    <CommandGroup heading="Assets">
                        {filteredData.map((item) => (
                            <CommandItem
                                key={`${item.asset_type}-${item.symbol}`}
                                value={`${item.symbol} ${item.name}`}
                                onSelect={() => {
                                    if (item.asset_type === 'index') {
                                        runCommand(() => router.push(`/charts`))
                                    } else {
                                        // Handle different asset implementations if views differ
                                        // For now, routing all to /asset/[slug] except indices
                                        // Ensure slug format matches expectation (e.g. psx-SYMBOL for PK)
                                        // Current app seems to specificy prefix manually in old code?
                                        // Actually `asset/[slug]` usually takes just ID or slug.
                                        // Let's assume standard `symbol` or construct `psx-` if pk-equity.
                                        let slug = item.symbol;
                                        if (item.asset_type === 'pk-equity' || item.asset_type === 'equity') {
                                            slug = `psx-${item.symbol}`;
                                        }
                                        // For crypto, it might be just symbol or 'crypto-symbol'
                                        // We'll trust the symbol is sufficient or refine if user report issues.
                                        // Given old code used `psx-`, we maintain that for PK.

                                        runCommand(() => router.push(`/asset/${slug}`))
                                    }
                                }}
                                className="cursor-pointer aria-selected:bg-slate-800 aria-selected:text-white"
                            >
                                <div className="flex items-center justify-between w-full">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold 
                                            ${item.asset_type.includes('crypto') ? 'bg-orange-500/10 text-orange-500' :
                                                item.asset_type.includes('equity') ? 'bg-blue-500/10 text-blue-500' :
                                                    item.asset_type.includes('commodity') ? 'bg-yellow-500/10 text-yellow-500' :
                                                        'bg-slate-800 text-slate-400'}`}>
                                            {item.symbol.substring(0, 2)}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="font-bold text-white">{item.symbol}</span>
                                            <span className="text-slate-500 text-xs truncate max-w-[180px]">{item.name}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] uppercase tracking-wider text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                                            {item.asset_type === 'pk-equity' ? 'PSX' : item.asset_type.replace('-', ' ')}
                                        </span>
                                    </div>
                                </div>
                            </CommandItem>
                        ))}
                    </CommandGroup>
                </CommandList>
            </CommandDialog>
        </>
    )
}
