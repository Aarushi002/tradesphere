import dotenv from 'dotenv';
import { KiteConnect } from 'kiteconnect';

dotenv.config();

const apiKey = process.env.KITE_API_KEY;
const apiSecret = process.env.KITE_API_SECRET;
const requestToken = process.argv[2];

if (!apiKey || !apiSecret || !requestToken) {
  console.error('Usage: node scripts/getKiteAccessToken.js <request_token>');
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
    console.error('Error generating session:', err);
    process.exit(1);
  });