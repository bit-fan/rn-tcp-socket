export const RESET_KEY = '__reset';

export function buildResetMessage() {
  return { [RESET_KEY]: true };
}

export function isResetMessage(message) {
  return (
    message &&
    typeof message === 'object' &&
    message[RESET_KEY] === true
  );
}

export function feedDelimitedBuffer(state, chunk, onMessage, onError) {
  if (!state) state = {};
  state.buffer = state.buffer || '';
  const str =
    chunk != null
      ? Buffer.isBuffer(chunk)
        ? chunk.toString('utf8')
        : String(chunk)
      : '';
  state.buffer += str;
  let idx;
  while ((idx = state.buffer.indexOf('\n')) !== -1) {
    const raw = state.buffer.slice(0, idx);
    state.buffer = state.buffer.slice(idx + 1);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (isResetMessage(parsed)) {
        continue;
      }
      if (typeof onMessage === 'function') onMessage(parsed);
    } catch (e) {
      if (typeof onError === 'function') onError(e, raw);
    }
  }
}

export function sendJson(socket, obj) {
  try {
    socket.write(JSON.stringify(obj) + '\n');
    return true;
  } catch (_) {
    return false;
  }
}

export function sendReset(socket) {
  return sendJson(socket, buildResetMessage());
}

export function attachSocketHelpers(socket) {
  if (!socket || typeof socket.write !== 'function') return socket;
  if (typeof socket.reset !== 'function') {
    socket.reset = () => sendReset(socket);
  }
  if (typeof socket.sendJson !== 'function') {
    socket.sendJson = (obj) => sendJson(socket, obj);
  }
  return socket;
}

export const verifyIpPattern = (ipPattern) => {
  if (typeof ipPattern !== 'string') return false;
  const s = ipPattern.trim();
  // octet: 0-255
  const octet = '(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)';
  const part = `(?:${octet}|\*)`;
  const re = new RegExp(`^${part}\\.${part}\\.${part}\\.${part}$`);
  if (!re.test(s)) return false;
  // allow at most one wildcard asterisk in the IP pattern
  const stars = (s.match(/\*/g) || []).length;
  return stars <= 1;
};
