# ICT Inspection & Maintenance Management System

Sainamaina Municipality, Municipal Executive Office, Buddhanagar, Rupandehi, Lumbini Province, Nepal.

A mobile-first PERN application (PostgreSQL, Express, React, Node.js) for inspecting and maintaining ICT equipment across the municipality's 11 ward offices. The database is accessed with native SQL through `pg`; no ORM is used.

## Requirements

Node.js 18 or newer and PostgreSQL 13 or newer.

## 1. Create the database

```sql
CREATE USER ict WITH PASSWORD 'choose-a-strong-password';
CREATE DATABASE ict_inspection OWNER ict;
```

## 2. Set up the API

```bash
cd server
cp .env.example .env        # then edit PG*, JWT_SECRET and ADMIN_* values
npm install
npm run setup               # migrate + seed + create the first Super Admin
npm run dev                 # http://localhost:5000
```

`npm run setup` runs three steps you can also run separately:

| Command | What it does |
| --- | --- |
| `npm run db:migrate` | Applies `database/migrations/*.sql` in order, once each (tracked in `schema_migrations`) |
| `npm run db:seed` | Inserts roles, 11 wards, 31 equipment categories, checklist items and settings. Safe to re-run |
| `npm run setup:admin` | Creates the first Super Admin from `ADMIN_USERNAME` / `ADMIN_PASSWORD`, or prompts for the password if it is not set. Does nothing if a Super Admin exists |

After the admin is created, delete `ADMIN_PASSWORD` from `.env`.

Generate a JWT secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## 3. Run the client

```bash
cd client
npm install
npm run dev                 # http://localhost:5173
```

Vite proxies `/api` and `/uploads` to the API, so the browser sees one origin and the httpOnly auth cookie works without extra configuration. The dev server listens on your network address too, so inspectors can test from a phone on the same Wi-Fi.

## Tests

With the API's database migrated and seeded:

```bash
cd server
TEST_ADMIN_PASSWORD='your-admin-password' npm test
```

The tests cover authentication, roles, ward-level restrictions, session invalidation, validation and audit logging. They create temporary users with a unique prefix and delete them afterwards.

## API reference

All responses use `{ success, data, message?, meta? }` on success and `{ success: false, message, errors? }` on failure. Validation failures return 422 with a field-to-message map in `errors`.

| Method and path | Who | Notes |
| --- | --- | --- |
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | Anyone / signed in | Login sets an httpOnly cookie |
| `POST /api/auth/change-password` | Signed in | Signs out the user's other devices |
| `GET/POST /api/users`, `GET/PUT/DELETE /api/users/:id` | Super Admin (users may read themselves) | DELETE deactivates |
| `GET /api/wards`, `GET /api/wards/:id` | Signed in | Limited to the user's wards |
| `POST /api/wards`, `PUT/DELETE /api/wards/:id` | Super Admin | Delete only if the ward has no records |
| `PUT /api/wards/:id/users` | Super Admin | Sets the inspectors and ward users for a ward |
| `GET /api/equipment` | Signed in | Ward-scoped. `search`, `ward_id`, `category_id`, `group`, `condition` (or `not_inspected`), `status` (`all`), `sort`, `dir`, `page`, `limit` |
| `GET /api/equipment/:id` | Signed in | Ward-scoped; includes inspection and maintenance history |
| `POST /api/equipment`, `PUT /api/equipment/:id` | Super Admin, Inspector (own wards) | Only Super Admin can change status |
| `DELETE /api/equipment/:id` | Super Admin | Only if it has no history; otherwise mark disposed |
| `GET /api/equipment/next-asset-id` | Super Admin, Inspector | Suggests e.g. `SMM-W04-PRINTER-003` |
| `GET /api/equipment/categories` | Signed in | `include_inactive=true` for Super Admin |
| `POST /api/equipment/categories`, `PUT/DELETE /api/equipment/categories/:id` | Super Admin | Delete only if unused |
| `GET /api/settings`, `PUT /api/settings` | Signed in / Super Admin | Known keys only |
| `GET /api/inspections` | Signed in | Ward-scoped; drafts visible only to their author and Super Admin. Filters: `search`, `ward_id`, `category_id`, `equipment_id`, `condition`, `status`, `inspection_type`, `repair_required`, `replacement`, `date_from`, `date_to`, `mine`, `sort`, `dir` |
| `GET /api/inspections/:id`, `GET /api/inspections/checklist?category_id=` | Signed in | |
| `POST /api/inspections`, `PUT /api/inspections/:id` | Super Admin, Inspector | Saves a draft; add `"submit": true` to submit. Submitted inspections are read-only |
| `DELETE /api/inspections/:id` | Author or Super Admin | Drafts only |
| `POST /api/inspections/:id/photos`, `DELETE .../photos/:photoId` | Author or Super Admin | Multipart field `photos`; JPG/PNG/WEBP verified by content |
| `GET/POST /api/maintenance`, `GET/PUT /api/maintenance/:id` | Signed in / Super Admin, Inspector | Ward users can only create (report a fault). Approve and cancel are Super Admin only |
| `POST /api/maintenance/:id/photos` | Super Admin, Inspector | Field `stage`: `before` or `after` |
| `GET/POST /api/replacements`, `PUT /api/replacements/:id` | Signed in / Super Admin, Inspector | Status changes are Super Admin only; `delivered` retires the old device |
| `GET /api/dashboard/summary`, `GET /api/dashboard/charts` | Signed in | Filters: `ward_id`, `category_id`, `condition`, `maintenance_status`, `date_from`, `date_to` |
| `GET /api/reports`, `GET /api/reports/:type` | Signed in | Nine report types; `ward-wise`, `equipment`, `repair-cost` work as aliases |
| `GET /api/reports/export/excel?type=`, `GET /api/reports/export/pdf?type=` | Signed in | Same filters as the report |

## How the inspection workflow behaves

- **Draft and submit.** Inspectors can save incomplete work as a draft at any time; drafts are private to them. The form also keeps an automatic copy on the device, so text survives a dropped connection or accidental navigation.
- **Submission rules.** Submitting requires the equipment, condition, date (not in the future) and at least one recommended action. If the device is not fully operational, a problem description and a repair decision are required. Recommending complete replacement requires a reason and a technical justification. A "Good" inspection clears any repair fields.
- **History is permanent.** Submitted inspections cannot be edited or deleted. A back-dated inspection is added to history but does not overwrite a more recent condition.
- **What submission triggers.** The device's current condition is updated. If repair is required, a repair request opens with status Pending. If replacement is recommended, a replacement request goes to the Super Admin; the device is only retired when a Super Admin records delivery of the replacement.
- **Maintenance flow.** Pending → Under assessment → Approved (Super Admin) → In progress → Completed or Not repairable. The Super Admin can cancel open requests. Closed records are locked.

## Changing the schema

Never edit an applied migration. Add a new file such as `database/migrations/002_add_something.sql`, run `npm run db:migrate`, then `npm run db:schema` to regenerate `database/schema.sql` (a single-file view of the full schema).

## Roles

| Role | Access |
| --- | --- |
| Super Admin | Everything, all wards. Approves maintenance and replacements, manages users and settings |
| Inspector / Technician | Assigned wards only (at least one). Registers equipment, inspects, records maintenance |
| Ward Office User | Exactly one ward. Views equipment and results, reports faults |

Permissions are enforced by the API on every request. The client hides menu items by role for convenience only.

## Security notes

- Passwords are hashed with bcrypt. The JWT is stored in an httpOnly, SameSite=Strict cookie (Secure in production).
- Each user has a `token_version` embedded in their token. Logout, deactivation, role changes and password resets increment it, which immediately ends that user's sessions on every device.
- The user and their ward assignments are reloaded from the database on every request, so access changes take effect at once.
- Login is rate-limited (10 failed attempts per 15 minutes per IP). All other API routes are limited to 300 requests per minute.
- All SQL is parameterized. Important actions are recorded in `audit_logs`.

## Production deployment (outline)

1. Set `NODE_ENV=production`, a long `JWT_SECRET`, `CORS_ORIGINS`, and `PGSSL=true` if the database requires TLS.
2. `cd client && npm run build`, then serve `client/dist` from Nginx.
3. Run the API with a process manager (for example `pm2 start src/server.js --name ict-api`).
4. In Nginx, proxy `/api` and `/uploads` to the API and serve everything else from `dist`, falling back to `index.html` for client-side routes. Serve the site over HTTPS (the auth cookie is Secure in production).
5. Back up the PostgreSQL database and the `server/uploads` directory together.

## Further documentation

- `docs/CPANEL.md`: running on cPanel shared hosting as a single Node.js app.
- `docs/DEPLOYMENT.md`: production setup on a VPS with Nginx, pm2, HTTPS, backups and a pre-launch checklist.
- `docs/TESTING.md`: automated tests and a manual checklist for inspectors' phones.

## Project structure

```
ict-inspection-system/
├── client/                 React + Vite + Tailwind
│   └── src/{components,pages,layouts,services,hooks,context,utils}
└── server/                 Express API
    ├── src/{config,controllers,routes,middleware,services,validators,utils}
    ├── database/{schema.sql,seed.sql,migrations/}
    ├── scripts/            migrate, seed, create-admin, build-schema
    ├── tests/
    └── uploads/
```

## Development phases

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Project setup, schema, seed, authentication, roles, user management | Done |
| 2 | Ward management, staff assignment, equipment categories, equipment inventory, settings | Done |
| 3 | Inspection module, checklist, photos, drafts | Done |
| 4 | Maintenance and replacement recommendations | Done |
| 5 | Dashboard, search, reports, Excel/PDF export | Done |
| 6 | Testing and deployment documentation | Done (see `docs/`) |
