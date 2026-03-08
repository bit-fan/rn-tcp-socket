const tests = [
  './utils.test.js',
  './tcp-client.test.js',
  './tcp-client-scan.test.js',
  './tcp-server.test.js',
  './tcp-data-transmission.test.js',
  './abort-controller-examples.test.js',
  './quick-abort-demo.test.js'];

for (const t of tests) {
  try {
    await import(`./${t}`);
  } catch (err) {
    console.error('Test failed:', t, err);
    process.exitCode = 1;
    break;
  }
}
if (!process.exitCode) console.log('All tests passed');
