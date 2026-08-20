# EMLESS · Unified Control Center

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/new)

**EMLESS** is a unified, production-ready network proxy gateway and control center built on the RVG core engine with modular transport layers (**Standard RVG** & **Cloak WS**), an integrated **Telegram MTProto Proxy** subsystem (adapted from SE7O-SNA), and a dark Glass Morph / Orbit design system.

---

## 🌟 Key Capabilities

- **Unified Control Dashboard**: Real-time throughput graph, active client sessions, protocol distributions, and server diagnostics.
- **Modular Transport Architecture**:
  - **Standard RVG (Default & Authoritative)**: Native RVG connection behavior supporting VLESS REALITY (gRPC/TCP), VLESS WS TLS, Trojan XHTTP, Trojan WS, and Shadowsocks 2022.
  - **Cloak WS (Optional Layer)**: WebSocket-based early-data (0-RTT) obfuscation layer with domain fronting / masking SNI, browser fingerprint masquerading (Chrome/Safari), and randomized path routing.
  - Per-inbound transport mode selection and global default transport configuration.
- **Telegram MTProto Proxy (SE7O-SNA Engine)**:
  - Built-in MTG MTProto proxy manager with Fake TLS 1.3 domain masquerading (`ee...` secret format).
  - One-click `tg://proxy` and `https://t.me/proxy` link generation, instant connection button, and QR code modal.
  - Runtime service controls: Start, Stop, Restart, and live active client tracking.
- **RVG Core Protocol Suite**:
  - **VLESS REALITY** (gRPC / TCP) with TLS Camouflage & custom SNI
  - **Trojan XHTTP** & **Trojan WebSocket** (Cloudflare TLS)
  - **Shadowsocks 2022** (Blake3-AES)
  - **Subscription Engine**: Universal Base64 public subscription links (`/sub/:token`) with `Subscription-Userinfo` headers for Clash, Sing-box, V2RayNG, and Shadowrocket.
- **Anti-Censorship Toolkit**:
  - TLS ClientHello Packet Fragmentation (custom length and delay interval).
  - Cloudflare Clean IP pool rotation.
- **Durable Persistence**:
  - Zero-config automatic persistent file storage (Railway persistent volume ready at `/data`).
  - Seamless **PostgreSQL** support via standard `DATABASE_URL`.
  - JSON State Backup & Restore.

---

## 🚀 One-Click Deployment to Railway

Click the button above or configure the following environment variables:

| Variable | Class | Default | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | Railway-Provided | `8080` | Port automatically assigned by Railway |
| `DOMAIN` | Railway Reference | `${{RAILWAY_PUBLIC_DOMAIN}}` | Public domain for subscriptions & dashboard |
| `ADMIN_USERNAME` | User-Provided | `admin` | Administrator login username |
| `ADMIN_PASSWORD` | User-Provided | `StrongPass!123` | Administrator login password |
| `SECRET_KEY` | User-Provided | `8trpmjrrev6hcwqvqv6qhjve0fda6m2r` | Cryptographic session secret |
| `DB_PATH` | Persistence | `/data/panel.db` | Path to persistent database on Railway Volume |
| `MTPROXY_ENABLED` | Optional | `true` | Enable built-in Telegram MTProto proxy |
| `MTPROXY_PORT` | Optional | `${{RAILWAY_TCP_APPLICATION_PORT}}` | Telegram MTProto proxy listening port |
| `MTPROXY_PUBLIC_HOST` | Optional | `${{RAILWAY_TCP_PROXY_DOMAIN}}` | Railway TCP Proxy domain for Telegram |
| `MTPROXY_PUBLIC_PORT` | Optional | `${{RAILWAY_TCP_PROXY_PORT}}` | Railway TCP Proxy port for Telegram |
| `WORKERS` | Optional | `4` | Number of worker processes |
| `DEFAULT_TRANSPORT_MODE` | Optional | `standard` | Default connection mode (`standard` or `cloak_ws`) |

---

## 🛠️ Local Development

```bash
# 1. Install dependencies
npm install

# 2. Start development server
npm run dev

# 3. Open browser
http://localhost:3000
```

Default credentials:
- **Username:** `admin`
- **Password:** `123456` (Can be updated in the Settings panel)

---

## 📁 Repository Structure

```
├── server.js                        # Express application entrypoint
├── railway.toml                     # Railway deployment manifest & healthchecks
├── Dockerfile                       # Container definition
├── src/
│   ├── config.js                    # Environment & secrets manager
│   ├── db/
│   │   └── storage.js               # Storage manager (Postgres / Persistent file)
│   ├── services/
│   │   ├── transports/              # Modular Transport Providers
│   │   │   ├── baseTransport.js     # Abstract TransportProvider interface
│   │   │   ├── standardTransport.js # Standard RVG transport implementation
│   │   │   ├── cloakWsTransport.js  # Cloak WS obfuscation transport implementation
│   │   │   └── transportFactory.js  # Factory & metadata resolver
│   │   ├── rvgCore.js               # RVG protocol generation & subscription engine
│   │   ├── telegramProxy.js         # Telegram MTProto (SE7O-SNA adaptation)
│   │   └── telemetry.js             # Throughput & live active connection tracker
│   ├── routes/
│   │   └── api.js                   # REST API endpoints & Auth middleware
│   └── views/
│       └── index.html               # Glass Morph / Orbit Design System frontend
```

---

## 📄 License
MIT License
