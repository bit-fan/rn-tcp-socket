import { DEFAULT_PORT } from './defaults.js';
import {
  attachSocketHelpers,
  feedDelimitedBuffer,
  sendJson as utilsSendJson,
} from './utils.js';

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
      attachSocketHelpers(socket);
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
            if (typeof socket.reset === 'function') {
              socket.reset();
            }
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

    const listenOnPort = (listenPort) =>
      new Promise((resolve, reject) => {
        const onError = async (e) => {
          if (
            e &&
            (e.code === 'EADDRINUSE' ||
              String(e).toLowerCase().includes('address already in use'))
          ) {
            try {
              this.server.removeListener('error', onError);
            } catch (_) {}
            try {
              this.server.close();
            } catch (_) {}
            try {
              await new Promise((res) => this.server.once('close', res));
            } catch (_) {}
            this.server = null;
            this.port = listenPort + 1;
            resolve(this.serverListen(this.port));
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
          this.port = address && address.port ? address.port : listenPort;
          this.launched = true;
          if (typeof this.callback === 'function') {
            this.callback({ status: 'port', data: this.port });
          }
          resolve(this.port);
        };

        this.server.once('error', onError);
        this.server.listen({ port: listenPort, reuseAddress: true }, onListening);
      });

    return listenOnPort(port);
  }
}
