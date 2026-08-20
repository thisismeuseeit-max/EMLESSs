import { BaseTransport } from './baseTransport.js';

/**
 * Cloak WS Transport Provider.
 * Optional WebSocket-based obfuscation and transport layer.
 * 
 * Features:
 * - WebSocket camouflage stream with early data 0-RTT support (RFC 8446)
 * - Domain fronting / Masking SNI header simulation
 * - Browser fingerprint masquerading (Chrome / Safari TLS fingerprint emulation)
 * - Obfuscated HTTP Upgrade headers and randomized path routing
 */
export class CloakWSTransport extends BaseTransport {
  constructor() {
    super('cloak_ws', 'Optional WebSocket-based obfuscation/transport layer.');
  }

  generateConfig(inbound, client, systemSettings, domain) {
    if (!inbound || !inbound.enabled) return null;

    const effectiveDomain = domain || systemSettings.domain || systemSettings.serverIp || '127.0.0.1';
    const tagSuffix = inbound.name ? `${inbound.name} · ${client.email}` : `EMLESS-CloakWS · ${client.email}`;

    // Cloak WS specific parameters with safe auto-generated fallbacks
    const cloakPath = inbound.path || `/cloak-ws-${inbound.id || 'stream'}`;
    const maskSni = inbound.cloakMaskSni || inbound.sni || systemSettings.sni || effectiveDomain;
    const earlyData = inbound.cloakEarlyData || '2048';
    const fp = inbound.fingerprint || 'chrome';
    const alpn = inbound.alpn || 'h2,http/1.1';

    if (inbound.protocol === 'vless') {
      const encodedPath = encodeURIComponent(cloakPath);
      // VLESS + Cloak WS Obfuscated URI
      const uri = `vless://${client.uuid}@${effectiveDomain}:${inbound.port}?type=ws&security=tls&path=${encodedPath}&host=${encodeURIComponent(maskSni)}&sni=${encodeURIComponent(maskSni)}&fp=${fp}&alpn=${encodeURIComponent(alpn)}&ed=${earlyData}#${encodeURIComponent(tagSuffix)}`;

      return {
        id: inbound.id,
        name: inbound.name,
        protocol: 'vless',
        transportMode: 'cloak_ws',
        transport: 'ws',
        security: 'tls',
        uri,
        details: {
          port: inbound.port,
          path: cloakPath,
          sni: maskSni,
          host: maskSni,
          uuid: client.uuid,
          fingerprint: fp,
          earlyData,
          transportMode: 'cloak_ws'
        }
      };
    } else if (inbound.protocol === 'trojan') {
      const encodedPath = encodeURIComponent(cloakPath);
      // Trojan + Cloak WS Obfuscated URI
      const uri = `trojan://${client.password}@${effectiveDomain}:${inbound.port}?type=ws&security=tls&path=${encodedPath}&host=${encodeURIComponent(maskSni)}&sni=${encodeURIComponent(maskSni)}&fp=${fp}&alpn=${encodeURIComponent(alpn)}&ed=${earlyData}#${encodeURIComponent(tagSuffix)}`;

      return {
        id: inbound.id,
        name: inbound.name,
        protocol: 'trojan',
        transportMode: 'cloak_ws',
        transport: 'ws',
        security: 'tls',
        uri,
        details: {
          port: inbound.port,
          path: cloakPath,
          sni: maskSni,
          host: maskSni,
          password: client.password,
          fingerprint: fp,
          earlyData,
          transportMode: 'cloak_ws'
        }
      };
    } else if (inbound.protocol === 'shadowsocks') {
      // Shadowsocks with Cloak/v2ray-plugin WS obfuscation
      const method = inbound.method || '2022-blake3-aes-128-gcm';
      const password = inbound.password || 'emlessSecretKeySS2022Blake3Secure==';
      const creds = Buffer.from(`${method}:${password}`).toString('base64');
      const pluginOpts = encodeURIComponent(`obfs=websocket;path=${cloakPath};host=${maskSni};tls`);
      const uri = `ss://${creds}@${effectiveDomain}:${inbound.port}?plugin=v2ray-plugin%3B${pluginOpts}#${encodeURIComponent(tagSuffix)}`;

      return {
        id: inbound.id,
        name: inbound.name,
        protocol: 'shadowsocks',
        transportMode: 'cloak_ws',
        transport: 'ws',
        security: 'tls',
        uri,
        details: {
          port: inbound.port,
          method,
          password,
          path: cloakPath,
          sni: maskSni,
          fingerprint: fp,
          transportMode: 'cloak_ws'
        }
      };
    }

    return null;
  }

  getDefaults(systemSettings) {
    const randomHex = Math.random().toString(36).substring(2, 8);
    return {
      transportMode: 'cloak_ws',
      transport: 'ws',
      security: 'tls',
      path: `/cloak-ws-stream-${randomHex}`,
      cloakMaskSni: systemSettings.sni || 'www.cloudflare.com',
      cloakEarlyData: '2048',
      fingerprint: 'chrome',
      alpn: 'h2,http/1.1'
    };
  }
}
