"use client"

import { useState, useEffect } from "react"
import type { ReactNode } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Video, FileText, ExternalLink, Calendar, Search, Filter } from "lucide-react"
import { format } from "date-fns"
import Link from "next/link"

interface Analysis {
    id: number
    symbol: string
    url: string
    title: string
    type: 'video' | 'presentation'
    thought: 'buy' | 'sell' | 'watch' | 'hold'
    remarks: string
    analyst: string
    analysis_date: string
    created_at: string
}

export function AnalysisFeed() {
    const [analyses, setAnalyses] = useState<Analysis[]>([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(0)
    const [hasMore, setHasMore] = useState(true)
    const LIMIT = 20

    // Filters
    const [searchQuery, setSearchQuery] = useState("")
    const [typeFilter, setTypeFilter] = useState<string>("all")
    const [thoughtFilter, setThoughtFilter] = useState<string>("all")

    const fetchAnalyses = async (reset = false) => {
        setLoading(true)
        try {
            const offset = reset ? 0 : page * LIMIT
            const res = await fetch(`/api/asset-analyses?limit=${LIMIT}&offset=${offset}`)

            if (res.ok) {
                const data = await res.json()
                const newAnalyses = data.analyses || []

                if (reset) {
                    setAnalyses(newAnalyses)
                    setPage(1)
                } else {
                    setAnalyses(prev => [...prev, ...newAnalyses])
                    setPage(prev => prev + 1)
                }

                if (newAnalyses.length < LIMIT) {
                    setHasMore(false)
                } else {
                    setHasMore(true) // Reset hasMore if we got a full page
                }
            }
        } catch (error) {
            console.error('Failed to fetch analyses', error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        // Initial load
        fetchAnalyses(true)
    }, [])

    const getThoughtColor = (thought: string) => {
        switch (thought) {
            case 'buy': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800'
            case 'sell': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800'
            case 'hold': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800'
            default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700'
        }
    }

    // Client-side filtering for search/type/thought
    // (Note: Ideally this should remain server-side for scale, but for now client-side is faster to implement given current API)
    const filteredAnalyses = analyses.filter(analysis => {
        const matchesSearch =
            analysis.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            analysis.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
            analysis.remarks.toLowerCase().includes(searchQuery.toLowerCase())

        const matchesType = typeFilter === "all" || analysis.type === typeFilter
        const matchesThought = thoughtFilter === "all" || analysis.thought === thoughtFilter

        return matchesSearch && matchesType && matchesThought
    })

    return (
        <div className="space-y-6">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by ticker, title or content..."
                        className="pl-8"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-full sm:w-[150px]">
                        <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="video">Video</SelectItem>
                        <SelectItem value="presentation">Presentation</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={thoughtFilter} onValueChange={setThoughtFilter}>
                    <SelectTrigger className="w-full sm:w-[150px]">
                        <SelectValue placeholder="All Ratings" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Ratings</SelectItem>
                        <SelectItem value="buy">Buy</SelectItem>
                        <SelectItem value="sell">Sell</SelectItem>
                        <SelectItem value="hold">Hold</SelectItem>
                        <SelectItem value="watch">Watch</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Grid */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredAnalyses.map((analysis) => (
                    <Card key={analysis.id} className="flex flex-col overflow-hidden hover:shadow-md transition-shadow">
                        <CardHeader className="pb-2">
                            <div className="flex justify-between items-start mb-2">
                                <Link href={`/asset/${analysis.symbol}`}>
                                    <Badge variant="secondary" className="font-mono hover:bg-secondary/80 transition-colors">
                                        {analysis.symbol}
                                    </Badge>
                                </Link>
                                <Badge variant="outline" className={`${getThoughtColor(analysis.thought)} uppercase text-[10px]`}>
                                    {analysis.thought}
                                </Badge>
                            </div>
                            <CardTitle className="text-base line-clamp-2 leading-tight">
                                {analysis.title}
                            </CardTitle>
                            <div className="flex items-center flex-wrap gap-2 text-xs text-muted-foreground mt-2">
                                <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {format(new Date(analysis.analysis_date), 'MMM d, yyyy')}
                                </span>
                                <span>•</span>
                                <span className="font-medium text-foreground/80">{analysis.analyst}</span>
                                <span>•</span>
                                <span className="flex items-center gap-1 capitalize">
                                    {analysis.type === 'video' ? <Video className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                                    {analysis.type}
                                </span>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 flex flex-col pt-0">
                            {analysis.remarks && (
                                <div className="text-sm text-muted-foreground mb-4 line-clamp-4 flex-1">
                                    {analysis.remarks}
                                </div>
                            )}
                            <div className="mt-auto pt-4">
                                <Button variant="outline" size="sm" className="w-full gap-2" asChild>
                                    <a href={analysis.url} target="_blank" rel="noopener noreferrer">
                                        Open {analysis.type === 'video' ? 'Video' : 'Deck'} <ExternalLink className="h-3 w-3" />
                                    </a>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Empty State */}
            {!loading && filteredAnalyses.length === 0 && (
                <div className="text-center py-12 text-muted-foreground bg-muted/30 rounded-lg">
                    <p>No analyses found matching your criteria.</p>
                </div>
            )}

            {/* Load More */}
            {hasMore && (
                <div className="flex justify-center pt-4">
                    <Button
                        variant="ghost"
                        onClick={() => fetchAnalyses(false)}
                        disabled={loading}
                    >
                        {loading ? "Loading..." : "Load More"}
                    </Button>
                </div>
            )}
        </div>
    )
}
