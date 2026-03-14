import {
  DEFAULT_PORT,
  DEFAULT_SCAN_CONCURRENCY,
  DEFAULT_SCAN_TIMEOUT_MS,
} from './defaults.js';
import { feedDelimitedBuffer, sendJson } from './utils.js';
const FROM_0_TO_255 = [...Array(256).keys()];

export class TcpClient {
  constructor(host, port, onData) {
    this.host = host;
    this.port = port;
    this.onData = typeof onData === 'function' ? onData : null;
    this.client = null;
    this._buffer = '';
  }

  async connect(timeoutMs = 5000) {
    if (this.client) return Promise.resolve(this.client);
    const mod = await import('react-native-tcp-socket').catch(() => null);
    if (!mod) throw new Error('react-native-tcp-socket not available');
    const TcpSocket = mod.default || mod;
    this.client = TcpSocket.createConnection({
      host: this.host,
      port: this.port,
    });
    return new Promise((resolve, reject) => {
      const onConnect = () => {
        this.client.on('data', this._handleData.bind(this));
        this.client.on('close', () => {
          if (this.onData) this.onData({ status: 'close' });
        });
        clearHandlers();
        resolve(this.client);
      };
      const onError = (err) => {
        clearHandlers();
        reject(err);
      };

      const clearHandlers = () => {
        try {
          this.client.removeListener('connect', onConnect);
        } catch (_) { }
        try {
          this.client.removeListener('error', onError);
        } catch (_) { }
      };

      this.client.on('connect', onConnect);
      this.client.on('error', onError);

      if (timeoutMs) {
        const to = setTimeout(() => {
          clearHandlers();
          reject(new Error('connect timeout'));
        }, timeoutMs);
        const origResolve = resolve;
        resolve = (...a) => {
          clearTimeout(to);
          origResolve(...a);
        };
      }
    });
  }

  _handleData(chunk) {
    const state = { buffer: this._buffer };
    feedDelimitedBuffer(
      state,
      chunk,
      (msg) => {
        if (this.onData) this.onData({ status: 'data', data: msg });
      },
      (err, raw) => {
        if (this.onData) this.onData({ status: 'error', data: err, raw });
      },
    );
    this._buffer = state.buffer;
  }

  send(message, destroyAfterSend = false) {
    if (!this.client) this.connect().catch(() => { });
    try {
      if (!this.client) return false;
      sendJson(this.client, message);
      if (destroyAfterSend) this.destroy();
      return true;
    } catch (_) {
      return false;
    }
  }

  destroy() {
    if (this.client) {
      try {
        this.client.destroy();
      } catch (_) { }
      this.client = null;
      this._buffer = '';
    }
  }

  static async connectHost(hostArg, portArg, timeoutMs = 3000) {
    const mod = await import('react-native-tcp-socket').catch(() => null);
    if (!mod) throw new Error('react-native-tcp-socket not available');
    const TcpSocket = mod.default || mod;
    const client = TcpSocket.createConnection({ port: portArg, host: hostArg });
    return new Promise((resolve, reject) => {
      let timer = null;
      const cleanup = () => {
        try {
          client.removeListener('connect', onConnect);
        } catch (_) { }
        try {
          client.removeListener('error', onError);
        } catch (_) { }
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      };
      const onConnect = () => {
        cleanup();
        resolve(client);
      };
      const onError = (err) => {
        cleanup();
        reject(err);
      };
      client.on('connect', onConnect);
      client.on('error', onError);
      if (timeoutMs)
        timer = setTimeout(() => {
          cleanup();
          reject(new Error('connect timeout'));
        }, timeoutMs);
    });
  }

  static async *scanHostsYield(options) {
    const {
      ipPattern,
      hosts: hostsArg,
      port = DEFAULT_PORT,
      timeoutMs = DEFAULT_SCAN_TIMEOUT_MS,
      maxResults = Infinity,
      signal = null,
    } = options;

    const hosts = Array.isArray(hostsArg)
      ? hostsArg.slice()
      : typeof ipPattern === 'string'
        ? FROM_0_TO_255.map((i) => `${ipPattern.replace('*', i)}`)
        : [];

    if (hosts.length === 0)
      throw new Error('Either ipPattern or hosts array must be provided');

    const targetPort = Number(port);

    let idx = 0;
    const total = hosts.length;
    let running = 0;
    const buffer = [];
    let resolveNext = null;
    let successes = 0;
    let aborted = false;

    const pushResult = (res) => {
      if (aborted) return;
      buffer.push(res);
      if (resolveNext) {
        resolveNext();
        resolveNext = null;
      }
    };

    const onAbort = () => {
      aborted = true;
      if (resolveNext) {
        resolveNext();
        resolveNext = null;
      }
    };

    if (signal && typeof signal.addEventListener === 'function') {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort);
    }

    // Immediately throw if signal was already aborted
    if (aborted) {
      throw new Error('aborted');
    }

    const raceWithAbort = (p) => {
      if (!signal) return p;
      if (signal.aborted) return Promise.reject(new Error('aborted'));
      return Promise.race([
        p,
        new Promise((_, rej) => {
          const onA = () => rej(new Error('aborted'));
          signal.addEventListener && signal.addEventListener('abort', onA);
        }),
      ]);
    };

    const startOne = () => {
      if (idx >= total || aborted || successes >= maxResults) return;
      const host = hosts[idx++];
      running++;
      (async () => {
        try {
          const client = await raceWithAbort(
            TcpClient.connectHost(host, targetPort, timeoutMs),
          );
          try {
            client.destroy();
          } catch (e) { }
          successes++;
          pushResult({ host, result: true });
          if (successes >= maxResults) aborted = true;
        } catch (e) {
          if (!signal || (e && String(e) !== 'Error: aborted'))
            pushResult({ host, result: false });
        } finally {
          running--;
          if (!aborted && idx < total) startOne();
          if (running === 0 && (idx >= total || aborted) && resolveNext) {
            resolveNext();
            resolveNext = null;
          }
        }
      })();
    };

    for (let i = 0; i < DEFAULT_SCAN_CONCURRENCY && i < total; i++) startOne();
    while ((buffer.length > 0 || running > 0 || idx < total) && !aborted) {
      if (buffer.length === 0)
        await new Promise((res) => {
          resolveNext = res;
        });
      while (buffer.length > 0) {
        const item = buffer.shift();
        yield item;
        if (item.result === true && successes >= maxResults) {
          aborted = true;
          break;
        }
      }
    }

    if (signal && typeof signal.removeEventListener === 'function') {
      try { signal.removeEventListener('abort', onAbort); } catch (_) { }
    }
  }
}
