# Unified Platform Consolidation — STOCKIST-PHARMACY

> **Goal:** Use `STOCKIST-PHARMACY` as the **single replacement** for all 8 sibling repos (ERP, HUB, MED, MR, MVP, DSW, DMVP, SP).

This document maps sibling-repo capabilities to this monorepo and tracks what is **wired** vs **planned**.

---

## Architecture

| Layer | Path | Role |
|-------|------|------|
| Client | `client/` | React 19 + Vite — 6 panels (stockist, pharmacy, platform, consumer, doctor, mr) |
| Server | `server/` | Express + Drizzle + PGlite — real full-stack |
| Shared | `shared/` | DTOs and constants |
| Spec | `../UNIFIED_FEATURES.md` | Union of all 8 repos |
| Index | `../MASTER_FLOW_INDEX.md` | Every flow/page/screen |

**Entry point:** `/` — role/panel picker → sign in to the right panel.

---

## Panel Map (replaces sibling apps)

| Panel | Route prefix | Replaces | Status |
|-------|--------------|----------|--------|
| **Stockist** | `/dashboard`, `/orders`, … | ERP stockist, HUB stockist, MR seller, MVP stockist | ✅ Full ERP (existing) |
| **Pharmacy** | `/pharmacy/*` | HUB pharmacy, MED pharmacy, ERP pharmacy | ✅ Full ERP + Smart Order |
| **Platform Admin** | `/platform/*` | HUB admin, ERP admin, DMVP admin | ✅ Core (tenants, approvals, stats) |
| **Customer / Shop** | `/shop/*` | HUB customer, DSW patient, ERP patient | ✅ B2C orders + doctors browse |
| **Doctor** | `/doctor/*` | HUB doctor, DSW doctor | ✅ Consultations (core) |
| **MR** | `/mr/*` | MR app, ERP mr | ✅ Visits (core) |

---

## Features Added in This Consolidation

### From MED (MedOrder)
- **Smart Order engine** — `POST /api/smart-order/parse` + `/recommend`
- Pharmacy UI: `/pharmacy/smart-order` — Best Single / Cheapest Split / Fastest Delivery

### From HUB
- **Platform admin** — tenant list, approval status, dashboard KPIs
- **Customer B2C** — browse pharmacies, cart, place online order (COD)
- **Doctor portal** — register, consultations, consumer booking
- **Bill QR verification** — `/verify-bill/:id` + QR on stockist invoices

### From MR (PharmaMR)
- **MR panel** — registration, pharmacy visit logging

### From additions.md gaps
- **Copy order** — stockist `OrderDetailPage` → `CreateOrderPage?duplicateFrom=`
- **Bill verify UI** — public page wired to existing `GET /api/public/verify-bill/:id`

### Schema extensions
- `platform_users`, `consumer_accounts`, `doctor_accounts`, `mr_accounts`
- `online_orders`, `consultations`, `smart_order_sessions`
- Tenant fields: `approval_status`, `business_type`, `pan_number`, `documents_json`, bank, etc.

---

## Environment Setup

```bash
# .env (repo root)
JWT_SECRET=your-secret-at-least-32-characters-long!!
PLATFORM_ADMIN_EMAIL=admin@digitalswasthya.com
PLATFORM_ADMIN_PASSWORD=ChangeMe123!
GEMINI_API_KEY=...          # Smart Order AI parse + bill OCR
FEATURE_AI_PARSE=true
FEATURE_WHATSAPP=true       # optional
```

```bash
npm install
npm run dev                 # client :3000 + server :4000
```

---

## What Remains (incremental)

These sibling features are **specified** in `UNIFIED_FEATURES.md` but not yet fully ported:

| Feature | Source repos | Priority |
|---------|--------------|----------|
| Multi-step registration wizards + document upload | HUB, ERP, additions.md | High |
| Delivery staff credential system | HUB | Medium |
| Brand portal | ERP | Low |
| Public catalogue (license verify) full UI | ERP | Medium |
| OTC partnership, subscriptions | MR | Low |
| Full HUB B2C pipeline (Rx verify, commissions) | HUB | High |
| Offline/PWA sync | ERP, MED | Medium |
| Double-entry extensions for B2C | SP | Medium |

Use `EXHAUSTIVE_REVIEW_PROMPT.md` + `UNIFIED_FEATURES.md` as the backlog for each port.

---

## API Surface (new routes)

| Prefix | Purpose |
|--------|---------|
| `POST /api/platform/login` | Platform admin auth |
| `GET /api/platform/tenants` | Cross-tenant listing |
| `PATCH /api/platform/tenants/:id/approval` | Approve/reject tenant |
| `POST /api/smart-order/parse` | Pharmacy paste → parsed items |
| `POST /api/smart-order/recommend` | 3-strategy recommendations |
| `POST /api/accounts/consumer/*` | Customer auth + B2C orders |
| `POST /api/accounts/doctor/*` | Doctor auth + consultations |
| `POST /api/accounts/mr/*` | MR auth + visits |
| `GET /api/public/verify-bill/:id` | Bill verification (existing) |

---

## Migration from Sibling Repos

1. **Stop running** separate ERP/HUB/MED/MR/MVP/DSW/DMVP apps.
2. **Use this monorepo** for all new development.
3. **Data migration:** export Supabase tenants → import via stockist/pharmacy registration + connection APIs (scripts TBD).
4. **Reference spec:** `../UNIFIED_FEATURES.md` for any behavior not yet ported — implement against SP patterns (Drizzle schema, Express services, React panels).

---

*Consolidation pass — extends STOCKIST-PHARMACY to subsume the 8-repo union at the architectural level; continue porting per `UNIFIED_FEATURES.md` Module × coverage matrix.*
