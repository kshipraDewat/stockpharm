# EXHAUSTIVE REVIEW PROMPT — 8 Pharma Platform Repositories

> **Copy this entire prompt** into a new agent session to review all 8 sibling repositories, define every flow/feature without omission, and merge into a single specification file.

---

## Mission

You are reviewing **8 sibling repositories** that are variants of the same multi-role pharmaceutical distribution + healthcare platform (Digi Swasthya / Stockist–Pharmacy ERP). Your job is to read **actual source code** — not READMEs alone — and produce:

1. **Eight separate exhaustive reviews** (one per repo), each saved to `_reviews/review-<repo>.md`
2. **One merged master specification** saved to `UNIFIED_FEATURES.md` at repo root

**Completeness is mandatory.** Do not summarize away specifics. Every flow, sub-flow, page, screen, modal, field, calculation, status transition, edge case, and stub must be captured.

---

## The 8 Repositories

| # | Short code | Folder | In-product name |
|---|------------|--------|-----------------|
| 1 | **ERP** | `stockpharmaerp` | Digi Swasthya Store |
| 2 | **HUB** | `digi-swasthya-hub` | Digi Swasthya Hub |
| 3 | **MED** | `greetings-pal-git` | MedOrder / MediConnect |
| 4 | **MR** | `stockistpayments` | PharmaMR / Chameleon |
| 5 | **MVP** | `digimvplaunch` | Digi Swasthya (prototype) |
| 6 | **DSW** | `digiswasthya` | Digi Swasthya (Lexend UI) |
| 7 | **DMVP** | `digiswasthyamvp` | Digi Swasthya B2B MVP |
| 8 | **SP** | `STOCKIST-PHARMACY` | Stockist ↔ Pharmacy ERP |

**Exclude** `digiswasthya-unified` unless explicitly asked — it is a derived scaffold, not a source.

**Scratch directory:** `_reviews/`  
**Final merged file:** `UNIFIED_FEATURES.md` (repo root)

---

## Phase 1 — Review EACH Repository (repeat 8 times, one repo at a time)

For **each** repository, read the actual source:

- Router/entry (`src/App.tsx`, `client/src/routes/index.tsx`, or equivalent)
- Every page component under `pages/` or `components/*Page.tsx`
- Every dialog/modal/sheet/drawer component
- Hooks, contexts, stores (Zustand, React Query, Auth)
- Backend: Supabase edge functions, Express routes/services, Drizzle schema
- Types, constants, validation schemas (Zod)
- Config: `vite.config`, PWA, env

**Do NOT rely on existing `README.md` / `FEATURES.md` except as a starting map.** Verify every claim against code.

### Per-Repo Output Template

Write to `_reviews/review-<folder-name>.md` using this structure:

```markdown
# [App Name] — Exhaustive Functional Review

> Short code: **[CODE]**
> Stack: [one-liner]
> Backend: [Supabase / mock / client-only / Express+PGlite]

---

## 0. GLOBAL ARCHITECTURE

### 0.1 Router — complete route table
(path → guard → component → notes on orphaned/unrouted)

### 0.2 Contexts / Stores / Providers
(name, state shape, persistence keys, side effects)

### 0.3 Route Guards & Auth Posture
(who can access what; redirect rules; onboarding gates)

### 0.4 Layouts & Navigation
(exact top nav items, bottom nav tabs, sidebar items, search behavior)

### 0.5 Infrastructure
(PWA, offline sync, realtime channels, storage buckets, session timeout)

---

## 1. AUTH & ONBOARDING

For EACH screen in this module, document:

### 1.X [Screen Name] (`/route`) — `FileName.tsx`

#### Screen Content (unique elements)
- Page title, subtitle, branding
- Sections, cards, tabs, banners, empty states
- Tables: column headers, sort, filter, pagination
- KPI cards: label, formula/query, hardcoded vs computed, click behavior
- Charts: type, data source, axes
- Badges, status chips, progress bars

#### User Journey (step-by-step)
1. Entry point (how user arrives)
2. Each interaction in order
3. Success path (redirects, toasts, data written)
4. Failure paths (validation errors, API errors, edge cases)

#### Actions & Interactions
| Element | Type | Behavior | Side effects |
|---------|------|----------|--------------|
| [Button name] | button | [exact action] | [DB/API/localStorage] |

#### Forms / Modals / Sheets / Drawers
For EACH overlay:

**[ComponentName]** (trigger: [what opens it])

| Field | Type | Required | Validation | Default | Notes |
|-------|------|----------|------------|---------|-------|
| fieldName | text/select/date/... | yes/no | min/max/pattern | value | |

- Submit behavior: [endpoint/RPC/local action]
- Cancel/close behavior
- Loading/error states

#### Business Logic & Calculations
- Formulas (GST, credit, FIFO/FEFO, commissions, margins)
- Status machines (allowed transitions, who can trigger)
- Numbering schemes (ORD-, GRN-, CN-, etc.)
- Credit checks, stock deduction timing

#### Edge Cases & Error Paths
- Empty states, zero-data, permission denied
- Race conditions, optimistic updates, rollback
- Rate limits, timeouts, offline behavior
- Known bugs, stubs, hardcoded values, dead code

#### Backend / API / AI
- Endpoint or RPC name
- Request/response shape
- Auth requirements
- Edge function model (if AI)

---

## 2. [ROLE/MODULE NAME] — e.g. STOCKIST

(Repeat section 1.X structure for EVERY page in this role)

### 2.1 Dashboard
### 2.2 Products / Inventory
### 2.3 Orders
... (all pages)

---

## 3. [NEXT ROLE/MODULE]
...

## N. CROSS-CUTTING

### N.1 Status vocabularies
### N.2 Shared dialogs/components
### N.3 Orphaned/dead code inventory
### N.4 Stubs & placeholders
### N.5 Data model summary (tables used)
```

---

## What to Capture for EVERY Screen (checklist)

Use this checklist for **each** page, modal, sheet, and drawer:

### Identity
- [ ] Route path(s) and URL params
- [ ] Component file path
- [ ] Role(s) / tenant type(s) that can access
- [ ] Guard requirements (auth, onboarding, approval, staff role)

### Content (where unique to this screen)
- [ ] Page title and header
- [ ] All sections, cards, widgets, tabs
- [ ] Table columns (exact headers, sortable?, filterable?)
- [ ] KPI cards (label + exact formula or hardcoded value)
- [ ] Charts (type, series, date range)
- [ ] Filters (options, default, applied to query?)
- [ ] Search (fields searched, debounce, limits)
- [ ] Empty states and loading skeletons
- [ ] Badges, status colors, priority indicators

### Flows & Sub-flows
- [ ] Primary user journey (numbered steps, start → finish)
- [ ] Alternate paths (e.g. credit limit exceeded → warning dialog → override?)
- [ ] Sub-flows triggered from this screen (e.g. "Quick Bill" from dashboard)
- [ ] Cross-role handoffs (e.g. pharmacy places order → stockist receives)

### Actions & Interactions
- [ ] Every button, link, menu item, toggle, drag-drop, inline edit
- [ ] What each does (navigate, open modal, API call, toast-only stub)
- [ ] Optimistic vs pessimistic updates
- [ ] Realtime subscriptions (channel name, event, refetch)

### Forms & Overlays
- [ ] Every input field: name, type, label, placeholder
- [ ] Required vs optional
- [ ] Validation rules (min, max, pattern, custom Zod)
- [ ] Default values and prefills
- [ ] File upload: bucket, size limit, accepted types
- [ ] Multi-step wizard: step names, fields per step, skip behavior
- [ ] Submit: endpoint, payload shape, success/error handling

### Logic & State Machines
- [ ] Order/payment/delivery status vocabulary for this app
- [ ] Allowed status transitions and who triggers them
- [ ] Stock deduction timing (create vs pack vs deliver)
- [ ] Credit-first FIFO settlement rules
- [ ] GST calculation (CGST/SGST vs IGST, rates)
- [ ] FEFO/FIFO batch selection
- [ ] Commission calculation (if applicable)
- [ ] Bill/invoice numbering

### Edge Cases & Use Cases
- [ ] Validation failures (field-level messages)
- [ ] API errors (status codes, user-facing messages)
- [ ] Permission denied / role mismatch
- [ ] Empty circle / no products / no orders
- [ ] Credit limit exceeded
- [ ] Out of stock / over-order warning
- [ ] Expired batch / narcotic schedule restrictions
- [ ] Offline / PWA queued writes
- [ ] Session timeout behavior

### Backend
- [ ] Supabase table(s) read/written
- [ ] RPC functions called
- [ ] Edge functions (name, inputs, AI model)
- [ ] Express routes (SP only): method, path, service, error codes

---

## Repo-Specific Deep-Dive Notes

### ERP (`stockpharmaerp`)
- 6 roles: stockist, pharmacy, patient, brand, mr, admin
- Public catalogue at `/catalogue/:stockist_slug/*` (license verification)
- Session timeout 30 min; pharmacy catalogue session 20 min
- Read `APPLICATION_OVERVIEW.md` as map only; verify in code
- 20 `*Dialog.tsx` components in `src/components/`

### HUB (`digi-swasthya-hub`)
- Richest app: 5 roles + delivery staff credential system
- 120+ routes; approval gating for stockist/pharmacy/doctor
- Architecture Flowboard at `/admin/system-architecture` (8 sections)
- Read `docs/user-flows-*.md` and `docs/Application-blueprint.md` as maps
- Double stock-deduct bug on order pack (document if still present)
- `supabase/functions/` — document every edge function

### MED (`greetings-pal-git`)
- **Flagship: Smart Order engine** — 3 strategies (Best Single / Cheapest Split / Fastest Delivery)
- `smart-order-parse` + `smart-order-recommend` edge functions
- Bulk upload with OCR (`extract-bill-items`, `bulk-upload-commit`)
- Dormant delivery-fee rule engine (`useDeliveryFee`)
- Admin role in enum but zero routes (dormant)

### MR (`stockistpayments`)
- 5 seller roles: mr, stockist, distributor, pharmacy, admin
- OTC partnership program, subscriptions, bill-lifecycle auto-aging
- Seller-locked cart, admin data-wipe capability
- Admin password gate: `jit@ADMIN1`
- Money calculation bugs in PharmacyDetail (document exact formulas)

### MVP (`digimvplaunch`)
- **Pure front-end prototype** — no backend
- localStorage keys: `digi-swasthya-auth`, `digi-swasthya-state`
- Registration wizards do NOT persist data (critical stub)
- Document every toast-only action vs real localStorage write
- `/admin/user-flow` page documents idealized flows

### DSW (`digiswasthya`)
- **Front-end-only prototype** — no guards, all roles URL-reachable
- Richest dialog library (40+ in `components/*/dialogs/`)
- B2C sale mode at `/pharmacy/sale/*`
- Document every orphaned dialog (built but unwired)
- Only real persistence: `stockist_tour_completed` localStorage flag

### DMVP (`digiswasthyamvp`)
- **Mock Supabase client** — all writes no-op
- Hardcoded identities (stockist=sp-001, pharmacy=pp-001)
- Edge functions defined but return null
- Document mock behavior vs intended real behavior for each RPC
- Mirrors HUB docs in `docs/` folder

### SP (`STOCKIST-PHARMACY`)
- **Real full-stack monorepo**: `client/` + `server/` + `shared/`
- Two tenant types: stockist, pharmacy (never cross-read)
- Staff roles: admin, biller, pharmacist, cashier
- Double-entry ledger, GST CGST/SGST/IGST, FEFO stock
- Cross-tenant event bus (`POST /events/process` polled every 10s)
- Read **server services** for exact business rules and error codes
- 27 `*Modal.tsx` + `SlideOver` + `ConfirmDialog`
- `additions.md` lists known gaps

---

## Phase 2 — Merge 8 Reviews into `UNIFIED_FEATURES.md`

After all 8 per-repo files exist, merge into one file:

### Structure

```markdown
# Digi Swasthya — Unified Feature Specification (FULL UNION)

## How this document is organized
- Part I — Unified Feature Map (de-duplicated superset)
- Part II — Complete Per-App Reviews (Appendices A–H, verbatim)

---

# PART I — UNIFIED FEATURE MAP

## App roster (table)
## Module × app coverage matrix

## Module 1 — Platform Overview & Roles
## Module 2 — Authentication / Sessions / Onboarding
## Module 3 — Stockist (seller)
## Module 4 — Pharmacy: B2B purchase
## Module 5 — Pharmacy: B2C sale
## Module 6 — Pharmacy: Public Catalogue
## Module 7 — Seller variants (MR / Distributor)
## Module 8 — Patient / Customer
## Module 9 — Doctor
## Module 10 — Brand
## Module 11 — Delivery Staff
## Module 12 — Admin
## Module 13 — AI & Edge / Backend Functions
## Module 14 — Smart Order engine
## Module 15 — Payments / Credit / Money logic
## Module 16 — Delivery config & fee engine
## Module 17 — Realtime / Offline / PWA / Infra
## Module 18 — Data model
## Module 19 — Cross-cutting conventions

---

# PART II — COMPLETE PER-APP REVIEWS

## Appendix A — stockpharmaerp (ERP)
[verbatim from _reviews/review-stockpharmaerp.md]

## Appendix B — digi-swasthya-hub (HUB)
...

## Appendix H — STOCKIST-PHARMACY (SP)
...
```

### Merge Rules (CRITICAL)

1. **UNION, not trim** — never remove a flow/page/field that exists in any repo
2. **Tag every item** with source short-codes: `ERP HUB MED MR MVP DSW DMVP SP`
3. **Identical across repos** → state once with multi-repo tag
4. **Different across repos** → describe superset, then bullet deltas:
   - `partial` — missing steps/fields vs superset
   - `extra` — additional beyond superset
   - `variant` — different logic/UI/content
5. **Preserve verbatim**: field names, formulas, status vocabularies, error codes, RPC names, hardcoded values, stubs
6. **Appendices A–H** must contain full per-repo reviews verbatim — nothing lost

---

## Phase 3 (Optional) — Build Unified Project

Only if explicitly asked. Use `UNIFIED_FEATURES.md` as source of truth to scaffold `digiswasthya-unified`.

---

## Working Rules

1. **Read code yourself** — verify every claim against source
2. **Review repos in parallel** where possible; write each review to disk before merging
3. **Write large files in chunks** (Write first part, then StrReplace/append) to avoid truncation
4. **Back up** existing `UNIFIED_FEATURES.md` before overwriting
5. **Prefer accuracy and completeness over brevity** — exclude nothing
6. **Document stubs explicitly** — toast-only, dead code, hardcoded values, unwired components
7. **Currency** is `₹` throughout unless app-specific exception
8. **Do not invent features** — only document what exists in code

---

## Deliverables Checklist

- [ ] `_reviews/review-stockpharmaerp.md`
- [ ] `_reviews/review-digi-swasthya-hub.md`
- [ ] `_reviews/review-greetings-pal-git.md`
- [ ] `_reviews/review-stockistpayments.md`
- [ ] `_reviews/review-digimvplaunch.md`
- [ ] `_reviews/review-digiswasthya.md`
- [ ] `_reviews/review-digiswasthyamvp.md`
- [ ] `_reviews/review-STOCKIST-PHARMACY.md`
- [ ] `UNIFIED_FEATURES.md` — Part I (19 modules) + Part II (Appendices A–H)
- [ ] `MASTER_FLOW_INDEX.md` — navigable index of every flow, page, screen, modal

---

## Quick Reference — 19 Unified Modules

| # | Module | Primary roles |
|---|--------|---------------|
| 1 | Platform Overview & Roles | All |
| 2 | Auth / Sessions / Onboarding | All |
| 3 | Stockist (seller) | stockist, MR-seller |
| 4 | Pharmacy — B2B purchase | pharmacy |
| 5 | Pharmacy — B2C sale | pharmacy, customer |
| 6 | Pharmacy — Public Catalogue | unauthenticated |
| 7 | Seller variants (MR/Distributor) | mr, distributor |
| 8 | Patient / Customer | patient, customer |
| 9 | Doctor | doctor |
| 10 | Brand | brand |
| 11 | Delivery Staff | delivery staff |
| 12 | Admin | admin |
| 13 | AI & Edge/Backend Functions | backend |
| 14 | Smart Order engine | pharmacy |
| 15 | Payments / Credit / Money | all B2B |
| 16 | Delivery config & fee engine | stockist, pharmacy |
| 17 | Realtime/Offline/PWA/Infra | infra |
| 18 | Data model | schema |
| 19 | Cross-cutting conventions | UI/UX |

---

## Quick Reference — HUB Flowboard 8 Sections

Use as secondary taxonomy when reviewing HUB (and cross-mapping other repos):

1. **Entry & Auth** — login, registration, password reset, staff login, role routing
2. **Stockist Operations** — dashboard, products, circle, orders, payments, delivery, reports
3. **Pharmacy Operations** — B2B purchase + B2C sale modes, inventory, doctors, commissions
4. **Doctor Operations** — consultations, prescriptions, partnerships, earnings
5. **Customer Operations** — cart, prescriptions, consultations, reminders, wishlist
6. **B2B Order Pipeline** — create → pack → dispatch → deliver → bill → returns
7. **B2C Order Pipeline** — place → Rx verify → pay → prepare → deliver → commission
8. **Admin Platform** — approvals, analytics, counterfeit, governance, flowboard

---

*End of prompt. Begin with repo #1 (ERP) or run all 8 in parallel, then merge.*
