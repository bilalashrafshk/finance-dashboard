
import { TwitterApi } from 'twitter-api-v2';
import dotenv from 'dotenv';
import fs from 'fs';
import readline from 'readline';

dotenv.config({ path: '.env.local' });

const clientId = process.env.TWITTER_CLIENT_ID;
const clientSecret = process.env.TWITTER_CLIENT_SECRET;
const STATE_FILE = 'oauth_temp_state.json';

if (!clientId || !clientSecret) {
    console.error('Missing TWITTER_CLIENT_ID or TWITTER_CLIENT_SECRET');
    process.exit(1);
}

const client = new TwitterApi({ clientId, clientSecret });

async function main() {
    const args = process.argv.slice(2);

    if (args[0] === 'generate') {
        const { url, codeVerifier, state } = client.generateOAuth2AuthLink(
            'http://127.0.0.1:3000/callback',
            { scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'] }
        );

        fs.writeFileSync(STATE_FILE, JSON.stringify({ codeVerifier, state }));

        console.log('AUTHORIZATION_URL_START');
        console.log(url);
        console.log('AUTHORIZATION_URL_END');

    } else if (args[0] === 'resume') {
        if (!fs.existsSync(STATE_FILE)) {
            console.error('No state file found. Run "generate" first.');
            process.exit(1);
        }

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question('Paste full redirect URL (even if it says connection failed): ', async (input) => {
            const { codeVerifier, state } = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));

            try {
                let code: string | null = null;
                let inputTrimmed = input.trim();

                if (inputTrimmed.startsWith('http')) {
                    try {
                        const urlObj = new URL(inputTrimmed);
                        code = urlObj.searchParams.get('code');
                        const returnedState = urlObj.searchParams.get('state');
                        if (returnedState && returnedState !== state) {
                            console.warn(`⚠️ State mismatch in URL! Expected ${state}, got ${returnedState}`);
                            // We might continue if user insists, but it's risky. For now, let's allow if code is present.
                        }
                    } catch (e) {
                        console.error('Error parsing URL:', e);
                    }
                } else {
                    // Assume raw code
                    code = inputTrimmed;
                }

                if (!code) throw new Error('Could not extract code from input');

                console.log(`DEBUG: Extracted Code (first 10 chars): ${code.substring(0, 10)}...`);
                console.log(`DEBUG: Extracted Code (last 10 chars): ...${code.substring(code.length - 10)}`);
                console.log(`DEBUG: Code Length: ${code.length}`);

                const { accessToken, refreshToken } = await client.loginWithOAuth2({
                    code,
                    codeVerifier,
                    redirectUri: 'http://127.0.0.1:3000/callback',
                });

                console.log('\n✅ SUCCESS!');
                console.log(`TWITTER_OAUTH2_ACCESS_TOKEN=${accessToken}`);
                console.log(`TWITTER_OAUTH2_REFRESH_TOKEN=${refreshToken}`);

                // Cleanup
                fs.unlinkSync(STATE_FILE);

            } catch (e: any) {
                console.error('Login Failed:', e.message || e);
                if (e.data) {
                    console.error('Error Data:', JSON.stringify(e.data, null, 2));
                }
            } finally {
                rl.close();
            }
        });
    } else {
        console.log('Usage: script <generate|resume>');
    }
}

main();
