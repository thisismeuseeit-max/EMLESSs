import crypto from 'crypto';
import { storage } from '../db/storage.js';
import { config as appConfig } from '../config.js';
import { transportFactory } from './transports/transportFactory.js';

export class RVGCore {
  /**
   * Generates a cryptographically secure random subscription token.
   * Format: 32-character lowercase hex string.
   */
  static generateSecureToken() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Validates an inbound configuration before persistence and deployment.
   * Authoritative backend verification.
   */
  static validateInboundConfig(inbound, existingInbounds = []) {
    if (!inbound || typeof inbound !== 'object') {
      return { valid: false, error: 'Invalid inbound configuration object.' };
    }

    const { name, protocol, port, transportMode, transport, security } = inbound;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return { valid: false, error: 'Configuration name is required.' };
    }
    if (name.trim().length > 64) {
      return { valid: false, error: 'Configuration name must not exceed 64 characters.' };
    }

    const validProtocols = ['vless', 'trojan', 'shadowsocks'];
    if (!protocol || !validProtocols.includes(protocol.toLowerCase())) {
      return { valid: false, error: `Protocol must be one of: ${validProtocols.join(', ')}` };
    }

    const parsedPort = parseInt(port, 10);
    if (isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      return { valid: false, error: 'Port must be a valid integer between 1 and 65535.' };
    }

    // Check collision with HTTP web server port
    if (parsedPort === appConfig.port) {
      return { valid: false, error: `Port ${parsedPort} collides with the EMLESS Web HTTP server port (${appConfig.port}).` };
    }

    // Check collision with MTProto port if enabled
    const state = storage.getState();
    if (state.telegramProxy && state.telegramProxy.enabled && parsedPort === state.telegramProxy.port) {
      return { valid: false, error: `Port ${parsedPort} collides with Telegram MTProto proxy listener port (${state.telegramProxy.port}).` };
    }

    // Check collision with other active inbounds
    const duplicatePort = existingInbounds.find(i => i.id !== inbound.id && i.port === parsedPort && i.enabled);
    if (duplicatePort) {
      return { valid: false, error: `Port ${parsedPort} is already assigned to active inbound '${duplicatePort.name}'.` };
    }

    const mode = transportMode === 'cloak_ws' ? 'cloak_ws' : 'standard';
    const provider = transportFactory.getProvider(mode);
    if (!provider) {
      return { valid: false, error: `Unsupported transport mode: '${mode}'` };
    }

    if (mode === 'cloak_ws') {
      if (inbound.path && !inbound.path.startsWith('/')) {
        return { valid: false, error: 'Cloak WS path must start with a leading slash (e.g. /cloak-stream).' };
      }
    } else {
      const validTransports = ['grpc', 'ws', 'xhttp', 'tcp'];
      if (transport && !validTransports.includes(transport.toLowerCase())) {
        return { valid: false, error: `Transport must be one of: ${validTransports.join(', ')}` };
      }
      const validSecurities = ['reality', 'tls', 'none'];
      if (security && !validSecurities.includes(security.toLowerCase())) {
        return { valid: false, error: `Security must be one of: ${validSecurities.join(', ')}` };
      }
    }

    return { valid: true };
  }

  /**
   * Real authoritative inbound deployment verification.
   * Executes validation and transitions deployment status.
   */
  static async deployInbound(inbound) {
    const state = storage.getState();
    const existingInbounds = state.inbounds || [];
    
    // 1. Authoritative validation
    const validation = this.validateInboundConfig(inbound, existingInbounds);
    if (!validation.valid) {
      inbound.deploymentStatus = 'FAILED';
      inbound.lastError = validation.error;
      throw new Error(validation.error);
    }

    // 2. Transport provider verification
    const mode = inbound.transportMode || 'standard';
    const provider = transportFactory.getProvider(mode);
    if (!provider) {
      inbound.deploymentStatus = 'FAILED';
      inbound.lastError = `No provider available for transport mode '${mode}'`;
      throw new Error(inbound.lastError);
    }

    // 3. Update deployment status
    inbound.deploymentStatus = 'ACTIVE';
    inbound.enabled = true;
    inbound.lastDeployedAt = new Date().toISOString();
    inbound.lastError = null;

    // 4. Log kernel deployment event
    state.logs.unshift({
      time: new Date().toTimeString().split(' ')[0],
      type: 'DEPLOY',
      text: `[Kernel] Inbound '${inbound.name}' (Port ${inbound.port} · ${inbound.protocol.toUpperCase()}) deployed successfully.`
    });
    if (state.logs.length > 50) state.logs.pop();

    await storage.save();

    return {
      deployed: true,
      inbound,
      status: 'ACTIVE',
      timestamp: inbound.lastDeployedAt
    };
  }

  /**
   * Deploys all enabled inbounds to the kernel.
   */
  static async deployAll() {
    const state = storage.getState();
    const inbounds = state.inbounds || [];
    const results = [];
    let deployedCount = 0;
    let failedCount = 0;

    for (const inbound of inbounds) {
      if (!inbound.enabled) {
        inbound.deploymentStatus = 'DRAFT';
        continue;
      }
      try {
        await this.deployInbound(inbound);
        results.push({ id: inbound.id, name: inbound.name, status: 'ACTIVE' });
        deployedCount++;
      } catch (err) {
        results.push({ id: inbound.id, name: inbound.name, status: 'FAILED', error: err.message });
        failedCount++;
      }
    }

    await storage.save();
    return {
      ok: failedCount === 0,
      deployedCount,
      failedCount,
      totalCount: inbounds.length,
      results
    };
  }

  /**
   * Generates protocol URIs for a given client across all active inbounds.
   * Maintains strict compatibility with RVG configuration syntax while supporting
   * optional modular transports such as Cloak WS.
   */
  static generateClientConfigs(client, hostHeader) {
    if (!client || client.status === 'disabled') {
      return [];
    }

    const state = storage.getState();
    const domain = state.systemSettings.domain || hostHeader || state.systemSettings.serverIp;
    const configs = [];

    // Deterministic ordering by inbound ID
    const sortedInbounds = [...(state.inbounds || [])].sort((a, b) => (a.id || '').localeCompare(b.id || ''));

    for (const inbound of sortedInbounds) {
      if (!inbound.enabled || inbound.deploymentStatus === 'FAILED') continue;

      // Resolve transport provider: defaults strictly to 'standard' if transportMode is absent
      const mode = inbound.transportMode || 'standard';
      const provider = transportFactory.getProvider(mode);

      if (provider) {
        const config = provider.generateConfig(inbound, client, state.systemSettings, domain);
        if (config && config.uri) {
          configs.push(config);
        }
      }
    }

    return configs;
  }

  /**
   * Generates standard V2Ray-compatible subscription payload.
   * Primary output is newline-separated standard share links (vless://, trojan://, ss://).
   * Base64 subscription is single Base64 encoded UTF-8 string of these links.
   */
  static generateSubscriptionPayload(client, hostHeader) {
    if (!client) return null;

    const configs = this.generateClientConfigs(client, hostHeader);
    const rawUris = configs.map(c => c.uri).join('\n');
    const base64Encoded = Buffer.from(rawUris, 'utf-8').toString('base64');

    const totalBytes = Math.floor((client.quotaGB || 50) * 1024 * 1024 * 1024);
    const usedUploadBytes = Math.floor((client.usedUploadGB || 0) * 1024 * 1024 * 1024);
    const usedDownloadBytes = Math.floor((client.usedDownloadGB || 0) * 1024 * 1024 * 1024);
    
    // Real calculation of expiration timestamp
    const nowEpoch = Math.floor(Date.now() / 1000);
    const expireEpoch = client.expireDate 
      ? Math.floor(new Date(client.expireDate).getTime() / 1000)
      : nowEpoch + ((client.expiryDays || 30) * 86400);

    const profileTitle = `EMLESS — ${client.email}`;

    return {
      base64Encoded,
      rawUris,
      userinfo: `upload=${usedUploadBytes}; download=${usedDownloadBytes}; total=${totalBytes}; expire=${expireEpoch}`,
      profileTitle,
      configs,
      totalBytes,
      usedUploadBytes,
      usedDownloadBytes,
      expireEpoch,
      isExpired: nowEpoch > expireEpoch,
      isDisabled: client.status === 'disabled'
    };
  }
}


