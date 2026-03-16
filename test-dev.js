import https from 'https';

const req = https.request('https://ais-dev-dg7ol2jaszqkfid4hnnl4x-101505322741.europe-west1.run.app/api/webhooks/wp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0'
  }
}, (res) => {
  console.log('Status:', res.statusCode);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Body:', data));
});

req.on('error', e => console.error(e));
req.write('{"test":true,"siteId":"test"}');
req.end();
