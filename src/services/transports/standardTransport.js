import { BaseTransport } from './baseTransport.js';
import { config } from '../../config.js';

/**
 * Standard RVG Transport Provider.
 * The default, authoritative transport implementation supporting:
 * - VLESS + REALITY (gRPC / TCP Vision)
 * - VLESS + WebSocket + TLS (Cloudflare CDN)
 * - Trojan + XHTTP (Anti-Filter)
 * - Trojan + WebSocket + TLS
 * - Shadowsocks 2022 (Blake3-AES)
 */
export class StandardRVGTransport extends BaseTransport {
  constructor() {
    super('standard', 'Native RVG connection behavior.');
  }

  generateConfig(inbound, client, systemSettings, domain) {
    if (!inbound || !inbound.enabled) return null;

    const effectiveDomain = domain || systemSettings.domain || systemSettings.serverIp || '127.0.0.1';
    const tagSuffix = inbound.name ? `${inbound.name} · ${client.email}` : `EMLESS-${inbound.protocol.toUpperCase()} · ${client.email}`;

    const isWsOrXhttp = inbound.transport === 'ws' || inbound.transport === 'xhttp';
    
    // Auto-detect public routing based on Railway environment variables
    let publicDomain = effectiveDomain;
    let publicPort = inbound.port;
    
    if (isWsOrXhttp) {
      // HTTP-based transports flow through the standard Web Router (Port 443)
      publicPort = 443;
    } else if (config.mtproxyPublicHost && config.mtproxyPublicPort) {
      // Raw TCP transports MUST flow through the Railway TCP Proxy
      publicDomain = config.mtproxyPublicHost;
            publicPort = isNaN(parseInt(config.mtproxyPublicPort, 10)) ? config.mtproxyPublicPort : parseInt(config.mtproxyPublicPort, 10);
    }
    
    // Strip http/https prefix from publicDomain if it exists
    if (publicDomain && publicDomain.startsWith('http')) {
        publicDomain = publicDomain.replace(/^https?:\/\//, '');
    }


    if (inbound.protocol === 'vless') {
      if (inbound.security === 'reality') {
        // VLESS REALITY (gRPC / TCP Vision)
        const type = inbound.transport || 'grpc';
        const sni = inbound.sni || systemSettings.sni || 'www.speedtest.net';
        const pbk = systemSettings.publicKey || 'w71o8c...xT29PqM5_emlessKey';
        const sid = systemSettings.shortId || '6a89c02b';
        const fp = inbound.fingerprint || 'chrome';

        let params = `type=${type}&security=reality&pbk=${encodeURIComponent(pbk)}&fp=${fp}&sni=${encodeURIComponent(sni)}&sid=${encodeURIComponent(sid)}&spx=%2F`;
        if (type === 'grpc') {
          const serviceName = inbound.serviceName || 'emless-grpc';
          params += `&serviceName=${encodeURIComponent(serviceName)}&mode=gun`;
        } else if (type === 'tcp') {
          params += `&flow=xtls-rprx-vision&headerType=none`;
        }

        const uri = `vless://${client.uuid}@${publicDomain}:${publicPort}?${params}#${encodeURIComponent(tagSuffix)}`;
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
            sni,
            uuid: client.uuid,
            publicKey: pbk,
            shortId: sid,
            fingerprint: fp,
            transportMode: 'standard'
          }
        };
      } else if (inbound.transport === 'ws' || inbound.transport === 'tcp') {
        // VLESS WebSocket TLS (CDN / Cloudflare)
        const type = inbound.transport || 'ws';
        const rawPath = inbound.path || '/emless-vless';
        const sni = inbound.sni || effectiveDomain;
        const fp = inbound.fingerprint || 'chrome';
        const path = encodeURIComponent(rawPath);
        
        const uri = `vless://${client.uuid}@${publicDomain}:${publicPort}?type=${type}&security=tls&path=${path}&host=${encodeURIComponent(sni)}&sni=${encodeURIComponent(sni)}&fp=${fp}#${encodeURIComponent(tagSuffix)}`;
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
            path: rawPath,
            sni,
            host: sni,
            uuid: client.uuid,
            fingerprint: fp,
            transportMode: 'standard'
          }
        };
      }
    } else if (inbound.protocol === 'trojan') {
      const sni = inbound.sni || effectiveDomain;
      const fp = inbound.fingerprint || 'chrome';

      if (inbound.transport === 'xhttp') {
        // Trojan XHTTP (Anti-Filter Protocol)
        const rawPath = inbound.path || '/emless-xhttp';
        const path = encodeURIComponent(rawPath);
        const uri = `trojan://${client.password}@${publicDomain}:${publicPort}?type=xhttp&security=tls&path=${path}&host=${encodeURIComponent(sni)}&sni=${encodeURIComponent(sni)}&fp=${fp}#${encodeURIComponent(tagSuffix)}`;
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
            path: rawPath,
            sni,
            host: sni,
            password: client.password,
            fingerprint: fp,
            transportMode: 'standard'
          }
        };
      } else {
        // Trojan WebSocket TLS
        const rawPath = inbound.path || '/emless-trojan';
        const path = encodeURIComponent(rawPath);
        const uri = `trojan://${client.password}@${publicDomain}:${publicPort}?type=ws&security=tls&path=${path}&host=${encodeURIComponent(sni)}&sni=${encodeURIComponent(sni)}&fp=${fp}#${encodeURIComponent(tagSuffix)}`;
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
            path: rawPath,
            sni,
            host: sni,
            password: client.password,
            fingerprint: fp,
            transportMode: 'standard'
          }
        };
      }
    } else if (inbound.protocol === 'shadowsocks') {
      // Shadowsocks 2022 (Blake3-AES)
      const method = inbound.method || '2022-blake3-aes-128-gcm';
      const password = inbound.password || 'emlessSecretKeySS2022Blake3Secure==';
      const creds = Buffer.from(`${method}:${password}`).toString('base64');
      const uri = `ss://${creds}@${publicDomain}:${publicPort}#${encodeURIComponent(tagSuffix)}`;
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
          method,
          password,
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
