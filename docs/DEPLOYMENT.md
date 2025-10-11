# QuickCredit Uganda - Deployment Guide

## 🚀 Production Deployment Guide

### Prerequisites

- **Server**: Ubuntu 20.04+ or CentOS 8+ with minimum 4GB RAM, 2 CPU cores
- **Domain**: Registered domain with DNS access
- **SSL Certificate**: Let's Encrypt or commercial SSL certificate
- **Database**: PostgreSQL 13+ (can be on same server or separate)
- **Redis**: Redis 6+ for caching and sessions

### Step 1: Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib -y

# Install Redis
sudo apt install redis-server -y

# Install Nginx
sudo apt install nginx -y

# Install PM2 for process management
sudo npm install -g pm2

# Install Docker (optional)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

### Step 2: Database Setup

```bash
# Switch to postgres user
sudo -u postgres psql

# Create database and user
CREATE DATABASE quickcredit_db;
CREATE USER quickcredit_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE quickcredit_db TO quickcredit_user;
\q

# Configure PostgreSQL for connections
sudo nano /etc/postgresql/13/main/postgresql.conf
# Set: listen_addresses = 'localhost'

sudo nano /etc/postgresql/13/main/pg_hba.conf
# Add: local   quickcredit_db   quickcredit_user   md5

sudo systemctl restart postgresql
```

### Step 3: Application Deployment

```bash
# Create application directory
sudo mkdir -p /var/www/quickcredit
sudo chown $USER:$USER /var/www/quickcredit

# Clone repository
cd /var/www/quickcredit
git clone https://github.com/your-org/quickcredit-modern.git .

# Install dependencies
npm install

# Build applications
npm run build

# Set up environment variables
cp backend/.env.example backend/.env
nano backend/.env
```

### Step 4: Environment Configuration

Update `backend/.env` for production:

```env
NODE_ENV=production
PORT=5000
DATABASE_URL="postgresql://quickcredit_user:your_secure_password@localhost:5432/quickcredit_db"
JWT_SECRET=your-super-long-random-jwt-secret-at-least-32-characters
JWT_REFRESH_SECRET=your-super-long-random-refresh-secret-different-from-jwt

# Use your domain
FRONTEND_URL=https://admin.quickcredit.ug
CLIENT_PORTAL_URL=https://portal.quickcredit.ug

# Production email settings
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=noreply@quickcredit.ug
EMAIL_PASS=your-app-password

# Production mobile money credentials
MTN_MOMO_ENVIRONMENT=production
MTN_MOMO_BASE_URL=https://momodeveloper.mtn.com
# ... add your production credentials

# Production WhatsApp credentials
TWILIO_ACCOUNT_SID=your-production-sid
TWILIO_AUTH_TOKEN=your-production-token
```

### Step 5: Database Migration

```bash
cd backend
npx prisma migrate deploy
npx prisma db seed
```

### Step 6: PM2 Configuration

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'quickcredit-backend',
    script: 'dist/server.js',
    cwd: '/var/www/quickcredit/backend',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: '/var/log/quickcredit/backend-error.log',
    out_file: '/var/log/quickcredit/backend-out.log',
    log_file: '/var/log/quickcredit/backend.log',
    max_memory_restart: '500M',
    node_args: '--max-old-space-size=500'
  }]
};
```

Start the application:

```bash
# Create log directory
sudo mkdir -p /var/log/quickcredit
sudo chown $USER:$USER /var/log/quickcredit

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Step 7: Nginx Configuration

Create `/etc/nginx/sites-available/quickcredit`:

```nginx
# Admin Dashboard
server {
    listen 80;
    server_name admin.quickcredit.ug;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name admin.quickcredit.ug;

    ssl_certificate /etc/letsencrypt/live/admin.quickcredit.ug/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.quickcredit.ug/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;

    root /var/www/quickcredit/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Client Portal
server {
    listen 80;
    server_name portal.quickcredit.ug;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name portal.quickcredit.ug;

    ssl_certificate /etc/letsencrypt/live/portal.quickcredit.ug/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/portal.quickcredit.ug/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;

    root /var/www/quickcredit/client-portal/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# API Only (optional)
server {
    listen 80;
    server_name api.quickcredit.ug;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.quickcredit.ug;

    ssl_certificate /etc/letsencrypt/live/api.quickcredit.ug/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.quickcredit.ug/privkey.pem;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/quickcredit /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 8: SSL Certificate Setup

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get certificates
sudo certbot --nginx -d admin.quickcredit.ug
sudo certbot --nginx -d portal.quickcredit.ug
sudo certbot --nginx -d api.quickcredit.ug

# Set up auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

### Step 9: Firewall Configuration

```bash
# Enable UFW
sudo ufw enable

# Allow SSH
sudo ufw allow ssh

# Allow HTTP and HTTPS
sudo ufw allow 80
sudo ufw allow 443

# Check status
sudo ufw status
```

### Step 10: Monitoring Setup

Create monitoring script `/var/www/quickcredit/scripts/monitor.sh`:

```bash
#!/bin/bash

# Check if backend is running
if ! pgrep -f "quickcredit-backend" > /dev/null; then
    echo "Backend not running, restarting..."
    pm2 restart quickcredit-backend
fi

# Check disk space
DISK_USAGE=$(df /var/www/quickcredit | tail -1 | awk '{print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 80 ]; then
    echo "Disk usage is ${DISK_USAGE}% - WARNING"
fi

# Check memory usage
MEMORY_USAGE=$(free | grep Mem | awk '{printf("%.2f", $3/$2 * 100.0)}')
if (( $(echo "$MEMORY_USAGE > 90" | bc -l) )); then
    echo "Memory usage is ${MEMORY_USAGE}% - WARNING"
fi

# Log rotation
find /var/log/quickcredit -name "*.log" -size +100M -exec gzip {} \;
find /var/log/quickcredit -name "*.log.gz" -mtime +30 -delete
```

Add to crontab:

```bash
chmod +x /var/www/quickcredit/scripts/monitor.sh
crontab -e
# Add: */5 * * * * /var/www/quickcredit/scripts/monitor.sh >> /var/log/quickcredit/monitor.log 2>&1
```

### Step 11: Backup Strategy

Create backup script `/var/www/quickcredit/scripts/backup.sh`:

```bash
#!/bin/bash

BACKUP_DIR="/var/backups/quickcredit"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Database backup
pg_dump -h localhost -U quickcredit_user quickcredit_db > $BACKUP_DIR/db_backup_$DATE.sql

# Application backup
tar -czf $BACKUP_DIR/app_backup_$DATE.tar.gz -C /var/www quickcredit

# Keep only last 7 days of backups
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
```

Schedule daily backups:

```bash
chmod +x /var/www/quickcredit/scripts/backup.sh
crontab -e
# Add: 0 2 * * * /var/www/quickcredit/scripts/backup.sh >> /var/log/quickcredit/backup.log 2>&1
```

## 🐳 Docker Production Deployment

For containerized deployment, use the provided `docker-compose.yml`:

```bash
# Production build
docker-compose -f docker-compose.yml build

# Start services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f backend
```

## 📊 Post-Deployment Checklist

- [ ] All services are running (PM2 status)
- [ ] Database connections are working
- [ ] SSL certificates are valid
- [ ] API endpoints are responding
- [ ] Frontend applications load correctly
- [ ] Mobile money integrations are tested
- [ ] WhatsApp notifications work
- [ ] Email notifications work
- [ ] Backup scripts are working
- [ ] Monitoring is active
- [ ] Default passwords changed
- [ ] Security headers configured
- [ ] Rate limiting is active
- [ ] Audit logging is enabled

## 🔍 Troubleshooting

### Common Issues

1. **Backend not starting**
   ```bash
   pm2 logs quickcredit-backend
   # Check for database connection or missing environment variables
   ```

2. **Database connection errors**
   ```bash
   sudo -u postgres psql -c "SELECT 1;" quickcredit_db
   # Verify database is accessible
   ```

3. **SSL certificate issues**
   ```bash
   sudo certbot certificates
   sudo nginx -t
   ```

4. **High memory usage**
   ```bash
   pm2 monit
   # Check for memory leaks
   ```

5. **Mobile money API errors**
   - Verify API credentials in production environment
   - Check API endpoint URLs
   - Validate webhook configurations

## 📞 Support

For deployment support:
- Email: devops@quickcredit.ug
- Documentation: https://docs.quickcredit.ug/deployment
- Emergency: +256-XXX-XXXXXX