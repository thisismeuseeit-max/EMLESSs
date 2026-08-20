const fs = require('fs');
let code = fs.readFileSync('src/db/storage.js', 'utf8');

// The defaults in defaultData have bad dummy values like domain: "gateway.emless.network" and telegramProxy.server: "185.190.140.22"
code = code.replace(/domain: "gateway.emless.network",/g, 'domain: "",');
code = code.replace(/serverIp: "185.190.140.22",/g, 'serverIp: "",');
code = code.replace(/server: "185.190.140.22",/g, 'server: "",');
code = code.replace(/port: 8444,/g, 'port: process.env.MTPROXY_PORT || 8444,');

code = code.replace(/if \(config.domain && \(\!data.systemSettings.domain \|\| data.systemSettings.domain === 'gateway.emless.network'\)\) \{/g, 
`if (config.domain && (!data.systemSettings.domain || data.systemSettings.domain === 'gateway.emless.network')) {`);

code = code.replace(/if \(\!data.telegramProxy\) \{/g,
`    if (!data.telegramProxy.server || data.telegramProxy.server === '185.190.140.22') {
      data.telegramProxy.server = config.mtproxyPublicHost || config.domain || '';
    }
    if (!data.systemSettings.serverIp || data.systemSettings.serverIp === '185.190.140.22') {
      data.systemSettings.serverIp = config.domain || '';
    }
    if (!data.telegramProxy) {`);

fs.writeFileSync('src/db/storage.js', code);
