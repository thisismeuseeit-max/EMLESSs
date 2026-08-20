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
    if (!inbound.enabled) return null;

    // Cloak WS specific parameters with safe auto-generated fallbacks
    const cloakPath = inbound.path || `/cloak-ws-${inbound.id || 'stream'}`;
    const maskSni = inbound.cloakMaskSni || inbound.sni || systemSettings.sni || domain;
    const earlyData = inbound.cloakEarlyData || '2048';
    const fp = inbound.fingerprint || 'chrome';
    const alpn = inbound.alpn || 'h2,http/1.1';

    if (inbound.protocol === 'vless') {
      const encodedPath = encodeURIComponent(cloakPath);
      // VLESS + Cloak WS Obfuscated URI
      const uri = `vless://${client.uuid}@${domain}:${inbound.port}?type=ws&security=tls&path=${encodedPath}&host=${encodeURIComponent(maskSni)}&sni=${encodeURIComponent(maskSni)}&fp=${fp}&alpn=${encodeURIComponent(alpn)}&ed=${earlyData}#${encodeURIComponent('EMLESS-CloakWS-' + client.email)}`;

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
      const uri = `trojan://${client.password}@${domain}:${inbound.port}?type=ws&security=tls&path=${encodedPath}&host=${encodeURIComponent(maskSni)}&sni=${encodeURIComponent(maskSni)}&fp=${fp}&alpn=${encodeURIComponent(alpn)}&ed=${earlyData}#${encodeURIComponent('EMLESS-CloakWS-Trojan-' + client.email)}`;

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
      const creds = Buffer.from(`${inbound.method}:${inbound.password}`).toString('base64');
      const pluginOpts = encodeURIComponent(`obfs=websocket;path=${cloakPath};host=${maskSni};tls`);
      const uri = `ss://${creds}@${domain}:${inbound.port}?plugin=v2ray-plugin%3B${pluginOpts}#${encodeURIComponent('EMLESS-CloakWS-SS-' + client.email)}`;

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
          method: inbound.method,
          password: inbound.password,
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
