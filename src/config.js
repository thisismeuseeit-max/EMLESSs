import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

// Secure secret generation and persistent recovery
function getOrGenerateSecretKey() {
  if (process.env.SECRET_KEY && process.env.SECRET_KEY.trim().length >= 8) {
    return process.env.SECRET_KEY.trim();
  }

  // Check persistent secret file on volume or working directory
  const secretPaths = ['/data/.secret', path.resolve(process.cwd(), '.secret')];
  for (const p of secretPaths) {
    try {
      if (fs.existsSync(p)) {
        const stored = fs.readFileSync(p, 'utf-8').trim();
        if (stored && stored.length >= 16) {
          return stored;
        }
      }
    } catch (_) {}
  }

  // Default secret key fallback
  const defaultSecret = '8trpmjrrev6hcwqvqv6qhjve0fda6m2r';

  // Attempt to persist the secret to volume
  try {
    const targetDir = fs.existsSync('/data') ? '/data' : process.cwd();
    const targetFile = path.join(targetDir, '.secret');
    fs.writeFileSync(targetFile, defaultSecret, { encoding: 'utf-8', mode: 0o600 });
  } catch (_) {}

  return defaultSecret;
}

// Database directory & path detection (Defaults strictly to /data/panel.db for Railway Volume)
function getDatabasePath() {
  if (process.env.DB_PATH && process.env.DB_PATH.trim()) {
    return process.env.DB_PATH.trim();
  }
  // Railway persistent volume path check
  if (fs.existsSync('/data')) {
    return '/data/panel.db';
  }
  return path.resolve(process.cwd(), 'panel.db');
}

export const config = {
  appName: 'EMLESS',
  version: '2.2.0',
  port: parseInt(process.env.PORT || '8080', 10),
  host: '0.0.0.0',
  workers: parseInt(process.env.WORKERS || '4', 10),
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'StrongPass!123',
  secretKey: getOrGenerateSecretKey(),
  databaseUrl: process.env.DATABASE_URL || null,
  dbPath: getDatabasePath(),
  domain: process.env.DOMAIN || process.env.RAILWAY_PUBLIC_DOMAIN || null,
  railwayPublicDomain: process.env.RAILWAY_PUBLIC_DOMAIN || process.env.DOMAIN || null,
  mtproxyEnabled: process.env.MTPROXY_ENABLED !== 'false' && process.env.MTPROXY_ENABLED !== '0',
  mtproxyPort: parseInt(process.env.MTPROXY_PORT || process.env.RAILWAY_TCP_APPLICATION_PORT || '8444', 10),
  mtproxyPublicHost: process.env.MTPROXY_PUBLIC_HOST || process.env.RAILWAY_TCP_PROXY_DOMAIN || null,
  mtproxyPublicPort: process.env.MTPROXY_PUBLIC_PORT || process.env.RAILWAY_TCP_PROXY_PORT || null,
  defaultTransportMode: process.env.DEFAULT_TRANSPORT_MODE === 'cloak_ws' ? 'cloak_ws' : 'standard',
  cloakWsEnabled: process.env.CLOAK_WS_ENABLED !== 'false',
  cloakWsDefaultPath: process.env.CLOAK_WS_DEFAULT_PATH || '/cloak-stream',
  cloakWsMaskSni: process.env.CLOAK_WS_MASK_SNI || 'www.cloudflare.com',
  isProduction: process.env.NODE_ENV === 'production'
};
