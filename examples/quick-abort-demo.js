import { TcpClient } from '../tcp-client.js';

/**
 * Quick demo of AbortController with scanHostsYield
 * Run with: node examples/quick-abort-demo.js
 */

async function quickDemo() {
  console.log('🚀 AbortController Demo with TcpClient.scanHostsYield\n');
  
  const controller = new AbortController();
  
  const timeout = setTimeout(() => {
    console.log('⏰ 3 seconds elapsed - aborting scan...\n');
    controller.abort();
  }, 3000);
  
  let scannedCount = 0;
  let foundCount = 0;
  
  try {
    console.log('Starting network scan of 192.168.1.0-255 on port 22 (SSH)...');
    console.log('Will auto-cancel after 3 seconds\n');
    
    for await (const result of TcpClient.scanHostsYield({
      ipPattern: '192.168.1.*',
      port: 22,
      timeoutMs: 100,
      signal: controller.signal
    })) {
      scannedCount++;
      
      if (result.result) {
        foundCount++;
        console.log(`✅ Found SSH server at ${result.host}`);
      } else {
        console.log(`❌ No SSH server at ${result.host}`);
      }
      
      if (scannedCount % 10 === 0) {
        console.log(`📊 Progress: ${scannedCount} hosts scanned, ${foundCount} found`);
      }
    }
    
    clearTimeout(timeout);
    console.log(`✅ Scan completed! Checked ${scannedCount} hosts, found ${foundCount} SSH servers`);
    
  } catch (error) {
    clearTimeout(timeout);
    
    if (controller.signal.aborted) {
      console.log(`🛑 Scan aborted! Checked ${scannedCount} hosts, found ${foundCount} SSH servers`);
      console.log('   The remaining hosts were not scanned.');
    } else {
      console.error('❌ Scan failed:', error);
    }
  }
}


async function manualCancelDemo() {
  console.log('\n🛠️  Manual Cancellation Demo\n');
  
  const controller = new AbortController();

  setTimeout(() => {
    console.log('👤 User clicked STOP button - cancelling scan...\n');
    controller.abort();
  }, 2000);
  
  try {
    console.log('Scanning for web servers on port 80...');
    console.log('User will "click stop" after 2 seconds\n');
    
    let count = 0;
    for await (const result of TcpClient.scanHostsYield({
      ipPattern: '127.0.0.*',
      port: 80,
      timeoutMs: 50,
      signal: controller.signal
    })) {
      count++;
      if (result.result) {
        console.log(`🌐 Found web server at ${result.host}`);
      }
      
      // Check abort status (though the iterator will handle this automatically)
      if (controller.signal.aborted) {
        console.log('🔄 Breaking out of loop due to abort signal');
        break;
      }
    }
    
  } catch (error) {
    if (error.message === 'aborted') {
      console.log('✋ Scan successfully cancelled by user');
    } else {
      console.error('❌ Error:', error);
    }
  }
}

async function earlyStopDemo() {
  console.log('\n🎯 Early Termination Demo\n');
  
  const controller = new AbortController();
  let foundTargets = 0;
  const maxTargets = 2;
  
  try {
    console.log(`Looking for up to ${maxTargets} SSH servers...`);
    console.log('Will stop early when target count reached\n');
    
    for await (const result of TcpClient.scanHostsYield({
      ipPattern: '10.0.0.*',
      port: 22,
      timeoutMs: 100,
      signal: controller.signal
    })) {
      if (result.result) {
        foundTargets++;
        console.log(`🎯 Target ${foundTargets}/${maxTargets} found: ${result.host}`);
        
        if (foundTargets >= maxTargets) {
          console.log(`\n🏆 Found ${maxTargets} targets - stopping scan early!`);
          controller.abort();
          break;
        }
      }
    }
    
  } catch (error) {
    if (!controller.signal.aborted) {
      console.error('❌ Error:', error);
    }
  }
}

// Run all demos
async function runDemos() {
  await quickDemo();
  
  // Wait a bit between demos
  await new Promise(resolve => setTimeout(resolve, 1000));
  await manualCancelDemo();
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  await earlyStopDemo();
  
  console.log('\n🎉 All AbortController demos completed!\n');
  
  console.log('💡 Key takeaways:');
  console.log('   • Pass controller.signal to scanHostsYield options');
  console.log('   • Call controller.abort() to cancel the scan');
  console.log('   • Handle aborted scans with try/catch');
  console.log('   • Scan cleanly stops without checking remaining hosts');
  console.log('   • Perfect for user cancellation, timeouts, and early termination');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDemos().catch(console.error);
}

export { quickDemo, manualCancelDemo, earlyStopDemo, runDemos };