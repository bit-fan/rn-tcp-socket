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
      if (typeof onMessage === 'function') onMessage(JSON.parse(raw));
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
