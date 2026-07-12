# TransitOps — Smart Transport Operations Platform

A complete transport operations platform: vehicle registry, driver management,
trip dispatch, maintenance, fuel & expense tracking, dashboards, and
reports/analytics — with role-based access control and all mandatory business
rules enforced server-side.

## Stack

- **Backend:** Node.js + Express, SQLite (via `better-sqlite3`), JWT auth, bcrypt password hashing
- **Frontend:** Vanilla HTML/CSS/JS single-page app (no build step), Chart.js for analytics
- **Database:** a single SQLite file, auto-created and auto-seeded on first run — nothing to install or configure

## Quick start

```bash
cd backend
npm install
npm start
```

Then open **http://localhost:4000** in your browser. The server serves both the API (`/api/*`) and the frontend.

On first run, the database is created and seeded automatically with demo users, vehicles, drivers, and a completed example trip (mirroring the workflow in the spec: Van-05 + Alex).

### Demo logins

All demo accounts share the password `Password123!`. The login screen has one-click buttons for each.

| Role | Email |
|---|---|
| Fleet Manager | fleetmanager@transitops.com |
| Driver | driver@transitops.com |
| Safety Officer | safety@transitops.com |
| Financial Analyst | finance@transitops.com |
| Admin (all permissions) | admin@transitops.com |

To reset the demo data, stop the server and delete `backend/data/transitops.db*`, then restart.

## What's implemented

**Authentication & RBAC**
- Email/password login (bcrypt-hashed), JWT sessions, all routes require authentication.
- Role permissions enforced **server-side** in every write route (not just hidden in the UI):
  - **Fleet Manager** — vehicles, drivers, maintenance, dashboard, reports
  - **Driver** — create/dispatch/complete/cancel trips
  - **Safety Officer** — manage drivers (license, safety score, status)
  - **Financial Analyst** — fuel logs, expenses, reports
  - **Admin** — everything

**Dashboard**
- KPIs: Active Vehicles, Available Vehicles, Vehicles in Maintenance, Active Trips, Pending Trips, Drivers On Duty, Fleet Utilization %.
- Filters by vehicle type, status, and region.
- "Fleet Status Board" — a live strip of every vehicle, pulsing while dispatched.

**Vehicle Registry** — unique registration number enforced, full CRUD, status lifecycle (Available / On Trip / In Shop / Retired).

**Driver Management** — profiles with license category/expiry, safety score, status (Available / On Trip / Off Duty / Suspended), expired-license flag shown inline.

**Trip Management** — Draft → Dispatched → Completed / Cancelled, with the full set of mandatory validations (see below).

**Maintenance** — opening a record immediately sets the vehicle to "In Shop" (removed from dispatch pool); closing restores it to Available unless Retired or another active record exists.

**Fuel & Expenses** — fuel logs and misc expenses (tolls, fines, etc.), automatic per-vehicle operational cost = Fuel + Maintenance + Other.

**Reports & Analytics** — Fuel Efficiency (distance/fuel), Fleet Utilization, Operational Cost, Vehicle ROI `(Revenue − (Maintenance + Fuel)) / Acquisition Cost`, monthly cost trend chart, fleet status breakdown chart. CSV export on every table.

## Mandatory business rules (enforced in the API, not just the UI)

- Vehicle registration number must be unique.
- Retired or In Shop vehicles never appear in dispatch selection (`GET /api/vehicles/available`).
- Drivers with expired licenses or Suspended status cannot be assigned to trips.
- A vehicle or driver already On Trip cannot be assigned to another trip.
- Cargo weight cannot exceed the vehicle's max load capacity.
- Dispatching a trip sets both vehicle and driver to On Trip; completing or cancelling a dispatched trip restores both to Available.
- Opening a maintenance record sets the vehicle to In Shop; closing it restores Available (unless Retired).

## Project structure

```
transitops/
├── backend/
│   ├── server.js          # Express app entry point
│   ├── db.js               # SQLite schema
│   ├── seed.js              # Idempotent demo data seed
│   ├── middleware/auth.js   # JWT auth + RBAC
│   └── routes/               # auth, vehicles, drivers, trips, maintenance,
│                              # fuelExpenses, dashboard, reports
└── frontend/
    ├── index.html
    ├── css/style.css
    └── js/{api.js, app.js}
```

## API overview

All endpoints are under `/api` and (except `/api/auth/login` and `/api/health`) require `Authorization: Bearer <token>`.

- `POST /api/auth/login`, `GET /api/auth/me`
- `GET/POST/PUT/DELETE /api/vehicles`, `GET /api/vehicles/available`
- `GET/POST/PUT/DELETE /api/drivers`, `GET /api/drivers/available`
- `GET/POST /api/trips`, `POST /api/trips/:id/dispatch|complete|cancel`
- `GET/POST /api/maintenance`, `POST /api/maintenance/:id/close`
- `GET/POST /api/fuel-logs`, `GET/POST /api/expenses`, `GET /api/operational-cost`
- `GET /api/dashboard/kpis`, `GET /api/dashboard/filters`
- `GET /api/reports/vehicle-performance|fleet-utilization|monthly-cost-trend`

## Notes / things you may want to extend

- PDF export, email reminders for expiring licenses, document management, and dark-mode toggle (the UI ships dark-only) were listed as bonus/optional items in the brief and are not included — CSV export is implemented everywhere as the required baseline.
- The frontend uses `localStorage` to persist the JWT between page reloads (this is a plain static file served by the backend, not a claude.ai artifact, so that's supported here).
