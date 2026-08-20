const fs = require('fs');
let code = fs.readFileSync('src/services/transports/standardTransport.js', 'utf8');

// We need to inject config to get tcp proxy details
if (!code.includes("import { config } from '../../config.js';")) {
  code = code.replace("import { BaseTransport } from './baseTransport.js';", "import { BaseTransport } from './baseTransport.js';\nimport { config } from '../../config.js';");
}

const fixLogic = `    const isWsOrXhttp = inbound.transport === 'ws' || inbound.transport === 'xhttp';
    
    // Auto-detect public routing based on Railway environment variables
    let publicDomain = effectiveDomain;
    let publicPort = inbound.port;
    
    if (isWsOrXhttp) {
      // HTTP-based transports flow through the standard Web Router (Port 443)
      publicPort = 443;
    } else if (config.mtproxyPublicHost && config.mtproxyPublicPort) {
      // Raw TCP transports MUST flow through the Railway TCP Proxy
      publicDomain = config.mtproxyPublicHost;
      publicPort = parseInt(config.mtproxyPublicPort, 10);
    }
    
    // Strip http/https prefix from publicDomain if it exists
    if (publicDomain && publicDomain.startsWith('http')) {
        publicDomain = publicDomain.replace(/^https?:\\/\\//, '');
    }
`;

code = code.replace(/const tagSuffix = inbound\.name \? .*/, `const tagSuffix = inbound.name ? \`\${inbound.name} · \${client.email}\` : \`EMLESS-\${inbound.protocol.toUpperCase()} · \${client.email}\`;\n\n${fixLogic}`);

// Now replace ${effectiveDomain}:${inbound.port} with ${publicDomain}:${publicPort}
code = code.replace(/\@\$\{effectiveDomain\}\:\$\{inbound\.port\}/g, '@${publicDomain}:${publicPort}');

fs.writeFileSync('src/services/transports/standardTransport.js', code);
