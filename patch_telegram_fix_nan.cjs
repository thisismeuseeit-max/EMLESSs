const fs = require('fs');
let code = fs.readFileSync('src/services/telegramProxy.js', 'utf8');

code = code.replace(/const port = config\.mtproxyPublicPort \? parseInt\(config\.mtproxyPublicPort, 10\) \: proxy\.port;/,
`    let port = proxy.port;
    if (config.mtproxyPublicPort) {
        port = isNaN(parseInt(config.mtproxyPublicPort, 10)) ? config.mtproxyPublicPort : parseInt(config.mtproxyPublicPort, 10);
    }`);

fs.writeFileSync('src/services/telegramProxy.js', code);
