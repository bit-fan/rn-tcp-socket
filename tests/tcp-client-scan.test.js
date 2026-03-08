import assert from 'assert';
import { TcpClient } from '../tcp-client.js';

const orig = TcpClient.connectHost;
TcpClient.connectHost = async (host, port, t) => ({ destroy: () => {} });

const results = [];
for await (const r of TcpClient.scanHostsYield({ ipPattern: '192.168.0.*', port: 1234, timeoutMs: 100 })) {
  results.push(r);
}

TcpClient.connectHost = orig;

assert.ok(results.length > 0, 'expected at least one yielded result');
assert.ok(results.every(r => typeof r.host === 'string' && typeof r.result === 'boolean'));

console.log('tcp-client-scan.test.js: OK');
