# LineraFlow - Decentralized Donation Platform

LineraFlow is a next-generation donation platform built on the **Linera** blockchain protocol. It empowers creators to receive donations directly, securely, and with zero platform risk, leveraging the infinite scalability and low latency of microchains.

## 🚀 Features

*   **Decentralized Identity**: Users register profiles directly on the Linera blockchain.
*   **Real-time Donations**: Instant transactions with 0ms latency using Linera's microchain architecture.
*   **Global Index**: Discover creators and authors through a searchable global directory.
*   **PocketBase Integration**: Hybrid architecture using PocketBase for efficient indexing and querying of off-chain metadata while keeping the source of truth on-chain.
*   **Brutalist Design**: A unique, high-contrast "Brutalist/Grid" UI design system.

## 🛠 Tech Stack

*   **Frontend**: React, Vite, Tailwind CSS
*   **Blockchain**: Linera SDK (WASM)
*   **Backend/Indexer**: PocketBase, Node.js (Indexer)
*   **Deployment**: Nginx, Docker (optional), Systemd

## 📋 Prerequisites

*   Node.js v20+
*   Linera Wallet Extension (for browser interaction)
*   PocketBase (for local indexing)

## ⚙️ Environment Variables

Create a `.env` file in the root directory with the following configuration:

```env
# Linera Network Configuration
VITE_LINERA_FAUCET_URL=https://faucet.testnet-conway.linera.net
VITE_LINERA_APPLICATION_ID=<YOUR_LINERA_APP_ID>
VITE_LINERA_MAIN_CHAIN_ID=<YOUR_MAIN_CHAIN_ID>

# PocketBase Configuration
VITE_POCKETBASE_URL=http://127.0.0.1:8090 # Or your production URL
```

## 🏃‍♂️ Running Locally

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Start PocketBase:**
    Download PocketBase and run it on port 8090:
    ```bash
    ./pocketbase serve --http=127.0.0.1:8090
    ```

3.  **Start the Indexer:**
    (If you have a separate indexer service)
    ```bash
    cd indexer
    npm install
    npm start
    ```

4.  **Run the Frontend:**
    ```bash
    npm run dev
    ```
    The app will be available at `http://localhost:3030`.

5.  **Deploy smart contracts:**
   ```bash
    linera project publish-and-create     --json-argument '{
        "accounts": {
            "input your owner": "1"
        }
    }'     --json-parameters '{
        "ticker_symbol": "NAT"
    }'
```

## 🚀 Deployment

The project includes a production deployment script for Ubuntu servers.

1.  **Upload the project to your server.**
2.  **Run the deployment script:**
    ```bash
    chmod +x deploy/setup_production.sh
    sudo ./deploy/setup_production.sh
    ```

This script will:
*   Install Nginx, Node.js, and Certbot.
*   Build the React application.
*   Install and configure PocketBase as a systemd service.
*   Configure Nginx with SSL (Let's Encrypt) and set up a reverse proxy for PocketBase on port 8090.
*   Apply necessary security headers (COEP/COOP) required for Linera's WASM client.

## 📄 License

MIT
