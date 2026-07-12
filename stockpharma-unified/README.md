# StockPharma Unified

**One localhost for everything.** This project merges all 8 sibling pharmaceutical platform repos into a single full-stack app. Original repos are preserved under `../` for reference — nothing was deleted.

## Quick start

```bash
cd stockpharma-unified
npm install          # installs app/ (client + server + shared)
npm run dev          # http://localhost:3000 + API :4000
```

Open **http://localhost:3000** — pick any panel. Demo logins are shown on the home page (seeded automatically in development).

## Demo accounts (all panels, one server)

| Panel | Email | Password | URL |
|-------|-------|----------|-----|
| Stockist | `stockist@demo.com` | `Demo1234` | `/login` |
| Pharmacy | `pharmacy@demo.com` | `Demo1234` | `/login?panel=pharmacy` |
| Platform Admin | `admin@demo.com` | `Demo1234` | `/platform/login` |
| Customer | `customer@demo.com` | `Demo1234` | `/shop/login` |
| Doctor | `doctor@demo.com` | `Demo1234` | `/doctor/login` |
| MR | `mr@demo.com` | `Demo1234` | `/mr/login` |

## What's merged (functional, not copy-paste)

| Sibling | Code | Merged into unified app as |
|---------|------|---------------------------|
| STOCKIST-PHARMACY | SP | **Core** — stockist + pharmacy ERP, ledger, cross-tenant B2B |
| stockpharmaerp | ERP | Stockist/pharmacy flows, public catalogue, bill QR |
| digi-swasthya-hub | HUB | Platform admin, B2C shop, doctor portal, delivery patterns |
| greetings-pal-git | MED | Smart Order (`/pharmacy/smart-order`) |
| stockistpayments | MR | MR panel (`/mr/*`) — visits, registration |
| digimvplaunch | MVP | UI/flow reference (prototype logic in spec) |
| digiswasthya | DSW | Patient/doctor UX reference |
| digiswasthyamvp | DMVP | B2B MVP patterns in spec |

See [`docs/MERGE_MAP.md`](docs/MERGE_MAP.md) for route-level mapping and backlog.

## Folder layout

```
stockpharma-unified/
├── README.md              ← you are here
├── package.json           ← npm run dev
├── app/                   ← merged full-stack (Express + React)
│   ├── client/            ← all 6 panels, one router
│   ├── server/            ← unified API + PGlite DB
│   └── shared/
├── docs/
│   ├── UNIFIED_FEATURES.md    ← every detail from all 8 apps (~645KB)
│   ├── MASTER_FLOW_INDEX.md   ← navigable flow index
│   ├── EXHAUSTIVE_REVIEW_PROMPT.md
│   └── MERGE_MAP.md           ← what runs where on localhost
└── sources/
    └── README.md          ← pointers to original sibling repos
```

## Single spec file (every detail preserved)

**[`docs/UNIFIED_FEATURES.md`](docs/UNIFIED_FEATURES.md)** — Part I (19 modules, coverage matrix) + Part II (Appendices A–H, verbatim per-repo reviews). Use this when porting remaining sibling features.

## Original sibling repos (unchanged)

Still at `../stockpharmaerp`, `../digi-swasthya-hub`, etc. — see [`sources/README.md`](sources/README.md).

## Environment

Copy `app/.env.example` → `app/.env`. Required: `JWT_SECRET` (≥32 chars). Demo seed: `SEED_DEMO_USERS=true` (default in dev).

## What still runs on separate Supabase (reference only)

ERP, HUB, MED, MR, DMVP use hosted Supabase when run standalone (`npm run dev` inside each sibling folder). The **unified app** uses local PGlite — no Supabase required for daily work.
