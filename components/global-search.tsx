"use client"

import * as React from "react"
import { Search, Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth/auth-context"
import { useDebounce } from "use-debounce"
import { AddAssetDialog } from "@/components/asset-screener/add-asset-dialog"
import { generateAssetSlug } from "@/lib/asset-screener/url-utils"

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

    const [loading, setLoading] = React.useState(false)

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



    const [debouncedQuery] = useDebounce(query, 800)
    const [addAssetOpen, setAddAssetOpen] = React.useState(false)

    // Fetch initial data or search results
    React.useEffect(() => {
        const trimmedQuery = debouncedQuery.trim()
        const fetchUrl = trimmedQuery.length >= 1
            ? `/api/global-search?query=${encodeURIComponent(trimmedQuery)}`
            : "/api/global-search" // Support default list

        setLoading(true)
        fetch(fetchUrl)
            .then((res) => res.json())
            .then((json) => {
                if (json.success && Array.isArray(json.assets)) {
                    setData(json.assets)
                } else {
                    setData([])
                }
            })
            .catch(console.error)
            .finally(() => setLoading(false))
    }, [open, debouncedQuery])

    const runCommand = React.useCallback((command: () => unknown) => {
        setOpen(false)
        command()
    }, [])

    // Handle adding custom asset - we can use this to refresh data or just show success
    const handleAssetAdded = async () => {
        // Maybe toast success?
    }

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
            <CommandDialog
                open={open}
                onOpenChange={setOpen}
                commandProps={{ shouldFilter: false }}
            >
                <CommandInput
                    placeholder="Search stocks, crypto, commodities..."
                    value={query}
                    onValueChange={setQuery}
                    className="border-none focus:ring-0"
                />
                <CommandList className="bg-slate-950 border-t border-slate-800 min-h-[300px]">
                    {loading ? (
                        <div className="py-6 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
                            <div className="w-4 h-4 border-2 border-slate-600 border-t-slate-400 rounded-full animate-spin"></div>
                            Loading assets...
                        </div>
                    ) : (
                        <>
                            {data.length === 0 && query.length > 0 && (
                                <CommandGroup heading="No results found">
                                    <CommandItem
                                        value="add-custom-asset"
                                        onSelect={() => {
                                            setOpen(false)
                                            setAddAssetOpen(true)
                                        }}
                                        className="cursor-pointer aria-selected:bg-slate-800 aria-selected:text-white"
                                    >
                                        <div className="flex items-center gap-2 text-blue-400">
                                            <Plus className="w-4 h-4" />
                                            <span>Add "{query}" as custom asset</span>
                                        </div>
                                    </CommandItem>
                                </CommandGroup>
                            )}

                            {data.length > 0 && (
                                <CommandGroup heading="Assets">
                                    {data.map((item) => (
                                        <CommandItem
                                            key={`${item.asset_type}-${item.symbol}`}
                                            value={`${item.symbol} ${item.name}`}
                                            onSelect={() => {
                                                if (item.asset_type === 'index' || item.asset_type === 'kse100' || item.asset_type === 'spx500') {
                                                    runCommand(() => router.push(`/charts`))
                                                } else {
                                                    const slug = generateAssetSlug(item.asset_type, item.symbol)
                                                    runCommand(() => router.push(`/asset/${slug}`))
                                                }
                                            }}
                                            className="cursor-pointer aria-selected:bg-slate-800 aria-selected:text-white"
                                        >
                                            <div className="flex items-center justify-between w-full">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold 
                                                        ${item.asset_type.includes('us-equity') ? 'bg-indigo-500/10 text-indigo-500' :
                                                            item.asset_type === 'crypto' ? 'bg-orange-500/10 text-orange-500' :
                                                                'bg-green-500/10 text-green-500'}`}>
                                                        {item.symbol.substring(0, 2)}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-white">{item.symbol}</span>
                                                        <span className="text-slate-500 text-xs truncate max-w-[180px]">{item.name}</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] uppercase tracking-wider text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                                                        {item.asset_type === 'pk-equity' ? 'PSX' : item.asset_type === 'us-equity' ? 'US' : item.asset_type}
                                                    </span>
                                                </div>
                                            </div>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            )}
                        </>
                    )}
                </CommandList>
            </CommandDialog>

            <AddAssetDialog
                open={addAssetOpen}
                onOpenChange={setAddAssetOpen}
                onSave={async (asset: any) => {
                    // Call API to save to user's list? Or just trigger screener add?
                    // The AddAssetDialog onSave usually expects a function.
                    // We might need to implement a basic save function or import one.
                    // For Global Search, adding usually means 'Tracking' it.
                    // Reusing the same AddAssetDialog as in Screener/Portfolio requires handling onSave.
                    // Let's assume we use the POST /api/user/trades logic or similar, but AddAssetDialog is generic component?
                    // Checking AddAssetDialog usage... it takes onSave prop.

                    try {
                        const response = await fetch('/api/user/watchlist', { // Assuming watchlist or portfolio
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(asset)
                        })
                        if (!response.ok) throw new Error('Failed to add asset')
                        // After adding, maybe navigate?
                    } catch (e) {
                        console.error(e)
                        throw e
                    }
                }}
                defaultAssetType="us-equity" // Default
            />
        </>
    )
}
