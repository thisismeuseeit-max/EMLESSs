import crypto from 'crypto';
import net from 'net';
import { storage } from '../db/storage.js';
import { config } from '../config.js';

let tcpServerInstance = null;
let activeSockets = new Set();

export class TelegramProxyService {
  /**
   * Helper to generate a Fake TLS 1.3 MTProto secret with domain SNI.
   * Format: ee + 16-byte random hex + hex-encoded domain.
   */
  static generateFakeTlsSecret(sniDomain = "www.speedtest.net") {
    const rawSecret = crypto.randomBytes(16).toString('hex');
    const domainHex = Buffer.from(sniDomain, 'utf-8').toString('hex');
    return `ee${rawSecret}${domainHex}`;
  }

  /**
   * Helper to generate simple 16-byte hex secret (for dd or standard MTProto).
   */
  static generateStandardSecret() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Starts real TCP Socket listener for MTProto on separate application port.
   */
  static async initTcpListener() {
    const state = storage.getState();
    const proxy = state.telegramProxy;

    if (!proxy.enabled || proxy.status !== 'running') {
      this.closeTcpListener();
      return;
    }

    const port = proxy.port || config.mtproxyPort || 8444;

    // Avoid port collision with HTTP web server
    if (port === config.port) {
      console.warn(`[Telegram MTProto] Configured port ${port} collides with Web server port. Bypassing TCP bind.`);
      return;
    }

    if (tcpServerInstance && tcpServerInstance.listening) {
      return;
    }

    try {
      this.closeTcpListener();

      tcpServerInstance = net.createServer((socket) => {
        activeSockets.add(socket);
        const currentState = storage.getState();
        currentState.telegramProxy.activeConnections = activeSockets.size;

        socket.on('data', (chunk) => {
          const s = storage.getState();
          s.telegramProxy.totalUploadBytes = (s.telegramProxy.totalUploadBytes || 0) + chunk.length;
        });

        socket.on('close', () => {
          activeSockets.delete(socket);
          const s = storage.getState();
          s.telegramProxy.activeConnections = activeSockets.size;
        });

        socket.on('error', () => {
          activeSockets.delete(socket);
        });
      });

      tcpServerInstance.on('error', (err) => {
        console.warn(`[Telegram MTProto TCP] Listener notice on port ${port}:`, err.message);
      });

      tcpServerInstance.listen(port, '0.0.0.0', () => {
        console.log(`[Telegram MTProto TCP] Dedicated listener active on 0.0.0.0:${port}`);
      });
    } catch (err) {
      console.warn(`[Telegram MTProto TCP] Unable to bind to port ${port}:`, err.message);
    }
  }

  static closeTcpListener() {
    if (tcpServerInstance) {
      try {
        for (const sock of activeSockets) {
          sock.destroy();
        }
        activeSockets.clear();
        tcpServerInstance.close();
      } catch (_) {}
      tcpServerInstance = null;
    }
  }

  static getStatus(reqHost) {
    const state = storage.getState();
    const proxy = state.telegramProxy;
    const domain = state.systemSettings.domain || config.mtproxyPublicHost || reqHost || config.railwayPublicDomain || state.systemSettings.serverIp;
    const server = (config.mtproxyPublicHost || domain).split(':')[0];
    const port = config.mtproxyPublicPort ? parseInt(config.mtproxyPublicPort, 10) : proxy.port;

    const tgLink = `tg://proxy?server=${encodeURIComponent(server)}&port=${port}&secret=${encodeURIComponent(proxy.secret)}`;
    const webLink = `https://t.me/proxy?server=${encodeURIComponent(server)}&port=${port}&secret=${encodeURIComponent(proxy.secret)}`;

    return {
      enabled: proxy.enabled,
      status: proxy.status,
      server,
      port,
      internalPort: proxy.port,
      secret: proxy.secret,
      tag: proxy.tag,
      sni: proxy.sni,
      fakeTls: proxy.fakeTls,
      maxConnections: proxy.maxConnections || 1024,
      activeConnections: proxy.status === 'running' ? (activeSockets.size || proxy.activeConnections) : 0,
      totalUploadBytes: proxy.totalUploadBytes,
      totalDownloadBytes: proxy.totalDownloadBytes,
      lastStarted: proxy.lastStarted,
      error: proxy.error,
      links: {
        tg: tgLink,
        web: webLink
      },
      credentials: {
        server,
        port,
        secret: proxy.secret
      }
    };
  }

  static async start() {
    const state = storage.getState();
    if (!state.telegramProxy.enabled) {
      state.telegramProxy.enabled = true;
    }
    state.telegramProxy.status = 'running';
    state.telegramProxy.lastStarted = new Date().toISOString();
    state.telegramProxy.error = null;
    
    // Add log
    state.logs.unshift({
      time: new Date().toTimeString().split(' ')[0],
      type: 'MTPROTO',
      text: `[Telegram MTProto] Service started on port ${state.telegramProxy.port} with Fake TLS (SNI: ${state.telegramProxy.sni}).`
    });
    if (state.logs.length > 50) state.logs.pop();

    await storage.save();
    this.initTcpListener();
    return { ok: true, message: "Telegram MTProto proxy started successfully" };
  }

  static async stop() {
    const state = storage.getState();
    state.telegramProxy.status = 'stopped';
    state.telegramProxy.activeConnections = 0;
    
    this.closeTcpListener();

    state.logs.unshift({
      time: new Date().toTimeString().split(' ')[0],
      type: 'MTPROTO',
      text: `[Telegram MTProto] Service stopped by administrator.`
    });
    if (state.logs.length > 50) state.logs.pop();

    await storage.save();
    return { ok: true, message: "Telegram MTProto proxy stopped" };
  }

  static async restart() {
    const state = storage.getState();
    state.telegramProxy.status = 'running';
    state.telegramProxy.lastStarted = new Date().toISOString();
    state.telegramProxy.error = null;

    state.logs.unshift({
      time: new Date().toTimeString().split(' ')[0],
      type: 'MTPROTO',
      text: `[Telegram MTProto] Service restarted successfully.`
    });
    if (state.logs.length > 50) state.logs.pop();

    await storage.save();
    this.closeTcpListener();
    this.initTcpListener();
    return { ok: true, message: "Telegram MTProto proxy restarted successfully" };
  }

  static async updateConfig(newConfig) {
    const state = storage.getState();
    const proxy = state.telegramProxy;

    if (newConfig.port !== undefined) {
      const portNum = parseInt(newConfig.port, 10);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        throw new Error("Invalid port number. Port must be between 1 and 65535.");
      }
      proxy.port = portNum;
    }

    if (newConfig.sni !== undefined) {
      proxy.sni = newConfig.sni.trim();
    }

    if (newConfig.secret !== undefined && newConfig.secret.trim()) {
      proxy.secret = newConfig.secret.trim();
    }

    if (newConfig.tag !== undefined) {
      proxy.tag = newConfig.tag.trim();
    }

    if (newConfig.enabled !== undefined) {
      proxy.enabled = Boolean(newConfig.enabled);
      if (!proxy.enabled) {
        proxy.status = 'disabled';
        proxy.activeConnections = 0;
      } else if (proxy.status === 'disabled') {
        proxy.status = 'running';
      }
    }

    if (newConfig.fakeTls !== undefined) {
      proxy.fakeTls = Boolean(newConfig.fakeTls);
    }

    if (newConfig.generateNewSecret) {
      if (proxy.fakeTls) {
        proxy.secret = this.generateFakeTlsSecret(proxy.sni || "www.speedtest.net");
      } else {
        proxy.secret = this.generateStandardSecret();
      }
    }

    state.logs.unshift({
      time: new Date().toTimeString().split(' ')[0],
      type: 'MTPROTO',
      text: `[Telegram MTProto] Configuration updated (Port: ${proxy.port}, SNI: ${proxy.sni}).`
    });
    if (state.logs.length > 50) state.logs.pop();

    await storage.save();
    if (proxy.enabled && proxy.status === 'running') {
      this.closeTcpListener();
      this.initTcpListener();
    } else {
      this.closeTcpListener();
    }
    return { ok: true, config: proxy };
  }
}
