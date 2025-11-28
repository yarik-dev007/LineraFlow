#!/usr/bin/env bash
set -euo pipefail

# =========================
# CONFIG
# =========================
DOMAIN="lineraflow.xyz"
EMAIL="egor4042007@gmail.com"
WORK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
RUN_USER="${SUDO_USER:-$(whoami)}"
BUILD_DIR="$WORK_DIR/dist"
PB_VERSION="0.22.21" # Adjust version as needed

# =========================
# INSTALL SYSTEM PACKAGES
# =========================
echo ">>> Installing system packages..."
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg ufw nodejs nginx certbot python3-certbot-nginx unzip

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# =========================
# UFW FIREWALL
# =========================
echo ">>> Configuring Firewall..."
sudo ufw allow OpenSSH
sudo ufw allow "Nginx Full"
sudo ufw allow 8090/tcp # Allow external access to PocketBase port if needed, but we will proxy via Nginx
sudo ufw --force enable

# =========================
# INSTALL DEPENDENCIES & BUILD
# =========================
# =========================
# ENVIRONMENT CONFIG
# =========================
echo ">>> Generating .env file..."
cat > "$WORK_DIR/.env" <<EOF
VITE_LINERA_FAUCET_URL=https://faucet.testnet-conway.linera.net
VITE_LINERA_APPLICATION_ID=a2376c5a0cc2e471078462f22eacca74d1ca8849dd09dbc47cb0e5da5e06fb89
VITE_LINERA_MAIN_CHAIN_ID=bdbf434aa7a91c5696b142a32028361ee988175e1da207c26fcd06b3e0205eb8
VITE_POCKETBASE_URL=https://$DOMAIN:8090
EOF

echo ">>> Building frontend..."
cd "$WORK_DIR"
npm ci
npm run build

# Deploy Frontend Files
sudo mkdir -p /var/www/$DOMAIN
sudo rm -rf /var/www/$DOMAIN/*
sudo cp -r "$WORK_DIR/dist/"* /var/www/$DOMAIN/

# =========================
# SETUP POCKETBASE
# =========================
echo ">>> Setting up PocketBase..."
sudo mkdir -p /opt/pocketbase
cd /opt/pocketbase

if [ ! -f "pocketbase" ]; then
    wget https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip
    unzip pocketbase_${PB_VERSION}_linux_amd64.zip
    rm pocketbase_${PB_VERSION}_linux_amd64.zip
    chmod +x pocketbase
fi

# Create Systemd Service for PocketBase
sudo bash -c "cat > /etc/systemd/system/pocketbase.service <<EOF
[Unit]
Description=PocketBase Service
After=network.target

[Service]
User=$RUN_USER
Group=$RUN_USER
WorkingDirectory=/opt/pocketbase
ExecStart=/opt/pocketbase/pocketbase serve --http=127.0.0.1:8090
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF"

sudo systemctl daemon-reload
sudo systemctl enable --now pocketbase

# =========================
# NGINX CONFIG
# =========================
echo ">>> Configuring Nginx..."

# Main Site Config (Port 80/443) + PocketBase Proxy (Port 8090 SSL)
sudo mkdir -p /var/www/lineraflow.xyz/.well-known/acme-challenge

sudo bash -c "cat > /etc/nginx/sites-available/$DOMAIN <<'NGINXEOF'
server {
    listen 80;
    server_name lineraflow.xyz;

    location ^~ /.well-known/acme-challenge/ {
        alias /var/www/lineraflow.xyz/.well-known/acme-challenge/;
        try_files \$uri =404;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

# Main Frontend Server
server {
    listen 443 ssl http2;
    server_name lineraflow.xyz;

    # SSL Certificates
    ssl_certificate /etc/letsencrypt/live/lineraflow.xyz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/lineraflow.xyz/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    root /var/www/lineraflow.xyz;
    index index.html;

    # Security & COEP/COOP Headers for Linera WASM
    add_header Cross-Origin-Opener-Policy \"same-origin\" always;
    add_header Cross-Origin-Embedder-Policy \"require-corp\" always;
    add_header Cross-Origin-Resource-Policy \"same-origin\" always;

    # Assets
    location /assets/ {
        root /var/www/lineraflow.xyz;
        add_header Cross-Origin-Opener-Policy \"same-origin\" always;
        add_header Cross-Origin-Embedder-Policy \"require-corp\" always;
        add_header Cross-Origin-Resource-Policy \"same-origin\" always;
        add_header Cache-Control \"public, max-age=31536000, immutable\";
    }

    # SPA Fallback
    location / {
        try_files \$uri /index.html;
    }
}

# PocketBase Secure Proxy (Port 8090)
server {
    listen 8090 ssl http2;
    server_name lineraflow.xyz;

    # Reuse same SSL certs
    ssl_certificate /etc/letsencrypt/live/lineraflow.xyz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/lineraflow.xyz/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # COEP/COOP Headers
    add_header Cross-Origin-Opener-Policy \"same-origin\" always;
    add_header Cross-Origin-Embedder-Policy \"require-corp\" always;
    add_header Access-Control-Allow-Origin \"*\" always;

    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \"upgrade\";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        client_max_body_size 10M;
    }
}
NGINXEOF"

# Create dummy certs if they don't exist so Nginx can start for Certbot
if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    echo ">>> Creating dummy certificates for initial Nginx start..."
    sudo mkdir -p /etc/letsencrypt/live/$DOMAIN
    sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout /etc/letsencrypt/live/$DOMAIN/privkey.pem \
        -out /etc/letsencrypt/live/$DOMAIN/fullchain.pem \
        -subj "/CN=$DOMAIN"
    
    # Create dhparams if missing
    if [ ! -f "/etc/letsencrypt/ssl-dhparams.pem" ]; then
        sudo openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048
    fi
fi

sudo ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
sudo nginx -t
sudo systemctl reload nginx

# =========================
# LET'S ENCRYPT SSL
# =========================
echo ">>> Requesting SSL Certificates..."
# Use webroot mode to avoid Nginx config modification issues
sudo certbot certonly --webroot -w /var/www/lineraflow.xyz -n --agree-tos -m "$EMAIL" -d "$DOMAIN" --force-renewal || true

# Reload Nginx to pick up real certs
sudo systemctl reload nginx

echo "====================================="
echo " Deployment completed successfully!  "
echo " Frontend: https://$DOMAIN/"
echo " PocketBase: https://$DOMAIN:8090/"
echo "====================================="
