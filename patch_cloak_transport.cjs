const fs = require('fs');
let code = fs.readFileSync('src/services/transports/cloakWsTransport.js', 'utf8');

const fixLogic = `
    let publicDomain = effectiveDomain;
    let publicPort = inbound.port;
    
    // Cloak WS is WebSocket based, so it routes through standard Web Router (443)
    publicPort = 443;
    
    // Strip http/https prefix from publicDomain if it exists
    if (publicDomain && publicDomain.startsWith('http')) {
        publicDomain = publicDomain.replace(/^https?:\\/\\//, '');
    }
`;

code = code.replace(/const tagSuffix = inbound\.name \? .*/, `const tagSuffix = inbound.name ? \`\${inbound.name} · \${client.email}\` : \`EMLESS-CloakWS · \${client.email}\`;\n\n${fixLogic}`);

// Now replace ${effectiveDomain}:${inbound.port} with ${publicDomain}:${publicPort}
code = code.replace(/\@\$\{effectiveDomain\}\:\$\{inbound\.port\}/g, '@${publicDomain}:${publicPort}');

fs.writeFileSync('src/services/transports/cloakWsTransport.js', code);
