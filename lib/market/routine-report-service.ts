import { MarketHeatmapService } from './heatmap-service';
import { sendDiscordNotification, DiscordEmbed, getWebhookFromDB } from '@/lib/notifications/discord';

export class RoutineReportService {
    /**
     * Determines the market mood based on index performance
     */
    private static getMarketMood(changePercent: number) {
        if (changePercent > 0.5) return { text: 'Ends on a Bullish Note', emoji: '🚀' };
        if (changePercent > 0) return { text: 'Closes in the Green', emoji: '📈' };
        if (changePercent < -0.5) return { text: 'Faces Significant Pressure', emoji: '📉' };
        if (changePercent < 0) return { text: 'Dips Slightly', emoji: '🔻' };
        return { text: 'Remains Flat', emoji: '⚖️' };
    }

    /**
     * Formats volume numbers (e.g. 1500000 -> 1.5M)
     */
    private static formatVolume(vol: number): string {
        if (vol >= 1000000) return (vol / 1000000).toFixed(1) + 'M';
        if (vol >= 1000) return (vol / 1000).toFixed(1) + 'K';
        return vol.toString();
    }

    /**
     * Formats currency/value numbers (e.g. 1500000000 -> 1.5B)
     */
    private static formatCurrency(val: number): string {
        if (val >= 1000000000) return (val / 1000000000).toFixed(2) + 'B';
        if (val >= 1000000) return (val / 1000000).toFixed(2) + 'M';
        if (val >= 1000) return (val / 1000).toFixed(2) + 'K';
        return val.toFixed(2);
    }

    /**
     * Generates and pushes daily market recap and volume leaders to Discord
     */
    static async pushDailyReports(targetDate?: string) {
        const date = targetDate || await MarketHeatmapService.getLatestMarketDate();
        const data = await MarketHeatmapService.getHeatmapData(date, 1000, '1D');

        const fundamentalWebhook = await getWebhookFromDB('fundamental_webhook_url');

        // 1. PUSH DAILY RECAP
        const index = data.indices.find(i => i.name === 'KSE-100');
        const mood = index ? this.getMarketMood(index.changePercent) : { text: 'Market Update', emoji: '📊' };

        // RECAP: Filter for Top 100 stocks
        const allStocks = data.stocks;
        const top100Stocks = allStocks.slice(0, 100);

        const gainers = top100Stocks.filter(s => (s.changePercent || 0) > 0);
        const losers = top100Stocks.filter(s => (s.changePercent || 0) < 0).reverse();
        const neutral = top100Stocks.filter(s => (s.changePercent || 0) === 0);

        const topGainers = [...gainers].sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0)).slice(0, 5);
        const topLosers = [...losers].sort((a, b) => (a.changePercent || 0) - (b.changePercent || 0)).slice(0, 5);

        // Recalculate sectors for Top 100 only using shared logic
        const top100Sectors = MarketHeatmapService.calculateSectorPerformance(top100Stocks);

        const recapEmbed: DiscordEmbed = {
            title: `Karachi 100 ${mood.text} ${mood.emoji} | ${date}`,
            description: `A snapshot of today's market session.`,
            color: index && index.change >= 0 ? 3066993 : 15158332,
            fields: [
                {
                    name: '📉 KSE-100 Index',
                    value: index
                        ? `**${index.price.toLocaleString()}** (${index.change >= 0 ? '+' : ''}${index.change.toFixed(2)} | ${index.changePercent.toFixed(2)}%)`
                        : 'Data unavailable',
                    inline: false
                },
                {
                    name: '⚖️ Market Breadth',
                    value: `🟢 Gains: **${gainers.length}**\n🔴 Losers: **${losers.length}**\n⚪ Neutral: **${neutral.length}**`,
                    inline: true
                },
                {
                    name: '🚀 Top Gainers',
                    value: topGainers.map(s => `**${s.symbol}**: +${s.changePercent?.toFixed(2)}%`).join('\n') || 'None',
                    inline: true
                },
                {
                    name: '🔻 Top Losers',
                    value: topLosers.map(s => `**${s.symbol}**: ${s.changePercent?.toFixed(2)}%`).join('\n') || 'None',
                    inline: true
                },
                {
                    name: '🏆 Best Sectors',
                    value: top100Sectors.slice(0, 3).map(s => `${s.name}: **+${s.change.toFixed(2)}%**`).join('\n'),
                    inline: true
                },
                {
                    name: '😨 Worst Sectors',
                    value: top100Sectors.slice(-3).reverse().map(s => `${s.name}: **${s.change.toFixed(2)}%**`).join('\n'),
                    inline: true
                }
            ],
            footer: { text: 'Risk Metric Dashboard • Daily Pulse' },
            timestamp: new Date().toISOString()
        };

        const sent1 = await sendDiscordNotification({ embeds: [recapEmbed] }, false, fundamentalWebhook || undefined);
        if (!sent1) throw new Error("Failed to send Daily Recap embed");

        // 2. PUSH VALUE TRADED LEADERS (Liquidity)
        const valueLeaders = allStocks
            .map(s => ({ ...s, valueTraded: s.volume * s.price }))
            .sort((a, b) => b.valueTraded - a.valueTraded)
            .slice(0, 10);

        const volEmbed: DiscordEmbed = {
            title: `🌊 Liquidity Watch: Value Traded | ${date}`,
            description: `The top 10 stocks by value traded (Volume × Price) today.`,
            color: 3447003, // Blue
            fields: valueLeaders.map(s => ({
                name: `${s.symbol}`,
                value: `Value: **Rs ${this.formatCurrency(s.valueTraded)}**\nPrice: **${s.price.toFixed(2)}** (${(s.changePercent || 0) >= 0 ? '+' : ''}${s.changePercent?.toFixed(2)}%)`,
                inline: true
            })),
            footer: { text: 'Risk Metric Dashboard • Liquidity Analysis' },
            timestamp: new Date().toISOString()
        };

        const sent2 = await sendDiscordNotification({ embeds: [volEmbed] }, false, fundamentalWebhook || undefined);
        if (!sent2) throw new Error("Failed to send Liquidity Watch embed");
    }

    /**
     * Generates raw data for the Tweet Tool UI
     */
    static async generateRecapData(targetDate?: string) {
        const date = targetDate || await MarketHeatmapService.getLatestMarketDate();
        const data = await MarketHeatmapService.getHeatmapData(date, 1000, '1D');
        const index = data.indices.find(i => i.name === 'KSE-100');
        const top100Stocks = data.stocks.slice(0, 100);

        const gainers = top100Stocks.filter(s => (s.changePercent || 0) > 0);
        const losers = top100Stocks.filter(s => (s.changePercent || 0) < 0);
        const topGainers = [...gainers].sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0)).slice(0, 5);
        const topLosers = [...losers].sort((a, b) => (a.changePercent || 0) - (b.changePercent || 0)).slice(0, 5);

        const valueLeaders = data.stocks
            .map(s => ({ ...s, valueTraded: s.volume * s.price }))
            .sort((a, b) => b.valueTraded - a.valueTraded)
            .slice(0, 5);

        return {
            date,
            index,
            breadth: {
                gainers: gainers.length,
                losers: losers.length,
                neutral: top100Stocks.length - gainers.length - losers.length
            },
            topGainers,
            topLosers,
            valueLeaders,
            sectors: MarketHeatmapService.calculateSectorPerformance(top100Stocks)
        };
    }
}
