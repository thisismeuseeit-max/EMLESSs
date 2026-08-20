import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

const defaultData = {
  adminUsername: config.adminUsername,
  adminPassword: config.adminPassword,
  secretKey: config.secretKey,
  systemSettings: {
    serverIp: "185.190.140.22",
    domain: config.railwayPublicDomain || "gateway.emless.network",
    port: 443,
    tlsType: "reality",
    sni: "www.speedtest.net",
    publicKey: "w71o8c...xT29PqM5_emlessKey",
    privateKey: "eM42_...secret_emless",
    shortId: "6a89c02b",
    fragmentEnabled: true,
    fragmentLength: "100-200",
    fragmentInterval: "10-20",
    cleanIps: ["104.16.132.229", "104.17.210.9", "172.67.180.12", "162.159.138.10"],
    language: "en",
    defaultTransportMode: config.defaultTransportMode || "standard"
  },
  telegramProxy: {
    enabled: config.mtproxyEnabled,
    status: "running",
    port: config.mtproxyPort,
    secret: "ee000000000000000000000000000000017777772e7370656564746573742e6e6574",
    tag: "1665427189a0",
    sni: "www.speedtest.net",
    fakeTls: true,
    maxConnections: 1024,
    activeConnections: 48,
    totalUploadBytes: 1048576000 * 3.4,
    totalDownloadBytes: 1048576000 * 18.2,
    lastStarted: new Date().toISOString(),
    error: null
  },
  inbounds: [
    {
      id: "vless-reality-grpc",
      name: "VLESS + REALITY (gRPC)",
      protocol: "vless",
      transportMode: "standard",
      transport: "grpc",
      security: "reality",
      port: 8443,
      serviceName: "emless-grpc",
      sni: "www.speedtest.net",
      enabled: true,
      activeConnections: 94,
      totalTraffic: "420.5 GB"
    },
    {
      id: "vless-ws-tls",
      name: "VLESS + WebSocket (Cloudflare TLS)",
      protocol: "vless",
      transportMode: "standard",
      transport: "ws",
      security: "tls",
      port: 443,
      path: "/emless-vless",
      sni: "gateway.emless.network",
      enabled: true,
      activeConnections: 58,
      totalTraffic: "185.2 GB"
    },
    {
      id: "trojan-xhttp",
      name: "Trojan + XHTTP (Anti-Filter)",
      protocol: "trojan",
      transportMode: "standard",
      transport: "xhttp",
      security: "tls",
      port: 2087,
      path: "/emless-xhttp",
      sni: "gateway.emless.network",
      enabled: true,
      activeConnections: 36,
      totalTraffic: "134.8 GB"
    },
    {
      id: "trojan-ws-tls",
      name: "Trojan + WebSocket",
      protocol: "trojan",
      transportMode: "standard",
      transport: "ws",
      security: "tls",
      port: 2083,
      path: "/emless-trojan",
      sni: "gateway.emless.network",
      enabled: true,
      activeConnections: 29,
      totalTraffic: "92.1 GB"
    },
    {
      id: "ss-2022",
      name: "Shadowsocks 2022 (Blake3-AES)",
      protocol: "shadowsocks",
      transportMode: "standard",
      transport: "tcp",
      security: "none",
      method: "2022-blake3-aes-128-gcm",
      port: 9005,
      password: "emlessSecretKeySS2022Blake3Secure==",
      enabled: true,
      activeConnections: 21,
      totalTraffic: "58.4 GB"
    }
  ],
  clients: [
    {
      id: "cli_101",
      email: "primary.admin@emless",
      uuid: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      password: "pass_admin_9921",
      subToken: "sub_emless_pri001",
      quotaGB: 100,
      usedUploadGB: 5.4,
      usedDownloadGB: 34.2,
      expiryDays: 30,
      status: "active",
      createdAt: "2026-08-01"
    },
    {
      id: "cli_102",
      email: "sara.work@emless",
      uuid: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      password: "pass_sara_7741",
      subToken: "sub_emless_sara02",
      quotaGB: 60,
      usedUploadGB: 8.2,
      usedDownloadGB: 41.6,
      expiryDays: 19,
      status: "active",
      createdAt: "2026-08-05"
    },
    {
      id: "cli_103",
      email: "dev.team@emless",
      uuid: "c9a646d3-9c61-4cd7-897e-3f787de7ec43",
      password: "pass_dev_5512",
      subToken: "sub_emless_dev03",
      quotaGB: 40,
      usedUploadGB: 3.1,
      usedDownloadGB: 36.8,
      expiryDays: 4,
      status: "warning",
      createdAt: "2026-07-20"
    }
  ],
  logs: [
    { time: "18:50:11", type: "SYSTEM", text: "[EMLESS Core] Kernel initialized. Modular Transport Layer active." },
    { time: "18:50:22", type: "MTPROTO", text: "[Telegram Proxy] MTG service listening on port 8444 (Fake TLS enabled)." },
    { time: "18:51:04", type: "VLESS", text: "[VLESS-REALITY] Handshake validated with client SNI www.speedtest.net." },
    { time: "18:51:30", type: "ROUTING", text: "[FragmentEngine] ClientHello packet fragmented (100-200 B, 10-20 ms delay)." }
  ]
};

class StorageManager {
  constructor() {
    this.data = JSON.parse(JSON.stringify(defaultData));
    this.pgPool = null;
    this.usePostgres = false;
  }

  async init() {
    // If PostgreSQL DATABASE_URL is provided, try initializing PG
    if (config.databaseUrl) {
      try {
        this.pgPool = new Pool({
          connectionString: config.databaseUrl,
          ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
        });
        await this.initPostgresSchema();
        this.usePostgres = true;
        console.log('[EMLESS DB] Successfully connected to PostgreSQL database.');
        await this.loadFromPostgres();
        return;
      } catch (err) {
        console.warn('[EMLESS DB] Failed to connect to PostgreSQL, falling back to persistent file storage:', err.message);
      }
    }

    // Fallback persistent file storage
    this.loadFromFile();
  }

  async initPostgresSchema() {
    const query = `
      CREATE TABLE IF NOT EXISTS emless_kv (
        key VARCHAR(128) PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await this.pgPool.query(query);
  }

  normalizeData(data) {
    if (!data.systemSettings) data.systemSettings = { ...defaultData.systemSettings };
    if (!data.systemSettings.defaultTransportMode) {
      data.systemSettings.defaultTransportMode = config.defaultTransportMode || 'standard';
    }
    if (config.domain && (!data.systemSettings.domain || data.systemSettings.domain === 'gateway.emless.network')) {
      data.systemSettings.domain = config.domain;
    }
    if (config.adminUsername && data.adminUsername === 'admin' && config.adminUsername !== 'admin') {
      data.adminUsername = config.adminUsername;
    }
    if (config.adminPassword && data.adminPassword === '123456' && config.adminPassword !== '123456') {
      data.adminPassword = config.adminPassword;
    }
    if (!data.secretKey || data.secretKey.length < 8) {
      data.secretKey = config.secretKey;
    }
    if (!data.telegramProxy) {
      data.telegramProxy = { ...defaultData.telegramProxy };
    }
    if (config.mtproxyPort && data.telegramProxy.port !== config.mtproxyPort) {
      data.telegramProxy.port = config.mtproxyPort;
    }

    if (!Array.isArray(data.inbounds)) {
      data.inbounds = defaultData.inbounds ? [...defaultData.inbounds] : [];
    } else {
      data.inbounds = data.inbounds.map(inb => {
        if (!inb.transportMode) {
          inb.transportMode = 'standard';
        }
        return inb;
      });
    }

    if (!Array.isArray(data.clients)) {
      data.clients = defaultData.clients ? [...defaultData.clients] : [];
    }

    if (!Array.isArray(data.logs)) {
      data.logs = defaultData.logs ? [...defaultData.logs] : [];
    }
    return data;
  }

  async loadFromPostgres() {
    try {
      const res = await this.pgPool.query('SELECT value FROM emless_kv WHERE key = $1', ['state']);
      if (res.rows.length > 0) {
        this.data = this.normalizeData({ ...defaultData, ...res.rows[0].value });
      } else {
        await this.saveToPostgres();
      }
    } catch (e) {
      console.error('[EMLESS DB] Error reading from PostgreSQL:', e);
    }
  }

  async saveToPostgres() {
    if (!this.pgPool) return;
    try {
      await this.pgPool.query(
        `INSERT INTO emless_kv (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW();`,
        ['state', JSON.stringify(this.data)]
      );
    } catch (e) {
      console.error('[EMLESS DB] Error saving to PostgreSQL:', e);
    }
  }

  loadFromFile() {
    try {
      let dbPath = config.dbPath;
      
      // Ensure target directory exists idempotently
      try {
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      } catch (dirErr) {
        console.warn(`[EMLESS DB] Could not create directory for ${dbPath}, falling back to local panel.db:`, dirErr.message);
        dbPath = path.resolve(process.cwd(), 'panel.db');
      }

      if (fs.existsSync(dbPath)) {
        const raw = fs.readFileSync(dbPath, 'utf-8');
        const parsed = JSON.parse(raw);
        this.data = this.normalizeData({ ...defaultData, ...parsed });
        console.log(`[EMLESS DB] Loaded state from persistent storage: ${dbPath}`);
      } else {
        // Check for migration from legacy locations
        const legacyCandidates = [
          '/data/emless-data.json',
          '/data/rvg-data.json',
          path.resolve(process.cwd(), 'emless-data.json'),
          path.resolve(process.cwd(), 'panel.db')
        ];

        let migrated = false;
        for (const candidate of legacyCandidates) {
          if (candidate !== dbPath && fs.existsSync(candidate)) {
            try {
              const raw = fs.readFileSync(candidate, 'utf-8');
              const parsed = JSON.parse(raw);
              this.data = this.normalizeData({ ...defaultData, ...parsed });
              console.log(`[EMLESS DB] Migrated persistent state from ${candidate} -> ${dbPath}`);
              migrated = true;
              break;
            } catch (_) {}
          }
        }

        this.saveToFile(dbPath);
        if (!migrated) {
          console.log(`[EMLESS DB] Initialized fresh state at: ${dbPath}`);
        }
      }
    } catch (err) {
      console.error('[EMLESS DB] Error loading state file:', err);
    }
  }

  saveToFile(targetPath = null) {
    let dbPath = targetPath || config.dbPath;
    try {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(dbPath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.warn(`[EMLESS DB] Could not save to ${dbPath} (${err.message}). Trying fallback ./panel.db...`);
      try {
        const fallbackPath = path.resolve(process.cwd(), 'panel.db');
        fs.writeFileSync(fallbackPath, JSON.stringify(this.data, null, 2), 'utf-8');
      } catch (fallbackErr) {
        console.error('[EMLESS DB] Critical error saving state file:', fallbackErr);
      }
    }
  }

  async save() {
    if (this.usePostgres) {
      await this.saveToPostgres();
    }
    this.saveToFile();
  }

  getState() {
    return this.data;
  }
}

export const storage = new StorageManager();
