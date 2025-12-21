#!/usr/bin/env bash
set -euo pipefail

FAUCET_URL=${FAUCET_URL:-https://faucet.testnet-conway.linera.net}

# Detect service user and linera binary
SERVICE_USER=${SERVICE_USER:-${SUDO_USER:-$(id -un)}}
USER_HOME=$(getent passwd "$SERVICE_USER" | cut -d: -f6)
[ -z "$USER_HOME" ] && USER_HOME="/home/${SERVICE_USER}"
LINERA_BIN=$(command -v linera || true)
if [ -z "$LINERA_BIN" ]; then
  echo "ERROR: 'linera' binary not found in PATH. Ensure it's installed (e.g., ~/.cargo/bin/linera) or set LINERA_BIN to absolute path." >&2
  exit 127
fi

# Use per-user tmp dir unless explicitly overridden
LINERA_TMP_DIR=${LINERA_TMP_DIR:-${USER_HOME}/linera-marketplace-test}

# Data file for storing chain information
DATA_FILE="$(cd "$(dirname "$0")"; pwd)/data.txt"

# Clean up previous test environment
SERVICES=(linera-main-chain linera-author-chain linera-buyer-chain)

if command -v systemctl > /dev/null 2>&1; then
  for s in "${SERVICES[@]}"; do
    sudo systemctl stop "${s}.service" > /dev/null 2>&1 || true
    sudo systemctl disable "${s}.service" > /dev/null 2>&1 || true
    sudo rm -f "/etc/systemd/system/${s}.service" > /dev/null 2>&1 || true
  done
  sudo systemctl daemon-reload > /dev/null 2>&1 || true
fi

rm -rf "${LINERA_TMP_DIR}" || true
mkdir -p "${LINERA_TMP_DIR}"
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${LINERA_TMP_DIR}" > /dev/null 2>&1 || true

# Initialize wallets for 3 chains
export LINERA_WALLET_1="${LINERA_TMP_DIR}/wallet_main.json"
export LINERA_KEYSTORE_1="${LINERA_TMP_DIR}/keystore_main.json"
export LINERA_STORAGE_1="rocksdb:${LINERA_TMP_DIR}/client_main.db"

export LINERA_WALLET_2="${LINERA_TMP_DIR}/wallet_author.json"
export LINERA_KEYSTORE_2="${LINERA_TMP_DIR}/keystore_author.json"
export LINERA_STORAGE_2="rocksdb:${LINERA_TMP_DIR}/client_author.db"

export LINERA_WALLET_3="${LINERA_TMP_DIR}/wallet_buyer.json"
export LINERA_KEYSTORE_3="${LINERA_TMP_DIR}/keystore_buyer.json"
export LINERA_STORAGE_3="rocksdb:${LINERA_TMP_DIR}/client_buyer.db"

echo "=== Initializing Wallets ==="
linera --with-wallet 1 wallet init --faucet "${FAUCET_URL}"
linera --with-wallet 2 wallet init --faucet "${FAUCET_URL}"
linera --with-wallet 3 wallet init --faucet "${FAUCET_URL}"

echo "=== Requesting Chains from Faucet ==="
INFO_MAIN=($(linera --with-wallet 1 wallet request-chain --faucet "${FAUCET_URL}"))
INFO_AUTHOR=($(linera --with-wallet 2 wallet request-chain --faucet "${FAUCET_URL}"))
INFO_BUYER=($(linera --with-wallet 3 wallet request-chain --faucet "${FAUCET_URL}"))

MAIN_CHAIN="${INFO_MAIN[0]}"
MAIN_OWNER="${INFO_MAIN[1]}"

AUTHOR_CHAIN="${INFO_AUTHOR[0]}"
AUTHOR_OWNER="${INFO_AUTHOR[1]}"

BUYER_CHAIN="${INFO_BUYER[0]}"
BUYER_OWNER="${INFO_BUYER[1]}"

echo ""
echo "=== Chain Information ==="
echo "MAIN CHAIN:   ${MAIN_CHAIN}"
echo "MAIN OWNER:   ${MAIN_OWNER}"
echo ""
echo "AUTHOR CHAIN: ${AUTHOR_CHAIN}"
echo "AUTHOR OWNER: ${AUTHOR_OWNER}"
echo ""
echo "BUYER CHAIN:  ${BUYER_CHAIN}"
echo "BUYER OWNER:  ${BUYER_OWNER}"
echo ""

# Save to data.txt
cat > "${DATA_FILE}" <<EOF
# Marketplace Test Chains
# Generated: $(date)

MAIN_CHAIN=${MAIN_CHAIN}
MAIN_OWNER=${MAIN_OWNER}

AUTHOR_CHAIN=${AUTHOR_CHAIN}
AUTHOR_OWNER=${AUTHOR_OWNER}

BUYER_CHAIN=${BUYER_CHAIN}
BUYER_OWNER=${BUYER_OWNER}

# Service Ports
MAIN_PORT=7071
AUTHOR_PORT=7072
BUYER_PORT=7073
EOF

echo "=== Chain data saved to ${DATA_FILE} ==="
echo ""

# Start services
write_unit() {
  local name="$1"; local wallet="$2"; local port="$3"; local desc="$4"
  eval "local WALLET_VAR=\$LINERA_WALLET_${wallet}"
  eval "local KEYSTORE_VAR=\$LINERA_KEYSTORE_${wallet}"
  eval "local STORAGE_VAR=\$LINERA_STORAGE_${wallet}"
  sudo tee "/etc/systemd/system/${name}.service" > /dev/null <<EOF
[Unit]
Description=${desc}
After=network.target

[Service]
User=${SERVICE_USER}
Group=${SERVICE_USER}
Environment=LINERA_WALLET_${wallet}=${WALLET_VAR}
Environment=LINERA_KEYSTORE_${wallet}=${KEYSTORE_VAR}
Environment=LINERA_STORAGE_${wallet}=${STORAGE_VAR}
Environment=PATH=/usr/local/bin:/usr/bin:/bin:${USER_HOME}/.cargo/bin
ExecStart=${LINERA_BIN} --with-wallet ${wallet} service --port ${port}
Restart=always
RestartSec=5
WorkingDirectory=${LINERA_TMP_DIR}

[Install]
WantedBy=multi-user.target
EOF
  sudo systemctl daemon-reload
  sudo systemctl enable "${name}.service" || true
  sudo systemctl restart "${name}.service"
}

start_nohup() {
  local wallet="$1"; local port="$2"; local name="$3"
  nohup linera --with-wallet "${wallet}" service --port "${port}" >> "${LINERA_TMP_DIR}/${name}.log" 2>&1 &
}

echo "=== Starting Services ==="
if command -v systemctl > /dev/null 2>&1; then
  write_unit linera-main-chain 1 7071 "Linera Main Chain Service (Marketplace Hub)"
  write_unit linera-author-chain 2 7072 "Linera Author Chain Service (Product Seller)"
  write_unit linera-buyer-chain 3 7073 "Linera Buyer Chain Service (Product Buyer)"
  echo "Services started via systemd:"
  echo "  - linera-main-chain on port 7071"
  echo "  - linera-author-chain on port 7072"
  echo "  - linera-buyer-chain on port 7073"
else
  start_nohup 1 7071 linera-main-chain
  start_nohup 2 7072 linera-author-chain
  start_nohup 3 7073 linera-buyer-chain
  echo "Services started via nohup:"
  echo "  - Main chain on port 7071 (log: ${LINERA_TMP_DIR}/linera-main-chain.log)"
  echo "  - Author chain on port 7072 (log: ${LINERA_TMP_DIR}/linera-author-chain.log)"
  echo "  - Buyer chain on port 7073 (log: ${LINERA_TMP_DIR}/linera-buyer-chain.log)"
fi

echo ""
echo "=== Setup Complete ==="
echo "Test environment ready!"
echo ""
echo "GraphQL Endpoints:"
echo "  Main:   http://localhost:7071/graphql"
echo "  Author: http://localhost:7072/graphql"
echo "  Buyer:  http://localhost:7073/graphql"
echo ""
echo "To view chain data: cat ${DATA_FILE}"
echo ""
