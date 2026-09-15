const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'tcp-socket', 'TcpSocketPlugin.java');
const dest = path.join(
  __dirname,
  '..',
  'node_modules',
  'capacitor-tcp-socket',
  'android',
  'src',
  'main',
  'java',
  'com',
  'svend',
  'plugins',
  'tcp',
  'socket',
  'TcpSocketPlugin.java',
);

if (!fs.existsSync(src)) {
  console.warn('tcp-socket timeout patch source missing:', src);
  process.exit(0);
}
if (!fs.existsSync(path.dirname(dest))) {
  console.warn('capacitor-tcp-socket not installed; skip timeout patch');
  process.exit(0);
}
fs.copyFileSync(src, dest);
console.log('Applied TcpSocket connect timeout patch');
