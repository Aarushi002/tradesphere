import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { KiteConnect } from 'kiteconnect';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const apiKey = (process.env.KITE_API_KEY || '').trim();
const apiSecret = (process.env.KITE_API_SECRET || '').trim();
const requestToken = (process.argv[2] || '').trim();

if (!apiKey || !apiSecret || !requestToken) {
  console.error('Usage: node scripts/getKiteAccessToken.js <request_token>');
  console.error('Ensure backend/.env has: KITE_API_KEY=... and KITE_API_SECRET=... (no quotes, no spaces around =)');
  process.exit(1);
}

const kc = new KiteConnect({ api_key: apiKey });

kc.generateSession(requestToken, apiSecret)
  .then((session) => {
    console.log('access_token:', session.access_token);
    console.log('public_token:', session.public_token);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Error generating session:', err?.message || err);
    if (String(err?.message || err).includes('api_key') || String(err?.data || '').includes('api_key')) {
      console.error('\nTip: Use the API KEY from Kite (not the secret). In .env use: KITE_API_KEY=your_key and KITE_API_SECRET=your_secret. No quotes, no spaces.');
    }
    process.exit(1);
  });