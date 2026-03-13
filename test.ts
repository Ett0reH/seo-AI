import fetch from 'node-fetch';

async function test() {
  const res = await fetch('https://ais-pre-dg7ol2jaszqkfid4hnnl4x-101505322741.europe-west1.run.app/api/webhooks/wp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ test: true, siteId: 'test' })
  });
  console.log(res.status);
  console.log(await res.text());
}
test();
