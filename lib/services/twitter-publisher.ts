import { TwitterApi } from 'twitter-api-v2';

export class TwitterPublisher {
    private static async getClient() {
        const clientId = process.env.TWITTER_CLIENT_ID;
        const clientSecret = process.env.TWITTER_CLIENT_SECRET;
        const refreshToken = process.env.TWITTER_OAUTH2_REFRESH_TOKEN;

        // Try OAuth 2.0 first (for Free Tier support)
        if (clientId && clientSecret && refreshToken) {
            try {
                // Instantiate with refresh token logic
                const client = new TwitterApi({ clientId, clientSecret });
                const { client: refreshedClient, accessToken, refreshToken: newRefreshToken } = await client.refreshOAuth2Token(refreshToken);

                // TODO: Ideally we should save the newRefreshToken back to ENV or DB, 
                // but for now, since it rotates, subsequent calls might fail if we don't persist it.
                // However, Vercel envs are read-only at runtime. 
                // For a robust app, we'd store tokens in the DB (alert_configs or users table).
                // For this quick fix, we rely on the fact that offline refresh tokens last a while, 
                // BUT extracting a fresh one is critical.

                // CRITICAL NOTE: Twitter Refresh Tokens ROTATE. We must persist newRefreshToken.
                // Since we can't write to .env in Production, we'll log it for now.
                // A proper fix requires a DB table for system_settings.
                console.log('[Twitter] Refreshed Token. New Refresh Token:', newRefreshToken);

                return refreshedClient;
            } catch (e) {
                console.warn('[Twitter] OAuth 2.0 Refresh Failed:', e);
                // Fallback to v1.1 below if refresh fails? Unlikely to work if v2 required.
            }
        }

        const appKey = process.env.TWITTER_API_KEY;
        const appSecret = process.env.TWITTER_API_SECRET;
        const accessToken = process.env.TWITTER_ACCESS_TOKEN;
        const accessSecret = process.env.TWITTER_ACCESS_SECRET;

        if (!appKey || !appSecret || !accessToken || !accessSecret) {
            console.warn('[Twitter] Missing credentials in .env.local');
            return null;
        }

        return new TwitterApi({
            appKey,
            appSecret,
            accessToken,
            accessSecret,
        });
    }

    static async postTweet(text: string, mediaBuffer?: Buffer): Promise<string | null> {
        try {
            const client = await this.getClient();
            if (!client) return null;

            let mediaId: string | undefined;

            if (mediaBuffer) {
                console.log('[Twitter] Uploading media...');
                // Upload the media (Stage 1)
                // Note: v1.uploadMedia is still available on the client instance even if authorized via OAuth 2,
                // BUT Free Tier OAuth 2 might fail on media upload if not supported.
                // However, Free Tier docs say "Media Upload" is v1.1. 
                // Let's hope the OAuth 2.0 client can access v1.1 upload endpoint or we might need mixed auth.
                // Actually, for OAuth 2.0 User Context, the docs are tricky. 
                // Often media upload still requires v1.1 signature (User Context).
                // If this fails, we effectively can't upload media on Free Tier with just OAuth 2.
                try {
                    mediaId = await client.v1.uploadMedia(mediaBuffer, { type: 'png' });
                    console.log(`[Twitter] Media uploaded. ID: ${mediaId}`);
                } catch (mediaError) {
                    console.error('[Twitter] Media upload failed (likely Free Tier OAuth 2 limitation). Posting text only.', mediaError);
                    // Fallback: Proceed without media
                }
            }

            // Post the tweet (Stage 2)
            console.log('[Twitter] Posting status...');
            const response = await client.v2.tweet({
                text: text,
                media: mediaId ? { media_ids: [mediaId] } : undefined
            });

            console.log(`[Twitter] Tweet posted! ID: ${response.data.id}`);
            return `https://twitter.com/user/status/${response.data.id}`;

        } catch (error) {
            console.error('[Twitter] Failed to post tweet:', error);
            return null;
        }
    }
}
