import assert from 'assert';
import { feedDelimitedBuffer, sendJson } from '../utils.js';

export async function run() {
  // Test that feedDelimitedBuffer correctly parses complete messages
  const state = { buffer: '' };
  const messages = [];
  feedDelimitedBuffer(state, Buffer.from(JSON.stringify({ a: 1 }) + '\n'), msg => messages.push(msg), (err) => { throw err; });
  assert.strictEqual(messages.length, 1);
  assert.deepStrictEqual(messages[0], { a: 1 });

  // Test partial message across two chunks
  const state2 = { buffer: '' };
  const messages2 = [];
  const raw = JSON.stringify({ x: 'hello', y: 2 });
  const part1 = raw.slice(0, 5);
  const part2 = raw.slice(5) + '\n';
  feedDelimitedBuffer(state2, Buffer.from(part1), msg => messages2.push(msg), err => { throw err; });
  assert.strictEqual(messages2.length, 0);
  feedDelimitedBuffer(state2, Buffer.from(part2), msg => messages2.push(msg), err => { throw err; });
  assert.strictEqual(messages2.length, 1);
  assert.deepStrictEqual(messages2[0], { x: 'hello', y: 2 });

  // Test multiple messages in one chunk
  const state3 = { buffer: '' };
  const messages3 = [];
  const combined = JSON.stringify({ one: 1 }) + '\n' + JSON.stringify({ two: 2 }) + '\n';
  feedDelimitedBuffer(state3, Buffer.from(combined), msg => messages3.push(msg), err => { throw err; });
  assert.strictEqual(messages3.length, 2);

  // sendJson should call socket.write with JSON + '\n'
  let written = null;
  const mockSocket = { write: (s) => { written = s; } };
  const ok = sendJson(mockSocket, { z: 9 });
  assert.strictEqual(ok, true);
  assert.strictEqual(written, JSON.stringify({ z: 9 }) + '\n');

  console.log('utils.test.js: OK');
}
