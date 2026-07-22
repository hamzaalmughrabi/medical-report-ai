#!/bin/bash
# MedEcho AWS Server Setup Script
# Run this on your EC2 Ubuntu 22.04 instance after SSH-ing in
# Usage: chmod +x setup.sh && ./setup.sh

set -e  # Stop on any error

echo "========================================"
echo "  MedEcho Backend - AWS Setup Script"
echo "========================================"

# 1. System update
echo "[1/8] Updating system packages..."
sudo apt update && sudo apt upgrade -y

# 2. Install dependencies
echo "[2/8] Installing system dependencies..."
sudo apt install -y \
    python3.11 \
    python3.11-venv \
    python3-pip \
    nginx \
    ffmpeg \
    git \
    certbot \
    python3-certbot-nginx \
    curl \
    unzip \
    awscli

# 3. Create app directory
echo "[3/8] Creating app directory..."
sudo mkdir -p /opt/medecho
sudo chown ubuntu:ubuntu /opt/medecho
mkdir -p /opt/medecho/storage/data/patients
mkdir -p /opt/medecho/storage/data/reports
mkdir -p /opt/medecho/storage/data/audio_uploads
mkdir -p /opt/medecho/storage/logs

# 4. Set up Python virtual environment
echo "[4/8] Setting up Python environment..."
cd /opt/medecho
python3.11 -m venv venv
source venv/bin/activate

# 5. Upgrade pip
pip install --upgrade pip setuptools wheel

echo "[5/8] Ready for requirements install."
echo "      After uploading your backend files, run:"
echo "      source /opt/medecho/venv/bin/activate"
echo "      pip install -r /opt/medecho/backend/requirements.txt"

# 6. Create placeholder .env file
echo "[6/8] Creating .env template..."
if [ ! -f /opt/medecho/.env ]; then
cat > /opt/medecho/.env << 'EOF'
# MedEcho Environment Variables
# EDIT THIS FILE with your real API keys before starting the service

OPENAI_API_KEY="${OPENAI_API_KEY}"
GOOGLE_API_KEY=your-google-ai-key-here
ENVIRONMENT=production
EOF
chmod 600 /opt/medecho/.env
echo "      ⚠️  Edit /opt/medecho/.env with your real API keys!"
fi

# 7. Install systemd service
echo "[7/8] Installing systemd service..."
sudo tee /etc/systemd/system/medecho.service > /dev/null << 'EOF'
[Unit]
Description=MedEcho FastAPI Backend
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/medecho/backend/app
Environment="PATH=/opt/medecho/venv/bin"
EnvironmentFile=/opt/medecho/.env
ExecStart=/opt/medecho/venv/bin/uvicorn backend_api:app --host 0.0.0.0 --port 8001 --workers 2 --log-level info
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=medecho

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable medecho
echo "      Service installed. Will start after you upload backend files."

# 8. Install Nginx config
echo "[8/8] Setting up Nginx..."
sudo tee /etc/nginx/sites-available/medecho > /dev/null << 'NGINXEOF'
server {
    listen 80;
    server_name _;

    # Temp: allow direct HTTP for health check before SSL
    location /health {
        proxy_pass http://127.0.0.1:8001;
    }

    location /.well-known/ {
        root /var/www/html;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}
NGINXEOF

sudo ln -sf /etc/nginx/sites-available/medecho /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "========================================"
echo "  ✅ Base Setup Complete!"
echo "========================================"
echo ""
echo "NEXT STEPS:"
echo "1. Upload your backend files from your PC:"
echo "   scp -i key.pem -r ./backend ubuntu@YOUR_IP:/opt/medecho/"
echo "   scp -i key.pem -r ./storage ubuntu@YOUR_IP:/opt/medecho/"
echo ""
echo "2. Install Python dependencies:"
echo "   source /opt/medecho/venv/bin/activate"
echo "   pip install -r /opt/medecho/backend/requirements.txt"
echo ""
echo "3. Edit your API keys:"
echo "   nano /opt/medecho/.env"
echo ""
echo "4. Start the backend:"
echo "   sudo systemctl start medecho"
echo "   curl http://localhost:8001/health"
echo ""
echo "5. Set up SSL (replace YOUR_DOMAIN and YOUR_EMAIL):"
echo "   sudo certbot --nginx -d YOUR_DOMAIN --email YOUR_EMAIL --agree-tos"
echo ""
