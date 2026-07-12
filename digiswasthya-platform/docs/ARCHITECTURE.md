# Architecture — Digital Swasthya Platform

Built as the **single implementation** of [`MERGED_REVIEWS.md`](./MERGED_REVIEWS.md).

## Stack

```
digiswasthya-platform/
└── app/                    npm workspaces
    ├── client/             React 19 · Vite · TanStack Query · Zustand · RR7
    ├── server/             Express 4 · Drizzle · PGlite · jose JWT · bcrypt · zod
    └── shared/             DTOs · enums · constants
```

## Tenancy model (from spec Module 1)

| Account kind | Auth | Data scope |
|--------------|------|------------|
| `tenant` (stockist/pharmacy) | `/api/auth/*` | `tenants` + `users`; strict tenant_id isolation |
| `platform` | `/api/platform/*` | cross-tenant read/approve |
| `consumer` | `/api/accounts/consumer/*` | B2C orders |
| `doctor` | `/api/accounts/doctor/*` | consultations |
| `mr` | `/api/accounts/mr/*` | visit log |

Cross-tenant B2B: `stockist_connections` + `cross_tenant_events` queue (SP pattern).

## Client routing

- `/` — public home, panel picker
- `/login`, `/register` — tenant staff (stockist/pharmacy)
- `/pharmacy/*` — pharmacy shell (teal)
- `/*` — stockist shell (blue) when authenticated as stockist tenant
- `/platform/*`, `/shop/*`, `/doctor/*`, `/mr/*` — extended panels

## Dev bootstrap

`SEED_DEMO_USERS=true` seeds all 6 panel demo accounts on server start (`server/src/services/devBootstrap.ts`).

## Spec traceability

When implementing a flow from the spec:

1. Find module in **Part I** of `MERGED_REVIEWS.md`
2. Read **Part II appendix** for the source app (ERP/HUB/…)
3. Implement in `app/server` + `app/client` using existing SP patterns
4. Update [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md)
