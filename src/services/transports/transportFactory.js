import { StandardRVGTransport } from './standardTransport.js';
import { CloakWSTransport } from './cloakWsTransport.js';

export class TransportFactory {
  constructor() {
    this.transports = {
      standard: new StandardRVGTransport(),
      cloak_ws: new CloakWSTransport()
    };
  }

  /**
   * Resolves the transport provider for an inbound.
   * If inbound.transportMode is absent or unknown, defaults strictly to StandardRVGTransport.
   * @param {string} mode Transport mode ('standard' | 'cloak_ws')
   * @returns {BaseTransport}
   */
  getProvider(mode) {
    if (mode === 'cloak_ws' && this.transports.cloak_ws) {
      return this.transports.cloak_ws;
    }
    return this.transports.standard;
  }

  /**
   * Returns list of supported transport options with metadata for UI
   */
  getSupportedTransports() {
    return [
      {
        id: 'standard',
        name: 'Standard RVG',
        badge: 'STANDARD',
        description: 'Native RVG connection behavior.',
        isDefault: true
      },
      {
        id: 'cloak_ws',
        name: 'Cloak WS',
        badge: 'CLOAK WS',
        description: 'Optional WebSocket-based obfuscation/transport layer.',
        isDefault: false
      }
    ];
  }
}

export const transportFactory = new TransportFactory();
