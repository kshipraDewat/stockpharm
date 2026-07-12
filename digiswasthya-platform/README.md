# Digital Swasthya Platform

**New unified project** built from [`docs/MERGED_REVIEWS.md`](docs/MERGED_REVIEWS.md) — the merged specification of all 8 sibling pharma apps (ERP, HUB, MED, MR, MVP, DSW, DMVP, SP).

One localhost runs every merged panel. Original repos are preserved as reference only.

## Quick start

```bash
cd digiswasthya-platform
npm install
npm run dev
```

- **UI:** http://localhost:3000  
- **API:** http://localhost:4000  

Home page shows all panels with demo logins (auto-seeded in development).

## Demo accounts

| Panel | Email | Password |
|-------|-------|----------|
| Stockist | stockist@demo.com | Demo1234 |
| Pharmacy | pharmacy@demo.com | Demo1234 |
| Platform | admin@demo.com | Demo1234 |
| Customer | customer@demo.com | Demo1234 |
| Doctor | doctor@demo.com | Demo1234 |
| MR | mr@demo.com | Demo1234 |

## Documentation

| File | Purpose |
|------|---------|
| [`docs/MERGED_REVIEWS.md`](docs/MERGED_REVIEWS.md) | **Master spec** — Part I unified map + Part II all 8 app reviews |
| [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md) | What's done vs backlog (19 modules) |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Stack, tenancy, routing |
| [`sources/README.md`](sources/README.md) | Links to original 8 sibling repos |

## Project layout

```
digiswasthya-platform/
├── app/                 # Full-stack monorepo (client + server + shared)
├── docs/                # Spec + implementation tracking
├── sources/             # Pointer to sibling reference repos
├── package.json
└── README.md
```

## Built from spec (not copy-paste)

Implementation follows **Part I** of MERGED_REVIEWS (de-duplicated union) and ports behavior from **Part II** appendices:

- **Stockist + Pharmacy ERP** — core from SP appendix H
- **Platform admin, B2C shop, doctor, MR** — from HUB/MR appendices
- **Smart Order** — from MED appendix C
- **3-step registration wizard** — HUB-style (Module 2); document upload still backlog

Track progress in `IMPLEMENTATION_STATUS.md` as you port remaining modules (brand portal, delivery staff, Rx pipeline, etc.).

## Environment

Copy `app/.env.example` → `app/.env`. Required: `JWT_SECRET` (≥32 characters).
