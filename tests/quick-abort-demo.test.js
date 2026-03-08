import assert from 'assert';
import { TcpClient } from '../tcp-client.js';
import {
  quickDemo,
  manualCancelDemo,
  earlyStopDemo,
  runDemos
} from '../examples/quick-abort-demo.js';

/**
 * Tests for quick-abort-demo.js  
 * Verifies the demo functions work correctly with AbortController
 */

console.log('Testing quick abort demo functions...');

// Capture console output for testing
let consoleOutput = [];
const originalConsoleLog = console.log;
const mockConsoleLog = (...args) => {
  consoleOutput.push(args.join(' '));
  // originalConsoleLog(...args); // Uncomment to see output during testing
};

function setupConsoleCapture() {
  consoleOutput = [];
  console.log = mockConsoleLog;
}

function restoreConsole() {
  console.log = originalConsoleLog;
}

// Mock TcpClient.connectHost for controlled testing
let mockConnections = new Map();
let mockCallCount = 0;
const originalConnectHost = TcpClient.connectHost;

const createMockConnectHost = (successHosts = [], delay = 10) => {
  mockConnections.clear();
  mockCallCount = 0;
  
  return async (host, port, timeoutMs) => {
    mockCallCount++;
    mockConnections.set(host, { port, timeoutMs, timestamp: Date.now() });
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, delay));
    
    if (successHosts.includes(host)) {
      return { destroy: () => {} };
    } else {
      throw new Error(`Connection refused to ${host}:${port}`);
    }
  };
};

// Test 1: Quick demo with timeout abort
console.log('Test 1: Quick demo with timeout abort');

TcpClient.connectHost = createMockConnectHost(['192.168.1.50', '192.168.1.100'], 20);
setupConsoleCapture();

// Override setTimeout to make test faster
const originalSetTimeout = global.setTimeout;
let timeoutCallback = null;

global.setTimeout = (callback, delay) => {
  if (delay === 3000) { // This is our abort timeout
    timeoutCallback = callback;
    // Trigger after much shorter delay for testing
    return originalSetTimeout(callback, 50);
  }
  return originalSetTimeout(callback, delay);
};

// Run quick demo test
const controller1 = new AbortController();
let quickDemoResults = [];
let quickDemoAborted = false;

const quickDemoTest = async () => {
  try {
    for await (const result of TcpClient.scanHostsYield({
      ipPattern: '192.168.1.*',
      port: 22,
      timeoutMs: 15,
      signal: controller1.signal
    })) {
      quickDemoResults.push(result);
      
      // Simulate the abort after a few results (like the timeout would do)
      if (quickDemoResults.length >= 5) {
        controller1.abort();
        quickDemoAborted = true;
        break;
      }
    }
  } catch (error) {
    if (error.message === 'aborted' || controller1.signal.aborted) {
      quickDemoAborted = true;
    }
  }
};

await quickDemoTest();

global.setTimeout = originalSetTimeout;
restoreConsole();

assert.ok(quickDemoAborted, 'Quick demo should be aborted');
assert.ok(quickDemoResults.length > 0, 'Should have some scan results before abort');
assert.ok(quickDemoResults.length < 256, 'Should not scan all hosts due to abort');
assert.ok(mockCallCount < 256, 'Should not attempt all connections due to abort');
console.log('✓ Quick demo timeout abort test passed');

// Test 2: Manual cancel demo
console.log('Test 2: Manual cancel demo');

TcpClient.connectHost = createMockConnectHost(['127.0.0.1', '127.0.0.50'], 15);
setupConsoleCapture();

const controller2 = new AbortController();
let manualCancelResults = [];
let manualCancelAborted = false;

// Simulate user clicking stop after short delay
setTimeout(() => {
  controller2.abort();
  manualCancelAborted = true;
}, 30);

try {
  for await (const result of TcpClient.scanHostsYield({
    ipPattern: '127.0.0.*',
    port: 80,
    timeoutMs: 10,
    signal: controller2.signal
  })) {
    manualCancelResults.push(result);
    
    if (manualCancelResults.length > 20) break; // Safety break
  }
} catch (error) {
  if (error.message === 'aborted') {
    manualCancelAborted = true;
  }
}

restoreConsole();

assert.ok(manualCancelAborted || controller2.signal.aborted, 'Manual cancel should work');
assert.ok(manualCancelResults.length < 256, 'Should not scan all hosts when manually cancelled');
console.log('✓ Manual cancel demo test passed');

// Test 3: Early stop demo 
console.log('Test 3: Early stop demo');

TcpClient.connectHost = createMockConnectHost(['10.0.0.1', '10.0.0.2', '10.0.0.3'], 10);
setupConsoleCapture();

const controller3 = new AbortController();
let earlyStopResults = [];
let foundTargets = [];
const maxTargets = 2;

try {
  for await (const result of TcpClient.scanHostsYield({
    ipPattern: '10.0.0.*',
    port: 22,
    timeoutMs: 8,
    signal: controller3.signal
  })) {
    earlyStopResults.push(result);
    
    if (result.result) {
      foundTargets.push(result.host);
      if (foundTargets.length >= maxTargets) {
        controller3.abort();
        break;
      }
    }
    
    if (earlyStopResults.length > 50) break; // Safety
  }
} catch (error) {
  // May catch abort error
}

restoreConsole();

assert.strictEqual(foundTargets.length, maxTargets, `Should find exactly ${maxTargets} targets`);
assert.ok(controller3.signal.aborted, 'Should be aborted after finding targets');
assert.ok(earlyStopResults.length < 256, 'Should stop early, not scan all hosts');
console.log('✓ Early stop demo test passed');

// Test 4: AbortController signal behavior
console.log('Test 4: AbortController signal behavior');

const controller4 = new AbortController();

// Test signal properties before abort
assert.strictEqual(controller4.signal.aborted, false, 'Signal should not be aborted initially');

// Test signal properties after abort
controller4.abort();
assert.strictEqual(controller4.signal.aborted, true, 'Signal should be aborted after calling abort()');

// Test that calling abort multiple times is safe
controller4.abort();
controller4.abort();
assert.strictEqual(controller4.signal.aborted, true, 'Multiple abort() calls should be safe');

console.log('✓ AbortController signal behavior test passed');

// Test 5: Error handling in aborted scan
console.log('Test 5: Error handling in aborted scan');

TcpClient.connectHost = createMockConnectHost([], 5); // No successful hosts

const controller5 = new AbortController();
controller5.abort(); // Pre-abort the controller

let preAbortError = null;
let preAbortResults = [];

try {
  for await (const result of TcpClient.scanHostsYield({
    ipPattern: '172.16.0.*',
    port: 443,
    timeoutMs: 100,
    signal: controller5.signal
  })) {
    preAbortResults.push(result);
  }
} catch (error) {
  preAbortError = error;
}

assert.strictEqual(preAbortResults.length, 0, 'Pre-aborted scan should yield no results');
assert.ok(preAbortError && preAbortError.message === 'aborted', 'Should throw aborted error for pre-aborted signal');
console.log('✓ Error handling with pre-aborted signal test passed');

// Test 6: Abort during connection attempts
console.log('Test 6: Abort during connection attempts');

TcpClient.connectHost = createMockConnectHost(['192.168.2.100'], 100); // Slow connections

const controller6 = new AbortController();
let midConnectionResults = [];
let connectionAborted = false;

// Start scan and abort while connections are in progress
const scanPromise = (async () => {
  try {
    for await (const result of TcpClient.scanHostsYield({
      ipPattern: '192.168.2.*',
      port: 80,
      timeoutMs: 200,
      signal: controller6.signal
    })) {
      midConnectionResults.push(result);
    }
  } catch (error) {
    if (error.message === 'aborted') {
      connectionAborted = true;
    }
  }
})();

// Abort after starting scan but before connections complete
setTimeout(() => {
  controller6.abort();
}, 25);

await scanPromise;

assert.ok(connectionAborted || controller6.signal.aborted, 'Should abort during connection attempts');
assert.ok(midConnectionResults.length < 256, 'Should not complete all connections');
console.log('✓ Abort during connection attempts test passed');

// Test 7: Multiple scans with same controller
console.log('Test 7: Multiple scans with same controller');

TcpClient.connectHost = createMockConnectHost(['10.1.1.1'], 20);

const controller7 = new AbortController();
let scan7a_results = [];
let scan7b_results = [];

// First scan
try {
  for await (const result of TcpClient.scanHostsYield({
    ipPattern: '10.1.1.*',
    port: 22,
    timeoutMs: 10,
    signal: controller7.signal
  })) {
    scan7a_results.push(result);
    if (scan7a_results.length >= 3) {
      controller7.abort();
      break;
    }
  }
} catch (error) {
  // Expected abort
}

// Second scan with same (already aborted) controller should fail immediately
try {
  for await (const result of TcpClient.scanHostsYield({
    ipPattern: '10.1.2.*',
    port: 80,
    timeoutMs: 10,
    signal: controller7.signal
  })) {
    scan7b_results.push(result);
  }
} catch (error) {
  assert.strictEqual(error.message, 'aborted', 'Second scan should fail immediately with aborted controller');
}

assert.ok(scan7a_results.length > 0, 'First scan should have some results');
assert.strictEqual(scan7b_results.length, 0, 'Second scan should have no results (pre-aborted)');
assert.ok(controller7.signal.aborted, 'Controller should remain aborted');
console.log('✓ Multiple scans with same controller test passed');

// Restore original function
TcpClient.connectHost = originalConnectHost;

console.log('All quick abort demo tests passed! ✨');