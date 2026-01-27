"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Video, FileText, ExternalLink, Calendar } from "lucide-react"
import { format } from "date-fns"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"

interface Analysis {
    id: number
    symbol: string
    url: string
    title: string
    type: 'video' | 'presentation'
    thought: 'buy' | 'sell' | 'watch' | 'hold'
    remarks: string
    analysis_date: string
    created_at: string
}

interface Props {
    symbol: string
}

export function AssetAnalysisTab({ symbol }: Props) {
    const { user } = useAuth()
    const isAdmin = user?.role === 'admin'

    const [analyses, setAnalyses] = useState<Analysis[]>([])
    const [loading, setLoading] = useState(true)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    // Form state
    const [formData, setFormData] = useState({
        url: '',
        title: '',
        type: 'video',
        thought: 'watch',
        remarks: '',
        analysis_date: format(new Date(), 'yyyy-MM-dd')
    })

    const fetchAnalyses = async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/asset-analyses?symbol=${encodeURIComponent(symbol)}`)
            if (res.ok) {
                const data = await res.json()
                setAnalyses(data.analyses || [])
            }
        } catch (error) {
            console.error('Failed to fetch analyses', error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchAnalyses()
    }, [symbol])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!isAdmin) return

        setSubmitting(true)
        try {
            const res = await fetch('/api/asset-analyses', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}` // Ensure we pass the token if using middleware checking headers
                },
                body: JSON.stringify({
                    symbol,
                    ...formData,
                    analysis_date: new Date(formData.analysis_date).toISOString()
                })
            })

            if (res.ok) {
                toast.success('Analysis added successfully')
                setIsDialogOpen(false)
                setFormData({
                    url: '',
                    title: '',
                    type: 'video',
                    thought: 'watch',
                    remarks: '',
                    analysis_date: format(new Date(), 'yyyy-MM-dd')
                })
                fetchAnalyses()
            } else {
                toast.error('Failed to add analysis')
            }
        } catch (error) {
            console.error(error)
            toast.error('An error occurred')
        } finally {
            setSubmitting(false)
        }
    }

    const getThoughtColor = (thought: string) => {
        switch (thought) {
            case 'buy': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800'
            case 'sell': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800'
            case 'hold': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800'
            default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700'
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Analyses & Thoughts</h3>
                {isAdmin && (
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm" className="gap-2">
                                <Plus className="h-4 w-4" />
                                Add Analysis
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Add New Analysis</DialogTitle>
                                <DialogDescription>
                                    Add a video or presentation link with your thoughts.
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleSubmit} className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="title">Title</Label>
                                    <Input
                                        id="title"
                                        value={formData.title}
                                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                        required
                                        placeholder="e.g., Q2 Earnings Review"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="type">Type</Label>
                                        <Select
                                            value={formData.type}
                                            onValueChange={(val: any) => setFormData({ ...formData, type: val })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="video">Video</SelectItem>
                                                <SelectItem value="presentation">Presentation</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="thought">Thought</Label>
                                        <Select
                                            value={formData.thought}
                                            onValueChange={(val: any) => setFormData({ ...formData, thought: val })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="buy">Buy</SelectItem>
                                                <SelectItem value="sell">Sell</SelectItem>
                                                <SelectItem value="hold">Hold</SelectItem>
                                                <SelectItem value="watch">Watch</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="url">URL</Label>
                                    <Input
                                        id="url"
                                        value={formData.url}
                                        onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                                        required
                                        placeholder="https://..."
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="date">Date</Label>
                                    <Input
                                        id="date"
                                        type="date"
                                        value={formData.analysis_date}
                                        onChange={(e) => setFormData({ ...formData, analysis_date: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="remarks">Remarks</Label>
                                    <Textarea
                                        id="remarks"
                                        value={formData.remarks}
                                        onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                                        placeholder="Key takeaways..."
                                        rows={3}
                                    />
                                </div>

                                <DialogFooter>
                                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                                    <Button type="submit" disabled={submitting}>
                                        {submitting ? 'Saving...' : 'Save Analysis'}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                )}
            </div>

            {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading analyses...</div>
            ) : analyses.length === 0 ? (
                <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                        No analyses available for this asset yet.
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2">
                    {analyses.map((analysis) => (
                        <Card key={analysis.id} className="overflow-hidden">
                            <CardHeader className="pb-2">
                                <div className="flex justify-between items-start gap-2">
                                    <div className="space-y-1">
                                        <CardTitle className="text-base line-clamp-1">{analysis.title}</CardTitle>
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1">
                                                <Calendar className="h-3 w-3" />
                                                {format(new Date(analysis.analysis_date), 'MMM d, yyyy')}
                                            </span>
                                            <span>•</span>
                                            <span className="flex items-center gap-1 capitalize">
                                                {analysis.type === 'video' ? <Video className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                                                {analysis.type}
                                            </span>
                                        </div>
                                    </div>
                                    <Badge variant="outline" className={`${getThoughtColor(analysis.thought)} uppercase text-[10px]`}>
                                        {analysis.thought}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {analysis.remarks && (
                                    <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                                        {analysis.remarks}
                                    </p>
                                )}
                                <Button variant="outline" size="sm" className="w-full gap-2" asChild>
                                    <a href={analysis.url} target="_blank" rel="noopener noreferrer">
                                        Open {analysis.type} <ExternalLink className="h-3 w-3" />
                                    </a>
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
