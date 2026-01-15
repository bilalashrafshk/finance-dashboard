
/**
 * Discord Notification Service
 * Handles sending rich alerts to Discord via Webhooks
 */

export interface DiscordEmbed {
    title?: string;
    description?: string;
    color?: number;
    fields?: { name: string; value: string; inline?: boolean }[];
    timestamp?: string;
    footer?: { text: string; icon_url?: string };
    thumbnail?: { url: string };
}

export async function sendDiscordNotification(payload: { content?: string; embeds?: DiscordEmbed[] }, wait = false) {
    const baseUrl = process.env.DISCORD_WEBHOOK_URL;

    if (!baseUrl) {
        console.warn('⚠️  DISCORD_WEBHOOK_URL is not defined in environment variables. Skipping notification.');
        return null;
    }

    const webhookUrl = wait ? `${baseUrl}?wait=true` : baseUrl;

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Discord Webhook failed: ${response.status} ${response.statusText}`, errorText);
            return null;
        } else {
            console.log('✅ Discord notification sent successfully.');
            if (wait) {
                return await response.json();
            }
            return true;
        }
    } catch (error) {
        console.error('❌ Error sending Discord notification:', error);
        return null;
    }
}

/**
 * Specifically format and send a Market Event Alert
 */
export async function sendMarketEventAlert(event: {
    symbol: string;
    type: string;
    headline: string;
    price: number;
    prevValue: number;
}) {
    // Choose color based on event type
    // 52W High / ATH -> Green (3066993)
    // High Vol -> Blue (3447003)
    // Lows -> Red (15158332)
    const color = (event.type.includes('HIGH') || event.type.includes('ATH')) ? 3066993 : 3447003;

    const embed: DiscordEmbed = {
        title: `🚀 ${event.type}: $${event.symbol}`,
        description: event.headline,
        color: color,
        fields: [
            { name: 'Symbol', value: event.symbol, inline: true },
            { name: 'Event', value: event.type, inline: true },
            { name: 'Price', value: `Rs ${event.price.toFixed(2)}`, inline: true },
            { name: 'Prev High', value: `Rs ${event.prevValue.toFixed(2)}`, inline: true },
        ],
        timestamp: new Date().toISOString(),
        footer: {
            text: 'Risk Metric Dashboard Alerts',
        }
    };

    await sendDiscordNotification({ embeds: [embed] });
}
