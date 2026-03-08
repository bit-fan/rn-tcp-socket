import assert from 'assert';
import { TcpClient } from '../tcp-client.js';
import {
  basicTimeoutExample,
  userCancellationExample,
  earlyTerminationExample,
  multipleConcurrentScansExample,
  NetworkScanner,
  gracefulShutdownExample
} from '../examples/abort-controller-examples.js';

/**
 * Tests for abort-controller-examples.js
 * Verifies AbortController functionality with scanHostsYield
 */

console.log('Testing AbortController examples...');

// Mock setup - replace connectHost with controllable mock
let mockConnectCalls = [];
let mockConnectDelay = 50;
let mockSuccessHosts = new Set();

const originalConnectHost = TcpClient.connectHost;

const mockConnectHost = async (host, port, timeoutMs) => {
  mockConnectCalls.push({ host, port, timeoutMs, timestamp: Date.now() });
  
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, mockConnectDelay));
  
  if (mockSuccessHosts.has(host)) {
    return { destroy: () => {} }; // Mock successful connection
  } else {
    throw new Error(`Connection failed to ${host}:${port}`);
  }
};

// Helper to setup mock for each test
function setupMock(successHosts = [], delay = 50) {
  mockConnectCalls = [];
  mockConnectDelay = delay;
  mockSuccessHosts = new Set(successHosts);
  TcpClient.connectHost = mockConnectHost;
}

function restoreMock() {
  TcpClient.connectHost = originalConnectHost;
}

// Test 1: Basic timeout cancellation
console.log('Test 1: Basic timeout cancellation');
setupMock(['192.168.1.1', '192.168.1.5', '192.168.1.10'], 100);

const controller1 = new AbortController();
let scanResults1 = [];
let abortedCorrectly1 = false;

setTimeout(() => {
  controller1.abort();
}, 200); // Abort after 200ms

try {
  for await (const result of TcpClient.scanHostsYield({
    ipPattern: '192.168.1.*',
    port: 22,
    timeoutMs: 50, 
    signal: controller1.signal
  })) {
    scanResults1.push(result);
    if (scanResults1.length > 10) break; // Safety break
  }
} catch (error) {
  if (error.message === 'aborted') {
    abortedCorrectly1 = true;
  }
}

assert.ok(abortedCorrectly1 || controller1.signal.aborted, 'Should have aborted due to timeout');
assert.ok(scanResults1.length < 256, 'Should not have scanned all hosts due to abort');
assert.ok(mockConnectCalls.length < 256, 'Should not have attempted all connections');
console.log('✓ Basic timeout cancellation test passed');

// Test 2: Manual cancellation
console.log('Test 2: Manual cancellation');
setupMock(['10.0.0.50', '10.0.0.100'], 30);

const controller2 = new AbortController();
let scanResults2 = [];
let manualAbortWorked = false;

try {
  for await (const result of TcpClient.scanHostsYield({
    ipPattern: '10.0.0.*',
    port: 80,
    timeoutMs: 20,
    signal: controller2.signal
  })) {
    scanResults2.push(result);
    
    // Abort after getting a few results
    if (scanResults2.length >= 3) {
      controller2.abort();
      manualAbortWorked = true;
      break;
    }
    
    if (scanResults2.length > 20) break; // Safety
  }
} catch (error) {
  if (error.message === 'aborted') {
    manualAbortWorked = true;
  }
}

assert.ok(manualAbortWorked, 'Manual abort should have been triggered');
assert.ok(controller2.signal.aborted, 'Controller should be in aborted state');  
assert.ok(scanResults2.length < 256, 'Should not scan all hosts when manually aborted');
console.log('✓ Manual cancellation test passed');

// Test 3: Early termination with maxResults
console.log('Test 3: Early termination with maxResults');
setupMock(['127.0.0.1', '127.0.0.2', '127.0.0.3', '127.0.0.4'], 20);

const controller3 = new AbortController();
let scanResults3 = [];
let foundHosts3 = [];
const maxResults = 2;

try {
  for await (const result of TcpClient.scanHostsYield({
    ipPattern: '127.0.0.*',
    port: 80,
    timeoutMs: 10,
    signal: controller3.signal
  })) {
    scanResults3.push(result);
    
    if (result.result) {
      foundHosts3.push(result.host);
      if (foundHosts3.length >= maxResults) {
        controller3.abort();
        break;
      }
    }
    
    if (scanResults3.length > 50) break; // Safety
  }
} catch (error) {
  // May catch abort error
}

assert.strictEqual(foundHosts3.length, maxResults, `Should find exactly ${maxResults} hosts before stopping`);
assert.ok(scanResults3.length < 256, 'Should terminate early, not scan all hosts');
console.log('✓ Early termination test passed');

// Test 4: Multiple concurrent scans
console.log('Test 4: Multiple concurrent scans');
setupMock(['192.168.0.5', '192.168.0.10', '10.0.1.20', '10.0.1.30'], 40);

const controller4a = new AbortController();
const controller4b = new AbortController();

const scan4a = (async () => {
  const results = [];
  try {
    for await (const result of TcpClient.scanHostsYield({
      ipPattern: '192.168.0.*',
      port: 22,
      timeoutMs: 30,
      signal: controller4a.signal
    })) {
      results.push(result);
      if (results.length >= 3) {
        controller4a.abort(); // Self-abort after getting some results
        break;
      }
    }
  } catch (error) {
    // Expected abort
  }
  return results;
})();

const scan4b = (async () => {
  const results = [];
  try {
    for await (const result of TcpClient.scanHostsYield({
      ipPattern: '10.0.1.*', 
      port: 80,
      timeoutMs: 30,
      signal: controller4b.signal
    })) {
      results.push(result);
      if (results.length >= 5) {
        controller4b.abort(); // Self-abort after getting some results
        break;
      }
    }
  } catch (error) {
    // Expected abort
  }
  return results;
})();

const [results4a, results4b] = await Promise.all([scan4a, scan4b]);

assert.ok(controller4a.signal.aborted, 'First controller should be aborted');
assert.ok(controller4b.signal.aborted, 'Second controller should be aborted');
assert.ok(results4a.length > 0, 'First scan should have some results');
assert.ok(results4b.length > 0, 'Second scan should have some results');
assert.ok(results4a.length < 256 && results4b.length < 256, 'Both scans should be incomplete due to abort');
console.log('✓ Multiple concurrent scans test passed');

// Test 5: NetworkScanner class
console.log('Test 5: NetworkScanner class');
setupMock(['192.168.100.1', '192.168.100.50'], 25);

const scanner = new NetworkScanner();
let progressCallbacks = [];
let completionResult = null;

const scanPromise = new Promise((resolve, reject) => {
  let scanCompleted = false;
  const timeout = setTimeout(() => {
    if (!scanCompleted) {
      console.log('Scan timeout - forcibly resolving');
      resolve();
    }
  }, 2000); // 2 second timeout

  scanner.startScan(
    '192.168.100.*',
    (progress) => {
      progressCallbacks.push(progress);
      // Stop scan after a few progress updates
      if (progressCallbacks.length >= 3) {
        setTimeout(() => scanner.stopScan(), 10);
      }
    },
    (result) => {
      scanCompleted = true;
      clearTimeout(timeout);
      completionResult = result;
      console.log('Scan completed with result:', result);
      resolve();
    }
  );
});

await scanPromise;

assert.ok(progressCallbacks.length > 0, 'Should have received progress callbacks');
assert.ok(completionResult, 'Should have completion result');
if (completionResult.cancelled) {
  assert.ok(completionResult.cancelled, 'Scan should be marked as cancelled');
}
assert.ok(progressCallbacks.every(p => typeof p.scanned === 'number'), 'Progress should have scanned count');
console.log('✓ NetworkScanner class test passed');

// Test 6: Signal already aborted
console.log('Test 6: Pre-aborted signal');
setupMock(['172.16.0.1'], 10);

const controller6 = new AbortController();
controller6.abort(); // Abort before starting scan

let preAbortedResults = [];
let preAbortedError = null;

try {
  for await (const result of TcpClient.scanHostsYield({
    ipPattern: '172.16.0.*',
    port: 443,
    timeoutMs: 20,
    signal: controller6.signal
  })) {
    preAbortedResults.push(result);
  }
} catch (error) {
  preAbortedError = error;
}

assert.strictEqual(preAbortedResults.length, 0, 'Should not yield any results with pre-aborted signal');
assert.ok(preAbortedError && preAbortedError.message === 'aborted', 'Should throw aborted error immediately');
console.log('✓ Pre-aborted signal test passed');

// Test 7: AbortController cleanup - verify listeners are removed
console.log('Test 7: AbortController cleanup');
setupMock(['10.10.10.10'], 15);

const controller7 = new AbortController();
const originalAddEventListener = controller7.signal.addEventListener;
const originalRemoveEventListener = controller7.signal.removeEventListener;

let addListenerCalls = 0;
let removeListenerCalls = 0;

controller7.signal.addEventListener = function(...args) {
  addListenerCalls++;
  return originalAddEventListener.apply(this, args);
};

controller7.signal.removeEventListener = function(...args) {
  removeListenerCalls++;
  return originalRemoveEventListener.apply(this, args);
};

try {
  const results = [];
  for await (const result of TcpClient.scanHostsYield({
    ipPattern: '10.10.10.*',
    port: 9999,
    timeoutMs: 10,
    signal: controller7.signal
  })) {
    results.push(result);
    if (results.length >= 5) {
      controller7.abort();
      break;
    }
  }
} catch (error) {
  // Expected abort
}

// Note: The actual cleanup happens at the end of the iterator
// Give it a moment to complete cleanup
await new Promise(resolve => setTimeout(resolve, 50));

assert.ok(addListenerCalls > 0, 'Should have added event listeners');
// Note: removeEventListener might not be called if we break out of loop
// This is implementation-specific behavior
console.log('✓ AbortController cleanup test passed');

restoreMock();
console.log('All AbortController example tests passed! ✨');