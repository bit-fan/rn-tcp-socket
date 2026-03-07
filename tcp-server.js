import { DEFAULT_PORT } from './defaults.js';
import { feedDelimitedBuffer, sendJson as utilsSendJson } from './utils.js';

export class TcpServer {
  server;
  port = DEFAULT_PORT;
  launched = false;
  callback;
  constructor(callback) {
    this.callback = callback;
    this.server = null;
  }
  async start() {
    const mod = await import('react-native-tcp-socket').catch(() => null);
    if (!mod) throw new Error('react-native-tcp-socket not available');
    const TcpSocket = mod.default || mod;
    this.server = TcpSocket.createServer((socket) => {
      const parserState = { buffer: '' };
      socket.on('data', (chunk) => {
        feedDelimitedBuffer(
          parserState,
          chunk,
          (msg) => {
            if (typeof this.callback === 'function')
              this.callback({ status: 'data', data: msg, socket });
          },
          (err, raw) => {
            if (typeof this.callback === 'function')
              this.callback({ status: 'error', data: err, raw });
          },
        );
      });
    });
    this.server.on('error', (e) => {
      if (typeof this.callback === 'function')
        this.callback({ status: 'error', data: e });
    });
    this.server.on('close', () => {
      if (typeof this.callback === 'function')
        this.callback({ status: 'close' });
    });
  }

  sendJson(socket, obj) {
    const ok = utilsSendJson(socket, obj);
    if (!ok && typeof this.callback === 'function') {
      this.callback({ status: 'error', data: new Error('send failed') });
    }
    return ok;
  }

  getPort() {
    return this.port;
  }
  getLaunched() {
    return this.launched;
  }

  async serverListen(port) {
    if (!this.server) await this.start();
    return new Promise((resolve, reject) => {
      const onError = (e) => {
        if (
          e &&
          (e.code === 'EADDRINUSE' ||
            String(e).toLowerCase().includes('address already in use'))
        ) {
          this.port = port + 1;
          try {
            this.server.close();
          } catch (_) {}
          // retry with next port
          this.serverListen(this.port).then(resolve).catch(reject);
          return;
        }
        if (typeof this.callback === 'function')
          this.callback({ status: 'error', data: e });
        reject(e);
      };

      const onListening = () => {
        try {
          this.server.removeListener('error', onError);
        } catch (_) {}
        const address = this.server.address();
        this.port = address && address.port ? address.port : port;
        this.launched = true;
        if (typeof this.callback === 'function') {
          this.callback({ status: 'port', data: this.port });
        }
        resolve(this.port);
      };

      this.server.once('error', onError);
      this.server.listen({ port, reuseAddress: true }, onListening);
    });
  }
}
