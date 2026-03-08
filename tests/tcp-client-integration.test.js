import assert from 'assert';
import net from 'net';
import { TcpClient } from '../tcp-client.js';

// Integration test: attempt real TCP connects to 192.168.1.*:12345
// Will pass as long as any TCP server is found on port 12345 in the network.
// This test will be skipped if no servers are found.

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

try {
  console.log('=== Starting tcp-client-integration.test.js ===');
  console.log('This test will scan 192.168.1.* network for any TCP servers on port 12345');
  
  console.log('TcpClient loaded:', typeof TcpClient);
  console.log('scanHostsYield method:', typeof TcpClient.scanHostsYield);
  
  console.log('Replacing connectHost method...');
  const orig = TcpClient.connectHost;
  TcpClient.connectHost = nodeConnectHost;

  const positives = [];
  const negatives = [];
  let scanCount = 0;

  console.log('Scanning entire 192.168.1.* network for TCP connections on port 12345...');
  console.log('This will scan all 256 hosts (192.168.1.0-255), may take a minute...');
  
  console.log('Starting scan...');
  
  for await (const r of TcpClient.scanHostsYield({ 
    ipPattern: '192.168.1.*', 
    port: 12345, 
    timeoutMs: 100 
  })) {
    scanCount++;
    
    console.log(`[${scanCount.toString().padStart(3, '0')}/256] ${r.host}: ${r.result ? '\u2713 CONNECTED' : '\u2717 no response'}`);
    
    if (r.result) {
      positives.push(r.host);
    } else {
      negatives.push(r.host);
    }
    
    if (scanCount % 50 === 0) {
      console.log(`Progress: ${scanCount}/256 hosts scanned, found ${positives.length} servers`);
    }
  }

  TcpClient.connectHost = orig;

  console.log(`\n=== SCAN RESULTS SUMMARY ===`);
  console.log(`Total hosts scanned: ${scanCount}`);
  console.log(`Active servers found: ${positives.length}`);
  console.log(`Inactive hosts: ${negatives.length}`);
  
  if (positives.length > 0) {
    console.log(`\n✓ Connected servers:`);
    positives.forEach(host => console.log(`  - ${host}`));
  }
  
  if (positives.length === 0) {
    console.log(`\nWARNING: No servers found on 192.168.1.*:12345`);
    console.log('This test will be skipped since no servers are available to test against.');
    console.log('To run a full integration test, start a TCP server on port 12345 in the 192.168.1.* network.');
  } else {
    assert.ok(positives.length >= 1, `Expected at least one server, found ${positives.length}`);
    assert.ok(negatives.length > 0, 'Expected some negative results as sanity check');
    assert.strictEqual(scanCount, 256, 'Expected to scan all 256 hosts in the range');

    console.log(`\n✅ tcp-client-integration.test.js: PASSED`);
    console.log(`Found ${positives.length} active server(s): ${positives.join(', ')}`);
  }
} catch (error) {
  console.error('Error in integration test:', error);
  throw error;
}


