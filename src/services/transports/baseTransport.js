/**
 * Abstract Base Transport Provider for EMLESS Network Gateway.
 * All transport layers (Standard RVG, Cloak WS) implement this interface.
 */
export class BaseTransport {
  constructor(name, description) {
    this.name = name;
    this.description = description;
  }

  /**
   * Generates client configuration object and protocol URI for a specific inbound.
   * @param {Object} inbound Inbound configuration
   * @param {Object} client Client account
   * @param {Object} systemSettings Global system settings
   * @param {string} domain Server host / domain
   * @returns {Object|null} Configuration object with uri, protocol, transport details
   */
  generateConfig(inbound, client, systemSettings, domain) {
    throw new Error('generateConfig() must be implemented by transport provider');
  }

  /**
   * Returns default options for this transport
   */
  getDefaults(systemSettings) {
    return {};
  }
}
