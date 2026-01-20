import { TwitterApi } from 'twitter-api-v2';

export class TwitterPublisher {
    private static getClient() {
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
            const client = this.getClient();
            if (!client) return null;

            let mediaId: string | undefined;

            if (mediaBuffer) {
                console.log('[Twitter] Uploading media...');
                // Upload the media (Stage 1)
                mediaId = await client.v1.uploadMedia(mediaBuffer, { type: 'png' });
                console.log(`[Twitter] Media uploaded. ID: ${mediaId}`);
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
