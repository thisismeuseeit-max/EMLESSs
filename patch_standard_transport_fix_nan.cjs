const fs = require('fs');
let code = fs.readFileSync('src/services/transports/standardTransport.js', 'utf8');

code = code.replace(/publicPort = parseInt\(config\.mtproxyPublicPort, 10\);/,
`      publicPort = isNaN(parseInt(config.mtproxyPublicPort, 10)) ? config.mtproxyPublicPort : parseInt(config.mtproxyPublicPort, 10);`);

fs.writeFileSync('src/services/transports/standardTransport.js', code);
