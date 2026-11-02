# Production deployment

A tested layout for one Ubuntu 22.04/24.04 server running PostgreSQL, the API and Nginx. Adjust names and paths to your environment.

## 1. Install system packages

```bash
sudo apt update
sudo apt install -y postgresql nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

## 2. Database

```bash
sudo -u postgres psql <<'SQL'
CREATE USER ict WITH PASSWORD 'a-long-random-password';
CREATE DATABASE ict_inspection OWNER ict;
SQL
```

## 3. Application

```bash
sudo mkdir -p /opt/ict-inspection && sudo chown $USER /opt/ict-inspection
# copy the project into /opt/ict-inspection, then:
cd /opt/ict-inspection/server
cp .env.example .env
nano .env        # NODE_ENV=production, PG*, JWT_SECRET, CORS_ORIGINS=https://ict.sainamainamun.gov.np
npm ci --omit=dev
npm run setup    # migrations, seed data, first Super Admin
# remove ADMIN_PASSWORD from .env now

cd ../client
npm ci
npm run build    # produces client/dist
```

## 4. Run the API with pm2

```bash
cd /opt/ict-inspection/server
pm2 start src/server.js --name ict-api --time
pm2 save
pm2 startup      # follow the printed command so the API starts on boot
```

## 5. Nginx

`/etc/nginx/sites-available/ict-inspection`:

```nginx
server {
    listen 80;
    server_name ict.example.gov.np;

    root /opt/ict-inspection/client/dist;
    index index.html;

    client_max_body_size 60m;   # up to 10 photos of 5 MB per upload

    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    # Photos are checked against the user's session by the API
    location /uploads/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        try_files $uri /index.html;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/ict-inspection /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d ict.example.gov.np    # HTTPS is required: the auth cookie is Secure in production
```

## 6. Backups

Back up the database and the uploaded photos together, nightly:

```bash
# /etc/cron.d/ict-backup
30 1 * * * postgres pg_dump -Fc ict_inspection > /var/backups/ict/db-$(date +\%F).dump
45 1 * * * root tar -czf /var/backups/ict/uploads-$(date +\%F).tar.gz -C /opt/ict-inspection/server uploads
0  3 * * * root find /var/backups/ict -type f -mtime +30 -delete
```

Restore with `pg_restore -d ict_inspection --clean db-YYYY-MM-DD.dump` and by extracting the uploads archive into `server/`.

## 7. Updating

```bash
cd /opt/ict-inspection
# copy in the new version, then:
cd server && npm ci --omit=dev && npm run db:migrate && pm2 restart ict-api
cd ../client && npm ci && npm run build
```

Migrations are applied once each and recorded in `schema_migrations`, so `db:migrate` is safe to run on every update.

## Pre-launch checklist

- [ ] `NODE_ENV=production` and a `JWT_SECRET` of at least 32 random characters
- [ ] `ADMIN_PASSWORD` removed from `.env` after setup; `.env` readable only by the service user (`chmod 600`)
- [ ] HTTPS working; HTTP redirects to HTTPS
- [ ] `CORS_ORIGINS` set to the real site address
- [ ] Ward details (chairperson, secretary, contacts) filled in for all 11 wards
- [ ] Inspector and ward office accounts created and assigned
- [ ] Backup cron installed and one restore tested
- [ ] Test on the inspectors' actual phones: login, camera photo, save draft, submit
