import { BaseTransport } from './baseTransport.js';

/**
 * Standard RVG Transport Provider.
 * The default, authoritative transport implementation supporting:
 * - VLESS + REALITY (gRPC / TCP)
 * - VLESS + WebSocket + TLS
 * - Trojan + XHTTP (Anti-Filter)
 * - Trojan + WebSocket + TLS
 * - Shadowsocks 2022 (Blake3-AES)
 */
export class StandardRVGTransport extends BaseTransport {
  constructor() {
    super('standard', 'Native RVG connection behavior.');
  }

  generateConfig(inbound, client, systemSettings, domain) {
    if (!inbound.enabled) return null;

    if (inbound.protocol === 'vless') {
      if (inbound.security === 'reality') {
        // VLESS REALITY gRPC / TCP
        const type = inbound.transport || 'grpc';
        const serviceParam = inbound.serviceName ? `&serviceName=${encodeURIComponent(inbound.serviceName)}` : '';
        const uri = `vless://${client.uuid}@${domain}:${inbound.port}?type=${type}${serviceParam}&security=reality&pbk=${systemSettings.publicKey}&fp=chrome&sni=${inbound.sni || systemSettings.sni}&sid=${systemSettings.shortId}#${encodeURIComponent('EMLESS-REALITY-' + client.email)}`;
        return {
          id: inbound.id,
          name: inbound.name,
          protocol: 'vless',
          transportMode: 'standard',
          transport: type,
          security: 'reality',
          uri,
          details: {
            port: inbound.port,
            sni: inbound.sni || systemSettings.sni,
            uuid: client.uuid,
            publicKey: systemSettings.publicKey,
            shortId: systemSettings.shortId,
            transportMode: 'standard'
          }
        };
      } else if (inbound.transport === 'ws' || inbound.transport === 'tcp') {
        // VLESS WebSocket TLS (CDN)
        const type = inbound.transport || 'ws';
        const path = encodeURIComponent(inbound.path || '/emless-vless');
        const uri = `vless://${client.uuid}@${domain}:${inbound.port}?type=${type}&security=tls&path=${path}&sni=${inbound.sni || domain}#${encodeURIComponent('EMLESS-VLESS-WS-' + client.email)}`;
        return {
          id: inbound.id,
          name: inbound.name,
          protocol: 'vless',
          transportMode: 'standard',
          transport: type,
          security: 'tls',
          uri,
          details: {
            port: inbound.port,
            path: inbound.path || '/emless-vless',
            sni: inbound.sni || domain,
            uuid: client.uuid,
            transportMode: 'standard'
          }
        };
      }
    } else if (inbound.protocol === 'trojan') {
      if (inbound.transport === 'xhttp') {
        // Trojan XHTTP (Anti-Filter)
        const path = encodeURIComponent(inbound.path || '/emless-xhttp');
        const uri = `trojan://${client.password}@${domain}:${inbound.port}?type=xhttp&security=tls&path=${path}&sni=${inbound.sni || domain}#${encodeURIComponent('EMLESS-Trojan-XHTTP-' + client.email)}`;
        return {
          id: inbound.id,
          name: inbound.name,
          protocol: 'trojan',
          transportMode: 'standard',
          transport: 'xhttp',
          security: 'tls',
          uri,
          details: {
            port: inbound.port,
            path: inbound.path || '/emless-xhttp',
            sni: inbound.sni || domain,
            password: client.password,
            transportMode: 'standard'
          }
        };
      } else {
        // Trojan WS
        const path = encodeURIComponent(inbound.path || '/emless-trojan');
        const uri = `trojan://${client.password}@${domain}:${inbound.port}?type=ws&security=tls&path=${path}&sni=${inbound.sni || domain}#${encodeURIComponent('EMLESS-Trojan-WS-' + client.email)}`;
        return {
          id: inbound.id,
          name: inbound.name,
          protocol: 'trojan',
          transportMode: 'standard',
          transport: 'ws',
          security: 'tls',
          uri,
          details: {
            port: inbound.port,
            path: inbound.path || '/emless-trojan',
            sni: inbound.sni || domain,
            password: client.password,
            transportMode: 'standard'
          }
        };
      }
    } else if (inbound.protocol === 'shadowsocks') {
      // Shadowsocks 2022
      const creds = Buffer.from(`${inbound.method}:${inbound.password}`).toString('base64');
      const uri = `ss://${creds}@${domain}:${inbound.port}#${encodeURIComponent('EMLESS-SS2022-' + client.email)}`;
      return {
        id: inbound.id,
        name: inbound.name,
        protocol: 'shadowsocks',
        transportMode: 'standard',
        transport: 'tcp',
        security: 'none',
        uri,
        details: {
          port: inbound.port,
          method: inbound.method,
          password: inbound.password,
          transportMode: 'standard'
        }
      };
    }

    return null;
  }

  getDefaults(systemSettings) {
    return {
      transportMode: 'standard',
      transport: 'ws',
      security: 'tls',
      path: '/emless-stream'
    };
  }
}
