import assert from 'assert';
import net from 'net';
import { TcpClient } from '../tcp-client.js';

// Integration test: attempt real TCP connects to 192.168.1.*:12345
// Requires a reachable server at 192.168.1.8:12345. This test will be skipped
// (fail fast) if the environment can't perform raw TCP connects.

function nodeConnectHost(host, port, timeoutMs = 500) {
  return new Promise((resolve, reject) => {
    const sock = new net.Socket();
    let settled = false;
    const cleanup = () => {
      try { sock.removeAllListeners(); } catch (_) {}
    };
    sock.setTimeout(timeoutMs, () => {
      if (settled) return;
      settled = true;
      try { sock.destroy(); } catch (_) {}
      cleanup();
      reject(new Error('connect timeout'));
    });
    sock.once('error', (err) => {
      if (settled) return;
      settled = true;
      try { sock.destroy(); } catch (_) {}
      cleanup();
      reject(err);
    });
    sock.once('connect', () => {
      if (settled) return;
      settled = true;
      // return the socket so caller can destroy
      cleanup();
      resolve(sock);
    });
    try {
      sock.connect({ host, port });
    } catch (e) {
      cleanup();
      reject(e);
    }
  });
}

export async function run() {
  // Temporarily replace TcpClient.connectHost to use Node net for real network tests
  const orig = TcpClient.connectHost;
  TcpClient.connectHost = nodeConnectHost;

  const positives = [];
  const negatives = [];

  // scan the /24 (this may take time depending on timeouts)
  for await (const r of TcpClient.scanHostsYield({ prefix: '192.168.1.*', port: 12345, concurrency: 50, timeoutMs: 500 })) {
    if (r.result) positives.push(r.host);
    else negatives.push(r.host);
  }

  // restore
  TcpClient.connectHost = orig;

  // Expect all failed except 192.168.1.8
  assert.ok(positives.length >= 1, 'expected at least one positive (the server)');
  assert.ok(positives.includes('192.168.1.8'), `expected 192.168.1.8 to be reported positive, got ${positives}`);
  // confirm negatives array contains something (sanity)
  assert.ok(negatives.length > 0, 'expected some negative results');

  console.log('tcp-client-integration.test.js: OK (positives)', positives);
}
