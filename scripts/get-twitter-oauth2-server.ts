
import { TwitterApi } from 'twitter-api-v2';
import dotenv from 'dotenv';
import http from 'http';
import url from 'url';

dotenv.config({ path: '.env.local' });

const clientId = process.env.TWITTER_CLIENT_ID;
const clientSecret = process.env.TWITTER_CLIENT_SECRET;

if (!clientId || !clientSecret) {
    console.error('Missing TWITTER_CLIENT_ID or TWITTER_CLIENT_SECRET');
    process.exit(1);
}

const client = new TwitterApi({ clientId, clientSecret });

async function main() {
    const server = http.createServer(async (req, res) => {
        try {
            const reqUrl = url.parse(req.url!, true);

            if (reqUrl.pathname === '/callback') {
                const { code, state: returnedState } = reqUrl.query;

                if (returnedState !== state) {
                    res.end('State mismatch. Security check failed.');
                    return;
                }

                console.log(`\n✅ Callback received! processing code...`);

                const { accessToken, refreshToken, expiresIn } = await client.loginWithOAuth2({
                    code: code as string,
                    codeVerifier,
                    redirectUri: 'http://127.0.0.1:3000/callback',
                });

                console.log('\n--- SUCCESS! Tokens Generated ---');
                console.log(`ACCESS_TOKEN=${accessToken}`);
                console.log(`REFRESH_TOKEN=${refreshToken}`);
                console.log(`EXPIRES_IN=${expiresIn}`);
                console.log('\n-------------------------------');
                console.log('You can now stop this script (Ctrl+C).');

                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<h1>Authentication Successful!</h1><p>You can close this window and check your terminal.</p>');

                // Cleanup
                server.close();
                process.exit(0);
            }
        } catch (e: any) {
            console.error('Login Failed:', e);
            res.writeHead(500);
            res.end('Authentication Failed check terminal.');
            server.close();
        }
    });

    server.listen(3000, () => {
        console.log('Temporary server listening on http://127.0.0.1:3000');
    });

    // Generate Auth Link
    const { url: authUrl, codeVerifier, state } = client.generateOAuth2AuthLink(
        'http://127.0.0.1:3000/callback',
        { scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'] }
    );

    console.log('\nPlease click the link below to authorize:');
    console.log(`\n[[[ ${authUrl} ]]]\n`);
}

main();
