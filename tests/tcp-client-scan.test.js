import assert from 'assert';
import { TcpClient } from '../tcp-client.js';

export async function run() {
  // Mock connectHost so all hosts succeed quickly
  const orig = TcpClient.connectHost;
  TcpClient.connectHost = async (host, port, t) => ({ destroy: () => {} });

  const results = [];
  for await (const r of TcpClient.scanHostsYield({ prefix: '192.168.0.*', port: 1234, concurrency: 50, timeoutMs: 100 })) {
    console.log('scan result:', r);
    results.push(r);
  }

  // restore
  TcpClient.connectHost = orig;

  // basic structural assertions: we received at least one result and each entry has expected shape
  assert.ok(results.length > 0, 'expected at least one yielded result');
  assert.ok(results.every(r => typeof r.host === 'string' && typeof r.result === 'boolean'));

  console.log('tcp-client-scan.test.js: OK');
}
