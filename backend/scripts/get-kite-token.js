import crypto from 'crypto';
import https from 'https';
import querystring from 'querystring';

const apiKey = process.env.KITE_API_KEY || 'zrnu2535kxtcplwd';
const apiSecret = process.env.KITE_API_SECRET || 'v92g7tyclioqq9kr64odbkv90hmposlg';
const requestToken = process.argv[2];

if (!requestToken) {
  console.log('Usage: node get-kite-token.js <request_token>');
  console.log('Example: node get-kite-token.js IzBpSmvRHVYr4SSBCaoAn9Ouqj9hClnC');
  console.log('');
  console.log('Get request_token from the redirect URL after logging in at:');
  console.log('https://kite.zerodha.com/connect/login?v=3&api_key=' + apiKey);
  process.exit(1);
}

const checksum = crypto.createHash('sha256').update(apiKey + requestToken + apiSecret).digest('hex');
const body = querystring.stringify({
  api_key: apiKey,
  request_token: requestToken,
  checksum,
});

const req = https.request(
  {
    hostname: 'api.kite.trade',
    path: '/session/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
      'X-Kite-Version': '3',
    },
  },
  (res) => {
    let data = '';
    res.on('data', (chunk) => (data += chunk));
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        const token = json.data?.access_token || json.access_token;
        if (token) {
          console.log('Access token:', token);
          console.log('');
          console.log('Add to backend/.env:');
          console.log('KITE_ACCESS_TOKEN=' + token);
        } else {
          console.error('Error:', json);
        }
      } catch (e) {
        console.error('Parse error:', e.message);
        console.error('Response:', data);
      }
    });
  }
);
req.on('error', (e) => console.error('Request error:', e.message));
req.write(body);
req.end();
