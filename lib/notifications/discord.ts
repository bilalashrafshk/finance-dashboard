
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

import { getPool } from '@/lib/db';

export async function getWebhookFromDB(key: string): Promise<string | null> {
    try {
        const pool = getPool();
        const { rows } = await pool.query('SELECT value FROM alert_configs WHERE key = $1', [key]);
        if (rows.length > 0) {
            const val = rows[0].value;
            return typeof val === 'string' ? val : JSON.stringify(val).replace(/^"|"$/g, '');
        }
    } catch (err) {
        console.error(`Error fetching webhook ${key} from DB:`, err);
    }
    return null;
}

export async function sendDiscordNotification(
    payload: { content?: string; embeds?: DiscordEmbed[] },
    wait = false,
    overrideWebhook?: string
) {
    let webhookUrl: string | undefined = overrideWebhook || (process.env.DISCORD_WEBHOOK_URL as string);

    if (!webhookUrl) {
        // Fallback to fundamental if technical/default not provided
        const dbUrl = await getWebhookFromDB('fundamental_webhook_url');
        webhookUrl = dbUrl || undefined;
    }

    if (!webhookUrl || webhookUrl === '""') {
        console.warn('⚠️  Discord Webhook URL is not defined. Skipping notification.');
        return null;
    }

    const finalUrl = wait ? `${webhookUrl}?wait=true` : webhookUrl;

    try {
        const response = await fetch(finalUrl, {
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
    const color = (event.type.includes('HIGH') || event.type.includes('ATH')) ? 3066993 : (event.type === 'VOLUME_SURGE' ? 3447003 : 3447003);

    const isVolume = event.type === 'VOLUME_SURGE';

    const embed: DiscordEmbed = {
        title: `${isVolume ? '📊' : '🚀'} ${event.type}: $${event.symbol}`,
        description: event.headline,
        color: color,
        fields: [
            { name: 'Symbol', value: event.symbol, inline: true },
            { name: 'Event', value: event.type, inline: true },
            {
                name: isVolume ? 'Current Volume' : 'Price',
                value: isVolume ? event.price.toLocaleString() : `Rs ${event.price.toFixed(2)}`,
                inline: true
            },
            {
                name: isVolume ? 'Average Vol (10D)' : 'Prev High',
                value: isVolume ? event.prevValue.toLocaleString() : `Rs ${event.prevValue.toFixed(2)}`,
                inline: true
            },
        ],
        timestamp: new Date().toISOString(),
        footer: {
            text: 'Risk Metric Dashboard Alerts',
        }
    };

    // Try to get technical webhook
    const techWebhook = await getWebhookFromDB('technical_webhook_url');
    await sendDiscordNotification({ embeds: [embed] }, false, techWebhook || undefined);
}
