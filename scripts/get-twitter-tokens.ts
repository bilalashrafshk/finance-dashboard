
import { TwitterApi } from 'twitter-api-v2';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config({ path: '.env.local' });

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const appKey = process.env.TWITTER_API_KEY;
const appSecret = process.env.TWITTER_API_SECRET;

if (!appKey || !appSecret) {
    console.error('Missing TWITTER_API_KEY or TWITTER_API_SECRET in .env.local');
    process.exit(1);
}

// Instantiate with app credentials
const client = new TwitterApi({
    appKey,
    appSecret,
});

async function getTokens() {
    try {
        console.log("DEBUG: Keys present?", !!appKey, !!appSecret);

        // Generate auth link
        const authLink = await client.generateAuthLink('oob');

        console.log('DEBUG: Auth Object:', JSON.stringify(authLink, null, 2));

        console.log('\nPlease go to the following URL to authorize the app:\n');
        console.log(`[[[ ${authLink.url} ]]]`);
        console.log('\n');

        rl.question('Enter the PIN provided by Twitter: ', async (pin) => {
            try {
                // IMPORTANT: Construct a client with the temporary Request Tokens
                const tempClient = new TwitterApi({
                    appKey,
                    appSecret,
                    accessToken: authLink.oauth_token,
                    accessSecret: authLink.oauth_token_secret,
                });

                const { client: loggedClient, accessToken, accessSecret, screenName, userId } = await tempClient.login(pin);

                console.log('\n--- SUCCESS! ---');
                console.log(`Logged in as @${screenName} (ID: ${userId})`);
                console.log('\nAdd these lines to your .env.local file:\n');
                console.log(`TWITTER_ACCESS_TOKEN=${accessToken}`);
                console.log(`TWITTER_ACCESS_SECRET=${accessSecret}`);
                console.log('\n----------------\n');
            } catch (e: any) {
                console.error('Error during login:', e.message);
            } finally {
                rl.close();
            }
        });

    } catch (e: any) {
        console.error("FATAL ERROR:", e);
        rl.close();
    }
}

getTokens();
