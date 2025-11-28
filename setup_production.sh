#!/usr/bin/env bash
set -euo pipefail

# =========================
# CONFIG
# =========================
DOMAIN="microbet-linera.xyz"
EMAIL="egor4042007@gmail.com"
WORK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
RUN_USER="${SUDO_USER:-$(whoami)}"
BUILD_DIR="$WORK_DIR/build"

# =========================
# INSTALL SYSTEM PACKAGES
# =========================
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg ufw nodejs nginx certbot python3-certbot-nginx

curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# =========================
# UFW FIREWALL
# =========================
sudo ufw allow OpenSSH
sudo ufw allow "Nginx Full"
sudo ufw --force enable

# =========================
# INSTALL DEPENDENCIES
# =========================
cd "$WORK_DIR"
npm ci

cd "$WORK_DIR/orchestrator"
npm ci
cd "$WORK_DIR"

# =========================
# ENVIRONMENT FILES
# =========================
sudo mkdir -p /etc/microbet-linera

if [ ! -f "$WORK_DIR/.env.local" ]; then
  cat > "$WORK_DIR/.env.local" <<EOF
VITE_SUPABASE_URL=https://krvnqndokmyjbjonqauz.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtydm5xbmRva215amJqb25xYXV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyMzA4NzcsImV4cCI6MjA3ODgwNjg3N30.wx6RRWcS65WOhbMVt2yoFLD52KmWfeoN4KpwZy0z954
VITE_LINERA_APPLICATION_ID=49b8ff8611067f16a857b66ffe6f297f712c1b62ff88ad3793eb73d71aeea0bf
VITE_BTC_CHAIN_ID=68113d35d4d4bccf55484cfdfe483955127740badafc80bdfc0621200f69004a
VITE_ETH_CHAIN_ID=4c5aee235b9d9ddf62f05d377fd832c718cb5939fc3545ba5ee2829b4c99dfb7
VITE_BTC_TARGET_OWNER=0x2ad49dbbf67ae272c06beadecbbd6f3ffd7f33fd7fdce45dc84e82ffd3184b0c
VITE_ETH_TARGET_OWNER=0xfa7b3b412e1b3dffc915df7ae7b7e59a0ebcbc084d8f71b724f35ec2ad872dc9
VITE_LOTTERY_APPLICATION_ID=018cda9557b55765846b47f70fe334999275f6bc561994fa6cb8a1fe14e60eb1
VITE_LOTTERY_CHAIN_ID=5004f32aab0413261b1fb0087ebd5ed650dfba64306466f939aac7dbe846d11e
VITE_LOTTERY_TARGET_OWNER=0x0ac08e63dc28f0570b2b842e7bd8cfa3b17bd77cb29197f4e6b0b17183919b88
VITE_SUPABASE_LOTTERY_URL=https://oznvztsgrgfcithgnosn.supabase.co
VITE_SUPABASE_LOTTERY_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96bnZ6dHNncmdmY2l0aGdub3NuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4Mjc3NzMsImV4cCI6MjA3OTQwMzc3M30.buN7DsUZzT8KAG2dssBnkfx3Ftnzf8ouONUtcIdp-S4
EOF
fi

if [ ! -f "/etc/microbet-linera/supabase.env" ]; then
  sudo bash -c "cat > /etc/microbet-linera/supabase.env <<EOF
SUPABASE_URL=https://krvnqndokmyjbjonqauz.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtydm5xbmRva215amJqb25xYXV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzIzMDg3NywiZXhwIjoyMDc4ODA2ODc3fQ.ln4Zlz8bcF6nwc0Viii4aauG0Y-h7dET7VeHZgtTbYc
SUPABASE_DB_URL=
EOF"
fi

if [ ! -f "/etc/microbet-linera/supabase-lottery.env" ]; then
  sudo bash -c "cat > /etc/microbet-linera/supabase-lottery.env <<EOF
SUPABASE_URL_LOTTERY=https://oznvztsgrgfcithgnosn.supabase.co
SUPABASE_SERVICE_ROLE_KEY_LOTTERY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96bnZ6dHNncmdmY2l0aGdub3NuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzgyNzc3MywiZXhwIjoyMDc5NDAzNzczfQ.8ge0Whdgm9C2Lnoj8w85fAtEc961IGL2XOWtrXWdOD8
EOF"
fi

# =========================
# BUILD FRONTEND
# =========================
echo ">>> Building frontend"
cd "$WORK_DIR"
npm run build

sudo mkdir -p /var/www/$DOMAIN
sudo rm -rf /var/www/$DOMAIN/*
sudo cp -r "$WORK_DIR/dist/"* /var/www/$DOMAIN/

# =========================
# NGINX CONFIG
# =========================
sudo bash -c "cat > /etc/nginx/sites-available/$DOMAIN <<'NGINXEOF'
server {
    listen 80;
    server_name microbet-linera.xyz;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    root /var/www/microbet-linera.xyz;
    index index.html;

    add_header Cross-Origin-Opener-Policy \"same-origin\" always;
    add_header Cross-Origin-Embedder-Policy \"require-corp\" always;
    add_header Cross-Origin-Resource-Policy \"same-origin\" always;

    # Assets (JS/CSS/WASM) with CORS for Web Workers
    location /assets/ {
        root /var/www/microbet-linera.xyz;
        add_header Cross-Origin-Opener-Policy \"same-origin\" always;
        add_header Cross-Origin-Embedder-Policy \"require-corp\" always;
        add_header Cross-Origin-Resource-Policy \"same-origin\" always;
        add_header Access-Control-Allow-Origin \"*\" always;
        add_header Access-Control-Allow-Methods \"GET, HEAD, OPTIONS\" always;
        add_header Cache-Control \"public, max-age=31536000, immutable\";

        if (\$request_method = OPTIONS) {
            add_header Content-Length 0;
            add_header Content-Type text/plain;
            return 204;
        }
    }

    # Static files
    location / {
        try_files \$uri /index.html;
    }

    # Orchestrator WebSocket proxy
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \"upgrade\";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        add_header Cross-Origin-Opener-Policy \"same-origin\" always;
        add_header Cross-Origin-Embedder-Policy \"require-corp\" always;
        add_header Cross-Origin-Resource-Policy \"same-origin\" always;
    }
}
NGINXEOF"

sudo ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
sudo nginx -t
sudo systemctl reload nginx

# =========================
# LET'S ENCRYPT SSL
# =========================
sudo certbot --nginx -n --agree-tos -m "$EMAIL" -d "$DOMAIN" --redirect

# Fix SSL config to preserve all headers
sudo bash -c "cat > /etc/nginx/sites-available/$DOMAIN <<'NGINXEOF'
server {
    listen 80;
    server_name microbet-linera.xyz;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name microbet-linera.xyz;

    ssl_certificate /etc/letsencrypt/live/microbet-linera.xyz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/microbet-linera.xyz/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    root /var/www/microbet-linera.xyz;
    index index.html;

    # Critical headers for SharedArrayBuffer (WASM threads)
    add_header Cross-Origin-Opener-Policy \"same-origin\" always;
    add_header Cross-Origin-Embedder-Policy \"require-corp\" always;
    add_header Cross-Origin-Resource-Policy \"same-origin\" always;

    # Assets (JS/CSS/WASM) with CORS for Web Workers
    location /assets/ {
        root /var/www/microbet-linera.xyz;
        add_header Cross-Origin-Opener-Policy \"same-origin\" always;
        add_header Cross-Origin-Embedder-Policy \"require-corp\" always;
        add_header Cross-Origin-Resource-Policy \"same-origin\" always;
        add_header Access-Control-Allow-Origin \"*\" always;
        add_header Access-Control-Allow-Methods \"GET, HEAD, OPTIONS\" always;
        add_header Cache-Control \"public, max-age=31536000, immutable\";

        if (\$request_method = OPTIONS) {
            add_header Content-Length 0;
            add_header Content-Type text/plain;
            return 204;
        }
    }

    # Static files
    location / {
        try_files \$uri /index.html;
    }

    # Orchestrator WebSocket proxy
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \"upgrade\";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        add_header Cross-Origin-Opener-Policy \"same-origin\" always;
        add_header Cross-Origin-Embedder-Policy \"require-corp\" always;
        add_header Cross-Origin-Resource-Policy \"same-origin\" always;
    }
}
NGINXEOF"

sudo nginx -t
sudo systemctl reload nginx

# =========================
# SYSTEMD SERVICES
# =========================
# Orchestrator
sudo bash -c "cat > /etc/systemd/system/microbet-orchestrator.service <<EOF
[Unit]
Description=Microbet Linera Orchestrator
After=network.target

[Service]
Type=simple
WorkingDirectory=$WORK_DIR/orchestrator
ExecStart=/usr/bin/node orchestrator.js
Restart=always
RestartSec=5
User=$RUN_USER
Group=$RUN_USER

[Install]
WantedBy=multi-user.target
EOF"

# Lottery Orchestrator
sudo bash -c "cat > /etc/systemd/system/microbet-lottery-orchestrator.service <<EOF
[Unit]
Description=Microbet Lottery Orchestrator
After=network.target

[Service]
Type=simple
WorkingDirectory=$WORK_DIR/orchestrator
ExecStart=/usr/bin/node lottery-orchestrator.js
Restart=always
RestartSec=5
User=$RUN_USER
Group=$RUN_USER

[Install]
WantedBy=multi-user.target
EOF"

# Supabase Sync
sudo bash -c "cat > /etc/systemd/system/microbet-sync.service <<EOF
[Unit]
Description=Microbet Supabase Sync Daemon
After=network.target

[Service]
Type=simple
WorkingDirectory=$WORK_DIR/orchestrator
ExecStart=/usr/bin/node supabase-sync.js
EnvironmentFile=/etc/microbet-linera/supabase.env
Restart=always
RestartSec=5
User=$RUN_USER
Group=$RUN_USER

[Install]
WantedBy=multi-user.target
EOF"

# Lottery Sync
sudo bash -c "cat > /etc/systemd/system/microbet-lottery-sync.service <<EOF
[Unit]
Description=Microbet Lottery Sync Daemon
After=network.target

[Service]
Type=simple
WorkingDirectory=$WORK_DIR/orchestrator
ExecStart=/usr/bin/node lottery-supabase-sync.js
EnvironmentFile=/etc/microbet-linera/supabase-lottery.env
Restart=always
RestartSec=5
User=$RUN_USER
Group=$RUN_USER

[Install]
WantedBy=multi-user.target
EOF"

sudo systemctl daemon-reload
sudo systemctl enable --now microbet-orchestrator.service microbet-sync.service microbet-lottery-orchestrator.service microbet-lottery-sync.service

echo "====================================="
echo " Deployment completed successfully!  "
echo " Visit: https://$DOMAIN/"
echo "====================================="
