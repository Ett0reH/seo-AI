import https from 'https';

const req = https.request('https://www.mandaladacolorare.it/wp-json/saas-ai-seo/v1/update-layer', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'Mozilla/5.0'
  }
}, (res) => {
  console.log('Status:', res.statusCode);
  console.log('Headers:', res.headers);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Body:', data));
});

req.on('error', e => console.error(e));
req.write('payload={}');
req.end();
