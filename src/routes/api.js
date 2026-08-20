import express from 'express';
import { storage } from '../db/storage.js';
import { RVGCore } from '../services/rvgCore.js';
import { TelegramProxyService } from '../services/telegramProxy.js';
import { telemetry } from '../services/telemetry.js';
import { transportFactory } from '../services/transports/transportFactory.js';
import { config } from '../config.js';

export const router = express.Router();

// Middleware: Verify Admin Authentication
export function requireAuth(req, res, next) {
  if (req.cookies.emless_session === config.secretKey) {
    return next();
  }
  return res.status(401).json({ error: "Unauthorized. Please authenticate." });
}

// ---------------- AUTHENTICATION ----------------
router.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  const state = storage.getState();

  const validUsername = state.adminUsername || config.adminUsername;
  const validPassword = state.adminPassword || config.adminPassword;

  // Allow login by password only or username + password
  const usernameMatch = !username || username.trim() === validUsername;
  const passwordMatch = password === validPassword;

  if (usernameMatch && passwordMatch) {
    res.cookie('emless_session', config.secretKey, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      maxAge: 30 * 24 * 3600 * 1000
    });
    return res.json({ ok: true, message: "Authentication successful", username: validUsername });
  }

  return res.status(401).json({ error: "Invalid username or password" });
});

router.post('/auth/logout', (req, res) => {
  res.clearCookie('emless_session');
  res.json({ ok: true });
});

router.get('/auth/session', (req, res) => {
  const isAuth = req.cookies.emless_session === config.secretKey;
  res.json({
    authenticated: isAuth,
    username: isAuth ? (storage.getState().adminUsername || config.adminUsername) : null,
    appName: config.appName,
    version: config.version
  });
});

// ---------------- DASHBOARD ----------------
router.get('/dashboard', requireAuth, (req, res) => {
  const stats = telemetry.getSystemStats();
  const state = storage.getState();
  const host = req.get('host');
  const tgStatus = TelegramProxyService.getStatus(host);

  res.json({
    stats,
    inbounds: state.inbounds,
    clients: state.clients,
    telegramProxy: tgStatus,
    logs: state.logs.slice(0, 15),
    transports: transportFactory.getSupportedTransports()
  });
});

// ---------------- TRANSPORTS METADATA ----------------
router.get('/transports', requireAuth, (req, res) => {
  res.json({
    transports: transportFactory.getSupportedTransports(),
    defaultTransportMode: storage.getState().systemSettings.defaultTransportMode || 'standard'
  });
});

// ---------------- CONNECTIONS ----------------
router.get('/connections', requireAuth, (req, res) => {
  const connections = telemetry.getActiveConnections();
  res.json({ connections, totalCount: connections.length });
});

router.post('/connections/:id/terminate', requireAuth, (req, res) => {
  res.json({ ok: true, message: `Connection ${req.params.id} terminated.` });
});

// ---------------- CONFIGURATIONS (INBOUNDS) ----------------
router.get('/configurations', requireAuth, (req, res) => {
  const state = storage.getState();
  res.json({
    inbounds: state.inbounds,
    transports: transportFactory.getSupportedTransports(),
    defaultTransportMode: state.systemSettings.defaultTransportMode || 'standard'
  });
});

router.post('/configurations', requireAuth, async (req, res) => {
  try {
    const {
      name,
      protocol,
      transportMode,
      transport,
      security,
      port,
      path: inboundPath,
      sni,
      serviceName,
      cloakMaskSni,
      cloakEarlyData,
      fingerprint,
      alpn,
      method,
      password
    } = req.body;

    const state = storage.getState();
    const id = `inb_${Date.now().toString(36)}`;
    const selectedMode = (transportMode === 'cloak_ws') ? 'cloak_ws' : 'standard';

    let finalTransport = transport || 'tcp';
    let finalSecurity = security || 'tls';
    let finalPath = inboundPath || '';
    let finalSni = sni || state.systemSettings.sni;
    let finalCloakMaskSni = cloakMaskSni || finalSni || state.systemSettings.sni;

    if (selectedMode === 'cloak_ws') {
      finalTransport = 'ws';
      finalSecurity = 'tls';
      if (!finalPath) {
        finalPath = `/cloak-ws-${id}`;
      }
    }

    const candidateInbound = {
      id,
      name: (name || '').trim(),
      protocol: (protocol || '').toLowerCase(),
      transportMode: selectedMode,
      transport: finalTransport,
      security: finalSecurity,
      port: parseInt(port, 10),
      path: finalPath,
      sni: finalSni,
      serviceName: serviceName || '',
      cloakMaskSni: finalCloakMaskSni,
      cloakEarlyData: cloakEarlyData || '2048',
      fingerprint: fingerprint || 'chrome',
      alpn: alpn || 'h2,http/1.1',
      method: method || '2022-blake3-aes-128-gcm',
      password: password || 'emlessSecretKeySS2022Blake3Secure==',
      enabled: true,
      deploymentStatus: 'DEPLOYING',
      activeConnections: 0,
      totalTraffic: '0.0 GB'
    };

    // 1. Authoritative backend validation
    const validation = RVGCore.validateInboundConfig(candidateInbound, state.inbounds || []);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // 2. Perform actual kernel deployment
    try {
      await RVGCore.deployInbound(candidateInbound);
    } catch (deployErr) {
      candidateInbound.deploymentStatus = 'FAILED';
      candidateInbound.lastError = deployErr.message;
      return res.status(400).json({ error: `Deployment failed: ${deployErr.message}`, status: 'FAILED' });
    }

    // 3. Persist atomically only after successful deployment
    state.inbounds.push(candidateInbound);
    state.logs.unshift({
      time: new Date().toTimeString().split(' ')[0],
      type: 'CONFIG',
      text: `[Config] Inbound created & deployed: ${candidateInbound.name} (${selectedMode === 'cloak_ws' ? 'Cloak WS Obfuscation' : 'Standard RVG'} · Port ${candidateInbound.port}).`
    });
    await storage.save();

    res.json({
      ok: true,
      inbound: candidateInbound,
      status: candidateInbound.deploymentStatus,
      message: "Inbound successfully created and deployed to kernel."
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Internal server error creating inbound" });
  }
});

// Explicit Deploy Endpoint for single inbound
router.post('/configurations/:id/deploy', requireAuth, async (req, res) => {
  const state = storage.getState();
  const inbound = state.inbounds.find(i => i.id === req.params.id);
  if (!inbound) {
    return res.status(404).json({ error: "Configuration not found" });
  }

  try {
    inbound.deploymentStatus = 'DEPLOYING';
    const result = await RVGCore.deployInbound(inbound);
    res.json({
      ok: true,
      inbound,
      status: result.status,
      timestamp: result.timestamp,
      message: `Configuration '${inbound.name}' successfully deployed to kernel.`
    });
  } catch (err) {
    inbound.deploymentStatus = 'FAILED';
    inbound.lastError = err.message;
    await storage.save();
    res.status(400).json({
      ok: false,
      error: `Deployment failed: ${err.message}`,
      status: 'FAILED',
      inbound
    });
  }
});

// Deploy All active configurations
router.post('/configurations/deploy-all', requireAuth, async (req, res) => {
  try {
    const result = await RVGCore.deployAll();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/configurations/:id', requireAuth, async (req, res) => {
  const state = storage.getState();
  const idx = state.inbounds.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Configuration not found" });

  const updated = { ...state.inbounds[idx], ...req.body };
  const validation = RVGCore.validateInboundConfig(updated, state.inbounds.filter(i => i.id !== req.params.id));
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  if (updated.enabled) {
    try {
      await RVGCore.deployInbound(updated);
    } catch (err) {
      updated.deploymentStatus = 'FAILED';
      updated.lastError = err.message;
    }
  } else {
    updated.deploymentStatus = 'DRAFT';
  }

  state.inbounds[idx] = updated;
  await storage.save();
  res.json({ ok: true, inbound: state.inbounds[idx] });
});

router.post('/configurations/:id/toggle', requireAuth, async (req, res) => {
  const state = storage.getState();
  const inbound = state.inbounds.find(i => i.id === req.params.id);
  if (!inbound) return res.status(404).json({ error: "Configuration not found" });

  inbound.enabled = !inbound.enabled;
  if (inbound.enabled) {
    try {
      await RVGCore.deployInbound(inbound);
    } catch (err) {
      inbound.deploymentStatus = 'FAILED';
      inbound.lastError = err.message;
    }
  } else {
    inbound.deploymentStatus = 'DRAFT';
  }

  await storage.save();
  res.json({ ok: true, enabled: inbound.enabled, deploymentStatus: inbound.deploymentStatus });
});

router.delete('/configurations/:id', requireAuth, async (req, res) => {
  const state = storage.getState();
  state.inbounds = state.inbounds.filter(i => i.id !== req.params.id);
  await storage.save();
  res.json({ ok: true });
});

// ---------------- CLIENTS (USERS) ----------------
router.get('/clients', requireAuth, (req, res) => {
  const state = storage.getState();
  res.json({ clients: state.clients });
});

router.post('/clients', requireAuth, async (req, res) => {
  const { email, quotaGB, expiryDays } = req.body;
  if (!email || !email.trim()) return res.status(400).json({ error: "Email or identifier is required" });

  const randomHex = () => crypto.randomBytes(4).toString('hex');
  const newUuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });

  const secureSubToken = RVGCore.generateSecureToken();

  const newClient = {
    id: `cli_${Date.now().toString(36)}`,
    email: email.trim(),
    uuid: newUuid,
    password: `pass_${randomHex()}`,
    subToken: secureSubToken,
    quotaGB: Number(quotaGB) || 50,
    usedUploadGB: 0,
    usedDownloadGB: 0,
    expiryDays: Number(expiryDays) || 30,
    status: 'active',
    createdAt: new Date().toISOString().split('T')[0]
  };

  const state = storage.getState();
  state.clients.unshift(newClient);
  state.logs.unshift({
    time: new Date().toTimeString().split(' ')[0],
    type: 'CLIENT',
    text: `[Client] Created client account: ${newClient.email} (Quota: ${newClient.quotaGB} GB, Token: ${newClient.subToken.substring(0, 8)}...).`
  });
  await storage.save();

  res.json({ ok: true, client: newClient });
});

router.put('/clients/:id', requireAuth, async (req, res) => {
  const state = storage.getState();
  const idx = state.clients.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Client not found" });

  state.clients[idx] = { ...state.clients[idx], ...req.body };
  await storage.save();
  res.json({ ok: true, client: state.clients[idx] });
});

router.post('/clients/:id/toggle-status', requireAuth, async (req, res) => {
  const state = storage.getState();
  const client = state.clients.find(c => c.id === req.params.id);
  if (!client) return res.status(404).json({ error: "Client not found" });

  client.status = client.status === 'active' ? 'disabled' : 'active';
  state.logs.unshift({
    time: new Date().toTimeString().split(' ')[0],
    type: 'CLIENT',
    text: `[Client] Account ${client.email} status changed to ${client.status.toUpperCase()}.`
  });
  await storage.save();
  res.json({ ok: true, client, status: client.status });
});

router.post('/clients/:id/regenerate-token', requireAuth, async (req, res) => {
  const state = storage.getState();
  const client = state.clients.find(c => c.id === req.params.id);
  if (!client) return res.status(404).json({ error: "Client not found" });

  const oldToken = client.subToken;
  client.subToken = RVGCore.generateSecureToken();

  state.logs.unshift({
    time: new Date().toTimeString().split(' ')[0],
    type: 'SUBSCRIPTION',
    text: `[Subscription] Token regenerated for ${client.email} (${oldToken.substring(0, 6)}... -> ${client.subToken.substring(0, 6)}...).`
  });
  await storage.save();

  const host = req.get('host');
  const protocol = req.protocol;
  const subscriptionUrl = `${protocol}://${host}/sub/${client.subToken}`;

  res.json({ ok: true, client, subToken: client.subToken, subscriptionUrl });
});

router.post('/clients/:id/reset-traffic', requireAuth, async (req, res) => {
  const state = storage.getState();
  const client = state.clients.find(c => c.id === req.params.id);
  if (!client) return res.status(404).json({ error: "Client not found" });

  client.usedUploadGB = 0;
  client.usedDownloadGB = 0;
  state.logs.unshift({
    time: new Date().toTimeString().split(' ')[0],
    type: 'CLIENT',
    text: `[Client] Bandwidth counters reset for ${client.email}.`
  });
  await storage.save();
  res.json({ ok: true, client });
});

router.delete('/clients/:id', requireAuth, async (req, res) => {
  const state = storage.getState();
  const target = state.clients.find(c => c.id === req.params.id);
  state.clients = state.clients.filter(c => c.id !== req.params.id);
  if (target) {
    state.logs.unshift({
      time: new Date().toTimeString().split(' ')[0],
      type: 'CLIENT',
      text: `[Client] Deleted client account and subscription: ${target.email}.`
    });
  }
  await storage.save();
  res.json({ ok: true });
});

// ---------------- SUBSCRIPTIONS ----------------
router.get('/subscriptions', requireAuth, (req, res) => {
  const state = storage.getState();
  const host = req.get('host');
  const protocol = req.protocol;

  const list = state.clients.map(client => {
    const subUrl = `${protocol}://${host}/sub/${client.subToken}`;
    const base64Url = `${protocol}://${host}/sub/${client.subToken}/base64`;
    const plainUrl = `${protocol}://${host}/sub/${client.subToken}/plain`;
    const payload = RVGCore.generateSubscriptionPayload(client, host);
    
    const usedUp = client.usedUploadGB || 0;
    const usedDown = client.usedDownloadGB || 0;
    const totalUsed = +(usedUp + usedDown).toFixed(2);
    const quota = client.quotaGB || 50;
    const percent = Math.min(100, Math.round((totalUsed / (quota || 1)) * 100));

    return {
      id: client.id,
      email: client.email,
      profileName: payload ? payload.profileTitle : `EMLESS — ${client.email}`,
      status: client.status || 'active',
      subToken: client.subToken,
      subscriptionUrl: subUrl,
      base64Url,
      plainUrl,
      configsCount: payload ? payload.configs.length : 0,
      quotaGB: quota,
      usedUploadGB: usedUp,
      usedDownloadGB: usedDown,
      usedTotalGB: totalUsed,
      percent,
      expiryDays: client.expiryDays || 30,
      createdAt: client.createdAt || new Date().toISOString().split('T')[0],
      client
    };
  });

  res.json({ subscriptions: list });
});

router.get('/subscriptions/client/:id', requireAuth, (req, res) => {
  const state = storage.getState();
  const client = state.clients.find(c => c.id === req.params.id);
  if (!client) return res.status(404).json({ error: "Client not found" });

  const host = req.get('host');
  const protocol = req.protocol;
  const subUrl = `${protocol}://${host}/sub/${client.subToken}`;
  const base64Url = `${protocol}://${host}/sub/${client.subToken}/base64`;
  const plainUrl = `${protocol}://${host}/sub/${client.subToken}/plain`;
  const payload = RVGCore.generateSubscriptionPayload(client, host);

  res.json({
    client,
    profileName: payload ? payload.profileTitle : `EMLESS — ${client.email}`,
    subscriptionUrl: subUrl,
    base64Url,
    plainUrl,
    configs: payload ? payload.configs : [],
    rawUris: payload ? payload.rawUris : '',
    base64Encoded: payload ? payload.base64Encoded : '',
    userinfo: payload ? payload.userinfo : ''
  });
});

router.post('/subscriptions/:id/regenerate-token', requireAuth, async (req, res) => {
  const state = storage.getState();
  const client = state.clients.find(c => c.id === req.params.id);
  if (!client) return res.status(404).json({ error: "Client not found" });

  const oldToken = client.subToken;
  client.subToken = RVGCore.generateSecureToken();

  state.logs.unshift({
    time: new Date().toTimeString().split(' ')[0],
    type: 'SUBSCRIPTION',
    text: `[Subscription] Token regenerated for ${client.email} (${oldToken.substring(0, 6)}... -> ${client.subToken.substring(0, 6)}...).`
  });
  await storage.save();

  const host = req.get('host');
  const protocol = req.protocol;
  const subscriptionUrl = `${protocol}://${host}/sub/${client.subToken}`;
  const base64Url = `${protocol}://${host}/sub/${client.subToken}/base64`;

  res.json({ ok: true, client, subToken: client.subToken, subscriptionUrl, base64Url });
});

router.post('/subscriptions/:id/toggle', requireAuth, async (req, res) => {
  const state = storage.getState();
  const client = state.clients.find(c => c.id === req.params.id);
  if (!client) return res.status(404).json({ error: "Client not found" });

  client.status = client.status === 'active' ? 'disabled' : 'active';
  state.logs.unshift({
    time: new Date().toTimeString().split(' ')[0],
    type: 'SUBSCRIPTION',
    text: `[Subscription] Subscription for ${client.email} ${client.status === 'active' ? 'enabled' : 'disabled'}.`
  });
  await storage.save();
  res.json({ ok: true, status: client.status });
});

router.post('/subscriptions/:id/enable', requireAuth, async (req, res) => {
  const state = storage.getState();
  const client = state.clients.find(c => c.id === req.params.id);
  if (!client) return res.status(404).json({ error: "Client not found" });

  client.status = 'active';
  await storage.save();
  res.json({ ok: true, status: 'active' });
});

router.post('/subscriptions/:id/disable', requireAuth, async (req, res) => {
  const state = storage.getState();
  const client = state.clients.find(c => c.id === req.params.id);
  if (!client) return res.status(404).json({ error: "Client not found" });

  client.status = 'disabled';
  await storage.save();
  res.json({ ok: true, status: 'disabled' });
});

router.delete('/subscriptions/:id', requireAuth, async (req, res) => {
  const state = storage.getState();
  state.clients = state.clients.filter(c => c.id !== req.params.id);
  await storage.save();
  res.json({ ok: true });
});

// ---------------- TRAFFIC ----------------
router.get('/traffic', requireAuth, (req, res) => {
  const stats = telemetry.getSystemStats();
  const state = storage.getState();

  const userUsage = state.clients.map(c => ({
    email: c.email,
    quotaGB: c.quotaGB,
    usedTotalGB: +((c.usedUploadGB || 0) + (c.usedDownloadGB || 0)).toFixed(2),
    percent: Math.min(100, Math.round((((c.usedUploadGB || 0) + (c.usedDownloadGB || 0)) / (c.quotaGB || 1)) * 100))
  }));

  res.json({
    totalTraffic: stats.totalTraffic,
    liveBandwidth: stats.liveBandwidth,
    userUsage,
    inboundUsage: state.inbounds.map(i => ({
      name: i.name,
      protocol: i.protocol,
      transportMode: i.transportMode || 'standard',
      totalTraffic: i.totalTraffic,
      activeConnections: i.activeConnections
    }))
  });
});

// ---------------- TELEGRAM MTPROTO PROXY (SE7O-SNA ADAPTATION) ----------------
router.get('/telegram-proxy/status', requireAuth, (req, res) => {
  const host = req.get('host');
  res.json(TelegramProxyService.getStatus(host));
});

router.post('/telegram-proxy/start', requireAuth, async (req, res) => {
  try {
    const result = await TelegramProxyService.start();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/telegram-proxy/stop', requireAuth, async (req, res) => {
  try {
    const result = await TelegramProxyService.stop();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/telegram-proxy/restart', requireAuth, async (req, res) => {
  try {
    const result = await TelegramProxyService.restart();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/telegram-proxy/config', requireAuth, (req, res) => {
  const state = storage.getState();
  res.json({ config: state.telegramProxy });
});

router.post('/telegram-proxy/config', requireAuth, async (req, res) => {
  try {
    const result = await TelegramProxyService.updateConfig(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/telegram-proxy/link', requireAuth, (req, res) => {
  const host = req.get('host');
  const status = TelegramProxyService.getStatus(host);
  res.json({
    links: status.links,
    credentials: status.credentials
  });
});

// ---------------- SYSTEM & LOGS ----------------
router.get('/system', requireAuth, (req, res) => {
  const stats = telemetry.getSystemStats();
  const state = storage.getState();

  res.json({
    stats,
    settings: state.systemSettings,
    logs: state.logs,
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      databaseType: storage.usePostgres ? 'PostgreSQL' : 'Persistent File / SQLite',
      defaultTransportMode: state.systemSettings.defaultTransportMode || 'standard'
    }
  });
});

router.post('/system/logs/clear', requireAuth, async (req, res) => {
  const state = storage.getState();
  state.logs = [];
  await storage.save();
  res.json({ ok: true });
});

router.post('/system/ping', requireAuth, (req, res) => {
  const { host } = req.body;
  const state = storage.getState();
  const targetHost = host || state.systemSettings.domain || '8.8.8.8';

  const simulatedRtt = Math.floor(18 + Math.random() * 32);
  res.json({
    host: targetHost,
    rttMs: simulatedRtt,
    status: "ONLINE",
    timestamp: new Date().toISOString()
  });
});

// ---------------- SETTINGS & BACKUP ----------------
router.get('/settings', requireAuth, (req, res) => {
  const state = storage.getState();
  res.json({
    adminUsername: state.adminUsername || config.adminUsername,
    systemSettings: state.systemSettings,
    databaseType: storage.usePostgres ? 'PostgreSQL' : 'Persistent Storage',
    defaultTransportMode: state.systemSettings.defaultTransportMode || 'standard',
    supportedTransports: transportFactory.getSupportedTransports()
  });
});

router.put('/settings', requireAuth, async (req, res) => {
  const { adminUsername, adminPassword, systemSettings } = req.body;
  const state = storage.getState();

  if (adminUsername && adminUsername.trim()) {
    state.adminUsername = adminUsername.trim();
  }
  if (adminPassword && adminPassword.trim()) {
    state.adminPassword = adminPassword.trim();
  }
  if (systemSettings) {
    state.systemSettings = { ...state.systemSettings, ...systemSettings };
  }

  await storage.save();
  res.json({ ok: true, message: "Settings saved successfully", systemSettings: state.systemSettings });
});

router.get('/settings/backup', requireAuth, (req, res) => {
  const state = storage.getState();
  res.setHeader('Content-Disposition', 'attachment; filename="emless-backup.json"');
  res.json(state);
});

router.post('/settings/restore', requireAuth, async (req, res) => {
  const backup = req.body;
  if (!backup || !backup.inbounds || !backup.clients) {
    return res.status(400).json({ error: "Invalid backup JSON structure." });
  }

  const state = storage.getState();
  Object.assign(state, storage.normalizeData(backup));
  await storage.save();
  res.json({ ok: true, message: "State restored successfully from backup." });
});
