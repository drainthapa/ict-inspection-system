# Running on cPanel hosting

The whole system runs as one cPanel Node.js app: the same Node process serves the website, the API and the uploaded photos.

## What your hosting must have

Check these in cPanel before starting. All three are required.

| Requirement | Where to check |
| --- | --- |
| **Setup Node.js App**, Node 18 or newer (20 recommended) | cPanel home, Software section |
| **PostgreSQL Databases**, server version 12 or newer | cPanel home, Databases section. For the version, open phpPgAdmin and run `SELECT version();` |
| **Terminal** (or SSH access) | cPanel home, Advanced section. Strongly recommended; see step 7 for a workaround without it |

If PostgreSQL is missing (many hosts only offer MySQL), or is older than version 12, this hosting cannot run the system. Ask the host to enable PostgreSQL 12+, or use a VPS and follow `DEPLOYMENT.md`.

## 1. Build the website on your computer

cPanel servers often have too little memory to build the React app, so build it locally:

```
cd ict-inspection-system\client
npm install
npm run build
```

This creates `client\dist`. Then make a zip of the whole `ict-inspection-system` folder, **leaving out** both `node_modules` folders and `server\.env`. Make sure `client\dist` is included.

## 2. Create a subdomain with HTTPS

1. cPanel, **Domains**, **Create A New Domain**: for example `ict.sainamainamun.gov.np`.
2. cPanel, **SSL/TLS Status**: run **AutoSSL** so the subdomain has HTTPS. Login will not work in production without HTTPS.

## 3. Create the database

cPanel, **PostgreSQL Databases**:

1. Create a database named `ict_inspection`. cPanel adds your account prefix, giving for example `cpuser_ict_inspection`.
2. Create a user named `ict` with a strong password (it becomes `cpuser_ict`).
3. Under **Add User to Database**, add that user to the database with **all privileges**.

Write down the full database name, user name and password.

## 4. Upload the files

cPanel, **File Manager**:

1. Go to your home folder (`/home/cpuser`), **not** `public_html`.
2. Upload the zip and **Extract** it, giving `/home/cpuser/ict-inspection-system`.
3. Create an empty folder `/home/cpuser/ict-uploads` for photos. Keeping it outside the app folder means updates never touch the photos.

## 5. Create the Node.js app

cPanel, **Setup Node.js App**, **Create Application**:

| Field | Value |
| --- | --- |
| Node.js version | 20 (or the newest 18+ offered) |
| Application mode | Production |
| Application root | `ict-inspection-system/server` |
| Application URL | `ict.sainamainamun.gov.np` (the subdomain from step 2) |
| Application startup file | `app.cjs` |

Add these **Environment variables**, replacing `cpuser`, the domain and the passwords with yours:

| Name | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PGHOST` | `localhost` |
| `PGPORT` | `5432` |
| `PGDATABASE` | `cpuser_ict_inspection` |
| `PGUSER` | `cpuser_ict` |
| `PGPASSWORD` | the database password from step 3 |
| `JWT_SECRET` | a long random string, at least 32 characters |
| `CORS_ORIGINS` | `https://ict.sainamainamun.gov.np` |
| `CLIENT_DIST` | `/home/cpuser/ict-inspection-system/client/dist` |
| `UPLOAD_DIR` | `/home/cpuser/ict-uploads` |
| `BCRYPT_ROUNDS` | `10` |
| `ADMIN_USERNAME` | `admin` |
| `ADMIN_PASSWORD` | a temporary admin password (letters and numbers, 8+ characters) |

Click **Create**. To generate a JWT secret on your computer: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

## 6. Install the server libraries

On the same Node.js app page, click **Run NPM Install** and wait until it finishes.

## 7. Create the tables, data and admin account

**With Terminal (recommended).** At the top of the Node.js app page, cPanel shows a command starting with `source /home/cpuser/nodevenv/...`. Copy it, open cPanel **Terminal**, paste it, then run:

```
cd ~/ict-inspection-system/server
npm run setup
```

You should see two migrations applied, `Seed complete`, and `Super Admin "admin" created`.

**Without Terminal.** On the Node.js app page, use **Run JS script** to run `db:migrate`, then `db:seed`, then `setup:admin`, in that order.

## 8. Finish

1. Back on the Node.js app page, **delete the `ADMIN_PASSWORD` variable**, click **Save**, then **Restart**.
2. Open `https://ict.sainamainamun.gov.np`, log in as `admin`, and change the password under **Account**.

## Updating to a new version

1. Build the client on your computer again (step 1).
2. Upload and extract the new files over the old ones. Your photos live in `ict-uploads`, so they are not affected.
3. Click **Run NPM Install**.
4. In Terminal (after the `source` command): `cd ~/ict-inspection-system/server && npm run db:migrate`.
5. Click **Restart**.

## Backups

cPanel **Backup** (or the host's backup tool) should include your home folder and the PostgreSQL database. Make sure both `ict-uploads` and the database are covered, and download a copy regularly.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| The site shows an error page or "Incomplete response" | Open `stderr.log` in `ict-inspection-system/server` with File Manager; it shows the real error. |
| `Missing required environment variables` | A variable from step 5 is missing or misspelt. Fix it, Save, Restart. |
| `password authentication failed` | `PGUSER`/`PGPASSWORD` wrong, or the user was not added to the database (step 3.3). Use the full prefixed names. |
| `permission denied` or `must be owner` during setup | Re-add the user to the database with **all privileges**. |
| `syntax error at or near "GENERATED"` during setup | The host's PostgreSQL is older than 12. Ask the host to upgrade, or use a VPS. |
| The website loads but shows a blank page | `CLIENT_DIST` is wrong or `client/dist` was not uploaded. |
| Login works but you are immediately logged out | The site is not on HTTPS. Run AutoSSL (step 2) and open the `https://` address. |
| Photo upload fails with error 413 | The host limits upload size; ask them to allow at least 60 MB request bodies. |
| Changes to environment variables have no effect | Click **Restart** after saving. |
