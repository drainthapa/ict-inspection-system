# Testing

## Automated (API)

```bash
cd server
TEST_ADMIN_PASSWORD='your-admin-password' npm test
```

46 integration tests run against a real PostgreSQL database:

| File | Covers |
| --- | --- |
| `phase1.auth.test.js` | Login, cookies, sessions, logout, deactivation, password change, roles, ward-scoped access, SQL injection, audit log |
| `phase2.inventory.test.js` | Ward CRUD and staff assignment, categories, equipment registration rules, ward scoping, search/filter/sort/pagination, settings |
| `phase3to5.workflow.test.js` | Drafts and their privacy, submission rules, checklist, photo upload security, condition updates, history protection, maintenance approvals, replacement approvals and delivery, dashboard figures, all nine reports, Excel and PDF exports |

Tests create records with a unique prefix and delete them afterwards. Run them against a development database, not production.

## Manual checks on real devices

Before going live, an inspector should walk through this on their own phone over mobile data:

1. Log in; the bottom bar shows Overview, Inspect, Account and Menu.
2. Inspect: choose a ward, search for a device by asset ID, or register a new one.
3. Choose a condition other than Good; check that the repair fields appear, and disappear again for Good.
4. Take a photo with the camera and add one from the gallery; both previews show "Not saved".
5. Save draft, close the browser, reopen the draft from Inspection records; photos and text are there.
6. Submit with a required field empty; the missing field is highlighted and the draft is kept.
7. Submit completely; a repair request opens if repair was required.
8. As Super Admin, approve the repair; as the inspector, start and complete it with a spare part.
9. Download a PDF and an Excel report; print the PDF on A4.
