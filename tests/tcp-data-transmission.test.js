import assert from 'assert';
import { TcpClient } from '../tcp-client.js';
import { TcpServer } from '../tcp-server.js';
import { feedDelimitedBuffer, sendJson } from '../utils.js';

/**
 * Data transmission tests for TcpClient and TcpServer
 * Tests JSON and string data transmission logic without requiring actual network connections
 */

console.log('Testing data transmission functionality...');
    console.log('Test 1: JSON message parsing and handling');
    
    const receivedMessages = [];
    const client = new TcpClient('127.0.0.1', 12345, (msg) => {
      if (msg && msg.status === 'data') receivedMessages.push(msg.data);
    });
    
    // Test various JSON objects through the data handler
    const testJsonData = [
      { message: 'hello', type: 'greeting' },
      { numbers: [1, 2, 3, 4, 5] },
      { nested: { data: { value: 42 } } },
      { unicode: '🚀 测试数据' },
      { empty: {} },
      { nullValue: null },
      { boolean: true },
      { string: "Multi\nLine\nString" },
      { special: "Tab\tand\"Quote" }
    ];
    
    // Simulate receiving each message
    for (const testData of testJsonData) {
      const jsonStr = JSON.stringify(testData) + '\n';
      client._handleData(Buffer.from(jsonStr));
    }
    
    assert.strictEqual(receivedMessages.length, testJsonData.length,
      `Expected ${testJsonData.length} messages, got ${receivedMessages.length}`);
    
    for (let i = 0; i < testJsonData.length; i++) {
      assert.deepStrictEqual(receivedMessages[i], testJsonData[i],
        `Message ${i} was not parsed correctly`);
    }
    
    console.log('✓ JSON message parsing test passed');

    console.log('Test 2: Fragmented message handling');
    
    receivedMessages.length = 0;
    const fragmentedMessage = { large: 'This is a large message that will be split across multiple chunks' };
    const jsonStr = JSON.stringify(fragmentedMessage) + '\n';
    
    // Split the message into multiple fragments
    const chunk1 = jsonStr.slice(0, 15);
    const chunk2 = jsonStr.slice(15, 30);
    const chunk3 = jsonStr.slice(30);
    
    // Send fragments one by one
    client._handleData(Buffer.from(chunk1));
    assert.strictEqual(receivedMessages.length, 0, 'Should not parse incomplete message');
    
    client._handleData(Buffer.from(chunk2));
    assert.strictEqual(receivedMessages.length, 0, 'Should not parse incomplete message');
    
    client._handleData(Buffer.from(chunk3));
    assert.strictEqual(receivedMessages.length, 1, 'Should parse complete message');
    assert.deepStrictEqual(receivedMessages[0], fragmentedMessage, 'Fragmented message should be reconstructed correctly');
    
    console.log('✓ Fragmented message handling test passed');

    console.log('Test 3: Multiple messages in single chunk');
    
    receivedMessages.length = 0;
    const multipleMessages = [
      { id: 1, data: 'first' },
      { id: 2, data: 'second' },
      { id: 3, data: 'third' }
    ];
    
    // Combine multiple messages into a single chunk
    const combinedChunk = multipleMessages.map(msg => JSON.stringify(msg) + '\n').join('');
    client._handleData(Buffer.from(combinedChunk));
    
    assert.strictEqual(receivedMessages.length, multipleMessages.length,
      `Should parse all ${multipleMessages.length} messages from single chunk`);
    
    for (let i = 0; i < multipleMessages.length; i++) {
      assert.deepStrictEqual(receivedMessages[i], multipleMessages[i],
        `Multiple message ${i} should be parsed correctly`);
    }
    
    console.log('✓ Multiple messages in single chunk test passed');

    console.log('Test 4: Error handling for malformed JSON');
    
    receivedMessages.length = 0;
    const errorMessages = [];
    
    const errorClient = new TcpClient('127.0.0.1', 12345, (msg) => {
      if (msg && msg.status === 'error') {
        errorMessages.push(msg);
      } else if (msg && msg.status === 'data') {
        receivedMessages.push(msg.data);
      }
    });
    
    const testData = [
      '{"valid": "json"}\n',  // valid
      '{"invalid": json}\n',  // invalid JSON
      '{"another": "valid"}\n', // valid again
      'not json at all\n',    // completely invalid
      '{"incomplete":', // incomplete (no newline)
      '"value"}\n'      // completion of incomplete
    ];
    
    for (const chunk of testData) {
      errorClient._handleData(Buffer.from(chunk));
    }
    
    assert.strictEqual(receivedMessages.length, 3, 'Should receive 3 valid messages');
    assert.strictEqual(errorMessages.length, 2, 'Should receive 2 error messages for malformed JSON');
    
    assert.deepStrictEqual(receivedMessages[0], { valid: 'json' });
    assert.deepStrictEqual(receivedMessages[1], { another: 'valid' });
    assert.deepStrictEqual(receivedMessages[2], { incomplete: 'value' });
    
    console.log('✓ Error handling test passed');

    console.log('Test 5: Send functionality with mock socket');
    
    let sentData = [];
    const mockSocket = {
      write: (data, encoding, callback) => {
        sentData.push(data);
        if (typeof callback === 'function') callback();
        return true;
      },
      destroy: () => {}
    };
    
    const sendClient = new TcpClient('127.0.0.1', 12345);
    sendClient.client = mockSocket;
    
    const sendTestData = [
      { message: 'test send' },
      { array: [1, 2, 3] },
      { unicode: '测试发送 🚀' }
    ];
    
    for (const testData of sendTestData) {
      const result = sendClient.send(testData);
      assert.strictEqual(result, true, 'Send should return true for successful sends');
    }
    
    assert.strictEqual(sentData.length, sendTestData.length,
      `Should have sent ${sendTestData.length} messages`);
    
    for (let i = 0; i < sendTestData.length; i++) {
      const expectedData = JSON.stringify(sendTestData[i]) + '\n';
      assert.strictEqual(sentData[i], expectedData,
        `Sent message ${i} should be properly formatted`);
    }
    
    console.log('✓ Send functionality test passed');

    console.log('Test 6: Server sendJson functionality');
    
    sentData = [];
    const server = new TcpServer(() => {});
    
    const serverSendTestData = [
      { response: 'server message' },
      { status: 'ok', data: { value: 123 } },
      { error: null, result: 'success' }
    ];
    
    for (const testData of serverSendTestData) {
      const result = server.sendJson(mockSocket, testData);
      assert.strictEqual(result, true, 'Server sendJson should return true for successful sends');
    }
    
    assert.strictEqual(sentData.length, serverSendTestData.length,
      `Server should have sent ${serverSendTestData.length} messages`);
    
    for (let i = 0; i < serverSendTestData.length; i++) {
      const expectedData = JSON.stringify(serverSendTestData[i]) + '\n';
      assert.strictEqual(sentData[i], expectedData,
        `Server sent message ${i} should be properly formatted`);
    }
    
    console.log('✓ Server sendJson functionality test passed');

    // Test 7: Direct utils testing for comprehensive coverage
    console.log('Test 7: Direct utils testing');
    
    const utilsReceivedMessages = [];
    const utilsErrors = [];
    
    const state = { buffer: '' };
    
    // Test feedDelimitedBuffer directly
    const testChunks = [
      '{"msg1": "test"}',  // partial
      '\n{"msg2": "another"}\n', // complete previous + new complete
      '{"msg3":', // partial start
      '"incomplete"}\n{"msg4": "final"}\n' // complete previous + new complete
    ];
    
    for (const chunk of testChunks) {
      feedDelimitedBuffer(
        state,
        chunk,
        (msg) => utilsReceivedMessages.push(msg),
        (err, raw) => utilsErrors.push({ err, raw })
      );
    }
    
    assert.strictEqual(utilsReceivedMessages.length, 4, 'Should receive 4 messages from utils');
    assert.deepStrictEqual(utilsReceivedMessages[0], { msg1: 'test' });
    assert.deepStrictEqual(utilsReceivedMessages[1], { msg2: 'another' });
    assert.deepStrictEqual(utilsReceivedMessages[2], { msg3: 'incomplete' });
    assert.deepStrictEqual(utilsReceivedMessages[3], { msg4: 'final' });
    
    // Test sendJson directly
    sentData = [];
    const result = sendJson(mockSocket, { direct: 'utils test' });
    assert.strictEqual(result, true, 'Direct sendJson should return true');
    assert.strictEqual(sentData[0], '{"direct":"utils test"}\n', 'Direct sendJson should format correctly');
    
    console.log('✓ Direct utils testing passed');

    console.log('Test 8: Large data handling');
    
    receivedMessages.length = 0;
    const largeClient = new TcpClient('127.0.0.1', 12345, (msg) => {
      if (msg && msg.status === 'data') receivedMessages.push(msg.data);
    });
    
    // Create a large message
    const largeMessage = {
      id: 'large-data-test',
      data: new Array(1000).fill(0).map((_, i) => ({
        index: i,
        value: `test-value-${i}`,
        metadata: { created: '2026-03-07T00:00:00Z', processed: true }
      })),
      summary: { total: 1000, bytes: 0 }
    };
    
    const largeJsonStr = JSON.stringify(largeMessage) + '\n';
    largeMessage.summary.bytes = largeJsonStr.length;
    
    // Send the large message
    largeClient._handleData(Buffer.from(largeJsonStr));
    
    assert.strictEqual(receivedMessages.length, 1, 'Should receive 1 large message');
    assert.strictEqual(receivedMessages[0].data.length, 1000, 'Large message should contain all data');
    assert.strictEqual(receivedMessages[0].id, 'large-data-test', 'Large message should preserve structure');
    
    console.log('✓ Large data handling test passed');

console.log('All data transmission tests passed! ✨');
console.log('tcp-data-transmission.test.js: OK');