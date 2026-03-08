import { TcpClient } from '../tcp-client.js';

/**
 * Examples of using AbortController with TcpClient.scanHostsYield
 */

// Example 1: Basic timeout cancellation
async function basicTimeoutExample() {
  console.log('Example 1: Basic timeout cancellation');
  
  const abortController = new AbortController();
  
  // Auto-cancel after 5 seconds
  const timeoutId = setTimeout(() => {
    console.log('Timeout reached - aborting scan');
    abortController.abort();
  }, 5000);
  
  try {
    const foundHosts = [];
    for await (const result of TcpClient.scanHostsYield({
      ipPattern: '192.168.1.*',
      port: 22,
      timeoutMs: 1000,
      signal: abortController.signal
    })) {
      if (result.result) {
        foundHosts.push(result.host);
        console.log(`✓ Found SSH server at ${result.host}`);
      }
    }
    clearTimeout(timeoutId);
    console.log(`Scan completed. Found ${foundHosts.length} hosts.`);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.message === 'aborted') {
      console.log('Scan was aborted due to timeout');
    } else {
      console.error('Scan failed:', error);
    }
  }
}

// Example 2: Manual cancellation with user input simulation
async function userCancellationExample() {
  console.log('\nExample 2: User cancellation simulation');
  
  const abortController = new AbortController();
  
  // Simulate user pressing "stop" button after 3 seconds
  setTimeout(() => {
    console.log('User clicked stop button - cancelling scan');
    abortController.abort();
  }, 3000);
  
  try {
    let scannedCount = 0;
    for await (const result of TcpClient.scanHostsYield({
      ipPattern: '10.0.0.*',
      port: 80,
      timeoutMs: 500,
      signal: abortController.signal
    })) {
      scannedCount++;
      if (result.result) {
        console.log(`✓ Found web server at ${result.host}`);
      }
      
      // Show progress every 10 scans
      if (scannedCount % 10 === 0) {
        console.log(`Scanned ${scannedCount} hosts...`);
      }
    }
  } catch (error) {
    if (abortController.signal.aborted) {
      console.log(`Scan cancelled by user after checking ${result?.host || 'some hosts'}`);
    }
  }
}

// Example 3: Early termination when finding enough results
async function earlyTerminationExample() {
  console.log('\nExample 3: Early termination when finding enough results');
  
  const abortController = new AbortController();
  const maxResults = 3; // Stop after finding 3 hosts
  let foundCount = 0;
  
  try {
    for await (const result of TcpClient.scanHostsYield({
      ipPattern: '127.0.0.*',
      port: 80,
      timeoutMs: 100,
      signal: abortController.signal
    })) {
      if (result.result) {
        foundCount++;
        console.log(`✓ Found host ${foundCount}/${maxResults}: ${result.host}`);
        
        if (foundCount >= maxResults) {
          console.log('Found enough hosts - aborting remaining scan');
          abortController.abort();
          break;
        }
      }
    }
  } catch (error) {
    if (!abortController.signal.aborted) {
      console.error('Scan failed:', error);
    }
  }
}

// Example 4: Multiple concurrent scans with individual abort controls
async function multipleConcurrentScansExample() {
  console.log('\nExample 4: Multiple concurrent scans with individual controls');
  
  const scan1Controller = new AbortController();
  const scan2Controller = new AbortController();
  
  // Cancel scan1 after 2 seconds
  setTimeout(() => {
    console.log('Cancelling internal network scan');
    scan1Controller.abort();
  }, 2000);
  
  // Cancel scan2 after 4 seconds  
  setTimeout(() => {
    console.log('Cancelling external network scan');
    scan2Controller.abort();
  }, 4000);
  
  const promises = [
    // Scan internal network
    (async () => {
      try {
        const results = [];
        for await (const result of TcpClient.scanHostsYield({
          ipPattern: '192.168.0.*',
          port: 22,
          timeoutMs: 200,
          signal: scan1Controller.signal
        })) {
          if (result.result) {
            results.push(result.host);
            console.log(`Internal: Found SSH at ${result.host}`);
          }
        }
        return { network: 'internal', hosts: results };
      } catch (error) {
        return { network: 'internal', hosts: [], error: error.message };
      }
    })(),
    
    // Scan different network
    (async () => {
      try {
        const results = [];
        for await (const result of TcpClient.scanHostsYield({
          ipPattern: '10.0.1.*',
          port: 80,
          timeoutMs: 200,
          signal: scan2Controller.signal
        })) {
          if (result.result) {
            results.push(result.host);
            console.log(`External: Found web server at ${result.host}`);
          }
        }
        return { network: 'external', hosts: results };
      } catch (error) {
        return { network: 'external', hosts: [], error: error.message };
      }
    })()
  ];
  
  const allResults = await Promise.allSettled(promises);
  console.log('All scans completed:', allResults.map(r => r.value || r.reason));
}

// Example 5: React-style component cancellation pattern
class NetworkScanner {
  constructor() {
    this.currentScan = null;
  }
  
  async startScan(networkIpPattern, onProgress, onComplete) {
    // Cancel any existing scan
    this.stopScan();
    
    this.currentScan = new AbortController();
    console.log(`\nExample 5: Starting scan of ${networkIpPattern}`);
    
    try {
      let scannedCount = 0;
      const foundHosts = [];
      
      for await (const result of TcpClient.scanHostsYield({
        ipPattern: networkIpPattern,
        port: 80,
        timeoutMs: 300,
        signal: this.currentScan.signal
      })) {
        scannedCount++;
        
        if (result.result) {
          foundHosts.push(result.host);
          console.log(`✓ Found ${result.host}`);
        }
        
        // Call progress callback
        if (onProgress) {
          onProgress({ scanned: scannedCount, found: foundHosts.length });
        }
        
        // Check if scan was cancelled
        if (this.currentScan && this.currentScan.signal.aborted) {
          break;
        }
      }
      
      // Check if scan was cancelled after the loop  
      const wasAborted = !this.currentScan || this.currentScan.signal.aborted;
      
      if (onComplete) {
        if (wasAborted) {
          onComplete({ hosts: foundHosts, completed: false, cancelled: true });
        } else {
          onComplete({ hosts: foundHosts, completed: true });
        }
      }
      
    } catch (error) {
      if (this.currentScan && this.currentScan.signal.aborted) {
        console.log('Scan was cancelled');
        if (onComplete) {
          onComplete({ hosts: [], completed: false, cancelled: true });
        }
      } else {
        console.error('Scan failed:', error);
        if (onComplete) {
          onComplete({ hosts: [], completed: false, error: error.message });
        }
      }
    }
  }
  
  stopScan() {
    if (this.currentScan) {
      console.log('Stopping current scan...');
      this.currentScan.abort();
      this.currentScan = null;
    }
  }
}

// Example 6: Graceful shutdown with cleanup
async function gracefulShutdownExample() {
  console.log('\nExample 6: Graceful shutdown with cleanup');
  
  const abortController = new AbortController();
  let scanStats = { total: 0, found: 0 };
  
  // Handle process termination
  const cleanup = () => {
    console.log('\nReceived shutdown signal - cleaning up...');
    console.log(`Final stats: ${scanStats.found} hosts found out of ${scanStats.total} scanned`);
    abortController.abort();
  };
  
  // In a real app, you'd listen for SIGINT/SIGTERM
  setTimeout(cleanup, 2500); // Simulate shutdown after 2.5 seconds
  
  try {
    for await (const result of TcpClient.scanHostsYield({
      ipPattern: '172.16.0.*',
      port: 443,
      timeoutMs: 200,
      signal: abortController.signal
    })) {
      scanStats.total++;
      if (result.result) {
        scanStats.found++;
        console.log(`✓ Found HTTPS server at ${result.host}`);
      }
      
      // Periodically check if we should abort
      if (abortController.signal.aborted) {
        break;
      }
    }
  } catch (error) {
    if (abortController.signal.aborted) {
      console.log('Scan aborted gracefully');
    } else {
      console.error('Scan failed:', error);
    }
  }
}

// Run examples
async function runAllExamples() {
  try {
    await basicTimeoutExample();
    await userCancellationExample();
    await earlyTerminationExample();
    await multipleConcurrentScansExample();
    
    // Component-style example
    const scanner = new NetworkScanner();
    scanner.startScan('192.168.100.*',
      (progress) => console.log(`Progress: ${progress.scanned} scanned, ${progress.found} found`),
      (result) => console.log('Scan complete:', result)
    );
    
    // Cancel after 3 seconds
    setTimeout(() => scanner.stopScan(), 3000);
    
    // Wait a bit then run graceful shutdown example
    setTimeout(() => gracefulShutdownExample(), 1000);
    
  } catch (error) {
    console.error('Example failed:', error);
  }
}

// Export examples for individual testing
export {
  basicTimeoutExample,
  userCancellationExample,
  earlyTerminationExample,
  multipleConcurrentScansExample,
  NetworkScanner,
  gracefulShutdownExample,
  runAllExamples
};

// Run all examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples().then(() => {
    console.log('\nAll AbortController examples completed!');
  });
}