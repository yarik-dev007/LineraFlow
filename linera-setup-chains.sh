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
LINERA_TMP_DIR=${LINERA_TMP_DIR:-${USER_HOME}/linera-tmp}

ENV_PATH=${ENV_PATH:-$(cd "$(dirname "$0")/.."; pwd)/.env}
touch "${ENV_PATH}"

get_env_val() {
  local key="$1"; local file="$2"; local line
  line=$(grep -E "^${key}=" "$file" | tail -n 1 || true)
  echo "${line#${key}=}"
}

BTC_PORT=${BTC_PORT:-$(get_env_val BTC_PORT "${ENV_PATH}")}
ETH_PORT=${ETH_PORT:-$(get_env_val ETH_PORT "${ENV_PATH}")}
LOTTERY_PORT=${LOTTERY_PORT:-$(get_env_val LOTTERY_PORT "${ENV_PATH}")}
LOTTERY_BOT_PORT=${LOTTERY_BOT_PORT:-$(get_env_val LOTTERY_BOT_PORT "${ENV_PATH}")}
LEADERBOARD_BTC_PORT=${LEADERBOARD_BTC_PORT:-$(get_env_val LEADERBOARD_BTC_PORT "${ENV_PATH}")}
LEADERBOARD_ETH_PORT=${LEADERBOARD_ETH_PORT:-$(get_env_val LEADERBOARD_ETH_PORT "${ENV_PATH}")}
LEADERBOARD_APP_ID=${LEADERBOARD_APP_ID:-$(get_env_val LEADERBOARD_APP_ID "${ENV_PATH}")}
BTC_PORT=${BTC_PORT:-8082}
ETH_PORT=${ETH_PORT:-8083}
LOTTERY_PORT=${LOTTERY_PORT:-8081}
LOTTERY_BOT_PORT=${LOTTERY_BOT_PORT:-8084}
LEADERBOARD_BTC_PORT=${LEADERBOARD_BTC_PORT:-8088}
LEADERBOARD_ETH_PORT=${LEADERBOARD_ETH_PORT:-8089}

SERVICES=(linera-btc linera-eth linera-lottery linera-bot linera-leaderboard linera-leaderboard-btc linera-leaderboard-eth)

if command -v systemctl >/dev/null 2>&1; then
  for s in "${SERVICES[@]}"; do
    sudo systemctl stop "${s}.service" >/dev/null 2>&1 || true
    sudo systemctl disable "${s}.service" >/dev/null 2>&1 || true
    sudo rm -f "/etc/systemd/system/${s}.service" >/dev/null 2>&1 || true
  done
  sudo systemctl daemon-reload >/dev/null 2>&1 || true
fi

rm -rf "${LINERA_TMP_DIR}" || true
mkdir -p "${LINERA_TMP_DIR}"
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${LINERA_TMP_DIR}" >/dev/null 2>&1 || true

export LINERA_WALLET_1="${LINERA_TMP_DIR}/wallet_1.json"
export LINERA_KEYSTORE_1="${LINERA_TMP_DIR}/keystore_1.json"
export LINERA_STORAGE_1="rocksdb:${LINERA_TMP_DIR}/client_1.db"

export LINERA_WALLET_2="${LINERA_TMP_DIR}/wallet_2.json"
export LINERA_KEYSTORE_2="${LINERA_TMP_DIR}/keystore_2.json"
export LINERA_STORAGE_2="rocksdb:${LINERA_TMP_DIR}/client_2.db"

export LINERA_WALLET_3="${LINERA_TMP_DIR}/wallet_3.json"
export LINERA_KEYSTORE_3="${LINERA_TMP_DIR}/keystore_3.json"
export LINERA_STORAGE_3="rocksdb:${LINERA_TMP_DIR}/client_3.db"

export LINERA_WALLET_4="${LINERA_TMP_DIR}/wallet_4.json"
export LINERA_KEYSTORE_4="${LINERA_TMP_DIR}/keystore_4.json"
export LINERA_STORAGE_4="rocksdb:${LINERA_TMP_DIR}/client_4.db"

export LINERA_WALLET_5="${LINERA_TMP_DIR}/wallet_5.json"
export LINERA_KEYSTORE_5="${LINERA_TMP_DIR}/keystore_5.json"
export LINERA_STORAGE_5="rocksdb:${LINERA_TMP_DIR}/client_5.db"

export LINERA_WALLET_6="${LINERA_TMP_DIR}/wallet_6.json"
export LINERA_KEYSTORE_6="${LINERA_TMP_DIR}/keystore_6.json"
export LINERA_STORAGE_6="rocksdb:${LINERA_TMP_DIR}/client_6.db"

linera --with-wallet 1 wallet init --faucet "${FAUCET_URL}"
linera --with-wallet 2 wallet init --faucet "${FAUCET_URL}"
linera --with-wallet 3 wallet init --faucet "${FAUCET_URL}"
linera --with-wallet 4 wallet init --faucet "${FAUCET_URL}"
linera --with-wallet 5 wallet init --faucet "${FAUCET_URL}"
linera --with-wallet 6 wallet init --faucet "${FAUCET_URL}"

INFO_1=($(linera --with-wallet 1 wallet request-chain --faucet "${FAUCET_URL}"))
INFO_2=($(linera --with-wallet 2 wallet request-chain --faucet "${FAUCET_URL}"))
INFO_3=($(linera --with-wallet 3 wallet request-chain --faucet "${FAUCET_URL}"))
INFO_4=($(linera --with-wallet 4 wallet request-chain --faucet "${FAUCET_URL}"))
INFO_5=($(linera --with-wallet 5 wallet request-chain --faucet "${FAUCET_URL}"))
INFO_6=($(linera --with-wallet 6 wallet request-chain --faucet "${FAUCET_URL}"))

CHAIN_1="${INFO_1[0]}"
CHAIN_2="${INFO_2[0]}"
CHAIN_3="${INFO_3[0]}"
CHAIN_4="${INFO_4[0]}"
OWNER_1="${INFO_1[1]}"
OWNER_2="${INFO_2[1]}"
OWNER_3="${INFO_3[1]}"
OWNER_4="${INFO_4[1]}"
CHAIN_5="${INFO_5[0]}"
OWNER_5="${INFO_5[1]}"
CHAIN_6="${INFO_6[0]}"
OWNER_6="${INFO_6[1]}"

echo "BTC CHAIN: ${CHAIN_1}"; echo "BTC OWNER: ${OWNER_1}"
echo "ETH CHAIN: ${CHAIN_2}"; echo "ETH OWNER: ${OWNER_2}"
echo "LOTTERY CHAIN: ${CHAIN_3}"; echo "LOTTERY OWNER: ${OWNER_3}"
echo "BOT CHAIN: ${CHAIN_4}"; echo "BOT OWNER: ${OWNER_4}"
echo "LEADERBOARD BTC CHAIN: ${CHAIN_5}"; echo "LEADERBOARD BTC OWNER: ${OWNER_5}"
echo "LEADERBOARD ETH CHAIN: ${CHAIN_6}"; echo "LEADERBOARD ETH OWNER: ${OWNER_6}"

upsert_env() {
  key="$1"; val="$2"; file="$3"
  if grep -q "^${key}=" "$file"; then
    sed -i.bak "s|^${key}=.*|${key}=${val}|" "$file"
  else
    printf "%s=%s\n" "$key" "$val" >> "$file"
  fi
}

upsert_env VITE_BTC_CHAIN_ID "${CHAIN_1}" "${ENV_PATH}"
upsert_env VITE_ETH_CHAIN_ID "${CHAIN_2}" "${ENV_PATH}"
upsert_env VITE_LOTTERY_CHAIN_ID "${CHAIN_3}" "${ENV_PATH}"
upsert_env LOTTERY_BOT_CHAIN_ID "${CHAIN_4}" "${ENV_PATH}"
upsert_env VITE_LEADERBOARD_BTC_CHAIN_ID "${CHAIN_5}" "${ENV_PATH}"
upsert_env VITE_LEADERBOARD_ETH_CHAIN_ID "${CHAIN_6}" "${ENV_PATH}"

upsert_env VITE_BTC_TARGET_OWNER "${OWNER_1}" "${ENV_PATH}"
upsert_env VITE_ETH_TARGET_OWNER "${OWNER_2}" "${ENV_PATH}"
upsert_env VITE_LOTTERY_TARGET_OWNER "${OWNER_3}" "${ENV_PATH}"
upsert_env LOTTERY_BOT_OWNER "${OWNER_4}" "${ENV_PATH}"
upsert_env VITE_LEADERBOARD_BTC_TARGET_OWNER "${OWNER_5}" "${ENV_PATH}"
upsert_env VITE_LEADERBOARD_ETH_TARGET_OWNER "${OWNER_6}" "${ENV_PATH}"

# Computed endpoints
if [ -n "${LEADERBOARD_APP_ID}" ]; then
  upsert_env LEADERBOARD_BTC_PORT "${LEADERBOARD_BTC_PORT}" "${ENV_PATH}"
  upsert_env LEADERBOARD_ETH_PORT "${LEADERBOARD_ETH_PORT}" "${ENV_PATH}"
  upsert_env LEADERBOARD_BTC_HTTP "http://localhost:${LEADERBOARD_BTC_PORT}/chains/${CHAIN_5}/applications/${LEADERBOARD_APP_ID}" "${ENV_PATH}"
  upsert_env LEADERBOARD_ETH_HTTP "http://localhost:${LEADERBOARD_ETH_PORT}/chains/${CHAIN_6}/applications/${LEADERBOARD_APP_ID}" "${ENV_PATH}"
fi

echo "Updated ${ENV_PATH}"

write_unit() {
  local name="$1"; local wallet="$2"; local port="$3"; local desc="$4"
  eval "local WALLET_VAR=\$LINERA_WALLET_${wallet}"
  eval "local KEYSTORE_VAR=\$LINERA_KEYSTORE_${wallet}"
  eval "local STORAGE_VAR=\$LINERA_STORAGE_${wallet}"
  sudo tee "/etc/systemd/system/${name}.service" >/dev/null <<EOF
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

if command -v systemctl >/dev/null 2>&1; then
  write_unit linera-btc 1 "${BTC_PORT}" "Linera Wallet 1 Service (BTC)"
  write_unit linera-eth 2 "${ETH_PORT}" "Linera Wallet 2 Service (ETH)"
  write_unit linera-lottery 3 "${LOTTERY_PORT}" "Linera Wallet 3 Service (LOTTERY)"
  write_unit linera-bot 4 "${LOTTERY_BOT_PORT}" "Linera Wallet 4 Service (LOTTERY BOT)"
  write_unit linera-leaderboard-btc 5 "${LEADERBOARD_BTC_PORT}" "Linera Wallet 5 Service (LEADERBOARD BTC)"
  write_unit linera-leaderboard-eth 6 "${LEADERBOARD_ETH_PORT}" "Linera Wallet 6 Service (LEADERBOARD ETH)"
else
  start_nohup 1 "${BTC_PORT}" linera-btc
  start_nohup 2 "${ETH_PORT}" linera-eth
  start_nohup 3 "${LOTTERY_PORT}" linera-lottery
  start_nohup 4 "${LOTTERY_BOT_PORT}" linera-bot
  start_nohup 5 "${LEADERBOARD_BTC_PORT}" linera-leaderboard-btc
  start_nohup 6 "${LEADERBOARD_ETH_PORT}" linera-leaderboard-eth
fi
