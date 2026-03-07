const tests = [
  './utils.test.js',
  './tcp-client.test.js',
  './tcp-client-scan.test.js',
  './tcp-server.test.js'];

for (const t of tests) {
  try {
    const mod = await import(`./${t}`);
    if (typeof mod.run === 'function') {
      await mod.run();
    } else {
      console.warn('Test', t, 'has no run()');
    }
  } catch (err) {
    console.error('Test failed:', t, err);
    process.exitCode = 1;
    break;
  }
}
if (!process.exitCode) console.log('All tests passed');
