"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Target, TrendingUp, AlertTriangle, BarChart3 } from "lucide-react"
import { RISK_THRESHOLDS, DEFAULT_RISK_WEIGHTS } from "@/lib/config/app.config"
import { METRIC_NAMES } from "@/lib/config/metric-names.config"

interface ChartExplanationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  chartType: "price" | "sval" | "ethbtc" | "srel" | "riskeq"
}

export function ChartExplanationDialog({ open, onOpenChange, chartType }: ChartExplanationDialogProps) {
  const getExplanation = () => {
    switch (chartType) {
      case "price":
        return {
          title: "ETH/USD Price Analysis",
          icon: <BarChart3 className="h-5 w-5" />,
          description: "ETH/USD price with fair value bands and statistical deviation bands",
          content: (
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">What it shows:</h4>
                <p className="text-sm text-muted-foreground">
                  This chart displays the ETH/USD price over time with fair value bands. The fair value is calculated
                  using a parametric log-regression model that assumes exponential growth in log space.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Bands:</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Fair Value</Badge>
                    <span className="text-muted-foreground">The parametric log-regression trendline</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">±1σ Bands</Badge>
                    <span className="text-muted-foreground">Parametric multiplier bands around fair value</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">±2σ Bands</Badge>
                    <span className="text-muted-foreground">Statistical regression bands (2 standard deviations)</span>
                  </div>
                </div>
              </div>
            </div>
          ),
        }
      case "sval":
        return {
          title: METRIC_NAMES.sVal.long,
          icon: <Target className="h-5 w-5" />,
          description: "Absolute valuation metric based on fair value bands",
          content: (
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">What it measures:</h4>
                <p className="text-sm text-muted-foreground">
                  {METRIC_NAMES.sVal.short} measures how overvalued or undervalued Ethereum is relative to its fair value trendline.
                  It uses percentile-based normalization to map z-scores to a [0,1] range.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">How it's calculated:</h4>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>Calculate log residuals: <code className="bg-muted px-1 rounded">residual = ln(price) - ln(fairValue)</code></li>
                  <li>Calculate z-scores: <code className="bg-muted px-1 rounded">z = residual / σ</code></li>
                  <li>Map to percentile rank in historical distribution (0-1 range)</li>
                </ol>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Interpretation:</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="default">0.0 - {RISK_THRESHOLDS.low}</Badge>
                    <span className="text-sm">Undervalued</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{RISK_THRESHOLDS.low} - {RISK_THRESHOLDS.high}</Badge>
                    <span className="text-sm">Fair Value</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">{RISK_THRESHOLDS.high} - 1.0</Badge>
                    <span className="text-sm">Overvalued</span>
                  </div>
                </div>
              </div>
            </div>
          ),
        }
      case "ethbtc":
        return {
          title: `ETH/BTC with ${METRIC_NAMES.sRel.short} Trendlines`,
          icon: <TrendingUp className="h-5 w-5" />,
          description: "ETH/BTC ratio with upper and lower trendlines based on historical peaks and troughs",
          content: (
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">What it shows:</h4>
                <p className="text-sm text-muted-foreground">
                  This chart displays the ETH/BTC ratio over time with trendlines fitted to historical peaks and troughs.
                  The trendlines help identify relative strength patterns.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Trendlines:</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">Upper Trendline</Badge>
                    <span className="text-muted-foreground">Fitted to historical peaks</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="default">Lower Trendline</Badge>
                    <span className="text-muted-foreground">Fitted to historical troughs</span>
                  </div>
                </div>
              </div>
            </div>
          ),
        }
      case "srel":
        return {
          title: METRIC_NAMES.sRel.long,
          icon: <TrendingUp className="h-5 w-5" />,
          description: "Relative risk to Bitcoin metric based on ETH/BTC trendlines",
          content: (
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">What it measures:</h4>
                <p className="text-sm text-muted-foreground">
                  {METRIC_NAMES.sRel.short} measures Ethereum's relative risk to Bitcoin. It indicates whether ETH is performing
                  strongly or weakly relative to BTC based on historical trendlines.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">How it's calculated:</h4>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>Detect peaks and troughs in ETH/BTC ratio</li>
                  <li>Fit trendlines to top extremes</li>
                  <li>Calculate position between upper and lower trendlines</li>
                  <li>Normalize to [0,1] range</li>
                </ol>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Interpretation:</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="default">0.0 - {RISK_THRESHOLDS.low}</Badge>
                    <span className="text-sm">Weak (underperforming BTC)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{RISK_THRESHOLDS.low} - {RISK_THRESHOLDS.high}</Badge>
                    <span className="text-sm">Neutral</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">{RISK_THRESHOLDS.high} - 1.0</Badge>
                    <span className="text-sm">Strong (outperforming BTC)</span>
                  </div>
                </div>
              </div>
            </div>
          ),
        }
      case "riskeq":
        return {
          title: "Risk_eq (Composite Risk Metric)",
          icon: <AlertTriangle className="h-5 w-5" />,
          description: "Equal-weighted composite of S_val and S_rel",
          content: (
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">What it measures:</h4>
                <p className="text-sm text-muted-foreground">
                  Risk_eq is a balanced composite risk metric that equally weights both {METRIC_NAMES.sVal.short}
                  and {METRIC_NAMES.sRel.short}. It provides a holistic view of Ethereum's risk profile.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">How it's calculated:</h4>
                <div className="bg-muted p-3 rounded-md">
                  <code className="text-sm">Risk_eq = {DEFAULT_RISK_WEIGHTS.sValWeight} × {METRIC_NAMES.sVal.short} + {DEFAULT_RISK_WEIGHTS.sRelWeight} × {METRIC_NAMES.sRel.short}</code>
                </div>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Interpretation:</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="default">0.0 - {RISK_THRESHOLDS.low}</Badge>
                    <span className="text-sm">Low Risk</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{RISK_THRESHOLDS.low} - {RISK_THRESHOLDS.high}</Badge>
                    <span className="text-sm">Medium Risk</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">{RISK_THRESHOLDS.high} - 1.0</Badge>
                    <span className="text-sm">High Risk</span>
                  </div>
                </div>
              </div>
            </div>
          ),
        }
    }
  }

  const explanation = getExplanation()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto w-[95vw] sm:w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            {explanation.icon}
            {explanation.title}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">{explanation.description}</DialogDescription>
        </DialogHeader>
        <div className="text-sm sm:text-base">
          {explanation.content}
        </div>
      </DialogContent>
    </Dialog>
  )
}


