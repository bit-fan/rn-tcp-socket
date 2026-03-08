import assert from 'assert';
import { TcpServer } from '../tcp-server.js';

const events = [];
const server = new TcpServer(evt => events.push(evt));

// test sendJson wrapper: mock socket
let written = null;
const mockSocket = { write: (s) => { written = s; } };
const ok = server.sendJson(mockSocket, { s: 42 });
assert.strictEqual(ok, true);
assert.strictEqual(written, JSON.stringify({ s: 42 }) + '\n');

console.log('tcp-server.test.js: OK');
