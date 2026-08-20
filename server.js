import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './src/config.js';
import { storage } from './src/db/storage.js';
import { router as apiRouter } from './src/routes/api.js';
import { RVGCore } from './src/services/rvgCore.js';
import { TelegramProxyService } from './src/services/telegramProxy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health Check Endpoint (Railway Operational Health Verification)
app.get('/health', (req, res) => {
  const state = storage.getState();
  const isReady = Boolean(state && state.systemSettings);

  if (!isReady) {
    return res.status(503).json({
      status: 'initializing',
      service: config.appName,
      timestamp: new Date().toISOString()
    });
  }

  res.json({
    status: 'ok',
    service: config.appName,
    version: config.version,
    uptimeSeconds: Math.floor(process.uptime()),
    database: storage.usePostgres ? 'postgresql' : 'volume_sqlite_json',
    dbPath: storage.usePostgres ? 'remote' : config.dbPath,
    mtprotoProxy: state.telegramProxy ? state.telegramProxy.status : 'disabled',
    timestamp: new Date().toISOString()
  });
});

// Dedicated EMLESS Subscription Handler (V2Ray / Xray / Hiddify / NekoBox / Sing-box / Shadowrocket)
function handleSubscriptionRequest(req, res, forceFormat = null) {
  const { token } = req.params;
  const state = storage.getState();
  const client = (state.clients || []).find(c => c.subToken === token);

  if (!client) {
    return res.status(404).type('text/plain; charset=utf-8').send('Subscription not found');
  }

  if (client.status === 'disabled') {
    return res.status(403).type('text/plain; charset=utf-8').send('Subscription is currently disabled');
  }

  const host = req.get('host');
  const payload = RVGCore.generateSubscriptionPayload(client, host);

  if (!payload) {
    return res.status(500).type('text/plain; charset=utf-8').send('Failed to generate subscription payload');
  }

  // Standard V2Ray metadata headers with real backend values
  res.setHeader('Subscription-Userinfo', payload.userinfo);
  res.setHeader('Profile-Update-Interval', '6');
  res.setHeader('Profile-Title', `base64:${Buffer.from(payload.profileTitle, 'utf-8').toString('base64')}`);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(payload.profileTitle)}.txt"`);

  // Format decision: query ?format=plain/raw or explicit route /sub/:token/plain or /sub/:token/base64
  const reqFormat = forceFormat || req.query.format || 'base64';

  if (reqFormat === 'plain' || reqFormat === 'raw') {
    // Return newline-separated standard protocol links (vless://, trojan://, ss://)
    return res.send(payload.rawUris);
  }

  // Standard Base64 subscription format: Single Base64 encoded UTF-8 string
  return res.send(payload.base64Encoded);
}

// Subscription Public Endpoints
app.get('/sub/:token/base64', (req, res) => handleSubscriptionRequest(req, res, 'base64'));
app.get('/sub/:token/plain', (req, res) => handleSubscriptionRequest(req, res, 'plain'));
app.get('/sub/:token/raw', (req, res) => handleSubscriptionRequest(req, res, 'plain'));
app.get('/sub/:token', (req, res) => handleSubscriptionRequest(req, res, null));

// Backwards compatibility & Aliases
app.get('/api/sub/:token', (req, res) => handleSubscriptionRequest(req, res, null));
app.get('/api/subscription/:token', (req, res) => handleSubscriptionRequest(req, res, null));


// API Routes
app.use('/api', apiRouter);

// Serve Frontend App
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'views', 'index.html'));
});

// Start Server
async function startServer() {
  await storage.init();
  
  // Initialize Telegram MTProto TCP Listener on separate port
  await TelegramProxyService.initTcpListener();

  const PORT = config.port;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`  🚀 EMLESS Control Center v${config.version} Ready`);
    console.log(`  🌐 Web Panel: http://0.0.0.0:${PORT}`);
    console.log(`  🔒 Admin User: ${config.adminUsername}`);
    console.log(`  🔑 Password Configured: ${config.adminPassword ? 'YES' : 'DEFAULT'}`);
    console.log(`  💾 Persistence Path: ${storage.usePostgres ? 'PostgreSQL' : config.dbPath}`);
    console.log(`  📡 MTProto TCP Listener: 0.0.0.0:${config.mtproxyPort}`);
    console.log(`======================================================\n`);
  });
}

startServer().catch(err => {
  console.error('[EMLESS] Fatal error during startup:', err);
  process.exit(1);
});
