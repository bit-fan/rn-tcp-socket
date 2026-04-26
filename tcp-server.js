import { DEFAULT_PORT } from './defaults.js';
import {
  attachSocketHelpers,
  feedDelimitedBuffer,
  sendJson as utilsSendJson,
} from './utils.js';

export class TcpServer {
  server = null;
  port = DEFAULT_PORT;
  launched = false;
  callback;
  constructor(callback) {
    this.callback = callback;
  }

  async init() {
    if (this.server) return;

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
            if (typeof socket.reset === 'function') socket.reset();
          },
        );
      });

      socket.on('error', (e) => {
        if (typeof this.callback === 'function')
          this.callback({ status: 'error', data: e });
      });
    });
    this.server.on('close', () => {
      this.launched = false;
      this.server = null;
      if (this.callback) {
        this.callback({ status: 'close' });
      }
    });
    this.server.on('error', (e) => {
      if (e.code !== 'EADDRINUSE' && typeof this.callback === 'function') {
        this.callback({ status: 'error', data: e });
      }
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
    await this.init();
    const currentPort = port || this.port;

    return new Promise((resolve, reject) => {
      const onError = async (e) => {
        cleanup();
        const isAppInUse =
          e &&
          (e.code === 'EADDRINUSE' ||
            String(e).toLowerCase().includes('address already in use'));
        if (isAppInUse) {
          const closeEvent = new Promise((res) =>
            this.server.once('close', res),
          );
          try {
            this.server.close();
          } catch (err) {}
          await closeEvent;
          this.server = null;
          this.port = currentPort + 1;
          resolve(await this.serverListen(this.port));
          resolve(result);
        }
      };

      const onListening = () => {
        cleanup();
        const address = this.server.address();
        this.port = address?.port || currentPort;
        this.launched = true;
        if (this.callback) {
          this.callback({ status: 'port', data: this.port });
        }
        resolve(this.port);
      };

      const cleanup = () => {
        this.server.removeListener('listening', onListening);
        this.server.removeListener('error', onError);
      };
      this.server.once('error', onError);
      this.server.once('listening', onListening);
      this.server.listen({
        port: currentPort,
        host: '0.0.0.0',
        reuseAddress: true,
      });
    });
  }

  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          this.launched = false;
          resolve();
        });
      });
    }
  }
}
