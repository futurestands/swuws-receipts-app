const dns = require('dns');

const host = 'aws-0-eu-west-1.pooler.supabase.com';

console.log('Testing DNS resolution for:', host);

dns.lookup(host, (err, address, family) => {
  if (err) {
    console.error('dns.lookup failed:', err);
  } else {
    console.log('dns.lookup address:', address, 'family:', family);
  }
});

dns.resolve4(host, (err, addresses) => {
  if (err) {
    console.error('dns.resolve4 failed:', err);
  } else {
    console.log('dns.resolve4 addresses:', addresses);
  }
});
