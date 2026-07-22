# MedEcho — Upload & Deploy Script (Run from your Windows PC)
# Prerequisites: SSH key file (.pem), your server IP

# =============================================
# EDIT THESE TWO LINES:
$KEY_PATH = "C:\Users\hamza\Downloads\medecho-key.pem"
$SERVER_IP = "YOUR_ELASTIC_IP_HERE"
# =============================================

$PROJECT_ROOT = "C:\Users\hamza\PycharmProjects\medical-ai-"

Write-Host "MedEcho — Uploading backend to AWS..." -ForegroundColor Cyan

# Upload backend code
Write-Host "`n[1/3] Uploading backend..." -ForegroundColor Yellow
scp -i $KEY_PATH -r "$PROJECT_ROOT\backend" "ubuntu@${SERVER_IP}:/opt/medecho/"

# Upload storage folder (if it exists locally)
Write-Host "`n[2/3] Uploading storage structure..." -ForegroundColor Yellow
scp -i $KEY_PATH -r "$PROJECT_ROOT\storage" "ubuntu@${SERVER_IP}:/opt/medecho/"

Write-Host "`n[3/3] Installing Python dependencies on server..." -ForegroundColor Yellow
ssh -i $KEY_PATH "ubuntu@${SERVER_IP}" @"
    source /opt/medecho/venv/bin/activate
    pip install -r /opt/medecho/backend/requirements.txt
    sudo systemctl restart medecho
    sleep 2
    curl -s http://localhost:8001/health
"@

Write-Host "`n✅ Done! Check the health response above." -ForegroundColor Green
Write-Host "If it shows {status: ok}, your backend is live!" -ForegroundColor Green
