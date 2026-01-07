#!/bin/bash
set -e

DOMAIN="lineraflow.xyz"

echo ">>> Applying COMPREHENSIVE Nginx fix for $DOMAIN..."

# Create Nginx config with CSP and headers for ALL services
cat <<EOF | sudo tee /etc/nginx/sites-available/$DOMAIN
map \$http_upgrade \$connection_upgrade {
    default upgrade;
    ''      keep-alive;
}

server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    root /var/www/$DOMAIN;
    index index.html;

    # =============================================================
    # GLOBAL HEADERS (Applied to everything served by this block)
    # =============================================================
    
    # 1. Enable SharedArrayBuffer (WASM threads)
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
    add_header Cross-Origin-Resource-Policy "same-origin" always;

    # 2. Allow 'eval' for WASM/JS bindings (Fixes CSP error)
    # We allow 'self', https:, data:, blob:, and 'unsafe-eval'/'unsafe-inline'
    add_header Content-Security-Policy "default-src 'self' https: data: blob: 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src 'self' https: wss:; object-src 'none'; base-uri 'self';" always;

    # Assets
    location /assets/ {
        root /var/www/$DOMAIN;
        # Repeat headers because 'location' block can reset them
        add_header Cross-Origin-Opener-Policy "same-origin" always;
        add_header Cross-Origin-Embedder-Policy "require-corp" always;
        add_header Cross-Origin-Resource-Policy "same-origin" always;
        add_header Access-Control-Allow-Origin "*" always;
        add_header Access-Control-Allow-Methods "GET, HEAD, OPTIONS" always;
        add_header Cache-Control "public, max-age=31536000, immutable";

        if (\$request_method = OPTIONS) {
            add_header Content-Length 0;
            add_header Content-Type text/plain;
            return 204;
        }
    }

    # Blob Server Proxy
    location /upload {
        proxy_pass http://127.0.0.1:8077;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        client_max_body_size 50M;

        # Ensure Blob Server responses also have the required headers
        add_header Cross-Origin-Opener-Policy "same-origin" always;
        add_header Cross-Origin-Embedder-Policy "require-corp" always;
        add_header Cross-Origin-Resource-Policy "same-origin" always;
    }

    # Static files fallback
    location / {
        try_files \$uri /index.html;
    }
}

# PocketBase Secure Proxy (Port 8090)
server {
    listen 8090 ssl http2;
    server_name $DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Fixes: "Cross-Origin Embedder Policy to prevent this frame from being blocked"
    # Even the PocketBase proxy needs these headers if it's being fetched/embedded
    # by a page that has COEP: require-corp.
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
    add_header Cross-Origin-Resource-Policy "cross-origin" always; # Allow cross-origin if needed
    add_header Access-Control-Allow-Origin "*" always;

    location / {
        proxy_pass http://127.0.0.1:8091;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        proxy_buffering off;
        proxy_cache off;
        client_max_body_size 10M;
    }
}
EOF

echo ">>> Testing Nginx configuration..."
sudo nginx -t

echo ">>> Reloading Nginx..."
sudo systemctl reload nginx

echo ">>> DONE. Important: Clear Browser Cache (Ctrl+F5) before testing!"
