import assert from 'assert';
import { TcpClient } from '../tcp-client.js';

export async function run() {
  // _handleData partial + combined messages
  const received = [];
  const c = new TcpClient('127.0.0.1', 12345, msg => received.push(msg));

  // simulate split JSON across two chunks
  const raw = JSON.stringify({ hi: 'there' });
  const part1 = raw.slice(0, 4);
  const part2 = raw.slice(4) + '\n';
  c._handleData(Buffer.from(part1));
  assert.strictEqual(received.length, 0);
  c._handleData(Buffer.from(part2));
  assert.strictEqual(received.length, 1);
  assert.deepStrictEqual(received[0], { hi: 'there' });

  // test send() uses sendJson: mock the client socket
  let written = null;
  c.client = { write: (s, _opts, cb) => { written = s; if (typeof cb === 'function') cb(); }, destroy: () => {} };
  const ok = c.send({ ping: 1 }, true);
  assert.strictEqual(ok, true);
  assert.strictEqual(written, JSON.stringify({ ping: 1 }) + '\n');

  // test destroy clears client
  c.destroy();
  assert.strictEqual(c.client, null);

  // test scanHostsYield with mocked connectHost
  const orig = TcpClient.connectHost;
  let mockCalls = 0;
  TcpClient.connectHost = async (host, port, t) => {
    mockCalls++;
    if (host.endsWith('.5')) { console.log('mock success for', host); return { mock: true }; }
    throw new Error('no');
  };
  const foundHosts = [];
  for await (const r of TcpClient.scanHostsYield({ prefix: '192.168.0.*', port: 1234, concurrency: 10, timeoutMs: 2000 })) {
    if (r.result) foundHosts.push(r.host);
  }
  // restore
  TcpClient.connectHost = orig;
  // Ensure the generator attempted all hosts
  assert.strictEqual(mockCalls, 256);

  console.log('tcp-client.test.js: OK');
}
