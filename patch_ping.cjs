const fs = require('fs');
let code = fs.readFileSync('src/routes/api.js', 'utf8');

const pingFunc = `
import net from 'net';

function measureTcpPing(host, port, timeout = 2000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const sock = new net.Socket();
    sock.setTimeout(timeout);
    
    sock.connect(port, host, () => {
      const rtt = Date.now() - start;
      sock.destroy();
      resolve({ online: true, rttMs: rtt });
    });
    
    sock.on('error', (err) => {
      sock.destroy();
      resolve({ online: false, error: err.message, rttMs: null });
    });
    
    sock.on('timeout', () => {
      sock.destroy();
      resolve({ online: false, error: 'Timeout', rttMs: null });
    });
  });
}
`;

if (!code.includes('import net from')) {
    code = code.replace("import { config } from '../config.js';", "import { config } from '../config.js';\n" + pingFunc);
}

// Fix system ping
code = code.replace(/const simulatedRtt = Math\.floor\(18 \+ Math\.random\(\) \* 32\);\n\s*res\.json\(\{\n\s*host: targetHost,\n\s*rttMs: simulatedRtt,\n\s*status: "ONLINE",/g, 
`  try {
    const pingRes = await measureTcpPing(targetHost, 443);
    res.json({
      host: targetHost,
      rttMs: pingRes.rttMs,
      status: pingRes.online ? "ONLINE" : "OFFLINE",`);

// Change router.post('/system/ping', requireAuth, (req, res) => { to async
code = code.replace(`router.post('/system/ping', requireAuth, (req, res) => {`, `router.post('/system/ping', requireAuth, async (req, res) => {`);

// Close try block for system ping
code = code.replace(`    timestamp: new Date().toISOString()
  });
});

// ---------------- SETTINGS & BACKUP ----------------`,
`    timestamp: new Date().toISOString()
    });
  } catch(e) {
    res.json({ host: targetHost, rttMs: null, status: "ERROR", error: e.message, timestamp: new Date().toISOString() });
  }
});

// ---------------- SETTINGS & BACKUP ----------------`);


// Fix inbound ping
code = code.replace(/const baseLatency = inbound\.transport === 'grpc' \? 19 : inbound\.transport === 'ws' \? 24 : 16;\n\s*const jitter = Math\.floor\(Math\.random\(\) \* 6\);\n\s*const rttMs = baseLatency \+ jitter;/g,
`  const effectiveHost = inbound.sni || state.systemSettings.domain || state.systemSettings.serverIp || '1.1.1.1';
  const pingRes = await measureTcpPing(effectiveHost, inbound.port === 80 ? 80 : 443);
  const rttMs = pingRes.rttMs;
  const jitter = 0;
  
  if (!pingRes.online) {
    return res.json({
      ok: false,
      inboundId: inbound.id,
      name: inbound.name,
      status: 'UNREACHABLE',
      rttMs: null,
      error: pingRes.error
    });
  }`);

// Fix batch ping
code = code.replace(/const baseLatency = inbound\.transport === 'grpc' \? 18 : inbound\.transport === 'ws' \? 23 : 15;\n\s*const jitter = Math\.floor\(Math\.random\(\) \* 7\);\n\s*const rttMs = baseLatency \+ jitter;/g,
`    const effectiveHost = inbound.sni || state.systemSettings.domain || state.systemSettings.serverIp || '1.1.1.1';
    const pingRes = await measureTcpPing(effectiveHost, inbound.port === 80 ? 80 : 443);
    const rttMs = pingRes.rttMs;
    const jitter = 0;
    
    if (!pingRes.online) {
      return {
        inboundId: inbound.id,
        name: inbound.name,
        protocol: inbound.protocol,
        port: inbound.port,
        status: 'UNREACHABLE',
        rttMs: null,
        error: pingRes.error
      };
    }`);
    
code = code.replace(/const results = inbounds\.map\(inbound => \{/g, `const results = await Promise.all(inbounds.map(async inbound => {`);
code = code.replace(/\}\);\n\n  const onlineResults = results\.filter/g, `}));\n\n  const onlineResults = results.filter`);

fs.writeFileSync('src/routes/api.js', code);
