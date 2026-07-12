 # PROJECT FLOW REQUIREMENTS — Complete Platform Specification

> **Audience:** Stakeholders, product owners, and developers — one canonical description of platform flow requirements across 8 pharmaceutical apps.
>
> **App tags:** ERP · HUB · MED · MR · MVP · DSW · DMVP · SP  
> **Maturity:** `full` · `partial` · `stub` · `mock`
>
> **Sources merged:** `reviews/review-*.md` (8 files, ~16k lines) · `UNIFIED_FEATURES.md` Part I · `MASTER_FLOW_INDEX.md` · targeted deep sections from SP/HUB/MED/MR reviews.

---

## Document purpose & how to read

| Question | Read |
|----------|------|
| What should the platform do? | **§4 Canonical flows** + §4A Unified module spec (full Part I) |
| What states can entities be in? | §5 State machines |
| How is money/tax/stock calculated? | §6 Business rules + §6A SP/HUB money deep-dive |
| What tables/fields exist? | §7 Data model + §7A SP entity reference |
| What screens exist? | §8 Routes index |
| What APIs exist? | §9 API surface |
| What actually works today? | §10 Reality matrix |
| What's unique to one app? | §11 Per-app deltas |

**Excluded:** Verbatim duplicate appendices from all 8 review files (~16k lines). Those remain in `reviews/` and `MERGED_REVIEWS.md` Part II.

**Deduplication rule:** Identical flows stated once with multi-app tags. Most complete version wins; unique details from other apps are merged in.

---


## 1. Domain & Vision

**Domain:** B2B pharmaceutical distribution between **Stockist** (wholesaler) and **Pharmacy** (retailer), extended with patient B2C, doctor consultations, MR field sales, brand portals, delivery staff, and platform admin. Currency: **₹**.

**Vision:** End-to-end traceable commerce — catalogue → order → FEFO stock → GST bill → credit/FIFO payment → ledger — with AI-assisted ordering and cross-tenant sync (SP).

---

## 2. Application Roster (8 repos, stack, maturity)

See Module 1 app roster table in §4A below. Summary:

| Code | Backend | Maturity |
|------|---------|----------|
| ERP, HUB, MED, MR | Supabase + edge functions | full–partial |
| SP | Express + PGlite + Drizzle | **full** (reference) |
| MVP, DSW | None (localStorage/mock) | stub |
| DMVP | Mock Supabase (no-op writes) | mock |

---

## 3. Roles & Authentication (unified superset)

See **Module 2** in §4A for complete login/register/session/onboarding specifications per app.

**Role superset:** stockist · pharmacy · admin · patient/customer · doctor · brand · mr · distributor · delivery_staff · platform super_admin · SP staff (admin/biller/pharmacist/cashier).

---

## 4. Canonical End-to-End Flows

> Step-by-step pipeline index (from `MASTER_FLOW_INDEX.md` Part A). Detailed field-level requirements for each stage are in §4A Modules 3–14.

### 4.0 Flow pipeline index


### 4.0.1 Authentication & onboarding pipelines


## A.1 Authentication & Onboarding Flows

| Flow ID | Flow Name | Steps | Apps |
|---------|-----------|-------|------|
| AUTH-01 | Email/password login + role select | Select role → enter credentials → verify role → approval gate (if applicable) → redirect to dashboard | ERP, HUB, MED, MR, MVP, DSW, DMVP, SP |
| AUTH-02 | Self-registration (multi-step) | Role picker → multi-step form → document upload → signUp → profile insert → pending approval or auto-active | HUB (4 roles), MR, MVP (stub), DSW, SP (single form) |
| AUTH-03 | Self-registration (tab on login) | Login page Sign-Up tab → role grid → credentials → onboarding | ERP |
| AUTH-04 | Forgot password | Enter email → reset email → click link → set new password | ERP, HUB, MED, MR, SP |
| AUTH-05 | OTP login | Phone/email OTP via `signInWithOtp` | MR |
| AUTH-06 | Admin hidden reveal | 5-tap logo → admin role option | HUB, MVP |
| AUTH-07 | Demo/prototype login | Role selector → ignore inputs → navigate to dashboard | MVP, DSW, DMVP |
| AUTH-08 | Staff login (delivery) | Username + password → RPC verify (stockist then pharmacy) → staff session | HUB |
| AUTH-09 | Onboarding wizard (post-signup) | Carousel or SlideOver steps → min-setup gates → mark complete | ERP, HUB, MR, SP, MVP, DSW |
| AUTH-10 | Pending approval wait | Poll/check approval_status → redirect when approved | HUB |
| AUTH-11 | Session timeout | Inactivity timer → warning dialog → refresh or signOut | ERP (30m), HUB (30m), SP (JWT iat check), ERP catalogue (20m) |
| AUTH-12 | Public catalogue license verify | Enter drug license + PIN → verify RPC → session → catalogue | ERP, SP (partial) |

## A.2 B2B Order Pipeline (Stockist ↔ Pharmacy)

| Flow ID | Stage | Actions | Status vocabulary (varies) |
|---------|-------|---------|---------------------------|
| B2B-01 | Create order (stockist-side) | Select pharmacy → add items (manual/paste/AI) → credit check → submit | pending/confirmed/draft |
| B2B-02 | Create order (pharmacy-side) | Browse catalogue → cart → checkout → credit check → submit | pending/placed |
| B2B-03 | Approve / Confirm | Stockist confirms or pharmacy order accepted | confirmed/accepted |
| B2B-04 | Pack | Deduct stock (FEFO/FIFO) → mark packed | packed |
| B2B-05 | Dispatch / Ship | Assign delivery staff → carrier/AWB → mark shipped/dispatched | dispatched/shipped/out_for_delivery |
| B2B-06 | Deliver | Mark delivered → auto-populate pharmacy inventory (HUB) | delivered |
| B2B-07 | Bill generation | Generate GST bill → QR (where implemented) → PDF | draft/final |
| B2B-08 | Payment collection | Record payment → credit-first FIFO → update outstanding | paid/partial/unpaid |
| B2B-09 | Returns | Initiate return → approve/reject → credit note → restore stock | pending/approved/rejected |
| B2B-10 | Split order | Split into child order `-S` suffix | HUB, DMVP |
| B2B-11 | Partial delivery | Record partial quantities delivered | HUB, DMVP |
| B2B-12 | Quick order (WhatsApp paste) | Paste text → AI/regex parse → match products → review → confirm | All apps (variant) |
| B2B-13 | Smart order (multi-stockist) | Parse → recommend Best Single / Cheapest Split / Fastest Delivery → add to cart | MED (deepest), others partial |

## A.3 B2C Order Pipeline (Pharmacy ↔ Customer)

| Flow ID | Stage | Actions | Apps |
|---------|-------|---------|------|
| B2C-01 | Browse & search | Search pharmacies/products → view catalogue | HUB, DSW |
| B2C-02 | Add to cart | Select qty → prescription flag if Rx → cart persist | HUB, DSW |
| B2C-03 | Checkout | Address → payment mode (UPI/COD) → place order | HUB, DSW |
| B2C-04 | Prescription upload | Upload Rx image → attach to order | HUB, DSW |
| B2C-05 | Rx verification (pharmacy) | Pharmacy reviews Rx → approve/reject | HUB |
| B2C-06 | Prepare & price | Add pricing → prepare order | HUB |
| B2C-07 | Deliver | Assign staff → mark delivered → deduct inventory | HUB |
| B2C-08 | B2C bill | Generate customer bill | HUB |
| B2C-09 | Doctor commission | Calculate & record commission on B2C sale | HUB |
| B2C-10 | Customer return | Customer initiates → pharmacy processes | HUB |
| B2C-11 | POS retail sale | Scan/search → add items → payment → receipt | SP |

## A.4 Payment & Credit Flows

| Flow ID | Flow Name | Logic | Apps |
|---------|-----------|-------|------|
| PAY-01 | Credit limit check | `exposure + orderTotal ≤ creditLimit` | HUB, SP, ERP, MR |
| PAY-02 | Credit-first FIFO settlement | Apply payment to oldest bills first; credit balance before outstanding | ERP, HUB, MVP, SP |
| PAY-03 | Payment approval chain | Pharmacy submits proof → stockist approve/reject/hold | ERP, HUB |
| PAY-04 | UPI link generation | Generate UPI deep link + QR → WhatsApp share | ERP, HUB, MR |
| PAY-05 | Delivery staff collection | Staff collects → pending approval → stockist approves | HUB |
| PAY-06 | Double-entry ledger posting | Sales Dr / GST Dr / Sundry Debtors Cr | SP |
| PAY-07 | Supplier payment | Record payment against purchase bills | SP, MR |
| PAY-08 | Payable bills (pharmacy) | View stockist bills → record payment | SP |

## A.5 Inventory & Product Flows

| Flow ID | Flow Name | Apps |
|---------|-----------|------|
| INV-01 | Add product (manual form) | All |
| INV-02 | Edit product + price change notification | HUB, ERP, SP, MR |
| INV-03 | Bulk upload (catalogue CSV/XLSX) | All |
| INV-04 | Purchase bill OCR upload | ERP, HUB, MED, MR, SP |
| INV-05 | Batch management (FIFO/FEFO) | HUB, ERP, SP, MVP |
| INV-06 | Stock adjustment | SP, ERP |
| INV-07 | Expiry management / dispose | HUB, ERP, SP |
| INV-08 | Stock transfer between batches | HUB, ERP |
| INV-09 | Bulk price update (% or flat) | HUB, ERP, SP, MED |
| INV-10 | AI product autofill | ERP, HUB, MED, MR, SP |
| INV-11 | OCR product label scan | ERP, MR, DSW (stub) |
| INV-12 | GRN receive (pharmacy) | SP |
| INV-13 | Auto-populate pharmacy inventory on delivery | HUB |
| INV-14 | Required stock / reorder alerts | SP, MED, HUB |

## A.6 Consultation & Prescription Flows

| Flow ID | Flow Name | Apps |
|---------|-----------|------|
| RX-01 | Book consultation (customer) | HUB, DSW |
| RX-02 | Doctor availability scheduling | HUB, DSW |
| RX-03 | Conduct consultation (audio/video/clinic) | HUB, DSW |
| RX-04 | Write prescription | HUB, DSW |
| RX-05 | Prescription templates | HUB |
| RX-06 | Upload prescription → order medicines | HUB, DSW |
| RX-07 | Doctor-pharmacy partnership + commission rules | HUB |

---


### 4.0.2 User journey maps


— USER JOURNEY MAPS

## Journey 1: New Stockist Onboarding → First Sale
```
Register (HUB 5-step / SP single form / ERP signup tab)
  → Pending approval (HUB) or immediate access
  → Onboarding wizard (add pharmacy, import products, add staff)
  → Dashboard
  → Add products (manual / bulk / OCR)
  → Add pharmacy to circle (manual / find / portal connection)
  → Create order (manual / quick order / WhatsApp paste)
  → Pack → Dispatch → Deliver
  → Generate bill → Record payment
```

## Journey 2: Pharmacy Restocks from Stockist
```
Login → Dashboard
  → Browse stockists / view connected stockist catalogue
  → Add to cart (or Smart Order paste → 3 recommendations)
  → Checkout (credit check)
  → Order placed (pending)
  → Track order status
  → Receive delivery → GRN (SP) or auto-inventory (HUB)
  → View ledger / pay bill
```

## Journey 3: Customer Orders Medicines (B2C)
```
Register as customer (HUB 3-step, auto-approved)
  → Search/browse pharmacy
  → Add to cart (Rx items flagged)
  → Upload prescription if needed
  → Checkout (address, UPI/COD)
  → Pharmacy receives order
  → Pharmacy verifies Rx → prices → prepares
  → Delivery → customer tracks
  → Review / return if needed
```

## Journey 4: Doctor Consultation → Prescription → Order
```
Doctor registers (5-step) → pending approval
  → Set availability & fees
  → Customer books consultation
  → Doctor conducts (audio/video/clinic)
  → Write prescription
  → Customer orders medicines from partnered pharmacy
  → Pharmacy fulfills → doctor earns commission
```

## Journey 5: MR Field Sales
```
MR registers with brand + documents
  → Visit pharmacy (record visit)
  → Create bill with credit terms
  → Send payment link (UPI)
  → Track collections
  → Manage own product catalogue (brand-locked)
```

## Journey 6: Admin Governance
```
Admin login (hidden reveal or dedicated page)
  → Review pending registrations (bulk approve/reject)
  → Monitor orders (B2B + B2C)
  → Handle returns/refunds
  → Counterfeit alerts
  → Configure drug schedules, categories, serviceable areas
  → View analytics, audit trail, system architecture
```

## Journey 7: SP Full-Stack B2B (Stockist + Pharmacy tenants)
```
Stockist registers → onboarding (pharmacy, products, staff)
  → Pharmacy registers separately → connects via invite code
  → Pharmacy browses stockist catalog → submits PO
  → Stockist approves → packs (FEFO) → ships → delivers
  → Bill generated (GST, ledger posted)
  → Pharmacy records payable payment
  → Optional: pharmacy POS retail sale to walk-in customer
```

---


### 4.1 Account Registration & Onboarding

**Canonical path:** Register → role assignment → (approval if stockist/pharmacy/doctor) → onboarding wizard → dashboard.

| Flow ID | Name | Key steps |
|---------|------|-----------|
| AUTH-01 | Login | Role select → credentials → role verify → approval gate → redirect |
| AUTH-02 | Multi-step register | HUB 4-role / MR docs / SP single form |
| AUTH-09 | Onboarding | SP SlideOver gates: DL + pharmacy + product + staff |
| AUTH-12 | Catalogue license | ERP: verify-pharmacy-license RPC, 5 attempts/15min |

**SP registration server steps:** reject dup email → bcrypt → create tenant → seed 16 ledger accounts → inviteCode (stockists) → rollback on failure.

**HUB approval:** stockist/pharmacy/doctor `pending` → `/pending-approval`; customer auto-active.

### 4.2 Stockist-Pharmacy Network Formation

| Flow | SP canonical | HUB/ERP variant |
|------|--------------|-----------------|
| Discover | Public API / GSTIN / invite code | HUB find stockist → addToCircle |
| Request | `stockist_connections.pending` | ERP manual AddPharmacyDialog |
| Approve | creditLimit + terms + catalog sync + event | Circle row seed 0/0/0 |
| Reject | 7-day cooldown (SP) | EditPharmacy is_blocked |

### 4.3 Product Catalog Management

See **Module 3 §3.2** in §4A. Canonical capabilities: CRUD, batches, bulk CSV/XLSX, purchase-bill OCR, bulk price %, expiry tiers, adjust stock, catalog push to connections (SP).

### 4.4 B2B Order Lifecycle (stockist ↔ pharmacy)

| Stage | B2B Flow ID | Stockist | Pharmacy | SP service |
|-------|-------------|----------|----------|------------|
| Create | B2B-01/02 | Manual/paste/AI | Cart/checkout or PO | orderService.createOrder / submitPurchaseOrder |
| Approve | B2B-03 | Approve portal order | — | approve() + credit check |
| Pack | B2B-04 | FEFO reserve | — | finalizeOrder() |
| Ship | B2B-05 | AWB/carrier | Track | ship() + event |
| Deliver | B2B-06 | Mark delivered | GRN / confirm receipt | deliver(); HUB autoPopulateInventory |
| Bill | B2B-07 | generateBill | Payable mirror | billService + event |
| Pay | B2B-08 | recordPayment FIFO | recordPayablePayment | paymentService |
| Return | B2B-09 | processReturn | initiateReturn | returnService + event |
| Split | B2B-10 | — | — | HUB child `-S` suffix |
| Partial | B2B-11 | — | — | HUB partial_delivery_items JSON |
| WhatsApp | B2B-12 | All apps (AI/regex) | — | — |
| Smart | B2B-13 | — | MED deepest | smartOrderService |

### 4.5 Billing & Tax Invoices

SP `generateBill`: idempotent per order, `INV-YYYY-####`, per-line GST, dueDate, QR on detail page. HUB: cosmetic TAX INVOICE without GST math. MR: `MR/NNN` bills with upfront% split.

### 4.6 Payments, Credit & Ledger

See **Module 15** in §4A + §6A. SP double-entry is canonical. ERP credit-first FIFO in 5 places. HUB `update_circle_outstanding` atomic in most paths.

### 4.7 Inventory, Batches & FEFO

SP `reserveStock`: expiry ASC, receivedAt ASC, conditional UPDATE, InsufficientStockError→409. HUB double-deduction bug at create+packed.

### 4.8 Smart Order (AI parse + recommend)

See **Module 14** in §4A + §4.8A MED deep-dive below.

### 4.9 Pharmacy B2C / Retail POS

See **Module 5** in §4A. SP PosPage: Rx gate C26, FEFO, split payment, GST-inclusive, SALE-YYYY-####.

### 4.10 Patient/Customer B2C Shop

See **Modules 6 + 8** in §4A. HUB CustomerCheckout is the real B2C path (5% GST + delivery fee).

### 4.11 Doctor Consultations & Prescriptions

See **Module 9** in §4A. HUB: book → conduct → write Rx → commission on delivered Rx orders.

### 4.12 Delivery Staff & Route Execution

See **Modules 11 + 16** in §4A. HUB staff: collect → pending_approval → stockist approves → payment insert.

### 4.13 Returns & Credit Notes

See **Module 3 §3.7** in §4A. SP: restock only wrong_item/cancelled; GST-inclusive credit.

### 4.14 Admin, Approvals & Governance

See **Module 12** in §4A. HUB: 56 admin routes, bulk approval, impersonate, flowboard.

### 4.15 Cross-Tenant Sync (connections + events)

SP only: `cross_tenant_events` + 10s poll + `processed_cross_tenant_events` exactly-once. Event types: order.*, bill.generated, payment.recorded/voided, catalog.changed, return.processed, connection.approved.

---

### 4.8A Smart Order — MED deep specification

#### MED Smart Order Engine (deep dive) — `/pharmacy/smart-order` (`SmartOrder.tsx`)

**UI flow:**
1. Textarea (8 rows, monospace, placeholder examples) + "Analyse & Get Recommendations".
2. `handleAnalyse`: guards non-empty text + logged-in; resolves pharmacy id; calls **`smart-order-parse {rawText, pharmacyId}`**; reads `parseData.success`, sets `parsedItems`+`sessionId`, toast "Parsed N items". Then calls **`smart-order-recommend {sessionId}`**; reads `recommendData.success`, sets `recommendations`, toast. `401` in either error message → "Session expired. Please login again."
3. **Parsed Items** table (Product Name / Quantity).
4. **Items Found summary:** "itemsFound / totalItemsRequested" + destructive "N not found" badge and a "Items not available" badge list.
5. Three recommendation cards (see below), each with **Add to Cart** that maps that strategy's items into `useCart` and navigates to `/pharmacy/cart`.

**`handleAddToCart(mode)`** maps:
- `single`: `bestSingle.items[]` under `bestSingle.stockistId/stockistName`.
- `split`: flatten `cheapestSplit.stockists[].items[]` (each item carries its own stockistId/Name).
- `fastest`: flatten `fastestDelivery.stockists[].items[]`.
Each mapped item = `{productId, productName, price, stockistId, stockistName, quantity}` → `addToCart(item)`.
**BUG:** these items **omit `stockQuantity`, `moq`, `deliveryDate`**, so `addToCart`'s MOQ/stock validation is **bypassed** on this path, and cart lines will have **no delivery date** (checkout writes `delivery_date=null`). **[matches FEATURES.md]**

### 5.1 `smart-order-parse` (edge fn — AI, tool-calling)
- Validates `{rawText: non-empty string, pharmacyId: string}` (else 500 with message).
- Gemini 2.5 Flash with a forced function tool `parse_medicine_list` → `{items:[{parsed_name, quantity}]}` (handles "x10", "20 tabs", "- 5", typos).
- Uses **service-role** client to insert `smart_order_sessions {pharmacy_id, raw_text, status:'processing'}` then `smart_order_items[]`.
- Returns `{success:true, sessionId, items}`. Errors → 500 `{error}`.
- No 429/402 special-casing here (only a generic "AI parsing failed: <status>").

### 5.2 `smart-order-recommend` (edge fn — pure matching, NO AI)
- Input `{sessionId}` (missing → throw). Service-role client.
- Loads `smart_order_items` for the session; loads **all** active `stockist_products` + `stockists!inner(id,name,city)`; loads active future `stockist_delivery_dates` (asc), building `deliveryMap` = earliest date per stockist.
- **`fuzzyMatch`**: exact → substring (either direction) → any word-overlap (either direction).
- Per requested item, matches products then **filters to `stock_quantity >= requested quantity`** (only available offers kept). Each match carries `price, totalPrice = price*qty, deliveryDate, batch/expiry`.
- Builds `stockistAvailability` map accumulating per-stockist `items`, `totalCost`, `itemsAvailable`, `itemsMissing`, `daysUntilDelivery` (`getDaysUntilDelivery`: null date → **999**, else ceil(days)).
- **Recommendation 1 — Best Single Stockist:** among stockists with `itemsAvailable>0`, sort by **most itemsAvailable, tie-break lowest totalCost**; take `[0]` (or null). UI shows border-highlighted "Recommended", delivery date, items available/missing, item list, missing-items badges, total, Add to Cart.
- **Recommendation 2 — Cheapest Split:** for each item pick the match with **lowest totalPrice** across stockists; group chosen items by stockist (`subtotal`); `savings = bestSingle.totalCost − cheapestSplitTotal` (0 if no bestSingle). UI badge: "Save ₹X" or "Best Price"; per-stockist item breakdown; total; Add to Cart.
- **Recommendation 3 — Fastest Delivery:** for each item pick the match with **fewest daysUntilDelivery**; group by stockist; `earliestDelivery = Math.min(...daysUntilDelivery)`. UI shows per-stockist delivery date + subtotal, "N days" badge, total, Add to Cart. Rendered only if `fastestDelivery.stockists.length > 0`.
- `notFoundItems` = requested items with zero matches. Persists `smart_order_recommendations {session_id, result_json}` (best-effort; logs on failure). Sets session `status='completed'`. Returns `{success:true, recommendations:{bestSingle, cheapestSplit, fastestDelivery, notFoundItems, totalItemsRequested, itemsFound}}`.
- **Edge cases:** if all matched items have null delivery dates, `earliestDelivery=999`; if `fastestDeliveryItems` empty, `Math.min()` = `Infinity` (guarded by UI length check). `itemsMissing` logic pushes an item to *every* stockist that lacks it, so a single-stockist plan lists other requested items as "missing" even if another stockist has them.

---


---


# Digi Swasthya — Unified Feature Specification (FULL UNION — nothing removed)

> **Scope:** an exhaustive, code-derived union of **8 sibling pharma apps** — `stockpharmaerp` (**ERP**), `digi-swasthya-hub` (**HUB**), `greetings-pal-git`/MedOrder (**MED**), `stockistpayments`/PharmaMR (**MR**), `digimvplaunch` (**MVP**), `digiswasthya` (**DSW**), `digiswasthyamvp` (**DMVP**), and `STOCKIST-PHARMACY` (**SP**).
>
> **This file preserves everything.** Every flow, sub-flow, page/screen (and its content), module, action, interaction, business logic, calculation, status machine, edge case, use case, user journey, and all UI (forms, modals, sheets, drawers, input fields) found in **any** app is kept. Where a flow repeats across apps it is stated once with a multi-app tag; where apps differ (partial / extra / variant), all variations are enumerated; where a flow exists in only some apps, it is included with its source(s).

## How this document is organized
- **Part I — Unified Feature Map:** the merged superset, organized by module/role, with an app-roster table, a module×app coverage matrix, and per-item source tags (`ERP HUB MED MR MVP DSW DMVP SP`) + `partial`/`extra`/`variant` deltas. This is the de-duplicated-but-complete merge.
- **Part II — Complete Per-App Reviews (Appendices A–H):** each app's full exhaustive review, verbatim, so no detail from any single app is ever lost — even anything not surfaced in Part I lives here in full.

> Generated by reading each app's source directly (routers, every page/component/dialog, hooks/contexts, edge functions/services, DB schema/types) — not from prior docs. The previous deduped "best-of" version of this file is backed up in the session scratchpad.

---

## 4A. Unified Module Specification (merged Part I — complete)


> **This section is the exhaustive merged specification** from all 8 reviews (Modules 1–19). It powers §4 flows above and should be treated as the canonical feature/requirement text. Where a page/flow/field/logic appears in several apps identically it is stated once with a multi-app tag; where apps differ, the superset is described first and per-app deltas are bulleted. Source tags use short-codes; `partial` = missing steps/fields vs superset, `extra` = additional beyond superset, `variant` = different logic/UI. Nothing found in any app is dropped.

## App roster

| Code | In-product name(s) | Stack one-liner | Backend type |
|---|---|---|---|
| **ERP** | "Digi Swasthya Store" (AI: "Digi Swasthya AI") | Vite+React18+TS · shadcn/Tailwind · RR v6 · TanStack Query · Zustand · Supabase | Supabase (Auth/PG/Storage/Realtime/Edge) + Lovable AI Gateway (Gemini + GPT fallback) |
| **HUB** | "Digi Swasthya" / "Digi Swasthya Hub" / "Digital Swasthya" (branding drift) | Vite5+React18+TS · shadcn · TanStack Query v5 · Supabase · recharts · jsPDF/qrcode | Supabase (Deno edge fns) + Lovable AI Gateway (`gemini-3-flash-preview`/`2.5-flash`) |
| **MED** | "MedOrder"/"MediConnect"/"Medicine Ordering Marketplace" (3 names) | Vite+React18+TS · shadcn · RR v6 · TanStack Query (light) · Zod · papaparse/xlsx · Recharts · vite-plugin-pwa | Supabase (Auth/PG/Storage/Edge) + Lovable AI Gateway (`gemini-2.5-flash`, no fallback) |
| **MR** | "PharmaMR" / "Chameleon MR/Stockist/Distributor/Pharmacy/Admin" (drift, "P" glyph) | Vite5+React18+TS · shadcn · RR v6 · TanStack Query · Supabase · PapaParse/SheetJS · Recharts · Zod · Sonner | Supabase (Auth/PG/Storage/Edge) + Lovable AI Gateway (`gemini-2.5-flash`) |
| **MVP** | "Digi Swasthya" (clickable prototype) | Vite+React18+TS · shadcn · RR v6 · TanStack Query (unused) · RHF+Zod (present) · Recharts | **None** — client-only; 2 localStorage keys (`digi-swasthya-auth`, `digi-swasthya-state`) |
| **DSW** | "Digi Swasthya" (Lexend font) | Vite5+React18+TS · shadcn · RR v6 · TanStack Query (mounted, unused) · Recharts · RHF+Zod (unused) · vite-plugin-pwa | **None** — front-end-only prototype; 1 localStorage flag (tour) |
| **DMVP** | "Digi Swasthya" (B2B MVP; brand of Chameleon OPC Pvt Ltd) | Vite+React18+TS · shadcn · RR v6 · TanStack Query · **hand-rolled mock `supabase`** · Recharts · jsPDF/html2canvas/xlsx/qrcode | **Mock Supabase client** over static seed (21 tables); all writes no-op; edge fns unreachable |
| **SP** | wordmark "Stockist"/"Pharmacy" (blue/teal shells) | client(React19·Vite·TanStack Query5·Zustand5·RR7·axios·Recharts·jsPDF) + server(Express4·Drizzle·**PGlite**·jose·bcrypt·zod·`@google/genai`) + shared | **Real full-stack** — Express + Drizzle over embedded PGlite Postgres; httpOnly JWT cookies; double-entry ledger; cross-tenant event bus |

Legend for backend "realness": ERP/HUB/MED/MR/SP = real backends; **MVP/DSW = pure front-end prototypes (no backend, all writes local/toast)**; **DMVP = mock-Supabase (writes silently no-op, AI returns null)**.

## Module × app coverage matrix (✓ full · ~ partial · — absent)

| # | Module | ERP | HUB | MED | MR | MVP | DSW | DMVP | SP |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Platform Overview & Roles | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | Auth / Sessions / Onboarding | ✓ | ✓ | ~ | ✓ | ~ | ~ | ~ | ✓ |
| 3 | Stockist | ✓ | ✓ | ✓ | ✓(seller) | ✓ | ✓ | ✓ | ✓ |
| 4 | Pharmacy — B2B purchase | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 5 | Pharmacy — B2C sale | — | ✓ | — | ✓(OTC) | — | ✓ | — | ✓(POS) |
| 6 | Pharmacy — Public Catalogue | ✓ | ~(public discover) | — | — | — | — | — | ~(public discover) |
| 7 | Seller variants (MR/Distributor) | ✓(MR) | — | — | ✓ | — | — | — | — |
| 8 | Patient / Customer | ✓ | ✓ | — | — | — | ✓ | — | ✓(POS customers) |
| 9 | Doctor | ✓(partial) | ✓ | — | — | — | ✓ | — | — |
| 10 | Brand | ✓ | — | — | — | — | — | — | — |
| 11 | Delivery Staff | ~(route exec) | ✓ | — | — | — | — | — | — |
| 12 | Admin | ✓ | ✓ | —(dormant enum) | ✓ | ✓ | ✓ | ✓ | ~(tenant admin only) |
| 13 | AI & Edge/Backend Functions | ✓ | ✓ | ✓ | ✓ | — | — | ~(defined, null) | ✓ |
| 14 | Smart Order engine | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 15 | Payments / Credit / Money | ✓ | ✓ | ~(mock) | ✓ | ✓ | ~(toast) | ✓ | ✓ |
| 16 | Delivery config & fee engine | ✓ | ✓ | ✓(dormant) | ~ | ✓ | ✓ | ~ | ~ |
| 17 | Realtime/Offline/PWA/Infra | ✓ | ✓ | ~ | ~ | ~ | ~ | ~ | ~ |
| 18 | Data model | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 19 | Cross-cutting conventions | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## Module 1 — Platform Overview & Roles

**Domain (all apps):** B2B pharmaceutical distribution & commerce between **Stockist** (seller/wholesaler) and **Pharmacy** (buyer/retailer), with variable extensions (patient B2C, doctor consults, MR sellers, brand portals, admin governance). Currency `₹` throughout.

**Role sets per app** ‹superset across all›:
- **ERP:** stockist, pharmacy, patient, brand, **mr**, admin. Most-privileged resolution `admin > stockist > pharmacy > mr > brand > patient` (`useUserRole`). Self-signup for 5 (not admin).
- **HUB:** stockist, pharmacy (dual purchase/sale mode), **customer** (label "Patient"), **doctor**, admin (hidden, 5-tap logo reveal). Plus separate **delivery staff** credential system (stockist-side & pharmacy-side). RootRedirect priority `admin > stockist > pharmacy > customer > doctor`.
- **MED:** stockist, pharmacy, **admin (enum + RLS only, zero routes/screens — fully dormant)**. One role per user (`.single()`).
- **MR:** **mr, stockist, distributor, pharmacy, admin** (`app_role` enum). Admin self-signup gated by hardcoded password `jit@ADMIN1`. `handle_new_user` trigger default role = `pharmacy`.
- **MVP:** admin, stockist, pharmacist. `rolePermissions` capability matrix exists but **no route enforces any flag**; role is a nav choice only.
- **DSW:** stockist, pharmacy (purchase + **sale** views), patient, doctor, admin — **all publicly reachable by URL, role is purely a nav choice, no guards**.
- **DMVP:** admin, stockist, pharmacy (`app_role` enum also lists customer/doctor, unused). No route guards; identities hardcoded (stockist=sp-001/Rajesh, pharmacy=pp-001/Anita, admin=Platform Admin).
- **SP:** **two tenant types** (`stockist`, `pharmacy`) never cross-reading; per-tenant **staff roles** `admin | biller | pharmacist | cashier`. **No platform super-admin** (only tenant-scoped admin). Cross-tenant state flows through a connection record + append-only event queue.

**Route-guard posture** ‹variant per app›:
- ERP: `ProtectedRoute` (role + onboarding), `AdminRoute` (re-queries server-side each mount), `DashboardLayout` extra checks. Public catalogue routes unauthenticated.
- HUB: `ProtectedRoute` (role only); approval gating only in Login; staff have separate `/staff` session.
- MED: `ProtectedRoute allowedRoles` + 15s timeout screen; role-less → "setup incomplete".
- MR: single `ProtectedRoute` checks **only logged-in** (no role); per-page `useRoleGuard` on *some* pages; `/admin/*` guarded by login only (real protection is RLS + edge-fn checks).
- MVP/DSW/DMVP: **no role guards** (MVP checks only `isAuthenticated`; DSW/DMVP none).
- SP: `ProtectedRoute` (calls `GET /auth/me`), `requiredTenantType`, `requiredRole`/`allowedRoles` panels; router tenant-pinning of API namespaces; middleware `requireRole`/`requireRoleForTenant`/`requireTenantType`.

**Layouts/nav** ‹all apps have role-specific top+bottom nav›. Notable: HUB pharmacy has purchase/sale mode toggle in avatar popover; SP has two shells (MainLayout blue "Stockist", PharmacyMainLayout teal "Pharmacy") both polling `POST /events/process` every 10s; MR header brand text is role-specific "Chameleon *"; DSW/MVP mobile avatar button logs out on click; MVP notification bell shows a **static red dot always**.

**Orphaned/dead pages** (kept for completeness) ‹per app›: ERP — PatientSignup, BrandSignup, Index, RoleSelection, duplicate BottomNav. MED — Index.tsx (marketing hero, not routed), ProductTable, LocationInput. MR — Upgrade.tsx (unrouted ₹999 page), admin Subscriptions.tsx (unrouted but linked→404), MobileNav (unmounted). DSW — Index, PharmacyPortal, PharmacyProfile, many orphaned dialogs (CheckoutDialog, SmartOrderDialog, ApplyCouponDialog, WritePrescriptionDialog, OCRScanDialog, MapRouteDialog, BillPreviewDialog, CreateReturnDialog). DMVP — Login/Register/ForgotPassword/ResetPassword/PendingApproval/Index (all unrouted; `/login`&`/register`→`/`), ProductForm/ProductCard parallel components unused. MVP — PaymentsPage (built, unrouted), Onboarding (not linked), Signup/Login (redirected away), NavLink wrapper.

---

## Module 2 — Authentication / Sessions / Onboarding

### 2.1 Login
**Superset:** Email + Password form; role choice; "Remember me" (present but **unwired in ERP, HUB, MED implicit, MR n/a, MVP, DSW inert**); "Forgot password" link; redirect-by-role after sign-in.
- **ERP** ‹ERP›: Card "Digi Swasthya Store", tabs Login/Sign Up. `signInWithPassword`; redirect via `roleConfig[role].dashboard` unless `onboardingComplete[role]===false`. Sign-Up: role grid (5 roles, not admin), Email/Password(min6)/Confirm → `auth.signUp` + upsert `user_roles`+`profiles` → onboarding.
- **HUB** ‹HUB›: role picker (Customer/Pharmacy/Stockist/Doctor; admin hidden). Dev-only credential prefill (`import.meta.env.DEV`). **5-tap logo admin reveal** (5 taps <1500ms). Flow: `rpc check_login_rate_limit` → `signInWithPassword` → `record_login_attempt(success)` → fetch `user_roles` (mismatch → signOut) → **approval gate** for stockist/pharmacy/doctor (`pending`→/pending-approval, `rejected`→signOut). Customers never gated. Footer "A brand of Chameleon - The Agency (OPC) Pvt Ltd." PWA install banner via `beforeinstallprompt`.
- **MED** ‹MED›: "Welcome Back"; on success re-fetch role (`.single()`); role-less → signOut+/auth/register. Forgot-password is an inline AlertDialog.
- **MR** ‹MR›: single card 4 modes **Login / Forgot Password / OTP Login / Signup**. OTP via `signInWithOtp`. Logo="P".
- **MVP** ‹MVP›: AuthPage `/auth` (default). Role selector Stockist/Pharmacy only; "prefill demo" link. **`login()` always succeeds** (fallback seed user; "Invalid credentials" is dead code); 1200ms fake latency. Separate `/admin-login`. `Login.tsx` (unrouted): email→role auto-detect; **5× logo tap → /admin-login**.
- **DSW** ‹DSW›: AuthPage `/auth`; 4-role selector prefills `demoCredentials`; **inputs ignored → navigate(homeRoutes[role])**; ghost "Admin Login" button → /admin/dashboard.
- **DMVP** ‹DMVP›: no login screen used; `DemoHome /` writes `demo_role` and navigates; `/login`&`/register` redirect to `/`. Mock auth always succeeds.
- **SP** ‹SP›: panel detected from path/`?panel=` (blue/teal). Email(autofocus)+Password(eye). `POST /auth/login` (+`tenantType` only if pharmacy panel). Error map: no-response/429/401/≥502/generic. Login looks up **all** active users with that email across tenants, bcrypt-compares each; wrong panel → 403 "registered on the {Pharmacy|Stockist} panel".

### 2.2 Sign-up / Registration
- **ERP:** on Login page Sign-Up tab (see above).
- **HUB** ‹HUB›: type picker (Customer/Pharmacy/Stockist/Doctor) → 4 registration components, each `auth.signUp` + insert user_roles + profile; docs → single `documents` bucket. **CustomerRegistration** (3 steps, auto-active, no docs). **PharmacyRegistration** (5 steps; pharmacyType Retail/Hospital/Chain/Clinic/Online; docs drugLicense/gstCertificate/pharmacyCertificate public URLs; bank optional; notifies admins; approval pending; "Skip" link). **StockistRegistration** (5 steps; businessType incl. "Medical Representative" reveals brand picker + MR agreement; PIN gate against `admin_serviceable_areas`; serviceable-area PIN chips; bank required; notifies admins). **DoctorRegistration** (5 steps; 20 specializations; default fees audio 300/video 500/clinic 200).
- **MED** ‹MED, partial›: `/` = Register. Two tabs Pharmacy/Stockist, **byte-identical Zod schemas**. Fields: Name(2–100), Drug License(min1), City(opt), State(opt), Email(≤255), Password(Zod min8 / input minLength6). Flow: signUp → insert user_roles → insert profile; **compensating cleanup** (delete user_roles) on profile-insert failure. Edge: RLS-guarded inserts fail if email confirmation on.
- **MR** ‹MR›: Signup mode fields — User Type radio (MR/Stockist/Distributor/Pharmacy/Admin, default mr), **Username** (6–16, live availability `ilike` check), Full Name, Email(Zod), Password(min6), Phone(Zod 10–15), role-specific (Business/Company Name, businessType/Brand, UPI, distributor Service Areas; pharmacy owner+address; **admin password==`jit@ADMIN1`**), **mandatory document upload** (≤5MB) to private `licenses` bucket. Submit → `auth.signUp` (trigger `handle_new_user`) → upload doc → update profile → `assign-role` edge fn.
- **MVP** ‹MVP›: Sign-Up tab validates match+min6 → `/register/{role}`. **StockistRegistration 7-step wizard** (Business·Documents·Contact·Delivery·Rules·Financial·Review); **PharmacyRegistration 5-step** (Business·Documents·Contact·Config·Review, dynamic required-fields by pharmacy type, live credit-risk evaluation). **CRITICAL STUB: neither calls `registerStockist`/`registerPharmacist`** — success modal just logs into a demo session; data discarded. FileUpload 5MB cap silently drops oversized.
- **DSW** ‹DSW›: Sign Up tab → `/{role}/onboarding`; no password-match validation. Onboarding wizards per role (Stockist 5 / Pharmacy 5 / Patient 3 / Doctor 5), prefilled, **no validation, DocumentUpload only local preview**, Skip/Complete both navigate.
- **DMVP** ‹DMVP›: Login/Register + Stockist/Pharmacy 5-step wizards exist but **unrouted**.
- **SP** ‹SP›: `/register` **single form** (multi-step wizard missing). Stockist/Pharmacy toggle. Fields: Business/Pharmacy Name, Your Name, Email, Phone, State Code(2), **DL (pharmacy required)**, Password(strength meter), Confirm. Client validation via `lib/validation`. `POST /auth/register` (Zod `RegisterSchema` superRefine pharmacy DL≥3). Server `registerTenant`: rejects dup email(409), bcrypt(10), creates tenant + one `users` admin row, seeds **16 ledger accounts**, generates `inviteCode` (**stockists only**), rolls back tenant on user-insert failure. NOT collected: business type, PAN, WhatsApp, city, PIN, serviceable pincodes, docs, bank.

### 2.3 Forgot / Reset password
- ERP ‹ERP›: `/forgot-password` (`resetPasswordForEmail`), `/reset-password` (verify session, updateUser min6).
- HUB ‹HUB›: same; ResetPassword listens `PASSWORD_RECOVERY`/`#type=recovery`.
- MED ‹MED›: inline dialog only.
- MR ‹MR›: Forgot + OTP modes in Auth card.
- MVP ‹MVP, stub›: ForgotPassword/ResetPassword = 1200ms timer + toast, no persistence, not linked.
- DMVP ‹DMVP›: unrouted.
- SP ‹SP›: `/forgot-password` creates `password_reset_tokens` (jti, 15-min) + jose reset JWT, generic message always, dev returns `devToken`. `/reset-password` verifies purpose+jti+sub, unused/unexpired, bcrypt-set, marks used, **revokes refresh tokens**.

### 2.4 Sessions / timeout
- **ERP** ‹ERP›: AuthContext (30-min `SESSION_TIMEOUT`, activity events, 60s check → toast+signOut; `SessionTimeoutWarning` AlertDialog last 5 min with mm:ss countdown; refreshSession on 401). PharmacySessionContext (20-min inactivity for public catalogue). Zustand store cleared on signOut.
- **HUB** ‹HUB›: `useSessionTimeout(30min)` (resets on activity, 5-min heartbeat updates `profiles.updated_at`). `useToSAcceptance`.
- **MED** ‹MED, partial›: 15s auth-guard timeout screen; role-fetch 5s timeout. No inactivity timeout.
- **MR** ‹MR, partial›: no role/timeout state; sessions in localStorage w/ autoRefresh.
- **SP** ‹SP›: JWT jose HS256 (secret ≥32 chars else boot fails), httpOnly cookie `accessToken` (sameSite lax, 24h). `authenticate` re-queries user+tenant every request; 401 `Session expired` if `floor(updatedAt/1000) > token.iat` (password/profile change invalidates). Refresh tokens table exists but **no `/auth/refresh` endpoint**. `SessionExpiredRedirect` component.
- MVP/DSW/DMVP ‹—›: no real sessions (localStorage flag / demo_role).

### 2.5 Onboarding wizards
- **ERP** ‹ERP›: per-role onboarding pages with `OnboardingCarousel` (3 slides gated by `localStorage.onboarding_completed_{role}`). Insert role-detail row → dashboard. Fields per role listed in Module 3/8/9/10.
- **HUB** ‹HUB, partial›: Stockist/Pharmacy static 3-slide carousels; no data written, nothing auto-navigates. Doctor/Customer registration doubles as onboarding.
- **MR** ‹MR›: `/onboarding` OnboardingSelectRole (4 roles, no admin) → `assign-role`.
- **SP** ‹SP›: stockist `OnboardingFlow` (SlideOver, 4 steps: Business Profile / First Pharmacy / Import Products / Add Staff, gated by `hasPharmacy`/`hasProducts`/`hasStaff`; `PATCH /settings/onboarding` enforces min-setup gates). Pharmacy `PharmacyOnboardingFlow` (5 steps: Business/Connect Stockist/Import Products/Opening Stock[skippable]/Add Staff; requires ≥1 active connection to complete).
- MVP ‹MVP›: `/onboarding` 3-slide carousel (role from localStorage), sets `onboarding_seen`, → /login. Not linked from main flow.
- DSW ‹DSW›: onboarding pages per role, prefilled, no validation.

### 2.6 Delivery-staff auth ‹HUB only›
`/staff/login` — username+password → `rpc verify_staff_credentials` called **twice** (stockist then pharmacy). Session in `localStorage.staff_session` (24h TTL). `StaffDashboard` re-validates server-side against `delivery_staff`/`pharmacy_delivery_staff`. (Full staff flows in Module 11.)

---

## Module 3 — Stockist (seller)

> This is the richest module across apps. Superset of pages: **Dashboard/Home · Products/Inventory (list, add, edit, detail, batches, bulk upload, purchase-bill OCR, bulk price, expiry, stock transfer) · Orders (list, detail, create, order-creation from paste) · Pharmacies/Circle (list, detail, ledger, find, approvals) · Payments (received, approvals, record) · Bills (create, history, bulk, preview) · Returns/Credit Notes · Suppliers/Purchases (SP/MR) · Delivery settings (dates/areas/fees/routes/holidays) · Reports · Analytics · Staff · Profile/Business/Settings · Route execution**.

### 3.1 Dashboard / Home
**KPI cards** ‹superset›: Total Revenue, Pending Orders/Payments, Outstanding, Total Credits, Active/Total Pharmacies, Total Products, Total Orders, Today's Orders/Revenue, Stock Value, Low Stock count, Overdue Bills, Pending Bills.
- **ERP** ‹ERP›: 5 clickable KPI cards (`KPICards`→`KPIDetailDialog`) with **hardcoded fake trend badges** (+12.5% etc): Total Revenue (`Σ orders.total_amount`), Pending Payments (`Σ pharmacy.outstanding_balance`), Total Credits (`Σ credit_balance`), Active Pharmacies (count is_active w/ orders), Total Orders. `useDashboardStats`. `DateRangeFilter` (display-only, not applied). Export→`ExportDataDialog` (RadioGroup Orders/Payment Confirmations/Activity Log → naive CSV). QuickActions 8 tiles (Quick Order, Quick Bill, Edit Order[soft stub], OCR Scan, Bulk Upload, Map Route, Upload Bill Photo, Delivery Settings). Payment Approvals card (inline Reject/Hold/Approve via `useProcessPayment`). Recent Platform Orders. LowStockAlert (`stock ≤ min_stock_threshold`, top5). TopProducts (order_items aggregation top5). NoticesPanel (`user_notice_recipients`→`admin_notices`, dismiss/read, realtime). RecentOrders, ActivityFeed (`activity_log` last50, filter Select). Realtime `dashboard-orders-updates`.
- **HUB** ‹HUB›: **8 clickable KPI cards** (`["stockistKPI"]` refetch 30s): Pending Orders, Total Products, **Pharmacies = unique pharmacy_id over ALL orders**, Revenue (`Σ where status∈{completed,delivered}`), Outstanding (`Σ circle.outstanding`), Today's Orders, Stock Value (`Σ stock×price`), **Pending Bills (`bills.status='draft'` — nothing writes draft → always 0`). "New Pharmacies This Month" banner. Alert cards: Expiring Soon (≤30d), Low Stock, Safety Alerts (counterfeit fuzzy-match). Charts (recharts): Monthly Order Trend, Revenue vs Outstanding, Top Pharmacies, Top Products. Widgets: DeliveryPerformance (avg hours), ReturnRate (red>5%), PaymentCollection (≥80% accent). 4 Quick Actions (Create Order, Collect Payment→/pharmacies only, Bulk Upload, Upload Bill).
- **MED** ‹MED›: KPI Total Products (+active sub), Total Orders, Revenue (This Month `Σ where created_at≥startOfMonth`), Delivery Dates nav card. Low Stock (`min_stock_alert>0 && stock≤min`, top5), Expiring Soon (≤30d asc top5). QuickActions Manage Products / Set Delivery Dates + duplicate Sign Out.
- **MR** ‹MR, seller dashboard›: SellerDashboard role-titled. 4 KPI: Total Revenue (MR `Σ bills.received_amount`; stockist/dist `Σ orders.total_amount where delivered`), Pending Payments/Orders, Active Pharmacies/Customers, Products Listed (MR filters brand). Quick Actions (several **dead links** `/customers`,`/products`,`/suppliers`). Recent Orders. ActivityFeed. Header buttons: MR QuickBill+QuickOrder+OCR; stockist/dist OCR+BulkUpload.
- **MVP** ‹MVP›: StockistDashboard — banner, 6 QuickActions (navigate-only), circle banner, 6 KPI (all **real**: Pending Orders, Total Products, Pharmacies, Revenue `Σ delivered/1000 K`, Outstanding `max(0, Σ ALL order value − Σ paid)`, Stock Value incl expired), Monthly BarChart, Top Pharmacies, Top Products, Recent Orders(5).
- **DSW** ‹DSW›: StockistHome — GuidedTour (5 steps, localStorage `stockist_tour_completed` — **only real persistence**). New Orders banner. Incoming Orders (first 2). **2 KPI cards**: Financial (Outstanding real, Credits real, **Today's Collection = 45000 hardcoded**), Operations (Active Orders, Out-for-delivery, Pending Approvals badge). 4 Quick Actions. Payment Approvals (toast-only). Today's Deliveries, Low Stock (first 3). All writes toast/local.
- **DMVP** ‹DMVP›: StockistHome — 8 KPI cards (filtered to literal sp-001): Pending Orders, Total Products(8), Pharmacies(4), Revenue(₹17,010), Outstanding(₹18,079), Today's Orders (hardcoded date match), Stock Value, **Pending Bills="1" literal**. Expiring Soon (60d window). Low Stock. Monthly chart. **Hardcoded Top Pharmacies & Top Products lists**. Styling bug `bg-${color}/10` (JIT). All writes no-op.
- **SP** ‹SP›: Dashboard KPI period date-from/to (default MTD). StatCards: Today's Sales, Period Sales, **Total Outstanding (admin only)**, Awaiting Pack (`packBacklogOrders`), Incoming Portal (`incomingPortalOrders`), Active Connections, Low Stock Items (Σ non-expired on-hand < minStockLevel), Overdue Bills (`buildOverdueBillFilter`). Widgets: IncomingOrdersWidget(5), Recent Orders(5), Low Stock(5). Quick actions: New Order, Review Incoming, Record Payment (`?record=1`), Add Purchase, View Reports. Opens OnboardingFlow if `!onboardingCompleted && admin`.

### 3.2 Products / Inventory
**Superset:** grid/list of product cards; search (name/brand/generic/composition); filters (brand, category, expiry window, stock status, sort); add/edit product; product detail with batches + sales history; add stock; bulk upload (catalogue + purchase-bill OCR); bulk price update; expiry management; stock transfer; scan (OCR).

**Product-card content** ‹superset›: image (fallback placeholder), name, brand/manufacturer, category badge, MRP strikethrough + sale/selling price, stock count, MOQ, expiry badge (Expired/Nd/mo tiers), margin, Rx/Narcotic/Hidden/Out-of-stock/Flagged badges, row menu (View/Edit/Delete/Add Stock/toggle active/visibility).

- **ERP** ‹ERP›: 20 hardcoded `MEDICAL_CATEGORIES`. Filters Brand/Category/**Expiry (30/60/90/120d)**/Sort. Sections Top Products This Month, Items to Watch. `getExpiryBadge` tiers. **AddProductDialog** fields: Product Name*+**Auto Fetch** (`fetch-product-info`), Generic/Salt, Brand, Manufacturer, Form/Type (14 opts), Category (~24), Pack Size, Strength, MRP, Purchase Price, Sale Price, Stock(0), Min Stock Alert(10), MOQ(1), GST%(5), Image (product-images), Description, batch_code (unsaved). **EditProductDialog**: +HSN Code+Batch Code+Fetch-with-AI but **update omits hsn_code/batch_code** (known gap); Type dropdown only 6 opts. **QuickUpdateStockDialog** (Add vs Set mode, live preview). **ProductScanDialog (OCR)** → `extract-product-label`, staged progress, match existing, "Correct—Enable Editing" unlocks. **BulkUploadDialog** 3 tabs (Purchase/Sale/Full Catalogue), CSV/XLSX/image/PDF ≤10MB, margin input (20%), preview table, `extract-bill-items`. **Enhance All** (loops `fetch-product-info`). Realtime `products-realtime`.
- **HUB** ‹HUB›: `SharedProductCard` role stockist; batch-loads `product_batches`. Filters search/brand(`PHARMA_BRANDS`)/category(16)/expiryFrom-To/sort/cols toggle. **Bulk Price** dialog (field sale_price|mrp, direction, type %|flat, value; batches of 10). **ProductForm** fields: image, name*, brand*(searchable+custom), manufacturer, category*, mrp*, sale_price*, purchase_rate, stock, min_stock_level, min_order_quantity(1), batch_number, expiry_date*, hsn_code, gst_rate*, drug_schedule*(NONE/H/H1/X/NDPS), drug_type, composition*, pack_type, pack_size, fssai_license, requires_prescription, is_narcotic. `price=sale_price??price`; `in_stock=stock>0`. **AI Autofill** (`autofill-product-details`, empty fields only). Edit-with-price-change inserts `price_change` notifications but **does NOT write price_history**. **StockistPriceHistory** page = DEAD (no writer). **BatchManager** (inserts product_batches, re-aggregates stock, **LIFO headline price from latest batch**). **StockAlerts** (self-notify). **StockistExpiryManagement** (Expired/30/90/Safe buckets; Dispose sets batch stock 0, no re-aggregate). **StockistStockTransfer** (between batches, no re-aggregate/log). **BulkUploadCatalogue** (client XLSX, flexible expiry parse, no batches). **BulkUploadPurchaseBill** (`parse-purchase-bill` vision, upsert by name, doesn't set purchase_rate/batches). **StockistBatchManagement / BatchExpiryCalendar**.
- **MED** ‹MED›: ProductCard grid (inline stock edit), Saved Drafts (`bulk_upload_drafts`). Filters search(name/brand)/Brand/Category (from current page only). **AddProduct** 7 sections (Name+Fetch-with-AI[**broken no-op**], Generic, Brand, Manufacturer, Type[Capitalized 6], Category, Pack Size, Strength, MRP, Purchase Price, Sale Price*, Stock, Min Alert, MOQ(1), GST%(18), Description). **EditProduct** same (Type lowercase+other — **value mismatch bug**; gst defaults 0). Toggle Active, Delete (hard). **BulkUpload** 3 tabs (Purchase/Sale/Catalogue), spreadsheet + image/PDF (`extract-bill-items`), MarginSettingsModal (default 20%), preview, Save-as-Draft, `bulk-upload-commit`. **CustomPricing** page (two-way Sale↔Margin; **edits lost bug** — BulkUpload never reads location.state).
- **MR** ‹MR›: **MyProducts** (role-guarded) "My Catalogue" — LocationSelector (**mock**), Catalogue Status Switch (`is_catalogue_live`), MR brand restriction banner. Filters search/Expiry(OK/soon/expired)/Stock. Cards with availability toggle, Edit(**404 bug** `/edit/`), Delete. `canGoLive` computed but unused. **Catalogue** (browse-all, all sellers). **ProductForm** fields: Name*+AI Auto-fill (`autocomplete-product`), Image (product-images), Brand (Select ~50, **locked for MR**), Category* (10 enum), Salt, Type, Uses, Description, MRP, Purchase Rate, **Sale Price Calculator** (margin percent/amount, clamps to purchase), sale_rate, Batch, Expiry, Sale Price(Displayed)*=price, Unit, Stock. `seller_type = distributor?"distributor":"stockist"` (**MR→stockist bug**). **OCRUploadModal** (`ocr-product-label`), **BulkUploadModal** (CSV/Excel).
- **MVP** ‹MVP›: Inventory (scoped user.id, 600ms skeleton) — search, Filters dialog (categories/brand/expiry all·soon<30·1-3=30-90·3-6=90-180 / stock all·in·low(≤100)·out / price range), grid/list toggle, action buttons. Card: badges Out/Rx(Antibiotic heuristic)/Flagged, price+MRP+margin, stock, expiry. **AddItem** (real persist): Name*, Brand, Manufacturer*, Category, MRP*, Sale, Purchase, Stock*, Min(100), Batch*, Expiry*(future), Mfg, HSN, GST(text), Schedule, Type, Composition, Pack, FSSAI, Rx/Narcotic. **Stub: brand/gstRate/fssai/minStock NOT passed**. **EditProduct** (batches[0] only — multi-batch loses edits; many fields not persisted). **ProductDetail** (real 6-mo BarChart, per-batch pricing, Add Batch dialog real). **BatchManagement** (read-only, All/Expiring≤90/Counterfeit). **BulkUpload** (**file ignored**, mock rows, writes nothing). **PurchaseBills** (file ignored, mock items, local only). **BulkPriceUpdate** (inline REAL applies to ALL batches; upload FAKE `Math.random` prices).
- **DSW** ‹DSW›: StockistProducts — 2×2 Quick Actions (Scan/Bulk/**AI Enhance stub**/Add). Collapsible Low Stock, Top Selling (first 4). Search + stock filter + sort (real). Card cycled Unsplash images. **ProductDetail** (`regulatoryInfo` derived from category, ignores real fields; **packSize hardcoded "10 tablets"**; 6 hardcoded sales points). Dialogs: AddProduct (18 fields → toast), EditProduct (different category list), AddStock, ScanProduct (setTimeout mock), BulkUpload (5-stage mock), Documents CRUD real-local.
- **DMVP** ‹DMVP›: StockistProducts — SharedProductCard, ProductFilters (Brand 30, Category 16, merged Expiry popover, Sort, cols toggle). **Bulk Price** dialog (batches of 10, no-op write). **AddProduct** full page (Auto Fetch→null "No details found", ProductGalleryUploader→placeholder URLs; dead `counterfeitWarning`). **EditProduct** (price-change notification filters circle by non-existent `status='active'` → 0). **BulkUploadCatalogue** (client XLSX real parse, insert no-op). **BulkUploadPurchaseBill** (`parse-purchase-bill`→null). **ProductForm/ProductCard** components dead. ProductDetail 7-line wrapper → SharedProductDetail (sales chart always empty — join unsupported).
- **SP** ‹SP, shared products route, panel-aware›: ProductListPage — search(name/generic/hsn), category filter, Add Purchase(admin/biller→UploadBillModal), Bulk Update, Add Product, Export(admin CSV ≤50k). `currentStock` = sum of **non-expired** batches only. Cashier hides MRP/GST cols. **AddProductModal** (SlideOver): Name*, Generic, Manufacturer(datalist), Category*, HSN, Schedule(NONE/H/H1/X/NDPS), Pack Size, Conv Factor, Base/Sale Unit, Scheme Base/Bonus, GST(0/5/12/18/28), Status; MRP*, Purchase*, Sale*; Min Stock. Client `validateHsn`(4-8) + `validateProductPrices`(purchase≤MRP, sale≤MRP, sale≥purchase). Server `ProductSchema`; **stockist create/update → `pushCatalogToActiveConnections` background**. **AdjustStockModal**: batch select, signed qty change, reason(damaged/expired/cycle_count/lost/other) must be chosen, notes; stockist requires `sourcePurchaseId`; **newOnHand ≤ qtyReceived (C25)**; writes `stock_movements` reason adjustment. **BulkPriceEditModal** (CSV export/re-upload, PATCH per row). Detail: KPI cards + Product Info + Batches tabs. `POST /from-catalog/:catalogItemId` (pharmacy resale saleRate defaults to MRP).

### 3.3 Orders (seller side)
**Superset:** order list (filters pharmacy/payment/source/status tabs), order detail (status stepper + items + payment + delivery + actions), create order (manual + paste/AI parse), status machine.

**Order status vocab** ‹variant per app›:
- ERP: `status` draft/confirmed/cancelled; `payment_status` paid/unpaid/partial; `delivery_status` pending/dispatched/out_for_delivery/delivered.
- HUB (B2B): pending→packed→dispatched→out_for_delivery→delivered (+cancelled, +split); `order_source` manual/whatsapp/platform/quick_order/split.
- MED: paid→accepted→packed→out_for_delivery→delivered (+cancelled forward-only stepper).
- MR: pending→confirmed→packed→shipped→delivered (+cancelled); stock decrements at "packed".
- MVP: draft→placed→confirmed→dispatched→delivered (+cancelled); type PLATFORM/CIRCLE.
- DSW: pending/confirmed/processing/out-for-delivery/delivered/cancelled; incoming new/accepted/declined/modified.
- DMVP: statusFlow pending→packed→dispatched→out_for_delivery→delivered; seed also has confirmed/processing (bucketed as pending).
- SP: pending→packed→shipped→delivered (+cancelled); source stockist_created/pharmacy_submitted; synthetic filter `approved`.

- **ERP** ‹ERP›: Orders list — filters Pharmacy/Payment Status/Order Source + status tabs (All/Pending/Out-for-Delivery/Delivered/Cancelled). Desktop table (Order#/Pharmacy/Status/Payment/Delivery/Amount/Date/Actions). **OrderActionsDropdown**: Mark Paid (inserts approved confirmation `manual_mark_paid`), Partial Payment (validate ≤ due, confirmation `manual_partial`), Mark Delivered, Cancel (if paid>0 "₹X added as credit"). **OrderDetail**: 3 status cards, Order/Payment info (Subtotal=total−tax, Send Reminder→PaymentLinkDialog), Pharmacy details, Order Items + Edit Items (OrderItemsDialog). **OrderCreation**: Quick Add paste→`parse-order-message`; manual add (over-stock warning); SGST=tax/2, CGST=tax/2; Create Order `ORD-{ts}` confirmed/unpaid/pending, decrement stock, PaymentLinkDialog, recalc outstanding. **QuickOrderDialog** (`parse-order-message`, matchConfidence, taxRate 5/12 default12, `order_source='whatsapp'`). **QuickBillDialog** (untaxed). **BillUploadDialog** (`extract-bill-items`→`process-bill-image`). Realtime `orders-realtime-updates`.
- **HUB** ‹HUB, richest›: **StockistCreateOrder** (`parse-order-text`, credit-note select, credit-limit warning dialog, `ORD-`+base36, `rpc decrement_stock` per item **at creation**, mark credit note used, `rpc update_circle_outstanding`). **StockistOrders** (usePaginatedQuery 20, tabs All/Pending/Active/Done, **per-page counts**). **StockistOrderDetail** (richest): status flow, `updateStatus` on **packed → `rpc deduct_product_stock`** (⚠️ **double-deduct** with create-time decrement), on **delivered → autoPopulateInventory** (upsert into pharmacy_inventory). Cancel (restore stock if packed+). Edit items. Assign delivery staff (least-loaded). Partial Delivery (#30 `partial_delivery_items` JSON). Split Order (#31 child `-S`+base36). Return (#delivered → `order_returns` + credit_balance/outstanding + `credit_notes CN-`). Duplicate. Bill (generate). Print Packing Slip. Record Payment.
- **MED** ‹MED›: Orders (paginated 20, search current page). OrderDetail — **stockist can advance status** (5-node stepper `statusFlow.slice(currentIndex)`, forward-only). Items + Subtotal/Total GST/Grand Total footer.
- **MR** ‹MR›: Orders (`seller_id=user OR stockist_id=user`; **pharmacy buyers see nothing**). Tabs by role (MR Platform/Self-Added; others status). Order Detail dialog **status machine buttons**: Confirm→Mark Packed(**decrements stock**)→Generate Payment Link+Ship(tracking id)→Mark Delivered→Create Bill(MR). Payment Link dialog (requires upi_id, `generateUPILink`, WhatsApp). **OrderForm** (MR manual: Pharmacy select, Order Number, repeatable items; `get_next_order_number`→`ORD/0001`; no stock decrement).
- **MVP** ‹MVP›: OrderList (roleFilter, tabs, create buttons). OrderDetail (role-aware actions; stockist placed:Confirm/Cancel, confirmed:Dispatch, dispatched:Deliver; **auto generateInvoice on confirmed**; 1000ms delay). **CreateOrder** (offline toggle → confirmed+deduct; FEFO batch; tax 12%; no credit check). **QuickBill** 5-step WhatsApp→bill (parse, review, select pharmacy, edit, confirm; **confirmed CIRCLE** order + invoice; step-4 total shows subtotal w/o tax).
- **DSW** ‹DSW›: StockistOrders (tabs new/active/delivered/all, real counts). OrderDetail (`gstAmount=subtotal*0.18` hardcoded ≠ per-product; 6-option delivery RadioGroup, terminal disables; toast-only). CreateOrder ("AI Parsing" cosmetic, regex fuzzy match, gst 18%, toast). CreateBill (3-stage, real per-order totals, discount, GSTIN hardcoded `27AABCU9603R1ZM`, **wa.me wired**). Dialogs: QuickOrder, AcceptOrder (gst 12%), DeclineOrder, UpdateStatus, EditOrderItems, SharePaymentLink.
- **DMVP** ‹DMVP›: StockistOrders (**usePaginatedQuery `.filter()` ignored → shows ALL stockists' orders**; confirmed/cancelled fall into pending tab). **StockistOrderDetail** (~659 lines, lifecycle engine; all writes no-op): statusFlow, updateStatus (packed→`deduct_product_stock` null RPC), item edit, cancel, Partial Delivery, Split, Return (**never inserts order_returns**), Duplicate, View/Create Bill, Print Packing Slip, Record Payment; `canAssignStaff` computed but no UI. **CreateOrder** (`parse-order-text`→null; credit warn-allow; `ORD-`base36). All AI returns null → visible failures.
- **SP** ‹SP, orderService›: **CreateOrderPage** (admin, sessionStorage draft; line table [qty capped, rate editable, GST%], "Paste Order" WhatsApp parser regex+fuzzy, Select Pharmacy, **live credit widget**, Payment Mode credit/cash, client `computeGst` CGST/SGST or IGST, Draft Print / Save as Pending / Create & Pack). **`createOrder`**: prices at saleRate, `computeGst` per line, `ORD-YYYY-####` 3-attempt retry, credit mode requires active pharmacy + `exposure+total ≤ limit` (`CREDIT_LIMIT_EXCEEDED`). **finalizeOrder** (tx: reserve stock FEFO w/ rollback, status→packed, portal emit `order.packed`, credit → outstanding+=total, post sales ledger, generateBill). Ship (packed→shipped, carrier/awb, bill idempotent, emit). Deliver (portal requires bill else `BILL_REQUIRED`). Approve (pharmacy_submitted, credit check via connection limit, emit `order.accepted`, finalizeNow option). Reject (reason≥3). Cancel-approved. Cancel (blocked if bill exists `ORDER_HAS_BILL`; packed→release stock+outstanding−=). Generate bill. Initiate return (delivered only). Detail page stepper + Items&Stock + Manage Actions tabs. **AI order parse** `POST /orders/parse-text` (gated, no UI). `getPharmacyExposure` engine.

### 3.4 Pharmacies / Circle (seller's customer book)
- **ERP** ‹ERP›: Pharmacies list (`useCachedPharmacies`, realtime x3). Per-pharmacy financials (`calculateFinancials`: totalOutstanding, latestBillDue, pastDues, ordersPending). Card: Credit/Outstanding/Net Due(`max(0,outstanding−credit)`)/Latest Bill Due/Past Dues/Orders Pending. Row menu (View/Edit/Mark Active-Inactive/Delete[hard→soft fallback]). Payment actions: **Custom amount Submit** (credit-first FIFO), Create Order, Quick Bill, WhatsApp Reminder, **Mark Fully Paid**. Expandable orders (inline delivery_status Select, optimistic). **AddPharmacyDialog** fields: Pharmacy Name*, Full Name(Google Maps), Owner, Phone, Pin Code(6), GST*, License*("used as password for catalogue"), Credit Limit(0), Area, Address, Coordinates; inserts pharmacy_details(profile_id=stockist.id) + **placeholder order `INIT-{ts}`**. **PharmacyDetail** (recompute totals; tabs Orders/Bills/Reminders/Details; Send Reminder w/ hardcoded `pa=yourUPI@bank` stub). **StockistApprovals** (dual-approval: `stockist_approved`+`admin_approved`→insert pharmacy_details; only requests whose pin ∈ service_areas).
- **HUB** ‹HUB›: StockistPharmacies (`stockist_pharmacy_circle ⋈ pharmacy_profiles`; chips All/Outstanding/Credit/No Dues; **Net Due=outstanding−credit_balance**; Collect Payment; dropdown View/Edit/Record Order/Generate Bill/Remove). **StockistPharmacyDetail** (credit usage Progress; tabs Orders/Payments/Bills/**Ledger**[orders+payments+returns running balance]). **StockistPharmacyLedger** (separate route). **EditPharmacyDialog** (credit_limit, notes, is_blocked → notifies pharmacy). **StockistFindPharmacy** (addToCircle seeds 0/0/0).
- **MR** ‹MR›: Pharmacies (`mr_id=user`, rolled-up status critical>overdue>due_soon>pending). **PharmacyForm** (Name*/Phone*/License/Owner/Email/Address; no credit limit → falls to ₹100,000). **PharmacyDetail** (richest MR screen): Credit Limit(`max_credit_limit||100000`), utilizationPercent, Create Bill & Payment Request card (Bill#`MR/001`, Bill Date, Total, Upfront%, Terms; live `check_credit_limit` debounced; **display-only, not blocking**). Active Bills list (Update Payment/Send Reminder). **Only realtime channel** `pharmacy-bills-changes`. **MyCustomers** (stockist/dist; `seller_buyer_relationships`; **outstanding join bug** — bills by profile id vs pharmacies id). ⚠️ Money bug: due_amount=total−upfront AND received=upfront → remaining=total−2×upfront.
- **MVP** ‹MVP›: CirclePharmacies (tabs All/Outstanding/**Credit hardcoded 0**/No Dues; `getCreditData` outstanding=max(0,Σ−Σpaid), credit=`creditLimit||175000`; Collect Payment FIFO modal, cheque cast; Send Reminder modal [message-type & priority unused]). **CirclePharmacyDetail** (credit usage bar; tabs Orders/Payments/Bills[static]/Ledger; FIFO Collect Payment [**cheque→cash** fidelity loss]; Edit Credit modal real; Remove real). **FindPharmacy** (Add-to-Circle modal real; **Create New Pharmacy** modal → registerPharmacist forces pending but circle entry auto-joins; hardcoded state Maharashtra).
- **DSW** ‹DSW›: StockistPharmacies (tabs Circle(8)/All(20 — no list, only counts); chips; PharmacyCard dialogs; ConfirmDelete toast-only). **PharmacyDetail** (creditUsage Progress; Copy/Call/Map wired; tabs Orders/Payments/**Ledger hardcoded 5 rows**; Remove from Circle stub). SearchPharmacyDialog, AddToCircleDialog, EditPharmacyDialog.
- **DMVP** ‹DMVP›: StockistPharmacies (circle sp-001; chips; Net Due; kebab View/Edit/Record Order/Generate Bill/Remove). **StockistPharmacyDetail** (~528 lines; credit block; tabs Orders/Payments/Bills/**Ledger** — only place with real running balance incl order_returns[empty]). **StockistPharmacyLedger** (simpler). **StockistFindPharmacy** (addToCircle, dup 23505). EditPharmacyDialog (is_blocked → circle_status notification).
- **SP** ‹SP, `/pharmacies`›: List (search, Portal filter Connected/Manual, Status filter). **AddPharmacyModal** (SlideOver): Name*, Owner, GSTIN, State(08), **DL***, Credit Limit, Opening Balance, Payment Terms(COD/7/15/30), Phone*, Email, Address. Server `PharmacySchema` (creditLimit default `DEFAULT_CREDIT_LIMIT=50000`, terms 30). **Detail**: Edit/Deactivate/Record Payment; StatCards; Business Profile + Compliance; tabs Orders/Bills/**Ledger** (opening balance + Sundry Debtors + running balance; discrepancy banner; admin "Reconcile Outstanding" → recomputes from ledger)/Returns/Connection. Endpoints incl `:id/credit-info` (`getPharmacyExposure`), `:id/reconcile-outstanding`.

### 3.5 Payments / Approvals / Record (seller)
- **ERP** ‹ERP›: Payments (Total Outstanding dedup-by-pharmacy, Pending Invoices, Received This Month; tabs Pending Invoices [Send Reminder + Mark Paid] / Received). **PaymentApprovals** (realtime, animated "n Pending" badge; Review dialog Reject/Hold/Approve → `approve-reject-payment` edge fn).
- **HUB** ‹HUB›: **CollectPaymentDialog** (methods cash/upi/bank_transfer/cheque; **FIFO auto** or manual select; insert `payments` confirmed; outstanding non-atomic). **StockistRecordPayment** (`record-payment`; `update_circle_outstanding` atomic; #51 marks all unpaid paid if outstanding≤0). **StockistPayments** (Collected month/Outstanding/Approvals tabs; **Approvals** = delivery-staff collections `delivery_payment_status='pending_approval'`, Approve inserts payment+marks paid, Reject; WhatsApp Reminder dialog inserts `payment_reminders`).
- **MED** ‹MED›: Payments (paginated 20, table; whole row → PaymentDetail). PaymentDetail (Payment Info + Associated Order). All payments are **mock** (`mode:'mock'`).
- **MR** ‹MR›: Payments "Payment Reminders" (Send Payment Reminder card [Full Due/This Bill/Custom]; `payment_requests`; simulated PaymentProcessModal; **no server-side WhatsApp**). Recent Requests (Mark Paid). Bill status machine RPCs (Module 15).
- **MVP** ‹MVP›: StockistPayments (Collected/Outstanding/Bills StatCards; tabs payments/bills/approvals[**Approve toast-only**]; Bank Details Edit **unwired**; Send Reminder → `sendReminder` record + toast).
- **DSW** ‹DSW›: StockistPayments (KPI Outstanding/Pending/Received; tabs Outstanding/Pending Approvals[Approve/Hold/Reject toast]/All). CollectPaymentDialog (quick 25/50/Full, method, reference → toast).
- **DMVP** ‹DMVP›: StockistPayments (Record button → **unrouted /record-payment 404**; Collected month=₹0 (2025 seed); Approvals always empty [no join]; Send Reminder wa.me). CollectPaymentDialog (FIFO/manual, non-atomic direct outstanding write, never touches credit_balance).
- **SP** ‹SP, payments received›: **RecordPaymentModal** (SlideOver): Pharmacy, Outstanding banner, Amount*, Mode(upi/cash/bank/cheque), Reference (onBlur dedup `GET /payments/check-reference`), Date, **Bill Allocation** (checkbox+amount per bill, **Auto FIFO** button). `recordPayment` (non-cash requires unique reference `DUPLICATE_REFERENCE`; tx FIFO allocate; refuse over-allocation; outstanding-=; ledger method Dr/Debtors Cr; `PAY-#####`). Void (reverses, `voidPayment`).

### 3.6 Bills (seller)
- ERP: bill via BillUploadDialog / order flows (no dedicated bill entity page; uses orders).
- HUB ‹HUB›: **StockistBulkBill** (unbilled delivered orders → one `bills` per pharmacy `BILL-<ts>-<n>` status final, no GST). **BillPreviewDialog** ("TAX INVOICE" no CGST/SGST, QR to hardcoded lovable domain, insert status confirmed, outstanding+=total non-atomic, Print/PDF/WhatsApp). Payment status badge derived from orders.
- MED: bills implicit in order/payment.
- MR ‹MR›: **BillForm** (`/bills/new`, hard-blocks if `dueAmount > max_credit_limit`; **rolls previous_due into due_amount** double-count bug; terms 30). QuickBillModal/QuickOrderModal (create bills, **line items NOT persisted**).
- MVP: bills via QuickBill + invoices on confirm.
- DSW: CreateBill / QuickBillDialog (3-stage, GSTIN hardcoded, wa.me wired).
- DMVP ‹DMVP›: BulkBill (delivered orders → status "final"), PurchaseBillHistory (badge checks "finalized" never matches), BillPreviewDialog (status "confirmed", QR lineage domain), QuickBillDialog. **Bill status chaos** across creators/readers (confirmed/final/finalized vs seed paid/draft/sent).
- SP ‹SP, billService›: **generateBill** idempotent (unique index `bills.order_id`, GST per line, `INV-YYYY-####`, dueDate=billDate+paymentTermsDays; portal emits `bill.generated` w/ line items). **Overdue derived not stored** (`markOverdueBills` no-op). List (status All/Paid/Partial/Unpaid/Overdue; displayStatus). **Detail** printable `#invoice-content` ("IGST INVOICE" vs "GST INVOICE"; Payments Allocated table; **no QR**). Actions: Initiate Return, Record Payment, **Send WhatsApp** (rasterize PDF → `POST /communication/send-bill`), Print, **Override Status** (admin/biller Mark unpaid/paid). `PATCH /:id/status`.

### 3.7 Returns / Credit Notes (seller)
- ERP: via orders (cancel adds credit).
- HUB ‹HUB›: **StockistReturns** (tabs Requests/Process/History/Credits; Approve restocks + credit_balance/outstanding + credit_note; Process return from delivered → FIFO restock to earliest-expiry batch). **StockistCreditNotes** list. **StockistManufacturerReturns** (`manufacturer_returns` via as-any; status pending/shipped/received/credited/rejected; Mark Credited via `window.prompt`).
- MR: order returns via status; no dedicated seller-return page (buyer requests).
- MVP ‹MVP›: return approval in OrderDetail (`approveReturn` mints CreditNote, **never consumed later**).
- DSW: CreateReturnDialog (orphaned, toast).
- SP ‹SP, returnService›: **Returns list** (source manual/portal). **InitiateReturnModal** (per returnable line, batch select, reason expired/damaged/wrong_item/cancelled/other; `RET-####` status requested). **processReturn** (restock only wrong_item/cancelled; GST-inclusive credit; reduces linked bill + `payment_allocations`; outstanding-=; ledger Sales-Returns Dr/GST-output Dr/Debtors Cr; portal emit `return.processed`). rejectReturn.

### 3.8 Suppliers / Purchases (procurement) ‹SP, MR, MVP-stub›
- **SP** ‹SP›: **Purchases/GRN** (`/purchase-bills`): List (search, supplier, status pending/received, `?procureProductId` deep-link). **UploadBillModal** (Upload PDF AI `POST /purchases/parse` Gemini / Manual Entry; per-line product/Batch*/Expiry/Qty*/Free/MRP*/Rate*/GST; invoice base64 → `invoiceFileUrl`; `productsNeedingSaleRate` → SetSaleRatesModal). `createPurchase` (findOrCreateProductFromLine; `GRN-YYYY-####` pending). `receivePurchase` (refuse if saleRate≤0; `receiveStock` per line upsert batch; Inventory Dr/GST-input Dr/Creditors Cr). **Suppliers** (`/suppliers`): AddSupplierModal (Name*/Contact*/GST/DL/Phone*/Email/State*/Terms/Address*); Detail (Info/Purchases/Ledger; Record Payment `SPAY-#####` Creditors Dr/method Cr). **Required Stock** (Σ on-hand < minStockLevel; Procure deep-link).
- MR ‹MR›: seller side has no purchase module (buyers create POs).
- MVP ‹MVP›: PurchaseBills page = **stub** (file ignored, mock items, local list only).

### 3.9 Delivery config / Reports / Analytics / Staff / Profile (seller) — see Modules 16 (delivery), 12/reports below
- **ERP** ‹ERP›: **DeliverySettings** (tabs Delivery Dates / Service Areas / Delivery Fees — see Module 16). **Analytics** (KPI Revenue/Orders/**Active Pharmacies counts ALL not scoped bug**/Products; Recharts Revenue Trends/Order Analysis/Top Pharmacies). **Route Execution** + MapRouteDialog (Module 11). **Batch Ordering** (`order_batch_cycles`, `create-batch-cycle`). **StockistProfile** (tabs Personal/Bank/Business/Catalogue[shareable slug]/Areas).
- **HUB** ‹HUB›: **StockistReports** (13 report defs H1/Schedule H/HNX/NDPS/Narcotic/Tramadol/GST/etc; client XLSX; **GST report reads unpopulated bills.gst_amount → 0`). **StockistExportData** (CSV/Excel/**PDF stub emits xlsx**). **StockistExportCatalogue**. **StockistAnalytics** (real recharts; Stock Value by category `Σ stock×purchase_rate`). **StockistStaffManagement/Form** (`delivery_staff`; password via `rpc hash_password` **plaintext fallback**). **StockistServiceableAreas**, **StockistDeliveryRoutes** (Google Maps URL), **StockistHolidays** (`stockist_holidays` allow_preorder, notifies circle). **StockistProfileSettings/BusinessDetails**.
- MED ‹MED›: DeliveryAndDates (tabs Dates[**never loads on mount bug**]/Serviceable Areas/Delivery Fees). Profile (no validation).
- MR ‹MR›: Analytics (seller, real charts + mock AdvancedReports + hardcoded InventoryAlerts). Reports (Sales/Payments/Inventory functional; Customer/Route stubs; CSV real, **PDF stub**). DeliveryPlanner (**simulated** distance random 10-59, no maps API). Settings (only General save works).
- MVP ‹MVP›: DeliverySetup (real areas+slots), HolidayManagement (real), Reports (7 hardcoded, Download toast), Analytics (**100% mock**), StockistProfile (edits toast), SubscriptionPage (upgrade toast).
- DSW ‹DSW›: Analytics (mixed real/hardcoded), operational pages (Credit Notes/Routes/Purchase Orders/Staff/Reports/Documents/Messages/Notifications — page-local arrays, mostly toast, some local-real), Settings (Profile/Business/Security/App — **theme toggle inert**, OTP accepts any 6-digit).
- DMVP ‹DMVP›: ExportCatalogue (real XLSX), Notifications, Profile/Business/Settings/Privacy/Help (mock backend, deletes toast-only). **More menu ~15 unrouted links → 404**.
- SP ‹SP›: **Reports** hub (Sales/Outstanding/GST/Profit/Stock Ageing/Compliance/Portal Orders/Purchase Analysis — real, role-gated; Recharts; master CSV digest). **Audit Logs** (admin). **Settings** (Business info, Connections[invite code, requests, active], Public Profile, Staff/Users[roles admin,biller], Order Defaults[auto-approve toggle], Catalog Sync, Security, Notifications, System). **Required Stock**. Staff via Settings users (no separate delivery-staff role).

---

## Module 4 — Pharmacy: B2B purchase (buyer)

> Superset of pages: **Dashboard · Browse/Discover stockists · Stockist catalogue/storefront · Cart · Checkout · Orders (list, detail) · Payments/Ledger · Inventory (buyer's own) · Smart/Quick order · Financials/Analytics · Profile · Purchase Orders/GRN (SP)**.

### 4.1 Dashboard
- **ERP** ‹ERP›: `/pharmacy/portal` (resolve by `auth_profile_id`, realtime pharmacy_inventory+orders). KPIs Inventory Value(`Σ qty×unit_price`), Low Stock(≤threshold), Expiring Soon(≤30d), Orders This Month. Quick Actions Manage Inventory/Browse/My Orders/Analytics.
- **HUB** ‹HUB›: PharmacyDashboard (one 8-parallel `pharmacyDashStats`): activeB2BOrders, totalPurchase, pendingPayments, connectedStockists, inventoryItems, lowStockCount, expiringCount + sale metrics. Renders **PurchaseDashboard** (alert cards, 5 KPIs, 8 quick actions, `ReorderSuggestions`, recent B2B) vs SaleDashboard.
- **MED** ‹MED›: KPIs Total Orders, Pending Deliveries(`≠delivered`), Spent(month), Cart card (live). Smart Order promo; Sign Out.
- **MR** ‹MR›: hero "Welcome to PharmaMR Marketplace" + decorative search. KPIs Pending Orders, Total Spent, Favorite Suppliers, Total Orders. **OTC Overview** (value/items/**Potential Earnings 5%**). Featured Sellers (live+verified). Quick Actions (My Suppliers→**/suppliers dead link**).
- **MVP** ‹MVP›: PharmacistDashboard — 4 StatCards (Pending Orders, Due Payments `outstanding/1000K`, Connected Stockists, Recent Purchases; **trends hardcoded**), 6 Quick Actions (Cart badge).
- **DSW** ‹DSW›: PharmacyHome — read-only search; Quick Actions Smart Order/Compare/Reorder/Offers; **KPI row all hardcoded** (Spent ₹2,45,000/Savings ₹18,500/Active 3/Delivered 24).
- **DMVP** ‹DMVP›: PharmacyDashboard (DEMO_ORDERS pp-001): Active Orders(2), Total Purchase, Pending Payments, **Connected Stockists hardcoded 3**; Recent Orders(5).
- **SP** ‹SP›: `getPharmacyDashboardKpis` — Today's/Month Retail Sales, Pending POs, Payables Outstanding, Low Stock, Awaiting GRN; quick actions New Sale/Place Order/Receive GRN/Record Payment; widgets Recent POs + Expiring Soon(≤90d hidden cashier).

### 4.2 Browse / Discover stockists
- **ERP** ‹ERP›: Browse Stockists (search; product count, next delivery; **PIN-serving stockists sorted first**). StockistCatalogue (CATEGORIES; products is_active&stock>0; discount%=round((mrp-sale)/mrp×100); qty stepper MOQ..stock; Add/Update Cart ring-highlight).
- **HUB** ‹HUB›: PharmacyBrowse/Stockists/FindStockist (`addToCircle` seeds circle). Ordering page `comparePrice()`=**Math.random() placeholder**, Add-to-Cart **unwired**.
- **MED** ‹MED›: Stockists (**N+1 queries**). Catalogue (tabs Products/Stockists; grouped by lowercased name→ProductCard per stockist variant). StockistCatalogue embedded Smart Order (**dead alternatives query, no cart**). QuantitySelector clamped [moq,maxStock].
- **MR** ‹MR›: Marketplace (**no is_catalogue_live filter**; pills All/MR/Stockist/Distributor/Verified/Live; **4.5 hardcoded**; Heart favorite). MarketplaceProducts (`is_available`; **seller-locked cart**; seller-type filter **MR bug**). SellerDetail (**cart-lock NOT enforced**, local count).
- **MVP** ‹MVP›: FindStockist (Connect real). PharmacistStockists (Outstanding per; holiday chip). BrowseMedicines (**connected only**; Rx=Antibiotic; **Low Stock <10**; "Delivery +2 days" hardcoded; FIFO). PharmacistStockistDetail (catalog **global bug**, Low Stock `<100` inconsistent, batches[0]).
- **DSW** ‹DSW›: PharmacyBrowse (categories/top-rated/popular). PharmacyStockists (**page-local hardcoded 4, not clickable**). PharmacyStockistDetail (tabs Products/**Reviews "coming soon"**). PharmacyProducts/ProductDetail (getBestPrice inline; price comparison per stockist).
- **DMVP** ‹DMVP›: PharmacyStockistDetail storefront+cart (blocked banner; **A12 hard credit block**). Stockists/FindStockist(serviceable PIN)/Browse.
- **SP** ‹SP›: **Discover** (unauth `GET /api/public/stockists` 60/min). Public profile `:slug` (**no PTR** C12; Request Connection). Connected Stockists (ConnectStockistModal invite/GSTIN; **7-day cooldown** `REQUEST_COOLDOWN`). Detail tabs Overview/Catalog[Map Local Product, Create from catalog]/Orders/Bills/Ledger.

### 4.3 Cart
- **ERP** ‹ERP›: CartContext (persist `${role}_cart_${userId}`). `/pharmacy/cart` grouped by stockist, per-stockist subtotal+Remove All, stepper 1..maxStock, "Delivery Fees: Calculated at checkout", **Total `₹X+`**.
- **HUB** ‹HUB›: `useCart` (`digi_swasthya_cart`, **single-pharmacy enforced**; hasPrescriptionItems). Cart-based ordering in StockistDetail.
- **MED** ‹MED›: Cart (localStorage `cart`; grouped; `updateQuantity` async fire-and-forget re-fetch; Total PRE-GST; addToCart reject OOS/moq/over-stock).
- **MR** ‹MR›: Cart (`/cart` **no Layout**; `cart_items`; grouped by seller; discountedPrice; no GST).
- **MVP** ‹MVP›: Cart (Subtotal/Tax12%/Total; not grouped).
- **DSW** ‹DSW›: PharmacyCart (**hardcoded 3, all no-ops**).
- **DMVP** ‹DMVP›: ephemeral React state (no localStorage); floating bar; "nearing credit limit" 0.8×.
- SP ‹—›: no cart (POs).

### 4.4 Checkout & placement
- **ERP** ‹ERP›: **separate order per stockist group**; Subtotal + **GST 5%** + Delivery Fee (`calculate-delivery-fee`, fallback `≥5000?0:50`); Place Order `ORD-{ts}` `order_source=pharmacy_portal`, `rpc deduct_stock`; Place All loops.
- **HUB** ‹HUB›: StockistDetail placement (`orderingBlocked=is_blocked||holiday&&!allow_preorder`; **credit block** if `outstanding+cartTotal>limit`, warn>80%; order_source platform, `update_circle_outstanding(+total)`, **no stock deduction B2B**).
- **MED** ‹MED›: per-group Subtotal+GST(`Σ price×qty×gst%/100`) **no fee**; **mock payment** 2s+`random>0.05`; pre-payment stock re-check; per-group insert orders[paid]/items[snapshots]/payments[mock]+`rpc deduct_stock`; **manual rollback ladder**.
- **MR** ‹MR›: single-seller; **client-side `ORD/count+1`** race; `pharmacy_id=buyer profile id` bug; no decrement/GST.
- **MVP** ‹MVP›: groups by stockist PLATFORM/CIRCLE; Delivery Address, **4 hardcoded slots UI-only**, notes not persisted; Pay Now/Pay Later credit; per-CIRCLE credit check; **simulated UPI** 2s; one order per stockist.
- **DSW** ‹DSW›: subtotal + **gst 18%** + fee 0; hardcoded `#ORD-2025-0042`; toast.
- **DMVP** ‹DMVP›: placeOrder StockistDetail (**hard credit block A12**; `PH{last8}` platform; `rpc +cartTotal` no-op).
- SP ‹—›: no B2B checkout (POs, §4.7).

### 4.5 Orders (buyer)
- **ERP** ‹ERP›: search + status filter; collapsible cards net_amount+Due; items+summary.
- **HUB** ‹HUB›: PharmacyOrders (mode-gated). Detail (Duplicate, **Verify Received Quantities** no stock adjust, Request Return, invoice PDF). PharmacyLedger, **PharmacyRecurringOrders** (`recurring_orders` **no scheduler, inert**), Reorder/QuickOrder history.
- **MED** ‹MED›: paginated 20. Detail **"Mark as Received"** only when out_for_delivery.
- **MR** ‹MR›: buyers see orders only via My Suppliers (Orders page = seller view only — **buyer bug**).
- **MVP** ‹MVP›: OrderList (pharmacist=placedBy). Detail (Cancel placed/confirmed; Request Return; Reorder; Add Payment; Edit Items placed-only).
- **DSW** ‹DSW›: PharmacyOrders (**hardcoded 3, only All renders**). Detail (timeline; Rate/Report/Contact gated).
- **DMVP** ‹DMVP›: Orders (pp-001, exact status tabs, sort cycle). Detail (Duplicate; **Download Invoice** delivered real; **Verify Received Quantities** discrepancy notify).
- SP ‹SP›: buyer orders = mirror `orders` on stockist tenant; viewed via PO detail.

### 4.6 Buyer's own inventory
- **ERP** ‹ERP›: Inventory table (badges; **Add/Edit unwired**). Analytics tiles. Financials (Outstanding/Credit/Purchases/Avg).
- **HUB** ‹HUB›: PharmacyInventory (`SharedProductCard`; value `Σ qty×(purchase_rate||price)`; Bulk Price). InventoryForm (AI Auto-Fill, counterfeit banner, `is_visible_to_customers` default true). **PharmacyBulkImport** (circle stockist→their products→insert qty:0 hidden; **primary manual population**). StockAudit, ExpiryManagement, InventoryAuditLog (reads nonexistent `selling_price`).
- **MVP** ‹MVP›: PharmacistInventory (read-only, auto-populated on delivery; All/Expiring≤90).
- **SP** ‹SP›: shared Products (owns catalog + GRN products); Expiry Alerts ≤90d.

### 4.7 Purchase Orders / GRN ‹SP dedicated; MR PO≈order›
- **SP** ‹SP›: **Purchase Orders** (11-state draft→submitted→accepted/rejected→packed→shipped→delivered→partially_received→received +cancel_requested/cancelled). CreatePurchaseOrderPage (2-step; Add from catalog; **credit bar blocks Submit**). `submitPurchaseOrder` (**every product still in catalog else `CATALOG_DRIFT`**; credit check; tx **creates mirror `orders` on stockist tenant** source pharmacy_submitted; emit `order.submitted`; auto-approve if `autoApprovePortalOrders`). Cancel semantics (accepted→cancel_requested). **GRN** (ReceiveGrnModal auto-build from pending, auto-create products from catalog, **Idempotency-Key**; `createGrn` cumulative ≤ pending `OVER_RECEIVE`, expiry>receivedDate `EXPIRED_BATCH`, `PGRN-YYYY-####`, Inventory Dr/GRN_CLEARING Cr; **10-min idempotency cache**).
- MR ‹MR›: OrderForm creates PO-like `orders`; no GRN.

---

## Module 5 — Pharmacy: B2C sale

> HUB (dual-mode sale), SP (retail POS), DSW (sale view), MR (OTC only). Absent: ERP, MED, MVP, DMVP.

- **HUB** ‹HUB›: Sale nav Dashboard/customer-orders/customer-list/Inventory. **B2C flow** pending→confirmed→preparing→ready_for_pickup→out_for_delivery→delivered. **PharmacyCustomerOrderDetail**: confirmed→`rpc deduct_pharmacy_inventory`, cancelled→restock by name, delivered→`calculateCommissions`+delivered_at. Prescription gate (Verify/Reject). UPI verification (claimed). Item pricing editable (Add/Remove/Set Total/Auto-Price/Substitute/Check Stock partial). Assign staff. **B2CBillGenerator** ("TAX INVOICE" no tax; QR `verify-bill/customer-${id}`). CustomerList/Detail. **PharmacyCustomerReturns** (Approve&Refund `Σ price×qty`; **no restock**). SaleDashboard (7 KPIs, 8 quick actions).
- **SP** ‹SP›: **PosPage** (search Enter/barcode; Rx badge; FEFO batch capped; qty ±/Disc%/remove; Customer[walk-in]; **Split payment** OR method + change; **Rx block** for scheduled: Rx#*/Doctor*/reg#/Patient*/age). `createRetailSale` (**Rx capture C26** `RX_REQUIRED` schedule H/H1/X/NDPS; **GST-inclusive** `lineTax=sub×gst/(100+gst)`; explicit batchId or FEFO; split=total±0.02 `SPLIT_MISMATCH`; `SALE-YYYY-####`; cash-sale ledger). SalesHistory+SaleDetail(auto-print). **Void** (admin same-day, restock, reversing ledger). Customers (Add Name*/Phone; cashier can create).
- **DSW** ‹DSW›: SaleDashboard (Go Live/New Sale/Consult/Reports; live Switch; Today ₹0 runtime). SaleInventory (**Add "coming soon"**). SaleCustomers/Detail (**Call/New Order no-op**). Consultations/Detail, StartConsultation (4-step **voice sim setTimeout(3000)**). SaleReports (period cosmetic). Doctor Connect (toast). Live Settings (radius slider, fee — toast). Dialogs SaleOrder/GoLive/RecordPatient/StartConsultation.
- **MR** ‹MR›: **OTCPartnership** (`pharmacy_otc_subscriptions`/`otc_subscription_plans` as-any; active summary OR 3-step wizard plan/brands[≤max_brands]/review→dummy payment; **`initialize-otc-inventory` never invoked → empty**; flat 5% commission).

---

## Module 6 — Pharmacy: Public Catalogue (unauthenticated ordering)

> Full public ordering: **ERP**. Discover-only (no unauth ordering): HUB, SP. Absent: MED, MR, MVP, DSW, DMVP.

- **ERP** ‹ERP, PharmacyContext + PharmacySessionContext(20-min), no login›:
  - **License Verification** (`/catalogue/:slug`): OnboardingCarousel; Drug License Number* (case/symbol-insensitive) + PIN(opt 6) → `verify-pharmacy-license` (rate-limited 5/15min); verified → set context + dashboard; attempts remaining.
  - **Catalogue Dashboard**: latest balance, `get-pharmacy-outstanding-orders`, last 5 confirmations; realtime; Credit panel, Outstanding, **Net Amount Due=max(0,outstanding−credit)**; **Mark Payment**→dialog; **UPI QR** if upi_id; Payment Requests history; Outstanding Orders breakdown; Recent Orders; Logout→clearSession.
  - **Catalogue** (`/products`): is_active; search(name/brand/generic)+category+sort; stepper min1; cart carries `gst_percentage||5`.
  - **Orders** (`/orders`): platform orders; realtime.
  - **Checkout**: **per-item GST** (`tax=sub×gst%/100`; **no fee**); Place Order → OrderConfirmationDialog ("requires stockist approval") → `create-platform-order`; success bill summary + **integrated UPI** (Pay This Order/Pay Total Outstanding/Custom → UpiQrCode + `upi://pay?pa=...` deep link).
  - **MarkPaymentDialog** (Full/Custom/Specific Order → `mark-payment-paid` **pending** confirmation).
  - **Public Pharmacy Registration** (`/pharmacy-registration`): Basic/Contact/Location/Docs(→`bills` bucket) → `pharmacy_registration_requests` pending.
- **HUB** ‹HUB, partial›: public discover cards; **VerifyBill** public (`/verify-bill/:billId`).
- **SP** ‹SP, partial›: public API `/stockists`, `/stockists/:slug`, `/:slug/catalog` (≤20, **no PTR**), `/verify-bill/:id` (non-sensitive; **no scan UI/QR on invoice**). Request Connection from public profile.

---

## Module 7 — Seller variants (MR / Distributor)

> MR role present in: **ERP** (light) and **MR** (full). Distributor: **MR** only.

- **ERP — MR module** ‹ERP›: MRLayout bottom nav Dashboard/Pharmacies/Collections/Analytics/Profile.
  - **MROnboarding**: License Number*, Your Name*(mr_name), Company Name*, Phone, Address; slug `slugify+Date.now()`.
  - **Pharmacies** (`/mr/pharmacies`=dashboard default): lists only **visited** pharmacies (from `mr_pharmacy_visits`); **Record Visit** inserts visit; **Add Pharmacy unwired**.
  - **Collections**: Total Collected(`Σ mr_order_commissions.commission_amount`), **Target ₹50,000 hardcoded**; Record Collection → `toast "Demo"` **not persisted**.
  - **Analytics**: Total Visits, Orders Placed(=commissions), Total Commission, **Conversion Rate=commissions/visits×100**.
  - **Profile**: Personal/Company/Stats.
- **MR — MR/Stockist/Distributor sellers** ‹MR›: single **SellerDashboard** branches by role (§3.1). Distinctions:
  - **MR:** subtitle `Brand: {business_type}`; Products filtered to `brand_name=business_type`; header QuickBill+QuickOrder+OCR; KPI Total Revenue=`Σ bills.received_amount` (pharmacies.mr_id join), Pending Payments=`Σ(due−received)`, Active Pharmacies, Products (brand only). Owns Pharmacies list, PharmacyDetail (bill+payment-request engine), BillForm, Payments/Reminders, DeliveryPlanner (simulated), OrderForm.
  - **Stockist/Distributor:** subtitle "Multi-brand"/"Manage inventory & customers"; header OCR+BulkUpload; KPI Total Revenue=`Σ orders.total_amount where delivered`, Pending Orders, **Customers**=`seller_buyer_relationships` split stockist/pharmacy, Products (distinct brand count). Owns MyCustomers, MyProducts, Orders (status machine w/ stock decrement at packed), ProductForm.
  - **Distributor extra:** signup Service Areas (comma cities); ProductForm `seller_type="distributor"`; MyCustomers has Stockists tab.
  - **ProductForm brand lock:** MR brand Select disabled/locked to `business_type`.
  - **Bugs:** MR products saved `seller_type="stockist"` (marketplace MR filter never matches); MyCustomers outstanding joins bills by profile id vs pharmacies id.

---

## Module 8 — Patient / Customer

> Patient/Customer B2C present in: **ERP** (patient), **HUB** (customer + doctor consults), **DSW** (patient), **SP** (POS customers only — see §5). Absent: MED, MR, MVP, DMVP.

- **ERP — Patient** ‹ERP›: PatientLayout (bottom nav Home/Search/Prescriptions/Wishlist/Profile). Resolves `patient_details` by profile_id.
  - **Dashboard**: KPIs Active Orders(`patient_orders ∉{delivered,cancelled}`), Prescriptions(active), Wishlist, Pending Refills(`patient_refill_reminders` next≤today). Recent orders; Quick actions Search/Compare; cards Prescription Vault/AI Assistant/Wishlist.
  - **Medicine Search**: OR filter name/brand/**generic** limit20; heart icon **unwired**.
  - **Price Comparison**: ilike product_name, sorted selling_price; first=green BEST PRICE; **Star 4.5 & ~45min hardcoded**; Add to Cart=toast **stub**; **queries columns (`product_name`/`selling_price`) not matching schema → likely empty**.
  - **Checkout**: address RadioGroup, Delivery Slot, Payment(COD/UPI/Card), notes; **Place Order = toast "demo", no write**.
  - **Prescription Vault**: upload → `prescriptions` bucket; **no OCR**; "Order from Prescription" **unwired**.
  - **Wishlist**: list, remove optimistic; **Add to Cart unwired**.
  - **Orders**: history; status color map; items first 3.
  - **AI Assistant**: disclaimer; symptoms → `ai-symptom-checker` (sends `{symptoms}` only); renders Conditions/Recommendations/OTC; **field-name mismatch vs edge fn → sections empty**.
  - **Profile**: tabs Personal/Health(Blood Group, Allergies, Emergency)/Addresses(set default, delete).
  - **PatientSignup.tsx** orphaned (blood group free-text vs Select).
- **HUB — Customer** ‹HUB›: identity `customer_profiles.id`. Cart via `useCart` single-pharmacy.
  - **Dashboard**: **profile-completion** prompt (≥5/6 fields); Active Orders, Health summary, Reminder alert(localStorage), Upcoming Consultations, Recent Orders/Prescriptions; nearbyCount(`pharmacy_serviceable_areas` by pin); 8 QuickActions.
  - **CustomerPharmacies** (from serviceable areas, same PIN first + reviews avg + delivery charge). **CustomerPharmacyDetail** (products `is_visible_to_customers && quantity>0`; **inline order** `CO-<base36>` **raw total no GST/fee**; blocks Rx items). **CustomerMedicineSearch** (`pharmacy_inventory` ilike grouped). **CustomerCart** (hardcoded "Delivery: Free" display).
  - **CustomerCheckout** (**real path**): fee from `pharmacy_profiles.delivery_fee` (0 if ≥free_above); **GST hardcoded 5%**; grandTotal=total+fee+gst; Payment cash/pay_at_store/upi; **UPI proof upload** (static "15-min" banner **no timer**); prescription upload if hasPrescriptionItems (both signed 24h); inserts `customer_orders` (payment_status upi?"claimed":"unpaid").
  - **Orders/Detail** (stepper; "I've Paid"→claimed; Cancel `CANCEL_REASONS` 6 → `rpc restore_pharmacy_inventory`; Reorder; Request Return; **Rate & Review inserts into `reviews` but read from `customer_reviews` → never surface**; Download Invoice). OrderTracking (polls 15s). ReturnRequest (`customer_returns` pending). 
  - **Prescriptions/Detail** ("Order All Items" price:0 Rx; #136 auto-find pharmacies; Share/PDF). **PrescriptionUpload** (`prescription` order_type; **raw path no signed URL, NO OCR**). **BookConsultation** (audio/video/clinic; **free date/time ignores doctor_availability, no double-book**; fee by type; demo payment self-attested). **ConsultationDetail** (duration timer; Join/Reschedule/Cancel; Order Prescription Items; Chat). **MedicineReminders** (**localStorage-only**, setTimeout <24h). HealthProfile, Wishlist, Addresses, QuickOrder (voice `webkitSpeechRecognition` en-IN), PastDoctors.
- **DSW — Patient** ‹DSW›: PatientLayout (bottom nav Home/Search/Rx/Orders/More). Generated mock (100 patients, 200 orders, 150 Rx, 100 consults, 50 pharmacies).
  - **Dashboard**: greeting "Hello, Rahul!"; **KPI all hardcoded** (Active 3/Rx 5/Wishlist 12/Refill 2); Quick Actions Upload Rx/Book Consult/Wishlist; Recent Orders; Nearby Pharmacies → **404 links**; **Refill Reminders hardcoded**.
  - **Search** (`getLiveInventoryForPatients` random-jitter prices; getLowestPrice; cards → **/patient/medicines/:id 404**; **Add to Cart toast; Filter no-op**).
  - **Prescriptions** ("Prescription Vault"; cards → **/patient/prescriptions/:id 404**; Order → /search).
  - **Orders** (list → detail). **OrderDetail** (**fully hardcoded ORD-P-001, ignores id**; Contact/Rate toast).
  - **Consultations** (**hardcoded 4 not the 100; Book New no handler**). **ConsultationDetail** (**hardcoded CONS-001 ignores id**; Download/Rate toast; Order Medicines → /search).
  - **Wishlist** (**hardcoded 2, no handlers**). Profile/More/Help (hardcoded; some 404 links; Help search **not wired**). Settings (Profile toast; Medical real-local chips; Security toast).
  - Dialogs: BookConsultation (3-step, toast), UploadPrescription (**no OCR/real upload**, claims AI).
- **SP — POS customers** ‹SP›: see §5 (customer CRUD, walk-in default).

---

## Module 9 — Doctor

> Present in: **HUB** (full teleconsult + commissions), **ERP** (patient-side AI only, no doctor role UI beyond schema), **DSW** (doctor view, mock). Absent: MED, MR, MVP, DMVP.

- **HUB — Doctor** ‹HUB›: identity `doctor_profiles.id`; nav Dashboard/Sessions/Patients/Rx/More.
  - **Dashboard** (`doctorStats`): Today's Sessions, Total Patients, **Total Earnings = paid consultation fees + Σ commission earnings**, Pending Sessions; Earnings breakdown (consultation vs referral); Review summary; Today's Schedule; Follow-ups.
  - **Consultations/Detail**: status booked→in_progress→completed (notify patient each); **meeting link manually pasted** (Meet/Zoom); Mark Payment Paid; Reschedule/Cancel; Write Prescription; Follow-up scheduling. 
  - **DoctorPrescriptionWriter**: walk-in patient search; per-item medicine search vs target pharmacy inventory; insert `prescriptions`+`prescription_items`+notify. Templates CRUD. Prescriptions/Detail (inline edit = delete+reinsert).
  - **DoctorAvailability** (7 days × slots; save=delete-all+re-insert; **never read by booking**). **DoctorEarnings** (**paid consultation fees only, excludes commissions — diverges from dashboard**; recharts). **DoctorPharmacies** (`sendRequest` → `doctor_pharmacy_partnerships` pending, `default_commission_pct:5`). **PartnershipDetail** (edit default %, add/delete `doctor_commission_rules` product/brand/category). Patients/Detail, Analytics, Profile (avatar→`public-assets`), Settings.
- **ERP** ‹ERP, partial›: no doctor role UI; only patient AI Assistant (`ai-symptom-checker`). Doctor concepts absent from routes.
- **DSW — Doctor** ‹DSW›: DoctorLayout (bottom nav Dashboard/Appointments/Patients/Rx/More). Mock (60 doctors, 23 appts, 16 Rx, 31 earnings, 50 patients).
  - **Dashboard**: greeting "Dr. Sharma"; KPIs Today(0 runtime)/Pending/Earnings/**Patients "50" hardcoded**; Earnings (+12% hardcoded); Upcoming/Recent.
  - **Appointments** (tabs; **Start=toast only**; View→detail). **AppointmentDetail** (**Start Call toast + Prescribe → /doctor/prescriptions/new 404**; View Prescription → 404).
  - **Patients/Detail** (Start Consult toast; **Call no-op**). **Prescriptions** (Download toast). **Earnings** (Withdraw toast; **This Month hardcoded**). More (several 404). Settings: Profile(toast), **Availability real-local slots**, **Bank (routed but unlinked; balances hardcoded; Withdraw no-op)**.
  - **WritePrescriptionDialog** orphaned (Prescribe navigates to non-existent route → **doctor Rx creation effectively unimplemented**).

---

## Module 10 — Brand

> Present in: **ERP** only. Absent: all others.

- **ERP — Brand** ‹ERP›: BrandLayout (top nav hamburger Sheet + "Brand Portal" + NotificationBell). Dashboard gated on `is_verified`.
  - **BrandOnboarding**: Brand Name*, Company Name*, Contact Person, Phone, Email, GSTIN, Manufacturing License, Address; insert `brand_details{is_verified:false, is_active:true}`.
  - **Dashboard**: if `!is_verified` → pending-verification Alert (blocks rest); verified → green badge. KPIs Total Orders(`brand_orders`), Revenue(`Σ total_amount`), active Products(`brand_products`), active/scheduled Campaigns. Quick actions Manage Products/Campaigns/Fulfilment.
  - **Products**: `brand_products` cards; **Add Product** dialog (Product Name*, Generic, SKU*, Batch*, MRP*, Selling Price*, Stock Qty → insert); **Edit/Delete unwired**.
  - **Campaigns**: `brand_campaigns` cards; **Create Campaign** (Name*, Description, Discount%, Budget, Start*, End*; `campaign_type` hardcoded "discount"; status "draft"); **View Analytics unwired**.
  - **Analytics**: Total Revenue, Total Orders, Active Products, **Growth Rate hardcoded 24.5%**.
  - **Fulfilment**: Active Orders, Pharmacy Partners (unique), **Avg Delivery Time 45min hardcoded**, **Success Rate 98.5% hardcoded**.
  - **Profile**: Company/License/Stats + verification badge.
  - **BrandSignup.tsx** orphaned (no route). `brand_batch_verification` table supports anti-counterfeit/recall (data model only).

---

## Module 11 — Delivery Staff

> Full staff module: **HUB**. Route-execution/collection surrogate: **ERP** (stockist-driven). Absent: MED, MR, MVP, DSW, DMVP, SP (SP has staff *roles* but no delivery-app; see §2/§12).

- **HUB — Delivery Staff** ‹HUB, separate credential system›:
  - **StaffLogin** (`/staff/login`): username/password → `rpc verify_staff_credentials` called twice (stockist then pharmacy); session `localStorage.staff_session {id,name,stockist_id|pharmacy_id,store_name,staff_type,_verified,loginAt}`.
  - **StaffDashboard** (`SESSION_TTL_MS=24h`; validateSession re-checks server-side `delivery_staff`/`pharmacy_delivery_staff` is_active). Orders: stockist staff → `orders assigned_staff_id` status∈{packed,dispatched,out_for_delivery}; pharmacy staff → `customer_orders` status∈{preparing,out_for_delivery}. KPI row Pending/Today/Total. **Plan Route** (Google Maps `dir/?destination&waypoints`). **Mark Delivered dialog**: optional **delivery-proof photo** (stockist only, `capture=environment` → `documents/delivery-proofs/` signed 1yr → `delivery_proof_url`); stockist "Collect Payment" checkbox (amount + method cash/online → `delivery_collected_amount`, `delivery_payment_status="pending_approval"`, notifies stockist); pharmacy staff only sets status delivered (no payment/inventory).
  - Staff management by stockist/pharmacy admins: `delivery_staff`/`pharmacy_delivery_staff` (name*/phone*/aadhar/age/police_verification_id/username*/password* via `rpc hash_password` **plaintext fallback**).
- **ERP — Route Execution** ‹ERP, stockist-side surrogate›: **RouteExecution** (`location.state {selectedPharmacyIds, startingAddress, stockistId}`; **auto-optimize** via `optimize-route`; drag-drop reorder @dnd-kit; per-stop SortablePharmacyCard: Notify Dispatch WhatsApp, Send Payment Link per unpaid order, **Enter Collection Amount** + mode cash/online/cheque/other → Record Payment [FIFO, `payment_confirmations{payment_type:route_collection}`], Mark Delivered). **MapRouteDialog** (starting address, select pharmacies w/ non-delivered orders, Open in Google Maps, Start Route with AI).

---

## Module 12 — Admin

> Present (full) in: **ERP, HUB, MR, MVP, DSW, DMVP**. Tenant-scoped admin only: **SP**. Dormant enum only: **MED**.

- **ERP — Admin** ‹ERP, all behind AdminRoute (re-queries server-side)›:
  - **Dashboard**: 11-module grid; `useAdminNotifications` badge; Quick Stats Total Users/Active Stockists/Pharmacies/**Pending Tasks=open disputes**.
  - **User Management**: enrich profiles + role + stockist name; search + role filter; **`is_active` hardcoded true**; Activate/Deactivate only logs to `audit_logs` (**not persisted**).
  - **Pharmacy Approvals**: realtime; **dual approval** (admin_approved + stockist_approved → insert pharmacy_details, profile_id=admin's stockist record); Reject requires reason.
  - **Document Verification** (`pharmacy_documents`; Verify/Reject reason). **Batch Recalls** (`RCL-{ts}`, severity; **Search Users by Batch Code** `search_users_by_batch_code`; Mark Resolved). **Disputes** (status machine; Resolution). **Notices** (granular targeting Role/Batch/PIN/State/District arrays; `distribute_notice_to_users`; Switch active). **Message Templates** (CRUD, `{variable}` placeholders). **Territories** (CRUD + read-only Stockist Service Areas view). **Campaigns** (CRUD; Send Now → sent). **Fee Management** (`platform_fees` %/fixed). **Analytics** (8 StatCards; **trend %s hardcoded**; charts **placeholder divs**). **Enhanced Analytics** (**not linked**; Growth 32.5% hardcoded). **Audit Logs** (last 100).
- **HUB — Admin** ‹HUB, ~57 pages, ProtectedRoute role=admin›:
  - **Dashboard** (`adminStats` ~16 parallel): **13 clickable KPIs**; New Registrations Today; Revenue Today vs Yesterday; Pending breakdown; recharts; **System Health hardcoded "Operational"**; Recent Admin Actions.
  - **AdminStockists/Pharmacies/Doctors** (set `approval_status` directly; **bulk approve/reject client-loop**). **AdminUsers** (aggregates 4 tables; Suspend/Restore toggles approval_status; customers exempt). **AdminImpersonate** (view-only). **AdminForceReset** (resetPasswordForEmail). **AdminMergeAccounts** (re-points only notifications+login_activity).
  - **AdminNotifications** (Broadcast batches of 100; Targeted `admin_send_targeted_notification`). **AdminCounterfeit** (`counterfeit_alerts`; fuzzy-match products/inventory → notify). **AdminOrderDetail/CustomerOrderDetail** (`admin_override_*_status` RPCs). **AdminRefunds** (refund_status machine). **AdminReturns/Commissions** (read-only). **AdminMaintenanceMode** (flag stored **not enforced**). **AdminToSManagement**.
  - Config CRUD: DrugSchedules, ProductCategories, Specializations, PharmacyCategories, ServiceableAreas, Subscriptions, Banners (**URL only, no upload**). Analytics/GeoDistribution/ApiMonitoring(health hardcoded)/RevenueDetail/etc. **AdminSystemArchitecture (Flowboard)** 16 tabs from `flowboard-data` edge fn + **ArchitectureAIView** (`architecture-ai`).
- **MED** ‹MED, dormant›: admin enum + RLS policies only; **zero routes/screens/guards**.
- **MR — Admin** ‹MR, ProtectedRoute only, no client role gate›:
  - **AdminDashboard**: KPIs Total Users, Pending Verifications, Subscription Requests, **Revenue Est = pending × ₹999**; Recent Subscription Requests (Review → **/admin/subscriptions/:id 404**); **Danger Zone Wipe** (type `DELETE ALL USERS AND DATA` → `admin-wipe` edge fn).
  - **UserManagement** (Verify/Unverify; `deleteUser` client-side admin call **fails from browser**). **Subscriptions.tsx** (**not routed**; Approve → premium +30d). **SupportManagement** (status Select). **RoleAudit** (real XLSX export).
- **MVP — Admin** ‹MVP›: AdminDashboard (KPIs Total GMV[+12% hardcoded], Pending Approvals, Active Users[+8%], Flagged Items; banner CTA **no-op**). **ApprovalCenter** (Verify/Reject/Request Update real). StockistList/PharmacyList (Suspend toggles rejected↔approved). StockistDetail/PharmacyDetail (**Suspend writes 'rejected'**; PharmacyDetail Inventory tab **shows global bug**). **Suspensions** (lists rejected users). **CounterfeitManagement** (`toggleCounterfeit` real, enforced in cart/order). **BannerManagement** (real CRUD). **CommissionSetup** (**not persisted, never applied**). AdminPayments (**Commission=5% hardcoded**). Transactions, PlatformLedger (**Balance = last entry's stored field**), AdminAnalytics (**mostly fake**), AdminProfile (fabricated, toast), **UserFlowPage** (static documentation of idealized backend). Recurring quirk: `'suspended'` enum written **nowhere** (Suspend→'rejected').
- **DSW — Admin** ‹DSW›: AdminLayout (11 items; **hardcoded badges** 3/5/4, bell 12). Dashboard (platformStats hardcoded; +15%; Revenue AreaChart + User Pie hardcoded; **Review buttons no-op**). Users (`slice(0,20)`; Approve/Suspend **toast only**). **UserDetail** (reads local `mockUsers` keyed only `stockist-1|pharmacy-1|doctor-1` → **almost every nav = "User Not Found"**). Orders/Payments/Consultations (read-only). Per-role pages (each own 5-row array; View → not-found). Reports (toast). Settings (**uncontrolled inputs, save toast, values not collected**).
- **DMVP — Admin** ‹DMVP›: AdminDashboard (KPIs Pharmacies 5/Stockists 4/B2B 8/Pending 2/Revenue/**Active Today 12 hardcoded**/**New Regs 3**/**Today ₹5,590 Yesterday ₹4,200**/**System Health Operational**; charts). Approval queues (bulk Approve/Reject; **no reason/notification here**). Detail (Reject requires reason + notification; per-doc updateDocStatus + Preview). Users (merges profiles; **doctor/customer tabs always 0**; suspend toggle). Orders/Detail (`admin_override_order_status` no-op). Bills (read-only; **Total GST real sum**). Payments (read-only). Notifications (Broadcast chunks 100 + Targeted). **LoginHistory** (reads **empty `login_attempts`** → always 0). Messages. More/Help/Profile(Change Password→**/forgot-password 404**)/Settings (**commission/GST/payment saves NO backend call**).
- **SP** ‹SP, tenant admin only›: `admin` staff role per tenant gates Settings/Audit Logs/user management/system CSV; **no super-admin/KYC/global moderation** (documented gap). AuditDetailModal; Users add/deactivate (last-admin + self guards).

---

## Module 13 — AI & Edge / Backend Functions

> AI backends (Lovable Gateway): **ERP, HUB, MED, MR**. AI defined-but-null-at-runtime: **DMVP** (mock client), **MR/DSW/MVP** (DSW/MVP have none). Real server AI (Gemini `@google/genai`): **SP**.

- **ERP** ‹ERP, `supabase/functions/*`, Lovable Gateway `ai.gateway.lovable.dev` Gemini-primary+GPT fallback; symptom-checker & extract-prescription use `api.lovable.app`›:
  - **AI:** `parse-order-message` (auth, ownership-verified; matchConfidence exact/high/medium/low/none; models gemini-2.5-flash→gpt-5-mini). `extract-bill-items` (public, soft-fail 200). `process-bill-image` (auth+ownership; pharmacy resolve; stock exact-match reduce else **auto-create** sale=price×1.2 mrp×1.3 gst5). `extract-product-label` (vision; infers Indian brand). `fetch-product-info` (enrich, joins salts with " + "). `ai-symptom-checker` (public; **client sends only symptoms, reads mismatched field names**). `extract-prescription` (public; **unused by UI**). `chat-assistant` (6 role prompts; **patient/brand/mr tools declared but never executed** — fall through to stockist). `optimize-route` (Google Distance Matrix if key **else random 5-20km**; TSP via gemini).
  - **Transactional:** `create-platform-order` (public, Zod, `PLT-{ts}-{rand6}`, stock by ilike, gst default 12). `create-batch-cycle` (`delivery_cost=orders×12`, `cost_savings=orders×48`). `reduce-stock-for-order` (auto-create if missing). `calculate-delivery-fee` (Haversine + `stockist_delivery_rules`; default ≥5000?0:50). `mark-payment-paid` (public, **pending** confirmation). `approve-reject-payment` (auth+service-role; **credit-first + FIFO** + self-healing cleanup; 0.01 tolerance). `get-pharmacy-outstanding-orders` (public). `verify-pharmacy-license` (public, rate-limited 5/15min via `check_rate_limit`).
- **HUB** ‹HUB, all `verify_jwt=false`›: `parse-order-text` (`gemini-3-flash-preview`, tool `extract_order_items`, requires Bearer). `parse-purchase-bill` (**no header check**, vision, soft-fail 200). `autofill-product-details` (Bearer, tool `return_product_details`). `chat-bot` (Bearer + service-role; fuzzy `quick_questions` else general). `architecture-ai`. `flowboard-data` (static v5.0.0 dataset). `seed-admin`, `seed-production-data` (Jaipur seeder pw 12345678). **DB RPCs:** decrement_stock, deduct_product_stock (**double-deduct**), restore_product_stock, deduct_pharmacy_inventory, restore_pharmacy_inventory, update_circle_outstanding, admin_override_*, check_login_rate_limit, record_login_attempt, verify_staff_credentials, hash_password.
- **MED** ‹MED, all `verify_jwt=true`, `gemini-2.5-flash` no fallback›: `smart-order-parse` (tool-call, service-role inserts session+items; **no 429/402**). `smart-order-recommend` (**no AI**, pure matching → 3 strategies). `extract-bill-items` (vision). `fetch-product-info` (flat output; **client reads wrong `type` vs `product_type`**). `product-ai-fetch` (returns `{product_info:{}}`; **both product forms read wrong shape → no-op**). `bulk-upload-commit` (explicit `getUser`; **no stockist-ownership check → cross-tenant write gap**). `deduct_stock` RPC (**no migration defines it — untracked live DB object**).
- **MR** ‹MR, `gemini-2.5-flash`›: `ocr-product-label` (user JWT + service-role writes; match→update stock+=, else 2nd enrich call → insert). `autocomplete-product` (**NONE/public — abuse surface**; strips fences; 429/402; **may hallucinate image_url**). `assign-role` (admin needs `jit@ADMIN1`). `admin-wipe` (admin + confirm phrase; deletes 14 tables + auth users; **OTC not wiped**). `delete-my-account` (cascades; **OTC not covered**). `initialize-otc-inventory` (**never called by frontend**; seeds qty 40, hardcoded catalog Derma Co/MamaEarth/Himalaya). DB RPCs: get_next_bill_number(`MR/001`), get_next_order_number(`ORD/0001`), update_bill_statuses, check_credit_limit, get_pharmacy_credit_utilization, `handle_new_user` (default role **pharmacy**), hash_password. Broken/dead RPC `update_overdue_bills` (references non-existent `due_date`).
- **DMVP** ‹DMVP, mock client — `functions.invoke → {data:null}` ALWAYS›: edge fns exist (parse-order-text, autofill-product-details, parse-purchase-bill[no auth], chat-bot, architecture-ai, seed-admin, seed-production-data, flowboard-data) but **unreachable at runtime → every AI feature returns null → visible failures**. RPC mock stubs only `check_login_rate_limit/record_login_attempt/has_role` truthy; all others null (decrement_stock, deduct_product_stock, update_circle_outstanding, admin_override_* = no-op).
- **MVP/DSW** ‹—›: **no backend**; "AI" is simulated in-client (regex parsers + setTimeout + "AI Parsing"/"AI Enhance" badges; DSW voice sim setTimeout(3000) → hardcoded transcript).
- **SP** ‹SP, real Gemini `@google/genai`›: `aiParseService` (`POST /purchases/parse`, multer ≤10MB, `gemini-2.0-flash`, strict-JSON, fuzzy match; gated `FEATURE_AI_PARSE`+`GEMINI_API_KEY`). `aiOrderParseService` (`/orders/parse-text`, no dedicated UI). `aiProductService` (`/products/autofill`). **WhatsApp** (`whatsappService`, `POST /communication/send-bill`, Meta Graph v20.0 media+document; gated `FEATURE_WHATSAPP`). `billVerificationService` (`GET /api/public/verify-bill/:id`; **no QR/scan UI**). Single model, no fallback, name-only match, no-op without key.

**Shared AI note** ‹ERP, HUB, MED, MR, DMVP›: all AI hits `https://ai.gateway.lovable.dev/v1/chat/completions` with `LOVABLE_API_KEY`; model pinning varies (ERP gemini-2.5, HUB/DMVP gemini-3-flash-preview, MED/MR gemini-2.5-flash); SP alone uses direct Google GenAI.

---

## Module 14 — Smart Order engine (paste/parse → match → order)

> Present in ALL 8 apps (varying fidelity). Common shape: paste free-text medicine list → parse (AI or regex) → match against catalogue → confidence/found summary → add matched to order/cart.

- **ERP** ‹ERP›: **QuickOrderDialog** + OrderCreation Quick Add + Dashboard Quick Order — Zod (pharmacy required, text≥10) → `parse-order-message` → matchConfidence badges (Exact/High/Medium/Select), inline product Select for low/none, manual add, taxRate 5/12; blocks on unmatched; `ORD-{ts}` `order_source=whatsapp`, decrement stock.
- **HUB** ‹HUB›: **StockistCreateOrder** paste → `parse-order-text {text, products:[{id,name}]}`. **PharmacyQuickOrder** (`orders/quick`): `parse-order-text` → **findBestStockists** (serviceable_areas by pin → approved stockists → substring match → sum → sort cheapest → "Best Price" #0 + next delivery day); place → `order_source=quick_order`, `+outstanding`, **no credit check**.
- **MED** ‹MED, deepest 3-strategy›: **SmartOrder** page (`/pharmacy/smart-order`): `smart-order-parse {rawText, pharmacyId}` (AI tool-call, inserts session) → `smart-order-recommend {sessionId}` (**pure matching, no AI**): fuzzyMatch exact→substring→word-overlap; filters `stock_quantity ≥ qty`; **3 recommendations** — (1) Best Single Stockist (most itemsAvailable, tie lowest cost), (2) Cheapest Split (per-item lowest totalPrice, savings vs single), (3) Fastest Delivery (`getDaysUntilDelivery`, null→999). Add to Cart per strategy (**omits stockQuantity/moq/deliveryDate → validation bypassed, delivery_date=null**). Also embedded Smart Order card in StockistCatalogue (dead alternatives, no cart).
- **MR** ‹MR›: **QuickOrderModal** ("Quick Order to Bill"): `parseOrderText` (split on `.`/newline/comma; qty `\d+N`/`qty \d+`; last word=brand); match `products ilike` limit1; decrement stock; creates a **bill** (not order); **line items not persisted; unmatched dropped**. (Not AI.)
- **MVP** ‹MVP, regex, no backend›: **QuickBill** (stockist, WhatsApp→bill 5-step; regex qty trailing/leading; substring fuzzy on own inventory; manual `<select>` remap; FEFO batch; confirmed CIRCLE order + invoice). **QuickOrder** (pharmacist, WhatsApp→order; hyphen/dash split; substring `.find()` on connected inventory; FIFO estimate but **`batches[0]` in actual order lines bug**; groups by real stockistId; PLATFORM placed unpaid).
- **DSW** ‹DSW, simulated›: stockist **CreateOrder** (regex `/^(.+?)\s+(\d+)\s*$/`, "AI Parsing" cosmetic badge, toast). pharmacy **SmartOrder** (`setTimeout(1500)` + regex; 3 recommendations — cheapest real, **quickest=base×1.1 stockist 1, best_value=base×1.05 stockist 2** placeholder multipliers; Add to Cart toast→/cart). QuickOrderDialog (regex, GST 18%).
- **DMVP** ‹DMVP, AI null›: **StockistCreateOrder** paste → `parse-order-text {text, products}` → **null → "No items could be parsed"**. **PharmacyQuickOrder** → `parse-order-text {text}` (no products) → null → "Could not parse items" (**broken past step 1**; findBestStockists logic present but unreachable; `getNextDeliveryDay` defined but never called, nextDelivery hardcoded "Available").
- **SP** ‹SP›: CreateOrderPage "Paste Order" (client-side WhatsApp parser regex `^(name)[sep](x?)(qty)(unit)?$`, fuzzy exact→contains→token). Server `POST /orders/parse-text` (aiOrderParse, gemini-2.0-flash, exact/high/low/none confidence) — **no UI wire (page uses own client parser)**.

---

## Module 15 — Payments / Credit / Money logic

### 15.1 Order/payment status vocabularies (superset — see per-app in §3.3)
`payment_status`: ERP paid/unpaid/partial · HUB paid/unpaid/partial/claimed/verified/rejected/failed · MED paid/failed · MR pending/partial/paid via bill status · MVP pending/partial/paid/overdue · DMVP paid/unpaid · SP unpaid/partial/paid (+ delivery_payment_status pending_approval/approved/rejected in HUB). Confirmation status (ERP): pending/approved/rejected/on_hold. Refund status (HUB): pending/approved/rejected/processed. approval_status (HUB/MR/DMVP): pending/approved/rejected(/suspended).

### 15.2 Order-numbering schemes ‹superset›
ERP: `ORD-{Date.now()}` (manual/quick-bill/OCR), `ORD-{ts}` order_source whatsapp, `PLT-{ts}-{rand6}` (public), `INIT-{ts}` (placeholder), `RCL-{ts}` (recall). HUB: `ORD-`+base36, child `-S`+base36 (split), `PH<last8 ts>` (B2C), `SO`+last8 (duplicate), `BILL-<ts>-<n>`, `CN-`+base36, `PLT`. MED: mock `MOCK-<ts>-<rand9>`, `MOCK-PAY-<ts>`. MR: `MR/001` (bill), `ORD/0001` (order via RPC) but **Checkout `ORD/count+1` client-side race**. MVP: `ORD-YYYYMMDD-####`, `INV-2024-###`, `led-*`, `PAY-{ts}`, `TXN-{ts}`. DMVP: `ORD-`base36, `PH{last8}`, `SO{last8}`, `-S`base36, `BILL-{ts}-{idx}`. SP: `ORD-YYYY-####`, `INV-YYYY-####`, `PAY-#####`, `RET-####`, `GRN-YYYY-####`, `SPAY-#####`, `PO-YYYY-####`, `PGRN-YYYY-####`, `SALE-YYYY-####`, `PPAY-#####`, `SRET-####` (order/PO use collision retry).

### 15.3 Credit-first + FIFO settlement
- **ERP** ‹ERP›: **credit-first + FIFO** appears in FIVE places, same algorithm + 0.01 tolerance: (1) Pharmacies custom payment, (2) `approve-reject-payment` edge fn, (3) route collection, (4) partial payment (single-order), (5) mark-fully-paid (bulk). `creditUsed=min(payment,credit)`, `totalFundsToDistribute=creditUsed+payment`, leftover → credit_balance. Outstanding = `Σ max(0, total − paid)` over unpaid/partial (`recalculatePharmacyBalance` duplicated everywhere).
- **HUB** ‹HUB›: **CollectPaymentDialog** FIFO auto or manual; `StockistRecordPayment` (#51 marks all paid if outstanding≤0). `update_circle_outstanding` atomic in most flows, **non-atomic `.update()`** in CollectPaymentDialog/BillPreviewDialog/StockistReturns/return credit_balance branch. **Net Due = outstanding − credit_balance**.
- **MED** ‹MED›: no credit model; payments mock (`Math.random()>0.05` 95%; 2s delay; no real gateway; **no DB transaction — best-effort rollback deletes**).
- **MR** ‹MR›: `check_credit_limit` RPC (≥100 blocked, ≥90 warning) — **PharmacyDetail display-only, BillForm hard-blocks** `dueAmount > max_credit_limit`. `update_bill_statuses` bill machine (critical/overdue/due_soon/pending/paid by remaining_due_date). Reminders = `payment_reminders`/`payment_requests` rows + simulated modal (**no server messaging**). **Money bugs:** PharmacyDetail remaining=total−2×upfront; BillForm rolls previous_due (double-count).
- **MVP** ‹MVP›: FIFO in 3 places (CirclePharmacies, CirclePharmacyDetail, PharmacistPayments). `addPayment` clamps to remaining due (no overpay), blocks cancelled. Outstanding = `max(0, Σ grandTotal − Σ paid)` over non-cancelled. `getCreditUsed/getCreditLimit/canUseCredit`. **Checkout hard-blocks pay-later CIRCLE over limit; CreateOrder no credit check**. Cheque cast onto method union / cheque→cash fidelity loss.
- **DSW** ‹DSW›: no money moves — **every settle/collect/approve = toast + local state**. FIFO not implemented; CollectPaymentDialog quick 25/50/Full → toast.
- **DMVP** ‹DMVP›: **CollectPaymentDialog** FIFO/manual, insert payment confirmed, circle `outstanding=max(0,−amt)` **direct non-atomic, never touches credit_balance**. Credit enforcement **asymmetric**: pharmacy placeOrder **hard block**, StockistCreateOrder **warn-allow**. Returns → credit_balance+= (paid) / RPC −= (unpaid) but **never inserts order_returns**. All RPC writes no-op.
- **SP** ‹SP, real double-entry›: `recordPayment` (non-cash requires **unique reference** `DUPLICATE_REFERENCE`/`REFERENCE_REQUIRED`; tx FIFO across oldest bills or explicit allocations; refuse over-allocate; outstanding-=; ledger method Dr/Debtors Cr). Void reverses. **`getPharmacyExposure`** = unpaid bill balances Σmax(0,total−paid) + in-flight approved-unbilled orders; enforced at create/finalize/approve; connection creditLimit precedence. `pharmacies.outstanding` denormalized + reconcilable. Delivery-staff N/A. Payable side (`recordPayablePayment` → emits `payment.recorded` → stockist reciprocal `recordPayment`).

### 15.4 GST / tax logic ‹variant per app — KEEP ALL›
- **ERP:** portal checkout flat **5% + delivery fee**; public catalogue **per-item gst_percentage, no fee**; OrderCreation **SGST/CGST split (tax/2 each)**, per-item gst default 5; QuickOrder/QuickBill 5/12 toggle (default 12); create-platform-order default 12.
- **HUB:** stockist bills/orders **NO GST computed** ("TAX INVOICE" cosmetic; gst_rate/hsn unused; GST report reads unpopulated `bills.gst_amount`); Customer Checkout flat **5% + fee**; inline order raw total; B2C bill line items only.
- **MED:** per-line `gst_amount=price×qty×gst%/100`, per-stockist total=subtotal+Σgst, stored on order_items; **no CGST/SGST**; missing gst treated as 0. Bulk-upload margin models GST **on profit** (non-standard).
- **MR:** **no GST/tax anywhere** (`tax_amount`/`discount_amount` columns never written).
- **MVP:** **flat 12%** everywhere (`Math.round(subtotal×0.12)`); no split, no per-item, no fee; discount hardcoded 0.
- **DSW:** OrderDetail/CreateOrder/QuickOrder **18% hardcoded** (ignores per-product 5/12); CreateBill uses pre-computed per-order gst; Checkout **18%**; AcceptOrder **12%**; patient/sale orders no GST line. **Net: Subtotal+GST≠Total on OrderDetail.**
- **DMVP:** **no GST math** despite gst_rate/gst_amount + "TAX INVOICE".
- **SP:** `computeGst` — `isInterstate=sellerState≠buyerState`; intra CGST=round2(tax/2)+SGST=round2(tax−cgst); inter all IGST; rates 0/5/12/18/28; order/bill GST-**exclusive**, retail POS GST-**inclusive**.

### 15.5 Stock RPCs / deduction timing ‹variant›
- ERP: `deduct_stock` on order create; process-bill-image/reduce-stock auto-create.
- HUB: `decrement_stock` (B2B create) + `deduct_product_stock` (packed — **double-deduct**); `restore_product_stock` (cancel packed+); `deduct_pharmacy_inventory` (B2C confirm)/`restore_pharmacy_inventory` (customer cancel); **B2B purchase = no deduction**; delivery → autoPopulateInventory.
- MED: `deduct_stock` at checkout (untracked); bulk add/reduce/upsert.
- MR: decrement at "packed" (sequential, no tx).
- MVP: FEFO batch pick; deduct on confirm, restore on cancel; expired excluded from totalStock.
- DMVP: RPCs no-op.
- SP: **FEFO `reserveStock`** (atomic conditional decrement, recurses, `InsufficientStockError`→409); `receiveStock` upsert; `releaseStock`; every mutation writes `stock_movements` (C24). Adjust-stock cannot exceed qtyReceived (C25).

### 15.6 UPI / QR / receipts / double-entry ledger
- ERP: `qrcode.react` (level H) + `upi://pay?pa=&pn=&am=&tn=Order-&cu=INR`; PaymentLinkDialog (editable UPI, 100/50/25% or slider, WhatsApp).
- HUB: bill QR to **hardcoded `digi-swasthya-hub.lovable.app/verify-bill/`**; `generate-receipt-pdf` A5; WhatsApp `wa.me/91<phone>` (country code hardcoded).
- MED: mock references only; no gateway/UPI/QR.
- MR: `generateUPILink` (`upi://pay?pa=&pn=&am=&cu=INR&tn=Bill`); WhatsApp deep links; **PaymentProcessModal hardcoded Kotak bank xxxx5414**; Upgrade payee **9672123710**.
- MVP: **no wa.me/upi://pay**; only tel: + clipboard; WhatsApp "send" = record + toast.
- DSW: wa.me wired (CreateBill/QuickBill/SharePaymentLink); tel:/maps/clipboard real.
- DMVP: html2canvas→jsPDF (A4), `generate-receipt-pdf` A5, QR qrcode.react → **hardcoded lineage domain** (won't reach local VerifyBill).
- SP: **double-entry ledger** (`postEntry` throws on imbalance >0.01; 16 seeded accounts incl **GRN_CLEARING** suspense; sales/purchase/payment/return/void all post reversing entries). WhatsApp via client-rasterized PDF.

---

## Module 16 — Delivery config & fee engine

- **ERP** ‹ERP›: **DeliverySettings** tabs — Delivery Dates (multi-select Calendar → `stockist_delivery_dates{is_active}`), Service Areas (6-digit PIN + name → `stockist_service_areas`, dup 23505, Switch, "only pharmacies in these areas can order"), **Delivery Fees** (rule type **Flat Fee / Free Above Order Amount / Per KM Charge**; priority=count+1; `stockist_delivery_rules`). **`calculate-delivery-fee`** edge fn: Haversine (dispatch↔pharmacy lat/lng) + rules by priority (order_amount free / flat_fee / per_km × max(0,dist−base)); default **≥₹5000?0:50**; always 200.
- **HUB** ‹HUB›: StockistServiceableAreas (PINs + per-PIN `delivery_settings`), StockistDeliveryRoutes (Google Maps URL, `delivery_route_templates`), StockistHolidays (`stockist_holidays` start/end/reason/allow_preorder, notifies circle). Pharmacy delivery config in business details. B2C: fee from `pharmacy_profiles.delivery_fee` (0 if ≥free_delivery_above). PharmacyDeliveryRoutes.
- **MED** ‹MED, DORMANT›: **DeliveryRulesConfig** (5 rule cards: Free on Profit / Free on Order Amount / Free on Scheduled Dates / Distance-Based / Flat Fee; priority fixed 1..5; "first matching rule wins"). ServiceableAreasManager (PIN + area). DeliveryAndDates (Dates tab **never loads on mount bug**). **`useDeliveryFee` + `distanceCalculator` Haversine ENTIRELY DORMANT** — imported by nobody; checkout never applies fee, never sets `orders.delivery_fee`; **no UI to capture lat/lon** (LocationInput unused).
- **MR** ‹MR, partial›: no delivery-fee engine; **DeliveryPlanner** (route only, **simulated** distance random 10-59km, time×2.5min, Open in Google Maps, no persistence).
- **MVP** ‹MVP›: **DeliverySetup** (Service Areas + Delivery Slots — real CRUD). **HolidayManagement** (real; allow_preorder; `isStockistOnHoliday` exact date===today). Checkout **4 hardcoded delivery slots UI-only**; delivery charge type in registration (free/flat/free_above/distance) collected but not applied. No fee in any total.
- **DSW** ‹DSW›: Delivery Routes page (mock routes, "Today" hardcoded `2026-01-27`; Call staff tel: wired; Create toast). Sale Live Settings (radius slider 1-15km, deliveryFee editable, operating hours — toast, not persisted). No fee math.
- **DMVP** ‹DMVP, partial›: Serviceable Areas (add/remove PIN real-shape but no-op writes). Pharmacy **Business Details Delivery Configuration** (min_order_amount, delivery_fee, free_delivery_above — **stored never applied**); Operating Hours (stored never applied). No fee math.
- **SP** ‹SP, partial›: Serviceable Areas PINs + per-PIN `delivery_settings` (delivery_days); DeliveryRoutes (Google Maps directions URL, no optimization; templates); StockistHolidays (start/end/allow_preorder, notifies circle). Bill dueDate = billDate + paymentTermsDays. No delivery-fee-on-order engine (fees not in order totals).

---

## Module 17 — Realtime / Offline / PWA / Infra

### 17.1 Realtime
- **ERP** ‹ERP›: **extensive** — dashboard-orders/stats, pharmacies (payments/orders/details), products-realtime, orders-realtime, payments, payment-approvals, notices INSERT, activity_log INSERT, catalogue dashboard (orders/pharmacy_details/payment_confirmations).
- **HUB** ‹HUB, only 3 channels›: `notifications-{user.id}`, `chat-{conversationId}`, `peer-{sortedIds}`. **No realtime on orders/inventory/payments** (polling only).
- **MED** ‹MED›: **none** (refetch on mount/mutation).
- **MR** ‹MR, only 1›: `pharmacy-bills-changes` (PharmacyDetail). Rest = TanStack pull.
- **MVP/DSW** ‹—›: none (no backend).
- **DMVP** ‹DMVP›: `useRealtimeNotifications` = literal no-op; MockChannel no-ops; TopNav badges hardcoded (chat 1, bell 2).
- **SP** ‹SP›: no websocket realtime; **event bus polled** `POST /events/process` every 10s (`useEvents`).

### 17.2 Offline / sync
- ERP ‹ERP›: **offlineSync.ts** singleton queue in `localStorage.offline_sync_queue`; replays on `window online`; `offlineAwareFetch` queues POST/PUT/DELETE/PATCH offline → synthetic **HTTP 202** `{queued:true}`. NetworkStatus widget.
- HUB ‹HUB›: `useOfflineDetector` + OfflineBanner (no mutation queue).
- MED ‹—›: none.
- DMVP ‹DMVP›: `useOfflineDetector` + OfflineBanner; **no mutation queue**.
- SP/MR/MVP/DSW ‹—›: none.

### 17.3 PWA
- ERP ‹ERP›: vite-plugin-pwa, dev port 8080, SWC, gzip+brotli, manual chunks; `registerType:'prompt'`, `skipWaiting:false`, `navigateFallback:'/offline'`; Workbox Supabase NetworkFirst(10s,1d,100)/images CacheFirst(30d)/fonts(365d); update poll 60s; PWAInstallPrompt + PWAUpdateNotification.
- HUB ‹HUB›: `public/manifest.json` (theme #16a34a, standalone/portrait), **hand-written `public/sw.js`** (`digi-swasthya-v3`, network-first, SKIP_WAITING); **two overlapping update mechanisms** (UpdateBanner + useVersionCheck); `useVersionCheck` **"1.0.0" vs constants "2.0.0"** mismatch.
- MED ‹MED›: vite-plugin-pwa `registerType:'autoUpdate'`, port 8080, manifest "MedOrder - Medicine Marketplace", Workbox Supabase NetworkFirst 24h.
- MR ‹MR›: VitePWA autoUpdate, Workbox glob, manifest PharmaMR theme #ffffff.
- MVP ‹MVP›: **no service worker, no PWA plugin**; Install page absent (has /install? no). localStorage-only.
- DSW ‹DSW›: VitePWA autoUpdate, port 8080, manifest "Digi Swasthya" theme #4a7c94, Workbox precache + Google Fonts CacheFirst; Install page (`beforeinstallprompt`, iOS/standalone detection).
- DMVP ‹DMVP›: `public/manifest.json` + hand-written sw.js; vite react-swc + lovable-tagger (**no VitePWA**), port 8080. Version footer "v1.0.0" vs APP_VERSION "2.0.0".
- SP ‹SP›: server Express (helmet CSP off, CORS credentials, 10MB JSON, PORT 4000, `DATABASE_URL` default `pglite:memory`); client axios baseURL `/api` withCredentials, 401→login redirect.
- MED extra ‹MED›: **Install page** (`/install`, iOS/standalone/`beforeinstallprompt`, not linked). ERP/HUB also PWA install prompts.

### 17.4 Storage buckets & TTLs
- ERP ‹ERP›: `product-images` (public), `bills`/`prescriptions` (signed 1h); `uploadToStorage` folder=user.id. CSV `parseCSVContent`/`mapCSVToProduct`.
- HUB ‹HUB, inconsistent by design›: **`documents`** (registration=public URL; resubmissions/delivery-proofs=signed 365d/1yr; checkout Rx/UPI proofs=signed 24h; Rx upload=**raw path no signed URL**; pharmacy payment proof=30d; business docs=1d; purchase bills raw); `product-images`, `product_media`/`pharmacy_inventory_media`, `public-assets` (doctor avatar), `platform` (logo).
- MED ‹MED›: `bills` (`${stockistId}/…` signed 900s); legacy `ocr-bills` unused; `product-images`/`prescriptions` unused. RLS corrected to `user_owns_stockist`.
- MR ‹MR›: `product-images` (public), `licenses` (private; **Upgrade mis-reads via getPublicUrl → won't resolve**).
- SP ‹SP›: multer uploads; invoice base64 data-URL; no bucket abstraction (PGlite embedded).
- MVP/DSW ‹—›: no storage (object URLs / placeholders); MVP FileUpload 5MB silently drops oversized.
- DMVP ‹DMVP›: MockStorage → `https://placeholder.com/...` for all (product-images/documents/platform).

### 17.5 Data-layer quirks (prototypes)
- DMVP ‹DMVP›: **mock supabase** — `.or()`/`.filter()`/`contains`/`textSearch` all no-op (→ StockistOrders shows ALL stockists' orders; PeerChatPage shows whole table); joins only via small JOIN_MAP; insert/update/delete/upsert no-op; `functions.invoke → null`; RPC 3 truthy rest null.
- MVP ‹MVP›: AppStateContext (~1050 lines) persists ~29 slices to `digi-swasthya-state`; merges seed + dynamic overrides; artificial 600/700/1000/1200/1500/2000ms delays throughout.
- DSW ‹DSW›: **no persistence** except tour flag; page-local arrays bypass shared mock modules in many pages; detail pages ignore `useParams().id` (patient OrderDetail/ConsultationDetail).

---

## Module 18 — Data model

- **ERP** ‹ERP, ~70 tables + RPCs›: identity (profiles, user_roles, stockist_details, pharmacy_details, patient_details, brand_details, mr_details); catalog (products, product_batches, pharmacy_inventory, pharmacy_expiry_alerts, brand_products); orders (orders, order_items, order_batch_cycles, patient_orders, patient_order_tracking, brand_orders, delivery_tracking, route_executions); finance (invoices, payment_confirmations, payment_reminders, platform_fees, commission_ledger, mr_order_commissions, subscription_plans, user_subscriptions); connections (pharmacy_stockist_connections, pharmacy_registration_requests, pharmacy_documents, territories, stockist_service_areas, stockist_delivery_dates, stockist_delivery_rules, batch_delivery_rules); patient (patient_prescriptions, patient_addresses, patient_refill_reminders, patient_wishlist, wishlist, loyalty_points/transactions, ratings_reviews, referrals, search_history); brand/compliance (brand_campaigns, campaigns, brand_batch_verification, batch_recalls, disputes); mr (mr_pharmacy_visits); governance (admin_notices, user_notice_recipients, message_templates, notification_queue, notification_preferences, communication_log, support_tickets, audit_logs, activity_log, analytics_events, platform_settings, catalogue_rate_limits). RPCs: has_role, is_admin, check_rate_limit, deduct_stock, distribute_notice_to_users, search_users_by_batch_code.
- **HUB** ‹HUB, ~70 tables + 15 RPCs, project ggliujfrabwtodwtjnul›: identity/roles (profiles, user_roles, *_profiles, login_activity, login_attempts); catalog (products, product_batches, product_media, product_categories, pharmacy_inventory, pharmacy_inventory_media, pharmacy_categories, drug_schedules); B2B (orders, order_items, order_returns, order_status_history, delivery_staff, delivery_settings, delivery_route_templates, stockist_holidays, serviceable_areas, admin_serviceable_areas); B2C (customer_orders, customer_order_items, customer_returns, customer_return_items, customer_reviews, customer_wishlist, customer_addresses); finance (payments, payment_reminders, bills, bill_orders, credit_notes, subscription_plans); connections (stockist_pharmacy_circle, pharmacy_serviceable_areas, pharmacy_delivery_staff, pharmacy_consultation_settings); healthcare (consultations, prescriptions, prescription_items, prescription_templates, doctor_availability, doctor_specializations, doctor_pharmacy_partnerships, doctor_commission_rules, doctor_commission_earnings); compliance (counterfeit_alerts, reviews); governance (admin_audit_log, notifications, messages, peer_messages, conversations, chat_messages, quick_questions, platform_settings, platform_banners). Enums: app_role admin/stockist/pharmacy/customer/doctor; approval_status pending/approved/rejected. `as any` tables (not in types): pharmacy_stock_audits, recurring_orders, manufacturer_returns, price_history (dead).
- **MED** ‹MED, project kefbopoxcturwiqkfgdf›: user_roles, stockists, pharmacies, stockist_products (no hsn_code), bulk_upload_drafts, orders, order_items, payments, smart_order_sessions/items/recommendations, stockist_delivery_dates/rules/serviceable_areas. RPCs: has_role, user_owns_stockist, deduct_stock (**declared/called but no migration — untracked**), update_updated_at_column. Enum app_role admin/stockist/pharmacy. Buckets: bills; legacy ocr-bills unused.
- **MR** ‹MR, project uuwwnggimhvtvnislptd›: bills, cart_items (persistent seller-locked), order_items, orders (buyer_id, seller_id, seller_type, stockist_id→profiles, pharmacy_id→pharmacies, tax_amount/discount_amount unused), products (seller_type, discount_percentage, min/max_order_quantity), profiles (username, is_catalogue_live, subscription_*, bank_*), pharmacies (mr_id, max_credit_limit, payment_behavior_score, avg_payment_days), seller_buyer_relationships, store_settings (no UI writes), subscription_requests, support_tickets, user_roles, payment_reminders, payment_requests, otc_brands/inventory/shipments/shipment_items; **as any**: pharmacy_otc_subscriptions, otc_subscription_plans. View product_sales_summary (unread). RPCs: check_credit_limit, get_next_bill_number, get_next_order_number, get_pharmacy_credit_utilization, has_role, update_bill_statuses, update_overdue_bills (broken). Enums app_role (mr/stockist/distributor/pharmacy/admin), product_category (10). Admin pw `jit@ADMIN1`; wipe phrase `DELETE ALL USERS AND DATA`.
- **MVP** ‹MVP, localStorage `digi-swasthya-state`, no DB›: ~29 persisted slices (cartItems, dynamicOrders/Payments/Ledger, invoices, reminders, connectedStockists, orderStatusOverrides, dynamic Stockists/Pharmacists/Medicines/Batches, batchQtyOverrides, counterfeitOverrides, banners+overrides+deleted, circleEntries, addresses, orderCounter(10)/invoiceCounter(5), deliveryAreas/Slots, holidays, returnRequests, creditNotes, pharmacyInventory, supportMessages). Seed: 1 admin/5 stockists/6 pharmacists, 18 medicines (med-006 counterfeit)/19 batches, 9 orders, 6 payments/15 ledger, 3 banners/5 notifications/5 commissionRules/11 circlePharmacies (unused). Enums OrderStatus, ApprovalStatus (suspended unused), PaymentStatus, OrderType PLATFORM/CIRCLE.
- **DSW** ‹DSW, no backend, in-memory mock modules›: stockist-mock (20+8 pharmacies, 10 products, 5 incoming, 6 orders, 5 payments, 3 notices, 5 notifications), pharmacy-mock (8 stockists, 15 products w/ stockistPrices, 5 cart, 6 orders, 7 offers), pharmacy-sale-mock (5 patients, 4 doctors, 4 consults, 3 saleOrders, 7 inventory), patient-mock (100/200/150/100/50 generated), doctor-mock (60/23/16/31/50), admin-mock (platformStats hardcoded, 235 users, 15 verification, 100 orders, 150 transactions, 50 consults). unified-data-helpers (getPlatformMetrics/getPatientPrescriptionVault unused).
- **DMVP** ‹DMVP, mock, types PostgrestVersion 14.4›: 22 tables (bill_orders, bills, chat_messages, conversations, login_activity, login_attempts, messages, notifications, order_items, order_status_history, orders, payments, peer_messages, pharmacy_profiles, product_batches, product_media, products, profiles, serviceable_areas, stockist_pharmacy_circle, stockist_profiles, user_roles); order_returns/quick_questions **referenced but absent**. 15 RPCs (3 stubbed truthy). Enums app_role (customer/doctor unused), approval_status. Seed: 4 stockists (sp-004 pending), 5 pharmacies (pp-005 pending), 12 products, 8 orders, 5 bills, 4 payments, 4 circle (all sp-001). 55 historical SQL migrations (not applied).
- **SP** ‹SP, PGlite Postgres, Drizzle `db/schema.ts`›: money `numeric(14,2)` strings; `(tenantId,id)` unique indexes; `bills.order_id` unique (idempotent). Tables: tenants, users, refresh_tokens, password_reset_tokens, audit_logs; pharmacies, suppliers, products, product_batches, stock_movements; orders, order_items, order_returns; bills, bill_items, payments, payment_allocations, supplier_payments; purchases; purchase_orders, grn, payable_bills, payable_payments, retail_sales, customers, stockist_returns; stockist_connections, stockist_catalog_items, stockist_public_catalog_items; ledger_accounts (16 seeded incl GRN_CLEARING), ledger_entries; cross_tenant_events, processed_cross_tenant_events; delivery_staff, pharmacy_delivery_staff, delivery_settings, delivery_route_templates, serviceable_areas, stockist_holidays. `lib/ids.ts` numbering; `lib/gst.ts`, `lib/inventory.ts` (FEFO), `lib/ledger.ts`.

---

## Module 19 — Cross-cutting conventions

- **Currency:** ‹all› `₹`. ERP `toLocaleString('en-IN',{2dp})` (some Math.round/toFixed); MED `.toFixed(2)` no grouping; MR/HUB `toLocaleString('en-IN')`; MVP/DSW `toLocaleString('en-IN')` + abbreviated `₹{k}K`; SP numeric strings round2.
- **Pagination:** ERP TanStack (staleTime 60s); HUB `usePaginatedQuery` 20 (staleTime 15s, **tab counts per-page**); MED manual 20 (`count:'exact'`, **search only current page**); MR TanStack; DMVP usePaginatedQuery (**`.filter()` ignored**); SP TanStack Query 5.
- **Branding drift** ‹kept›: HUB "Digi Swasthya"/"Digi Swasthya Hub"/"Digital Swasthya"; MED "MedOrder"/"MediConnect"/"Medicine Ordering Marketplace"; MR "PharmaMR"/"Chameleon *"/"P" glyph; SP "Stockist"/"Pharmacy" shells. Version mismatches (HUB 1.0.0 vs 2.0.0; DMVP v1.0.0 vs APP_VERSION 2.0.0).
- **Status vocabularies** differ per app and per surface (enumerated in §3.3, §5, §15.1) — **all variants kept**.
- **Hardcoded/stub inventory** (superset, per app):
  - **ERP:** EditProduct HSN/Batch not persisted; AddProduct batch_code omitted; Analytics "Active Pharmacies" counts ALL (bug); PharmacyDetail Send Reminder `pa=yourUPI@bank` stub; DateRangeFilter display-only; chat-assistant patient/brand/mr tools never executed; optimize-route random distance; extract-prescription unused; Settings notification switches cosmetic; Remember-me unused; orphans PatientSignup/BrandSignup/Index/RoleSelection.
  - **HUB:** double stock deduction; Home "Pending Bills" always 0; price_history dead; Export PDF emits xlsx; StockTransfer/Dispose no re-aggregate; BatchManager LIFO headline; outstanding non-atomic in several flows; bill QR hardcoded lovable domain; manufacturer-return via window.prompt; RecurringOrders no scheduler; customer-return no restock; staff password plaintext fallback; Rx upload no OCR; two divergent customer order paths; UPI "15-min" static banner; booking ignores doctor_availability; reminders localStorage setTimeout<24h; ReviewOrder writes `reviews` reads `customer_reviews` (never surface); doctor meeting links manual; Earnings excludes commissions (diverges from dashboard); maintenance flag not enforced; two SW update mechanisms; WhatsApp country code 91 hardcoded.
  - **MED:** AI-autofill broken both forms (wrong request key + wrong response shape); CustomPricing edits lost; Delivery Dates never loads on mount; Product Type Add/Edit value mismatch; Smart Order→cart bypasses validation (delivery_date null); N+1 queries; delivery-fee engine dormant; admin dormant; Index/ProductTable/LocationInput dead; payments mock; bulk-upload-commit no ownership check; GST default 18 (Edit 0).
  - **MR:** ~15 dead links/unreachable pages; PharmacyDetail remaining=total−2×upfront; BillForm double-counts previous_due; Checkout client-side order# race + pharmacy_id join break; buyers see no orders; MyCustomers outstanding wrong join; MR products seller_type=stockist; SellerDetail cart bypasses lock; Quick modals don't persist line items; update_overdue_bills broken; MySuppliers reads nonexistent full_name; Notifications always empty; Settings tabs inert; Reports Customer/Route stub, PDF stub; Analytics InventoryAlerts hardcoded; OTC init never invoked; PaymentProcessModal hardcoded Kotak; Upgrade private-bucket getPublicUrl; Profile OTC card duplicated; no GST; hardcoded 4.5 ratings; ₹999 subscription; ₹100,000 credit fallback; payment terms 7 vs 30.
  - **MVP:** login always succeeds; registration never persists (demo session); ForgotPassword/ResetPassword timer+toast; file uploads object-URL 5MB drop; Analytics/Reports/Subscription/Profile stubs; AddItem/EditProduct discard fields; BulkUpload/PurchaseBills ignore file; BulkPriceUpdate upload fabricates prices; Credit tab hardcoded 0; credit fallback ₹175000; cheque→cash fidelity loss; CommissionSetup/AdminPayments not persisted/5% hardcoded; AdminAnalytics mostly fake; Suspend writes 'rejected' (suspended never written); PlatformLedger balance=last entry; UserFlowPage documents non-existent backend; credit notes minted never applied; GST flat 12%; discounts always 0; no wa.me/upi; static notification dot; duplicate /stockist/settings route; GlobalSearch navigates /stockist/* regardless of role.
  - **DSW:** entire app no backend — every write toast/local (reset on reload); GuidedTour flag only persistence; simulated AI/voice (setTimeout + hardcoded transcript); many 404 nav links; page-local arrays bypass shared modules; detail pages ignore params; hardcoded KPIs/badges throughout; GST inconsistent (18% vs 12% vs per-order); theme toggle inert; OTP accepts any 6-digit; admin UserDetail 3 synthetic keys → mostly "not found".
  - **DMVP:** mock supabase all writes no-op; `.or()`/`.filter()` ignored (cross-stockist leak, whole-table peer chat); AI null → visible failures; seed status/vocab mismatches (confirmed/processing/whatsapp_parse/neft); bill status chaos (confirmed/final/finalized); dead links (~15 unrouted from More, /record-payment 404, /forgot-password 404); AdminLoginHistory reads empty login_attempts; StockistBusinessDetails price-change filters non-existent status='active'; SharedProductDetail sales chart always empty; QR lineage domain; no GST/delivery math; delete-account toast-only; AdminSettings no backend call.
  - **SP:** bill QR client-half missing (backend verify exists, no scan UI); multi-step registration missing (single form; PAN/WhatsApp/city/PIN/pincodes/docs/bank not collected); platform super-admin missing; duplicate order partial (PO rejected-only, no confirm; stockist no duplicate); AI single model no fallback; WhatsApp requires client PDF raster + Meta creds; overdue derived not stored (markOverdueBills no-op); refresh tokens revoked but no /auth/refresh; catalog push always full re-sync (changedProductIds unused).
- **Error codes** ‹SP, most formalized›: InsufficientStockError→409, CREDIT_LIMIT_EXCEEDED, PHARMACY_INACTIVE, CONNECTION_INACTIVE, PO_NOT_SUBMITTABLE/CANCELLABLE, CATALOG_DRIFT, OVER_RECEIVE, EXPIRED_BATCH, BATCH_NOT_AVAILABLE, RX_REQUIRED, SPLIT_MISMATCH, DUPLICATE_REFERENCE, REFERENCE_REQUIRED, BILL_REQUIRED, ORDER_HAS_BILL, REQUEST_COOLDOWN (7-day), PAYMENT_EVENT_*, RETURN_*, CANCEL_REQUEST_*, UNKNOWN_EVENT_TYPE. Others use Postgres 23505 (dup) friendly messages (ERP/MED/MR/DMVP).
- **Cross-tenant architecture** ‹SP unique›: connection record + append-only `cross_tenant_events` (`emitCrossTenantEvent`/`applyEvent` atomic claim via `processed_cross_tenant_events` onConflictDoNothing; handled types order.*/bill.generated/connection.*/payment.recorded|voided/catalog.changed/return.*; unknown→UNKNOWN_EVENT_TYPE). Two catalogs (connection catalog w/ PTR; public catalog **never stores PTR** C12). Contrast: ERP/HUB/MED/MR/DMVP use single-DB RLS scoping; MVP/DSW single-client mock.
- **Hardcoded secrets/magic strings** ‹kept›: MR admin pw `jit@ADMIN1`, wipe phrase `DELETE ALL USERS AND DATA`, delete `DELETE`, subscription ₹999, OTC 5%/qty40, credit ₹100,000, payee 9672123710, Kotak xxxx5414; DSW GSTIN `27AABCU9603R1ZM`; ERP `INIT-{ts}`, `pa=yourUPI@bank`; HUB `digi-swasthya-hub.lovable.app`; MED margin 20%/GST 18/MRP×1.1/95% success; SP JWT_SECRET ≥32, DEFAULT_CREDIT_LIMIT 50000, todayIST Asia/Kolkata.

---

*End of unified feature map. Union of 8 exhaustive per-app reviews (ERP, HUB, MED, MR, MVP, DSW, DMVP, SP). Every page, flow, sub-flow, form field, action, calculation, status machine, edge case, stub, and hardcoded value found in any single app is preserved above with per-app source tags and partial/extra/variant deltas.*

---


---

## 5. Status State Machines (all entities, canonical transitions)

### 5.1 B2B sales order

**Canonical (SP):** `pending → packed → shipped → delivered | cancelled`

| App | Status chain | Notes |
|-----|--------------|-------|
| ERP | confirmed + delivery_status pipeline | payment_status separate |
| HUB | pending→packed→dispatched→out_for_delivery→delivered | +split children |
| MED | paid→accepted→packed→out_for_delivery→delivered | forward-only stepper |
| MR | pending→confirmed→packed→shipped→delivered | stock at packed |
| MVP | draft→placed→confirmed→dispatched→delivered | PLATFORM/CIRCLE types |
| DMVP | same as HUB UI | writes no-op |

**SP pharmacy PO (11 states):** draft→submitted→accepted|rejected→packed→shipped→delivered→partially_received→received | cancel_requested→cancelled

### 5.2 B2C customer order (HUB)

`pending → confirmed → preparing → ready_for_pickup → out_for_delivery → delivered | cancelled`  
Stock deducts at **confirmed** (not preparing per flowboard model). Payment: unpaid→claimed→verified.

### 5.3 Bill

SP: unpaid|partial|paid|overdue(derived) · MR: pending|due_soon|overdue|critical|paid · HUB: confirmed|final

### 5.4 Payment confirmation (ERP)

pending → approved | rejected | on_hold

### 5.5 Returns

SP: requested→processed|rejected · HUB order_returns: pending→completed|rejected · customer_returns: no restock

### 5.6 Connection

stockist_connections: pending→active|rejected|withdrawn|disconnected

### 5.7 Consultation

booked→in_progress→completed|cancelled

### 5.8 MVP client orderFlow

draft→placed→confirmed→dispatched→delivered (+cancelled at each non-terminal)

### 5.9 DB triggers (HUB)

`validate_order_status_transition`, `validate_customer_order_status_transition` — admin overrides via SECURITY DEFINER RPCs.

---

## 6. Business Rules & Calculations

See **Module 15** in §4A for full GST/credit/FIFO/stock/UPI rules per app.

### 6A. SP money logic (canonical reference)


## 5. Money Logic

- **GST (`lib/gst.ts` + client `gstClient`):** `isInterstate = sellerState !== buyerState`. Per line `tax=round2(sub*rate/100)`. Intra: `cgst=round2(tax/2)`, `sgst=round2(tax−cgst)` (symmetric, no paisa drift). Inter: all to igst. Rates 0/5/12/18/28. Order/bill lines GST-**exclusive**; retail POS GST-**inclusive**.
- **FEFO (`lib/inventory.ts`):** `reserveStock` selects non-expired batches (`qtyOnHand>0`, `expiryDate>asOfDate`) ordered by expiry asc then receivedAt asc, atomic conditional decrement per batch, **recurses** on concurrent consumption, throws `InsufficientStockError` (→409). `receiveStock` upserts batch on (tenant,product,batch,expiry). `releaseStock` restocks (fails loudly if batch missing). `getProductStock` sums non-expired only. Every mutation writes `stock_movements` (C24).
- **Double-entry ledger (`lib/ledger.ts`):** `postEntry` throws on imbalance (>0.01) and threads the caller's tx. 16 seeded accounts incl. **GRN_CLEARING** suspense bucket reconciling GRN (Inventory Dr / GRN_CLEARING Cr) vs later payable bill (GRN_CLEARING+GST-input Dr / Creditors Cr).
- **Credit exposure (`getPharmacyExposure`):** unpaid bill balances + approved-unbilled in-flight orders; enforced at create/finalize/approve; connection creditLimit precedence; `pharmacies.outstanding` denormalized + reconcilable.
- **Numbering (`lib/ids.ts`):** `ORD-YYYY-####`, `INV-YYYY-####`, `PAY-#####`, `RET-####`, `GRN-YYYY-####`, `SPAY-#####`, `PO-YYYY-####`, `PGRN-YYYY-####`, `SALE-YYYY-####`, `PPAY-#####`, `SRET-####`. Order/PO use count/max-scan with collision retry.
- **Dates:** business dates as `YYYY-MM-DD` text; `todayIST()` (Asia/Kolkata) governs same-day void; `validateExpiryDate` accepts YYYY-MM-DD / YYYY-MM / MM/YY → last day of month.

---


### 6B. HUB money / stock rules


## 9. MONEY / STOCK / STATE LOGIC (exact rules)

### 9.1 Status vocabularies
- **B2B `orders.status`**: pending→packed→dispatched→out_for_delivery→delivered (+cancelled, +split children `parent_order_id`). `order_source`: manual/whatsapp/platform/quick_order/split.
- **B2C `customer_orders.status`**: pending→confirmed→preparing→ready_for_pickup→out_for_delivery→delivered (+cancelled). `order_type`: delivery/pickup/prescription/pay_at_store.
- **payment_status**: paid/unpaid/partial/claimed/verified/rejected/failed. **refund_status**: pending/approved/rejected/processed.
- **approval_status**: pending/approved/rejected/suspended (enum defines pending/approved/rejected only).
- **consultations.status**: booked→in_progress→completed / cancelled.
- **manufacturer_returns.status**: pending/shipped/received/credited/rejected.

### 9.2 Stock RPCs
`decrement_stock` (B2B create), `deduct_product_stock` (B2B packed — **double deduction** with create), `restore_product_stock` (B2B cancel if packed+), `deduct_pharmacy_inventory` (B2C confirm), `restore_pharmacy_inventory` (customer cancel confirmed+). B2B purchasing by pharmacy = **no deduction**. B2B delivery → stockist-side `autoPopulateInventory` adds to pharmacy inventory.

### 9.3 Credit circle (`stockist_pharmacy_circle`)
Fields credit_limit/outstanding/credit_balance/payment_terms_days/is_blocked/last_payment_date/notes. **Net Due = outstanding − credit_balance**. Outstanding adjusted by `rpc("update_circle_outstanding",{p_circle_id,p_delta})` (atomic) in most flows, but **non-atomic `.update()`** in `CollectPaymentDialog`, `BillPreviewDialog`, `StockistReturns` approve/process, `StockistOrderDetail` return (credit_balance branch). Credit enforcement: pharmacy-side (`PharmacyStockistDetail`, `PharmacyQuickOrder` does NOT enforce) + stockist create-order (warning-with-override).

### 9.4 GST / tax
- **Stockist bills/orders**: NO GST computed ("TAX INVOICE" cosmetic; `gst_rate`/`hsn_code` unused; GST report reads unpopulated `bills.gst_amount`).
- **Customer Checkout**: flat **5% GST** + delivery fee → grandTotal.
- **Customer inline order (PharmacyDetail)**: raw cart total, no GST/fee.
- **B2C bill**: line items + sum only.

### 9.5 Doctor commissions (`lib/commission-calculator.ts`)
On B2C **delivered**: order must have `prescription_id` → prescription `doctor_id` → **active** `doctor_pharmacy_partnerships(doctor,pharmacy)`. Per item: `base = price×qty × default_commission_pct/100`. Rule precedence **product (rule_value===product_id) > brand (product_name includes rule_value, case-insensitive) > category (any category rule)**. If matched rule has `flat_amount>0` → `flat_amount×qty`; else if `commission_pct>0` → `itemAmount×pct/100`. Insert `doctor_commission_earnings` (`status:"pending"`, rounded 2dp) + notify doctor total.

### 9.6 Delivery-staff collection approval chain
Staff collects → order `delivery_payment_status="pending_approval"` + `delivery_collected_amount` → surfaces in StockistPayments Approvals → approve creates confirmed payment + marks order paid + reduces outstanding.

---


### 6C. MR business rule index (selected)

| Rule | Expression |
|------|------------|
| Line price (marketplace) | price × (1 − discount%/100) |
| Bill upfront | round(total × upfront% / 100); remaining = total − upfront |
| Credit utilization | Σ(due−received) vs max_credit_limit; thresholds 80/90/100 |
| Bill status buckets | paid ≤0; due_soon ≤2d; overdue <7d late; critical >7d |
| MR brand lock | brand_name = profile.business_type (client + DB trigger) |
| Revenue (MR) | Σ bills.received_amount |
| Revenue (stockist MR app) | Σ orders.total where delivered (often never set) |

---

## 7. Unified Data Model (entity catalog — merged superset)

See **Module 18** in §4A for per-app table groups.

### 7A. SP complete entity reference (48 Drizzle tables)


## 11. COMPLETE ENTITY REFERENCE — every Drizzle table (`server/src/db/schema.ts`, 48 tables)

Conventions: every table has uuid `id` defaultRandom PK unless noted; `timestamps` = createdAt+updatedAt (tz). Money = `numeric(14,2)` (strings in JS; services `Number()` them). Business dates = `text` `YYYY-MM-DD`. Tenant-scoped tables carry `tenantId → tenants (cascade)` plus a `(tenantId, id)` unique index used for cross-checked scoping in joins.

### 11.1 Auth / tenancy
- **`tenants`** — name, businessName, `tenantType` stockist|pharmacy (default stockist), stateCode (default '08'), gstin?, dlNumber?, `addressJson` (JSON text, onboarding writes `{line1}`), `notificationsJson` (JSON text holding notification toggles, `autoApprovePortalOrders`, `defaultCreditLimit`, pharmacy POS config), `inviteCode` (unique, stockists only), onboardingCompleted (bool) + onboardingStep (int), **`approvalStatus`** pending|approved|rejected (default approved; set by platform panel, not enforced at login), **KYC-ready columns currently unused by forms:** businessType, panNumber, whatsapp, city, pinCode, bankAccountJson, documentsJson, logoUrl; public-marketplace columns: isPubliclyListed (default true), acceptingNewConnections (default true), publicSlug (unique), aboutText, coverageStateCodes (CSV), categories (CSV); phone, email (both required). Lifecycle: created at register → onboarding steps → optionally publicly listed (stockists) / browseable by consumers (pharmacies).
- **`users`** — tenantId, email (unique per tenant), passwordHash, name, `role` admin|biller|pharmacist|cashier (default biller), isActive, lastLoginAt. Deactivation + password change revoke sessions via `updatedAt>iat` check. Last-admin and self-removal guards in `routes/users.ts`.
- **`refresh_tokens`** — userId, tokenHash, expiresAt, revokedAt. Written/revoked but never exchanged (no /auth/refresh).
- **`password_reset_tokens`** — userId, `jti` unique, expiresAt (15 min), usedAt. One-shot consumption in reset flow.
- **`platform_users`** — global email unique, passwordHash, name, role `super_admin`, isActive. Seeded from env at boot.
- **`consumer_accounts` / `doctor_accounts` / `mr_accounts`** — global email-unique credential tables (§9). Doctor extras: specialization, registrationNo, consultationFeeAudio/Video/Clinic (defaults 300/500/200), approvalStatus. MR extras: brand, territory.
- **`consumer_addresses`** — consumerId cascade, label (default Home), addressLine, city, pinCode, stateCode ('08'), isDefault. No API/UI yet.

### 11.2 Stockist masters & inventory
- **`suppliers`** — name, contactPerson, phone, email?, address, stateCode, gstin?, dlNumber?, paymentTermsDays (30), status active|inactive|blocked. Balance due is computed (Σ purchases − Σ supplier payments), not stored.
- **`pharmacies`** (stockist-side customer master) — name, contactPerson, phone, email?, address, stateCode, gstin?, dlNumber?, creditLimit (default '0'; UI default 50000), paymentTermsDays (30), status, **`outstanding`** (denormalized receivable, moved by finalize/payment/void/return/cancel, reconcilable from ledger), openingBalance, **`portalConnected`** + **`pharmacyTenantId`** (set when a connection is approved; the bridge between a CRM row and a real pharmacy tenant).
- **`products`** — name, genericName?, manufacturer?, category, hsnCode?, scheduleType NONE|H|H1|X|NDPS, packSize (text, '1'), baseUnit ('Tab'), saleUnit ('Strip'), convFactor (10), gstRate (numeric 5,2 default 12), mrp/purchaseRate/saleRate, minStockLevel (10), schemeBase?/schemeBonus?, isActive. Shared by both tenant types (stockist wholesale catalogue vs pharmacy retail stock); stockist writes push catalog syncs.
- **`product_batches`** — productId, supplierId?, sourcePurchaseId?, batchNumber, expiryDate (text), mrp/purchaseRate/saleRate, **qtyReceived** (immutable historical receipt) vs **qtyOnHand** (mutable), receivedAt. Unique on (tenant, product, batchNumber, expiryDate) → receive upserts. FEFO ordering = expiry asc, receivedAt asc. Lifecycle: created by purchase receive / pharmacy GRN / adjust-in; drained by order finalize, POS sale, returns-out; restocked by sale void / return restock / release.
- **`stock_movements`** (C24 canonical log) — batchId?/productId? (set-null FKs), signed `delta`, `reason` ∈ purchase_receive|grn_receive|sale|sale_void|return_restock|adjustment|transfer_in|transfer_out|write_off|other, `refType` ∈ purchase|grn|order|sale|return|adjustment|manual, refId/refNumber, notes, performedBy. `recordStockMovement` (lib/stockLedger.ts) no-ops on delta 0 and accepts the caller's tx.

### 11.3 Stockist transactions
- **`purchases`** + **`purchase_items`** — supplier GRN header (grnNumber `GRN-YYYY-####`, supplierInvoiceNo, invoiceDate, receivedDate, subtotal/taxAmount/total, status pending|received, invoiceFileUrl base64 data-URL, notes, createdBy) and lines (batchNumber, expiryDate, qty, freeQty, mrp, purchaseRate, gstRate, lineSubtotal/Tax/Total). Lifecycle: pending (editable) → received (stock in + ledger).
- **`orders`** + **`order_items`** — sales order (§2.5): orderNumber unique per tenant, orderDate, status pending|packed|shipped|delivered|cancelled, paymentMode credit|cash, totals, isInterstate/placeOfSupply, notes, `source` stockist_created|pharmacy_submitted, `externalPharmacyOrderId` (text, mirror of pharmacy PO id), stockistConnectionId, rejectionReason, trackingCarrier/Awb/shippedAt, submittedAt/approvedAt/approvedBy, createdBy. Items: productId, batchId? (first consumed FEFO batch), qty/freeQty, rate, gstRate, line amounts.
- **`bills`** + **`bill_items`** — invoice per order (**`bills.order_id` UNIQUE** = idempotent generation, C6), billNumber `INV-YYYY-####`, billDate/dueDate, isInterstate/placeOfSupply, subtotal, cgst/sgst/igst, total, paidAmount, status unpaid|partial|paid|overdue (overdue derived at read time, never stored). Items carry per-line cgst/sgst/igst + hsn via product join. Indexes on dueDate/status (me81).
- **`payments`** + **`payment_allocations`** — receivable receipts: paymentNumber `PAY-#####`, paymentDate, method cash|upi|bank|cheque, referenceNo (unique among non-voided per tenant), amount, unallocatedAmount, status successful|pending|failed|voided, notes, createdBy. Allocations link payment→bill with allocatedAmount; void reverses them.
- **`supplier_payments`** — `SPAY-#####`, same method enum, amount, reference/notes; no allocations (supplier balance is aggregate).
- **`returns`** + **`return_items`** — sales returns: `RET-####`, orderId?, pharmacyId, reason expired|damaged|wrong_item|cancelled|other, totalAmount, status requested|processed|rejected|cancelled, createdBy. Items link orderItemId?, batchId?, qty/rate/gstRate/lineTotal. Restock only for wrong_item/cancelled.

### 11.4 Ledger
- **`ledger_accounts`** — per-tenant chart, code unique per tenant, type asset|liability|income|expense|equity, parentId (unused). 16 seeded per tenant at registration: CASH, BANK, UPI_SUSPENSE, SUNDRY_DEBTORS (asset), SUNDRY_CREDITORS (liability), INVENTORY (asset), GRN_CLEARING (liability), SALES (income), SALES_RETURNS (expense), PURCHASES (expense), CGST/SGST/IGST_OUTPUT (liability), CGST/SGST/IGST_INPUT (asset).
- **`ledger_entries`** — txnDate, refType order|bill|payment|return|purchase|adjustment, refId, narration, createdBy. **`ledger_lines`** — entryId, accountId, partnerType pharmacy|supplier|null + partnerId (drives per-partner ledgers on pharmacy/supplier detail pages), debit/credit. `postEntry` rejects imbalance >0.01, resolves account codes per tenant, threads caller's tx (C2).

### 11.5 Pharmacy tenant entities
- **`pharmacy_purchase_orders`** + **`pharmacy_purchase_order_items`** — PO (§3.3): poNumber `PO-YYYY-####`, 11-state status, paymentMode, totals, notes, `externalOrderId` (uuid of the mirrored stockist order), rejectionReason, tracking fields, submittedAt/approvedAt. Items: catalogItemId?, **stockistProductId** (the stockist's product id — the cross-tenant key), productName snapshot, qty/freeQty/**receivedQty** (cumulative GRN progress), rate, gst, line amounts.
- **`pharmacy_grns`** + **`pharmacy_grn_items`** — `PGRN-YYYY-####`, receivedDate, status received|partial, notes. Items: purchaseOrderItemId?, local productId, batchId?, batchNumber/expiryDate, qty/freeQty, mrp/purchaseRate/saleRate.
- **`customers`** — retail customer master: name, phone?, email?, age?, gender?, allergies?, notes?. Only name+phone surfaced in UI.
- **`retail_sales`** + **`retail_sale_items`** — POS (§3.5): saleNumber `SALE-YYYY-####`, saleDate, customerId?, paymentMethod cash|upi|card, subtotal/taxAmount/discountAmount/total (GST-inclusive), amountReceived/changeAmount, status completed|voided (+voidedAt/By/Reason), cashierId, `paymentBreakdownJson` (split legs), **Rx fields (C26)**: rxNumber, doctorName, doctorRegNo, patientName, patientAge. Items pin batchId NOT NULL + batchNumber/expiry snapshot, qty/rate/gstRate/discountPercent/line amounts.
- **`payable_bills`** + **`payable_bill_items`** — AP mirror of stockist invoices (§3.6): stockistConnectionId, purchaseOrderId?, **externalBillId** (idempotency key) + externalOrderId, billNumber (stockist's), stockistName snapshot, dates, GST split, total/paidAmount/status (same enum as bills, overdue derived). Items: local productId? + externalProductId + productName/batch/expiry snapshots, per-line GST split.
- **`payable_payments`** + **`payable_payment_allocations`** — `PPAY-#####`, method, referenceNo (dedup), amount, status successful|voided. Allocations to payable bills; `payment.recorded`/`payment.voided` events mirror to the stockist side.
- **`stockist_returns`** + **`stockist_return_items`** — pharmacy→stockist returns (§3.7): `SRET-####`, stockistConnectionId, purchaseOrderId?/payableBillId?/externalReturnId, reason enum, totalAmount, status requested|approved|processed|rejected|cancelled, rejectionReason. Items: local productId, batchId?, qty/rate/gst/lineTotal.

### 11.6 Cross-tenant
- **`stockist_connections`** — stockistTenantId + pharmacyTenantId (pair-unique), linkedPharmacyId (the stockist's `pharmacies` CRM row), status pending|active|rejected|withdrawn|disconnected, requestSource discovery|invite_code|gstin_search, requestNote, expectedMonthlyVolume, **creditLimit/paymentTermsDays** (connection-level overrides), rejectionReason, connectedAt/disconnectedAt.
- **`stockist_catalog_items`** — per-connection synced catalogue (includes PTR `saleRate` + scheme fields + `localProductId` mapping + availabilityHint + syncedAt); unique (connectionId, stockistProductId).
- **`stockist_public_catalog_items`** — public listing per stockist product; `saleRate` column exists but is **never populated** (C12 — MRP + availability only); `isPublic` per-product visibility; unique (stockistTenantId, productId).
- **`cross_tenant_events`** — sourceTenantId/targetTenantId, eventType, payloadJson, deliveredAt (ack), createdAt; index (target, deliveredAt). **`processed_cross_tenant_events`** — (tenantId, eventId) unique claim table enabling atomic exactly-once handling.
- **`audit_logs`** — tenantId, userId?, action (METHOD path), entityType, entityId?, beforeJson/afterJson (redacted), ip, userAgent.

### 11.7 Umbrella extras (§9)
- **`online_orders`** + **`online_order_items`** — consumer B2C orders (`ONL-…`, status placed→…→delivered|cancelled, paymentMode cod|upi|online, deliveryAddressJson, prescriptionUrl). **`consultations`** — doctorId/consumerId/pharmacyTenantId?, mode audio|video|clinic, status scheduled|in_progress|completed|cancelled, scheduledAt, fee, prescriptionJson. **`mr_pharmacy_visits`** — mrId, free-text pharmacyName/phone/address/notes, visitedAt. **`smart_order_sessions`** — pharmacyTenantId, rawText, parsedJson, recommendationsJson.

### 11.8 Shared enums & constants (`shared/constants.ts`, `shared/types.ts`)
- `INDIA_STATE_CODES` — 30-entry code→name map (GST state codes; drives state dropdowns/validation). `GST_RATES = [0,5,12,18,28]`. `SCHEDULE_TYPES = NONE/H/H1/X/NDPS`. `LEDGER_ACCOUNT_CODES` (16, incl. M21 GRN_CLEARING comment). `DEFAULT_PAGE_SIZE 20`, `MAX_PAGE_SIZE 100`, `DEFAULT_CREDIT_LIMIT 50000`.
- `shared/types.ts` DTOs used by both sides: AuthUser, Login/RegisterRequest, Tenant, Pharmacy(+ListItem), Supplier, Product, ProductBatch, Order(+Item), StockistConnection, StockistCatalogItem, Bill(+Item), Payment(+Allocation), Purchase(+Item), Return(+Item), LedgerEntry/Line, AuditLog, StaffUser, `Paginated<T>` `{data,total,page,pageSize,pages}`, report shapes (SalesReportData, OutstandingReportData, GSTReportData, StockAgingItem, RequiredStockItem, ComplianceItem, DashboardKpis), AiParsedBill. Type-level enums: `PharmacyPOStatus` (all 11), `OrderStatus`, `BillStatus`, `PaymentMethod`, `PaymentStatus`, `ReturnStatus` (note: the shared type omits `rejected` which the DB/table supports), `PurchaseStatus`, `PartnerStatus`, `ScheduleType`, `ConnectionStatus` (shared type omits `withdrawn` which DB supports), `AvailabilityHint`, `LedgerRefType`, `AccountType`.

---


---

## 8. Screens & Routes Index (by module, not per-app duplicate)


### 8.1 Cross-app flow IDs


## A.1 Authentication & Onboarding Flows

| Flow ID | Flow Name | Steps | Apps |
|---------|-----------|-------|------|
| AUTH-01 | Email/password login + role select | Select role → enter credentials → verify role → approval gate (if applicable) → redirect to dashboard | ERP, HUB, MED, MR, MVP, DSW, DMVP, SP |
| AUTH-02 | Self-registration (multi-step) | Role picker → multi-step form → document upload → signUp → profile insert → pending approval or auto-active | HUB (4 roles), MR, MVP (stub), DSW, SP (single form) |
| AUTH-03 | Self-registration (tab on login) | Login page Sign-Up tab → role grid → credentials → onboarding | ERP |
| AUTH-04 | Forgot password | Enter email → reset email → click link → set new password | ERP, HUB, MED, MR, SP |
| AUTH-05 | OTP login | Phone/email OTP via `signInWithOtp` | MR |
| AUTH-06 | Admin hidden reveal | 5-tap logo → admin role option | HUB, MVP |
| AUTH-07 | Demo/prototype login | Role selector → ignore inputs → navigate to dashboard | MVP, DSW, DMVP |
| AUTH-08 | Staff login (delivery) | Username + password → RPC verify (stockist then pharmacy) → staff session | HUB |
| AUTH-09 | Onboarding wizard (post-signup) | Carousel or SlideOver steps → min-setup gates → mark complete | ERP, HUB, MR, SP, MVP, DSW |
| AUTH-10 | Pending approval wait | Poll/check approval_status → redirect when approved | HUB |
| AUTH-11 | Session timeout | Inactivity timer → warning dialog → refresh or signOut | ERP (30m), HUB (30m), SP (JWT iat check), ERP catalogue (20m) |
| AUTH-12 | Public catalogue license verify | Enter drug license + PIN → verify RPC → session → catalogue | ERP, SP (partial) |

## A.2 B2B Order Pipeline (Stockist ↔ Pharmacy)

| Flow ID | Stage | Actions | Status vocabulary (varies) |
|---------|-------|---------|---------------------------|
| B2B-01 | Create order (stockist-side) | Select pharmacy → add items (manual/paste/AI) → credit check → submit | pending/confirmed/draft |
| B2B-02 | Create order (pharmacy-side) | Browse catalogue → cart → checkout → credit check → submit | pending/placed |
| B2B-03 | Approve / Confirm | Stockist confirms or pharmacy order accepted | confirmed/accepted |
| B2B-04 | Pack | Deduct stock (FEFO/FIFO) → mark packed | packed |
| B2B-05 | Dispatch / Ship | Assign delivery staff → carrier/AWB → mark shipped/dispatched | dispatched/shipped/out_for_delivery |
| B2B-06 | Deliver | Mark delivered → auto-populate pharmacy inventory (HUB) | delivered |
| B2B-07 | Bill generation | Generate GST bill → QR (where implemented) → PDF | draft/final |
| B2B-08 | Payment collection | Record payment → credit-first FIFO → update outstanding | paid/partial/unpaid |
| B2B-09 | Returns | Initiate return → approve/reject → credit note → restore stock | pending/approved/rejected |
| B2B-10 | Split order | Split into child order `-S` suffix | HUB, DMVP |
| B2B-11 | Partial delivery | Record partial quantities delivered | HUB, DMVP |
| B2B-12 | Quick order (WhatsApp paste) | Paste text → AI/regex parse → match products → review → confirm | All apps (variant) |
| B2B-13 | Smart order (multi-stockist) | Parse → recommend Best Single / Cheapest Split / Fastest Delivery → add to cart | MED (deepest), others partial |

## A.3 B2C Order Pipeline (Pharmacy ↔ Customer)

| Flow ID | Stage | Actions | Apps |
|---------|-------|---------|------|
| B2C-01 | Browse & search | Search pharmacies/products → view catalogue | HUB, DSW |
| B2C-02 | Add to cart | Select qty → prescription flag if Rx → cart persist | HUB, DSW |
| B2C-03 | Checkout | Address → payment mode (UPI/COD) → place order | HUB, DSW |
| B2C-04 | Prescription upload | Upload Rx image → attach to order | HUB, DSW |
| B2C-05 | Rx verification (pharmacy) | Pharmacy reviews Rx → approve/reject | HUB |
| B2C-06 | Prepare & price | Add pricing → prepare order | HUB |
| B2C-07 | Deliver | Assign staff → mark delivered → deduct inventory | HUB |
| B2C-08 | B2C bill | Generate customer bill | HUB |
| B2C-09 | Doctor commission | Calculate & record commission on B2C sale | HUB |
| B2C-10 | Customer return | Customer initiates → pharmacy processes | HUB |
| B2C-11 | POS retail sale | Scan/search → add items → payment → receipt | SP |

## A.4 Payment & Credit Flows

| Flow ID | Flow Name | Logic | Apps |
|---------|-----------|-------|------|
| PAY-01 | Credit limit check | `exposure + orderTotal ≤ creditLimit` | HUB, SP, ERP, MR |
| PAY-02 | Credit-first FIFO settlement | Apply payment to oldest bills first; credit balance before outstanding | ERP, HUB, MVP, SP |
| PAY-03 | Payment approval chain | Pharmacy submits proof → stockist approve/reject/hold | ERP, HUB |
| PAY-04 | UPI link generation | Generate UPI deep link + QR → WhatsApp share | ERP, HUB, MR |
| PAY-05 | Delivery staff collection | Staff collects → pending approval → stockist approves | HUB |
| PAY-06 | Double-entry ledger posting | Sales Dr / GST Dr / Sundry Debtors Cr | SP |
| PAY-07 | Supplier payment | Record payment against purchase bills | SP, MR |
| PAY-08 | Payable bills (pharmacy) | View stockist bills → record payment | SP |

## A.5 Inventory & Product Flows

| Flow ID | Flow Name | Apps |
|---------|-----------|------|
| INV-01 | Add product (manual form) | All |
| INV-02 | Edit product + price change notification | HUB, ERP, SP, MR |
| INV-03 | Bulk upload (catalogue CSV/XLSX) | All |
| INV-04 | Purchase bill OCR upload | ERP, HUB, MED, MR, SP |
| INV-05 | Batch management (FIFO/FEFO) | HUB, ERP, SP, MVP |
| INV-06 | Stock adjustment | SP, ERP |
| INV-07 | Expiry management / dispose | HUB, ERP, SP |
| INV-08 | Stock transfer between batches | HUB, ERP |
| INV-09 | Bulk price update (% or flat) | HUB, ERP, SP, MED |
| INV-10 | AI product autofill | ERP, HUB, MED, MR, SP |
| INV-11 | OCR product label scan | ERP, MR, DSW (stub) |
| INV-12 | GRN receive (pharmacy) | SP |
| INV-13 | Auto-populate pharmacy inventory on delivery | HUB |
| INV-14 | Required stock / reorder alerts | SP, MED, HUB |

## A.6 Consultation & Prescription Flows

| Flow ID | Flow Name | Apps |
|---------|-----------|------|
| RX-01 | Book consultation (customer) | HUB, DSW |
| RX-02 | Doctor availability scheduling | HUB, DSW |
| RX-03 | Conduct consultation (audio/video/clinic) | HUB, DSW |
| RX-04 | Write prescription | HUB, DSW |
| RX-05 | Prescription templates | HUB |
| RX-06 | Upload prescription → order medicines | HUB, DSW |
| RX-07 | Doctor-pharmacy partnership + commission rules | HUB |

---


### 8.2 Screens by module


— SCREENS BY MODULE (All Apps)

## Module 2 — Auth Screens

| Screen | Route(s) | ERP | HUB | MED | MR | MVP | DSW | DMVP | SP |
|--------|----------|-----|-----|-----|-----|-----|-----|------|-----|
| Login | `/`, `/login`, `/auth` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | demo | ✓ |
| Register | `/register`, `/auth/register` | tab | ✓ | ✓ | ✓ | wizard | ✓ | unrouted | ✓ |
| Forgot Password | `/forgot-password` | ✓ | ✓ | dialog | ✓ | stub | — | unrouted | ✓ |
| Reset Password | `/reset-password` | ✓ | ✓ | — | ✓ | stub | — | unrouted | ✓ |
| Pending Approval | `/pending-approval` | — | ✓ | — | — | — | — | unrouted | — |
| Staff Login | `/staff/login` | — | ✓ | — | — | — | — | — | — |
| Onboarding (per role) | `/onboarding/*` | ✓ | ✓ | — | ✓ | ✓ | ✓ | — | SlideOver |
| Demo Home | `/` | — | — | — | — | — | — | ✓ | — |
| Admin Login | `/admin-login` | — | — | — | — | ✓ | ghost | — | — |

## Module 3 — Stockist Screens

| Screen | Route pattern | ERP | HUB | MED | MR | MVP | DSW | DMVP | SP |
|--------|---------------|-----|-----|-----|-----|-----|-----|------|-----|
| Dashboard / Home | `/stockist/home`, `/stockist`, `/dashboard` | ✓ | ✓ | ✓ | seller | ✓ | ✓ | ✓ | ✓ |
| Products / Inventory | `/stockist/products`, `/products` | ✓ | ✓ | ✓ | my-products | ✓ | ✓ | ✓ | ✓ |
| Product Add | `/products/add` | dialog | page | page | form | page | dialog | page | modal |
| Product Edit | `/products/edit/:id` | dialog | page | page | form | page | dialog | page | modal |
| Product Detail | `/products/:id` | inline | page | — | — | page | page | wrapper | page |
| Orders List | `/stockist/orders`, `/orders` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Order Detail | `/orders/:id` | ✓ | ✓ | ✓ | dialog | ✓ | ✓ | ✓ | ✓ |
| Create Order | `/order-creation`, `/orders/create` | ✓ | ✓ | — | form | ✓ | ✓ | ✓ | ✓ |
| Pharmacies / Circle | `/pharmacies` | ✓ | ✓ | ✓(MR) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Pharmacy Detail | `/pharmacies/:id` | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| Find Pharmacy | `/pharmacies/find` | — | ✓ | — | — | ✓ | dialog | ✓ | — |
| Payments | `/payments` | ✓ | ✓ | ✓ | ✓ | stub | toast | ✓ | ✓ |
| Payment Approvals | `/payment-approvals` | ✓ | — | — | — | — | toast | — | — |
| Bills / Bill History | `/bills`, `/bill-history` | dialog | ✓ | — | form | — | dialog | ✓ | ✓ |
| Returns | `/returns` | — | ✓ | — | — | — | dialog | ✓ | ✓ |
| Credit Notes | `/credit-notes` | — | ✓ | — | — | — | — | — | — |
| Analytics | `/analytics` | ✓ | ✓ | — | ✓ | ✓ | — | — | reports |
| Reports | `/reports/*` | — | ✓ | — | ✓ | — | — | — | ✓ |
| Delivery Settings | `/delivery-settings`, `/delivery-dates` | ✓ | ✓ | ✓ | planner | ✓ | — | ✓ | — |
| Delivery Routes | `/delivery-routes` | route-exec | ✓ | — | — | — | — | ✓ | — |
| Serviceable Areas | `/serviceable-areas` | in settings | ✓ | — | — | — | — | ✓ | — |
| Staff Management | `/staff` | — | ✓ | — | — | — | — | — | settings |
| Batch Management | `/batch-management` | — | ✓ | — | — | page | — | ✓ | in product |
| Expiry Management | `/expiry-management` | — | ✓ | — | — | page | — | ✓ | alerts |
| Stock Transfer | `/stock-transfer` | — | ✓ | — | — | — | — | ✓ | — |
| Bulk Bill | `/bulk-bill` | — | ✓ | — | — | — | — | — | — |
| Manufacturer Returns | `/manufacturer-returns` | — | ✓ | — | — | — | — | — | — |
| Suppliers | `/suppliers` | — | — | — | my-suppliers | — | — | — | ✓ |
| Purchase Bills | `/purchase-bills` | — | bill-hist | — | — | page | — | — | ✓ |
| Required Stock | `/required-stock` | — | — | — | — | — | — | — | ✓ |
| Route Execution | `/route-execution` | ✓ | — | — | — | — | — | — | — |
| Pharmacy Approvals | `/pharmacy-approvals` | ✓ | — | — | — | — | — | — | — |
| Batch Ordering | `/batch-ordering` | ✓ | — | — | — | — | — | — | — |
| Profile / Settings | `/profile`, `/settings` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Export / Export Catalogue | `/export`, `/export-catalogue` | dialog | ✓ | — | — | — | — | — | CSV |

## Module 4 — Pharmacy B2B Screens

| Screen | Route pattern | ERP | HUB | MED | MR | MVP | DSW | DMVP | SP |
|--------|---------------|-----|-----|-----|-----|-----|-----|------|-----|
| Dashboard | `/pharmacy`, `/pharmacy/portal` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Browse Stockists | `/stockists`, `/browse` | ✓ | ✓ | ✓ | marketplace | ✓ | ✓ | ✓ | discover |
| Stockist Catalogue | `/stockists/:id` | ✓ | ✓ | ✓ | seller/:id | ✓ | ✓ | ✓ | — |
| Cart | `/cart` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Checkout | `/checkout` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Orders (B2B) | `/orders` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | purchase-orders |
| Order Detail | `/orders/:id` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Smart Order | `/smart-order` | — | partial | ✓ | — | — | dialog | — | — |
| Inventory | `/inventory`, `/products` | ✓ | ✓ | — | — | ✓ | ✓ | ✓ | ✓ |
| GRN | `/grn` | — | — | — | — | — | — | — | ✓ |
| Ledger (per stockist) | `/ledger/:id` | — | ✓ | — | — | — | — | ✓ | payable-bills |
| Quick Order | `/orders/quick` | — | ✓ | — | — | — | — | ✓ | — |
| Recurring Orders | `/recurring-orders` | — | ✓ | — | — | — | — | — | — |
| Bulk Import | `/bulk-import` | — | ✓ | bulk-upload | — | bulk | — | — | — |

## Module 5 — Pharmacy B2C / Sale Screens

| Screen | Route pattern | HUB | DSW | SP |
|--------|----------|-----|-----|-----|
| Sale Dashboard | `/pharmacy` (sale mode) | ✓ | ✓ | — |
| POS | `/pos` | — | — | ✓ |
| Customer Orders | `/customer-orders` | ✓ | sale/orders | — |
| Customer List | `/customer-list` | ✓ | — | customers |
| Customer Returns | `/customer-returns` | ✓ | — | — |
| B2C Bills | `/b2c-bills` | ✓ | — | sales |
| Commissions | `/commissions` | ✓ | — | — |
| Consultations (settings) | `/consultations` | ✓ | sale/consult | — |
| Doctors (partnerships) | `/doctors` | ✓ | — | — |

## Module 6 — Public Catalogue Screens

| Screen | Route | ERP | SP |
|--------|-------|-----|-----|
| License Verification | `/catalogue/:slug` | ✓ | partial |
| Catalogue Dashboard | `/catalogue/:slug/dashboard` | ✓ | — |
| Products | `/catalogue/:slug/products` | ✓ | API |
| Orders | `/catalogue/:slug/orders` | ✓ | — |
| Checkout | `/catalogue/:slug/checkout` | ✓ | — |
| Bill Verification | `/verify-bill/:billId` | — | ✓ |
| Pharmacy Registration (public) | `/pharmacy-registration` | ✓ | — |

## Module 7 — MR / Seller Variant Screens

| Screen | Route | ERP | MR |
|--------|-------|-----|-----|
| MR Dashboard | `/mr/dashboard` | ✓ | ✓ |
| MR Pharmacies (visits) | `/mr/pharmacies` | ✓ | ✓ |
| Collections | `/mr/collections` | ✓ | — |
| My Products (seller catalogue) | `/my-products` | — | ✓ |
| Marketplace Browse | `/marketplace` | — | ✓ |
| OTC Partnership | `/otc-partnership` | — | ✓ |
| Bill Form | `/bills/new` | — | ✓ |
| Delivery Planner | `/delivery-planner` | — | ✓ |

## Module 8 — Patient / Customer Screens

| Screen | Route | ERP | HUB | DSW |
|--------|-------|-----|-----|-----|
| Dashboard | `/customer/dashboard`, `/patient/dashboard` | ✓ | ✓ | ✓ |
| Search | `/search` | ✓ | ✓ | ✓ |
| Pharmacies | `/pharmacies` | — | ✓ | ✓ |
| Cart | `/cart` | — | ✓ | ✓ |
| Checkout | `/checkout` | ✓ | ✓ | ✓ |
| Orders | `/orders` | ✓ | ✓ | ✓ |
| Order Track | `/orders/:id/track` | — | ✓ | — |
| Order Review | `/orders/:id/review` | — | ✓ | — |
| Order Return | `/orders/:id/return` | — | ✓ | — |
| Prescriptions | `/prescriptions` | ✓ | ✓ | ✓ |
| Upload Prescription | `/upload-prescription` | — | ✓ | — |
| Consultations | `/consultations` | — | ✓ | ✓ |
| Book Consultation | `/consultations/book` | — | ✓ | dialog |
| Addresses | `/addresses` | — | ✓ | ✓ |
| Reminders | `/reminders` | — | ✓ | ✓ |
| Wishlist | `/wishlist` | ✓ | ✓ | ✓ |
| Health Profile | `/health-profile` | — | ✓ | — |
| Past Doctors | `/past-doctors` | — | ✓ | — |
| Compare Prices | `/compare` | ✓ | — | dialog |
| AI Assistant | `/ai-assistant` | ✓ | — | — |

## Module 9 — Doctor Screens

| Screen | Route | ERP | HUB | DSW |
|--------|-------|-----|-----|-----|
| Dashboard | `/doctor` | partial | ✓ | ✓ |
| Consultations | `/consultations` | — | ✓ | ✓ |
| Consultation Detail | `/consultations/:id` | — | ✓ | ✓ |
| Patients | `/patients` | — | ✓ | ✓ |
| Write Prescription | `/prescriptions/write` | — | ✓ | dialog |
| Prescription Templates | `/prescription-templates` | — | ✓ | — |
| Availability | `/availability` | — | ✓ | ✓ |
| Earnings | `/earnings` | — | ✓ | ✓ |
| Pharmacies (partnerships) | `/pharmacies` | — | ✓ | — |
| Analytics | `/analytics` | — | ✓ | — |

## Module 10 — Brand Screens

| Screen | Route | ERP |
|--------|-------|-----|
| Dashboard | `/brand/dashboard` | ✓ |
| Products | `/brand/products` | ✓ |
| Campaigns | `/brand/campaigns` | ✓ |
| Analytics | `/brand/analytics` | ✓ |
| Fulfilment | `/brand/fulfilment` | ✓ |
| Profile | `/brand/profile` | ✓ |

## Module 11 — Delivery Staff Screens

| Screen | Route | ERP | HUB |
|--------|-------|-----|-----|
| Staff Login | `/staff/login` | — | ✓ |
| Staff Dashboard | `/staff` | — | ✓ |
| Route Execution | `/stockist/route-execution` | ✓ | — |

## Module 12 — Admin Screens

| Screen | Route | ERP | HUB | MR | MVP | DSW | DMVP | SP |
|--------|-------|-----|-----|-----|-----|-----|------|-----|
| Dashboard | `/admin` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | tenant |
| Users | `/admin/users` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Approvals | `/admin/pharmacy-approvals`, entity lists | ✓ | ✓ | — | ✓ | ✓ | ✓ | — |
| Orders (B2B+B2C) | `/admin/orders`, `/admin/customer-orders` | — | ✓ | — | — | — | — | — |
| Consultations | `/admin/consultations` | — | ✓ | — | — | — | — | — |
| Returns / Refunds | `/admin/returns`, `/admin/refunds` | — | ✓ | — | — | — | — | — |
| Analytics | `/admin/analytics` | ✓ | ✓ | — | ✓ | ✓ | ✓ | reports |
| Counterfeit | `/admin/counterfeit` | — | ✓ | — | — | — | — | — |
| Audit Trail / Logs | `/admin/audit-logs`, `/admin/audit-trail` | ✓ | ✓ | role-audit | ✓ | ✓ | ✓ | ✓ |
| Recalls | `/admin/recalls` | ✓ | — | — | — | — | — | — |
| Notices | `/admin/notices` | ✓ | — | — | — | — | — | — |
| Disputes | `/admin/disputes` | ✓ | — | — | — | — | — | — |
| Drug Schedules | `/admin/drug-schedules` | — | ✓ | — | — | — | — | — |
| Serviceable Areas | `/admin/serviceable-areas` | territories | ✓ | — | — | — | — | — |
| System Architecture (Flowboard) | `/admin/system-architecture` | — | ✓ | — | user-flow | — | — | — |
| Maintenance / ToS | `/admin/maintenance`, `/admin/tos-management` | — | ✓ | — | — | — | — | — |
| Impersonate / Force Reset | `/admin/impersonate`, `/admin/force-reset` | — | ✓ | — | — | — | — | — |
| Geo Distribution | `/admin/geo-distribution` | — | ✓ | — | — | — | — | — |
| API Monitoring | `/admin/api-monitoring` | — | ✓ | — | — | — | — | — |

---


### 8.3 Modals and dialogs inventory


— MODALS, DIALOGS, SHEETS (By App)

## ERP — 20 Dialogs
QuickOrderDialog, QuickBillDialog, OCRScanDialog, BulkUploadDialog, BillUploadDialog, MapRouteDialog, KPIDetailDialog, ExportDataDialog, EditOrderDialog, AddProductDialog, EditProductDialog, ProductScanDialog, QuickUpdateStockDialog, AddPharmacyDialog, EditPharmacyDialog, PharmacySelectDialog, OrderItemsDialog, PaymentLinkDialog, OrderConfirmationDialog, MarkPaymentDialog

## HUB — Key Overlays
QuickBillDialog, EditPharmacyDialog, CollectPaymentDialog, BillPreviewDialog, BulkUploadCatalogue, BulkUploadPurchaseBill, BatchManager, ProductForm, ToSDialog + ~30 inline dialogs in StockistOrderDetail

## MED — Key Overlays
MarginSettingsModal, inline Forgot Password AlertDialog

## MR — 8 Modals
QuickOrderModal, QuickBillModal, OCRUploadModal, BulkUploadModal, PaymentProcessModal, ProductDetailModal, UpdateBillModal, MarginSettingsModal

## MVP — Key Overlays
EditProfileModal + registration wizard steps

## DSW — 40+ Dialogs
Stockist: QuickOrder, QuickBill, OCRScan, MapRoute, AddProduct, EditProduct, CollectPayment, CreateReturn, etc.  
Pharmacy: SmartOrder, Checkout, ApplyCoupon, ComparePrices, SaleOrder, StartConsultation, RecordPatient, GoLive  
Patient: UploadPrescription, BookConsultation  
Doctor: WritePrescription

## SP — 27 Modals + SlideOver
AddProductModal, EditProductModal, AdjustStockModal, BulkPriceEditModal, AddPharmacyModal, EditPharmacyModal, ApprovePharmacyOrderModal, RejectPharmacyOrderModal, ShipOrderModal, RecordDeliveryModal, GenerateBillModal, InitiateReturnModal, RecordPaymentModal, UploadBillModal, EditPurchaseModal, SetSaleRatesModal, AddSupplierModal, EditSupplierModal, RecordSupplierPaymentModal, AddUserModal, ApproveConnectionModal, RejectConnectionModal, ConnectStockistModal, ReceiveGrnModal, InitiateStockistReturnModal, PharmacyAddUserModal, AuditDetailModal, ConfirmDialog, OnboardingFlow (SlideOver), PharmacyOnboardingFlow (SlideOver)

---


---

## 9. API & Integration Surface (SP Express routes summary + Supabase edge functions union)

See **Module 13** in §4A for edge function union.

### 9.1 SP Express route mounts

`/auth` · `/public` · `/pharmacies` · `/products` (+/autofill) · `/orders` (+/parse-text) · `/bills` · `/payments` · `/purchases` (+/parse) · `/returns` · `/purchase-orders` · `/grn` · `/payable-bills` · `/payable-payments` · `/retail-sales` · `/customers` · `/stockist-connections` · `/events` · `/smart-order` · `/communication` · `/platform` · `/accounts/*` · `/reports` · `/settings` · `/audit-logs` · `/users` · `/system`

Boot: `GET /api/health`; `ensurePlatformAdmin` from env; inline migration on PGlite.

### 9.2 Supabase RPC union

`has_role`, `check_login_rate_limit`, `record_login_attempt`, `verify_staff_credentials`, `hash_password`, `decrement_stock`, `deduct_product_stock`, `restore_product_stock`, `deduct_pharmacy_inventory`, `restore_pharmacy_inventory`, `update_circle_outstanding`, `check_credit_limit`, `get_next_bill_number`, `get_next_order_number`, `update_bill_statuses`, `admin_override_*`, `approve-reject-payment`

---

## 10. Implementation Reality Matrix (what works vs mock/stub/broken per app)

See **Module 19** stub inventory in §4A. Summary matrix:

| Capability | ERP | HUB | MED | MR | MVP | DSW | DMVP | SP |
|------------|-----|-----|-----|-----|-----|-----|------|-----|
| Real backend writes | full | full | partial | full | stub | stub | mock | **full** |
| B2B order E2E | full | full | partial | partial | stub | stub | mock | **full** |
| GST invoice | partial | stub | partial | — | stub | stub | — | **full** |
| Credit enforce | full | partial | — | partial | partial | — | mock | **full** |
| FIFO payments | full | partial | — | partial | full | — | mock | **full** |
| Ledger | — | — | — | — | — | — | — | **full** |
| FEFO | partial | partial | partial | partial | full | — | — | **full** |
| Cross-tenant sync | — | — | — | — | — | — | — | **full** |
| Smart order | partial | partial | **full** | partial | stub | stub | mock | partial |
| B2C checkout | — | **full** | — | — | — | stub | — | stub |
| POS + Rx | — | partial | — | OTC | — | — | — | **full** |
| Payment gateway | partial | partial | **mock** | partial | stub | stub | mock | full |
| AI OCR/parse | full | full | partial | full | — | stub | null | full |

**Critical defects:** HUB double stock deduct · HUB no GST on bills · MED mock payments · MR buyer order bug · MVP reg stub · DMVP no-op writes · SP smart-order PO handoff stub · MR due_amount bug · HUB reviews table mismatch

---

## 11. Per-App Unique Features (ONLY features not covered above — brief)

| App | Unique-only |
|-----|-------------|
| **ERP** | Brand portal; offline sync queue; route execution; batch ordering; payment approvals edge fn; public pharmacy registration dual approval |
| **HUB** | Flowboard v5 dataset; manufacturer returns; peer/support chat; recurring orders (no scheduler); 5-tap admin reveal; platform invoice calculator |
| **MED** | Smart-order-recommend pure SQL; bulk upload drafts; PWA /install page |
| **MR** | Username/OTP; OTC partnership; legacy unrouted Dashboard.tsx; seller-locked cart; jit@ADMIN1 admin gate |
| **MVP** | AppStateContext 29-slice engine; PLATFORM/CIRCLE types; rolePermissions matrix (unenforced) |
| **DSW** | GuidedTour persistence; dual purchase/sale mode; voice sim consult; hardcoded Rahul persona |
| **DMVP** | Mock supabase filter no-ops; sp-001/pp-001 personas; 659-line order detail UI |
| **SP** | PGlite; GRN_CLEARING ledger; event bus; umbrella panels; bill QR verify E2E |

---

### 11A. SP user journeys (role-by-role)


## 16. COMPLETE USER JOURNEYS — per tenant & role

### 16.1 Stockist ADMIN
1. **Onboard:** Register (toggle Stockist) → auto-login → Dashboard opens `OnboardingFlow` (Business Profile DL/GST/address → add first pharmacy → import products → add biller staff → Complete; server enforces DL + ≥1 pharmacy + ≥1 active product). Invite code auto-generated at registration for portal connections.
2. **Set up trade:** Suppliers → Add Supplier; Products → Add Product / Bulk Import CSV; Purchases → UploadBillModal (AI or manual) → SetSaleRatesModal for zero-PTR products → Receive Stock (batches + Inventory/GST-input/Creditors posting); Pharmacies → Add Pharmacy (credit limit, terms, opening balance).
3. **Connections:** Settings→Connections shows invite code + pending requests (from discovery/GSTIN/invite) → Approve (set credit limit + terms; creates/links CRM pharmacy row, syncs catalog, emits `connection.approved`) or Reject (canned reasons; 7-day cooldown for the pharmacy). Public Profile tab controls listing/slug/about/coverage/per-product visibility + public catalog sync.
4. **Manual order:** Orders→New Order — paste WhatsApp text or add lines, watch live credit widget, Save as Pending (no stock reserved) or Create & Pack (FEFO reserve + ledger + bill if credit) → Ship (carrier/AWB) → Record Delivery → bill auto/manual (`GenerateBillModal`) → Payments→Record Payment (FIFO or manual allocation, reference dedup) → optionally Initiate Return on delivered orders → Process/Reject return (credit note, bill/outstanding adjustments).
5. **Portal order:** bell/badge or Incoming widget → ApprovePharmacyOrderModal (credit bars + stock shortfall table) → Approve / Approve & Pack (or Reject with reason) → pack/ship/deliver — **bill must exist before delivery** for portal orders → pharmacy payments arrive as `payment.recorded` events and post automatically.
6. **Monitor:** Dashboard KPIs; Required Stock → Procure deep-link; Reports (all 8); Audit Logs; Settings (staff, order defaults incl. auto-approve, notifications, security, system export). Voids: payment void (admin), order cancel rules (§2.5).

### 16.2 Stockist BILLER
Login → same shell minus admin nav (no Audit Logs/Settings; Reports hub shows Sales + Stock Ageing only). Can: browse pharmacies/orders/bills/products; **generate bills** on packed/shipped orders; **record customer payments** (supplier payments remain admin-only); create purchases + parse AI (purchase creation is admin/biller); export purchases; **cannot** create/approve/ship/deliver/cancel orders (admin-only endpoints), void payments, edit pharmacies/products (product write is stockist-admin only), or touch settings/staff/connections. Route-guard: `/orders/create` admin-only; OrderDetail shows biller "Generate Bill" but hides admin actions; Override bill status allowed (admin/biller) with notes/reference rules.

### 16.3 Pharmacy ADMIN
1. **Onboard:** Register (Pharmacy toggle; DL required) → PharmacyOnboardingFlow (profile → connect a stockist [gate: pending/active connection; 3 discovery suggestions] → import products → optional opening stock → staff). Completion requires ≥1 ACTIVE connection, so it typically finishes only after a stockist approves.
2. **Connect & order:** Discover (`/pharmacy/discover`) or Connect via invite code/GSTIN search → wait for approval (7-day cooldown after rejection) → Stockist detail → Catalog (resync, map/create local products) → New PO (2-step, credit bar) → Submit (mirror order created on stockist; `CATALOG_DRIFT`/credit checks; auto-approve possible) → track stepper via 10s event polling → Confirm Receipt when shipped → Receive GRN (batch/expiry/split, over-receive guarded, idempotency key) → payable bill lands from `bill.generated` → Record Payment (FIFO, reference dedup; mirrors to stockist) → Initiate Return to stockist when needed (restocks on their rejection).
3. **Retail:** POS (FEFO batch, Rx gate for scheduled drugs, split payment, discount) → receipt print → same-day void if needed; Customers CRUD; Expiry Alerts; Smart Order for multi-stockist quotes.
4. **Admin surfaces:** Settings (business, staff [pharmacist/cashier], POS config, notifications, security), Audit Logs, all reports incl. GST/payables/profit/compliance.

### 16.4 PHARMACIST
Everything procurement + retail except admin surfaces: discover/connect stockists, create/submit/cancel POs, GRN, payable bills + payments (record but **not void** — void is admin), stockist returns, products (create/edit/adjust via `sharedProductAdjust`), POS + sales, customers, reports Sales/Stock-aging, expiry alerts. No settings, audit logs, GST/payables/profit/compliance reports, payment voids, or sale voids (void retail sale = admin, same-day).

### 16.5 CASHIER
Narrowest: Dashboard, POS, Sales history/detail, Customers (create allowed), Products (list/detail with MRP/GST/rates hidden). Sidebar/BottomNav collapse accordingly; all procurement/finance/report routes are `pharmPlus`/admin and render Access Denied if forced. Completes sales incl. Rx capture; cannot void.

### 16.6 PLATFORM SUPER-ADMIN
Boot-seeded from env → `/platform/login` → dashboard stats → Tenants/Approvals table → Approve/Reject tenant `approvalStatus` (informational for now — not enforced at tenant login). No tenant-data drill-down beyond `{tenant, staff}` endpoint.

### 16.7 CONSUMER / DOCTOR / MR (umbrella, minimal)
Consumer: register/login → browse publicly-listed pharmacies → add products to cart → COD order (`placed`, no fulfilment flow) → track list; book video consult with an approved doctor. Doctor: register (auto-approved in dev, pending in prod with no approval UI) → view consultations list. MR: register → record/list free-text pharmacy visits. All three panels are subject to the layout children/Outlet wiring caveat in §9.2.

---


### 11B. HUB user journeys (role-by-role)


## 19. COMPLETE USER JOURNEYS (end-to-end, per role)

### 19.1 Customer (patient)
1. **Register** (3 steps, auto-active, no approval) → login (role "Patient") → `/customer`.
2. **Find medicine**: Dashboard → Search (cheapest-first across visible pharmacy inventories) or Pharmacies (PIN-matched via `pharmacy_serviceable_areas`) → pharmacy page → add to cart (single-pharmacy cart; switching pharmacy prompts clear).
3. **Order**: Cart → Checkout → delivery/pickup → fee + flat 5% GST → payment cash / pay_at_store / UPI(+proof upload, status "claimed") → Rx upload if cart has Rx items → order `pending`, pharmacy notified. (Alternate: inline order on pharmacy page — no GST/fee; or `upload-prescription` which creates an item-less `order_type:"prescription"` order for the pharmacy to price.)
4. **Track**: order detail stepper; pharmacy confirms (stock deducted) → prepares → out_for_delivery/ready_for_pickup → delivered. Customer may Cancel (pending/confirmed; restocks if confirmed+), "I've Paid", Reorder, Return (→ `customer_returns` pending), Review (writes orphan `reviews`), download invoice.
5. **Consult**: Book (choose doctor/type/free datetime, fee shown, pay-later or self-attested UPI) → doctor runs booked→in_progress→completed → prescription written → "Order Prescription Items" seeds cart at price 0 → pharmacy auto-prices. Reminders (localStorage), Wishlist, Addresses, Health profile support the loop.

### 19.2 Pharmacy (dual-mode)
1. **Register** (5 steps, docs) → pending → admin approves → login. **Purchase mode**: Find stockists → add to circle → order via stockist page cart (credit-limit enforced) or Quick Order (AI text parse → best-stockist ranking; no credit check) → stockist fulfils → on delivery stockist auto-populates `pharmacy_inventory` → pharmacy pays (Record Payment w/ UPI proof, status pending) or is collected from; ledger/credit notes track balance; returns requested via order detail.
2. **Inventory**: add manually (AI autofill), bulk-import from stockist catalog (qty 0, hidden), audit/expiry manage, visibility toggle for the B2C shopfront.
3. **Sale mode**: customer order arrives (notification) → verify Rx (gate) → confirm (stock deducts) → price/substitute/partial as needed → assign own delivery staff or ready_for_pickup → delivered (commissions fire if prescription-linked) → B2C bill, UPI verification, Mark Paid, customer-return approvals (refund only, no restock).
4. **Doctor partnerships**: accept doctor requests, per-rule commissions accrue on delivered Rx orders, Mark Paid per earning.

### 19.3 Stockist
1. **Register** (PIN-gated by `admin_serviceable_areas`, bank required) → approval → build catalog (form + AI, bulk XLSX, AI bill scan, batches via BatchManager).
2. **Circle**: find/accept pharmacies, set credit_limit/terms/blocked, monitor Net Due.
3. **Order lifecycle**: create manually/WhatsApp-parse (stock decrements at create) or receive platform/quick orders → packed (second deduction — known defect) → dispatched → assign staff (least-loaded suggestion) → out_for_delivery → delivered (+auto-populate pharmacy inventory). Edit/split/partial/duplicate/cancel/return along the way; bill per order or bulk; packing slip print.
4. **Money**: FIFO collect dialog, manual record, staff-collection approvals, WhatsApp reminders, receipts, ledgers, credit notes; analytics/reports/exports; ops via staff, routes, holidays, serviceable PINs, expiry buckets, stock transfer, manufacturer returns.

### 19.4 Doctor
Register (fees defaulted 300/500/200) → approval → set availability (unused by booking) → receive bookings → run consult (paste meeting link, notes, status transitions, mark paid) → write prescription (templates, pharmacy-inventory-aware item search, walk-in patient lookup) → partner with pharmacies (request → pharmacy accepts) → commission earnings accrue on delivered Rx orders → track earnings/analytics/patients/follow-ups.

### 19.5 Delivery staff (both kinds)
Owner creates credentials (hash_password RPC) → `/staff/login` (dual-type verify) → 24h localStorage session → see assigned open orders → Plan Route (Google Maps waypoints) → Mark Delivered (stockist staff: photo proof + optional cash/online collection → owner approval queue; pharmacy staff: status flip only) → KPIs (pending/today/total).

### 19.6 Admin
Hidden login (5-tap) → dashboard KPIs → approval queues (stockist/pharmacy/doctor, doc iframes, per-doc status, reject reasons, bulk loops) → oversight (orders w/ status override RPCs, payments, bills, returns, commissions, consultations override, refund state machine on cancelled paid B2C orders) → user ops (suspend/restore, view-as, force reset email, partial merge) → comms (broadcast/targeted, support chat as `admin` sender, quick-question CRUD) → safety (counterfeit alerts fan-out, license-expiry nudges, reviews view) → config (settings hub, banners, plans, areas, reference lists, maintenance flag, ToS) → intelligence (analytics drill-down, revenue, platform invoice, geo, system report, active users, login/audit trails, api monitoring) → Flowboard encyclopedia + architecture AI chat.

---


### 11C. MR end-to-end workflows (data mutations)


## 17. END-TO-END WORKFLOWS (exact data mutations, step by step)

### 17.1 Signup → role assignment (three cooperating mechanisms)
1. User submits `Auth.tsx` signup → `auth.signUp` with metadata `{username, name, phone, business_name, business_type, upi_id, role, admin_password?}`.
2. **DB trigger** `handle_new_user` fires synchronously inside the auth insert: validates admin password (raises → whole signup fails for bad admin attempts), inserts profiles (upsert) + user_roles (default 'pharmacy' when metadata missing), swallows any other error.
3. **Client** then uploads the license file to `licenses/{uid}/{ts}_{role}_document.{ext}` and patches `profiles {verification_document_url: path, email}`.
4. **Client** calls `assign-role` with the session token — normally a no-op for the role (trigger already inserted one; the function's `.single()` existing-role check finds it) but its profile **upsert overwrites** profile fields with metadata again and force-sets `is_catalogue_live: true, is_verified: false`.
5. If email confirmation is enabled, step 3–4 silently skip (no session token); the trigger's inserts stand. A user who somehow has no role row gets routed by DashboardRouter/useRoleGuard to `/onboarding`, where `OnboardingSelectRole` calls `assign-role` with a generated username — the second path into the same function.
6. Toast → `/dashboard` → DashboardRouter dispatches on the role.
Verification afterwards: user appears in AdminDashboard's "Pending Verifications" KPI (is_verified=false + document present); admin flips is_verified in UserManagement. Verification has minimal downstream effect: only the Featured Sellers query, the "Verified Only" marketplace pill, Profile's badge and the dead canGoLive flag consume it — an unverified seller can sell normally.

### 17.2 Seller catalogue build-up (4 entry paths converging on `products`)
- **Manual** (ProductForm): AI Auto-fill (public autocomplete fn) pre-populates; MRP→margin calculator derives sale_rate; image → public bucket; insert with seller_type stockist/distributor (MR→'stockist', §2.4). DB trigger #2 enforces MR brand.
- **OCR** (OCRUploadModal → ocr-product-label): photo + 4 manual numbers → Gemini extracts → fuzzy match own catalogue → stock-merge update (stock += input, rates overwritten) or AI-enriched create. Modal `onSuccess` invalidates `products`/`my-products`/`all-products`.
- **Bulk** (BulkUploadModal): CSV via PapaParse (`header: true, skipEmptyLines`) or XLSX via SheetJS `sheet_to_json`; per-row validation (name present, sale_rate>0, stock_quantity≥0); sequential single-row inserts with progress bar `(i+1)/total`; category normalised `toLowerCase().replace(/\s+/g,'_')` cast `as any` (an unknown label produces an invalid enum → row error collected, up to 10 shown); template download generates a 2-row sample workbook.
- **Visibility controls**: per-product `is_available` toggle (MyProducts) hides from pharmacy browse pages; profile-level `is_catalogue_live` switch hides *all* products at RLS level (§14 #20) while keeping the seller card visible in `/marketplace`.

### 17.3 Marketplace purchase: cart → checkout → fulfilment → stock
1. Pharmacy browses `/marketplace` (sellers) or `/marketplace/products` (all products) or `/seller/:id`.
2. **Add to cart** (MarketplaceProducts): upsert `cart_items {buyer_id, seller_id: product.stockist_id, product_id, quantity}` on conflict (buyer_id,product_id); seller-lock enforced client-side against `cartItems[0].seller_id`. (SellerDetail path skips the lock, §3.4.)
3. **Cart** `/cart`: server-backed lines, qty stepper mutates quantity (0 ⇒ delete), totals = Σ price×(1−discount%)×qty.
4. **Checkout** `/checkout`: requires delivery address; client-side order number `ORD/{buyerOrderCount+1, pad 4}`; inserts `orders` (buyer_id, seller_id=stockist_id=cart's seller, pharmacy_id=**buyer profile id**, status+delivery_status 'pending', address/notes) then `order_items` (discounted unit price, subtotal), then deletes the cart rows; navigates `/orders` (where the buyer sees nothing, §2.5).
5. **Seller fulfilment** (Orders detail dialog, delivery_status machine): pending →(Confirm)→ confirmed →(Mark as Packed, **stock decremented** per line `max(0, stock−qty)`)→ packed →(Ship + tracking id)→ shipped →(Mark as Delivered, delivered_at=now)→ delivered; Cancel from any non-terminal state (**cancelling after packing does not restore stock**). Payment Link generation available packed-onward: UPI deep link from seller's upi_id + wa.me share to buyer's phone.
6. **MR post-delivery**: "Create Bill for This Order" → BillForm prefilled `?orderId&pharmacyId&amount` (works only if the order's pharmacy_id matches an MR-owned pharmacies row — true for OrderForm-created orders, not for marketplace ones).

### 17.4 Receivables: bill → credit → reminders → settlement
1. **Creation** (4 paths, §15.2 bills). PharmacyDetail's path additionally seeds payment_requests + payment_reminders and sets reminder_count=1; QuickBill/QuickOrder decrement stock at bill time (they treat a bill as an implicit fulfilled order).
2. **Credit control**: PharmacyDetail live-checks `check_credit_limit` (display-only warning tiers 90/100%); BillForm computes `previous_due + total − upfront` client-side and hard-blocks above `max_credit_limit`. Utilization everywhere = Σ(due−received) over non-paid bills.
3. **Status machine**: `update_bill_statuses()` run on PharmacyDetail load re-buckets by remaining_due_date (paid / pending / due_soon ≤2d / overdue <7d late / critical >7d late) — §8.2 table. StatusBadge renders the buckets with day counts.
4. **Reminders**: PharmacyDetail "Send Reminder" inserts a followup payment_reminders row + bumps bills.reminder_count/last_reminder_sent; Orders' payment-link dialog and QuickOrder open `wa.me/{phone}` with `generateWhatsAppMessage` text; Payments page inserts payment_requests and plays the 2-second PaymentProcessModal simulation. Nothing sends anything server-side.
5. **Settlement**: UpdateBillModal partial/full (received_amount, optional status='paid'); Payments' Mark Paid (status only). No receipt records, no payment gateway, no reconciliation — settlement is manual bookkeeping.

### 17.5 OTC partnership (as it behaves today)
Pharmacy → `/otc-partnership`: wizard select plan → select ≤max_brands brands → review → "Complete Payment (Dummy Payment)" inserts `pharmacy_otc_subscriptions {payment_status:'paid', status:'active', selected_brands:[ids]}`. Because nothing calls `initialize-otc-inventory`, no otc_inventory/otc_shipments rows appear; the pharmacy sees the "active subscription" summary card (plan name, ₹{stock_value/1000}k, brand count) on OTCPartnership and the (duplicated) Profile OTC card, but the Dashboard OTC Overview card (conditioned on inventory rows) never renders. If the function were called (e.g. manually), it would seed 24 products ×40 units across the 3 brands + 3 delivered shipments, lighting up the dashboard card with Σmrp×qty value and the flat-5% earnings estimate. `quantity_sold` has no writer — there is no OTC sales-recording flow.

### 17.6 Premium subscription (fully coded, unreachable)
Upgrade.tsx (unrouted): pay ₹999 to 9672123710 → upload screenshot (private-bucket getPublicUrl bug §5.7/§9.2) + UTR → subscription_requests pending → admin/Subscriptions.tsx (unrouted) Approve → profile becomes premium for 30 days / Reject with reason. `subscription_tier` feeds only the Premium/Free badges; **no feature in the app actually checks the tier** (the "3 free customers" limit exists as columns only).

### 17.7 Destructive admin operations
- **Wipe**: AdminDashboard Danger Zone (typed phrase, includeAdmins checkbox) → admin-wipe fn: row-deletes 14 tables (leaves all 4+2 OTC tables and both storage buckets untouched), then deletes auth users one-by-one via admin API, skipping admins unless included. Client signs out (if admins included) or reloads.
- **Self-delete**: Profile → type DELETE → delete-my-account fn (14-entity cascade, §7.5; leaves OTC data and storage files orphaned) → signOut → /auth.

---


---


---

## 4B. Deep-Dive Flow Specifications (merged from primary implementations)

> The following sections add **step-by-step screen/service detail** from the reference implementations (SP full-stack, ERP/HUB Supabase, MED Smart Order, MVP client engine, MR bill workflow). They supplement §4A Module summaries without replacing them.

### 4B.1 SP Stockist panel (reference B2B seller)

## 2. STOCKIST PANEL

Shell `MainLayout`. Sidebar groups (Sidebar.tsx): **[Dashboard]**; **Operations**: Pharmacies, Incoming Orders (badge = live incoming count, path `/orders?source=pharmacy&status=pending`), Orders, Bills, Payments, Returns; **Inventory**: Products, Purchases (`/purchase-bills`), Suppliers, Required Stock, Reports; **Admin (adminOnly)**: Audit Logs, Settings. Footer = user chip + logout. Mobile `BottomNav`: Home / (Incoming when count>0) / Orders / Pharmacies / Bills + "More" sheet (all modules, admin-gated). Header: product search (Enter→`/products?search=`), notification bell (alerts: incoming orders, pending connection requests, low-stock, overdue bills + event history + "Sync now"), profile menu (Settings admin-only, Sign out).

### 2.1 Dashboard (`/dashboard` → `reportService.getDashboardKpis`)
- **Controls:** KPI period date-from/date-to (default month-to-date). On first load, if `user && !onboardingCompleted && role==='admin'` → opens `OnboardingFlow`.
- **KPIs (StatCards):** Today's Sales (Σ `orders.total` where orderDate=today); Period Sales (Σ total in range); **Total Outstanding (admin only)** (Σ `pharmacies.outstanding`); Awaiting Pack = `packBacklogOrders` (pending AND (source≠pharmacy_submitted OR approvedAt not null)) → `/orders?status=pending`; Incoming Portal = `incomingPortalOrders` (pharmacy_submitted + pending + approvedAt IS NULL) → incoming filter; Active Connections (status='active') → `/settings?tab=connections`; Low Stock Items = count of products with Σ non-expired on-hand `< minStockLevel` → `/required-stock`; Overdue Bills = `buildOverdueBillFilter` count → `/bills?status=overdue`.
- **Widgets:** `IncomingOrdersWidget` (5 latest pharmacy_submitted+pending, click→order); Recent Orders (5 latest, badge); Low Stock (5, click→product).
- **Quick actions:** New Order (admin), Review Incoming, Record Payment (`/payments?record=1`), Add Purchase, View Reports.

### 2.2 Onboarding (`dashboard/OnboardingFlow.tsx`, SlideOver, 4 steps)
Steps: **Business Profile** (fields: DL required, GST optional [validated if entered], Registered Address textarea → saved as `addressJson.line1`; persists via `PATCH /settings/tenant` + `PATCH /settings/onboarding`), **First Pharmacy** (gate: `hasPharmacy` else blocks Next), **Import Products** (gate: `hasProducts`), **Add Staff** (`hasStaff` = >1 user; complete). Dismiss/X/backdrop = best-effort save + persist step **without** completing. Server `PATCH /settings/onboarding` enforces min-setup gates (see §2.11).

### 2.3 Pharmacies (`/pharmacies`, `/pharmacies/:id`) — `routes/pharmacies.ts`
**List:** search (name/phone/gstin/dl), Portal filter (All/Connected/Manual → `portalConnected`), Status filter (active/inactive/blocked), Add Pharmacy. Columns: Pharmacy(name+address) · Contact(person+phone) · Outstanding (red if >0) · Portal badge · Status badge. Mobile cards.
**AddPharmacyModal (SlideOver):** Pharmacy Name*, Owner/Contact Person, GSTIN, State Code (default 08), **Drug License (DL)\***, Credit Limit, Opening Balance, Payment Terms (COD/7/15/30), Phone*, Email, Address textarea. Client-validates phone/state/gstin/email; `normalizePhone`. `POST /pharmacies` (admin). **EditPharmacyModal** mirrors (PATCH).
**Server (`PharmacySchema`):** name≥2, contactPerson default 'Contact', phone≥7, email optional, address default, stateCode, gstin/dlNumber optional, creditLimit default `DEFAULT_CREDIT_LIMIT=50000`, paymentTermsDays 30, status active, openingBalance 0. Create/edit require admin.
**Detail page:** header actions Edit / Deactivate↔Activate (Deactivate uses ConfirmDialog) / Record Payment. StatCards: Outstanding, Total Orders, Credit Limit, Payment Terms. Sidebar: Business Profile (contact/phone/email/address) + Compliance & Billing (DL/GSTIN/state/opening balance). **Tabs:** Orders (list→order), Bills (unpaid), **Ledger** (opening balance row + Sundry Debtors partner lines with running balance; shows discrepancy banner between computed vs stored `outstanding`; admin "Reconcile Outstanding" → `POST /:id/reconcile-outstanding` recomputes from ledger), Returns, Connection (portal-connected only; shows pharmacyTenantId).
**Endpoints:** list; `:id`; `:id/orders`; `:id/bills` (`?unpaidOnly`); `:id/outstanding-bills`; `:id/credit-info` (uses `getPharmacyExposure`); `:id/returns`; `:id/ledger`; `POST /` (admin); `PATCH /:id` (admin); `POST /:id/reconcile-outstanding` (admin).

### 2.4 Products & batches (`/products`, `/products/:id`) — shared `routes/products.ts`
**List (`ProductListPage`, panel-aware):** search (name/generic/hsn), category filter (from `/products/categories`), Add Purchase (stockist admin/biller → `UploadBillModal`), Bulk Update, Add Product, Export (admin → `/products/export` CSV). Columns: Product(name + hsn/manufacturer, low-stock ⚠) · Category · Stock (red if ≤min) · MRP · GST. Cashier (pharmacy) hides MRP/GST columns.
**Server list:** `currentStock` = correlated subquery **summing only non-expired batches** (`expiry_date > CURRENT_DATE`); filters `isActive` unless `includeInactive`; category; search. `export=1` admin-only up to 50 000 rows; `truncated` flag when >pageSize.
**AddProductModal (SlideOver):** Product Info — Name*, Generic Name, Manufacturer (datalist of existing), Category (select from categories or free text)*, HSN, Schedule (NONE/H/H1/X/NDPS), Pack Size, Conv. Factor, Base Unit (Tab), Sale Unit (Strip), Scheme Base, Scheme Bonus, GST Rate (0/5/12/18/28), Status; Pricing — MRP*, Purchase Rate*, Sale Rate*; Inventory — Min Stock Level. Client `validateHsn` (4–8 digits) + `validateProductPrices` (purchase≤MRP, sale≤MRP, sale≥purchase). **EditProductModal** = same minus scheme/units/status.
**Server `ProductSchema`:** name≥2, category, scheduleType, packSize coerce>0 default 1, baseUnit/saleUnit defaults, convFactor default 10, gstRate 0–28 default 12, mrp/purchaseRate/saleRate positive, minStockLevel default 10, isActive default true. On create/update by a **stockist** → `pushCatalogToActiveConnections(tenantId,[id])` background (re-syncs all active connection catalogs + public catalog). Pharmacy create/update do not push.
**AdjustStockModal (SlideOver):** Batch select (shows on-hand + expiry + EXPIRED/xd-left), signed Quantity Change (+/−, non-zero), Reason (damaged/expired/cycle_count/lost/other) — **must be actively chosen**, Notes. Projects `currentOnHand → projected`. Server `adjust-stock` (`sharedProductAdjust`): existing batch only; **stockist requires `sourcePurchaseId`**; newOnHand≥0; **newOnHand ≤ qtyReceived (C25)** — cannot inflate stock beyond historical receipt; writes `stock_movements` reason `adjustment`, never mutates `qtyReceived`.
**BulkPriceEditModal (SlideOver):** downloads `/products/export` as CSV template (id/name/mrp/purchaseRate/saleRate), re-upload; client parses (`parseCsvLine`), requires `id` column, PATCHes each row; shows per-row failures.
**Detail page:** KPI cards (Current Stock+baseUnit, Min Level, MRP [hidden for cashier], HSN). Tabs: **Product Info** (Details/Categorisation + Rates & Taxes [MRP/PTR/Purchase/GST]) and **Batches (n)** (Batch #, Expiry with tier badge, Qty On Hand, MRP, Purchase Source→purchase bill link or "Direct Entry"). Actions: Adjust Stock (admin, or pharmacist on pharmacy), Edit (canWriteProducts).
Other endpoints: `/:id/batches` (order by expiry asc); `POST /from-catalog/:catalogItemId` (pharmacy-only — resale saleRate defaults to MRP not cost).

### 2.5 Orders (`/orders`, `/orders/create`, `/orders/:id`) — `routes/orders.ts` + `orderService.ts`
**State machine:** `pending → packed → shipped → delivered`, plus `cancelled`. Source `stockist_created | pharmacy_submitted`. Synthetic list filter **`approved`** = pending AND approvedAt not null; `pending` for pharmacy_submitted **excludes** approved-but-unpacked (`isNull(approvedAt)`).
**List:** filters search, Pharmacy, dateFrom/dateTo, Source (All/Pharmacy Portal/Manual), Status (pending/approved/packed/shipped/delivered/cancelled). Inline **Approve** button (admin only) for pharmacy_submitted+pending+!approvedAt → `ApprovePharmacyOrderModal`. New Order (admin) → create page. Columns: Order# · Pharmacy · Source badge · Date · Status · Total · Actions.
**CreateOrderPage (admin only route):** sessionStorage draft (`stockist:createOrderDraft`) auto-restore/save. Left: line table (product select showing stock, Qty [capped to stock with toast], Rate editable, GST% display, Amount, delete). "Paste Order" WhatsApp parser (regex `^(name)[sep](x?)(qty)(unit)?$`, fuzzy match exact→contains→token). Right: Select Pharmacy (active only), **live credit widget** for credit mode (exposure/limit/headroom, red if exceeds), Order Date, Payment Mode (credit/cash), Notes, GST summary (client `computeGst` seller=tenant.stateCode vs buyer=pharmacy.stateCode → CGST/SGST or IGST), Grand Total. Actions: Draft Print, **Save as Pending**, **Create & Pack** (create then finalize). Blocks submit if exceeds credit or credit still loading.
**`createOrder` (server, admin):** prices each line at product `saleRate`, `computeGst` per line, `placeOfSupply=pharmacy.stateCode`, `isInterstate` from tenant vs pharmacy state; order number `ORD-YYYY-####` with **3-attempt collision retry**; for **credit** mode: pharmacy must be `active` (`PHARMACY_INACTIVE`), and `creditLimit>0` → refuse if `exposure+total > limit` (`CREDIT_LIMIT_EXCEEDED`). Batch auto-picked for display only.
**`finalizeOrder`/`finalizeOrderCore` (POST /:id/finalize, admin):** transaction — must be `pending`; pharmacy_submitted requires `approvedAt`; re-check credit (exclude self); **reserve stock FEFO** per line (`reserveStock`) rolling back all reservations on `InsufficientStockError`; sets first consumed batchId onto order item; status→`packed`; portal → emit `order.packed`; credit → `pharmacies.outstanding += total`; **post sales ledger** (credit: Debtors Dr / Sales Cr + CGST/SGST or IGST Cr; cash: Cash Dr / Sales Cr + taxes); then **generateBill** if `pharmacy_submitted || credit`.
**Ship (POST /:id/ship, admin):** requires `packed`; conditional UPDATE to `shipped` with carrier/awb/shippedAt; **generates bill (idempotent)** for portal/credit; emits `order.shipped` with carrier/awb/shippedAt. `ShipOrderModal`: Carrier (optional), AWB (optional).
**Deliver (POST /:id/deliver, admin):** requires `packed`/`shipped`; **portal orders require an existing bill** else `BILL_REQUIRED`; status→`delivered`; emits `order.delivered`. `RecordDeliveryModal` (SlideOver): read-only item table (product/qty/batch), "stock released from FIFO batches" note (note: stock already reserved at pack).
**Approve (POST /:id/approve, admin):** `approvePharmacyOrder`: must be pharmacy_submitted+pending+!approvedAt; pharmacy active; credit check uses **connection.creditLimit** first, else pharmacy limit; sets approvedAt/approvedBy, emits `order.accepted`; `finalizeNow` → finalize in same tx. `ApprovePharmacyOrderModal`: shows order/pharmacy/total, **credit utilisation bars** (used/after), item stock table (short lines red), blocks approve if `afterOrder<0` or any short line or detail error. Buttons **Approve** / **Approve & Pack**.
**Reject (POST /:id/reject, admin):** reason≥3; status→cancelled + rejectionReason; emits `order.rejected`. `RejectPharmacyOrderModal` textarea.
**Cancel-approved (POST /:id/cancel-approved, admin):** only when pending+approvedAt; clears approval, status→cancelled; emits `order.cancelled`. Reason modal (≥3).
**Cancel (POST /:id/cancel, admin):** allowed `pending`/`packed`; **blocked if bill exists** (`OrderHasBillError`→400 code ORDER_HAS_BILL); packed cancel: release stock, `outstanding -= total` (GREATEST 0), reversing ledger; emits `order.cancelled` for portal.
**Generate bill (POST /:id/bill, admin/biller):** `GenerateBillModal` (SlideOver) shows order/pharmacy/items/amount; navigates to bill. **Initiate return (POST /:id/return, admin):** only `delivered` orders; `InitiateReturnModal`.
**Order detail page:** stepper (Pending→Packed→Shipped→Delivered or Pending→Cancelled). Banners: portal-submitted, bill generated, bill-required-before-delivery, rejection reason. Tabs: **Items & Stock** (product/batch/exp, qty, rate, GST%, total) and **Manage Actions** (Generate Bill card, Initiate Return card for delivered). Header actions by role/state: Print; admin Cancel (pending/packed, no bill); portal Approve/Reject; non-portal Pack; approved-portal Cancel Approved + Pack; Ship (packed); Record Delivery (packed/shipped, blocks if bill required); Generate Bill (admin/biller when no bill & packed/shipped). Non-admin portal-pending sees "Admin approval required".
**Detail server (`GET /:id`):** items with `stockOnHand` (all batches) + per-item `returnedQty` (sum of return items) + batch info; linked bill; `creditInfo{limit,used,available}` (connection limit preferred); `hasBill`.
**`getPharmacyExposure` (credit engine):** = unpaid bill balances Σmax(0,total−paid) + in-flight approved-but-unbilled orders (pending/packed/shipped with approvedAt and no linked bill). Enforced at create, finalize, approve.
**AI order parse (POST /orders/parse-text, admin/biller):** gated `FEATURE_AI_PARSE`; `aiOrderParseService` (Gemini `gemini-2.0-flash`) → catalogue-matched line items (exact/high/low/none confidence). No dedicated UI (Create page uses its own client-side parser).

### 2.6 Bills (`/bills`, `/bills/:id`) — `routes/bills.ts` + `billService.ts`
**`generateBill`** — idempotent (unique index on `bills.order_id` + `23505` short-circuit); computes GST per line, `subtotal+tax=total`, billNumber `INV-YYYY-####`, `dueDate = billDate + pharmacy.paymentTermsDays (default 30)`. For **portal** orders emits **`bill.generated`** carrying full line items (externalProductId, batch, rates, cgst/sgst/igst, lineTotal) so pharmacy mirrors a payable bill.
**Overdue is derived, not stored** — `markOverdueBills` is a deliberate no-op (never clobbers `partial`); `isBillOverdue`/`buildOverdueBillFilter` = unpaid/partial + dueDate<today + total>paid. List injects `displayStatus`.
**List:** search (billNumber/pharmacy), status (All/Paid/Partial/Unpaid/Overdue). Columns: Invoice# · Pharmacy · Date · Due (color-coded: red overdue/≤0d, amber ≤7d) · Status · Total · Paid · Outstanding. Footer page-total.
**Detail page (`#invoice-content` printable):** seller header (tenant name/address/GSTIN/DL/state), "IGST INVOICE" vs "GST INVOICE", invoice/date/due; Billed-To; item table (Product+batch/exp · HSN · Qty · Rate · Taxable · GST% · Total); **Payments Allocated** table (payment#/date/method/status/allocated, voided rows struck-through); totals (Taxable, CGST/SGST or IGST, Invoice Total, Paid, Outstanding); footer "computer generated invoice" (**no QR — `additions.md §A`**). Actions: status badge; Initiate Return (if orderId + delivered + status in partial/paid/unpaid); Record Payment (if not paid); **Send WhatsApp** (client rasterizes `#invoice-content` to PDF via `invoicePdf.ts`, `POST /communication/send-bill`; gated `features.whatsapp`+configured); Print; **Override Status** (admin/biller): Mark unpaid (only if paid=0) or Mark paid (requires Notes; non-cash requires reference) — Mark paid routes through `recordPayment` for the outstanding amount + writes `BILL_MARKED_PAID` audit; partial is not manually settable.
**`PATCH /:id/status`** — status ∈ unpaid/partial/paid; paid requires notes; paid+outstanding→synthetic payment via `recordPayment`; unpaid only if currentPaid=0; partial→400 "Use Record Payment".

### 2.7 Payments received (`/payments`, `/payments/:id`) — `routes/payments.ts` + `paymentService.ts`
**RecordPaymentModal (SlideOver):** Pharmacy account, Outstanding banner, Amount Received*, Payment Mode (upi/cash/bank/cheque), Reference (label per method: UTR/Reference/Cheque #; **onBlur dedup** via `GET /payments/check-reference` → warns "Already used on payment X"), Date, **Bill Allocation** table (checkbox + editable amount per outstanding bill; **Auto FIFO** button fills oldest-first). Validates pharmacy/amount/refWarning/non-cash-reference/alloc≤amount.
**`recordPayment` (admin/biller):** non-cash requires reference (`REFERENCE_REQUIRED`) + **unique non-voided reference** (`DUPLICATE_REFERENCE`); transaction: allocate FIFO across oldest bills (or explicit allocations, alloc-sum≤amount); conditional bill UPDATE recomputes status and **refuses over-allocation** (`paid+alloc ≤ total`); `outstanding -= totalAllocated` (GREATEST 0); posts ledger (method account Dr / Debtors Cr). Payment number `PAY-#####`.
**List:** search, Record Payment; opens via `?record=1` or router state. Columns: Date · Pharmacy · Mode badge · Reference · Status badge · Amount.
**Detail:** Payment Info (amount/mode/reference/status/date) + Pharmacy Details + Bill Allocations. **Void (POST /:id/void, admin):** `voidPayment` — reverses allocations (restore bill paid/status), `outstanding += totalAllocated`, status→voided, reversing ledger (Debtors Dr / method Cr). ConfirmDialog.

### 2.8 Purchases / GRN (stockist) (`/purchase-bills`, `/purchase-bills/:id`) — `routes/purchases.ts` + `purchaseService.ts`
**List:** search (grn/invoice/supplier), supplier filter, status (pending/received), date range + "Last 30 Days" toggle, Export (up to 50k), Add Purchase. Columns: GRN/Invoice(+supplier inv) · Supplier · Date · Status · Amount. Supports `?procureProductId&procureQty` deep-link (from Required Stock) auto-opening the modal.
**UploadBillModal (SlideOver):** modes **Upload PDF** (AI) / **Manual Entry** (auto-selects manual if AI disabled). Header: Supplier (search + select)*, Invoice # (supplier), Invoice Date. Upload: drag/drop PDF/PNG/JPG ≤10MB → **"Parse with AI (Gemini)"** → `POST /purchases/parse` fills lines. Manual line items (add/remove): product (search existing OR type new name), Batch #*, Expiry (date), Qty*, Free, MRP*, Rate*, GST select. Per-line missing-field toast. On save invoice file is read to a base64 data-URL and sent as `invoiceFileUrl`. If server returns `productsNeedingSaleRate` → opens **SetSaleRatesModal**.
**`createPurchase` (admin/biller):** `findOrCreateProductFromLine` — by productId, else name (ilike) match, else **creates General-category product with saleRate 0**; computes line subtotal/tax; inserts `pending` purchase `GRN-YYYY-####`; returns `productsNeedingSaleRate` (products with saleRate≤0). Expiry normalized via `validateExpiryDate`.
**SetSaleRatesModal (SlideOver):** per product MRP/Purchase/Sale-rate (PTR) input (required >0); `POST /sale-rates`; "Skip for now" allowed but receiving is blocked until set.
**Detail:** header status; Edit (pending only → `EditPurchaseModal`: supplier/invoiceNo/date/notes); View Invoice (if file); Print GRN; **Receive Stock** (if not received). KPI cards (Total/Supplier/Invoice Date). Tabs: **Items** (product/batch-expiry/qty/free/MRP/rate/GST/lineTotal + totals with intra/interstate split) and **Ledger** (posted after receive).
**`receivePurchase` (POST /:id/receive):** refuses if any product saleRate≤0 (names listed); transaction: `receiveStock` per line (upsert batch on tenant+product+batch+expiry, sets saleRate from product), status→received + receivedDate; posts **Inventory Dr / GST-input(CGST+SGST or IGST) Dr / Sundry Creditors Cr** (interstate from supplier state vs '08' buyer). ConfirmDialog.

### 2.9 Suppliers & supplier payments (`/suppliers`, `/suppliers/:id`) — `routes/suppliers.ts`, `routes/supplierPayments.ts`
**List:** search (name), status; Add Supplier; inline Edit. Columns: Supplier(name+gstin) · Contact · State · Status · Balance Due (= Σpurchases − Σpayments, floor 0) · edit. **AddSupplierModal:** Company Name*, Contact Person*, GST, DL, Phone*, Email, State Code*, Payment Terms (COD/7/15/30/45/60), Address*. Server `SupplierSchema`: name/contact≥2, phone≥7, address≥5, stateCode, optional gstin/dl, terms 30, status active. Create/edit admin/biller.
**Detail:** StatCards To-Pay (outstanding) + Total YTD Purchases; tabs Info / Purchases (→purchase) / **Ledger** (purchases as debit, payments as credit, running balance). Record Payment (admin). **RecordSupplierPaymentModal:** Amount*, Mode (bank/upi/cash/cheque), Date*, Reference, Notes. `recordSupplierPayment` (admin) → `SPAY-#####` + ledger (Creditors Dr / method Cr).

### 2.10 Returns (sales returns) (`/returns`, `/returns/:id`) — `routes/returns.ts` + `returnService.ts`
**List:** search, source (manual/portal), Initiate Return (admin → pick delivered order modal → `InitiateReturnModal`). Columns: Return# · Pharmacy · Source badge · Date · Status · Refund.
**InitiateReturnModal (SlideOver):** per returnable line (qty − prior returns): Batch select (per-product batches), Rate, remaining/of-ordered, Return Qty. Reason (expired/damaged/wrong_item/cancelled/other), Notes. Client blocks qty>remaining and requires batch for wrong_item/cancelled. `createReturn`: validates returnable vs orderItem.qty − prior returns; `RET-####`; status `requested`.
**Detail:** Summary (Total/Reason/Date/Bill#/Order link); Pharmacy; Returned Items; printable **Credit Note** (`#credit-note-content`). Actions (requested + admin): **Reject** (reason≥3 modal → `rejectReturn`) / **Process** (ConfirmDialog).
**`processReturn` (POST /:id/process, admin):** transaction with conditional flip `requested→processed`; **restock only for wrong_item/cancelled** (requires batchId); GST-inclusive credit; must be linked to order (or portal return); refuses credit>orderTotal+0.01; reduces linked bill paidAmount then total, keeps `payment_allocations` in sync (reduce/delete largest first); `outstanding -= (grossCredit − billCredit)`; posts Sales-Returns Dr / GST-output Dr / Debtors Cr; portal → emits `return.processed` with creditAmount/allocationToBill/billTotalReduction/outstandingReduction. `rejectReturn` emits `return.rejected` with reason; DB adds `rejected` status.

### 2.11 Required stock, Audit logs, Settings
- **Required Stock (`/required-stock`, `getRequiredStockReport`):** products with Σ on-hand `< minStockLevel`; deficit banner; per row In Stock/Min/Shortage + **Procure** → `/purchase-bills?procureProductId&procureQty`; Copy List (clipboard), Export.
- **Audit Logs (`/audit-logs`, admin):** filters entity type (stockist set: orders/payments/bills/returns/purchases/users), user, date range; columns Timestamp(tz) · User · Action · Entity(link) · Details · view(→AuditDetailModal). Export paginates all. `routes/audit.ts` admin-only.
- **Settings (`/settings`, admin):** left-nav tabs. **Business info** (`PATCH /settings/tenant`, strict Zod GSTIN/phone/state regex, empty gstin→null, slug-collision→409, stockist marketing fields stripped for pharmacy; stockist save triggers `syncPublicCatalog`): Business Name*, Email*, Phone*, DL, GSTIN, State Code, Address. **Connections** (`ConnectionsTab`): invite-code card (copy), Pending Requests table (pharmacy/gstin/phone + Approve/Reject) and Active Connections (credit limit + Sync Catalog + Disconnect). `ApproveConnectionModal`: Credit Limit (defaults from `defaultCreditLimit` or 50000) + Payment Terms. `RejectConnectionModal`: canned reasons + Other. Disconnect via ConfirmDialog. **Public Profile** (`PublicProfileTab`): List publicly, Accept new connections, Public URL slug (preview), About, Categories (CSV), Coverage state codes (CSV), Save + **Sync Public Catalogue**, per-product visibility checkboxes. **Staff/Users:** table + Add User (`AddUserModal`: Name/Email/Password/Role[admin,biller]); deactivate/reactivate/remove (self-row shows "You"; server last-admin + self-guards). **Order Defaults** (`OrderDefaultsTab`): Auto-approve portal orders toggle + Default credit limit → `notificationsJson`. **Catalog Sync** (`CatalogSyncTab`): frequency (manual only) + Sync All Active Connections. **Security:** change password. **Notifications:** lowStockAlerts / overduePayments toggles. **System:** download Users CSV.
- **Onboarding server (`PATCH /settings/onboarding`, admin):** step 0–4; can't move backwards after completion; completing requires DL≥3 chars AND (stockist: ≥1 pharmacy + ≥1 active product; pharmacy: ≥1 active connection) else 400 with `missing[]`.
- **`GET /settings/features`** → `{whatsapp, aiParse, whatsappConfigured}`. Public-catalog endpoints stockist-admin only.

### 2.12 Reports (`/reports` + subpages) — `routes/reports.ts` (shared, branches on tenantType) + `reportService.ts`
Hub cards (role-gated): Sales (admin/biller), Outstanding (admin), GST (admin), Profit (admin), Stock Ageing (admin/biller), Compliance (admin), Portal Orders (admin), Purchase Analysis (admin). Master CSV digest export (admin). Report logic:
- **Sales** (`from/to`, paginated orders): daily totals, top products (by lineTotal), top pharmacies, by-category, summary (total/orders/avgOrderValue).
- **Outstanding** (`asOfDate`): per unpaid non-voided bill outstanding + ageDays from dueDate; **aging buckets** current/≤30/≤60/≤90/90+; top defaulters (≤10); totalOutstanding, overdueAmount (age>0), avgCollectionDays.
- **GST** (`month`): sales CGST/SGST/IGST + taxable/total from bills; **purchase ITC** split intra/inter by supplier vs tenant state; per-rate breakdown from billItems.
- **Stock aging** (`asOfDate`): per batch age from receivedAt, value=qty×purchaseRate; buckets 0-30/31-60/61-90/90+.
- **Compliance** (`type` H1 default or `all`, `month`): scheduled-drug dispensing register (order date, pharmacy+DL, product, schedule, batch, qty, bill#). Invalid type→error.
- **Profit** (`from/to`): COGS from batch `purchaseRate` (fallback product), gross profit, margin%, by-category, daily profit.
- **Portal orders** (`from/to`): approval rate = approved/(approved+rejected), status counts, top pharmacies. `approved`=has approvedAt; `rejected`=!approvedAt+cancelled+rejectionReason.
- **Purchase analysis** (`from/to`): total spend, supplier count, top suppliers.
Report roles server-side: sales/stock-aging/required-stock = admin+biller+pharmacist; outstanding/gst/compliance/profit/portal-orders/purchase-analysis = admin. Charts via Recharts.

---

### 4B.2 SP Pharmacy panel (reference B2B buyer + POS)

## 3. PHARMACY PANEL

Shell `PharmacyMainLayout` (teal). Sidebar groups: [Dashboard, Discover Stockists]; **Sales**: POS/New Sale, Sales History, Customers; **Procurement**: Connected Stockists, Purchase Orders, Inbound GRN; **Inventory**: Products, Expiry Alerts; **Finance**: Payable Bills, Payments Made, Returns; **More**: Reports; **Admin (adminOnly)**: Settings, Audit Logs. Role gating: cashier sees only Dashboard/POS/Sales/Customers/Products; cashier hidden from anything with "stockists". Mobile BottomNav differs for cashier (Home/POS/Sales/Customers) vs pharmacist/admin (Home/POS/POs/GRN + More).

### 3.1 Dashboard (`/pharmacy/dashboard` → `pharmacyReportService.getPharmacyDashboardKpis`)
Onboarding banner (admin "Continue Setup" → `PharmacyOnboardingFlow`; non-admin shows progress). KPIs: Today's Retail Sales, Month Retail Sales, Pending POs (submitted/accepted), Payables Outstanding, Low Stock Items, Awaiting GRN (delivered/partially_received). Quick actions: New Sale, Place Order, Receive GRN, Record Payment. Widgets: Recent Purchase Orders (5) and **Expiring Soon** (batches ≤90d from stock-aging; hidden for cashier).
**PharmacyOnboardingFlow (5 steps):** Business Profile (DL*/GST/Address), Connect Stockist (gate: pending/active connection; shows 3 discover stockists), Import Products (gate: hasProducts), Opening Stock (skippable), Add Staff. Server gate requires ≥1 active connection to complete.

### 3.2 Discover & connect — `routes/public.ts` (unauth) + `stockist-connections` + `connectionService`
- **Discover (`/pharmacy/discover`):** search (name/gstin) + state filter; cards (name, gstin, product count, "Not accepting requests", categories); paginated. Data via `GET /api/public/stockists` (dedupes listings, IP rate-limited 60/min).
- **Public profile (`/pharmacy/discover/:slug`):** header (name, gstin, state, about, partner/product counts, categories); public catalogue table (Product/Category/MRP/Availability — **no PTR**, `C12`); Request Connection (admin/pharmacist, if accepting + not connected) → SlideOver (Note, Expected monthly volume) → `POST /stockist-connections/request {stockistTenantId, requestSource:'discovery'}`; Place Order if active. `GET /api/public/stockists/:slug` + `/:slug/catalog` (page size ≤20).
- **Connected Stockists (`/pharmacy/stockists`):** search + status filter (active/pending/rejected/withdrawn/disconnected); Connect Stockist + Discover. Rows: name/gstin/status/creditLimit/Withdraw (pending). **ConnectStockistModal (SlideOver):** Invite Code mode OR GSTIN/Name search (`GET /stockist-connections/search`) → connect. `requestConnection` guards: no self-connect, stockist must be `acceptingNewConnections`, pharmacy tenants only, **7-day cooldown after rejection** (`REQUEST_COOLDOWN`); emits `connection.requested`.
- **Stockist detail (`/pharmacy/stockists/:connectionId`):** tabs Overview (status/gstin/phone/credit limit/terms/connected), **Catalog** (last synced + Resync; rows Product/MRP/Rate/GST/Synced + **Map Local Product** select + "Create from catalog" for admin/pharmacist), Orders, Bills, Ledger (from payable bills). `pullCatalogForPharmacy`/`syncCatalogToConnection` share DB so writes propagate immediately.

### 3.3 Purchase Orders (`/pharmacy/purchase-orders`) — `routes/purchaseOrders.ts` + `pharmacyPurchaseOrderService.ts`
**11-state enum:** `draft → submitted → accepted/rejected → packed → shipped → delivered → partially_received → received`, plus `cancel_requested`/`cancelled`.
**List:** search (PO#), status filter (all 11), New PO. Columns PO#/Date/Stockist/Status/Total.
**CreatePurchaseOrderPage** (`?connectionId`, `?duplicateFrom`, `?editFrom`): 2-step (Select Stockist → Add Items). Step 2: change stockist, Notes, **Add from catalog** (search, click to add; auto-syncs empty catalog), line table (qty editable, rate/total, remove), **credit utilisation bar** (outstanding+order vs connection limit, blocks Submit if exceeds). Save Draft / **Submit Order** (create/update then submit).
**`createPurchaseOrder`/`updatePurchaseOrder` (admin/pharmacist):** draft only; prices lines; `PO-YYYY-####` with 3-attempt retry.
**`submitPurchaseOrder`:** must be draft; active connection with `linkedPharmacyId`; **every stockistProductId must still be in catalog** else `CATALOG_DRIFT`; connection credit check (`getPayablesOutstanding` + total) → `CREDIT_LIMIT_EXCEEDED`; transaction **creates the mirror `orders` row on the stockist tenant** (`source:'pharmacy_submitted'`, `externalPharmacyOrderId=PO.id`, order# with retry), copies items, conditional flip draft→submitted (`PO_NOT_SUBMITTABLE`), sets `externalOrderId`; emits `order.submitted`; if stockist `autoApprovePortalOrders` → `approvePharmacyOrder` (auto-reject on credit/stock failure). Error codes mapped to 400/409 with `code`.
**Detail page:** stepper (draft→…→received; partial/rejected/cancel_requested/cancelled terminals). Banners for shipped (Confirm Receipt then GRN), delivered (Receive GRN), rejected reason, cancel pending, cancelled. Item table (Qty/Received/Rate/GST/Total). Actions by state: Duplicate to Draft (**rejected only** — `additions.md §E`), Edit Draft, Submit, **Confirm Receipt** (shipped→delivered), **Receive GRN** (delivered/partially_received → `ReceiveGrnModal`), Initiate Return (received/partially_received, admin/pharmacist → `InitiateStockistReturnModal`), Cancel, Delete (draft), Sync now.
**Cancel semantics (`cancelPurchaseOrder`):** draft→local cancel; submitted & stockist pending→cancel both sides in one tx + emit `order.cancelled`; accepted/packed→`cancel_requested` + `order.cancel_requested` (finalized on stockist ack); shipped/delivered/cancelled→`PO_NOT_CANCELLABLE`.
**`confirmPurchaseOrderReceipt`:** shipped→delivered (conditional) + emit `order.delivered`. `deletePurchaseOrder`: draft only.

### 3.4 GRN — goods receipt (`/pharmacy/grn`) — `routes/grn.ts` + `pharmacyGrnService.ts`
**List:** search (grn#), stockist filter; columns GRN#/Received/Status(received|partial)/PO#/Stockist. **Detail:** header + PO link + item table (product/batch·exp/qty(+free)); Receive GRN button if PO delivered/partially_received.
**ReceiveGrnModal (SlideOver):** auto-builds lines from PO pending qty (paid+free breakdown), pre-fills batch/expiry from linked payable bill if present, auto-maps local product (catalog `localProductId` → name match) and **auto-creates missing products from catalog** (+ "Create all from catalog"). Per line: Local Product select (+ create from catalog), Batch #*, Expiry (must be ≥ today client-side)*, Qty (capped to pending), **Split batch**. Notes. Sends with **Idempotency-Key** header.
**`createGrn` (admin/pharmacist):** receivable only against delivered/partially_received; pre-aggregates by PO item; **cumulative received ≤ pending** guard (client) and **conditional over-receive guard `OVER_RECEIVE`** (server); `validateExpiryDate` and **expiry > receivedDate** (`EXPIRED_BATCH`); transaction: `PGRN-YYYY-####`, upsert batch on (tenant,product,batch,expiry), `stock_movements` reason `grn_receive`, increment PO-line receivedQty, flip PO to received/partially_received, GRN status partial if short, post **Inventory Dr / GRN_CLEARING Cr** at gross cost, auto-map catalog→local product; notify stockist `order.received`/`order.partially_received`. Route has **in-process idempotency cache (10 min)** keyed by tenant+Idempotency-Key.

### 3.5 Retail POS & sales (`/pharmacy/pos`, `/pharmacy/sales`) — `routes/retailSales.ts` + `retailSaleService.ts`
**PosPage:** product search (Enter = exact name/hsn or single match → add; barcode-friendly); left product list (Rx badge for scheduled, stock, disabled if out of stock); **addToCart** fetches batches, picks FEFO non-expired batch, caps to batch stock. Cart: per-item ± qty (44px targets), Disc %, remove; Customer search+select (walk-in default); Subtotal + Discount; **Split payment** toggle (cash amount + remainder via upi/card) OR method buttons (cash/upi/card) + Amount Received (+change); **Rx block** (appears when any scheduled item): Rx number*, Doctor name*, Doctor reg#, Patient name*, Patient age. Complete Sale → navigate to receipt with `?print=1`; Clear (ConfirmDialog).
**`createRetailSale` (admin/pharmacist/cashier):** empty-cart guard; customer validation; **prescription capture (C26)** — Rx#/doctor/patient required when any line schedule H/H1/X/NDPS (`RX_REQUIRED`); prices at product saleRate or override; **GST-inclusive** lines (`lineTax = lineSubtotal * gst/(100+gst)`); consumes stock by explicit `batchId` (expiry/availability checks: `BATCH_NOT_AVAILABLE`/`EXPIRED_BATCH`/InsufficientStock) or **FEFO** `reserveStock`, rolling back reservations on failure; split payments must equal total within 0.02 (`SPLIT_MISMATCH`); computes amountReceived/change; `SALE-YYYY-####`; posts cash-sale ledger (method account(s) Dr / Sales Cr + CGST/SGST Cr). Errors mapped to 400/409 with codes.
**SalesHistoryPage:** search + date range; columns Sale#/Date/Payment/Status/Total. **SaleDetailPage:** auto-print on `?print=1`; header (sale#, date, status, payment [split legs], cashier, customer); Rx panel if present; item table (batch·exp, qty, rate, GST%, total) + footer (subtotal/GST/discount/total/received/change). **Void (admin, same-day only):** modal reason (≥3) → `voidRetailSale` (conditional flip, restock, reversing ledger; `todayIST` guard "Only same-day sales can be voided").
**Customers (`/pharmacy/customers`):** search; Add Customer (Name*/Phone modal); delete (admin, ConfirmDialog). `customerService` CRUD; create allowed for cashier too. Server customer schema also supports email/age/gender/allergies/notes.

### 3.6 Payables & payments (`/pharmacy/payable-bills`, `/pharmacy/payments`) — `payableBillService` + `payablePaymentService`
**`createPayableBillFromEvent`** — materializes `payable_bills` (+ items) from `bill.generated` event, **idempotent on externalBillId**, links purchaseOrderId (via externalPharmacyOrderId or externalOrderId), maps externalProductId→local product via catalog; posts **GRN_CLEARING Dr / GST-input Dr / Sundry Creditors Cr** (M21 nets against the GRN's Inventory/GRN_CLEARING entry).
**Payable bill list:** filters search/status(+overdue derived)/stockist/date range; server ships `outstanding`. **Detail (read-only, no print/QR — `additions.md §A`):** stockist/status/dates/total/outstanding, linked PO link, Payment History (voided struck-through), item table; **Record Payment** SlideOver (Amount [default outstanding, ≤outstanding], Method, Reference [required non-cash]); **Initiate Return** (admin/pharmacist → `InitiateStockistReturnModal`).
**`recordPayablePayment` (admin/pharmacist):** non-cash reference required + dedup (`DUPLICATE_REFERENCE`); FIFO across oldest payable bills (or explicit allocations); conditional bill UPDATE (no over-allocate); ledger (Creditors Dr / method Cr); emits **`payment.recorded`** to stockist (which records the reciprocal `recordPayment`). `PPAY-#####`.
**Payments Made page:** table (payment#/date/method/status/amount + Void for admin); Record Payment SlideOver (Bill select showing outstanding, Amount, Method, Reference). **Void (admin, `voidPayablePayment`):** reverse allocations, status→voided, reversing ledger, emit `payment.voided`.

### 3.7 Returns to stockist (`/pharmacy/returns`) — `routes/stockistReturns.ts` + `stockistReturnService.ts`
**InitiateStockistReturnModal (Modal):** invoked from PO detail (received lines) or payable-bill detail (bill lines). Resolves each line to a local product (explicit localProductId → catalog map → name match); per line Batch select + Qty (capped to max), "Return all eligible", Reason (expired/damaged/wrong_item/cancelled/other) [batch required for wrong_item/cancelled], Notes.
**`createStockistReturn` (admin/pharmacist):** active connection; **other-mode (no PO/bill) requires reason `other`** and per-item batchId; validates returnable = received/bill qty − prior non-rejected/cancelled returns; reduces local batch stock (explicit batch conditional decrement or FEFO reserve), `stock_movements` reason `transfer_out`; **maps local→stockist catalog** (`mapReturnItemsForStockist`, throws if unmappable); emits `return.requested`. `SRET-####`. Statuses `requested→approved/processed/rejected/cancelled`.
**List/Detail:** stepper requested→processed (+ rejected terminal with reason); items table. Stockist's `return.processed`/`return.rejected` events flip local status (rejection restocks).

### 3.8 Products, Expiry, Reports, Settings (pharmacy)
- **Products** — shared `/api/products`; "from-catalog" create (resale saleRate defaults to MRP). Cashier hides rates.
- **Expiry Alerts** (`PharmacyExpiryAlertsPage`): batches ≤90d from stock-aging, tier-colored days-left.
- **Reports hub** (role-gated cards): Retail Sales (admin/pharmacist), Stock Aging, Expiry, GST (admin), Payables Aging (admin), Profit Margin (admin), Compliance (admin). `pharmacyReportService`: retail sales report (daily, top products, **payment mix**, paginated txns), payables-aging buckets, **pharmacy GST** (output from GST-inclusive retail lines + input from payable bill items **and** local purchases, netPayable), profit (revenue−COGS from batch purchaseRate), compliance (retail Rx register), dashboard KPIs.
- **Settings** (admin): Business, Staff (Add via `PharmacyAddUserModal` roles admin/pharmacist/cashier), Notifications, **POS Config** (default payment method + print-receipt prompt, stored in notificationsJson), Security. `PATCH /settings/tenant` strips stockist marketing fields for pharmacy.
- **Audit Logs** (admin): pharmacy entity set (POs/GRN/payable bills/payable payments/retail sales/connections/returns/customers/products/users).

---

### 4B.3 SP Cross-tenant connections & event bus

## 4. Cross-Tenant Connections, Catalog Sync, Event Bus

### 4.1 Connections (`stockist_connections`)
Statuses `pending|active|rejected|withdrawn|disconnected`. Request via invite code / GSTIN search / discovery. `approveConnection` (stockist admin): credit limit (default from `notificationsJson.defaultCreditLimit` or 50000), **creates/links a `pharmacies` row** on the stockist side (matched by GSTIN if present, else new; `portalConnected:true`, `pharmacyTenantId` set, DL left null not 'PENDING'), syncs catalog, emits `connection.approved`. `reject/withdraw/disconnect` emit matching events; disconnect flips linked pharmacy `portalConnected:false`.

### 4.2 Two catalogs (`publicCatalogService`, `connectionService`)
- **Connection catalog** (`stockist_catalog_items`, per active connection): includes PTR (`saleRate`) + scheme; `syncCatalogToConnection` upserts active products, deletes removed, availability hint from stock vs minStockLevel; `mapCatalogLocalProduct` links to pharmacy-local product.
- **Public catalog** (`stockist_public_catalog_items`): **never stores saleRate/PTR (C12)**, MRP+availability only; `syncPublicCatalog` maintains, removes orphans, respects `publishNewProductsByDefault`; `ensurePublicSlug` slugifies businessName (collision-suffixed); `dedupePublicStockistListings` hides duplicate listings.
- `pushCatalogToActiveConnections` (on product create/edit) re-syncs every active connection **and** the public catalog (full re-sync; `changedProductIds` is a forward-looking hint, `me89`).

### 4.3 Event bus (`cross_tenant_events`, `processed_cross_tenant_events`, `eventService`)
`emitCrossTenantEvent(source,target,type,payload)` appends a row. `applyEvent` **claims atomically** (insert into `processed_cross_tenant_events` onConflictDoNothing), runs `handleEvent`, acks (`deliveredAt`); on handler error deletes the claim and rethrows (retry). `processPendingEvents` drains queue. Client polls `POST /events/process` every 10 s (`useEvents`), invalidates caches, surfaces errors via `eventSyncStore` + toast; header bells show pending events + "Sync now"/"Process all"; event notifications deep-link (`eventNavigation`).
**Handled types** (`handleEvent`, all with `allowedFrom` FSM guards where relevant, C22): `order.accepted/rejected/packed/shipped/delivered/received/partially_received/cancelled/cancel_requested`, `bill.generated`, `connection.requested/approved/rejected/disconnected/withdrawn`, `order.submitted`, `payment.recorded/voided`, `catalog.changed`, `return.requested/processed/rejected`. Notable handlers: `payment.recorded` resolves external→local bills and calls stockist `recordPayment`; `payment.voided` finds the mirrored payment by note and voids it; `return.requested` reconstructs return items (matching orderItem by product/batch) and calls stockist `createReturn` with portal metadata in notes; `return.processed` applies credit to the pharmacy's payable bill first (Creditors Dr / Purchases Cr) then marks the stockist_return processed; `order.cancel_requested` cancels the stockist order (approved→cancelApproved, pending/packed→cancelOrder); unknown type → `UNKNOWN_EVENT_TYPE`. Events routes: list, history, process, `:id/apply` (no public ack).

---

### 4B.4 SP Smart order service

## 10. SMART ORDER (pharmacy) — `/pharmacy/smart-order`, `/api/smart-order`, `smart_order_sessions`

- **Access:** pharmacy panel, `pharmPlus` route wrapper (admin+pharmacist); server `requireTenantType('pharmacy')`. Sidebar entry "Smart Order" (Sparkles icon) in the Procurement group.
- **Page (`SmartOrderPage.tsx`):** textarea ("Dolo 650 x 10…"), **Analyse** → `POST /smart-order/parse {rawText}`; shows parsed items with catalogue-match counts. **Get Recommendations** → `POST /smart-order/recommend {sessionId}`; renders up to 3 strategy cards, each with label/description, "Covers X/Y items · N stockist(s) · ₹total", green "Saves ₹… vs best single" when applicable, and a **Create PO** button.
- **`parseSmartOrder`:** loads ALL active connections + their `stockist_catalog_items` for the pharmacy. Line parsing: if `GEMINI_API_KEY` set and ≥1 connection, delegates to `parseOrderText` (Gemini) against the **first** connection's stockist catalogue; else (or on any AI error) `parseLinesLocally` — regex `^(.*?)[sep](x?)(\d+)(unit)?$` per line, qty default 1. Each parsed name is fuzzy-matched (exact → contains-either-way → token>2 overlap) against the merged catalogue, dropping `out_of_stock` items; matches carry connectionId/stockistName/catalogItemId/stockistProductId/saleRate/mrp/availability. Persists a `smart_order_sessions` row (`rawText`, `parsedJson`) and returns `{sessionId, items}`.
- **`recommendSmartOrder`:** rebuilds from the stored session. Three strategies: **best_single** (stockist covering most items, tie-break lowest cost), **cheapest_split** (per-item minimum saleRate across stockists; computes `savingsVsSingle`), **fastest_delivery** (per-item rank in_stock<low<out, tie-break price — "same as best single for now (no delivery calendar)"). Stores `recommendationsJson` on the session, returns `{sessionId, recommendations}` (each with items[], totalCost, stockistCount, itemsCovered, totalItems).
- **Create PO handoff:** if the recommendation uses exactly one connection, the page writes `sessionStorage['smart-order-draft'] = {connectionId, lines:[{catalogItemId, productName, qty, unitPrice}]}` and navigates to `/pharmacy/purchase-orders/create?fromSmartOrder=1`. **As currently wired, `CreatePurchaseOrderPage` does not read `fromSmartOrder` or the `smart-order-draft` key** — the create page opens blank; the handoff is a stub. Multi-stockist recommendations show an info toast ("create separate POs per stockist") instead.

---

### 4B.5 SP Ledger posting matrix (complete)

## 12. LEDGER POSTING MATRIX (every double-entry posting, by business event)

Method accounts: cash→CASH, bank/cheque→BANK, upi→UPI_SUSPENSE, card (POS)→BANK.

| Event | Debit | Credit | Partner line |
|---|---|---|---|
| Order finalize (credit) | SUNDRY_DEBTORS (total) | SALES (subtotal) + CGST/SGST_OUTPUT or IGST_OUTPUT | Debtors line tagged pharmacy |
| Order finalize (cash) | CASH (total) | SALES + GST outputs | — |
| Packed-order cancel | reversal of the above | | pharmacy |
| Customer payment | method account (amount) | SUNDRY_DEBTORS (allocated) | pharmacy |
| Payment void | SUNDRY_DEBTORS | method account | pharmacy |
| Sales return processed | SALES_RETURNS (net) + GST outputs (tax) | SUNDRY_DEBTORS (gross credit) | pharmacy |
| Purchase receive (stockist GRN) | INVENTORY (subtotal) + CGST/SGST_INPUT or IGST_INPUT | SUNDRY_CREDITORS (total) | supplier |
| Supplier payment | SUNDRY_CREDITORS | method account | supplier |
| Pharmacy GRN (receive from stockist) | INVENTORY (gross cost) | GRN_CLEARING | — |
| Payable bill materialized (`bill.generated`) | GRN_CLEARING (subtotal) + GST inputs | SUNDRY_CREDITORS (total) | — (M21 nets the clearing account) |
| Payable payment | SUNDRY_CREDITORS | method account | — |
| Payable payment void | method account | SUNDRY_CREDITORS | — |
| Retail POS sale | method account(s) per split leg (amount) | SALES (net of tax) + CGST/SGST_OUTPUT (GST-inclusive back-out) | — |
| Retail sale void | reversal | | — |
| Return processed credit applied to payable bill (pharmacy side of `return.processed`) | SUNDRY_CREDITORS | PURCHASES | — |

Every posting flows through `postEntry` (imbalance >0.01 throws; unknown account code throws), inside the caller's transaction where one exists.

---

### 4B.6 ERP end-to-end workflow narratives

## 19. END-TO-END WORKFLOW NARRATIVES (step-by-step, exactly as the code executes)

### 19.1 Account creation → first dashboard (any role)
1. `/login` Sign Up tab: pick 1 of 5 role cards (admin excluded), email+password (≥6, confirmed). 2. `supabase.auth.signUp` (email redirect back to /login). 3. Client upserts `user_roles{user_id, role}` then `profiles{id, email}`. 4. Navigate straight to `roleConfig[role].onboarding`. 5. AuthContext sign-in effect fetches the role + the role's detail row; `onboardingComplete[role]=false` only when the detail query succeeds AND returns nothing. 6. Onboarding page inserts `{role}_details` → role dashboard. 7. Any later login: ProtectedRoute redirects to onboarding only if the detail row is still missing; errors fail open to the dashboard (anti-redirect-loop choice).

### 19.2 Pharmacy network formation (three distinct paths)
- **Path A — stockist manual add**: Pharmacies → AddPharmacyDialog. Insert `pharmacy_details` with `profile_id = stockist_details.id` (stockist ownership for RLS) + placeholder order `INIT-{ts}` (₹0/paid/delivered) so the orders-derived pharmacy list includes it instantly. No login is created; the pharmacy participates via the public catalogue using its drug license as the credential.
- **Path B — public self-registration + dual approval**: anonymous form at `/pharmacy-registration` (docs uploaded to the bills bucket) → `pharmacy_registration_requests{status:pending}`. Admin (all requests) and stockists (only requests whose PIN ∈ their active service areas) each approve independently: each approval sets its own flag; whichever approval lands **second** flips `status='approved'` and inserts `pharmacy_details` (stockist path sets profile_id = own stockist id; admin path uses the admin's own stockist_details lookup — see §11). Admin rejection requires a written reason. Realtime keeps both approval screens live.
- **Path C — pharmacy self-signup with login**: Login signup role=pharmacy → PharmacyOnboarding inserts `pharmacy_details` keyed by `auth_profile_id` (no owning stockist). Such a pharmacy uses the authenticated portal; a stockist-owned record for the same real-world pharmacy would be a separate row.

### 19.3 Order lifecycle (B2B, all sources converge on `orders`)
Creation (any of): stockist OrderCreation / QuickOrder (AI-parsed WhatsApp text) / QuickBill / BillUpload OCR (`process-bill-image`) / pharmacy portal checkout (per-stockist split + `deduct_stock` RPC + delivery fee) / public catalogue checkout (`create-platform-order`, PLT- number, per-item GST). All insert order (confirmed/unpaid/pending) + order_items, then reduce stock (client decrement, RPC, or edge ilike-match). DB trigger recalculates the pharmacy's outstanding_balance on every insert/update. Fulfilment: delivery_status pending → dispatched/out_for_delivery → delivered via the Pharmacies-page inline select, OrderActionsDropdown, or RouteExecution "Mark Delivered". Cancellation: status='cancelled' → trigger credits any paid_amount to credit_balance and the balance trigger drops it from outstanding. Editing: OrderItemsDialog (from order detail / pharmacy rows) mutates items.

### 19.4 Payment settlement (the money loop)
1. **Initiation** — pharmacy side: catalogue MarkPaymentDialog or post-checkout UPI screen → `mark-payment-paid` → **pending** payment_confirmation; stockist side: custom-amount input, Mark Paid buttons, partial-payment dialog, route collections → **approved** confirmations created directly (self-approved). 2. **Approval** — dashboard card or /stockist/payment-approvals → `approve-reject-payment` (approve/reject/on_hold; on_hold reversible). 3. **Application on approve** — credit-first (`creditUsed=min(amount, credit_balance)`), then FIFO oldest-first over unpaid/partial non-cancelled orders (or the single order when order_id set), 0.01 tolerance for 'paid', leftover → credit_balance, itemized note into stockist_notes, plus a self-healing pass marking any order with |total−paid|<0.01 as paid. 4. **Safety nets** — DB triggers clamp overpayment into credit and keep outstanding_balance canonical. 5. **Visibility** — pharmacy catalogue dashboard shows request statuses (⏳/✓/✗/⏸) and live balances via realtime; stockist Payments page tallies pending vs received-this-month.

### 19.5 Delivery-route day (stockist field workflow)
Quick Actions → Map Route: choose start address + pharmacies with undelivered orders → either "Open in Google Maps" (waypoint URL) or "Start Route with AI" → RouteExecution: `optimize-route` (Google Distance Matrix if key set, else random 5–20 km estimates) orders the stops; drag-drop reorder is cosmetic. Per stop: WhatsApp dispatch notification, per-order UPI payment links, cash/online/cheque collection recorded as approved route_collection confirmations with FIFO application, bulk mark-delivered. Nothing persists to route_executions/delivery_tracking.

### 19.6 Notices & recalls (admin → users)
Notice: admin composes with role/PIN/state/district/batch targeting → insert admin_notices → `distribute_notice_to_users` fan-out → stockist dashboards' NoticesPanel (realtime, read/dismiss per user). Recall: admin creates RCL record; `search_users_by_batch_code` identifies exposed stockists (products) and pharmacies (order history); notices with target_batch_codes can then reach affected stockists; Mark Resolved closes it. useAdminNotifications toasts other admins in-session.

### 19.7 Batch ordering cycle
BatchOrdering page → if no `status='collecting'` cycle, "Start New Cycle" → `create-batch-cycle` edge fn aggregates the stockist's pending+confirmed orders in the date range, stamps them with batch_cycle_id, and stores totals plus the modeled economics (delivery_cost = orders×₹12 vs individual ₹60 → cost_savings). No UI advances a cycle past 'collecting'.

### 4B.7 ERP payments & credit logic

## 10. PAYMENTS, CREDIT & MONEY LOGIC (consolidated)

- **Status vocab**: order `status` draft/confirmed/cancelled; `payment_status` paid/unpaid/partial; `delivery_status` pending/dispatched/out_for_delivery/delivered. Confirmation `status` pending/approved/rejected/on_hold. Order sources: manual, platform, pharmacy_portal, whatsapp.
- **Order numbering**: manual/quick-bill/OCR = `ORD-{Date.now()}`; quick-order (WhatsApp parse) = `ORD-{ts}` w/ `order_source=whatsapp`; platform (public catalogue) = `PLT-{ts}-{rand6}`; process-bill-image = `ORD-{ts}`; AddPharmacy placeholder = `INIT-{ts}`; recall = `RCL-{ts}`.
- **Credit-first + FIFO settlement** appears in FIVE places with the same algorithm & 0.01 tolerance: (1) Pharmacies page custom payment, (2) approve-reject-payment edge fn, (3) SortablePharmacyCard route collection, (4) OrderActionsDropdown partial payment (single-order), (5) mark-fully-paid (bulk). Leftover funds → `credit_balance`.
- **Outstanding balance** always recomputed as `Σ max(0, total_amount - paid_amount)` over unpaid/partial orders (`recalculatePharmacyBalance` duplicated across many files).
- **GST differs by surface**: portal checkout = flat **5% + delivery fee**; public catalogue checkout = **per-item `gst_percentage`, no delivery fee**; stockist OrderCreation = **SGST/CGST split (tax/2 each)**, per-item gst default 5; QuickOrder/QuickBill dialogs use a 5/12 tax toggle (default 12); create-platform-order defaults item gst to 12 if absent.
- **UPI**: QR via `qrcode.react` (level H, size 200, downloadable PNG) + `upi://pay?pa={upi}&pn={name}&am={amount}&tn=Order-{num}&cu=INR` deep links. Payments always require stockist confirmation before balances update. PaymentLinkDialog also lets stockist edit their UPI ID inline (saved to stockist_details) and pick 100/50/25% or slider payment amount, then Send via WhatsApp.

---

## 7B. ERP complete data dictionary (51 tables)

## 13. COMPLETE DATA DICTIONARY (every table, every field — from `src/integrations/supabase/types.ts`, 51 tables + 6 RPCs)

Conventions: all PKs are `id uuid` (gen_random_uuid). "→" = FK. Enums: `app_role` = stockist|pharmacy|admin|mr|patient|brand; legacy `user_role` = stockist|pharmacy (unused in app code).

### 13.1 Identity & roles
- **profiles** — mirror of auth users. Fields: `id` (= auth.uid), `email`, `created_at`, `updated_at`. Created by Login signup upsert and orphaned signup pages. Every other "user_id" FK points here.
- **user_roles** — `user_id`, `role app_role`, `created_at`. One row per role; unique (user_id, role) used as upsert conflict key. Read by `has_role()`/`is_admin()` SQL, AuthContext (maybeSingle → effectively assumes ONE role/user), useUserRole (all roles → priority pick), AdminRoute.
- **stockist_details** — the stockist business record. `profile_id` →profiles (1:1), `stockist_name`, `company_name`, `license_number`, `phone`, `address`, `gstin`; bank: `upi_id`, `bank_name`, `account_number`, `ifsc_code`, `account_holder_name`; commerce config: `catalogue_slug`, `catalogue_enabled`, `catalogue_created_at`, `default_credit_days`, `default_margin_percent`, `delivery_radius`, `business_hours Json`; dispatch geo: `dispatch_latitude/longitude/place_name` (used by calculate-delivery-fee Haversine). Created at onboarding; updated at StockistProfile & PaymentLinkDialog (inline UPI save).
- **pharmacy_details** — dual-ownership design: `profile_id` →**stockist_details.id** (the stockist who "owns"/manages the pharmacy record — used by ALL stockist RLS) and `auth_profile_id` →profiles.id (set only when the pharmacy itself has a login; the authenticated pharmacy portal keys on this). Fields: `pharmacy_name`, `owner_name`, `license_number` (public-catalogue password), `gst_number` (NOT NULL; process-bill-image inserts 'PENDING'), `phone`, `whatsapp_number`, `email`, `address`, `area`, `pin_code`, `google_maps_name`, `location_coordinates` (text "lat,lng") plus separate `latitude`/`longitude` numerics; money: `credit_limit`, `credit_balance`, `outstanding_balance` (maintained by trigger + client recalcs); denorm stats: `total_orders`, `total_revenue`, `last_order_date` (written by nothing in current UI — stale denorms); `is_active`.
- **patient_details** — `profile_id` (1:1), `patient_name`, `phone` (NOT NULL), `date_of_birth`, `gender`, `blood_group`, `allergies text[]`, `medical_conditions text[]`, `emergency_contact_name/phone`, `is_active`.
- **brand_details** — `profile_id` (1:1), `brand_name`, `company_name`, `contact_person`, `phone`, `email`, `gstin`, `manufacturing_license`, `address`, `is_verified` (gates the whole brand module; nothing in the UI sets it true — admin would have to flip it in DB), `is_active`.
- **mr_details** — structurally a clone of stockist_details (same bank/catalogue/credit columns incl. `upi_id`, `catalogue_slug`, `catalogue_enabled`, `default_credit_days`, `delivery_radius`, `business_hours`): `profile_id` (1:1), `mr_name`, `company_name`, `license_number`, `phone`, `address`, `gstin`. Only name/company/license/phone/address are used by the MR UI; the catalogue/bank columns are dormant.

### 13.2 Catalog & inventory
- **products** (stockist catalogue) — `stockist_id` →stockist_details, `name`, `generic_name`, `brand`, `manufacturer`, `category`, `type` (form), `strength`, `pack_size`, `description`, `image_url`, `hsn_code`, `batch_code`; pricing: `mrp`, `purchase_price` (PTR), `sale_price` (PTS), `gst_percentage` (default 5); stock: `stock_quantity`, `min_stock_threshold` (default 10), `moq` (default 1); `is_active`. Written by AddProduct/EditProduct/QuickUpdateStock/OCR scan/BulkUpload/AI enhance/edge auto-creation; decremented by order flows and `deduct_stock` RPC.
- **product_batches** — `product_id` →products, `batch_number`, `expiry_date` (NOT NULL), `manufacturing_date`, `quantity`. Read by the Products page expiry filter/badges; no UI writes batches (data would arrive via SQL/imports) — expiry badges only appear for products that have batch rows.
- **pharmacy_inventory** (authenticated pharmacy's own stock) — `pharmacy_id` →pharmacy_details, optional `stockist_id` provenance, `product_name`, `generic_name`, `manufacturer`, `category`, `pack_size`, `batch_number`, `hsn_code`, `gst_percentage`, `expiry_date`, `purchase_date`, `quantity`, `unit_price`, `sale_price`, `mrp`, `low_stock_threshold`. Read-only in the UI today (Inventory page lists it; Add/Edit unwired) — rows must originate outside the UI.
- **pharmacy_expiry_alerts** — auto-populated by DB trigger `trigger_create_expiry_alerts` on pharmacy_inventory insert/update (expiry >30d out): `pharmacy_id`, `inventory_id` →pharmacy_inventory, `product_name`, `batch_number`, `expiry_date`, `quantity`, `alert_days_before` (30), `status`, `acknowledged_at`. **No UI reads this table** — pure background data.
- **brand_products** — `brand_id` →brand_details, `product_name`, `generic_name`, `sku`, `batch_number` (all NOT NULL except generic), `category`, `manufacturer`, `description`, `image_url`, `mrp`, `selling_price`, `stock_quantity`, `prescription_required`, `is_active`. (PriceComparison's patient page queries `products` with these column names — schema mismatch documented in §11.)

### 13.3 Orders & delivery
- **orders** (the central B2B document) — `order_number` (unique human ref, see §10 numbering), `stockist_id` →stockist_details, `pharmacy_id` →pharmacy_details, `batch_cycle_id` →order_batch_cycles; money: `total_amount`, `net_amount`, `tax_amount`, `discount_amount`, `paid_amount`; status trio: `status` (draft/confirmed/cancelled), `payment_status` (paid/unpaid/partial), `delivery_status` (pending/dispatched/out_for_delivery/delivered); `order_source` (manual/platform/pharmacy_portal/whatsapp); `payment_due_date`, `payment_mode`, `delivery_date`, `delivery_address`, `notes`; bill capture: `bill_number`, `bill_image_url`. Three DB triggers fire on it (§14).
- **order_items** — `order_id` →orders, `product_name` (denormalized string — **no product_id FK**; items survive product deletion but stock updates must name-match), `product_description`, `quantity`, `unit_price`, `total_price`, `gst_percentage`, `tax_amount`, `batch_code`.
- **order_batch_cycles** — `stockist_id`, `cycle_start_date`, `cycle_end_date`, `delivery_date`, `status` (collecting/…), `total_orders`, `total_pharmacies`, `total_value`, `delivery_cost` (=orders×₹12), `cost_savings` (=orders×₹48). Written only by `create-batch-cycle` edge fn; read by BatchOrdering page.
- **patient_orders** (B2C) — `patient_id` →patient_details, `pharmacy_id` →pharmacy_details, `prescription_id` →patient_prescriptions, `delivery_address_id` →patient_addresses, `order_number`, `items Json` (embedded array, not a child table), `subtotal`, `delivery_fee`, `platform_fee`, `discount_amount`, `total_amount`, `order_status` (placed/confirmed/packed/dispatched/delivered/cancelled per dashboard color map), `payment_status`, `payment_method`, `delivery_slot`, `delivered_at`, `notes`. Read by patient dashboard/orders; **never inserted by the UI** (patient checkout is a demo stub).
- **patient_order_tracking** — `patient_order_id` →patient_orders, `status`, `message`, `latitude`, `longitude`. Data-model only; no UI.
- **brand_orders** — `brand_id`, `patient_id`, `pharmacy_id`, `delivery_address_id`, `order_number`, `items Json`, `subtotal`, `delivery_fee`, `platform_fee` (NOT NULL), `pharmacy_commission` (NOT NULL — models the pharmacy's cut for fulfilling a brand D2C order), `total_amount`, `order_status`, `payment_status`, `payment_method`, `delivered_at`. Read by Brand dashboard/analytics/fulfilment KPIs; no insert path in UI.
- **delivery_tracking** — `route_execution_id` →route_executions, `pharmacy_id`, `order_id`, `collection_amount`, `payment_mode`, `delivered_at`, `notes`. Table + RLS exist; **RouteExecution page does not write it** (collections go straight to payment_confirmations) — dormant.
- **route_executions** — `stockist_id`, `starting_address`, `pharmacy_ids uuid[]`, `optimized_order uuid[]`, `total_distance`, `status` (default 'in_progress'), `started_at`, `completed_at`. Same: modeled but the RouteExecution page keeps route state in React only and never persists a row — dormant.

### 13.4 Payments & finance
- **payment_confirmations** — the payment-approval object: `stockist_id`, `pharmacy_id`, `order_id` (nullable: null = "apply FIFO across orders"), `amount`, `payment_type` (custom/route_collection/manual_mark_paid/manual_partial/manual_payments_page/full_outstanding/custom_amount/specific_order per creating surface), `payment_method`, `payment_proof_url` (schema-only; no upload UI), `status` (pending/approved/rejected/on_hold), `pharmacy_notes`, `stockist_notes` (approve fn writes an itemized credit/FIFO breakdown here), `processed_by`, `processed_at`.
- **payment_reminders** — `pharmacy_id`, `stockist_id`, `order_id`, `amount`, `message`, `reminder_date`, `scheduled_date`, `sent_at`, `status` (default/sent), `auto_reminder_enabled` (schema-only — no scheduler exists). Written by Payments page Send Reminder and PharmacyRemindersList Nudge.
- **invoices** — `user_id` →profiles, `invoice_number`, `invoice_type`, `amount`, `tax_amount`, `total_amount`, `due_date`, `status`, `paid_at`, `invoice_url`. Dormant (no UI).
- **platform_fees** — `fee_name`, `fee_type` (percentage/fixed), `fee_value`, `calculation_method`, `applies_to` (stockist/pharmacy/both), `min_amount`, `max_amount`, `effective_from/to`, `is_active`. Admin CRUD only; **no fee is ever applied to an order anywhere in code**.
- **commission_ledger** — `user_id`, `order_id`, `commission_type`, `commission_rate`, `commission_amount`, `status`, `paid_at`, `payment_reference`. Dormant.
- **mr_order_commissions** — `mr_id` →mr_details, `order_id` →orders, `pharmacy_id`, `commission_amount` (default 0), `commission_rate`, `status`, `paid_at`. Read by MR Collections/Analytics; nothing in the UI creates rows.
- **subscription_plans** / **user_subscriptions** — SaaS billing scaffold (`plan_name`, `price`, `billing_cycle`, `features Json`, `max_products/pharmacies/orders_per_month`, `user_type`; subscriptions with `start/end_date`, `status`, `auto_renew`, payment dates). Entirely dormant.

### 13.5 Network, registration & territory
- **pharmacy_registration_requests** — full application snapshot (all pharmacy fields + `whatsapp_number`, `google_maps_name`, `location_coordinates`) + document URLs (`drug_license_url`, `gst_certificate_url`, `other_documents_url`) + dual-approval state machine: `status` (pending→approved/rejected), `admin_approved(+_at,_by)`, `stockist_approved(+_at,_by)`, `stockist_id` (set by the approving stockist), `rejection_reason`. Public INSERT policy allows unauthenticated submission.
- **pharmacy_stockist_connections** — `pharmacy_id`+`stockist_id` with per-relationship `credit_limit`, `outstanding_balance`, `last_order_date`, `is_active`. Modeled many-to-many trade relationship; **current code derives relationships from orders instead** — dormant.
- **pharmacy_documents** — `pharmacy_id`, `document_type`, `document_url`, `document_number`, `issue_date`, `expiry_date`, `status` (pending/verified/rejected via admin DocumentVerification page; code also writes `verification_status` naming per page — page sets status fields + `verified_at/by`, `rejection_reason`, `notes`).
- **territories** — admin-defined: `territory_name`, `state`, `district s[]`... actually `districts text[]`, `pin_codes text[]`, `territory_manager`, `is_active`. Reference data only (nothing enforces territories at order time).
- **stockist_service_areas** — `stockist_id`, `pin_code`, `area_name`, `district`, `state`, `is_active`. Enforced in: verify-pharmacy-license PIN check, StockistApprovals request filtering, BrowseStockists sorting.
- **stockist_delivery_dates** — `stockist_id`, `delivery_date`, `is_active`, `notes`. Set in DeliverySettings; surfaced as "next delivery" in BrowseStockists.
- **stockist_delivery_rules** — `stockist_id`, `rule_type` (order_amount/flat_fee/distance), `rule_name`, `flat_fee`, `min_order_amount`, `per_km_charge`, `base_distance_km`, `min_profit_amount` (unused), `free_on_delivery_date` (unused), `priority`, `is_active`. Consumed by calculate-delivery-fee.
- **batch_delivery_rules** — `stockist_id`, `delivery_day`, `min_order_value`, `require_payment_clearance`, `max_payment_overdue_days`, `is_active`. Dormant (no UI, not read by create-batch-cycle).

### 13.6 Patient engagement (mostly dormant beyond reads)
- **patient_addresses** — `patient_id`, `address_type`, `address_line`, `landmark`, `city`, `state`, `pin_code`, `latitude/longitude`, `is_default` (profile page enforces single default by unsetting others).
- **patient_prescriptions** — `patient_id`, `prescription_image_url` (NOT NULL), `prescription_date`, `medicines Json`, `doctor_name`, `clinic_name`, `diagnosis`, `notes`, `validity_days`, `is_active`. UI writes only image+date.
- **patient_refill_reminders** — `patient_id`, `medicine_name`, `frequency_days`, `last_refill_date`, `next_refill_date`, `is_active`. Read by dashboard "Pending Refills" KPI; no create UI.
- **patient_wishlist** — `patient_id`, `product_id`, `product_name`, `product_price`, `stockist_id`. Read+delete in UI; no add path wired.
- **wishlist** — generic (`user_id`, `product_id`, `product_type`) — dormant duplicate.
- **loyalty_points** (`points_balance/earned/redeemed`, `tier`) & **loyalty_transactions** (`points`, `transaction_type`, `order_id`, `description`) — dormant.
- **referrals** — `referrer_id`, `referee_id`, `referral_code`, `reward_amount`, `status`, `completed_at` — dormant.
- **ratings_reviews** — polymorphic `entity_type`+`entity_id`, `rating`, `review_text`, `is_verified_purchase`, `is_active` — dormant.
- **search_history** — `user_id` (nullable; anonymous insert policy exists), `search_query`, `search_type`, `results_count` — dormant.

### 13.7 Brand compliance
- **brand_campaigns** — `brand_id`, `campaign_name`, `campaign_type` (UI hardcodes "discount"), `description`, `discount_percentage`, `budget`, `actual_spend`, `start_date`, `end_date` (NOT NULL), `status` (UI inserts "draft"), `target_region text[]`.
- **brand_batch_verification** — anti-counterfeit: `brand_id`, `product_id` →brand_products, `batch_number`, `manufacturing_date`, `expiry_date`, `quantity`, `verification_code`, `qr_code_url`, `is_verified`. Public SELECT policy ("Public verify batches") exists but no verification UI.
- **batch_recalls** — `recall_number` (RCL-{ts}), `batch_number`, `product_name`, `manufacturer`, `severity` (critical/high/medium/low), `recall_reason`, `instructions`, `recall_date`, `status` (active/resolved), `initiated_by`, `affected_users_count`, `cdsco_reference` (Indian regulator ref — schema-only).
- **disputes** — `dispute_number`, `dispute_type`, `filed_by` →profiles, `pharmacy_id`, `stockist_id` (both NOT NULL), `order_id`, `subject`, `description`, `priority`, `status` (open/in_progress/resolved/closed/escalated), `assigned_to`, `resolution`, `resolved_at`. Admin resolves; **no user-facing "raise dispute" UI exists** — rows must be created externally.

### 13.8 Governance & communications
- **admin_notices** — `title`, `content`, `notice_type` (announcement/alert/update/warning/recall), `priority` (low/medium/high/urgent), targeting arrays `target_role/pin_codes/batch_codes/states/districts`, `expires_at`, `is_active`, `created_by`.
- **user_notice_recipients** — fan-out rows (`notice_id`, `user_id`, `read_at`, `dismissed_at`; unique notice+user). Created by `distribute_notice_to_users` RPC; consumed by stockist NoticesPanel.
- **message_templates** — `template_name`, `template_type` (email/sms/whatsapp), `category`, `subject`, `content` with `{variable}` placeholders, `variables Json`, `is_active`. Referenced by notification_queue.template_id but no send pipeline uses them.
- **notification_queue** — `user_id`, `notification_type`, `channel`, `template_id` →message_templates, `variables Json`, `recipient_email/phone`, `scheduled_at`, `sent_at`, `delivered_at`, `status` (pending=unread in the bell), `error_message`. Read by NotificationBell (patient/brand navs); **nothing enqueues or sends** — a queue with no producer or worker.
- **notification_preferences** — per-user switches `push/email/sms/whatsapp/marketing_enabled` (1:1 user). Exists in DB; the Settings page switches do NOT read/write it.
- **communication_log** — `pharmacy_id`, `type` (whatsapp), `message`, `status`, `sent_at`. Written by Payments page reminder flow only.
- **support_tickets** — `user_id`, `subject`, `category`, `priority`, `status`, `description`. Full lifecycle on the Support page (create + self-mark-resolved). No admin ticket console.
- **audit_logs** — `user_id`, `action`, `entity_type`, `entity_id`, `details Json`, `ip_address` (always null — client sends null), `user_agent`. Written via `useAuditLog` (admin user actions) — viewed at /admin/audit-logs.
- **activity_log** — stockist-scoped feed: `stockist_id`, `activity_type` (catalogue_update/price_change/order_modified/payment_reminder/payment_received/order_created/stock_reduced/product_created), `description`, `metadata Json`.
- **analytics_events** — `user_id`, `event_type`, `event_data Json`, `page_url`. Insert policy open to all; no code writes events — dormant.
- **platform_settings** — key/value store: `setting_key` (`app_info`, `{role}_announcement`), `setting_value Json`, `target_role`, `is_active`. Read/written by Settings page.
- **catalogue_rate_limits** — `identifier` (license/IP), `action_type` (license_verify/order_create/payment_submit envisioned; only license_verify used), `attempt_count`, `last_attempt_at`. Managed exclusively by `check_rate_limit` RPC under service role.

### 13.9 RPC signatures (types.ts Functions)
- `check_rate_limit(p_identifier, p_action_type, p_max_attempts, p_time_window_minutes) → jsonb {allowed, attempts_remaining | retry_after…}`
- `deduct_stock(p_product_id uuid, p_quantity int) → boolean` (false when insufficient)
- `distribute_notice_to_users(p_notice_id, p_target_role?, p_target_pin_codes?, p_target_batch_codes?, p_target_states?, p_target_districts?) → integer` (recipient count)
- `has_role(_user_id, _role app_role) → boolean` · `is_admin() → boolean` (both SECURITY DEFINER, used inside RLS)
- `search_users_by_batch_code(p_batch_code) → rows {user_type, user_id, user_name, contact_phone, product_count}`

---

## 7C. HUB complete data dictionary (~70 tables)

## 15. FULL DATA DICTIONARY (every table in `types.ts`, field-by-field)

Legend: `s`=string, `n`=number, `b`=boolean, `?`=nullable. Writers/readers from actual UI code.

### 15.1 Identity & access
- **profiles** (11): `id, user_id, full_name?, email?, phone?, avatar_url?, tos_accepted_at?, data_download_requested_at?, last_active_at?, created_at, updated_at`. One per auth user (all roles). Written at signup, ToS acceptance (`useToSAcceptance`), 5-min session heartbeat (`updated_at`). Read by TopNav avatar, admin user search/impersonate/targeted notifications.
- **user_roles** (3): `id, user_id, role(app_role enum: admin/stockist/pharmacy/customer/doctor)`. Inserted at registration; read at every login (role-match gate) and by `useAuth`. One user CAN hold multiple roles (RootRedirect picks by priority).
- **login_attempts** (4): `id, email, success:b, attempted_at`. Written by `record_login_attempt` RPC on every login try; read by `check_login_rate_limit` (15-min lockout) and AdminLoginHistory.
- **login_activity** (7): `id, user_id, status, device_info?, ip_address?, location?, created_at`. Read by AdminActivityLog, AdminActiveUsers, and per-role PrivacySecurity pages (last 10 logins). Re-pointed by MergeAccounts.
- **stockist_profiles** (26): business_name, business_type?, pan_number?, phone/whatsapp_number/email?, address/city/state/pin_code?, approval_status?, rejection_reason?, drug_license_url?, gst_certificate_url?, wholesale_license_url?, fssai_license_url?, drug_license_expiry?, bank fields (bank_name, account_number, ifsc_code, upi_id, account_holder_name), user_id, timestamps. `id` is the key used by ALL stockist child data.
- **pharmacy_profiles** (33): pharmacy_name, pharmacy_type?, license_number?, owner_name/owner_designation/owner_contact?, phone/whatsapp_number/email?, address/city/state/pin_code?, approval_status?/rejection_reason?, drug_license_url?/gst_certificate_url?/pharmacy_certificate_url?/drug_license_expiry?, bank fields + upi_id?, B2C commerce config: `delivery_fee?`, `free_delivery_above?`, `min_order_amount?` AND duplicate `minimum_order_amount?` (both exist), `operating_hours:Json?`, user_id, timestamps.
- **customer_profiles** (18): full_name, phone/email?, gender?, date_of_birth?, address/city/state/pin_code?, health fields `blood_group?, allergies?, chronic_conditions?, emergency_contact?`, avatar_url?, user_id, timestamps. No approval gating.
- **doctor_profiles** (26): full_name, specialization, qualification?, registration_number?, experience_years?, bio?, consultation_fee_audio/video/clinic?, `is_available?` (booking-list filter), approval_status?/rejection_reason?, medical_certificate_url?, id_proof_url?, `id_proof_status?` (approval_status enum — per-document status used by AdminDoctorDetail), avatar_url?, contact/address fields, user_id, timestamps.

### 15.2 Catalog & inventory
- **products** (33, stockist catalog): name, brand?, manufacturer?, category?, composition?, description?, pricing `mrp?, sale_price?, price?` (price kept = sale_price), `purchase_rate?`, stock `stock_quantity?, reserved_quantity?` (reserved never written by UI), `in_stock?`, `min_stock_level?, min_order_quantity?, moq?` (moq unused duplicate), `batch_number?, expiry_date?` (headline, mirrors latest batch), regulatory `hsn_code?, gst_rate?, drug_schedule?, drug_type?, fssai_license?, requires_prescription?, is_narcotic?`, `pack_type?, pack_size?, unit?`, image_url?, stockist_id. Created via ProductForm / BulkUploadCatalogue / BulkUploadPurchaseBill (upsert-by-name) / SharedProductDetail Clone. Deleted via detail-page confirm. Stock mutated by decrement_stock/deduct_product_stock/restore_product_stock RPCs, BatchManager re-aggregation, returns restock.
- **product_batches** (9): product_id, batch_number?, mrp?, sale_price?, purchase_rate?, stock_quantity?, expiry_date?, created_at. Written only by BatchManager and return-FIFO-restock; zeroed by ExpiryManagement Dispose and moved by StockTransfer.
- **product_media / pharmacy_inventory_media** (6 each): `image_url, is_primary, sort_order` + parent id. Delete-all-then-reinsert on gallery save.
- **product_categories** (4) / **pharmacy_categories** (3) / **drug_schedules** (5: schedule_name, description?, restrictions?) / **doctor_specializations** (3): admin CRUD config lists. NOTE: product forms actually use the hardcoded `PRODUCT_CATEGORIES`/`DRUG_SCHEDULES` constants, not these tables — the admin CRUD tables are not consumed by the forms.
- **pharmacy_inventory** (32): mirrors products schema (product_name instead of name, quantity instead of stock_quantity) + `is_visible_to_customers?`, `source_product_id?`, `source_stockist_id?` (set by bulk-import/auto-populate lineage), unit?. Rows created by: PharmacyInventoryForm, PharmacyBulkImport (qty 0, hidden), stockist-side `autoPopulateInventory` on B2B delivery (visible, qty added). Deducted by `deduct_pharmacy_inventory` on B2C confirm; restored by `restore_pharmacy_inventory` / cancel-restock.

### 15.3 B2B commerce
- **orders** (22): order_number, stockist_id, pharmacy_id, status?, payment_status, total_amount?, items_count, order_source (manual/whatsapp/platform/quick_order/split), notes?, `parent_order_id?` (split lineage), `partial_delivery_items:Json?`, `applied_credit_note_id?`, `credit_discount?`, delivery: `assigned_staff_id?`, `delivered_at?`, `delivery_proof_url?`, collection: `delivery_collected_amount?`, `delivery_payment_method?`, `delivery_payment_status?` (pending_approval/approved/rejected), timestamps.
- **order_items** (7): order_id, product_id, quantity, price?, `requested_batch?` (pharmacy can request a batch), created_at.
- **order_returns** (10): order_id, stockist_id, pharmacy_id, product_id, quantity, reason?, refund_amount?, status (pending/completed/rejected), created_at. Pharmacy requests → stockist approves/rejects; stockist can also create directly as completed.
- **order_status_history** (8): order_id, order_type, old_status?, new_status, changed_by?, notes?. Exists in schema; UI reads/writes it only sporadically (status transitions largely don't append here).
- **delivery_staff / pharmacy_delivery_staff** (12 each): name, phone, username, password_hash, is_active, aadhar_number?, age?, police_verification_id?, photo_url?, owner id. Auth via `verify_staff_credentials` RPC only.
- **delivery_settings** (8): stockist_id, pin_code, delivery_charge, delivery_days:s[], estimated_hours, free_delivery_above. Per-PIN config surfaced in QuickOrder "next delivery day".
- **delivery_route_templates** (6): stockist_id, name, pharmacy_ids:s[], notes?. Saved multi-stop selections.
- **stockist_holidays** (7): start_date, end_date, reason?, allow_preorder:b. Blocks/labels pharmacy ordering.
- **serviceable_areas** (4): stockist_id + pin_code (stockist coverage). **admin_serviceable_areas** (6): platform-level PIN whitelist (`is_active`) gating stockist registration. **pharmacy_serviceable_areas** (7): pharmacy_id, pin_code, delivery_charge?, estimated_hours?, free_delivery_above? — drives customer pharmacy discovery.

### 15.4 B2C commerce
- **customer_orders** (25): order_number, customer_id, pharmacy_id, status?, order_type? (delivery/pickup/prescription), payment_method?, payment_status?, total_amount?, delivery_fee?, gst_amount?, discount_amount? (schema-only, no UI writer), delivery_address?, delivery_pin_code?, prescription_id?, prescription_url?, prescription_verified?, upi_proof_url?, refund_status?, partial_items:Json?, assigned_staff_id?, delivered_at?, notes?, timestamps.
- **customer_order_items** (10): order_id, product_name, product_id?, quantity?, price?, requires_prescription?, `is_substitute?` + `original_product_name?` (substitution audit).
- **customer_returns** (8) + **customer_return_items** (5): pending→approved/rejected; refund_amount computed at approval; **no restock ever**.
- **customer_reviews** (10): customer_id, rating, comment?, pharmacy_id?/doctor_id?/order_id?, `reply?`+`reply_at?` (schema supports pharmacy replies; no UI writes replies). This is THE table read for all rating averages.
- **reviews** (7): customer_id, rating, comment?, target_type, target_id — written by CustomerReviewOrder, read nowhere (orphan write path).
- **customer_wishlist** (9): denormalized snapshot (product_name, price?, image_url?, pharmacy_name?, inventory_id?, pharmacy_id?).
- **customer_addresses** (9): label, address, city?/state?/pin_code?, is_default.

### 15.5 Finance
- **payments** (12): stockist_id, pharmacy_id, amount, payment_method, status (confirmed/pending), `collected_by?` (manual/delivery_staff/pharmacy), staff_id?, reference_id?, payment_proof_url?, notes?. Created by CollectPaymentDialog (confirmed), StockistRecordPayment (confirmed), staff-collection approval (confirmed), PharmacyPayments record-to-stockist (pending).
- **payment_reminders** (7): stockist_id, pharmacy_id, total_amount, sent_via ("whatsapp"), order_ids:s[]?.
- **bills** (12): bill_number, stockist_id, pharmacy_id, subtotal, total_amount, discount_type?/discount_value?, gst_amount? (never populated), due_date?, status ("confirmed" from BillPreviewDialog, "final" from BulkBill; "draft" never written). **bill_orders** (3): bill_id↔order_id join.
- **credit_notes** (9): credit_note_number ("CN-"+base36), stockist_id, pharmacy_id, order_id, return_id, amount, status (active/used). Created on returns; consumed in StockistCreateOrder.
- **subscription_plans** (9): name, price_monthly, price_yearly, target_role, features:Json?, is_active. Admin CRUD only — **no purchase/enforcement anywhere**.

### 15.6 Healthcare
- **consultations** (16): doctor_id, patient_id, pharmacy_id?, consultation_type (audio/video/clinic_visit), scheduled_at, fee, status? (booked/in_progress/completed/cancelled), payment_status?, meeting_link?, notes?, duration_minutes?, follow_up_date?/follow_up_notes?.
- **prescriptions** (8): doctor_id, patient_id, consultation_id?, pharmacy_id?, notes?, status?. **prescription_items** (9): product_name, product_id?, dosage?, duration?, quantity?, notes?.
- **prescription_templates** (5): doctor_id, template_name, items:Json.
- **doctor_availability** (7): day_of_week, start_time, end_time, is_active? — written by DoctorAvailability, read by nothing.
- **doctor_pharmacy_partnerships** (6): doctor_id, pharmacy_id, default_commission_pct (5 default), status (pending/active/rejected/inactive).
- **doctor_commission_rules** (7): partnership_id, rule_type (product/brand/category), rule_value, commission_pct?, flat_amount?.
- **doctor_commission_earnings** (10): doctor_id, pharmacy_id, partnership_id, customer_order_id, item_name, item_amount, commission_amount, status (pending→paid via pharmacy "Mark Paid").
- **pharmacy_consultation_settings** (5): pharmacy_id, doctor_id, is_active? — makes "Consult" appear on customer pharmacy pages.

### 15.7 Governance & comms
- **notifications** (7): user_id, title, message?, type?, read?. The universal event bus (~20 type values, see §18.3). Realtime INSERT subscription per user.
- **messages** (6): support-chat unread counter source (sender/receiver/content/read). **peer_messages** (6): same shape, B2B/peer chat. **conversations** (5): user_id, user_role — one support thread per user. **chat_messages** (7): conversation_id, sender_type (user/admin/bot), content, read?.
- **quick_questions** (5): question, answer, category? — canned bot answers (admin CRUD in AdminSettings).
- **admin_audit_log** (7): admin_user_id, action, target_type?, target_id?, details:Json?. Written by impersonate_view, force_password_reset, merge_accounts, customer-order overrides.
- **counterfeit_alerts** (9): product_name, alert_type (counterfeit/banned/spurious/nsq/recalled), batch_number?, manufacturer?, description?, is_active, created_by.
- **platform_settings** (4): key/value store. Keys observed in code: `logo_url`, `maintenance_mode`, `maintenance_message`, `platform_commission_pct`, `gst_rate_medicines` (+ per-category gst keys), ToS content, payment-method flags.
- **platform_banners** (8): title, message?, banner_type, target_roles:s[], is_active, created_by. Admin CRUD; **no client surface renders banners to end users**.

### 15.8 RPC signatures (exact, from types.ts)
`admin_override_customer_order_status(p_new_status, p_order_id)`, `admin_override_order_status(p_new_status, p_order_id)`, `admin_send_targeted_notification(p_message, p_title, p_user_id)`, `check_login_rate_limit(p_email)→boolean`, `decrement_stock(p_product_id, p_quantity)`, `deduct_pharmacy_inventory(p_inventory_id, p_quantity)`, `deduct_product_stock(p_product_id, p_quantity)`, `get_flowboard_schema()→Json`, `has_role(_role, _user_id)→boolean`, `hash_password(p_password)→string`, `record_login_attempt(p_email, p_success)`, `restore_pharmacy_inventory(p_inventory_id, p_quantity)`, `restore_product_stock(p_product_id, p_quantity)`, `update_circle_outstanding(p_circle_id, p_delta)`, `verify_staff_credentials(p_password, p_staff_type, p_username)→Json`.

---

## 7D. HUB admin module per-page detail

## 16. ADMIN MODULE — PER-PAGE DETAIL (previously only name-listed; now source-verified)

### 16.1 Entity detail pages (approval workbenches)
- **AdminStockistDetail** (`stockists/:id`, 245 lines): loads profile + last orders (`orders ⋈ pharmacy_profiles`) + circle rows (`stockist_pharmacy_circle ⋈ pharmacy_profiles`) + last 100 products. **Approve/Reject buttons** update `stockist_profiles.approval_status` directly; reject requires a typed `rejection_reason`; either action notifies the stockist. **Per-document status setter**: updates arbitrary `[field]: status` on the profile (doc-level approve/reject). Documents render in an **inline `<iframe>` viewer** (h-80). Tabs/sections: profile info, documents, connected pharmacies (circle with outstanding), products list, orders (click → `/admin/orders/:id`). Footer "Message" button → `/admin/messages/{user_id}`.
- **AdminPharmacyDetail** (`pharmacies/:id`, 265 lines): identical pattern — profile, iframe documents with per-doc status, circle (stockists side), last-100 `pharmacy_inventory`, orders, approve/reject + reason + notify, message button.
- **AdminDoctorDetail** (`doctors/:id`, 175 lines): doctor profile + consultation fees card + Account Status card (approve/reject w/ reason + notify) + Documents (medical certificate, ID proof; iframe) + consultations list.
- **AdminCustomerDetail** (`customers/:id`, 172 lines): customer profile + Orders (click→customer-order detail) + Consultations + Prescriptions lists + Message button. **AdminCustomers**: card list of all `customer_profiles`, newest first.
- **AdminConsultationDetail** (`consultations/:id`, 142 lines): patient + doctor cards, prescription list, and an **"Admin Override Status"** card that updates `consultations.status` directly (plain `.update()`, not an RPC).

### 16.2 Oversight & finance pages
- **AdminOrders** (`orders`): two tabs — B2B (`orders` all) and B2C (`customer_orders` all), cards navigate to respective detail pages.
- **AdminCustomerOrders**: flat list of all `customer_orders` → detail.
- **AdminPayments** (167 lines): B2B `payments` list + a second query of `customer_orders` treated as B2C payment records (click → customer-order detail).
- **AdminBills**: all `bills` read-only list.
- **AdminDeliveryStaff**: merges `delivery_staff` (⋈ stockist business name) + `pharmacy_delivery_staff` (⋈ pharmacy name) into one read-only roster with active badges.
- **AdminReviewsManagement**: reads `customer_reviews` with 5-star renderer; **read-only** (no delete/moderation action).
- **AdminLicenseExpiry**: stockist + pharmacy profiles with non-null `drug_license_expiry`; per-row "Send Notification" inserts a `notifications` row to the licensee (toast "Notification sent to {name}"). NOTE: selects `drug_license_number` which is not in generated types.
- **AdminConsultations**: flat list. **AdminReturns/AdminCommissions**: read-only (as previously noted).

### 16.3 Analytics & reporting pages
- **AdminAnalytics** (216 lines): one `["adminAnalytics"]` query across 7 tables (orders, payments, all 4 profile tables, customer_orders); KPI grid with a **drill-down panel** (clicking a stat opens a card listing the underlying rows for that `drilldown.type`).
- **AdminRevenueDetail**: period selector; delivered B2B revenue (⋈ pharmacy+stockist names), delivered B2C revenue (⋈ pharmacy+customer names), commission totals; "Revenue Trend (B2B + B2C)" chart + "Top Pharmacies by B2C Revenue".
- **AdminPlatformInvoice**: month picker (12 back); pulls delivered B2B + B2C totals, confirmed payments, and `platform_settings.platform_commission_pct` + `gst_rate_medicines` → computes a hypothetical platform commission invoice for that month. **Display-only; nothing is billed or persisted.**
- **AdminSystemReport**: whole-platform counts (4 profile tables head-counts, orders/customer_orders/payments/bills/consultations sums, product count, return count) + "Download" (client file, toast "Report downloaded").
- **AdminActiveUsers**: recent `login_activity` → dedup user_ids → join `profiles` + `user_roles` → active-user list (uses zero-UUID sentinel to avoid empty `.in()`).
- **AdminLoginHistory**: raw `login_attempts` (email/success/time). **AdminActivityLog**: raw `login_activity`. **AdminAuditTrail**: raw `admin_audit_log` list.
- **AdminApiMonitoring**: 7-day counts of orders/customer_orders/notifications/login_activity + total profiles/consultations shown as "Operations (Last 7 Days)"; health indicator hardcoded (no real probes).
- **AdminGeoDistribution**: state/city tallies across the 4 profile tables → "Top Cities" + "Users by State" lists.
- **AdminExportData**: per-table export buttons; `select("*").limit(5000)` → XLSX; toasts success/`No data to export`.

### 16.4 Configuration CRUD (exact behavior)
All follow the same pattern: list query, inline create form, toggle `is_active` where applicable, hard delete, `qc.invalidateQueries`.
- **AdminSubscriptions**: create needs name + monthly price (yearly optional, features text); toggle/delete. No consumer.
- **AdminBanners**: title required; message, banner_type, `target_roles[]`; toggle/delete. No renderer in any layout. (Earlier note about an image URL field applies to the prior iteration; the current table has no image column.)
- **AdminServiceableAreas**: `admin_serviceable_areas` pin/city/state; unique-PIN violation surfaces as toast error; toggling `is_active` immediately affects stockist-registration PIN gate.
- **AdminSpecializations / AdminDrugSchedules / AdminProductCategories / AdminPharmacyCategories**: name(+description/restrictions) create + delete; **not consumed by product/registration forms** (those use hardcoded constants), so these are admin-side reference data only.
- **AdminSettings** (192 lines) — the platform config hub: platform **logo upload** to `platform` bucket (upsert, public URL, key `logo_url` → consumed by TopNav); generic `saveSetting(key,value)` upsert into `platform_settings`; **platform commission %** (`platform_commission_pct`, numeric-validated); **GST rate per category** (`gst_rate_{category}`; note Checkout still hardcodes 5% — these settings are only read by AdminPlatformInvoice); **payment-method toggles** ("Payment methods saved"); **quick_questions CRUD** (question+answer+category; feeds chat-bot and ChatPage chips).

### 16.5 Admin misc
- **AdminMessages**: conversation list from `conversations` ⋈ `profiles` + last `chat_messages`; click → `/admin/messages/:userId` (ChatPage in admin mode — admin replies write `sender_type:"admin"`).
- **AdminProfileSettings / AdminMore / AdminHelpCenter**: standard profile form, MenuPage grid of all admin routes, static help.

---

## 6D. MVP AppStateContext engines (client-side business logic)

## 8. APPSTATECONTEXT ENGINES — EXACT LOGIC (`AppStateContext.tsx`)

### 8.1 Merged/derived data
- `allOrders` = seedOrders (with `orderStatusOverrides` applied) + `dynamicOrders`.
- `allPayments` = seedPayments + dynamicPayments. `allLedger` = seedLedger + dynamicLedger.
- `allStockists`/`allPharmacists` = seed + dynamic, each with `userStatusOverrides` applied.
- `allMedicines` = seed + dynamic, `isCounterfeit = counterfeitOverrides[id] ?? seed value`.
- `allBatches` = seed + dynamic, `quantity = batchQtyOverrides[id] ?? seed`, `isCounterfeit = counterfeitOverrides[medicineId] ?? seed` (so flagging a med flags all its batches).
- `allInventory` per medicine: `batches` = all its batches; `totalStock = Σ quantity of NON-EXPIRED batches` (expiry > now); `lowStockThreshold = 100`.
- `allBanners` = seed (minus deletedBannerIds, with overrides) + dynamic (minus deleted).

### 8.2 Cart
- `addToCart` rejects if `existingInCart + qty > available` (batchQtyOverride-aware), if batch expired (`expiryDate <= now`), or if medicine counterfeit. Merges by `batchId + stockistId`.
- `removeFromCart(medicineId, stockistId)`; `updateCartQty` (≤0 removes); `clearCart`.

### 8.3 Stock validation & deduct/restore
- `getAvailableStock(batchId)` = override ?? seed qty.
- `validateStock(items)` → errors for: batch not found, insufficient stock, expired batch, counterfeit medicine. Returns `{valid, errors}`.
- `deductStock(items)` / `restoreStock(items)` mutate `batchQtyOverrides` (clamped ≥0 on deduct).

### 8.4 Orders
- `createOrder`: id `order-dyn-{orderCounter}`, orderNumber `ORD-YYYYMMDD-{####}` (counter, padded), timeline seeded with initial status "Order placed", createdAt/updatedAt now. Prepends to dynamicOrders. **Writes a DEBIT ledger entry** for the pharmacy (`amount = grandTotal`, runningBalance = grandTotal). **If status starts `confirmed` → `deductStock`.**
- `updateOrderStatus`: blocks if current status is delivered/cancelled (early return). Deducts stock on `placed/draft → confirmed`; restores on `confirmed/dispatched → cancelled`. For seed orders → writes to `orderStatusOverrides` (appends timeline); for dynamic → mutates the order.
- `updateOrderItems`: **only affects dynamic orders in `placed` status**; seed orders skipped entirely (returns early). Sets items + totals + totalDue.

### 8.5 Payments
- `addPayment`: blocks on cancelled order. **Clamps amount to remaining due** (`min(amount, max(0, grandTotal − existingPaid))`; ≤0 → no-op). Computes status paid/partial. Writes payment (`pay-dyn-{ts}`) + a CREDIT ledger entry (`led-pay-{ts}`, runningBalance 0). payer/payee derived from order.type.

### 8.6 Invoices & reminders
- `generateInvoice`: one per order (`inv-{n}`, `INV-2024-{###}`, status `issued`); returns existing if present.
- `sendReminder`: appends `PaymentReminder` (`rem-{ts}`, channel whatsapp/sms). **No real message.**

### 8.7 Connections & users
- `connectStockist`/`disconnectStockist`/`getConnectedStockists` on per-pharmacy `Record<string,string[]>` (default built from `defaultCircleEntries`).
- `registerStockist`/`registerPharmacist` force `status:'pending'`. `updateUserStatus` writes `userStatusOverrides`.

### 8.8 Inventory mutations
- `addMedicine`, `updateMedicine` (dynamic only — **cannot edit seed medicines**), `addBatch`, `updateBatch` (dynamic only + syncs `batchQtyOverrides`), `addProduct` (med + batch), `toggleCounterfeit` (flips override, seeds from current value).

### 8.9 Circle
- `addCircleEntry` (`circle-{ts}`) + **auto-connect** stockist for the pharmacy. `removeCircleEntry`, `updateCircleEntry`.

### 8.10 Addresses
- `addAddress` (`addr-{ts}`), `updateAddress`, `deleteAddress`, `setDefaultAddress` (default is scoped per `organizationId` group).

### 8.11 Order-type & credit
- `getOrderType(pharmacyId, stockistId)` = CIRCLE iff a circleEntry links them, else PLATFORM.
- `getCreditUsed` = `Σ max(0, grandTotal − paid)` over non-cancelled orders for that pharmacy↔stockist pair.
- `getCreditLimit` = circle entry's creditLimit (or 0). `canUseCredit(p,s,amt)` = limit>0 && used+amt ≤ limit.

### 8.12 Derived money selectors
- `getOrderPayments/PaidAmount/RemainingAmount/PaymentStatus`. `getOutstandingForParty` and `getOutstandingBetween` = `Σ max(0, grandTotal − paid)` over non-cancelled orders. `getLedgerBalance` = `Σ (debit − credit)` (note: PlatformLedger does NOT use this).

### 8.13 Delivery, holidays, returns, credit notes
- Delivery areas/slots CRUD (persisted). Holidays add/remove; `isStockistOnHoliday`/`getStockistHolidayInfo` = exact `date === today`.
- `createReturnRequest` (`ret-{ts}`, pending). `approveReturn`: computes `Σ unitPrice × returnQty` from order lines → mints `CreditNote` (`cn-{ts}`, applied:false) + marks request approved + `creditNoteId`. `rejectReturn`. `getAvailableCreditNotes` filters unapplied by pharmacy↔stockist — **never consumed anywhere**.

### 8.14 Pharmacy inventory auto-populate
- `useEffect` on `allOrders`: for each `delivered` order not already added, copies items into `pharmacyInventory` (`pi-{orderId}-{idx}`; medicine, batchNumber, qty, mrp, expiry, receivedAt now). One-time per order. `getPharmacyInventory(id)`.

### 8.15 Support
- `addSupportMessage` (`msg-{ts}`).

---

## 5B. MR status vocabularies & glossary

## 23. STATUS VOCABULARIES & DOMAIN GLOSSARY

### 23.1 Every status string in the system
| Domain | Values | Written by | Notes |
|---|---|---|---|
| bills.status | pending, due_soon, overdue, critical, paid (+ legacy CHECK also allows draft) | creation flows ('pending'), update_bill_statuses RPC, UpdateBillModal/Payments ('paid') | date-driven machine, §8.2; CHECK-constraint tension noted in §14 #4 |
| orders.status | pending (all creators), delivered? — never set by any code path | Checkout/OrderForm ('pending') | effectively frozen at 'pending'; read by SellerDashboard revenue + MySuppliers pendingPayment |
| orders.delivery_status | pending → confirmed → packed → shipped → delivered; cancelled | Orders detail dialog | the real fulfilment machine; StatusBadge renders confirmed/packed/shipped/delivered as "Unknown" (grey ?) since it only knows bill statuses |
| payment_requests.status | pending (PharmacyDetail), sent (Payments) | — | never transitions to paid; `paid_at` never written |
| payment_reminders.status | sent (only) | PharmacyDetail | delivered/failed values allowed by CHECK, never used |
| payment_reminders.reminder_type | initial, followup | PharmacyDetail | 'overdue' allowed by CHECK, never used |
| subscription_requests.status | pending, approved, rejected | Upgrade / admin Subscriptions | both pages unrouted |
| support_tickets.status | open, in_progress, resolved, closed | Support (open), SupportManagement select | resolved/closed stamp resolved_at |
| support_tickets.priority | low, medium, high, urgent | Support dialog | colour-coded badges |
| otc_shipments.status | pending, in_transit, delivered, cancelled (CHECK) | initialize-otc-inventory ('delivered' only) | |
| pharmacy_otc_subscriptions.status / payment_status | active / paid | OTCPartnership wizard | dummy payment |
| profiles.subscription_tier | free, premium | admin approve | badges only |
| Pharmacy roll-up (client-only) | up-to-date, pending, due_soon, overdue, critical | Pharmacies/Dashboard(dead) computed | not persisted |

### 23.2 Glossary of app-specific terms
- **CD (Cash Discount)** — the upfront-payment percentage on a bill; the BillForm section is literally titled "Cash Discount (CD) & Payment Terms".
- **Catalogue Live** — profile-level flag exposing a seller's products to pharmacy RLS reads; toggled in MyProducts.
- **Self-Added Pharmacies** — MR's manually created `pharmacies` contact records, vs **Platform Orders** from registered pharmacy users.
- **Seller-locked cart** — one seller per cart, enforced (only) in MarketplaceProducts.
- **Payment Request vs Reminder** — request = a row with a UPI link asking for money; reminder = the (logged) WhatsApp nudge about it.
- **Upfront/Remaining** — bill split at creation: received_amount seeded with upfront, due_amount stores the remainder (with the §2.9 double-count quirk).
- **Brand lock** — MR may only catalogue products whose brand_name equals their profile.business_type (client lock + DB trigger).
- **stockist_id** — historical column name meaning "the seller who owns this product/order" regardless of actual role (MRs and distributors are also `stockist_id`).

---

## 6E. MR consolidated business rules

## 20. CONSOLIDATED BUSINESS-RULE & CALCULATION INDEX

| Rule / formula | Value / expression | Where |
|---|---|---|
| Line price (marketplace) | `price × (1 − discount_percentage/100)` | MarketplaceProducts, SellerDetail, Cart, Checkout |
| Order total | Σ line price × qty (no tax, no shipping) | Cart/Checkout/OrderForm |
| Sale-rate calculator | percent: `MRP−MRP·m/100`; amount: `MRP−m`; clamp ≥ purchase_rate | ProductForm |
| Bill upfront | `round(total × upfront% / 100)`; remaining = total − upfront | PharmacyDetail, BillForm |
| Due date | bill_date + payment_terms_days (defaults 7 or 30, §11) | `calculateDueDate` |
| Credit utilization | Σ(due−received) over non-paid bills; % vs max_credit_limit; thresholds 80/90/100 | PharmacyDetail, PharmacyCard, check_credit_limit RPC |
| Bill status buckets | paid ≤0 remaining; due_soon ≤2d before due; overdue <7d late; critical >7d | update_bill_statuses RPC |
| Pharmacy roll-up status severity | critical > overdue > due_soon > pending > up-to-date | Pharmacies list sort |
| Stock badges | 0 out / ≤10 low / >10 in stock; marketplace: >10 "In Stock", 1–10 "Only n left" | MyProducts, MarketplaceProducts |
| Expiry buckets | expired <0d / expiring ≤30d / ok >30d | MyProducts filter |
| Numbering | bills `MR/NNN` per MR (RPC); orders `ORD/NNNN` per stockist (RPC) vs Checkout's buyer-count client scheme | §8.1 |
| Revenue (MR) | Σ bills.received_amount | SellerDashboard |
| Revenue (stockist/distributor) | Σ orders.total where status='delivered' (never satisfied, §15.2) | SellerDashboard |
| Collection rate | received/(received+pending)×100 | Reports Payments |
| OTC earnings estimate | Σ mrp×qty×5% | PharmacyDashboard |
| Premium | ₹999 → +30 days, tier 'premium' (no feature gating) | Subscriptions |
| Free-tier customer cap | columns customer_count/max_customers_free_tier(3) — **not enforced** | profiles |
| MR brand lock | client Select lock + `enforce_mr_brand_restriction` DB trigger | ProductForm / DB |
| Admin gate | `jit@ADMIN1` ×3 layers; wipe phrase; DELETE phrase; IFSC regex `^[A-Z]{4}0[A-Z0-9]{6}$`; username 6–16; file ≤5MB; password ≥6; phone 10–15 | various |


---

## 4C. Extended implementation specifications (line-extracted from reviews)

> Additional detail merged from per-app reviews to meet exhaustive flow/business-rule coverage. App-tagged content preserved.

## 4B.8 ERP Stockist module (full screen specs)

## 2. STOCKIST MODULE

### 2.1 Dashboard (`/stockist/home`) — `Dashboard.tsx`
- Uses `useStockistId` (React Query), `usePendingPayments(stockistId, 3)`, `useProcessPayment`, `useDashboardStats(stockistId)`. Realtime channel `dashboard-orders-updates` on `orders` filter stockist_id → refetch platform orders.
- **Header**: title "Dashboard" / "Welcome to your stockist control panel"; `DateRangeFilter` (calendar range popover, 2 months, Clear button — **display only, not applied to any query**); **Export** button → `ExportDataDialog`.
- **Quick Actions** card → `QuickActions` component: 8 tiles — **Quick Order** (paste→parse), **Quick Bill**, **Edit Order**, **OCR Scan** (ProductScanDialog), **Bulk Upload**, **Map Route**, **Upload Bill Photo** (BillUploadDialog), **Delivery Settings** (navigates). (Edit Order tile opens EditOrderDialog with `selectedOrderId=null` — effectively needs an order id, so it renders null until one is chosen — a soft stub.)
- **KPI Cards** (`KPICards`, clickable → `handleKPIClick` opens `KPIDetailDialog`): 5 cards, each shows hardcoded fake trend badges:
  - **Total Revenue** = `Σ orders.total_amount` (all orders for stockist). Sub "Today: ₹{todayRevenue}". trend "+12.5%".
  - **Pending Payments** = `Σ pharmacy.outstanding_balance` over pharmacies that have orders w/ this stockist. trend "-5.2%".
  - **Total Credits** = `Σ pharmacy.credit_balance` (same pharmacy set). trend "+3.1%".
  - **Active Pharmacies** = count of `is_active` pharmacies that have orders w/ stockist. trend "+2".
  - **Total Orders** = orders.length. Sub "Today: {todayOrders}". trend "+8.7%".
  - `useDashboardStats` formulas: parallel fetch orders (`total_amount,payment_status,created_at,pharmacy_id`) + active pharmacies (`outstanding_balance,credit_balance`). `todayOrders`=orders where `new Date(created_at).toDateString()===today`. Realtime channels `dashboard-stats-orders-{id}` (orders), `dashboard-stats-pharmacy-{id}` (pharmacy UPDATE).
  - **KPIDetailDialog** content by type: revenue/orders → order list (pharmacy name, order_number, relative time, ₹total, payment badge); pending → pharmacies with outstanding (name/area/₹outstanding); credits → pharmacies (+₹credit); pharmacies → cards (owner/area/total_orders). `handleKPIClick` queries: pending = unique pharmacy_ids from orders w/ payment_status in (unpaid,partial), then pharmacy_details `gt outstanding_balance 0`; credits = `gt credit_balance 0`; pharmacies = `is_active true`.
- **Payment Approvals card**: border turns `destructive/50` when pending>0; destructive Badge "{n} Pending". Shows up to 3 pending confirmations, each: pharmacy_name, ₹amount, payment_type badge, optional pharmacy_notes; inline buttons **Reject / Hold / Approve** (via `useProcessPayment.mutateAsync({confirmationId, action})`). "View All Payment Approvals" link. Empty state → "No payment approval requests yet" + View Payment History link.
- **Recent Platform Orders** card (only if platformOrders>0): fetches orders `order_source='platform'` limit5; each row (pharmacy name, order_number, "Platform Order" badge, ₹total, left-border primary) → `/stockist/orders/:id?source=platform`. "View All Platform Orders".
- **LowStockAlert** (orange card, only renders if any): products where `stock_quantity <= min_stock_threshold`, sorted asc, top 5 (name, brand, "{n} left" badge). "View All Products".
- **TopProducts** ("Top Selling Products"): aggregates `order_items` joined to confirmed orders of stockist; ranks by total_quantity desc top 5 (rank badge, name, units sold, ₹revenue).
- **NoticesPanel**: fetches `user_notice_recipients` for user (not dismissed) → `admin_notices` active & not expired. Each notice: icon by type (alert/warning/info), title, priority badge, content, created date, dismiss X (sets `dismissed_at`), click marks `read_at`. "N New" badge = unread count. Realtime on `user_notice_recipients` INSERT.
- **RecentOrders** (collapsible): last 5 orders (order_number, pharmacy_name, relative time, ₹total, status badge). Status colors map draft/confirmed/processing/delivered/cancelled.
- **ActivityFeed** (collapsible): `activity_log` last 50, filter Select (all / catalogue_update / price_change / order_modified / payment_reminder); shows 10 with icon+description+relative time; realtime INSERT.
- **ExportDataDialog**: RadioGroup Orders/Payment Confirmations/Activity Log → fetches all rows for stockist → naive CSV (headers = Object.keys(row[0]), values JSON.stringify for objects) → downloads `{type}_{yyyy-MM-dd}.csv`.

### 2.2 Pharmacies (`/stockist/pharmacies`) — `Pharmacies.tsx`
- Uses `useStockistId` + `useCachedPharmacies(stockistId)` (cache w/ invalidate). Realtime: `pharmacies-payments-updates` (payment_confirmations UPDATE→approved), `pharmacies-orders-updates` (orders *), `pharmacies-details-updates` (pharmacy_details UPDATE). Search filter over name/owner/phone/area.
- **fetchPendingOrders**: orders for stockist where `payment_status in (unpaid,partial) OR delivery_status≠delivered OR status=cancelled`, ordered created_at ASC (FIFO), grouped by pharmacy_id.
- **Per-pharmacy financials** (`calculateFinancials`, computed for ALL pharmacies):
  - `totalOutstanding = Σ max(0, total_amount - paid_amount)` over unpaid/partial orders.
  - `latestBillDue` = first (newest listed) unpaid order's due + its `payment_due_date||created_at`.
  - `pastDues = Σ max(0, due)` over unpaid orders whose `payment_due_date < now`.
  - `ordersPending` = count of all grouped orders.
- **Pharmacy card**: name (click→detail), owner, Active/Inactive badge + Lock icon when inactive (opacity-60). Contact: phone (tel link + copy-to-clipboard), address. Financial block: Credit Balance (green, if>0), Total Outstanding (destructive), **Net Due** = `max(0, outstanding_balance - credit_balance)` (only if credit>0), Latest Bill Due (amber), Past Dues (red, if>0), Orders Pending count.
- **Row menu** (MoreVertical): View Details, Edit (EditPharmacyDialog), Mark Active/Inactive (toggle is_active), Delete Permanently (`handleDelete`: hard delete, on FK failure falls back to soft delete `is_active=false`).
- **Payment actions per card**:
  - **Custom amount input + Submit** (`handleCustomPayment`): credit-first FIFO. Fetches pharmacy.credit_balance; if credit>0 uses `creditUsed=min(payment,credit)`, `totalFundsToDistribute=creditUsed+payment`, deducts creditUsed. Then FIFO over unpaid orders sorted oldest-first (excludes cancelled): applies `min(remaining, orderDue)`, marks 'paid' when `|total-newPaid|<0.01` (rounding tolerance) else 'partial'; leftover >0.01 → back to credit_balance. Inserts an **approved** `payment_confirmations{payment_type:'custom', payment_method:'custom_amount', processed_by}`. Recalculates `outstanding_balance`. Disabled if inactive/empty/≤0.
  - **Create Order** → navigates `/stockist/order-creation` with `state.preSelectedPharmacyId`.
  - **Quick Bill** → QuickBillDialog (preselected).
  - **WhatsApp Reminder** → `wa.me/{phone}?text=` "Payment reminder for outstanding amount: ₹{totalDue}…".
  - **Mark Fully Paid** (`handleMarkFullyPaid`): sets `paid_amount=total_amount, payment_status=paid` for all unpaid orders; recalcs balance; logs `activity_log{activity_type:'payment_received'}`. Disabled if outstanding≤0.
- **Expandable orders** ("View All Orders (N)"): each order shows order_number (link→OrderItemsDialog), amount, computed due `max(0,total-paid)`, status badge with 0.01 tolerance (paid/partial/CANCELLED), inline **delivery_status Select** (Pending/Dispatched/Delivered — optimistic update, revert on error).
- **Dialogs**: AddPharmacyDialog, EditPharmacyDialog, QuickBillDialog, OrderItemsDialog.
- **AddPharmacyDialog fields**: Pharmacy Name*, Full Name (Google Maps), Owner Name, Phone(tel), Pin Code (6), GST Number*, License Number* ("used as password for catalogue access"), Credit Limit (₹, default 0), Area, Full Address (textarea), Location Coordinates (lat,lng). On submit: inserts `pharmacy_details{profile_id: stockist.id, ...}` (profile_id set to stockist's id for RLS) + **creates placeholder order** `INIT-{ts}` (total 0, delivered, paid) to establish relationship so pharmacy appears immediately.

### 2.3 Pharmacy Detail (`/stockist/pharmacies/:pharmacyId`) — `PharmacyDetail.tsx`
- Recomputes on load from orders: total_orders count, total_revenue `Σ total_amount`, outstanding `Σ (total-paid)` over unpaid/partial.
- Header: Create Order, Send Reminder (WhatsApp w/ a hardcoded placeholder `upi://pay?pa=yourUPI@bank...` link — bug/stub).
- **Quick stats** (4 cards): Total Outstanding (red), Total Revenue, Total Orders, Credit Limit.
- **Tabs**: Orders (`PharmacyOrdersList`), Bills (`PharmacyBillsList` — only orders with bill_number+bill_image_url, View Bill), Reminders (`PharmacyRemindersList` — `payment_reminders`, Nudge re-sends WhatsApp + logs a new reminder), Details (`PharmacyDetailsTab` — basic/contact/financial incl. Available Credit = credit_limit − outstanding).

### 2.4 Products (`/stockist/products`) — `Products.tsx`
- 20 hardcoded `MEDICAL_CATEGORIES` (Analgesics… Others). Realtime `products-realtime` on products.
- Header: Add Product; quick actions **Scan** (ProductScanDialog), **Bulk** (BulkUploadDialog), **Enhance All** (`handleEnhanceAllProducts`: finds products missing generic/brand/manufacturer/category/type; confirm; loops `fetch-product-info` per product, updates fields; toast "Enhanced N products").
- Search (name/brand/category). Filters (4 Selects): Brand (distinct), Category (MEDICAL_CATEGORIES), **Expiry** (30/60/90/120 days — filters where earliest `product_batches.expiry_date` diff in [0,days]), **Sort** (default/name/price-low/price-high/stock-low).
- `fetchTopProducts`: 30-day order_items aggregation by product_name (top 5 names matched to product objects). `fetchExpiryMap`: earliest batch expiry per product.
- **Sections**: Top Products This Month (horizontal cards); Items to Watch Out For (products where `stock ≤ threshold && stock>0`, top 4).
- **Product card** (grid): image (fallback placeholder.svg), name, brand, sale_price bold + MRP strikethrough (if mrp>sale), "Stock: N | Sale: ₹", expiry badge (`getExpiryBadge`: Expired if diff<0, {diff}d destructive if≤30, {diff}d secondary if≤90, {months}mo outline), row menu (Edit/Delete w/ confirm), **Add Stock** (QuickUpdateStockDialog).
- **AddProductDialog fields**: Product Name* + **Auto Fetch** button (`fetch-product-info` fills generic/brand/manufacturer/type/category/pack_size/strength); Generic Name/Salt (hint "+ for multiple salts"); Brand; Manufacturer; Form/Type (Select: tablet/capsule/syrup/injection/drops/cream/powder/suspension/inhaler/lotion/gel/patch/spray/solution); Category (Select ~24 values); Pack Size; Strength (hint "+" for combos); MRP; Purchase Price; Sale Price; Stock Quantity (default 0); Min Stock Alert (default 10); MOQ (default 1); GST % (default 5); Product Image (upload to `product-images`); Description; batch_code (in state but not in insert). Insert to `products`; logs `activity_log{activity_type:'catalogue_update'}`.
- **EditProductDialog**: same fields pre-filled + **HSN Code** and **Batch Code** inputs + **Fetch with AI**. NOTE: update payload does **NOT persist `hsn_code` or `batch_code`** (they're in the form but omitted from the `.update(...)` object) — known gap. Type dropdown only has 6 options (fewer than Add).
- **QuickUpdateStockDialog**: mode toggle **Add Stock** vs **Set Stock**; quantity input; live "New stock will be: N" preview (add mode); updates `stock_quantity`.
- **ProductScanDialog (OCR)**: upload image→`uploadToStorage(product-images)`→`extract-product-label`; staged progress (10/30/70/85/100%). Prefills mrp/batch_number/expiry_date. Matches existing product (exact `.eq(name)` then `.ilike`). Shows "Product exists" (blue, current stock/MRP) or "New" (green). **"Correct — Enable Editing"** unlocks MRP*/Stock*/Purchase*/Sale*/Batch/Expiry (all disabled until confirmed). Existing → `stock += entered`, updates prices/brand/manufacturer/strength; new → insert. Logs activity.
- **BulkUploadDialog** (3 tabs): **Purchase Bill / Sale Bill / Full Catalogue**. Accepts images/PDF/CSV/XLSX (catalogue = CSV/XLSX only), 10MB max. Spreadsheets parsed locally (`parseSpreadsheet` w/ header alias map + `isValidProductName` filter that rejects phone/email/gstin/total/page/etc); images→`extract-bill-items` (AI). **Preview** table: matches against existing products (normalized name) → status found/new/error; margin input (default 20%). Purchase: existing → `stock += qty`, set purchase_price + `sale_price=price*(1+margin/100)`; new → insert w/ `mrp=price*1.3`. Sale: existing → `stock -= qty`; new → error "not found". Catalogue tab: upsert on conflict `stockist_id,name` (dupes counted skipped). Templates downloadable. AbortController cancel. Logs activity per operation.

### 2.5 Orders (`/stockist/orders`) — `Orders.tsx`
- Realtime `orders-realtime-updates` (UPDATE). Filters: Pharmacy (Select of active pharmacies), Payment Status (paid/unpaid/partial), Order Source (manual/platform/whatsapp), Clear button. **Status tabs** (buttons with counts): All / Pending (`status=confirmed && delivery_status=pending`) / Out for Delivery (`delivery_status=out_for_delivery`) / Delivered / Cancelled.
- Desktop **table** columns: Order # | Pharmacy | Status | Payment | Delivery | Amount (right) | Date (MMM dd, yyyy) | Actions (OrderActionsDropdown). Mobile: OrderCard grid. New Order → PharmacySelectDialog → `/stockist/order-creation?pharmacy=:id`.
- Badges: status(draft=secondary/confirmed=default/cancelled=destructive), payment(paid=default/unpaid=destructive/partial=secondary), delivery=outline.
- **OrderActionsDropdown** actions: **Mark as Paid** (paid_amount=total, status=paid; inserts approved payment_confirmation `manual_mark_paid`), **Partial Payment** (dialog; validates `amount ≤ due`; new status paid if `|total-newPaid|<0.01` else partial; inserts confirmation `manual_partial`), **Mark as Delivered** (delivery_status=delivered, status=confirmed), **Cancel Order** (confirm; if paid>0 message says "₹X added as credit"; sets status=cancelled).

### 2.6 Order Detail (`/stockist/orders/:orderId`) — `OrderDetail.tsx`
- Three status cards (Order/Payment/Delivery). **Order Information**: order_number, order date (PPp), delivery_date (if set), **Order Source** badge ("Platform Order" if platform else "Manual Order"), notes. **Payment Information**: Subtotal = `total_amount - tax_amount`, Tax, Total (bold), Net Amount, **Send Reminder** button → PaymentLinkDialog (requires phone). **Pharmacy Details** (name/owner/phone/address). **Order Items (N)** with **Edit Items** → OrderItemsDialog; each item: name, description, "Qty × ₹unit (GST %)", tax line, ₹total (uses Math.round).

### 2.7 Order Creation (`/stockist/order-creation`) — `OrderCreation.tsx`
- pharmacyId from `?pharmacy=` or `location.state.preSelectedPharmacyId`. Loads stockist + pharmacy + active products (`gst_percentage, batch_code`).
- **Quick Add — Paste Order**: textarea → **Parse & Add Items** (`parse-order-message`); adds matched items where `productId && matchConfidence≠'none'`, warns unmatched count.
- **Manual add**: product Select + quantity; allows over-stock (toast warning "Only N in stock. Item added but marked as insufficient."). Per-item GST = `product.gst_percentage||5`; `tax=subtotal*rate/100`.
- **Order Summary**: Subtotal `Σ qty*unit`, **SGST = tax/2**, **CGST = tax/2**, Total `subtotal+tax`.
- **Order Items table**: Product (insufficient→destructive bg + "Only N left" badge + inline **Update Stock** button→QuickUpdateStockDialog), Quantity, Unit Price, Tax (%+₹), Total, remove. Clear All.
- **Create Order** (`handleCreateOrder`): order `ORD-{Date.now()}`, `status=confirmed, payment_status=unpaid, delivery_status=pending, order_source=manual`, total/net=totalAmount, tax_amount; inserts items (incl gst_percentage, tax_amount, batch_code); decrements product stock per item; opens PaymentLinkDialog (on close → /stockist/orders); recalculates pharmacy `outstanding_balance`.

### 2.8 Payments (`/stockist/payments`) — `Payments.tsx`
- Realtime `orders-payments-updates`. Summary cards: **Total Outstanding** = Σ over dedup-by-pharmacy of `pharmacy.outstanding_balance` (uses `findIndex` dedup); **Pending Invoices** = `Σ total_amount` of unpaid/partial + count; **Received This Month** = `Σ total_amount` of paid orders whose `updated_at` month/year = now + count.
- Tabs: **Pending Invoices** (table: Pharmacy | Order # | Status | Invoice Amount | Outstanding | Order Date | Actions), each row **Send Reminder** (dialog: amount prefilled=outstanding||total, "Use Full Outstanding" button, message textarea; inserts `payment_reminders{status:sent}` + `communication_log{type:whatsapp}`, opens WhatsApp) and **Mark Paid** (`handleMarkPaid`: paid_amount=total, status=paid; inserts approved confirmation `manual_payments_page`; recalcs balance). **Received** tab (last 50 paid: Pharmacy|Order#|Amount|Payment Date).

### 2.9 Payment Approvals (`/stockist/payment-approvals`) — `PaymentApprovals.tsx`
- Realtime `payment-approvals-realtime`. Header: animated destructive "{n} Pending" badge (pending count) + Refresh. Lists all confirmations (pharmacy, ₹amount, payment_type + created datetime, pharmacy_notes, status badge approved/rejected/on_hold/pending). Review button for pending/on_hold → dialog with optional **Your Notes** textarea and **Reject / Put on Hold / Approve** → `approve-reject-payment` edge fn.

### 2.10 Analytics (`/stockist/analytics`) — `Analytics.tsx`
- KPI cards: Total Revenue (`Σ total_amount`), Total Orders, Active Pharmacies (**count of ALL pharmacy_details** via head count — not scoped to stockist, likely a bug), Products (stockist's count). Tabs (Recharts): **Revenue Trends** (LineChart revenueByMonth, last 6 months by `MMM yy`), **Order Analysis** (PieChart ordersByStatus), **Top Pharmacies** (BarChart top 5 by revenue). topProducts collected as `[]` (unused).

### 2.11 Route Execution (`/stockist/route-execution`) — `RouteExecution.tsx`
- Requires `location.state {selectedPharmacyIds, startingAddress, stockistId}` (from MapRouteDialog). Fetches pharmacies + their non-delivered orders. **Auto-optimizes on load** via `optimize-route`. Route Summary: total distance + per-leg "d1 + d2 + return" + **Re-optimize with AI**. **Drag-and-drop reorder** (@dnd-kit) — reorders list, toasts "Re-optimizing…" (does not actually recompute distances). Per-stop **SortablePharmacyCard**.
- **SortablePharmacyCard**: drag handle, stop number, name/address, badges Due/Credit/Net/Fully Paid, distance. Expanded: Orders to Deliver list; **Notify Dispatch via WhatsApp** (whatsapp_number||phone; message with all order numbers); **Send Payment Link** per unpaid order (requires stockist UPI configured → PaymentLinkDialog); **Enter Collection Amount** + payment mode Select (cash/online/cheque/other) → **Record Payment** (FIFO over orders, inserts approved `payment_confirmations{payment_type:'route_collection'}`); **Mark Delivered** (sets all pharmacy orders delivery_status=delivered). `totalDue=Σ(total-paid)`, `netDue=max(0,totalDue-credit)`, `isFullyPaid=|totalDue|<0.01`.
- MapRouteDialog (from Quick Actions): starting address input; lists pharmacies with non-delivered orders (grouped, expandable per-order w/ payment+delivery badges, click order# → OrderItemsDialog); Select All / checkbox select; **Open in Google Maps** (builds `maps/dir` URL origin+destination+waypoints from coords/google_maps_name/address); **Start Route with AI** → navigates to RouteExecution.

### 2.12 Pharmacy Approvals (`/stockist/pharmacy-approvals`) — `StockistApprovals.tsx`
- Realtime on `pharmacy_registration_requests`. Shows only requests whose `pin_code ∈ stockist_service_areas` (active). If no service areas → empty. Table: Pharmacy | Owner | License # | PIN | Status | Submitted | Review.
- Status badge logic: approved→"Approved & Added"; rejected; both approved→"Both Approved"; admin_approved→"Admin Approved"; stockist_approved→"You Approved"; else "Pending Review".
- Review dialog: all fields + document buttons (drug_license/gst_certificate/other) + approval indicators (Admin Approved / Your Approval). **Approve** (`handleApprove`): sets stockist_approved+by+at+stockist_id; if `admin_approved` already true → status='approved' + **inserts `pharmacy_details`** (profile_id=stockist.id, is_active). Dual-approval model.

### 2.13 Batch Ordering (`/stockist/batch-ordering`) — `BatchOrdering.tsx`
- Fetches current `order_batch_cycles` where status='collecting'. If none → **Start New Cycle** → `create-batch-cycle`. Summary cards: Cycle Period, Total Orders, Total Value, Delivery Date. List of batched orders (pharmacy, order_number, ₹total, status).

### 2.14 Delivery Settings (`/stockist/delivery-settings`) — `DeliverySettings.tsx`
- Tabs: **Delivery Dates** (multi-select Calendar → toggles/inserts `stockist_delivery_dates{is_active}`; upcoming list w/ Active/Disabled badges), **Service Areas** (add 6-digit PIN + optional area name → `stockist_service_areas`; dup PIN error 23505; Switch toggle active; delete; "only pharmacies in these areas can order"), **Delivery Fees** (rule type Select: **Flat Fee / Free Above Order Amount / Per KM Charge**; value; inserts `stockist_delivery_rules` w/ priority=count+1; table priority/type/description/status/delete).

### 2.15 Stockist Profile (`/stockist/profile`) — `StockistProfile.tsx`
- Edit toggle. Tabs: **Personal** (Stockist Name/Company/License/Phone/Email(readonly)/Address), **Bank** (UPI ID, Bank Name, Account Number, IFSC, Account Holder Name), **Business** (GSTIN, Default Credit Days default 30), **Catalogue** (status badge active/inactive; shareable `${origin}/catalogue/{catalogue_slug}` w/ copy), **Areas** (add PIN, toggle active, delete `stockist_service_areas`).

### 2.16 Stockist Quick dialogs (details)
- **QuickOrderDialog**: pharmacy Select (fetched by `profile_id=stockistId`), order textarea (Zod: pharmacy required, text≥10). **Analyze Order with AI** → `parse-order-message`; results table with matchConfidence badges (Exact/High/Medium/Select), inline product Select for low/none, editable qty, remove, add manual item, order summary (taxRate toggle 5/12, default 12). **Create Order**: blocks if any unmatched or none/low; order `ORD-{ts}`, `order_source='whatsapp'`, status=confirmed; net=total+tax; inserts items+tax; decrements stock; logs activity; recalcs balance.
- **QuickBillDialog**: pharmacy Select (all active), product Select+qty (validates stock), items table, total. **Create Bill**: `ORD-{ts}`, confirmed/unpaid/pending, `order_source='manual'`; inserts items; decrements stock; logs `order_created`; recalcs balance. (taxRate state exists but total is untaxed.)
- **BillUploadDialog**: upload image/PDF→`uploadToStorage(bills)`→`extract-bill-items` (preview). Pharmacy matching: exact/partial/not_found (create-new checkbox or select existing). **Confirm & Create Order** → `process-bill-image` (passes preview items to skip re-AI); shows created count / auto-created products / failed.

---


## 4B.9 ERP Pharmacy module (full screen specs)

## 3. PHARMACY MODULE

### 3.1 Authenticated Portal (`/pharmacy/*`, CartContext)
- **Dashboard** (`/pharmacy/portal`): resolves pharmacy by `auth_profile_id`. Realtime on `pharmacy_inventory` + `orders`. KPIs: **Inventory Value** = `Σ quantity*(unit_price||0)`; **Low Stock Items** = count where `quantity ≤ low_stock_threshold`; **Expiring Soon** = count where `expiry_date ≤ now+30d`; **Orders This Month** = count since 1st of month. Quick Actions grid: Manage Inventory, Browse Stockists, My Orders, View Analytics.
- **Inventory** (`/pharmacy/inventory`): `pharmacy_inventory` table (Product | Batch | Quantity | MRP | Expiry Date | Status | Actions). Stock badge Out/Low/In (`getStockStatus`), expiry badge Expired/"Expires in Nd" (≤30). **Add Product** + **Edit** buttons are present but **unwired** (no handlers).
- **Ordering** (`/pharmacy/ordering`): per-stockist tabs (catalogue_enabled stockists) listing products (MRP, Your Price=sale_price, Stock). `comparePrice()` is a **`Math.random()` placeholder** ("Lowest price! Save ₹X"); **Add to Cart** button is unwired.
- **Browse Stockists** (`/pharmacy/stockists`): search name/company/address. Cards: product count (head count), next delivery date (earliest active future `stockist_delivery_dates`), phone, address. **Stockists serving the pharmacy's PIN sorted first** (via `stockist_service_areas`). View Catalogue → StockistCatalogue.
- **Stockist Catalogue** (`/pharmacy/stockists/:stockistId`): CATEGORIES = All/Tablets/Capsules/Syrups/Injections/Ointments/Drops/Other. Products where `is_active && stock_quantity>0`. Search (name/brand/category) + category filter. Card: name, brand, sale_price + MRP strikethrough, **discount% = round((mrp-sale)/mrp*100)**, stock, pack size, quantity stepper clamped **MOQ..stock**, Add/Update Cart (ring-2 highlight when in cart). Quantities initialized from cart + MOQ. Cart badge count in header.
- **Cart** (`/pharmacy/cart`): empty state (Browse Stockists). Items **grouped by stockist**, per-stockist subtotal + "Remove All", per-item qty stepper (1..maxStock) + remove, Clear Cart. Order Summary: per-stockist subtotals, Subtotal, "Delivery Fees: Calculated at checkout", **Total shown as `₹X+`** (fees pending). Proceed to Checkout / Continue Shopping.
- **Checkout** (`/pharmacy/checkout`): **separate order per stockist group**. Per group: Subtotal, **GST 5%** (`subtotal*0.05`), **Delivery Fee** via `calculate-delivery-fee` (fallback `subtotal≥5000?0:50`), Total = subtotal+gst+fee; free-delivery green alert if fee=0; per-order notes textarea. **Place Order** per group: order `ORD-{ts}`, `order_source='pharmacy_portal'`, confirmed/unpaid/pending, delivery_address=pharmacy.address; inserts items; RPC **`deduct_stock`** per item (warns on insufficient); clears that stockist's cart. **Place All N Orders** loops groups. Grand Total = Σ group totals. Success screen when all completed. Payment is COD/credit terms (alert). Delivery address card = pharmacy name/address/phone.
- **Orders** (`/pharmacy/orders`): search (order#/stockist) + status filter (all/confirmed/processing/shipped/delivered/cancelled). Collapsible cards: order_number + status badge + payment badge; stockist, date; ₹net_amount + "Due: ₹{net-paid}" (if>0). Expanded: items list, summary (Subtotal, GST, Total, Paid if>0). STATUS_COLORS/PAYMENT_COLORS maps.
- **Financials** (`/pharmacy/financials`): Outstanding (from pharmacy_details), Credit Balance (+₹), Total Purchases (`Σ total_amount`), Avg Order Value (`total/count`).
- **Analytics** (`/pharmacy/analytics`): inventory stat tiles only (no charts) — Total Products, Low Stock Items, Expiring Soon (≤30d), Inventory Value (`Σ qty*unit_price`).
- **Profile** (`/pharmacy/profile`): tabs Store Info (name/owner/phone/email readonly), License (drug license, GST), Location (address/PIN(6)/area). Keys by `auth_profile_id`.

### 3.2 Public Catalogue (`/catalogue/:stockist_slug/*`, PharmacyContext, no login)
- **License Verification** (`/catalogue/:slug`): first-visit OnboardingCarousel (Quick Verification / Browse Products / Easy Ordering) gated by `onboarding_completed_catalogue`. Form: Pharmacy Drug License Number* (mono, case/symbol-insensitive), Pharmacy PIN Code (optional, 6). Submit → `verify-pharmacy-license`. On `verified` → sets PharmacyContext pharmacy+stockist(+upi_id)+orders → `/catalogue/{slug}/dashboard`. Shows rate-limit message + "Attempts remaining: N" on failure. "First time user? Contact stockist" alert.
- **Catalogue Dashboard** (`/dashboard`): fetches latest balance, outstanding orders via `get-pharmacy-outstanding-orders`, last 5 `payment_confirmations`. Realtime on orders / pharmacy_details / payment_confirmations. Welcome card (name, license). Credit Balance panel (if>0), Outstanding Balance (destructive), Net Amount Due = `max(0, outstanding-credit)`. **Mark Payment** button (if outstanding>0) → MarkPaymentDialog. **UPI QR** (UpiQrCode for full outstanding) if stockist.upi_id. Quick actions Browse Products / My Orders. **Payment Requests** history (₹amount, datetime, status badge ✓Approved/✗Rejected/⏸On Hold/⏳Pending). **Outstanding Orders** breakdown (per order: number, date, Paid badge if partial, item lines, ₹outstanding). Recent Orders (last 5). Logout → clearSession.
- **Catalogue** (`/products`): products `is_active`. Search (name/brand/generic) + category + sort (name/price_asc/price_desc). Product card: image, name, brand, "Salts: {generic}", MRP strikethrough + sale_price, strength/pack badges, quantity stepper (min 1), Add to Cart. Cart carries `gst_percentage||5`. Cart button count in header.
- **Orders** (`/orders`): platform orders list (order_number, datetime, payment/delivery/status badges, Total/Paid/Pending, notes). Realtime.
- **Checkout** (`/checkout`): **per-item GST** — `calculateTotals`: per item `subtotal=qty*unit`, `tax=subtotal*gst%/100`, total; grandTotal=subtotal+Σtax; **no delivery fee**. Cart item rows w/ qty steppers/remove. **Place Order** → OrderConfirmationDialog (review + "requires stockist approval" warning) → `create-platform-order`. Success screen: bill summary (Subtotal, Total Tax, This Order Total, Outstanding Balance) + **integrated UPI payment**: RadioGroup (Pay This Order / Pay Total Outstanding / Custom Amount) → dynamic UpiQrCode + copyable `upi://pay?pa=...&am=...&tn=Order-...` deep link + "Payment requires stockist confirmation before updating your balance." Back to Dashboard / Continue Shopping.
- **MarkPaymentDialog**: RadioGroup Full Outstanding / Custom Amount / Specific Order (Select of unpaid orders). Notes. → `mark-payment-paid` (creates **pending** confirmation). "Pending Approval" notice.

### 3.3 Public Pharmacy Registration (`/pharmacy-registration`)
- Public form (no auth). Sections: **Basic** (Pharmacy Name*, Owner Name*, Drug License Number*, GST Number*), **Contact** (Phone*, WhatsApp Number, Email), **Location** (Address* textarea, PIN Code*, Area, Google Maps Name, Coordinates lat,lng), **Document Uploads** (Drug License required-labeled, GST Certificate, Other; image/PDF → uploaded to `bills` bucket via getPublicUrl). Insert `pharmacy_registration_requests{...urls, status:'pending'}`. Resets form on success.

---


## 4B.10 ERP Public catalogue module

## 10. PAYMENTS, CREDIT & MONEY LOGIC (consolidated)

- **Status vocab**: order `status` draft/confirmed/cancelled; `payment_status` paid/unpaid/partial; `delivery_status` pending/dispatched/out_for_delivery/delivered. Confirmation `status` pending/approved/rejected/on_hold. Order sources: manual, platform, pharmacy_portal, whatsapp.
- **Order numbering**: manual/quick-bill/OCR = `ORD-{Date.now()}`; quick-order (WhatsApp parse) = `ORD-{ts}` w/ `order_source=whatsapp`; platform (public catalogue) = `PLT-{ts}-{rand6}`; process-bill-image = `ORD-{ts}`; AddPharmacy placeholder = `INIT-{ts}`; recall = `RCL-{ts}`.
- **Credit-first + FIFO settlement** appears in FIVE places with the same algorithm & 0.01 tolerance: (1) Pharmacies page custom payment, (2) approve-reject-payment edge fn, (3) SortablePharmacyCard route collection, (4) OrderActionsDropdown partial payment (single-order), (5) mark-fully-paid (bulk). Leftover funds → `credit_balance`.
- **Outstanding balance** always recomputed as `Σ max(0, total_amount - paid_amount)` over unpaid/partial orders (`recalculatePharmacyBalance` duplicated across many files).
- **GST differs by surface**: portal checkout = flat **5% + delivery fee**; public catalogue checkout = **per-item `gst_percentage`, no delivery fee**; stockist OrderCreation = **SGST/CGST split (tax/2 each)**, per-item gst default 5; QuickOrder/QuickBill dialogs use a 5/12 tax toggle (default 12); create-platform-order defaults item gst to 12 if absent.
- **UPI**: QR via `qrcode.react` (level H, size 200, downloadable PNG) + `upi://pay?pa={upi}&pn={name}&am={amount}&tn=Order-{num}&cu=INR` deep links. Payments always require stockist confirmation before balances update. PaymentLinkDialog also lets stockist edit their UPI ID inline (saved to stockist_details) and pick 100/50/25% or slider payment amount, then Send via WhatsApp.

---

## 11. KNOWN STUBS / PLACEHOLDERS / BUGS (code-verified)

- **Patient**: Checkout placement is explicit demo (no write); Add-to-Cart on Search/Compare/Wishlist and "Order from Prescription" unwired; no OCR on prescription upload; PriceComparison Star 4.5 & ~45min hardcoded, Add-to-Cart toast stub; PriceComparison queries columns (`product_name`, `selling_price`) that don't match the products schema; AIAssistant reads response field names that don't match the edge fn output.
- **Pharmacy portal**: PharmacyOrdering price comparison uses `Math.random()` + Add-to-Cart unwired; Inventory Add/Edit buttons unwired.
- **Brand**: Analytics growth 24.5%, Fulfilment 45min & 98.5% hardcoded; Product Edit/Delete + Campaign "View Analytics" unwired; campaign_type hardcoded "discount".
- **MR**: Collections target ₹50,000 hardcoded; Record Collection demo-only (not persisted); Add Pharmacy unwired.
- **Admin**: User active-status hardcoded true + not persisted (only audit-logged); Analytics charts are placeholder divs + trend %s hardcoded; Enhanced Analytics growth 32.5% hardcoded + not linked from dashboard; Notices/Users "View" buttons stubs.
- **Stockist**: EditProductDialog collects HSN Code & Batch Code but the update omits them (not persisted); AddProduct collects batch_code but insert omits it; Analytics "Active Pharmacies" counts ALL pharmacies (not scoped); PharmacyDetail Send Reminder uses hardcoded `pa=yourUPI@bank` placeholder; DateRangeFilter on dashboard is display-only.
- **AI**: chat-assistant declares patient/brand/mr tools but only stockist/pharmacy/admin executors exist; optimize-route uses random distance matrix without Google Maps key; extract-prescription edge fn unused by UI.
- **Settings**: Notification preference switches are cosmetic (not persisted). **Remember me** on Login unused.
- **Orphaned routes/components**: PatientSignup, BrandSignup, Index (no `/` mapping), RoleSelection (deprecated redirect). A duplicate `BottomNav.tsx` (Analytics variant) is unused.

---


## 4B.11 ERP Payments credit consolidated

## 10. PAYMENTS, CREDIT & MONEY LOGIC (consolidated)

- **Status vocab**: order `status` draft/confirmed/cancelled; `payment_status` paid/unpaid/partial; `delivery_status` pending/dispatched/out_for_delivery/delivered. Confirmation `status` pending/approved/rejected/on_hold. Order sources: manual, platform, pharmacy_portal, whatsapp.
- **Order numbering**: manual/quick-bill/OCR = `ORD-{Date.now()}`; quick-order (WhatsApp parse) = `ORD-{ts}` w/ `order_source=whatsapp`; platform (public catalogue) = `PLT-{ts}-{rand6}`; process-bill-image = `ORD-{ts}`; AddPharmacy placeholder = `INIT-{ts}`; recall = `RCL-{ts}`.
- **Credit-first + FIFO settlement** appears in FIVE places with the same algorithm & 0.01 tolerance: (1) Pharmacies page custom payment, (2) approve-reject-payment edge fn, (3) SortablePharmacyCard route collection, (4) OrderActionsDropdown partial payment (single-order), (5) mark-fully-paid (bulk). Leftover funds → `credit_balance`.
- **Outstanding balance** always recomputed as `Σ max(0, total_amount - paid_amount)` over unpaid/partial orders (`recalculatePharmacyBalance` duplicated across many files).
- **GST differs by surface**: portal checkout = flat **5% + delivery fee**; public catalogue checkout = **per-item `gst_percentage`, no delivery fee**; stockist OrderCreation = **SGST/CGST split (tax/2 each)**, per-item gst default 5; QuickOrder/QuickBill dialogs use a 5/12 tax toggle (default 12); create-platform-order defaults item gst to 12 if absent.
- **UPI**: QR via `qrcode.react` (level H, size 200, downloadable PNG) + `upi://pay?pa={upi}&pn={name}&am={amount}&tn=Order-{num}&cu=INR` deep links. Payments always require stockist confirmation before balances update. PaymentLinkDialog also lets stockist edit their UPI ID inline (saved to stockist_details) and pick 100/50/25% or slider payment amount, then Send via WhatsApp.

---


## 7E. HUB data dictionary (extended)

## 15. FULL DATA DICTIONARY (every table in `types.ts`, field-by-field)

Legend: `s`=string, `n`=number, `b`=boolean, `?`=nullable. Writers/readers from actual UI code.

### 15.1 Identity & access
- **profiles** (11): `id, user_id, full_name?, email?, phone?, avatar_url?, tos_accepted_at?, data_download_requested_at?, last_active_at?, created_at, updated_at`. One per auth user (all roles). Written at signup, ToS acceptance (`useToSAcceptance`), 5-min session heartbeat (`updated_at`). Read by TopNav avatar, admin user search/impersonate/targeted notifications.
- **user_roles** (3): `id, user_id, role(app_role enum: admin/stockist/pharmacy/customer/doctor)`. Inserted at registration; read at every login (role-match gate) and by `useAuth`. One user CAN hold multiple roles (RootRedirect picks by priority).
- **login_attempts** (4): `id, email, success:b, attempted_at`. Written by `record_login_attempt` RPC on every login try; read by `check_login_rate_limit` (15-min lockout) and AdminLoginHistory.
- **login_activity** (7): `id, user_id, status, device_info?, ip_address?, location?, created_at`. Read by AdminActivityLog, AdminActiveUsers, and per-role PrivacySecurity pages (last 10 logins). Re-pointed by MergeAccounts.
- **stockist_profiles** (26): business_name, business_type?, pan_number?, phone/whatsapp_number/email?, address/city/state/pin_code?, approval_status?, rejection_reason?, drug_license_url?, gst_certificate_url?, wholesale_license_url?, fssai_license_url?, drug_license_expiry?, bank fields (bank_name, account_number, ifsc_code, upi_id, account_holder_name), user_id, timestamps. `id` is the key used by ALL stockist child data.
- **pharmacy_profiles** (33): pharmacy_name, pharmacy_type?, license_number?, owner_name/owner_designation/owner_contact?, phone/whatsapp_number/email?, address/city/state/pin_code?, approval_status?/rejection_reason?, drug_license_url?/gst_certificate_url?/pharmacy_certificate_url?/drug_license_expiry?, bank fields + upi_id?, B2C commerce config: `delivery_fee?`, `free_delivery_above?`, `min_order_amount?` AND duplicate `minimum_order_amount?` (both exist), `operating_hours:Json?`, user_id, timestamps.
- **customer_profiles** (18): full_name, phone/email?, gender?, date_of_birth?, address/city/state/pin_code?, health fields `blood_group?, allergies?, chronic_conditions?, emergency_contact?`, avatar_url?, user_id, timestamps. No approval gating.
- **doctor_profiles** (26): full_name, specialization, qualification?, registration_number?, experience_years?, bio?, consultation_fee_audio/video/clinic?, `is_available?` (booking-list filter), approval_status?/rejection_reason?, medical_certificate_url?, id_proof_url?, `id_proof_status?` (approval_status enum — per-document status used by AdminDoctorDetail), avatar_url?, contact/address fields, user_id, timestamps.

### 15.2 Catalog & inventory
- **products** (33, stockist catalog): name, brand?, manufacturer?, category?, composition?, description?, pricing `mrp?, sale_price?, price?` (price kept = sale_price), `purchase_rate?`, stock `stock_quantity?, reserved_quantity?` (reserved never written by UI), `in_stock?`, `min_stock_level?, min_order_quantity?, moq?` (moq unused duplicate), `batch_number?, expiry_date?` (headline, mirrors latest batch), regulatory `hsn_code?, gst_rate?, drug_schedule?, drug_type?, fssai_license?, requires_prescription?, is_narcotic?`, `pack_type?, pack_size?, unit?`, image_url?, stockist_id. Created via ProductForm / BulkUploadCatalogue / BulkUploadPurchaseBill (upsert-by-name) / SharedProductDetail Clone. Deleted via detail-page confirm. Stock mutated by decrement_stock/deduct_product_stock/restore_product_stock RPCs, BatchManager re-aggregation, returns restock.
- **product_batches** (9): product_id, batch_number?, mrp?, sale_price?, purchase_rate?, stock_quantity?, expiry_date?, created_at. Written only by BatchManager and return-FIFO-restock; zeroed by ExpiryManagement Dispose and moved by StockTransfer.
- **product_media / pharmacy_inventory_media** (6 each): `image_url, is_primary, sort_order` + parent id. Delete-all-then-reinsert on gallery save.
- **product_categories** (4) / **pharmacy_categories** (3) / **drug_schedules** (5: schedule_name, description?, restrictions?) / **doctor_specializations** (3): admin CRUD config lists. NOTE: product forms actually use the hardcoded `PRODUCT_CATEGORIES`/`DRUG_SCHEDULES` constants, not these tables — the admin CRUD tables are not consumed by the forms.
- **pharmacy_inventory** (32): mirrors products schema (product_name instead of name, quantity instead of stock_quantity) + `is_visible_to_customers?`, `source_product_id?`, `source_stockist_id?` (set by bulk-import/auto-populate lineage), unit?. Rows created by: PharmacyInventoryForm, PharmacyBulkImport (qty 0, hidden), stockist-side `autoPopulateInventory` on B2B delivery (visible, qty added). Deducted by `deduct_pharmacy_inventory` on B2C confirm; restored by `restore_pharmacy_inventory` / cancel-restock.

### 15.3 B2B commerce
- **orders** (22): order_number, stockist_id, pharmacy_id, status?, payment_status, total_amount?, items_count, order_source (manual/whatsapp/platform/quick_order/split), notes?, `parent_order_id?` (split lineage), `partial_delivery_items:Json?`, `applied_credit_note_id?`, `credit_discount?`, delivery: `assigned_staff_id?`, `delivered_at?`, `delivery_proof_url?`, collection: `delivery_collected_amount?`, `delivery_payment_method?`, `delivery_payment_status?` (pending_approval/approved/rejected), timestamps.
- **order_items** (7): order_id, product_id, quantity, price?, `requested_batch?` (pharmacy can request a batch), created_at.
- **order_returns** (10): order_id, stockist_id, pharmacy_id, product_id, quantity, reason?, refund_amount?, status (pending/completed/rejected), created_at. Pharmacy requests → stockist approves/rejects; stockist can also create directly as completed.
- **order_status_history** (8): order_id, order_type, old_status?, new_status, changed_by?, notes?. Exists in schema; UI reads/writes it only sporadically (status transitions largely don't append here).
- **delivery_staff / pharmacy_delivery_staff** (12 each): name, phone, username, password_hash, is_active, aadhar_number?, age?, police_verification_id?, photo_url?, owner id. Auth via `verify_staff_credentials` RPC only.
- **delivery_settings** (8): stockist_id, pin_code, delivery_charge, delivery_days:s[], estimated_hours, free_delivery_above. Per-PIN config surfaced in QuickOrder "next delivery day".
- **delivery_route_templates** (6): stockist_id, name, pharmacy_ids:s[], notes?. Saved multi-stop selections.
- **stockist_holidays** (7): start_date, end_date, reason?, allow_preorder:b. Blocks/labels pharmacy ordering.
- **serviceable_areas** (4): stockist_id + pin_code (stockist coverage). **admin_serviceable_areas** (6): platform-level PIN whitelist (`is_active`) gating stockist registration. **pharmacy_serviceable_areas** (7): pharmacy_id, pin_code, delivery_charge?, estimated_hours?, free_delivery_above? — drives customer pharmacy discovery.

### 15.4 B2C commerce
- **customer_orders** (25): order_number, customer_id, pharmacy_id, status?, order_type? (delivery/pickup/prescription), payment_method?, payment_status?, total_amount?, delivery_fee?, gst_amount?, discount_amount? (schema-only, no UI writer), delivery_address?, delivery_pin_code?, prescription_id?, prescription_url?, prescription_verified?, upi_proof_url?, refund_status?, partial_items:Json?, assigned_staff_id?, delivered_at?, notes?, timestamps.
- **customer_order_items** (10): order_id, product_name, product_id?, quantity?, price?, requires_prescription?, `is_substitute?` + `original_product_name?` (substitution audit).
- **customer_returns** (8) + **customer_return_items** (5): pending→approved/rejected; refund_amount computed at approval; **no restock ever**.
- **customer_reviews** (10): customer_id, rating, comment?, pharmacy_id?/doctor_id?/order_id?, `reply?`+`reply_at?` (schema supports pharmacy replies; no UI writes replies). This is THE table read for all rating averages.
- **reviews** (7): customer_id, rating, comment?, target_type, target_id — written by CustomerReviewOrder, read nowhere (orphan write path).
- **customer_wishlist** (9): denormalized snapshot (product_name, price?, image_url?, pharmacy_name?, inventory_id?, pharmacy_id?).
- **customer_addresses** (9): label, address, city?/state?/pin_code?, is_default.

### 15.5 Finance
- **payments** (12): stockist_id, pharmacy_id, amount, payment_method, status (confirmed/pending), `collected_by?` (manual/delivery_staff/pharmacy), staff_id?, reference_id?, payment_proof_url?, notes?. Created by CollectPaymentDialog (confirmed), StockistRecordPayment (confirmed), staff-collection approval (confirmed), PharmacyPayments record-to-stockist (pending).
- **payment_reminders** (7): stockist_id, pharmacy_id, total_amount, sent_via ("whatsapp"), order_ids:s[]?.
- **bills** (12): bill_number, stockist_id, pharmacy_id, subtotal, total_amount, discount_type?/discount_value?, gst_amount? (never populated), due_date?, status ("confirmed" from BillPreviewDialog, "final" from BulkBill; "draft" never written). **bill_orders** (3): bill_id↔order_id join.
- **credit_notes** (9): credit_note_number ("CN-"+base36), stockist_id, pharmacy_id, order_id, return_id, amount, status (active/used). Created on returns; consumed in StockistCreateOrder.
- **subscription_plans** (9): name, price_monthly, price_yearly, target_role, features:Json?, is_active. Admin CRUD only — **no purchase/enforcement anywhere**.

### 15.6 Healthcare
- **consultations** (16): doctor_id, patient_id, pharmacy_id?, consultation_type (audio/video/clinic_visit), scheduled_at, fee, status? (booked/in_progress/completed/cancelled), payment_status?, meeting_link?, notes?, duration_minutes?, follow_up_date?/follow_up_notes?.
- **prescriptions** (8): doctor_id, patient_id, consultation_id?, pharmacy_id?, notes?, status?. **prescription_items** (9): product_name, product_id?, dosage?, duration?, quantity?, notes?.
- **prescription_templates** (5): doctor_id, template_name, items:Json.
- **doctor_availability** (7): day_of_week, start_time, end_time, is_active? — written by DoctorAvailability, read by nothing.
- **doctor_pharmacy_partnerships** (6): doctor_id, pharmacy_id, default_commission_pct (5 default), status (pending/active/rejected/inactive).
- **doctor_commission_rules** (7): partnership_id, rule_type (product/brand/category), rule_value, commission_pct?, flat_amount?.
- **doctor_commission_earnings** (10): doctor_id, pharmacy_id, partnership_id, customer_order_id, item_name, item_amount, commission_amount, status (pending→paid via pharmacy "Mark Paid").
- **pharmacy_consultation_settings** (5): pharmacy_id, doctor_id, is_active? — makes "Consult" appear on customer pharmacy pages.

### 15.7 Governance & comms
- **notifications** (7): user_id, title, message?, type?, read?. The universal event bus (~20 type values, see §18.3). Realtime INSERT subscription per user.
- **messages** (6): support-chat unread counter source (sender/receiver/content/read). **peer_messages** (6): same shape, B2B/peer chat. **conversations** (5): user_id, user_role — one support thread per user. **chat_messages** (7): conversation_id, sender_type (user/admin/bot), content, read?.
- **quick_questions** (5): question, answer, category? — canned bot answers (admin CRUD in AdminSettings).
- **admin_audit_log** (7): admin_user_id, action, target_type?, target_id?, details:Json?. Written by impersonate_view, force_password_reset, merge_accounts, customer-order overrides.
- **counterfeit_alerts** (9): product_name, alert_type (counterfeit/banned/spurious/nsq/recalled), batch_number?, manufacturer?, description?, is_active, created_by.
- **platform_settings** (4): key/value store. Keys observed in code: `logo_url`, `maintenance_mode`, `maintenance_message`, `platform_commission_pct`, `gst_rate_medicines` (+ per-category gst keys), ToS content, payment-method flags.
- **platform_banners** (8): title, message?, banner_type, target_roles:s[], is_active, created_by. Admin CRUD; **no client surface renders banners to end users**.

### 15.8 RPC signatures (exact, from types.ts)
`admin_override_customer_order_status(p_new_status, p_order_id)`, `admin_override_order_status(p_new_status, p_order_id)`, `admin_send_targeted_notification(p_message, p_title, p_user_id)`, `check_login_rate_limit(p_email)→boolean`, `decrement_stock(p_product_id, p_quantity)`, `deduct_pharmacy_inventory(p_inventory_id, p_quantity)`, `deduct_product_stock(p_product_id, p_quantity)`, `get_flowboard_schema()→Json`, `has_role(_role, _user_id)→boolean`, `hash_password(p_password)→string`, `record_login_attempt(p_email, p_success)`, `restore_pharmacy_inventory(p_inventory_id, p_quantity)`, `restore_product_stock(p_product_id, p_quantity)`, `update_circle_outstanding(p_circle_id, p_delta)`, `verify_staff_credentials(p_password, p_staff_type, p_username)→Json`.

---

## 4B.12 HUB Pharmacy module (dual mode)

## 4. PHARMACY MODULE (dual purchase/sale mode)

Mode via `usePharmacyMode` (localStorage). Purchase nav: Dashboard/Orders/Stockists/Inventory/More. Sale nav: Dashboard/customer-orders(Orders)/customer-list(Customers)/Inventory/More. Toggle in TopNav avatar popover. All keyed on `usePharmacyProfile().id`. No realtime.

### 4.1 Dashboard (`PharmacyDashboard.tsx`)
One `["pharmacyDashStats"]` query (8 parallel; `staleTime 15000`). Metrics: activeB2BOrders(`status∉{delivered,cancelled}`), **totalPurchase=Σ orders.total_amount**, pendingPayments(`payment_status≠paid`), connectedStockists(circle count), inventoryItems(count), activeCustOrders, todayCustOrders(`isToday`), **custRevenue=Σ delivered customer_orders**, lowStockCount(`min_stock_level && qty≤min`), expiringCount(`expiry≤today+30d & qty>0`), **avgOrderValue=round(custRevenue/deliveredCount)**, pendingCustPayments(`payment_status≠paid & status≠cancelled`), totalCustomers(unique customer_id). Renders **PurchaseDashboard** (alert cards linking to `?filter=low_stock`/expiry; 5 KPIs; 8 quick actions; `<ReorderSuggestions>`; recent B2B orders) vs **SaleDashboard** (7 KPIs; 8 quick actions; recent customer orders).

### 4.2 Inventory (purchase side)
- **PharmacyInventory** (`inventory`): `SharedProductCard` role pharmacy; inventory value = `Σ quantity × (purchase_rate||price)`; `?filter=low_stock|expiring` (30-day window); **Bulk Price Update** (batched 10, `window.confirm`).
- **PharmacyInventoryForm** (`inventory/add`, `inventory/:id/edit`): full schema fields product_name*, brand(searchable), manufacturer, category(select), description, mrp, sale_price, price(forced=sale_price), quantity, min_stock_level, batch_number, expiry_date, hsn_code, gst_rate(select), drug_schedule(select), drug_type(select), composition, pack_type(select), pack_size, fssai_license, requires_prescription(switch), is_narcotic(checkbox), is_visible_to_customers(switch, default true). **AI Auto-Fill** (`autofill-product-details`, fills empty only). **Counterfeit warning** banner if name matches active alert. Gallery → `pharmacy_inventory_media` (delete-all-then-insert). `price = sale_price ?? price`.
- **PharmacyInventoryDetail** wraps `SharedProductDetail role="pharmacy"`.
- **PharmacyBulkImport** (`bulk-import`): select circle stockist (status active) → load their in-stock `products` → checkbox select → insert into `pharmacy_inventory` (`quantity:0`, `is_visible_to_customers:false`, chunks of 50). **This is the primary manual inventory-population path** (delivery auto-populate is stockist-side).
- **PharmacyStockAudit** (`stock-audit`): `pharmacy_stock_audits` + direct qty updates.
- **PharmacyExpiryManagement** (`expiry-management`): Expired/≤30/31–90/Safe buckets; Dispose (qty 0 + hide); Send Expiry Report → notifies circle stockists.
- **PharmacyInventoryAuditLog** (`inventory-audit`): snapshot only; reads a nonexistent `selling_price`.

### 4.3 B2B purchasing
- Order status flow `pending→packed→dispatched→out_for_delivery→delivered` (+cancelled). Order number `PH<last8 ts>`.
- **PharmacyBrowse**/**PharmacyStockists**/**PharmacyFindStockist**: approved stockists; `addToCircle` seeds `stockist_pharmacy_circle`.
- **PharmacyStockistDetail** (`stockists/:id`): cart-based ordering. Reads circle (outstanding/credit_limit/is_blocked) + active `stockist_holidays`. `orderingBlocked = is_blocked || (activeHoliday && !allow_preorder)`. **Credit-limit enforcement**: blocks if `credit_limit>0 && outstanding+cartTotal>credit_limit`; warns >80%. Place → insert `orders` (`order_source:"platform"`, pending) + items → `update_circle_outstanding(+cartTotal)` → notify stockist. **No stock deduction on B2B purchase.** Blocked/Holiday banners; pre-order label when holiday+allow_preorder.
- **PharmacyQuickOrder** (`orders/quick`): `parse-order-text` → **findBestStockists**: serviceable_areas by pharmacy pin → approved stockists → substring-match products, sum matched, sort cheapest → "Best Price" badge on #0; shows next delivery day from `delivery_settings.delivery_days`. Place → `order_source:"quick_order"` + `update_circle_outstanding(+total)` + notify. **No credit check here.**
- **PharmacyOrders** (`orders`): mode-gated (purchase→`orders`, sale→`customer_orders`).
- **PharmacyOrderDetail** (`orders/:id`): Duplicate, **Verify Received Quantities** (notifies discrepancies, no stock adjust), **Request Return** → `order_returns`, invoice PDF.
- **PharmacyLedger** (`ledger/:stockistId`): orders − / payments + / credit_notes +.
- **PharmacyRecurringOrders** (`recurring-orders`): `recurring_orders` (via `as any`) CRUD — stockist/frequency(weekly/biweekly/monthly)/next_order_date/items(text→JSON `{name,qty}`), toggle active, delete. **No scheduler/execution engine — rows are inert.**
- **PharmacyReorderHistory**, **PharmacyQuickOrderHistory**.

### 4.4 B2C fulfillment (sale side)
Customer order flow `pending→confirmed→preparing→ready_for_pickup→out_for_delivery→delivered` (+cancelled).

**PharmacyCustomerOrderDetail** (`customer-orders/:id`) — core B2C screen:
- **updateStatus**: on **confirmed** → `rpc("deduct_pharmacy_inventory",{p_inventory_id:item.product_id, p_quantity})` per item. On **cancelled** (if was confirmed/preparing/ready_for_pickup) → restock by direct `pharmacy_inventory` update matched by `product_name`. On **delivered** → `calculateCommissions(orderId, pharmacyId)` + set `delivered_at`. Every transition notifies customer.
- **Prescription gate**: "Mark as confirmed" disabled while `prescription_url` exists and `prescription_verified` false. Verify/Reject buttons set `prescription_verified` + notify.
- **UPI verification**: when `payment_status="claimed"` or method upi (and ≠paid) → shows proof link + Verify(→paid, notify) / Reject(→rejected, notify).
- **Item pricing** (editable when pending/confirmed): Add item (name/qty/price, recompute total), Remove (recompute), **Set Total** (manual override), **Auto-Price** (match unpriced items to `pharmacy_inventory` by name, set price+product_id, recompute), **Substitute** (`is_substitute`, `original_product_name`, recompute, notify), **Check Stock / Partial fulfillment** (`partial_items` JSON of requested vs available, notify — does not split).
- **Assign delivery staff** (delivery orders, `pharmacy_delivery_staff` active).
- **Mark Paid** (delivered & unpaid).
- On delivered + items → renders **B2CBillGenerator**.

**B2CBillGenerator**: "TAX INVOICE" dialog; line items + total (no tax breakdown); PDF via dynamic html2canvas+jsPDF (`Invoice-<order_number>.pdf`); **QR = `${origin}/verify-bill/customer-${order.id}`**; Share via `navigator.share`.

- **PharmacyB2CBillHistory**, **PharmacyCustomerList/CustomerDetail**.
- **PharmacyCustomerReturns** (`customer-returns`): tabs Pending/Processed on `customer_returns`. Approve & Refund: sets status approved + `refund_amount = Σ items price×qty` + notify. Reject + notify. **No inventory restock.**
- **PharmacyCustomerOrders** (`customer-orders`).

### 4.5 Doctor partnerships / commissions
- **PharmacyDoctors** (`doctors`): `pharmacy_consultation_settings`.
- **PharmacyDoctorPartnershipDetail** (`doctors/:id`): `doctor_pharmacy_partnerships` Accept/Reject/Deactivate; per-earning Mark Paid.
- **PharmacyCommissions** (`commissions`, read-only), **PharmacyConsultations** (read-only).
- Commission math in **`calculateCommissions`** (see §9).

### 4.6 Ops & settings
- **PharmacyPayments** (`payments`): tabs Payments/Credit Notes. Outstanding summary. **Record Payment to stockist** dialog: stockist(select w/ outstanding + bank/UPI preview), amount*, method(upi/bank_transfer/cash/cheque), reference_id, notes, **UPI proof upload** (method=upi) → `documents` at `upi-proofs/{pharmacyId}/…` → `createSignedUrl(30d)` → URL appended into `notes`. Inserts `payments` (`status:"pending"`, `collected_by:"pharmacy"`); `update_circle_outstanding(−amount)` (atomic); notify stockist.
- **PharmacyReports** (`reports`): Purchase + Inventory query real data; **Schedule H/H1/NDPS produce a single placeholder row** "No matching items found in inventory".
- **PharmacyAnalytics** (real BarChart, B2B only), **PharmacyExportData**, **PharmacyServiceableAreas**, **PharmacyDeliveryRoutes** (Google Maps URL), **PharmacyStaffManagement/StaffForm** (`pharmacy_delivery_staff`, `hash_password`), **PharmacyProfileSettings/PharmacyBusinessDetails** (3 regulatory docs → `documents` signed 1 day; saving forces `approval_status:"pending"` + notifies admins), Notifications/Settings/HelpCenter/PrivacySecurity.

---


## 4B.13 HUB Stockist module


### 3.2 Products
**StockistProducts** (`products`): grid of `SharedProductCard` (role stockist); batch-loads `product_batches` for all product ids → `batchesByProduct`. Filters (client): search(name/brand/composition), brand(`PHARMA_BRANDS`), category(`PRODUCT_CATEGORIES`), expiryFrom/To (string compare), sort(newest/name/price/expiry), grid cols 2/3 toggle (via `ProductFilters`). Buttons: Add, Bulk Catalogue, Purchase Bill, **Bulk Price**. Bulk Price dialog: field(sale_price|mrp), direction(increase|decrease), type(percentage|flat), value; `window.confirm`; processes in batches of 10; `newPrice=max(0, round(...*100)/100)`; when field=sale_price also sets `price`.

**StockistAddProduct/EditProduct** render `ProductForm`. **ProductForm** fields (dialog): image (→`product-images` bucket public URL), name*, brand*(searchable `PHARMA_BRANDS` + custom), manufacturer, category*(select), mrp*, sale_price*, purchase_rate, stock_quantity, min_stock_level, min_order_quantity(default 1), batch_number, expiry_date*, hsn_code, gst_rate*(select), drug_schedule*(select), drug_type(select), composition*, pack_type(select), pack_size, fssai_license, requires_prescription(checkbox), is_narcotic(checkbox). On save: `price = sale_price ?? price`; `in_stock = stock_quantity>0`. (Only `name` truly enforced in code; other `*` are visual.) **AI Autofill** via `useAutoFillProduct` fills only empty fields. Edit-with-price-change → inserts `notifications type:"price_change"` to circle pharmacies but does NOT write `price_history`.

**StockistProductDetail** wraps `SharedProductDetail role="stockist"` (embeds BatchManager, sales chart, batch pricing table).

**StockistPriceHistory** (`products/:id/price-history`): reads `price_history` (via `as any`) — **DEAD surface, no writer**, always "No price changes recorded". Shows Sale/MRP old→new with trend icon when rows exist.

### 3.3 Batches / Expiry / Transfer
- **StockistBatchManagement** / **StockistBatchExpiryCalendar** (month calendar dot per expiry).
- **StockistExpiryManagement**: pulls ALL `product_batches⋈products`, filters to this stockist. Buckets via date-fns: Expired (`isPast`), 30 days (`≤30 & !past`), 90 days (`31–90`), Safe (`>90 & stock>0`). **Dispose** (`confirm`) → sets `product_batches.stock_quantity=0` only (does NOT re-aggregate parent product stock).
- **StockistStockTransfer**: pick product (stock>0), from-batch, to-batch (must differ), qty (≤ source stock). Updates source `stock_quantity−qty`, dest `+qty`. **No product re-aggregate, no log.** Needs ≥2 batches.

### 3.4 Orders
**StockistCreateOrder** (`orders/create`, optional `?pharmacy=`): select circle pharmacy; paste order text → `parse-order-text` (passes `{id,name}` catalog) → items matched to products; manual add/qty steppers; product match select. `totalAmount = Σ price×qty`. **Credit-note** select (active notes for pharmacy) → `creditDiscount`, `finalAmount = max(0, total−creditDiscount)`. **Credit limit check**: if `credit_limit>0 && outstanding+total>credit_limit` → warning dialog showing excess = `max(0,(outstanding+total)−limit)`, "Proceed Anyway". On create: insert `orders` (`order_number="ORD-"+base36`, status `"pending"`, `order_source = orderText? "whatsapp":"manual"`, `items_count`, `applied_credit_note_id`, `credit_discount`), insert `order_items`, **`rpc("decrement_stock",{p_product_id,p_quantity})` per item at creation**, mark credit note `used`, `rpc("update_circle_outstanding",{p_circle_id,p_delta:finalAmount})`, notify pharmacy (`type:"order"`).

**StockistOrders** (`orders`): `usePaginatedQuery` (20) all orders. Tabs All/Pending/Active/Done via `getStatusGroup` (pending; active=packed/dispatched/out_for_delivery/processing; done=delivered/completed). Search name/order#. **Tab counts are per-page** (computed over fetched page only). Create button.

**StockistOrderDetail** (`orders/:id`) — the richest screen:
- Status flow `pending→packed→dispatched→out_for_delivery→delivered`. `canModify` = pending|packed. `canReturn`=delivered. `canAssignStaff`=packed/dispatched/out_for_delivery. `canPartialDeliver`=dispatched/out_for_delivery. `canSplit`=pending.
- **updateStatus**: on **packed** → `rpc("deduct_product_stock")` per item (⚠ SECOND deduction after create-time `decrement_stock` → double-deduct risk). On **delivered** → `autoPopulateInventory(pharmacy_id)` (upsert each ordered product into `pharmacy_inventory` by name, add qty if exists else full insert with `is_visible_to_customers:true`) + set `delivered_at`. Every transition notifies pharmacy.
- **Cancel** (`confirm`): sets cancelled, `update_circle_outstanding(−total)`; if was packed/dispatched → `restore_product_stock` per item.
- **Edit items** (pending/packed): inline qty; save deletes zero-qty rows, recomputes `total_amount`+`items_count`, `update_circle_outstanding(diff)`. Blocks all-zero ("Cancel instead").
- **Assign delivery staff**: active staff sorted least-loaded-first (counts open assignments); "Suggested" badge when top has 0.
- **Partial Delivery** (`#30`): qty per item → appended to `partial_delivery_items` JSON + `autoPopulateSingleItem` (adds to existing pharmacy inventory only). Notifies via card.
- **Split Order** (`#31`, pending, >1 item): move qty (max item.qty−1) to a new child order (`order_number = <orig>-S<base36>`, `order_source="split"`, `parent_order_id`, status pending); reduces/deletes original items; recomputes totals.
- **Return** (delivered): per-item qty + reason → insert `order_returns` (`status:"completed"`, refund_amount) + if paid `credit_balance +=` else `update_circle_outstanding(−refund)`; creates `credit_notes` (`CN-`+base36, active).
- **Duplicate**: clones into new order (`SO`+last8 ts, `order_source:"platform"`, pending).
- **Bill**: existing bill → View (BillPreviewDialog readOnly); else Create Bill (BillPreviewDialog).
- **Print Packing Slip**: `window.open` HTML table + print (packed/dispatched/out_for_delivery).
- **Record Payment** (payment_status≠paid): `CollectPaymentDialog`.
- Shows delivery_proof_url image, credit-note applied card, partial delivery history, requested_batch per item.

### 3.5 Pharmacies (circle)
**StockistPharmacies**: `stockist_pharmacy_circle ⋈ pharmacy_profiles`. Filter chips All/Outstanding(>0)/Credit(credit_balance>0 & outstanding=0)/No Dues(outstanding=0). Per card: Outstanding, **Credit(shows credit_limit)**, **Net Due = outstanding − credit_balance** (shows "₹X CR" when negative). Pending-order summary. "Collect Payment" inline when outstanding>0. Dropdown: View/Edit(`EditPharmacyDialog`)/Record Order(→create?pharmacy=)/Generate Bill(`QuickBillDialog`)/Remove from Circle (`confirm`, delete row).

**StockistPharmacyDetail** (`pharmacies/:id`): header with call/copy/WhatsApp/chat; **credit usage Progress** = `outstanding/credit_limit×100`; Outstanding/Credit Limit/Available(=limit−outstanding) grid. Collect Payment button (disabled when outstanding≤0). Tabs: Orders (expandable to items), Payments, Bills (view via BillPreviewDialog readOnly), **Ledger** (merges orders debit + payments credit + `order_returns` refund credit, sorted asc, running balance; footer Final Balance). Details dialog shows business info, contact, address, 3 documents with status badges + View, and Danger Zone remove-from-circle. `EditPharmacyDialog`/`QuickBillDialog`/`CollectPaymentDialog` wired.

**StockistPharmacyLedger** (`pharmacies/:id/ledger`) — separate route; per FEATURES omits returns from running balance.

**EditPharmacyDialog**: edits `credit_limit`, `notes`, `is_blocked` (toggle). On block change + pharmacy.user_id → notifies pharmacy (`type:"circle_status"`, "Account Blocked/Unblocked"). Non-atomic `.update()`.

### 3.6 Payments / Credit Notes / Returns
**CollectPaymentDialog**: methods cash/upi/bank_transfer/cheque. Loads unpaid/partial orders oldest-first. **FIFO auto-allocation** by entered amount OR **manual selection** (click orders → sets amount to selected sum, marks selected full). "Full (₹total)" button. On record: insert `payments` (`status:"confirmed"`, method, reference_id), mark allocated orders paid/partial, `outstanding = max(0, outstanding−amt)` via **non-atomic `.update()`**.

**StockistRecordPayment** (`record-payment`): manual payment; fields pharmacy(select w/ outstanding), amount*, method(cash/upi/bank_transfer/cheque), reference_id, notes. Inserts `payments` (`collected_by:"manual"`, confirmed); `update_circle_outstanding(−amt)` (atomic); **#51** if resulting outstanding ≤0 → marks all this pharmacy's `unpaid` orders `paid`; notifies pharmacy.

**StockistPayments** (`payments`): summary Collected(month)/Outstanding/Approvals. Bank details card (edit→/business). Tabs: Payments (list + Receipt PDF via `generateReceiptPdf` for confirmed), Bills, **Approvals** (delivery-staff collections `delivery_payment_status="pending_approval"`). **Approve**: insert `payments` (`collected_by:"delivery_staff"`, staff_id, confirmed), set order `delivery_payment_status="approved"`+`payment_status="paid"`, `update_circle_outstanding(−amount)`. **Reject**: sets `delivery_payment_status="rejected"`, `delivery_collected_amount=0`. **WhatsApp Reminder** dialog: pick pharmacy w/ outstanding → inserts `payment_reminders` (`sent_via:"whatsapp"`) + notification (`type:"payment_reminder"`) + opens `wa.me/91<phone>?text=` with UPI/bank details.

**StockistReturns** (`returns`): tabs **Requests** (pending `order_returns` from pharmacies), **Process** (delivered orders → return dialog), **History**, **Credits** (`credit_notes`).
- **Approve request**: set completed; restore product `stock_quantity += qty` (`in_stock:true`); if order paid → `credit_balance +=` else `outstanding −= refund` (both non-atomic); create `credit_notes` active; notify pharmacy.
- **Reject**: set rejected + notify.
- **Process return** (from delivered order): per-item qty + reason → insert `order_returns` completed; restore product stock **and add returned qty to earliest-expiry batch (FIFO restock)**; if paid credit_balance+= else outstanding−=; create credit note per return; notify.

**StockistCreditNotes** (`credit-notes`): list/filter credit notes.

### 3.7 Bulk / Bill / Reports / Delivery / Staff
- **BulkUploadCatalogue**: client XLSX/CSV parse (no AI); flexible header mapping; flexible expiry parse (MM/YY, MM/YYYY, DD/MM/YYYY, YYYY-MM-DD → default day 28); preview + inline edit; validation (name required, numeric mrp/sale/stock); bulk `insert` into `products` (`price=sale_price`, `in_stock=stock>0`). Template download. **No batches created.**
- **BulkUploadPurchaseBill**: file → `documents` at `bills/{stockistId}/…` → base64 → `parse-purchase-bill` (vision) → preview/edit → **upsert by exact name** (update if exists else insert). Sets sale_price+price. **Does NOT set purchase_rate or create batches.**
- **StockistBulkBill** (`bulk-bill`): unbilled delivered orders (excludes those in `bill_orders`), select → group by pharmacy → one `bills` per pharmacy (`BILL-<ts>-<n>`, `status:"final"`, subtotal=total_amount, no GST) + `bill_orders` links + notify pharmacy (`type:"bill"`).
- **BillPreviewDialog**: renders "TAX INVOICE" (stockist header, Bill To, orders table, Subtotal/Discount(%/flat)/Grand Total — **no CGST/SGST**), payment/bank block, **QR to hardcoded `https://digi-swasthya-hub.lovable.app/verify-bill/{savedBillId|preview}`**. Confirm → insert `bills` (`status:"confirmed"`) + `bill_orders` + `outstanding += total` (non-atomic). Print/PDF(html2canvas→jsPDF `<BILL>.pdf`)/WhatsApp(share file or `wa.me` text). Payment status badge derived from linked orders (all paid→Paid, else On Credit).
- **StockistManufacturerReturns** (`manufacturer-returns`): `manufacturer_returns` (via `as any`). Add: product/qty/reason. Status flow pending→shipped→credited (Mark Credited uses `window.prompt("Credit amount")`). Statuses pending/shipped/received/credited/rejected.
- **StockistReports** (`reports`): 13 report defs (H1 monthly/annual, Schedule H, Schedule H1, HNX drugs/annual, NDPS, Narcotic, Tramadol, GST Sales, My Item, Restricted Items, TB). Month/Year/Type filters. Client-side XLSX. Filters: H*→drug_schedule startsWith "H"; is_narcotic for HNX/NDPS/narcotic; tramadol name/composition; TB keyword list (isoniazid/rifampicin/pyrazinamide/ethambutol/streptomycin). **GST report reads `bills.gst_amount`** — nothing populates it, so GST column is 0.
- **StockistExportData** (`export`): format CSV/Excel/**PDF (stub — PDF still emits `.xlsx`)**; range today/week/month/all; data types orders/payments/products/pharmacies → multi-sheet XLSX.
- **StockistExportCatalogue** (`export-catalogue`): products → XLSX.
- **StockistPurchaseBillHistory** (`bill-history`): view `bills`.
- **StockistStaffManagement/StockistStaffForm**: `delivery_staff`. Form fields name*, phone*, aadhar_number, age, police_verification_id, username*, password* (new only). **Password via `rpc("hash_password",{p_password})` with plaintext fallback** (`hashData || form.password`) → `password_hash`.
- **StockistServiceableAreas** (`serviceable-areas`): `serviceable_areas` PINs + per-PIN `delivery_settings`.
- **StockistDeliveryRoutes** (`delivery-routes`): multi-select → Google Maps directions URL (no optimization); templates in `delivery_route_templates`.
- **StockistHolidays** (`holidays`): `stockist_holidays` (start/end date, reason, `allow_preorder`); notifies circle.
- **StockistAnalytics** (`analytics`): real recharts; Stock Value by category = `Σ stock_quantity × purchase_rate`; collection rate.
- **StockistProfileSettings/StockistBusinessDetails**: bank/UPI/PAN (used by bills & reminders); business save triggers re-verification.
- Boilerplate: StockistMore(MenuPage), StockistNotifications, StockistSettings, StockistHelpCenter(chat-bot), StockistPrivacySecurity, StockistFindPharmacy(addToCircle seeds circle 0/0/0).

---


## 4B.14 MR workflows (exact mutations)

## 17. END-TO-END WORKFLOWS (exact data mutations, step by step)

### 17.1 Signup → role assignment (three cooperating mechanisms)
1. User submits `Auth.tsx` signup → `auth.signUp` with metadata `{username, name, phone, business_name, business_type, upi_id, role, admin_password?}`.
2. **DB trigger** `handle_new_user` fires synchronously inside the auth insert: validates admin password (raises → whole signup fails for bad admin attempts), inserts profiles (upsert) + user_roles (default 'pharmacy' when metadata missing), swallows any other error.
3. **Client** then uploads the license file to `licenses/{uid}/{ts}_{role}_document.{ext}` and patches `profiles {verification_document_url: path, email}`.
4. **Client** calls `assign-role` with the session token — normally a no-op for the role (trigger already inserted one; the function's `.single()` existing-role check finds it) but its profile **upsert overwrites** profile fields with metadata again and force-sets `is_catalogue_live: true, is_verified: false`.
5. If email confirmation is enabled, step 3–4 silently skip (no session token); the trigger's inserts stand. A user who somehow has no role row gets routed by DashboardRouter/useRoleGuard to `/onboarding`, where `OnboardingSelectRole` calls `assign-role` with a generated username — the second path into the same function.
6. Toast → `/dashboard` → DashboardRouter dispatches on the role.
Verification afterwards: user appears in AdminDashboard's "Pending Verifications" KPI (is_verified=false + document present); admin flips is_verified in UserManagement. Verification has minimal downstream effect: only the Featured Sellers query, the "Verified Only" marketplace pill, Profile's badge and the dead canGoLive flag consume it — an unverified seller can sell normally.

### 17.2 Seller catalogue build-up (4 entry paths converging on `products`)
- **Manual** (ProductForm): AI Auto-fill (public autocomplete fn) pre-populates; MRP→margin calculator derives sale_rate; image → public bucket; insert with seller_type stockist/distributor (MR→'stockist', §2.4). DB trigger #2 enforces MR brand.
- **OCR** (OCRUploadModal → ocr-product-label): photo + 4 manual numbers → Gemini extracts → fuzzy match own catalogue → stock-merge update (stock += input, rates overwritten) or AI-enriched create. Modal `onSuccess` invalidates `products`/`my-products`/`all-products`.
- **Bulk** (BulkUploadModal): CSV via PapaParse (`header: true, skipEmptyLines`) or XLSX via SheetJS `sheet_to_json`; per-row validation (name present, sale_rate>0, stock_quantity≥0); sequential single-row inserts with progress bar `(i+1)/total`; category normalised `toLowerCase().replace(/\s+/g,'_')` cast `as any` (an unknown label produces an invalid enum → row error collected, up to 10 shown); template download generates a 2-row sample workbook.
- **Visibility controls**: per-product `is_available` toggle (MyProducts) hides from pharmacy browse pages; profile-level `is_catalogue_live` switch hides *all* products at RLS level (§14 #20) while keeping the seller card visible in `/marketplace`.

### 17.3 Marketplace purchase: cart → checkout → fulfilment → stock
1. Pharmacy browses `/marketplace` (sellers) or `/marketplace/products` (all products) or `/seller/:id`.
2. **Add to cart** (MarketplaceProducts): upsert `cart_items {buyer_id, seller_id: product.stockist_id, product_id, quantity}` on conflict (buyer_id,product_id); seller-lock enforced client-side against `cartItems[0].seller_id`. (SellerDetail path skips the lock, §3.4.)
3. **Cart** `/cart`: server-backed lines, qty stepper mutates quantity (0 ⇒ delete), totals = Σ price×(1−discount%)×qty.
4. **Checkout** `/checkout`: requires delivery address; client-side order number `ORD/{buyerOrderCount+1, pad 4}`; inserts `orders` (buyer_id, seller_id=stockist_id=cart's seller, pharmacy_id=**buyer profile id**, status+delivery_status 'pending', address/notes) then `order_items` (discounted unit price, subtotal), then deletes the cart rows; navigates `/orders` (where the buyer sees nothing, §2.5).
5. **Seller fulfilment** (Orders detail dialog, delivery_status machine): pending →(Confirm)→ confirmed →(Mark as Packed, **stock decremented** per line `max(0, stock−qty)`)→ packed →(Ship + tracking id)→ shipped →(Mark as Delivered, delivered_at=now)→ delivered; Cancel from any non-terminal state (**cancelling after packing does not restore stock**). Payment Link generation available packed-onward: UPI deep link from seller's upi_id + wa.me share to buyer's phone.
6. **MR post-delivery**: "Create Bill for This Order" → BillForm prefilled `?orderId&pharmacyId&amount` (works only if the order's pharmacy_id matches an MR-owned pharmacies row — true for OrderForm-created orders, not for marketplace ones).

### 17.4 Receivables: bill → credit → reminders → settlement
1. **Creation** (4 paths, §15.2 bills). PharmacyDetail's path additionally seeds payment_requests + payment_reminders and sets reminder_count=1; QuickBill/QuickOrder decrement stock at bill time (they treat a bill as an implicit fulfilled order).
2. **Credit control**: PharmacyDetail live-checks `check_credit_limit` (display-only warning tiers 90/100%); BillForm computes `previous_due + total − upfront` client-side and hard-blocks above `max_credit_limit`. Utilization everywhere = Σ(due−received) over non-paid bills.
3. **Status machine**: `update_bill_statuses()` run on PharmacyDetail load re-buckets by remaining_due_date (paid / pending / due_soon ≤2d / overdue <7d late / critical >7d late) — §8.2 table. StatusBadge renders the buckets with day counts.
4. **Reminders**: PharmacyDetail "Send Reminder" inserts a followup payment_reminders row + bumps bills.reminder_count/last_reminder_sent; Orders' payment-link dialog and QuickOrder open `wa.me/{phone}` with `generateWhatsAppMessage` text; Payments page inserts payment_requests and plays the 2-second PaymentProcessModal simulation. Nothing sends anything server-side.
5. **Settlement**: UpdateBillModal partial/full (received_amount, optional status='paid'); Payments' Mark Paid (status only). No receipt records, no payment gateway, no reconciliation — settlement is manual bookkeeping.

### 17.5 OTC partnership (as it behaves today)
Pharmacy → `/otc-partnership`: wizard select plan → select ≤max_brands brands → review → "Complete Payment (Dummy Payment)" inserts `pharmacy_otc_subscriptions {payment_status:'paid', status:'active', selected_brands:[ids]}`. Because nothing calls `initialize-otc-inventory`, no otc_inventory/otc_shipments rows appear; the pharmacy sees the "active subscription" summary card (plan name, ₹{stock_value/1000}k, brand count) on OTCPartnership and the (duplicated) Profile OTC card, but the Dashboard OTC Overview card (conditioned on inventory rows) never renders. If the function were called (e.g. manually), it would seed 24 products ×40 units across the 3 brands + 3 delivered shipments, lighting up the dashboard card with Σmrp×qty value and the flat-5% earnings estimate. `quantity_sold` has no writer — there is no OTC sales-recording flow.

### 17.6 Premium subscription (fully coded, unreachable)
Upgrade.tsx (unrouted): pay ₹999 to 9672123710 → upload screenshot (private-bucket getPublicUrl bug §5.7/§9.2) + UTR → subscription_requests pending → admin/Subscriptions.tsx (unrouted) Approve → profile becomes premium for 30 days / Reject with reason. `subscription_tier` feeds only the Premium/Free badges; **no feature in the app actually checks the tier** (the "3 free customers" limit exists as columns only).

### 17.7 Destructive admin operations
- **Wipe**: AdminDashboard Danger Zone (typed phrase, includeAdmins checkbox) → admin-wipe fn: row-deletes 14 tables (leaves all 4+2 OTC tables and both storage buckets untouched), then deletes auth users one-by-one via admin API, skipping admins unless included. Client signs out (if admins included) or reloads.
- **Self-delete**: Profile → type DELETE → delete-my-account fn (14-entity cascade, §7.5; leaves OTC data and storage files orphaned) → signOut → /auth.

---


## 4B.15 MR user journeys by role

## 18. COMPLETE USER JOURNEYS BY ROLE

### 18.1 MR (Medical Representative) — brand-locked field seller
Signs up with Company Name + **Brand Name (business_type)** + UPI + agreement doc. Lands on SellerDashboard ("MR Dashboard", subtitle `Brand: {brand} • {company}`) with Quick Bill / Quick Order / OCR Scan header actions. Day-to-day loop:
1. **Build territory**: `/pharmacies/new` for each chemist; `/pharmacies` shows the book sorted by payment-risk severity with credit-utilization coloured cards.
2. **Catalogue**: `/my-products` (brand-restriction banner); products addable only under their registered brand (client lock + DB trigger). OCR scan from dashboard for fast stock entry.
3. **Order intake**: `/marketplace/order/new` (pick pharmacy + products, RPC order number) → redirected into `/bills/new` to bill it; or Quick Order (paste WhatsApp-style free text, auto-matched to catalogue, bill created + stock decremented + WhatsApp/UPI share panel); or Quick Bill (search products, itemised total → aggregate bill + stock decrement).
4. **Receivables**: `/pharmacy/:id` per-customer cockpit — credit gauge, bill list with live statuses, create-bill-with-payment-request card (UPI link + WhatsApp reminder + reminder log), Update Payment / Send Reminder per bill; `/payments` for cross-customer reminder blasts; `/bills/new` for standalone bills with previous-due roll-up and hard credit block.
5. **Field work**: `/delivery-planner` — tick pharmacies, "optimize" (simulated), open the multi-stop Google Maps direction URL.
6. **Review**: `/analytics` (order KPIs/charts), `/reports` (Sales/Payments/Inventory CSV), ActivityFeed on dashboard.
Platform-marketplace side: MR products are visible to pharmacies (as seller_type 'stockist'); incoming marketplace orders appear under Orders "Platform Orders" and use the same fulfilment machine; MR-only extra = "Create Bill for This Order" after delivery. Known journey potholes: dashboard Quick-Action `/products` 404s; Edit-product from MyProducts 404s; revenue KPI = Σ received across bills (not orders).

### 18.2 Stockist — multi-brand wholesaler
Signup with Business Name + License Type + UPI + stockist license. SellerDashboard shows OCR Scan + Bulk Upload. Journey: bulk-load full catalogue (CSV/XLSX), maintain via MyProducts (expiry/stock filters, availability toggles, catalogue-live switch); fulfil marketplace orders through the delivery_status machine incl. packed-time stock decrement and UPI payment-link sharing; track buyers in `/my-customers` (favourites, WhatsApp, create-bill shortcut — outstanding figures unreliable per §2.12); monitor `/analytics` + `/reports`. No pharmacies-book or delivery planner in their nav (those are MR-flavoured, though the pages are not role-guarded). Revenue KPI = delivered `status` orders → effectively ₹0 (§15.2 orders note); Pending Orders KPI similarly reads `status='pending'` which *does* match (status never leaves pending).

### 18.3 Distributor
Identical surface to stockist plus: signup captures Service Areas (comma-separated; stored in metadata → business_type? no — it's sent as part of metadata but only business_name/business_type persist; service areas are **collected and discarded**), MyCustomers gains the "Stockists" tab (always empty, §15.2 relationships), and ProductForm stamps their products `seller_type='distributor'` (the only seller_type that's ever accurate for the marketplace filter).

### 18.4 Pharmacy — the marketplace buyer
Signup with Pharmacy Name/Owner/Address + license (no UPI). Dashboard: hero → `/marketplace`; KPIs (pending orders, total spent, favourite suppliers, total orders); Featured (verified+live) sellers; OTC card once inventory exists. Journey: browse sellers → favourite (heart) → seller catalogue or all-products grid → seller-locked cart → checkout with address/notes → order placed. Post-purchase visibility is the journey's weak spot: `/orders` shows them nothing (§2.5); tracking numbers and delivered states are only ever seen by the seller; the pharmacy's only order telemetry is dashboard KPI counts, MySuppliers per-seller aggregates (orders/spend/pending) and ActivityFeed lines. `/my-suppliers` lists every seller they've ever ordered from with Browse shortcut. OTC: subscribe via the 3-step dummy-payment wizard (§17.5). Support tickets, Profile (bank/UPI editing — collected though pharmacies never receive payments in-app), Settings, account deletion as any role. The layout search bar (pharmacy-only) focuses → `/marketplace`.

### 18.5 Admin
Created via signup with the `jit@ADMIN1` gate (client + edge fn + DB trigger all check it) — note `/onboarding` deliberately omits admin. Landing `/` → AdminDashboard: platform KPIs, users-by-role, subscription queue preview (Review buttons 404), Danger-Zone wipe. Working tools: `/admin/users` (search/filter, verify/unverify), `/admin/support` (global ticket triage with inline status select), `/admin/role-audit` (role distribution + full user table + two real XLSX exports). Layout gives admins an extra Shield header button and a Role Audit menu entry; admin bottom nav = Home/Users/Support/Audit/Analytics (Analytics shows *their own* — empty — seller analytics, as it queries orders by their user id). The subscription approval screen exists but must be reached by editing the URL… which still 404s (no route), so approvals are only possible by adding the route or driving the DB directly.

---


## 8B. MR page matrix (every page)

## 26. APPENDIX A — PAGE MATRIX (every page: access, wrapper, data in, writes out, navigation out)

Legend: Guard = client role guard; RLS is always additionally in force. Layout = wrapped in `<Layout>` chrome.

| Page (file) | Route | Guard | Layout | Reads (tables/RPC/fn) | Writes | Navigates to |
|---|---|---|---|---|---|---|
| Auth | /auth | public | no | profiles (username check) | auth.signUp/signIn/reset/OTP; storage licenses; profiles.update; fn assign-role | /dashboard |
| OnboardingSelectRole | /onboarding | login | no | — | fn assign-role | / |
| DashboardRouter | /, /dashboard | login | (delegates) | user_roles | — | /onboarding or role dashboard |
| SellerDashboard | via router | role via router | yes | bills+pharmacies, orders, pharmacies, products, seller_buyer_relationships, profiles | — (modals write) | /pharmacies, /products✗, /orders, /payments, /customers✗, /suppliers✗, /analytics |
| PharmacyDashboard | via router | — | yes | orders, seller_buyer_relationships, otc_inventory, profiles+user_roles (featured) | — | /marketplace, /orders, /suppliers✗, /seller/:id, /otc |
| AdminDashboard | /admin/dashboard, / | **none** | yes | user_roles, profiles, subscription_requests | fn admin-wipe | /admin/users, /admin/subscriptions✗, /admin/subscriptions/:id✗ |
| Pharmacies | /pharmacies | none | yes | pharmacies, bills, orders | — | /pharmacies/new, /pharmacy/:id |
| PharmacyForm | /pharmacies/new | none | yes | — | pharmacies.insert | /pharmacies |
| PharmacyDetail | /pharmacy/:id | none | yes | pharmacies, bills (+realtime), RPC get_next_bill_number / check_credit_limit / update_bill_statuses | bills.insert/update, payment_requests.insert, payment_reminders.insert | back, wa.me |
| BillForm | /bills/new | none | yes | pharmacies, bills (previous due), RPC get_next_bill_number | bills.insert | /bills✗ |
| Payments | /payments | none | yes | bills+pharmacies, payment_requests | payment_requests.insert, bills.update(paid) | — (modals) |
| Profile | /profile | none | yes | profiles, OTC subs/plans (as any) | profiles.update, auth.updateUser, fn delete-my-account, auth.signOut | /auth, /otc-partnership |
| Catalogue | /catalogue | none | yes | products+profiles | — (modals write products) | /marketplace/product/new |
| ProductForm | /marketplace/product/new, /:id | none | yes | products (edit), profiles (MR brand), fn autocomplete-product | products.insert/update, storage product-images | /marketplace ⚠️ (seller → guard bounce) |
| OrderForm | /marketplace/order/new | none | yes | pharmacies, products, RPC get_next_order_number | orders.insert, order_items.insert | /bills/new?order&pharmacy |
| Orders | /orders | none | yes | orders (seller-side), profiles, pharmacies, order_items+products | orders.update (delivery machine), products.update (stock@packed) | /pharmacies/:id✗, /bills/new, wa.me |
| MyProducts | /my-products | mr/stockist/distributor | yes | products, profiles | profiles.update(is_catalogue_live), products.update(is_available)/delete | /marketplace/product/new, /marketplace/product/edit/:id✗ |
| Marketplace | /marketplace | pharmacy | yes | profiles+user_roles, products (counts) | seller_buyer_relationships.upsert | /seller/:id, /marketplace/products |
| MarketplaceProducts | /marketplace/products | pharmacy | yes | products, profiles, cart_items | cart_items.upsert/update/delete | /cart |
| SellerDetail | /seller/:sellerId | pharmacy | yes | profiles, products | cart_items.upsert (no lock) | /cart |
| Cart | /cart | none | **no** | cart_items+products+profiles | cart_items.update/delete | /checkout, /marketplace |
| Checkout | /checkout | none | yes | cart_items, profiles, orders(count) | orders.insert, order_items.insert, cart_items.delete | /orders |
| MyCustomers | /my-customers | none | yes | seller_buyer_relationships+profiles, bills, orders | relationships.update(is_favorite) | /bills/new?pharmacy, /pharmacies/new, wa.me |
| MySuppliers | /my-suppliers | pharmacy | yes | orders+profiles | — | /seller/:id, /orders?seller (param ignored) |
| Analytics | /analytics | none | yes | orders, seller_buyer_relationships, order_items+products (global 100) | — | — |
| Reports | /reports | none | yes | orders / bills / products by type | — (CSV data-URI download) | — |
| Notifications | /notifications | none | yes | — (hardcoded []) | — | — |
| Support | /support | none | yes | support_tickets | support_tickets.insert | — |
| Settings | /settings | none | yes | profiles | profiles.update (General tab only) | — |
| OTCPartnership | /otc-partnership (+/otc redirect) | none | yes | pharmacy_otc_subscriptions, otc_subscription_plans, otc_brands (as any) | pharmacy_otc_subscriptions.insert | — |
| DeliveryPlanner | /delivery-planner | none | yes | pharmacies | — | google.com/maps/dir |
| UserManagement | /admin/users | none | yes | profiles+user_roles | profiles.update(is_verified); (unwired client-side admin.deleteUser) | — |
| SupportManagement | /admin/support | none | yes | support_tickets+profiles | support_tickets.update(status, resolved_at) | — |
| RoleAudit | /admin/role-audit | none | yes | profiles+user_roles | — (XLSX exports) | — |
| Subscriptions | **unrouted** | — | yes | subscription_requests+profiles | subscription_requests.update, profiles.update(premium) | — |
| Upgrade | **unrouted** | — | yes | — | storage licenses (payment-proofs), subscription_requests.insert | /dashboard |
| Dashboard (legacy) | **unrouted** | — | yes | RPC update_bill_statuses, bills, pharmacies, products | — (QuickBill modal writes) | /pharmacy/:id(?action=new-bill), /pharmacies/new |
| NotFound | * | — | no | — | — | href "/" |

✗ = dead link (§0.1).

## 7F. MVP entity reference (TypeScript types)

## 13. ENTITY REFERENCE — every TypeScript type, field by field

All domain types live in `src/core/types.ts` (428 lines) except four context-local entities defined inside `src/contexts/AppStateContext.tsx` (`CartItem`, `Invoice`, `PaymentReminder`, `CircleEntry`). Fields marked `?` are optional in the interface.

### 13.1 Enum/union types (`types.ts` lines 1–15)
| Type | Values | Notes |
|---|---|---|
| `UserRole` | `admin \| stockist \| pharmacist` | drives Dashboard switch + nav menus |
| `ApprovalStatus` | `pending \| approved \| rejected \| update_required \| suspended` | `suspended` never written by any screen (§7) |
| `OrderStatus` | `draft \| placed \| confirmed \| dispatched \| delivered \| cancelled` | `draft` never created by any screen; exists only in `orderFlow`/colors |
| `PaymentStatus` | `paid \| partial \| overdue \| pending` | `overdue` only in seed-free dead code (PaymentsPage derivation) |
| `OrderType` | `PLATFORM \| CIRCLE` | derived from circle membership at creation time |
| `SubscriptionPlan` | `basic_100 \| standard_200 \| premium_500` | maps to bill limits 100/200/500 |
| `PharmacyType` | `retail \| chain \| clinic \| hospital` | `hospital` disabled ("Coming soon") in registration |
| `StockistType` | `sub_stockist \| super_stockist \| distributor` | only `sub_stockist` selectable; all seed stockists are sub_stockist |
| `ReturnStatus` | `pending \| approved \| rejected` | |

### 13.2 `User` (base) — `id, name, email, role, phone, avatar?, status: ApprovalStatus, createdAt`. No screen ever sets `avatar`; avatars everywhere are initial-letter circles.

### 13.3 `StockistProfile extends User` (role `'stockist'`)
Groups exactly as the 7-step registration wizard:
- **Business:** `businessName`, `businessType: StockistType`, `yearsInBusiness` (string bucket e.g. `'5_10'`), `gstNumber`, `panNumber`, `drugLicense`, `serviceAreas: string[]` (city names, shown in FindStockist/admin lists).
- **Documents:** `documents: RegistrationDocument[]`.
- **Subscription:** `subscription: Subscription` (required — every stockist has one).
- **Contact:** `contactPerson`, `whatsapp?`, `password?` (a plain-text optional field; never actually stored by any flow).
- **Addresses:** `officeAddress`, `officeMapsLink?`, `warehouseAddress?`, `warehouseMapsLink?`, `city`, `state` (lowercase slugs in seed, e.g. `'maharashtra'`), `pincode`.
- **Delivery:** `deliveryDays: string[]` (`'Mon'`…), `deliverySlots: string[]` (`'morning' \| 'afternoon' \| 'evening' \| 'full_day'`), `serviceablePincodes: string[]`, `serviceRadius?`.
- **Business rules (all string):** `defaultCreditLimit?`, `defaultCreditDays?`, `minimumOrderValue?`, `deliveryChargeType?` (`free/flat/free_above/distance`), `deliveryFlatRate?`, `deliveryFreeAbove?`, `deliveryBelowAmountCharge?`, `deliveryPerKm?`, `deliveryBaseCharge?`. **None of these rules is enforced anywhere** — no minimum-order check, no delivery charge is ever added to an order; they are display-only (StockistProfile page, admin StockistDetail).
- **Financial:** `accountHolderName?`, `bankName?`, `accountNumber?`, `ifscCode?`, `upiId?` — display-only (StockistPayments bank card, profiles).

Lifecycle: created only by seed or `registerStockist` (which forces `status:'pending'` — but no live screen calls it; see §2.5). Status mutated only via `updateUserStatus` overrides (admin actions). Never deleted.

### 13.4 `PharmacistProfile extends User` (role `'pharmacist'`)
- **Business:** `pharmacyName`, `pharmacyType: PharmacyType`, `legalEntityType` (string: proprietorship/partnership/private_limited/llp), `panNumber`, `gstNumber?` (optional — clinics), `pharmacistName`, `pharmacistRegNumber`, `numberOfBranches?` (chains), `pharmacyLicense`.
- **Docs/address:** `documents: RegistrationDocument[]`, `address: Address` (single embedded address; the *separate* `addresses` slice in AppState is what Checkout/Addresses actually use).
- **Contact:** `ownerName`, `designation?`, `whatsapp?`, `googleMapsLink?`, `landmark?`.
- **Config:** `monthlyPurchaseRange?` (`lt_50k/50k_2l/2l_5l/5l_plus`), `preferredCategories?: string[]`, `creditRequired?: boolean`, `creditAmountNeeded?`, `expectedCreditDays?`. Display-only (profile + admin detail); the *real* credit engine uses `CircleEntry.creditLimit`, not these.

Lifecycle: seed, or created by a **stockist** via FindPharmacy "Create New Pharmacy" (`registerPharmacist`, forced pending). Status via `updateUserStatus`. Never deleted.

### 13.5 `AdminProfile extends User` — no extra fields. Only instance: seed `admin-001`.

### 13.6 `RegistrationDocument` — `id, label, number?, expiryDate?, fileUrl?, fileName?, status?: 'uploaded'|'verified'|'rejected'`. Seed fileUrls are `/placeholder.svg` or `'#'`; document "preview" dialogs render the image if fileUrl looks like an image else a FileText icon; the ProfileSection preview explicitly says "Document preview not available in prototype". No screen ever changes a document's `status`.

### 13.7 `Document` (`id, name, type, url, uploadedAt`) — **declared but never used anywhere** (dead type).

### 13.8 `Address` — `id, label, line1, line2?, city, state, pincode, isDefault, contactName?, phone?, organizationId?`. `organizationId` scopes an address to a pharmacy; addresses with **no** organizationId are visible to every pharmacist (Checkout/Addresses filter `!organizationId || organizationId === me`). `setDefaultAddress` re-flags only within the same organizationId group. Order stores only `addressId?` (never displayed back on OrderDetail).

### 13.9 `Medicine` — `id, name, genericName, manufacturer, category, hsn, isCounterfeit, stockistId` (owner), plus optional regulatory extras `drugSchedule?, drugType?, packType?, packSize?, imageUrl?, composition?, requiresRx?, isNarcotic?`. Seed medicines set none of the optionals; AddItem sets them on dynamic medicines but **no screen reads them back** except EditProduct prefill (`requiresRx` is never used for the Rx badge — that badge is the `category === 'Antibiotic'` heuristic). `imageUrl` never set (all product images are Package-icon placeholders).

### 13.10 `Batch` — `id, medicineId, stockistId, batchNumber, expiryDate, manufacturingDate, mrp, purchasePrice, sellingPrice, quantity, isCounterfeit`. Quantity is the only field with an override channel (`batchQtyOverrides`); price/expiry edits persist only for dynamic batches (see §15.8 correction). Batches are never deleted.

### 13.11 `InventoryItem` — computed wrapper `{ medicine, batches: Batch[], totalStock, lowStockThreshold: 100 }`. Two variants exist: the **live** `allInventory` (context; `totalStock` counts only non-expired batches) and the **seed export** `inventoryItems` in `inventory.ts` whose `totalStock` sums ALL batches including expired — the seed export is effectively unused by screens (everything reads `allInventory`).

### 13.12 `OrderItem` — `id, medicine: Medicine, batch: Batch, quantity, unitPrice, discount, tax, total`. Note: full Medicine and Batch objects are **embedded by value** into the order (and then into localStorage), so later medicine/batch edits do NOT retroactively change historical order lines. `discount` is a percent in seed data (e.g. 5) but always `0` in dynamic orders; `tax` is `12` (a rate) in seed items but a **rupee amount** (`round(itemTotal×0.12)`) in dynamic items — inconsistent semantics that no screen reconciles (item tax is never displayed per-line).

### 13.13 `Order` — `id, orderNumber, type: 'pharmacy'|'stockist'` (who placed it), `orderType: PLATFORM|CIRCLE`, `status`, `placedBy/placedTo: {id,name,role}`, `addressId?`, `items[]`, `subtotal, totalDiscount, totalTax, grandTotal, totalPaid, totalDue, paymentStatus: pending|partial|paid, createdAt, updatedAt, timeline: OrderTimelineEvent[], invoiceUrl?`. **`totalPaid`/`totalDue`/`paymentStatus` are snapshot fields set at creation and never updated by `addPayment`** — every screen that shows real payment state recomputes from `allPayments` (via `getOrderPaidAmount` etc.); the stored fields go stale after any payment. `invoiceUrl` never set (invoices live in the separate `invoices` slice).

### 13.14 `OrderTimelineEvent` — `status, timestamp, note?`. Appended by createOrder (initial) and every updateOrderStatus.

### 13.15 `Payment` — `id, orderId, payerId, payeeId, amount, method: bank_transfer|upi|cash|credit, status: PaymentStatus, paidAt?, dueDate, reference?`. Dynamic payments get `dueDate: ''` unless supplied (never supplied by any screen). The `'cheque'` string leaks into `method` via CirclePharmacies' cast (§3.7).

### 13.16 `LedgerEntry` — canonical fields `id, date, organizationId` (the pharmacy), `counterpartyId` (the stockist), `entryType: DEBIT|CREDIT, amount, referenceType: ORDER|PAYMENT, referenceId, description, runningBalance` + **legacy compat fields** `debit, credit, balance, relatedOrderId?, partyName, partyRole` that `makeLedgerEntry` fills from the canonical ones. Dynamic entries do NOT maintain a true running balance: order DEBITs store `runningBalance = grandTotal` and payment CREDITs store `runningBalance = 0`, regardless of history — which is why PlatformLedger's "Balance" stat (last entry's `.balance`) is effectively meaningless once dynamic entries exist. `relatedOrderId` is only set for ORDER entries, so PharmacistStockistDetail's ledger tab (filters by relatedOrderId) silently omits dynamic payment CREDITs.

### 13.17 `CreditSummary` / `CreditEntry` — seed-only export (`payments.ts`), never rendered.

### 13.18 `CirclePharmacy` — the rich seed circle type (`pharmacist` object, `customPricing`, `priceModifier`, `addedAt`); 11 seed rows in `banners.ts`; **entirely unused** — the live circle model is the context's `CircleEntry`.

### 13.19 `CircleEntry` (context-local) — `id, stockistId, pharmacyId, creditLimit: number, creditDays: number, notes, addedAt`. THE join entity of the app: drives `getOrderType` (CIRCLE vs PLATFORM), the credit engine (`getCreditLimit/canUseCredit`), the stockist's "My Pharmacies" list, and pharmacist auto-connection. No custom pricing exists in the live model.

### 13.20 `CartItem` (context-local) — `medicineId, name, batch` (batchNumber string), `batchId, price, mrp, quantity, stockistId, stockistName`. Cart identity key = `batchId + stockistId` for merge, `medicineId + stockistId` for remove/update (slight asymmetry; harmless because each medicine contributes one best batch).

### 13.21 `Invoice` (context-local) — `id, invoiceNumber ('INV-2024-###'), orderId, orderNumber, pharmacy, stockist, items[{name,qty,price,total}], subtotal, discount, tax, total, createdAt, status: draft|issued|paid`. Always created as `issued`; nothing ever moves one to `paid` (StockistPayments' bills tab derives paid/unpaid from live payment math instead of this field).

### 13.22 `PaymentReminder` (context-local) — `id, pharmacyName, pharmacyId, amount, message, sentAt, channel: whatsapp|sms`. Only `whatsapp` is ever written. Read back only in StockistPayments' "Reminder History" (last 3).

### 13.23 `Subscription` — `plan, billLimit, billsUsed, validUntil, status: active|expired|grace`. `billsUsed` is never incremented by QuickBill or anything else (static seed numbers); `expired`/`grace` never occur.

### 13.24 `Notification` — `id, title, message, type: push|in_app, target: 'all'|'stockists'|'pharmacists'|userId, read, createdAt, actionUrl?`. Seed-only entity; the Notifications page also fabricates pseudo-notifications from orders at render time (§0.7). `actionUrl` exists on 3 seed rows but the page never navigates on click (click only marks read).

### 13.25 `Banner` — `id, title, message, ctaText?, ctaUrl?, target, active, createdAt`. Rendered by the 3 dashboards through the `Banner` ui-pattern (dismiss = local state only, reappears on reload). Admin-created banners get `ctaUrl` only if ctaText given? — BannerManagement collects Title/CTA Text/Message/Target; it sets no ctaUrl, so admin banner CTAs render but navigate nowhere meaningful (`ctaUrl` undefined → CTA hidden on stockist/pharmacist dashboards which require `banner.ctaUrl`; AdminDashboard's CTA is a no-op regardless).

### 13.26 `CommissionRule` — `id, category, rate, appliedTo`. Seed 5 rules; admin page edits a local copy only; **no calculation anywhere consumes commission rules** (AdminPayments' "Commission" stat is an unrelated flat 5% of volume).

### 13.27 `DeliverySlot` / `ServiceArea` / `Holiday` — as documented in §3.12/§3.13. Note: `deliveryAreas`/`deliverySlots` are a **single global list**, not per-stockist — every stockist who logs in sees and edits the same three seeded areas/slots (no `stockistId` on ServiceArea/DeliverySlot). `Holiday` DOES have `stockistId`.

## 4B.16 MVP Pharmacist module

## 4. PHARMACIST MODULE

### 4.1 PharmacistDashboard (`/dashboard` role=pharmacist)
- Banner (first active pharmacist/all). 4 StatCards, Quick Actions (6), Active Orders (first 5, not delivered/cancelled).
- **KPIs:** `myOrders = placedBy.id === user.id`. Pending Orders = count placed+confirmed+dispatched. Due Payments = `₹{(outstanding/1000).toFixed(1)}K` where `outstanding = max(0, Σ myOrders grandTotal − Σ payments for those orders)`. Connected Stockists = `getConnectedStockists(me).length`. Recent Purchases = delivered count. **StatCard trends hardcoded** (down/neutral/up).
- Quick Actions: Browse, Cart (with live count badge), Quick Order, Stockists, Pay Dues (→ payments), Orders.

### 4.2 FindStockist (`/pharmacist/stockists/find`)
- Lists **approved** stockists (businessName, city, serviceAreas, product count = inventory where stockistId matches). Search by name/city. "Connect" → `connectStockist(me, id)` (real, persisted); connected ones show disabled "Connected".

### 4.3 PharmacistStockists (`/pharmacist/stockists`)
- "My Stockists" (approved + in `getConnectedStockists(me)`). Search. Card → `/pharmacist/stockists/{id}`. Per card: products count, **Outstanding = `max(0, Σ ordered − Σ paid)`** for orders between me and that stockist, holiday chip ("On Holiday (Pre-orders open)" if preOrderEnabled). Empty → Find Stockists.

### 4.4 BrowseMedicines (`/pharmacist/browse`)
- 700ms skeleton. View toggle Medicines / Stockists. Cart button with count badge.
- **Only shows inventory of connected stockists**, filtering out counterfeit. Search by name/generic/category.
- **Medicines cards:** Rx badge (Antibiotic), Out of Stock badge (no valid batch), **Low Stock badge (batch qty `< 10`)**, price + struck MRP, stock count, stockist name, **"Delivery by {now+2 days}" (hardcoded stub)**, Add to Cart / In Cart(qty) / Unavailable.
- **`getBestBatch` = FIFO** (future expiry, qty>0, non-counterfeit, earliest expiry). `addToCart` sets quantity 1, uses best batch. Add validation: no valid batch → "Not Available" toast.
- **Stockists view:** connected stockists with holiday chips.

### 4.5 PharmacistStockistDetail (`/pharmacist/stockists/:id`)
- Header (businessName, city, phone), 2 stat tiles: Outstanding = `max(0, Σ ordered − Σ paid)` over orders involving this id; Total Paid. Buttons: Order Now (→ browse), Pay Dues (→ payments).
- Tabs: **catalog / orders / ledger**.
  - catalog: `allInventory` (non-counterfeit, in-stock) — **NOT filtered to this stockist** (shows global catalog). Low Stock label uses **`totalStock < 100`** (inconsistent with Browse's 10). Add uses **`batches[0]`** (not FIFO).
  - orders: orders where placedTo/placedBy = this id → `/orders/{id}`.
  - ledger: entries whose relatedOrderId is in related orders; +green/−red.

### 4.6 Cart (`/pharmacist/cart`)
- Line list (name, batch, stockist, qty steppers, line total, remove). Summary: Subtotal / Tax 12% / Total. "Proceed to Checkout". Empty state → Browse. **Not grouped by stockist** (grouping happens at checkout).

### 4.7 Checkout (`/pharmacist/checkout`)
- Groups cart by `stockistId`; classifies each group PLATFORM vs CIRCLE via `getOrderType(me, stockistId)`.
- **Content:** Delivery Address (select saved addresses filtered by `!organizationId || organizationId===me`; "+ Add New" dialog), **Delivery Slot** (4 hardcoded slots Morning/Afternoon/Evening/Night — **UI only, not persisted**), Items grouped by stockist with PLATFORM/CIRCLE badge, Order Notes textarea (**captured, not persisted**), Payment (Pay Now UPI / Pay Later Credit — Pay Later only if any CIRCLE group), Summary (Subtotal/Tax12%/Total).
- **Credit check:** per CIRCLE group, `orderTotal = subtotal+12%`; `creditWarnings` = groups where `!canUseCredit` and choice is pay_later. Warning banner "Used ₹X / Limit ₹Y". Place button disabled if warnings exist or no address.
- **Place flow (`handlePlace`):** validateStock (blocks on error). If pay_later + warnings → block. If platform orders OR pay_now → **simulated payment**: `paymentStep='paying'` (2000ms spinner "Simulating UPI payment") → `'success'` (800ms) → create (500ms). Then **one order per stockist**: `type:'pharmacy'`, orderType per group, status `confirmed` if prepaid else `placed`, paymentStatus paid/pending, discount 0. Prepaid orders also call `addPayment({method:'upi', reference:PAY-{ts}})`. `clearCart`, success screen listing order numbers.
- **Add-address dialog fields:** Label*, Address Line*, City*, Pincode, State → `addAddress` (first one auto-default). Requires label+line1+city.
- **Stubs:** delivery slot + order notes not passed to createOrder.

### 4.8 QuickOrder (`/pharmacist/orders/quick`) — WhatsApp→order
- "Order From" select (connected stockists — **largely ignored once items match**). Textarea (sample text provided) + "Use Sample" + "Parse Items".
- **Parsing:** split newline; split each by hyphen/en-dash/em-dash → name + qty (`\d+` in second part, default 1); `fuzzyMatch` = substring `.find()` first match against **connected-stockist** inventory. `getBestBatch` = FIFO for the estimate/price.
- Shows Parsed Items (matched/unmatched, stockist name), "Matched X / Y", Estimated Total (matched only), "Create Order".
- **Create:** groups matched items by **real `medicine.stockistId`**, one **PLATFORM** order per stockist, status `placed`, unpaid, discount 0. **BUG:** order line uses `inv.batches[0]` (NOT the FIFO batch used for the estimate). Toast → `/pharmacist/orders`.

### 4.9 PharmacistInventory (`/pharmacist/inventory`)
- Read-only, from `getPharmacyInventory(me)` (auto-populated on delivery). Search + All/Expiring tabs (≤ **90 days**). Row: name, batch, qty, expiry label (Expired/Expiring Soon/Valid), MRP/Expiry/Received. Empty: "auto-populated when orders are delivered".

### 4.10 Addresses (`/pharmacist/addresses`) — real CRUD
- Add form: Label*, Address Line*, City*, Pincode → `addAddress` (first auto-default; requires label+line1+city). List (scoped `!organizationId || ===me`) with Set-Default (check icon) and Delete. Uses `setDefaultAddress` (default is per-organizationId group).

### 4.11 DeliveryPreferences (`/pharmacist/delivery-preferences`) — **FULLY STUBBED**
- Time-slot multi-select (morning/afternoon/evening; default morning+afternoon) + Delivery Instructions textarea (default text). Save → toast only. Pure local state, no AppState.

### 4.12 PharmacistProfile (`/pharmacist/profile`)
- Status banner, avatar header. Section cards: Contact (Edit), Business (Edit), Documents (no edit; preview dialog — FileText only, no image), Address (Edit), Configuration (monthly purchase/categories/credit — no edit).
- **STUB:** edit `handleSave` = toast only, not persisted.

---


## 4B.17 MVP Stockist module


Every stockist screen scopes to `user?.id`, with `'stockist-001'` fallback in several (CreateOrder, QuickBill, CirclePharmacies, FindPharmacy, HolidayManagement).

### 3.1 StockistDashboard (`/dashboard` when role=stockist)
- **Sections:** active stockist/all Banner (CTA navigates to `ctaUrl`), Quick Actions (3×2 grid), circle-count banner (→ `/stockist/circle`), 6 KPI cards, Monthly Order Trend BarChart, Top Pharmacies by Revenue, Top Products by Sales, Recent Orders (first 5).
- **Quick Actions (navigate-only):** Create Order `/stockist/orders/create`, Quick Bill `/stockist/quick-bill`, Collect Payment `/stockist/payments`, Add Pharmacy `/stockist/circle/find`, Bulk Upload `/stockist/inventory/upload`, Upload Bill `/stockist/inventory/bills`.
- **KPI formulas (all real, read-only):** `stockistOrders` = orders where placedTo/placedBy = me. Pending Orders = count of status placed+confirmed. Total Products = my inventory count. Pharmacies = my circleEntries count (also the banner count). Revenue = `Σ grandTotal of delivered` shown `₹{(x/1000).toFixed(0)}K`. Outstanding = `max(0, Σ grandTotal of ALL my orders − Σ paid payments with status 'paid')` (note: sums *all* order value, not just unpaid — differs from the FIFO/outstanding math elsewhere). Stock Value = `Σ sellingPrice × quantity` over batches (includes expired).
- **Monthly chart:** last 6 months, order **count** per month by createdAt.
- **Top Pharmacies:** by `Σ grandTotal` of delivered orders, top 3. **Top Products:** by `Σ quantity` across all order items, top 5.
- **Recent Orders:** first 5 `stockistOrders`, each → `/orders/{id}`; StatusChip success/destructive/primary.

### 3.2 Inventory (`/stockist/inventory`)
- Scoped to `medicine.stockistId === user.id`. 600ms skeleton.
- **Content:** search box, Add button (→ add), Filters button (badge = active filter count), grid/list toggle, active-filter chip row, action buttons (Bulk Catalogue/Purchase Bill/Bulk Price), product grid or list.
- **Filters dialog fields:** Categories (multi-select chips from own inventory), Brand/Manufacturer (search box + checkbox list), Expiry (all / soon <30d / 1-3 months = 30–90d / 3-6 months = 90–180d — matches if ANY batch qualifies), Stock Availability (all/in_stock/low/out; low = `totalStock <= 100 && >0`), Price Range Min/Max (against `batches[0].sellingPrice`). Apply/Reset.
- **Card content:** image placeholder (Package icon), badges — Out of Stock (if totalStock 0), Rx (if category Antibiotic & not OOS), Flagged (Shield, if counterfeit), edit pencil (→ edit). Name, manufacturer, category pill, sellingPrice + struck MRP, "Buy: ₹{purchase} · Margin {X}%" where `margin = round(((sell−purchase)/purchase)×100)`, Stock count, earliest expiry (month/year).
- **List row:** icon, name, manufacturer·category, price+MRP+margin, right: totalStock (orange if ≤ threshold) + batch count.
- **Empty state** adapts (filters/search present → "Clear Filters"; else "Add Product").
- **Stubs:** no delete. `batches[0]` used for price/margin display (multi-batch shows only first).

### 3.3 AddItem (`/stockist/inventory/add`)
- **Sections/fields:** Product Images (dead placeholder — "Image upload will be available with backend integration"). Basic: Product Name*, Brand, Manufacturer*, Category. Pricing & Inventory: MRP*, Sale Price, Purchase Rate, Stock Qty*, Min Stock Level (**default '100'**). Batch & Compliance: Batch Number*, Expiry Date* (date), Mfg Date, HSN Code, GST Rate (plain text). Regulatory: Drug Schedule, Drug Type, Composition/Salt, Pack Type, Pack Size, FSSAI License. Additional: Requires Rx checkbox, Narcotic checkbox.
- **Validation (`validate`):** name, manufacturer, batchNumber, expiryDate required; expiry must be future; MRP numeric; salePrice ≤ MRP; stockQty numeric.
- **Submit:** 500ms delay → `addProduct(medicine, batch)` (**real, persisted**). genericName defaults to composition||name; category defaults 'General'; sellingPrice defaults salePrice||MRP.
- **Stubs:** `gstRate`, `fssaiLicense`, `brand`, `minStock` are **NOT passed** to addProduct (brand/gstRate/fssai/minStock discarded). `requiresRx`/`isNarcotic`/`drugSchedule`/`drugType`/`packType`/`packSize`/`composition` ARE passed to the medicine object.

### 3.4 EditProduct (`/stockist/inventory/:id/edit`)
- Same layout as AddItem, prefilled from `item` + `batches[0]`. Image placeholder present.
- **Validation:** name/manufacturer required; if expiry set must be future; salePrice ≤ MRP; MRP numeric.
- **Submit:** 500ms → `updateMedicine({name, manufacturer, category, genericName, hsn})` + `updateBatch(batches[0] fields: mrp, sellingPrice, purchasePrice, quantity, batchNumber, expiryDate)`.
- **Stubs:** only edits `batches[0]` — **multi-batch products lose edits to other batches** (updateBatch updates one). Fields gstRate, packSize (default '10 Tablets'), requiresRx, isNarcotic, drugSchedule, drugType, packType, fssaiLicense, brand are shown/prefilled but **never persisted**.

### 3.5 ProductDetail (`/stockist/inventory/:id`)
- **Content:** back + Edit button (Copy/Trash icons imported but **not rendered/unwired**). Title/manufacturer/category. Total Stock card (nos, min, active-batch count). Sales History (6-month) **real** BarChart from non-cancelled orders' items for this med (units). Product Details table. Pricing table (per-batch MRP/Sale/Purchase + HSN + total stock value). Batch History list (expired rows highlighted). Counterfeit warning banner if flagged.
- **Add Batch flow:** "Quick Add" (prefills batchNumber `BATCH-{ts36}`, qty 100, prices from batches[0]) or "Add Batch". Dialog fields: Batch Number*, Quantity*, MRP, Purchase Price, Selling Price, Mfg Date, Expiry Date*. Validation: batchNumber+quantity+expiry required, expiry future, sellingPrice ≤ MRP. Calls `addBatch` (**real**).

### 3.6 BatchManagement (`/stockist/batches`)
- Read-only, scoped to `batch.stockistId === user.id`. 600ms skeleton. Search (batch# or med name). Tabs: All / Expiring Soon (≤ **90 days**) / Counterfeit.
- Row: icon (Shield if counterfeit), batch#, med name, qty, expiry StatusChip (Expired <0 / Expiring Soon ≤90d / Valid), MRP/Purchase/Expiry grid, counterfeit banner "Flagged by Admin" (display-only).

### 3.7 CirclePharmacies (`/stockist/circle`)
- **Content:** "My Pharmacies" + Add button (→ find). Filter tabs: **All / Outstanding / Credit / No Dues** — **Credit tab count is hardcoded 0** and its filter returns all (no distinct filter). Per-pharmacy card.
- **Card:** Store icon, pharmacyName/name, dropdown menu (New Order → create, Create Bill → quick-bill, Send Reminder [disabled if no outstanding]), chevron → detail. 3 KPIs: Outstanding (orange), Credit (primary), Net Due (`credit − outstanding`, shown "… CR"). Bottom "Collect Payment" bar.
- **`getCreditData`:** `outstanding = max(0, Σ grandTotal of non-cancelled pharma orders − Σ all payments for those orders)`; `credit = circle.creditLimit || 175000` (**hardcoded fallback 175000**).
- **Collect Payment flow (FIFO):** modal fields — Amount (₹, prefilled to outstanding), Payment Mode (Cash/UPI/Bank Transfer/**Cheque**), Date (date), Notes. On confirm: builds order-dues list (remaining = grandTotal − paid, >0), loops in order applying `min(remaining, due)` via `addPayment({method, paidAt, reference: {MODE}-{ts}})`. Toast. `cheque` is cast onto the method union (persists as 'cheque' string, off-type).
- **Send Reminder flow:** modal — Message Type toggle (Common for All / Individual — **purely visual, unused**), Message textarea (default text), Reminder Priority select (low/medium/high — **collected but not passed** to sendReminder). Confirm → `sendReminder({channel:'whatsapp'})` + toast. No real message; reminderType/priority discarded.

### 3.8 CirclePharmacyDetail (`/stockist/circle/:id`)
- **Header card:** pharmacyName/name, edit-credit pencil + credit-card icon. Phone with `tel:` link + clipboard copy (real). Address line. **Credit Usage** progress bar `usagePercent = min(100, outstanding/creditLimit×100)`; 3 stats Outstanding/Credit Limit/Available (`credit − outstanding`). "Collect Payment — ₹{outstanding}" button (if outstanding>0).
- **Tabs:** Orders (count) / Payments (count) / Bills / Ledger.
  - Orders: list of pharma↔stockist orders → `/orders/{id}`.
  - Payments: payment rows (method, paidAt, reference, amount).
  - Ledger: table Date/Description/Debit/Credit/Balance filtered to this pharmacy↔stockist pair.
  - **Bills: static message** "Bills are generated when orders are confirmed".
- **Outstanding orders / due dates:** `dueDate = createdAt + creditDays × 86400000`.
- **Collect Payment modal:** Credit Limit + Outstanding stat tiles; Amount (₹) + "Full" prefill; **FIFO allocation preview** (oldest-first; each row marked "Fully covered"/"Partial" with due date); Payment Method grid (Cash 💵 / UPI 📱 / Bank Transfer 🏦 / Cheque 📝); Reference/Transaction ID. Confirm → `addPayment` per allocation. **Fidelity loss:** method mapping `bank→bank_transfer`, **`cheque→cash`** (cheque recorded as cash here, unlike CirclePharmacies which keeps 'cheque').
- **Edit Credit modal:** Credit Limit (₹) + Credit Days → `updateCircleEntry` (real, validated >0). **Remove from Circle** → `removeCircleEntry` + toast + back (real).

### 3.9 FindPharmacy (`/stockist/circle/find`)
- **Content:** search (name/owner/pincode) + "New" button. List of approved (or `circle_only` cast) pharmacies with "In Circle" tag or "Add" button.
- **Add-to-Circle modal:** shows pharmacy; Credit Limit (₹, default 25000), Credit Days (default 30), Notes → `addCircleEntry` (real; auto-connects stockist for that pharmacy).
- **Create New Pharmacy modal:** "personal circle pharmacy not on platform". Fields: Pharmacy Name*, Owner Name, Phone*, City, PIN Code, GST (optional) + Credit Settings (Limit/Days). On create: builds a `PharmacistProfile` id `pharma-circle-{ts}`, **`status:'approved'`, hardcoded `state:'Maharashtra'`, `pharmacyType:'retail'`**, calls `registerPharmacist` (which forces `status:'pending'`!) then `addCircleEntry` (auto-joins circle). **Note:** because registerPharmacist overrides status to 'pending', the new circle pharmacy is stored pending, but it still appears in the circle via the circle entry. Validation: name+phone required.

### 3.10 CreateOrder (`/stockist/orders/create`)
- Single-page order for a circle pharmacy. Inventory scoped to my stockist, in-stock, non-counterfeit.
- **Content:** "Record Offline Transaction" toggle, Select Pharmacy (search over circle), Add Items (search, max 8 shown, add/qty steppers), Selected Items list (qty steppers + **editable unit price** input), Summary (Subtotal / Tax 12% / Grand Total).
- **Logic:** offline toggle → status `confirmed` (deducts stock immediately) else `placed`. `orderType:'CIRCLE'`, `type:'stockist'`, `paymentStatus:'pending'`, discount 0. Batch pick = **FEFO** (future expiry, qty>0, non-counterfeit, earliest expiry first). tax `round(subtotal×0.12)`, per-item tax `round(itemTotal×0.12)`. Calls `validateStock` (blocks on error toast) then `createOrder` after 1500ms. **No credit-limit check.** Toast + → `/stockist/orders`.

### 3.11 QuickBill (`/stockist/quick-bill`) — WhatsApp→bill, 5-step
Steps: Paste Message · Review Items · Select Pharmacy · Edit & Add · Confirm Bill. Progress bars.
- **Step 0:** Textarea for WhatsApp text (placeholder sample). Parse button.
- **Parsing (`parseWhatsAppMessage`):** split by newline; quantity via regex `/(\d+)\s*(pcs?|tabs?|strips?|boxes?|nos?|qty|x|\*)?\s*$/i` (trailing) or leading variant; default qty 1; product name = line minus qty tokens and hyphens. `fuzzyMatch` = substring on name/genericName/first-word against **my** inventory. Filters items with rawText length >1.
- **Step 1 Review:** matched (green check) vs unmatched (amber) rows; unmatched get a `<select>` to manually map to a product; qty/price shown; remove.
- **Step 2 Select Pharmacy:** search over circle; select → step 3.
- **Step 3 Edit & Add:** edit qty/price per item; add more products (search my inventory). 
- **Step 4 Confirm:** bill-for card, items table, "Grand Total" **= subtotal WITHOUT tax** (display quirk). Create → 1500ms → build order (FEFO batch, per-item tax 12%, order tax 12%), status **`confirmed`** CIRCLE, `type:'stockist'`, then `generateInvoice(order.id)`. Toast → `/stockist/orders`.

### 3.12 DeliverySetup (`/stockist/delivery`) — fully wired
- **Service Areas:** list (name, pincode, active) with Enable/Disable (`updateDeliveryArea`) + Delete (`removeDeliveryArea`). Add form: Area name + Pincode → `addDeliveryArea` (real).
- **Delivery Slots:** list (label + start–end) + Delete. Add form: Label + Start time + End time → `addDeliverySlot` (real). Requires all fields non-empty.

### 3.13 HolidayManagement (`/stockist/holidays`) — fully wired
- Add Holiday: Date* (date), Reason (default 'Holiday'), "Accept Pre-orders" Switch → `addHoliday`. Validation: date required, must be today-or-future. Upcoming (sorted asc) + Past (last 5) sections; delete via `removeHoliday`. `preOrderEnabled` drives pharmacist-side badges only. `isStockistOnHoliday` matches **exact date === today**.

### 3.14 SubscriptionPage (`/stockist/subscription`)
- Reads current sub from `allStockists` (fallback default basic_100). 2 StatCards (Bills Used `{used}/{limit}`, Valid Until). Usage bar `usagePercent = round(billsUsed/billLimit×100)` (color ≥90 destructive / ≥70 warning / else primary), "{remaining} bills remaining".
- 3 hardcoded plans: Basic 100 ₹999, Standard 200 ₹1999, Premium 500 ₹4999 (feature lists). Current plan shows "Current Plan" disabled; others "Upgrade".
- **STUB:** Upgrade sets local `currentPlan` + toast only — **not persisted**.

### 3.15 Reports (`/stockist/reports`)
- Month (Jan–Dec, default March) + Year (2026/2025/2024, default 2026) selects; type chips (All/H1/HNX/GST/Sales).
- **7 hardcoded reports** (`r1..r7`): H1 Monthly, H1 Annual, HNX Drugs, HNX Annual, GST Sales, Monthly Sales, Stock Summary — each with badge, description, lastGenerated date.
- **STUB:** Download → toast only, no file generated.

### 3.16 Analytics (`/stockist/analytics`) — **ENTIRELY MOCK**
- Period select (This Week/Month/Quarter/Year — **inert**).
- 4 hardcoded KPIs: Total Revenue ₹1,78,000 (+14.8% up), Total Orders 68 (+8.2% up), Active Pharmacies 24 (+4.2% up), Collection Rate 87% (−2.1% down).
- Revenue Trend LineChart (hardcoded Oct–Mar). Order Status Distribution pie (hardcoded Delivered 45/Pending 12/Processing 8/Cancelled 3). Nothing driven by real data (contrast with StockistDashboard which is real).

### 3.17 StockistProfile (`/stockist/profile`)
- Status banner (approved/pending/other), avatar header (businessName, type badge, email, member-since).
- Section cards (all with Edit → `EditProfileModal`): Contact (contactPerson/phone/whatsapp/email), Business (name/type/years/drugLicense/gst/pan), Regulatory Documents (doc tiles → preview dialog with fileUrl image or FileText fallback), Office & Warehouse, Delivery Setup (days/slots/pincodes/radius), Business Rules (credit limit/days/min order/delivery charge label composed), Financial (account holder/bank/account/ifsc/upi).
- **STUB:** every section's `handleSave` = toast only — **edits discarded**. EditProfileModal fields per section are defined but not persisted.

### 3.18 BulkUpload (`/stockist/inventory/upload`) — **STUB (ignores file)**
- States: upload → validating (1500ms) → preview → confirming (2000ms) → done.
- File input accepts .csv/.xlsx/.xls but **file is never parsed**; injects hardcoded `mockParsedData` (6 rows, 2 with errors: missing name, missing batch). Preview table (Name/Generic/Manufacturer/Batch/Qty/MRP/Status). Confirm → done screen with Added/Failed/Skipped(0) counts + error list. **Writes NOTHING to AppState.**

### 3.19 PurchaseBills (`/stockist/inventory/bills`) — **STUB (ignores file)**
- Seeded with 2 mock bills (local state). Upload → Supplier Name field + file input (**file ignored**) → Process (2000ms) injects 3 hardcoded extracted items → Review (edit qty/price per item, total recalcs) → Confirm (1500ms) → prepends a mock Bill to local list + toast "inventory updated" (**no AppState write**). List rows: view (dialog with items) + delete (local). Bill statuses processed/processing/error.

### 3.20 BulkPriceUpdate (`/stockist/inventory/bulk-price`) — inline REAL, upload FAKE
- Modes: choose → inline / upload → compare → done. Seeds `changes` from `allInventory.slice(0,6)` (batches[0] prices).
- **Inline (REAL):** editable New MRP / New Sale per product; "Review Changes" → compare → Confirm applies `updateBatch({mrp,sellingPrice})` to **ALL batches of each changed medicine** (persisted).
- **Upload (FAKE):** file input ignored; `handleFileUpload` fabricates new prices via `Math.random()` (MRP ×(1+rand×0.1), Sale ×(1+rand×0.08)) → compare → confirm still persists via updateBatch. So upload "works" but with random prices.
- Done screen → View Inventory.

---


## 6F. MED money GST payment stock rules

## 7. Money, GST, Payment, Stock, Delivery-Fee Logic

### 7.1 Order status vocabulary
`orders.status` CHECK = `paid | accepted | packed | out_for_delivery | delivered` (default `paid`). `payment_status` CHECK = `paid | failed` (default `paid`). `payments.status` CHECK = `paid | failed` (default `paid`); `payments.mode` default `mock`. **Stockist advances** status forward-only; **pharmacy** can only jump to `delivered` via "Mark as Received" when status is `out_for_delivery`.

### 7.2 GST
- **Checkout / order storage:** per-line `gst_amount = price*qty*gst_percent/100`; per-stockist total = subtotal + Σ gst; stored on each `order_items` row (`gst_percent`, `gst_amount`). **No CGST/SGST split.** Missing gst_percent treated as 0 at checkout.
- **Bulk-upload margin & Custom Pricing:** GST modeled **on profit** (`profit*gst%/100`) for net-profit preview only — a different (and non-standard) GST semantics from checkout.

### 7.3 Payment (mock)
Simulated: 2s delay + `Math.random() > 0.05`. Writes real `orders`/`order_items`/`payments` rows with `MOCK-…` references. No gateway, UPI, or QR. `gateway_order_id`/`gateway_payment_id` schema columns exist; only `gateway_payment_id` gets a mock value.

### 7.4 Stock
- Checkout: `deduct_stock(product_id, quantity_to_deduct)` RPC per item (atomic per call). **NOTE:** `deduct_stock` is declared in `types.ts` (`Args {product_id, quantity_to_deduct}` → void) and called at runtime, but **no migration in the repo creates it** — it exists only in the live DB (created out-of-band). Untracked DB object.
- Bulk-upload: direct add/reduce/upsert (see §6.4). Inline stock editor and Edit Product also write `stock_quantity` directly.

### 7.5 Delivery-Fee engine (`useDeliveryFee` + `lib/distanceCalculator`) — DORMANT
- Priority evaluation over active `stockist_delivery_rules`: (1) `profit_amount` free if `orderProfit>=min`; (2) `order_amount` free if `orderTotal>=min`; (3) `delivery_date` free if scheduled; (4) `distance` fee `= round(max(0, dist−base)*perKm, 2)`; (5) `flat_fee`. No rules → free ("No delivery charges"). Missing pharmacy/stockist coords → "Location not available" and fee 0.
- Distance via **Haversine** (`R=6371km`, rounded 2dp) between `pharmacies.lat/lon` and `stockists.dispatch_lat/lon`.
- **`useDeliveryFee` is imported by nobody; checkout never applies a fee and never sets `orders.delivery_fee`.** The whole fee engine + `DeliveryRulesConfig` config screen currently affect **nothing**. Coordinates also have no UI to be captured (LocationInput unused; profiles don't collect lat/lon). Effectively fully dormant.

### 7.6 Revenue / spend
Stockist Revenue and Pharmacy Spent = Σ `orders.total_amount` for current calendar month (from 1st @ 00:00 local).

---

## 4B.18 MED Bulk upload OCR engine

## 6. Bulk-Upload / OCR Engine (deep dive)

**Modes (tabs):** `purchase | sale | catalogue`. File intake: catalogue accepts `.xlsx/.xls/.csv`; purchase/sale accept those **plus** `.jpg/.jpeg/.png/.pdf`. **Max 10 MB** (else toast). Invalid ext → toast.

### 6.1 Spreadsheet path (`processExcelFile`)
- CSV: `file.text()`, split lines, `split(',')` (naive — breaks on quoted commas), first line lowercased headers.
- Excel: dynamic `import('xlsx')`, first sheet, `sheet_to_json({header:1})`, lowercased headers.
- Column aliases: `stock quantity`/`quantity`; `purchase price`; `sale price`; `mrp` (default `salePrice*1.1`); `gst %`/`gst` (default 18); `brand`; `category`; `type`→product_type; `manufacturer`; `generic name`/`salt`; `pack size`; `strength`; `moq` (default 1). Row kept only if `product name` present AND `quantity>0`.
- Matches each item against existing products by **case-insensitive exact name** → status `found` (+ `existingProductId`, `isNew:false`) else `new`.
- Progress: 20 → 50 (parsing) → 80 (validating) → 100. Empty file / no valid rows → thrown errors surfaced as toast.

### 6.2 Image/PDF path (`processImageOrPdfFile`)
- Uploads to Storage bucket **`bills`** at `${stockistId}/${Date.now()}_${file.name}` (progress 15). Creates **signed URL (900s)** (progress 40). Calls **`extract-bill-items {imageUrl, mode}`** (progress 70).
- Matches extracted item names to existing products by **substring (either direction)** (progress 100):
  - **found:** use existing product's name/sale_price/gst; qty & purchase price from bill.
  - **purchase + not found:** call **`fetch-product-info {product_name}`**; new item with `sale_price = price*(1+defaultMargin/100)`, gst 18, moq 1, `aiEnhanced=!!aiData`, status `new`. **BUG:** reads `aiData?.type` but the function returns `product_type` → product type never fills from AI; the rest (`brand`, `manufacturer`, `category`, `generic_name`, `pack_size`, `strength`) do map since the function returns those keys.
  - **sale + not found:** status `error`, `errorMessage:'Product not found in catalogue'`.

### 6.3 Margin / preview / commit
- **`MarginSettingsModal`:** Margin % input (default = stockist default), live preview (₹100 example → sale price), "Save as my default margin" checkbox (updates `stockists.default_margin_percent`). Apply → `applyGlobalMargin(m)`.
- **`applyGlobalMargin(m)`:** for items with purchase_price: `sale = purchase*(1+m/100)`; `profit=(sale-purchase)*qty`; `gstAmount = profit*gst%/100` (**GST modeled on profit here**); `netProfit = profit-gstAmount`; sets `margin_percent`.
- **`BulkUploadPreview`:** summary tiles — **Ready to Upload** (`status!='error'` count), **Errors**, **AI Enhanced**, and (purchase mode) **Total Net Profit** (`Σ net_profit`). Table cols: Product Name (+ "AI" badge, + error text), Qty, and (non-sale) Purchase/Sale/**Profit(=net_profit)**, Status badge (✓ Found / + New / ✗ Error). Scrollable, sticky header.
- **Save as Draft:** insert `bulk_upload_drafts {stockist_id, mode, items(JSON), margin_percent:defaultMargin, file_name}`; navigate to products.
- **Confirm Upload:** filter out `status==='error'`, call **`bulk-upload-commit {stockistId, mode, items}`**; toast `Uploaded {successCount} products`; navigate.
- **Download Template (catalogue):** CSV with headers `Product Name,Brand,Category,Type,MRP,Purchase Price,Sale Price,Stock Quantity,HSN Code,GST %,Pack Size,Strength,MOQ` + one sample row. **`HSN Code` has no matching DB column** (never persisted).
- **`DraftCard`:** file name, mode badge (Purchase/Sale/Full Catalogue), item-count badge, saved timestamp, Resume + Delete (trash).

### 6.4 `bulk-upload-commit` (edge fn — no AI, **explicit in-code JWT check**)
- Requires `Authorization` header; verifies via service-role `auth.getUser(token)` (401 otherwise). Validates `{stockistId, mode, items[]}` (400 otherwise). **Does NOT verify the caller actually owns `stockistId`** — any authenticated user could commit to an arbitrary stockist id (service-role bypasses RLS). Security gap.
- Per item by mode:
  - **purchase:** `isNew` → insert new product (`mrp=mrp||sale*1.1`, `gst=gst||18`, `moq=moq||1`, `is_active:true`); else fetch current stock and **ADD** `stock_quantity += quantity`, update purchase/sale price.
  - **sale:** requires `existingProductId` (else error "Product not found in catalogue"); **REDUCE** `stock = max(0, current − quantity)`.
  - **catalogue:** `upsert` on conflict `(stockist_id, product_name)` with full field set (uses `item.existingProductId` as `id` when present).
- Returns `{success:true, successCount, errorCount, errors:errors.slice(0,10)}`.

---


## 6G. DSW status vocabularies

## 9. MONEY, GST & STATUS VOCABULARIES (as coded)

- **GST inconsistency:** Stockist `OrderDetail` & `CreateOrder` & `QuickOrderDialog` hardcode **18%** (`subtotal*0.18`) ignoring per-product `gstRate` (5/12 in data). Stockist `CreateBill`/`QuickBillDialog`/`BillPreviewDialog` use the pre-computed per-order `gstAmount` (which itself was per-product in the mock data). Pharmacy `Checkout` applies **18%** + ₹0 delivery. `AcceptOrderDialog` recomputes item GST at **12%**. Patient/sale order objects carry `subtotal/deliveryFee/discount/total` with **no GST line**. Net effect: on stockist OrderDetail the shown Subtotal + GST(18%) generally does NOT equal the shown Total.
- **Delivery fee:** stockist Stockist.deliveryFee (0 → "Free Delivery" badge); pharmacy order `deliveryFee` field ("Free" when 0); pharmacy Checkout hardcodes 0; patient generator `subtotal>=500?0:40`; sale `liveSettings.deliveryFee` editable.
- **Order status vocabularies differ by module:**
  - Stockist `Order`: `pending|confirmed|processing|out-for-delivery|delivered|cancelled`; payment `unpaid|partial|paid`; source `platform|direct|whatsapp|phone|walk-in`; payment-approval `pending|approved|rejected|on-hold`; incoming `new|accepted|declined|modified`.
  - Pharmacy purchase `PharmacyOrder`: `placed|confirmed|processing|shipped|out_for_delivery|delivered|cancelled|returned`.
  - Sale `SaleOrder`: `pending|confirmed|preparing|out_for_delivery|delivered|cancelled`.
  - Patient `PatientOrder`: `placed|confirmed|processing|out_for_delivery|delivered|cancelled`.
  - Consultations: `scheduled|in_progress|completed|cancelled` (doctor adds `no_show`; type `video|voice`, doctor interface also declares `in_person` never produced).
- **No money ever moves, no order/record is ever written.** Every settle/approve/collect/checkout/book/withdraw/upload/download is a toast and/or local component state (reset on reload).

---

## 10. CONSOLIDATED STUB / HARDCODE INVENTORY

- **Simulated AI:** stockist CreateOrder & QuickOrderDialog (regex + "AI Parsing" badge), pharmacy SmartOrder & SmartOrderDialog (`setTimeout` + regex + ×1.05/×1.1 multipliers), Products "AI Enhance" (double toast), OCRScanDialog/ScanProductDialog/BulkUploadDialog (setTimeout mock extraction), UploadPrescriptionDialog ("AI will extract" — not implemented).
- **Simulated voice:** StartConsultation page, StartConsultationDialog, RecordPatientDialog — all `setTimeout(3000)` → hardcoded transcript.
- **Hardcoded KPIs/deltas:** stockist Home todaysCollection 45000; pharmacy Home all 4 KPIs; patient Dashboard 4 KPIs + refill reminders; doctor Patients "50" + "+12%"; doctor Earnings This-Month block; doctor Bank balances (12,500/3,200); admin all KPIs (platformStats) + growth "+15%"; admin sidebar badges 3/5/4 + bell 12; various More badges (stockist 3/5, pharmacy 4/2/3, patient 2/3, doctor 5); TopNav 2/3, PatientTopNav 3, DoctorTopNav 2/5; analytics chart series; AppSettings storage 12.5/50.
- **Page-local arrays bypassing shared mock modules:** pharmacy Stockists/Cart/Orders; patient OrderDetail/ConsultationDetail/Consultations/Wishlist; all four admin per-role pages; admin UserDetail (3 synthetic keys); stockist PharmacyDetail ledger; stockist operational pages (Credit Notes/Routes/Purchase Orders/Staff/Reports/Documents/Messages/Notifications).
- **Detail pages ignoring `useParams().id`:** patient OrderDetail (ORD-P-001), patient ConsultationDetail (CONS-001).
- **Genuinely functional bits:** Install page (`beforeinstallprompt`, iOS/standalone detection); `wa.me` shares (CreateBill, QuickBillDialog, SharePaymentLinkDialog); `tel:`/`maps.google.com`/clipboard actions; GuidedTour + `localStorage` tour flag (only persistence); several list pages' local mark-read/delete/add-remove operations (reset on reload); real filter/sort/search on many lists.

*End of review. Sources read in full: `src/App.tsx`, `src/main.tsx`-level providers, `src/contexts/PharmacyViewContext.tsx`, all `src/components/layout/*`, all `src/data/*`, every page under `src/pages/**`, and every dialog/component under `src/components/{stockist,pharmacy,patient,doctor}/**`, plus `vite.config.ts`, `tailwind.config.ts`, `GuidedTour.tsx`.*

---
---

# EXPANDED APPLICATION DOCUMENTATION (Parts 1–8)


## 4B.19 DMVP StockistOrderDetail lifecycle

# Digi Swasthya (B2B MVP) — EXHAUSTIVE Functional Review

> App path: `/Users/kshipradewat/Desktop/stockpharma/digiswasthyamvp`
> In-product name: **Digi Swasthya** ("B2B Pharma Supply Chain Platform"; "A brand of Chameleon - The Agency (OPC) Pvt Ltd."). Interactive demo.
> Stack: Vite + React 18 + TS, shadcn/Radix/Tailwind, React Router v6, TanStack Query v5, a **hand-rolled mock `supabase` client** over static seed data, Recharts, jsPDF + html2canvas, xlsx, qrcode.react, date-fns, sonner. Deno edge functions exist but are unreachable at runtime.

This review is derived by reading every source file. It supersedes `FEATURES.md` in depth and corrects several of its claims against the actual seed data and code. Where a behaviour is a **no-op / stub / dead / bug**, it is flagged inline.

---

## PART A — GLOBAL ARCHITECTURE

### A1. The mock Supabase client (`src/integrations/supabase/client.ts`) — governs everything
The exported `supabase` is NOT `createClient`; it is a hand-written object. Behaviour, verified line by line:

- **`from(table)` → `MockQueryBuilder`.** Backed by `TABLE_DATA` (a `Record<string, any[]>`) mapping 21 table names to in-memory arrays.
- **Reads** apply chained filters via `applyFilters`: supports `eq, neq, in, gte, gt, lte, lt, like, ilike, is(null), not("col","is",null), order, limit, range`.
  - `like/ilike` strips `%` and does case-insensitive `includes`.
  - `order` sorts with `<`/`>` comparison (works for ISO date strings & numbers).
  - `range(from,to)` = `slice(from, to+1)`.
- **No-op / partial query methods (CRITICAL):** `or()`, `contains()`, `containedBy()`, `textSearch()`, **`filter()`** all `return this` and apply **nothing**. `match(obj)` is the only one that works (maps to `eq`).
  - Consequence 1 — **`.or(...)` returns the entire table unfiltered.** Visible in `PeerChatPage.loadMessages` → shows all 3 peer messages regardless of the two participants.
  - Consequence 2 — **`.filter(col,op,val)` is ignored.** `usePaginatedQuery` builds its query with `.filter(...)`, so **`StockistOrders` never actually filters by `stockist_id`** — its paginated list returns ALL orders across every stockist (then client-side search/tab narrow only the current page).
- **Joins:** `resolveJoins` handles nested `select("*, table(cols)")` via a small `JOIN_MAP` covering only: `orders → pharmacy_profiles/stockist_profiles`, `order_items → products`, `bills → pharmacy_profiles/stockist_profiles`, `stockist_pharmacy_circle → pharmacy_profiles/stockist_profiles`, `product_batches → products`. Any other join (e.g. `orders → delivery_staff(name)` in `StockistPayments`, `order_items → orders(...)` in `SharedProductDetail` sales chart, `order_returns → products/orders`, `conversations → chat_messages`) resolves to `undefined`/absent → those features render empty.
- **Mutations DO NOT PERSIST.**
  - `insert`/`upsert` → echo payload back with generated `id = demo-{Date.now()}-{rand}` and `created_at`. Returns single object if input was single, array otherwise.
  - `update` → returns `{...row, ...updateData}` for filtered rows but never writes to the backing array.
  - `delete` → returns `{data:null, count:0}`, deletes nothing.
  - Net effect: actions "succeed" and toast, but state persists only where the component also mutates local React state / React-Query cache.
- **RPC (`MockRpcBuilder`):** hardcodes `check_login_rate_limit → true`, `record_login_attempt → null`, `has_role → true`; **everything else → `{data:null}`** (i.e. `decrement_stock`, `deduct_product_stock`, `restore_product_stock`, `update_circle_outstanding`, `admin_override_order_status`, etc. are all no-ops).
- **Edge functions:** `functions.invoke(...) → {data:null, error:null}` ALWAYS. So every AI feature returns null.
- **Storage (`MockStorage`):** `upload → {path:"demo/{ts}"}`; `createSignedUrl → "https://placeholder.com/demo-file.pdf"`; `getPublicUrl → "https://placeholder.com/{path}"`; `remove → null`.
- **Auth (`MockAuth`):** `getSession → {session:null}`; `getUser` reads `localStorage["demo_role"]` → `DEMO_USERS[role]`; `signInWithPassword/signUp/signOut/resetPasswordForEmail/updateUser` all resolve success with canned data (so "wrong current password" can NEVER fail); `onAuthStateChange` returns a dummy unsubscribe.
- **Realtime (`MockChannel`):** `channel().on().subscribe().unsubscribe()` all no-ops. `removeChannel` no-op.

### A2. Seed data (`src/lib/dummy-data.ts`) + synthesized tables (`client.ts`)
- `DEMO_USERS`: 3 (stockist `s-user-001`/Rajesh Kumar, pharmacy `p-user-001`/Anita Sharma, admin `a-user-001`/Platform Admin).
- `DEMO_STOCKIST_PROFILE` = `sp-001` (MedSupply India Pvt Ltd, Jaipur, PAN ABCDE1234F, HDFC bank, upi rajesh@upi, approved). Plus `sp-002` PharmaCorp (approved), `sp-003` LifeCare (approved), `sp-004` MedWholesale (**pending**). Total 4 stockists.
- `DEMO_PHARMACY_PROFILE` = `pp-001` (HealthPlus Pharmacy, Jaipur 302001, ICICI, approved; carries `min_order_amount:500`, `minimum_order_amount:500`, `delivery_fee:50`, `free_delivery_above:2000`, `operating_hours:{}`). Plus `pp-002` City Care (approved), `pp-003` MedLife (approved), `pp-004` Apollo Medical (approved), `pp-005` Wellness (**pending**). Total 5 pharmacies.
- `DEMO_PRODUCTS`: 12 products. `prod-001..008` belong to `sp-001`; `prod-009,010` to `sp-002`; `prod-011,012` to `sp-003`. Each has mrp/sale_price/price/purchase_rate, stock_quantity, min_stock_level, gst_rate ("5%"/"12%"), hsn_code, drug_type "Allopathy", drug_schedule ("OTC"/"H"), batch_number, expiry_date, `moq`, `min_order_quantity`, `reserved_quantity:0`, `requires_prescription`, `is_narcotic:false`, `image_url:null`. Notable: `prod-004` Metformin stock 15 (< min 50 → low), `prod-007` Azithromycin stock 8, expiry **2025-04-30** (already past "today" 2026-07 → expired), `prod-012` Montelukast expiry 2026-04-10.
- `DEMO_ORDERS`: 8 orders. **Statuses actually present: `delivered`(ord-001,005), `processing`(ord-002), `pending`(ord-003,008), `confirmed`(ord-004), `cancelled`(ord-006), `dispatched`(ord-007).** `order_source` values present: `platform`, `whatsapp_parse`. `payment_status`: paid/unpaid. Some carry `delivery_payment_status:"collected"`, `delivery_payment_method:"upi"/"cash"`.
  - ⚠️ `"confirmed"` and `"processing"` and `"whatsapp_parse"` are NOT in the app's canonical vocab (`statusFlow`, ORDER_STATUS_LABELS, or the `order_source` enum), producing edge-case rendering (see §3.5, §3.4).
- `DEMO_ORDER_ITEMS`: 8 items, only for ord-001, ord-002, ord-003. Other orders have no items → detail pages show "No items."
- `DEMO_BILLS`: 5 bills. **Statuses present: `paid`(bill-001,002), `draft`(bill-003,005), `sent`(bill-004).** Carry `subtotal`, `gst_amount`, `discount_type`/`discount_value`, `total_amount`, `due_date`.
  - ⚠️ No bill has status `confirmed`/`final`/`finalized`, so the badge highlight logic across the app never matches seed bills (see §Bill vocabulary).
- `DEMO_PAYMENTS`: 4 payments. Methods present: `upi`, `cash`, **`neft`**, `cheque`. Statuses confirmed/pending. (`neft` is not in any payment-method picker.)
- `DEMO_CIRCLE`: 4 rows, ALL for `sp-001` (cir-001 pp-001 limit 50000/out 4839/credit_balance 45161; cir-002 pp-002 30000/9990; cir-003 pp-003 25000/3250; cir-004 pp-004 40000/0). `payment_terms_days`, `is_blocked:false`, `notes`, `last_payment_date`.
- `DEMO_NOTIFICATIONS`: 8 (types order/payment/**stock**/bill/approval — note `stock` type has no icon mapping in StockistNotifications so falls back to Bell). `DEMO_MESSAGES`: 3. `DEMO_SERVICEABLE_AREAS`: 5 PINs, all `sp-001` (302001,302005,302017,342001,313001).
- Synthesized in client.ts: `DEMO_PROFILES` (6), `DEMO_USER_ROLES` (7), `DEMO_LOGIN_ACTIVITY` (3, all success), `DEMO_PEER_MESSAGES` (3), `DEMO_PRODUCT_BATCHES` (3 — pb for prod-001×2, prod-002×1), `DEMO_PRODUCT_MEDIA` (empty), `DEMO_CONVERSATIONS` (1, for s-user-001), `DEMO_CHAT_MESSAGES` (2), `DEMO_BILL_ORDERS` (2: bill-001↔ord-001, bill-002↔ord-005), `DEMO_ORDER_STATUS_HISTORY` (3), `DEMO_LOGIN_ATTEMPTS` (**empty**).
- Charts: `DEMO_MONTHLY_TREND` (6 months orders/revenue), `DEMO_ADMIN_GROWTH` (6 months users).

### A3. Auth / identity (all fake)
- `useDemoAuth` (`DemoAuthProvider`): stores `role` in `localStorage["demo_role"]` (default `"pharmacy"`), exposes `{role, user (=DEMO_USERS[role]), setRole, signOut}`. `signOut` clears the key and hard-navigates to `/`.
- `useAuth`: parallel hook returning `{user, roles:[role], loading:false, profile, signOut}` from the same key. `AppRole = admin|stockist|pharmacy`. Demo users/profiles hardcoded inline.
- `useStockistProfile` → always `DEMO_STOCKIST_PROFILE` (`sp-001`), `isLoading:false`. `usePharmacyProfile` → always `DEMO_PHARMACY_PROFILE` (`pp-001`). So the "current" stockist is permanently sp-001 and pharmacy permanently pp-001, regardless of which demo user "logged in."
- **No route guards.** Any panel/URL is reachable directly. No session timeout.

### A4. Routing (`src/App.tsx`)
- `BrowserRouter`; lazy pages wrapped in `SuspenseWrap` (ErrorBoundary + Suspense spinner). Global QueryClient: `staleTime 60000`, `gcTime 300000`, `refetchOnWindowFocus:false`.
- Theme init on module load from `localStorage["theme"]` (dark / system→matchMedia / else light).
- Three layout wrappers inject nav + hardcoded names into `AppLayout`:
  - `StockistLayout` — businessName = `DEMO_STOCKIST_PROFILE.business_name`, userName **"Rajesh Kumar"**.
  - `PharmacyLayout` — pharmacy_name, userName **"Anita Sharma"**.
  - `AdminLayout` — businessName **"Digi Swasthya"**, userName **"Platform Admin"**.
- **Route table (exhaustive):**
  - Public: `/` (DemoHome), `/verify-bill/:billId` (VerifyBill), `/login`→Navigate `/`, `/register`→Navigate `/`, `*`→NotFound.
  - `/stockist` (index=Home) + `products`, `products/add`, `products/:id`, `products/:id/edit`, `orders`, `orders/create`, `orders/:id`, `pharmacies`, `pharmacies/find`, `pharmacies/:id`, `pharmacies/:id/ledger`, `more`, `payments`, `profile`, `business`, `settings`, `help`, `notifications`, `privacy-security`, `serviceable-areas`, `export-catalogue`, `bill-history`, `bulk-bill`, `chats`, `chat/:peerId`, `messages`. (27 routes)
  - `/pharmacy` (index=Dashboard) + `orders`, `orders/quick`, `orders/:id`, `stockists`, `stockists/find`, `stockists/:id`, `browse`, `more`, `profile`, `business`, `notifications`, `payments`, `help`, `privacy-security`, `settings`, `quick-order-history`, `ledger/:stockistId`, `chats`, `chat/:peerId`, `messages`. (21 routes)
  - `/admin` (index=Dashboard) + `pharmacies`, `pharmacies/:id`, `stockists`, `stockists/:id`, `orders`, `orders/:id`, `more`, `bills`, `payments`, `users`, `notifications`, `settings`, `messages`, `messages/:userId` (=ChatPage), `profile`, `help`, `login-history`. (18 routes)
- **DEAD / unreachable pages** (exist but no route, since `/login`&`/register` redirect to `/`): `Login.tsx`, `Register.tsx` + `StockistRegistration`/`PharmacyRegistration`, `ForgotPassword.tsx`, `ResetPassword.tsx`, `PendingApproval.tsx`, `Index.tsx` (a leftover "Welcome to Your Blank App" placeholder). Also many `More`-menu targets are unrouted (see §3.15).

### A5. Shared chrome
- **`AppLayout`**: OfflineBanner + TopNav + `<Outlet>` (main, `pb-20`) + BottomNav. Calls `useRealtimeNotifications()` (a literal no-op `() => {}`). Unused `Button`/`RefreshCw` imports (dead).
- **`TopNav`**: logo (Pill) → navigates `/`; business/owner name; chat button (bell → `notifications`), chat icon → `/admin/messages` for admin else `{base}/chats`. **Hardcoded badges: chat "1", bell "2"** (always). Avatar → `profile`.
- **`BottomNav`**: role tabs. Stockist: Home/Products/Pharmacies/Orders/More. Pharmacy: Dashboard/Orders/Stockists/More. Admin: Dashboard/Pharmacies/Stockists/Orders/More. Active state by path prefix.
- **`OfflineBanner`** + `useOfflineDetector` (navigator.onLine + online/offline events): fixed destructive banner when offline. No offline mutation queue.
- **`MenuPage`** (More hub): avatar header, optional search filter over item title/description, sections of items, red Logout button (`signOut()` then `navigate("/login")` — which redirects to `/`), footer **"Digi Swasthya v1.0.0"** (note constants say `APP_VERSION="2.0.0"` — mismatch).
- **`KpiCard`**, **`QuickActions`**, **`EmptyState`**, **`PaginationControls`** (hidden when totalPages≤1), **`BackButton`**, **`Spinner`** — presentational helpers.
- **`SharedProductCard`**: computes `stockQty = stock_quantity ?? quantity ?? 0`, `salePrice = sale_price ?? price ?? 0`, `isExpiringSoon = expiry < now+90d`, `isExpired = expiry < now`, `margin = round((sale−purchase)/sale×100)`. Badges: Out of Stock, Rx (requires_prescription), Hidden (pharmacy + `is_visible_to_customers===false`), Narcotic. Shows purchase rate+margin (stockist/pharmacy/admin), stock qty, up to 3 active batches +"+N more", admin sourceLabel, customer add-to-cart controls (role "customer" only — never used).
- **`SharedProductDetail`** (used by StockistProductDetail via 7-line wrapper `role="stockist"`, and AdminStockistDetail cards use `SharedProductCard role="admin"`): loads product, `product_media` gallery, batches (stockist only), and a **6-month sales chart** from `order_items` join `orders` (the join resolves via JOIN_MAP for order_items→products but NOT order_items→orders, so `item.orders` is undefined → chart always "No sales data yet"). Clone → inserts `{...product} name+" (Copy)"`; Delete → `confirm()` + delete (no-op) + navigate. Batch pricing table, InfoRows, total stock value = Σ activeBatch.stock×purchase_rate.

## 4B.20 SP Stockist panel (complete)

## 2. STOCKIST PANEL

Shell `MainLayout`. Sidebar groups (Sidebar.tsx): **[Dashboard]**; **Operations**: Pharmacies, Incoming Orders (badge = live incoming count, path `/orders?source=pharmacy&status=pending`), Orders, Bills, Payments, Returns; **Inventory**: Products, Purchases (`/purchase-bills`), Suppliers, Required Stock, Reports; **Admin (adminOnly)**: Audit Logs, Settings. Footer = user chip + logout. Mobile `BottomNav`: Home / (Incoming when count>0) / Orders / Pharmacies / Bills + "More" sheet (all modules, admin-gated). Header: product search (Enter→`/products?search=`), notification bell (alerts: incoming orders, pending connection requests, low-stock, overdue bills + event history + "Sync now"), profile menu (Settings admin-only, Sign out).

### 2.1 Dashboard (`/dashboard` → `reportService.getDashboardKpis`)
- **Controls:** KPI period date-from/date-to (default month-to-date). On first load, if `user && !onboardingCompleted && role==='admin'` → opens `OnboardingFlow`.
- **KPIs (StatCards):** Today's Sales (Σ `orders.total` where orderDate=today); Period Sales (Σ total in range); **Total Outstanding (admin only)** (Σ `pharmacies.outstanding`); Awaiting Pack = `packBacklogOrders` (pending AND (source≠pharmacy_submitted OR approvedAt not null)) → `/orders?status=pending`; Incoming Portal = `incomingPortalOrders` (pharmacy_submitted + pending + approvedAt IS NULL) → incoming filter; Active Connections (status='active') → `/settings?tab=connections`; Low Stock Items = count of products with Σ non-expired on-hand `< minStockLevel` → `/required-stock`; Overdue Bills = `buildOverdueBillFilter` count → `/bills?status=overdue`.
- **Widgets:** `IncomingOrdersWidget` (5 latest pharmacy_submitted+pending, click→order); Recent Orders (5 latest, badge); Low Stock (5, click→product).
- **Quick actions:** New Order (admin), Review Incoming, Record Payment (`/payments?record=1`), Add Purchase, View Reports.

### 2.2 Onboarding (`dashboard/OnboardingFlow.tsx`, SlideOver, 4 steps)
Steps: **Business Profile** (fields: DL required, GST optional [validated if entered], Registered Address textarea → saved as `addressJson.line1`; persists via `PATCH /settings/tenant` + `PATCH /settings/onboarding`), **First Pharmacy** (gate: `hasPharmacy` else blocks Next), **Import Products** (gate: `hasProducts`), **Add Staff** (`hasStaff` = >1 user; complete). Dismiss/X/backdrop = best-effort save + persist step **without** completing. Server `PATCH /settings/onboarding` enforces min-setup gates (see §2.11).

### 2.3 Pharmacies (`/pharmacies`, `/pharmacies/:id`) — `routes/pharmacies.ts`
**List:** search (name/phone/gstin/dl), Portal filter (All/Connected/Manual → `portalConnected`), Status filter (active/inactive/blocked), Add Pharmacy. Columns: Pharmacy(name+address) · Contact(person+phone) · Outstanding (red if >0) · Portal badge · Status badge. Mobile cards.
**AddPharmacyModal (SlideOver):** Pharmacy Name*, Owner/Contact Person, GSTIN, State Code (default 08), **Drug License (DL)\***, Credit Limit, Opening Balance, Payment Terms (COD/7/15/30), Phone*, Email, Address textarea. Client-validates phone/state/gstin/email; `normalizePhone`. `POST /pharmacies` (admin). **EditPharmacyModal** mirrors (PATCH).
**Server (`PharmacySchema`):** name≥2, contactPerson default 'Contact', phone≥7, email optional, address default, stateCode, gstin/dlNumber optional, creditLimit default `DEFAULT_CREDIT_LIMIT=50000`, paymentTermsDays 30, status active, openingBalance 0. Create/edit require admin.
**Detail page:** header actions Edit / Deactivate↔Activate (Deactivate uses ConfirmDialog) / Record Payment. StatCards: Outstanding, Total Orders, Credit Limit, Payment Terms. Sidebar: Business Profile (contact/phone/email/address) + Compliance & Billing (DL/GSTIN/state/opening balance). **Tabs:** Orders (list→order), Bills (unpaid), **Ledger** (opening balance row + Sundry Debtors partner lines with running balance; shows discrepancy banner between computed vs stored `outstanding`; admin "Reconcile Outstanding" → `POST /:id/reconcile-outstanding` recomputes from ledger), Returns, Connection (portal-connected only; shows pharmacyTenantId).
**Endpoints:** list; `:id`; `:id/orders`; `:id/bills` (`?unpaidOnly`); `:id/outstanding-bills`; `:id/credit-info` (uses `getPharmacyExposure`); `:id/returns`; `:id/ledger`; `POST /` (admin); `PATCH /:id` (admin); `POST /:id/reconcile-outstanding` (admin).

### 2.4 Products & batches (`/products`, `/products/:id`) — shared `routes/products.ts`
**List (`ProductListPage`, panel-aware):** search (name/generic/hsn), category filter (from `/products/categories`), Add Purchase (stockist admin/biller → `UploadBillModal`), Bulk Update, Add Product, Export (admin → `/products/export` CSV). Columns: Product(name + hsn/manufacturer, low-stock ⚠) · Category · Stock (red if ≤min) · MRP · GST. Cashier (pharmacy) hides MRP/GST columns.
**Server list:** `currentStock` = correlated subquery **summing only non-expired batches** (`expiry_date > CURRENT_DATE`); filters `isActive` unless `includeInactive`; category; search. `export=1` admin-only up to 50 000 rows; `truncated` flag when >pageSize.
**AddProductModal (SlideOver):** Product Info — Name*, Generic Name, Manufacturer (datalist of existing), Category (select from categories or free text)*, HSN, Schedule (NONE/H/H1/X/NDPS), Pack Size, Conv. Factor, Base Unit (Tab), Sale Unit (Strip), Scheme Base, Scheme Bonus, GST Rate (0/5/12/18/28), Status; Pricing — MRP*, Purchase Rate*, Sale Rate*; Inventory — Min Stock Level. Client `validateHsn` (4–8 digits) + `validateProductPrices` (purchase≤MRP, sale≤MRP, sale≥purchase). **EditProductModal** = same minus scheme/units/status.
**Server `ProductSchema`:** name≥2, category, scheduleType, packSize coerce>0 default 1, baseUnit/saleUnit defaults, convFactor default 10, gstRate 0–28 default 12, mrp/purchaseRate/saleRate positive, minStockLevel default 10, isActive default true. On create/update by a **stockist** → `pushCatalogToActiveConnections(tenantId,[id])` background (re-syncs all active connection catalogs + public catalog). Pharmacy create/update do not push.
**AdjustStockModal (SlideOver):** Batch select (shows on-hand + expiry + EXPIRED/xd-left), signed Quantity Change (+/−, non-zero), Reason (damaged/expired/cycle_count/lost/other) — **must be actively chosen**, Notes. Projects `currentOnHand → projected`. Server `adjust-stock` (`sharedProductAdjust`): existing batch only; **stockist requires `sourcePurchaseId`**; newOnHand≥0; **newOnHand ≤ qtyReceived (C25)** — cannot inflate stock beyond historical receipt; writes `stock_movements` reason `adjustment`, never mutates `qtyReceived`.
**BulkPriceEditModal (SlideOver):** downloads `/products/export` as CSV template (id/name/mrp/purchaseRate/saleRate), re-upload; client parses (`parseCsvLine`), requires `id` column, PATCHes each row; shows per-row failures.
**Detail page:** KPI cards (Current Stock+baseUnit, Min Level, MRP [hidden for cashier], HSN). Tabs: **Product Info** (Details/Categorisation + Rates & Taxes [MRP/PTR/Purchase/GST]) and **Batches (n)** (Batch #, Expiry with tier badge, Qty On Hand, MRP, Purchase Source→purchase bill link or "Direct Entry"). Actions: Adjust Stock (admin, or pharmacist on pharmacy), Edit (canWriteProducts).
Other endpoints: `/:id/batches` (order by expiry asc); `POST /from-catalog/:catalogItemId` (pharmacy-only — resale saleRate defaults to MRP not cost).

### 2.5 Orders (`/orders`, `/orders/create`, `/orders/:id`) — `routes/orders.ts` + `orderService.ts`
**State machine:** `pending → packed → shipped → delivered`, plus `cancelled`. Source `stockist_created | pharmacy_submitted`. Synthetic list filter **`approved`** = pending AND approvedAt not null; `pending` for pharmacy_submitted **excludes** approved-but-unpacked (`isNull(approvedAt)`).
**List:** filters search, Pharmacy, dateFrom/dateTo, Source (All/Pharmacy Portal/Manual), Status (pending/approved/packed/shipped/delivered/cancelled). Inline **Approve** button (admin only) for pharmacy_submitted+pending+!approvedAt → `ApprovePharmacyOrderModal`. New Order (admin) → create page. Columns: Order# · Pharmacy · Source badge · Date · Status · Total · Actions.
**CreateOrderPage (admin only route):** sessionStorage draft (`stockist:createOrderDraft`) auto-restore/save. Left: line table (product select showing stock, Qty [capped to stock with toast], Rate editable, GST% display, Amount, delete). "Paste Order" WhatsApp parser (regex `^(name)[sep](x?)(qty)(unit)?$`, fuzzy match exact→contains→token). Right: Select Pharmacy (active only), **live credit widget** for credit mode (exposure/limit/headroom, red if exceeds), Order Date, Payment Mode (credit/cash), Notes, GST summary (client `computeGst` seller=tenant.stateCode vs buyer=pharmacy.stateCode → CGST/SGST or IGST), Grand Total. Actions: Draft Print, **Save as Pending**, **Create & Pack** (create then finalize). Blocks submit if exceeds credit or credit still loading.
**`createOrder` (server, admin):** prices each line at product `saleRate`, `computeGst` per line, `placeOfSupply=pharmacy.stateCode`, `isInterstate` from tenant vs pharmacy state; order number `ORD-YYYY-####` with **3-attempt collision retry**; for **credit** mode: pharmacy must be `active` (`PHARMACY_INACTIVE`), and `creditLimit>0` → refuse if `exposure+total > limit` (`CREDIT_LIMIT_EXCEEDED`). Batch auto-picked for display only.
**`finalizeOrder`/`finalizeOrderCore` (POST /:id/finalize, admin):** transaction — must be `pending`; pharmacy_submitted requires `approvedAt`; re-check credit (exclude self); **reserve stock FEFO** per line (`reserveStock`) rolling back all reservations on `InsufficientStockError`; sets first consumed batchId onto order item; status→`packed`; portal → emit `order.packed`; credit → `pharmacies.outstanding += total`; **post sales ledger** (credit: Debtors Dr / Sales Cr + CGST/SGST or IGST Cr; cash: Cash Dr / Sales Cr + taxes); then **generateBill** if `pharmacy_submitted || credit`.
**Ship (POST /:id/ship, admin):** requires `packed`; conditional UPDATE to `shipped` with carrier/awb/shippedAt; **generates bill (idempotent)** for portal/credit; emits `order.shipped` with carrier/awb/shippedAt. `ShipOrderModal`: Carrier (optional), AWB (optional).
**Deliver (POST /:id/deliver, admin):** requires `packed`/`shipped`; **portal orders require an existing bill** else `BILL_REQUIRED`; status→`delivered`; emits `order.delivered`. `RecordDeliveryModal` (SlideOver): read-only item table (product/qty/batch), "stock released from FIFO batches" note (note: stock already reserved at pack).
**Approve (POST /:id/approve, admin):** `approvePharmacyOrder`: must be pharmacy_submitted+pending+!approvedAt; pharmacy active; credit check uses **connection.creditLimit** first, else pharmacy limit; sets approvedAt/approvedBy, emits `order.accepted`; `finalizeNow` → finalize in same tx. `ApprovePharmacyOrderModal`: shows order/pharmacy/total, **credit utilisation bars** (used/after), item stock table (short lines red), blocks approve if `afterOrder<0` or any short line or detail error. Buttons **Approve** / **Approve & Pack**.
**Reject (POST /:id/reject, admin):** reason≥3; status→cancelled + rejectionReason; emits `order.rejected`. `RejectPharmacyOrderModal` textarea.
**Cancel-approved (POST /:id/cancel-approved, admin):** only when pending+approvedAt; clears approval, status→cancelled; emits `order.cancelled`. Reason modal (≥3).
**Cancel (POST /:id/cancel, admin):** allowed `pending`/`packed`; **blocked if bill exists** (`OrderHasBillError`→400 code ORDER_HAS_BILL); packed cancel: release stock, `outstanding -= total` (GREATEST 0), reversing ledger; emits `order.cancelled` for portal.
**Generate bill (POST /:id/bill, admin/biller):** `GenerateBillModal` (SlideOver) shows order/pharmacy/items/amount; navigates to bill. **Initiate return (POST /:id/return, admin):** only `delivered` orders; `InitiateReturnModal`.
**Order detail page:** stepper (Pending→Packed→Shipped→Delivered or Pending→Cancelled). Banners: portal-submitted, bill generated, bill-required-before-delivery, rejection reason. Tabs: **Items & Stock** (product/batch/exp, qty, rate, GST%, total) and **Manage Actions** (Generate Bill card, Initiate Return card for delivered). Header actions by role/state: Print; admin Cancel (pending/packed, no bill); portal Approve/Reject; non-portal Pack; approved-portal Cancel Approved + Pack; Ship (packed); Record Delivery (packed/shipped, blocks if bill required); Generate Bill (admin/biller when no bill & packed/shipped). Non-admin portal-pending sees "Admin approval required".
**Detail server (`GET /:id`):** items with `stockOnHand` (all batches) + per-item `returnedQty` (sum of return items) + batch info; linked bill; `creditInfo{limit,used,available}` (connection limit preferred); `hasBill`.
**`getPharmacyExposure` (credit engine):** = unpaid bill balances Σmax(0,total−paid) + in-flight approved-but-unbilled orders (pending/packed/shipped with approvedAt and no linked bill). Enforced at create, finalize, approve.
**AI order parse (POST /orders/parse-text, admin/biller):** gated `FEATURE_AI_PARSE`; `aiOrderParseService` (Gemini `gemini-2.0-flash`) → catalogue-matched line items (exact/high/low/none confidence). No dedicated UI (Create page uses its own client-side parser).

### 2.6 Bills (`/bills`, `/bills/:id`) — `routes/bills.ts` + `billService.ts`
**`generateBill`** — idempotent (unique index on `bills.order_id` + `23505` short-circuit); computes GST per line, `subtotal+tax=total`, billNumber `INV-YYYY-####`, `dueDate = billDate + pharmacy.paymentTermsDays (default 30)`. For **portal** orders emits **`bill.generated`** carrying full line items (externalProductId, batch, rates, cgst/sgst/igst, lineTotal) so pharmacy mirrors a payable bill.
**Overdue is derived, not stored** — `markOverdueBills` is a deliberate no-op (never clobbers `partial`); `isBillOverdue`/`buildOverdueBillFilter` = unpaid/partial + dueDate<today + total>paid. List injects `displayStatus`.
**List:** search (billNumber/pharmacy), status (All/Paid/Partial/Unpaid/Overdue). Columns: Invoice# · Pharmacy · Date · Due (color-coded: red overdue/≤0d, amber ≤7d) · Status · Total · Paid · Outstanding. Footer page-total.
**Detail page (`#invoice-content` printable):** seller header (tenant name/address/GSTIN/DL/state), "IGST INVOICE" vs "GST INVOICE", invoice/date/due; Billed-To; item table (Product+batch/exp · HSN · Qty · Rate · Taxable · GST% · Total); **Payments Allocated** table (payment#/date/method/status/allocated, voided rows struck-through); totals (Taxable, CGST/SGST or IGST, Invoice Total, Paid, Outstanding); footer "computer generated invoice" (**no QR — `additions.md §A`**). Actions: status badge; Initiate Return (if orderId + delivered + status in partial/paid/unpaid); Record Payment (if not paid); **Send WhatsApp** (client rasterizes `#invoice-content` to PDF via `invoicePdf.ts`, `POST /communication/send-bill`; gated `features.whatsapp`+configured); Print; **Override Status** (admin/biller): Mark unpaid (only if paid=0) or Mark paid (requires Notes; non-cash requires reference) — Mark paid routes through `recordPayment` for the outstanding amount + writes `BILL_MARKED_PAID` audit; partial is not manually settable.
**`PATCH /:id/status`** — status ∈ unpaid/partial/paid; paid requires notes; paid+outstanding→synthetic payment via `recordPayment`; unpaid only if currentPaid=0; partial→400 "Use Record Payment".

### 2.7 Payments received (`/payments`, `/payments/:id`) — `routes/payments.ts` + `paymentService.ts`
**RecordPaymentModal (SlideOver):** Pharmacy account, Outstanding banner, Amount Received*, Payment Mode (upi/cash/bank/cheque), Reference (label per method: UTR/Reference/Cheque #; **onBlur dedup** via `GET /payments/check-reference` → warns "Already used on payment X"), Date, **Bill Allocation** table (checkbox + editable amount per outstanding bill; **Auto FIFO** button fills oldest-first). Validates pharmacy/amount/refWarning/non-cash-reference/alloc≤amount.
**`recordPayment` (admin/biller):** non-cash requires reference (`REFERENCE_REQUIRED`) + **unique non-voided reference** (`DUPLICATE_REFERENCE`); transaction: allocate FIFO across oldest bills (or explicit allocations, alloc-sum≤amount); conditional bill UPDATE recomputes status and **refuses over-allocation** (`paid+alloc ≤ total`); `outstanding -= totalAllocated` (GREATEST 0); posts ledger (method account Dr / Debtors Cr). Payment number `PAY-#####`.
**List:** search, Record Payment; opens via `?record=1` or router state. Columns: Date · Pharmacy · Mode badge · Reference · Status badge · Amount.
**Detail:** Payment Info (amount/mode/reference/status/date) + Pharmacy Details + Bill Allocations. **Void (POST /:id/void, admin):** `voidPayment` — reverses allocations (restore bill paid/status), `outstanding += totalAllocated`, status→voided, reversing ledger (Debtors Dr / method Cr). ConfirmDialog.

### 2.8 Purchases / GRN (stockist) (`/purchase-bills`, `/purchase-bills/:id`) — `routes/purchases.ts` + `purchaseService.ts`
**List:** search (grn/invoice/supplier), supplier filter, status (pending/received), date range + "Last 30 Days" toggle, Export (up to 50k), Add Purchase. Columns: GRN/Invoice(+supplier inv) · Supplier · Date · Status · Amount. Supports `?procureProductId&procureQty` deep-link (from Required Stock) auto-opening the modal.
**UploadBillModal (SlideOver):** modes **Upload PDF** (AI) / **Manual Entry** (auto-selects manual if AI disabled). Header: Supplier (search + select)*, Invoice # (supplier), Invoice Date. Upload: drag/drop PDF/PNG/JPG ≤10MB → **"Parse with AI (Gemini)"** → `POST /purchases/parse` fills lines. Manual line items (add/remove): product (search existing OR type new name), Batch #*, Expiry (date), Qty*, Free, MRP*, Rate*, GST select. Per-line missing-field toast. On save invoice file is read to a base64 data-URL and sent as `invoiceFileUrl`. If server returns `productsNeedingSaleRate` → opens **SetSaleRatesModal**.
**`createPurchase` (admin/biller):** `findOrCreateProductFromLine` — by productId, else name (ilike) match, else **creates General-category product with saleRate 0**; computes line subtotal/tax; inserts `pending` purchase `GRN-YYYY-####`; returns `productsNeedingSaleRate` (products with saleRate≤0). Expiry normalized via `validateExpiryDate`.
**SetSaleRatesModal (SlideOver):** per product MRP/Purchase/Sale-rate (PTR) input (required >0); `POST /sale-rates`; "Skip for now" allowed but receiving is blocked until set.
**Detail:** header status; Edit (pending only → `EditPurchaseModal`: supplier/invoiceNo/date/notes); View Invoice (if file); Print GRN; **Receive Stock** (if not received). KPI cards (Total/Supplier/Invoice Date). Tabs: **Items** (product/batch-expiry/qty/free/MRP/rate/GST/lineTotal + totals with intra/interstate split) and **Ledger** (posted after receive).
**`receivePurchase` (POST /:id/receive):** refuses if any product saleRate≤0 (names listed); transaction: `receiveStock` per line (upsert batch on tenant+product+batch+expiry, sets saleRate from product), status→received + receivedDate; posts **Inventory Dr / GST-input(CGST+SGST or IGST) Dr / Sundry Creditors Cr** (interstate from supplier state vs '08' buyer). ConfirmDialog.

### 2.9 Suppliers & supplier payments (`/suppliers`, `/suppliers/:id`) — `routes/suppliers.ts`, `routes/supplierPayments.ts`
**List:** search (name), status; Add Supplier; inline Edit. Columns: Supplier(name+gstin) · Contact · State · Status · Balance Due (= Σpurchases − Σpayments, floor 0) · edit. **AddSupplierModal:** Company Name*, Contact Person*, GST, DL, Phone*, Email, State Code*, Payment Terms (COD/7/15/30/45/60), Address*. Server `SupplierSchema`: name/contact≥2, phone≥7, address≥5, stateCode, optional gstin/dl, terms 30, status active. Create/edit admin/biller.
**Detail:** StatCards To-Pay (outstanding) + Total YTD Purchases; tabs Info / Purchases (→purchase) / **Ledger** (purchases as debit, payments as credit, running balance). Record Payment (admin). **RecordSupplierPaymentModal:** Amount*, Mode (bank/upi/cash/cheque), Date*, Reference, Notes. `recordSupplierPayment` (admin) → `SPAY-#####` + ledger (Creditors Dr / method Cr).

### 2.10 Returns (sales returns) (`/returns`, `/returns/:id`) — `routes/returns.ts` + `returnService.ts`
**List:** search, source (manual/portal), Initiate Return (admin → pick delivered order modal → `InitiateReturnModal`). Columns: Return# · Pharmacy · Source badge · Date · Status · Refund.
**InitiateReturnModal (SlideOver):** per returnable line (qty − prior returns): Batch select (per-product batches), Rate, remaining/of-ordered, Return Qty. Reason (expired/damaged/wrong_item/cancelled/other), Notes. Client blocks qty>remaining and requires batch for wrong_item/cancelled. `createReturn`: validates returnable vs orderItem.qty − prior returns; `RET-####`; status `requested`.
**Detail:** Summary (Total/Reason/Date/Bill#/Order link); Pharmacy; Returned Items; printable **Credit Note** (`#credit-note-content`). Actions (requested + admin): **Reject** (reason≥3 modal → `rejectReturn`) / **Process** (ConfirmDialog).
**`processReturn` (POST /:id/process, admin):** transaction with conditional flip `requested→processed`; **restock only for wrong_item/cancelled** (requires batchId); GST-inclusive credit; must be linked to order (or portal return); refuses credit>orderTotal+0.01; reduces linked bill paidAmount then total, keeps `payment_allocations` in sync (reduce/delete largest first); `outstanding -= (grossCredit − billCredit)`; posts Sales-Returns Dr / GST-output Dr / Debtors Cr; portal → emits `return.processed` with creditAmount/allocationToBill/billTotalReduction/outstandingReduction. `rejectReturn` emits `return.rejected` with reason; DB adds `rejected` status.

### 2.11 Required stock, Audit logs, Settings
- **Required Stock (`/required-stock`, `getRequiredStockReport`):** products with Σ on-hand `< minStockLevel`; deficit banner; per row In Stock/Min/Shortage + **Procure** → `/purchase-bills?procureProductId&procureQty`; Copy List (clipboard), Export.
- **Audit Logs (`/audit-logs`, admin):** filters entity type (stockist set: orders/payments/bills/returns/purchases/users), user, date range; columns Timestamp(tz) · User · Action · Entity(link) · Details · view(→AuditDetailModal). Export paginates all. `routes/audit.ts` admin-only.
- **Settings (`/settings`, admin):** left-nav tabs. **Business info** (`PATCH /settings/tenant`, strict Zod GSTIN/phone/state regex, empty gstin→null, slug-collision→409, stockist marketing fields stripped for pharmacy; stockist save triggers `syncPublicCatalog`): Business Name*, Email*, Phone*, DL, GSTIN, State Code, Address. **Connections** (`ConnectionsTab`): invite-code card (copy), Pending Requests table (pharmacy/gstin/phone + Approve/Reject) and Active Connections (credit limit + Sync Catalog + Disconnect). `ApproveConnectionModal`: Credit Limit (defaults from `defaultCreditLimit` or 50000) + Payment Terms. `RejectConnectionModal`: canned reasons + Other. Disconnect via ConfirmDialog. **Public Profile** (`PublicProfileTab`): List publicly, Accept new connections, Public URL slug (preview), About, Categories (CSV), Coverage state codes (CSV), Save + **Sync Public Catalogue**, per-product visibility checkboxes. **Staff/Users:** table + Add User (`AddUserModal`: Name/Email/Password/Role[admin,biller]); deactivate/reactivate/remove (self-row shows "You"; server last-admin + self-guards). **Order Defaults** (`OrderDefaultsTab`): Auto-approve portal orders toggle + Default credit limit → `notificationsJson`. **Catalog Sync** (`CatalogSyncTab`): frequency (manual only) + Sync All Active Connections. **Security:** change password. **Notifications:** lowStockAlerts / overduePayments toggles. **System:** download Users CSV.
- **Onboarding server (`PATCH /settings/onboarding`, admin):** step 0–4; can't move backwards after completion; completing requires DL≥3 chars AND (stockist: ≥1 pharmacy + ≥1 active product; pharmacy: ≥1 active connection) else 400 with `missing[]`.
- **`GET /settings/features`** → `{whatsapp, aiParse, whatsappConfigured}`. Public-catalog endpoints stockist-admin only.

### 2.12 Reports (`/reports` + subpages) — `routes/reports.ts` (shared, branches on tenantType) + `reportService.ts`
Hub cards (role-gated): Sales (admin/biller), Outstanding (admin), GST (admin), Profit (admin), Stock Ageing (admin/biller), Compliance (admin), Portal Orders (admin), Purchase Analysis (admin). Master CSV digest export (admin). Report logic:
- **Sales** (`from/to`, paginated orders): daily totals, top products (by lineTotal), top pharmacies, by-category, summary (total/orders/avgOrderValue).
- **Outstanding** (`asOfDate`): per unpaid non-voided bill outstanding + ageDays from dueDate; **aging buckets** current/≤30/≤60/≤90/90+; top defaulters (≤10); totalOutstanding, overdueAmount (age>0), avgCollectionDays.
- **GST** (`month`): sales CGST/SGST/IGST + taxable/total from bills; **purchase ITC** split intra/inter by supplier vs tenant state; per-rate breakdown from billItems.
- **Stock aging** (`asOfDate`): per batch age from receivedAt, value=qty×purchaseRate; buckets 0-30/31-60/61-90/90+.
- **Compliance** (`type` H1 default or `all`, `month`): scheduled-drug dispensing register (order date, pharmacy+DL, product, schedule, batch, qty, bill#). Invalid type→error.
- **Profit** (`from/to`): COGS from batch `purchaseRate` (fallback product), gross profit, margin%, by-category, daily profit.
- **Portal orders** (`from/to`): approval rate = approved/(approved+rejected), status counts, top pharmacies. `approved`=has approvedAt; `rejected`=!approvedAt+cancelled+rejectionReason.
- **Purchase analysis** (`from/to`): total spend, supplier count, top suppliers.
Report roles server-side: sales/stock-aging/required-stock = admin+biller+pharmacist; outstanding/gst/compliance/profit/portal-orders/purchase-analysis = admin. Charts via Recharts.

---


## 4B.21 SP Pharmacy panel (complete)

## 3. PHARMACY PANEL

Shell `PharmacyMainLayout` (teal). Sidebar groups: [Dashboard, Discover Stockists]; **Sales**: POS/New Sale, Sales History, Customers; **Procurement**: Connected Stockists, Purchase Orders, Inbound GRN; **Inventory**: Products, Expiry Alerts; **Finance**: Payable Bills, Payments Made, Returns; **More**: Reports; **Admin (adminOnly)**: Settings, Audit Logs. Role gating: cashier sees only Dashboard/POS/Sales/Customers/Products; cashier hidden from anything with "stockists". Mobile BottomNav differs for cashier (Home/POS/Sales/Customers) vs pharmacist/admin (Home/POS/POs/GRN + More).

### 3.1 Dashboard (`/pharmacy/dashboard` → `pharmacyReportService.getPharmacyDashboardKpis`)
Onboarding banner (admin "Continue Setup" → `PharmacyOnboardingFlow`; non-admin shows progress). KPIs: Today's Retail Sales, Month Retail Sales, Pending POs (submitted/accepted), Payables Outstanding, Low Stock Items, Awaiting GRN (delivered/partially_received). Quick actions: New Sale, Place Order, Receive GRN, Record Payment. Widgets: Recent Purchase Orders (5) and **Expiring Soon** (batches ≤90d from stock-aging; hidden for cashier).
**PharmacyOnboardingFlow (5 steps):** Business Profile (DL*/GST/Address), Connect Stockist (gate: pending/active connection; shows 3 discover stockists), Import Products (gate: hasProducts), Opening Stock (skippable), Add Staff. Server gate requires ≥1 active connection to complete.

### 3.2 Discover & connect — `routes/public.ts` (unauth) + `stockist-connections` + `connectionService`
- **Discover (`/pharmacy/discover`):** search (name/gstin) + state filter; cards (name, gstin, product count, "Not accepting requests", categories); paginated. Data via `GET /api/public/stockists` (dedupes listings, IP rate-limited 60/min).
- **Public profile (`/pharmacy/discover/:slug`):** header (name, gstin, state, about, partner/product counts, categories); public catalogue table (Product/Category/MRP/Availability — **no PTR**, `C12`); Request Connection (admin/pharmacist, if accepting + not connected) → SlideOver (Note, Expected monthly volume) → `POST /stockist-connections/request {stockistTenantId, requestSource:'discovery'}`; Place Order if active. `GET /api/public/stockists/:slug` + `/:slug/catalog` (page size ≤20).
- **Connected Stockists (`/pharmacy/stockists`):** search + status filter (active/pending/rejected/withdrawn/disconnected); Connect Stockist + Discover. Rows: name/gstin/status/creditLimit/Withdraw (pending). **ConnectStockistModal (SlideOver):** Invite Code mode OR GSTIN/Name search (`GET /stockist-connections/search`) → connect. `requestConnection` guards: no self-connect, stockist must be `acceptingNewConnections`, pharmacy tenants only, **7-day cooldown after rejection** (`REQUEST_COOLDOWN`); emits `connection.requested`.
- **Stockist detail (`/pharmacy/stockists/:connectionId`):** tabs Overview (status/gstin/phone/credit limit/terms/connected), **Catalog** (last synced + Resync; rows Product/MRP/Rate/GST/Synced + **Map Local Product** select + "Create from catalog" for admin/pharmacist), Orders, Bills, Ledger (from payable bills). `pullCatalogForPharmacy`/`syncCatalogToConnection` share DB so writes propagate immediately.

### 3.3 Purchase Orders (`/pharmacy/purchase-orders`) — `routes/purchaseOrders.ts` + `pharmacyPurchaseOrderService.ts`
**11-state enum:** `draft → submitted → accepted/rejected → packed → shipped → delivered → partially_received → received`, plus `cancel_requested`/`cancelled`.
**List:** search (PO#), status filter (all 11), New PO. Columns PO#/Date/Stockist/Status/Total.
**CreatePurchaseOrderPage** (`?connectionId`, `?duplicateFrom`, `?editFrom`): 2-step (Select Stockist → Add Items). Step 2: change stockist, Notes, **Add from catalog** (search, click to add; auto-syncs empty catalog), line table (qty editable, rate/total, remove), **credit utilisation bar** (outstanding+order vs connection limit, blocks Submit if exceeds). Save Draft / **Submit Order** (create/update then submit).
**`createPurchaseOrder`/`updatePurchaseOrder` (admin/pharmacist):** draft only; prices lines; `PO-YYYY-####` with 3-attempt retry.
**`submitPurchaseOrder`:** must be draft; active connection with `linkedPharmacyId`; **every stockistProductId must still be in catalog** else `CATALOG_DRIFT`; connection credit check (`getPayablesOutstanding` + total) → `CREDIT_LIMIT_EXCEEDED`; transaction **creates the mirror `orders` row on the stockist tenant** (`source:'pharmacy_submitted'`, `externalPharmacyOrderId=PO.id`, order# with retry), copies items, conditional flip draft→submitted (`PO_NOT_SUBMITTABLE`), sets `externalOrderId`; emits `order.submitted`; if stockist `autoApprovePortalOrders` → `approvePharmacyOrder` (auto-reject on credit/stock failure). Error codes mapped to 400/409 with `code`.
**Detail page:** stepper (draft→…→received; partial/rejected/cancel_requested/cancelled terminals). Banners for shipped (Confirm Receipt then GRN), delivered (Receive GRN), rejected reason, cancel pending, cancelled. Item table (Qty/Received/Rate/GST/Total). Actions by state: Duplicate to Draft (**rejected only** — `additions.md §E`), Edit Draft, Submit, **Confirm Receipt** (shipped→delivered), **Receive GRN** (delivered/partially_received → `ReceiveGrnModal`), Initiate Return (received/partially_received, admin/pharmacist → `InitiateStockistReturnModal`), Cancel, Delete (draft), Sync now.
**Cancel semantics (`cancelPurchaseOrder`):** draft→local cancel; submitted & stockist pending→cancel both sides in one tx + emit `order.cancelled`; accepted/packed→`cancel_requested` + `order.cancel_requested` (finalized on stockist ack); shipped/delivered/cancelled→`PO_NOT_CANCELLABLE`.
**`confirmPurchaseOrderReceipt`:** shipped→delivered (conditional) + emit `order.delivered`. `deletePurchaseOrder`: draft only.

### 3.4 GRN — goods receipt (`/pharmacy/grn`) — `routes/grn.ts` + `pharmacyGrnService.ts`
**List:** search (grn#), stockist filter; columns GRN#/Received/Status(received|partial)/PO#/Stockist. **Detail:** header + PO link + item table (product/batch·exp/qty(+free)); Receive GRN button if PO delivered/partially_received.
**ReceiveGrnModal (SlideOver):** auto-builds lines from PO pending qty (paid+free breakdown), pre-fills batch/expiry from linked payable bill if present, auto-maps local product (catalog `localProductId` → name match) and **auto-creates missing products from catalog** (+ "Create all from catalog"). Per line: Local Product select (+ create from catalog), Batch #*, Expiry (must be ≥ today client-side)*, Qty (capped to pending), **Split batch**. Notes. Sends with **Idempotency-Key** header.
**`createGrn` (admin/pharmacist):** receivable only against delivered/partially_received; pre-aggregates by PO item; **cumulative received ≤ pending** guard (client) and **conditional over-receive guard `OVER_RECEIVE`** (server); `validateExpiryDate` and **expiry > receivedDate** (`EXPIRED_BATCH`); transaction: `PGRN-YYYY-####`, upsert batch on (tenant,product,batch,expiry), `stock_movements` reason `grn_receive`, increment PO-line receivedQty, flip PO to received/partially_received, GRN status partial if short, post **Inventory Dr / GRN_CLEARING Cr** at gross cost, auto-map catalog→local product; notify stockist `order.received`/`order.partially_received`. Route has **in-process idempotency cache (10 min)** keyed by tenant+Idempotency-Key.

### 3.5 Retail POS & sales (`/pharmacy/pos`, `/pharmacy/sales`) — `routes/retailSales.ts` + `retailSaleService.ts`
**PosPage:** product search (Enter = exact name/hsn or single match → add; barcode-friendly); left product list (Rx badge for scheduled, stock, disabled if out of stock); **addToCart** fetches batches, picks FEFO non-expired batch, caps to batch stock. Cart: per-item ± qty (44px targets), Disc %, remove; Customer search+select (walk-in default); Subtotal + Discount; **Split payment** toggle (cash amount + remainder via upi/card) OR method buttons (cash/upi/card) + Amount Received (+change); **Rx block** (appears when any scheduled item): Rx number*, Doctor name*, Doctor reg#, Patient name*, Patient age. Complete Sale → navigate to receipt with `?print=1`; Clear (ConfirmDialog).
**`createRetailSale` (admin/pharmacist/cashier):** empty-cart guard; customer validation; **prescription capture (C26)** — Rx#/doctor/patient required when any line schedule H/H1/X/NDPS (`RX_REQUIRED`); prices at product saleRate or override; **GST-inclusive** lines (`lineTax = lineSubtotal * gst/(100+gst)`); consumes stock by explicit `batchId` (expiry/availability checks: `BATCH_NOT_AVAILABLE`/`EXPIRED_BATCH`/InsufficientStock) or **FEFO** `reserveStock`, rolling back reservations on failure; split payments must equal total within 0.02 (`SPLIT_MISMATCH`); computes amountReceived/change; `SALE-YYYY-####`; posts cash-sale ledger (method account(s) Dr / Sales Cr + CGST/SGST Cr). Errors mapped to 400/409 with codes.
**SalesHistoryPage:** search + date range; columns Sale#/Date/Payment/Status/Total. **SaleDetailPage:** auto-print on `?print=1`; header (sale#, date, status, payment [split legs], cashier, customer); Rx panel if present; item table (batch·exp, qty, rate, GST%, total) + footer (subtotal/GST/discount/total/received/change). **Void (admin, same-day only):** modal reason (≥3) → `voidRetailSale` (conditional flip, restock, reversing ledger; `todayIST` guard "Only same-day sales can be voided").
**Customers (`/pharmacy/customers`):** search; Add Customer (Name*/Phone modal); delete (admin, ConfirmDialog). `customerService` CRUD; create allowed for cashier too. Server customer schema also supports email/age/gender/allergies/notes.

### 3.6 Payables & payments (`/pharmacy/payable-bills`, `/pharmacy/payments`) — `payableBillService` + `payablePaymentService`
**`createPayableBillFromEvent`** — materializes `payable_bills` (+ items) from `bill.generated` event, **idempotent on externalBillId**, links purchaseOrderId (via externalPharmacyOrderId or externalOrderId), maps externalProductId→local product via catalog; posts **GRN_CLEARING Dr / GST-input Dr / Sundry Creditors Cr** (M21 nets against the GRN's Inventory/GRN_CLEARING entry).
**Payable bill list:** filters search/status(+overdue derived)/stockist/date range; server ships `outstanding`. **Detail (read-only, no print/QR — `additions.md §A`):** stockist/status/dates/total/outstanding, linked PO link, Payment History (voided struck-through), item table; **Record Payment** SlideOver (Amount [default outstanding, ≤outstanding], Method, Reference [required non-cash]); **Initiate Return** (admin/pharmacist → `InitiateStockistReturnModal`).
**`recordPayablePayment` (admin/pharmacist):** non-cash reference required + dedup (`DUPLICATE_REFERENCE`); FIFO across oldest payable bills (or explicit allocations); conditional bill UPDATE (no over-allocate); ledger (Creditors Dr / method Cr); emits **`payment.recorded`** to stockist (which records the reciprocal `recordPayment`). `PPAY-#####`.
**Payments Made page:** table (payment#/date/method/status/amount + Void for admin); Record Payment SlideOver (Bill select showing outstanding, Amount, Method, Reference). **Void (admin, `voidPayablePayment`):** reverse allocations, status→voided, reversing ledger, emit `payment.voided`.

### 3.7 Returns to stockist (`/pharmacy/returns`) — `routes/stockistReturns.ts` + `stockistReturnService.ts`
**InitiateStockistReturnModal (Modal):** invoked from PO detail (received lines) or payable-bill detail (bill lines). Resolves each line to a local product (explicit localProductId → catalog map → name match); per line Batch select + Qty (capped to max), "Return all eligible", Reason (expired/damaged/wrong_item/cancelled/other) [batch required for wrong_item/cancelled], Notes.
**`createStockistReturn` (admin/pharmacist):** active connection; **other-mode (no PO/bill) requires reason `other`** and per-item batchId; validates returnable = received/bill qty − prior non-rejected/cancelled returns; reduces local batch stock (explicit batch conditional decrement or FEFO reserve), `stock_movements` reason `transfer_out`; **maps local→stockist catalog** (`mapReturnItemsForStockist`, throws if unmappable); emits `return.requested`. `SRET-####`. Statuses `requested→approved/processed/rejected/cancelled`.
**List/Detail:** stepper requested→processed (+ rejected terminal with reason); items table. Stockist's `return.processed`/`return.rejected` events flip local status (rejection restocks).

### 3.8 Products, Expiry, Reports, Settings (pharmacy)
- **Products** — shared `/api/products`; "from-catalog" create (resale saleRate defaults to MRP). Cashier hides rates.
- **Expiry Alerts** (`PharmacyExpiryAlertsPage`): batches ≤90d from stock-aging, tier-colored days-left.
- **Reports hub** (role-gated cards): Retail Sales (admin/pharmacist), Stock Aging, Expiry, GST (admin), Payables Aging (admin), Profit Margin (admin), Compliance (admin). `pharmacyReportService`: retail sales report (daily, top products, **payment mix**, paginated txns), payables-aging buckets, **pharmacy GST** (output from GST-inclusive retail lines + input from payable bill items **and** local purchases, netPayable), profit (revenue−COGS from batch purchaseRate), compliance (retail Rx register), dashboard KPIs.
- **Settings** (admin): Business, Staff (Add via `PharmacyAddUserModal` roles admin/pharmacist/cashier), Notifications, **POS Config** (default payment method + print-receipt prompt, stored in notificationsJson), Security. `PATCH /settings/tenant` strips stockist marketing fields for pharmacy.
- **Audit Logs** (admin): pharmacy entity set (POs/GRN/payable bills/payable payments/retail sales/connections/returns/customers/products/users).

---


## 7G. SP entity reference (tables 11.1-11.8)

## 11. COMPLETE ENTITY REFERENCE — every Drizzle table (`server/src/db/schema.ts`, 48 tables)

Conventions: every table has uuid `id` defaultRandom PK unless noted; `timestamps` = createdAt+updatedAt (tz). Money = `numeric(14,2)` (strings in JS; services `Number()` them). Business dates = `text` `YYYY-MM-DD`. Tenant-scoped tables carry `tenantId → tenants (cascade)` plus a `(tenantId, id)` unique index used for cross-checked scoping in joins.

### 11.1 Auth / tenancy
- **`tenants`** — name, businessName, `tenantType` stockist|pharmacy (default stockist), stateCode (default '08'), gstin?, dlNumber?, `addressJson` (JSON text, onboarding writes `{line1}`), `notificationsJson` (JSON text holding notification toggles, `autoApprovePortalOrders`, `defaultCreditLimit`, pharmacy POS config), `inviteCode` (unique, stockists only), onboardingCompleted (bool) + onboardingStep (int), **`approvalStatus`** pending|approved|rejected (default approved; set by platform panel, not enforced at login), **KYC-ready columns currently unused by forms:** businessType, panNumber, whatsapp, city, pinCode, bankAccountJson, documentsJson, logoUrl; public-marketplace columns: isPubliclyListed (default true), acceptingNewConnections (default true), publicSlug (unique), aboutText, coverageStateCodes (CSV), categories (CSV); phone, email (both required). Lifecycle: created at register → onboarding steps → optionally publicly listed (stockists) / browseable by consumers (pharmacies).
- **`users`** — tenantId, email (unique per tenant), passwordHash, name, `role` admin|biller|pharmacist|cashier (default biller), isActive, lastLoginAt. Deactivation + password change revoke sessions via `updatedAt>iat` check. Last-admin and self-removal guards in `routes/users.ts`.
- **`refresh_tokens`** — userId, tokenHash, expiresAt, revokedAt. Written/revoked but never exchanged (no /auth/refresh).
- **`password_reset_tokens`** — userId, `jti` unique, expiresAt (15 min), usedAt. One-shot consumption in reset flow.
- **`platform_users`** — global email unique, passwordHash, name, role `super_admin`, isActive. Seeded from env at boot.
- **`consumer_accounts` / `doctor_accounts` / `mr_accounts`** — global email-unique credential tables (§9). Doctor extras: specialization, registrationNo, consultationFeeAudio/Video/Clinic (defaults 300/500/200), approvalStatus. MR extras: brand, territory.
- **`consumer_addresses`** — consumerId cascade, label (default Home), addressLine, city, pinCode, stateCode ('08'), isDefault. No API/UI yet.

### 11.2 Stockist masters & inventory
- **`suppliers`** — name, contactPerson, phone, email?, address, stateCode, gstin?, dlNumber?, paymentTermsDays (30), status active|inactive|blocked. Balance due is computed (Σ purchases − Σ supplier payments), not stored.
- **`pharmacies`** (stockist-side customer master) — name, contactPerson, phone, email?, address, stateCode, gstin?, dlNumber?, creditLimit (default '0'; UI default 50000), paymentTermsDays (30), status, **`outstanding`** (denormalized receivable, moved by finalize/payment/void/return/cancel, reconcilable from ledger), openingBalance, **`portalConnected`** + **`pharmacyTenantId`** (set when a connection is approved; the bridge between a CRM row and a real pharmacy tenant).
- **`products`** — name, genericName?, manufacturer?, category, hsnCode?, scheduleType NONE|H|H1|X|NDPS, packSize (text, '1'), baseUnit ('Tab'), saleUnit ('Strip'), convFactor (10), gstRate (numeric 5,2 default 12), mrp/purchaseRate/saleRate, minStockLevel (10), schemeBase?/schemeBonus?, isActive. Shared by both tenant types (stockist wholesale catalogue vs pharmacy retail stock); stockist writes push catalog syncs.
- **`product_batches`** — productId, supplierId?, sourcePurchaseId?, batchNumber, expiryDate (text), mrp/purchaseRate/saleRate, **qtyReceived** (immutable historical receipt) vs **qtyOnHand** (mutable), receivedAt. Unique on (tenant, product, batchNumber, expiryDate) → receive upserts. FEFO ordering = expiry asc, receivedAt asc. Lifecycle: created by purchase receive / pharmacy GRN / adjust-in; drained by order finalize, POS sale, returns-out; restocked by sale void / return restock / release.
- **`stock_movements`** (C24 canonical log) — batchId?/productId? (set-null FKs), signed `delta`, `reason` ∈ purchase_receive|grn_receive|sale|sale_void|return_restock|adjustment|transfer_in|transfer_out|write_off|other, `refType` ∈ purchase|grn|order|sale|return|adjustment|manual, refId/refNumber, notes, performedBy. `recordStockMovement` (lib/stockLedger.ts) no-ops on delta 0 and accepts the caller's tx.

### 11.3 Stockist transactions
- **`purchases`** + **`purchase_items`** — supplier GRN header (grnNumber `GRN-YYYY-####`, supplierInvoiceNo, invoiceDate, receivedDate, subtotal/taxAmount/total, status pending|received, invoiceFileUrl base64 data-URL, notes, createdBy) and lines (batchNumber, expiryDate, qty, freeQty, mrp, purchaseRate, gstRate, lineSubtotal/Tax/Total). Lifecycle: pending (editable) → received (stock in + ledger).
- **`orders`** + **`order_items`** — sales order (§2.5): orderNumber unique per tenant, orderDate, status pending|packed|shipped|delivered|cancelled, paymentMode credit|cash, totals, isInterstate/placeOfSupply, notes, `source` stockist_created|pharmacy_submitted, `externalPharmacyOrderId` (text, mirror of pharmacy PO id), stockistConnectionId, rejectionReason, trackingCarrier/Awb/shippedAt, submittedAt/approvedAt/approvedBy, createdBy. Items: productId, batchId? (first consumed FEFO batch), qty/freeQty, rate, gstRate, line amounts.
- **`bills`** + **`bill_items`** — invoice per order (**`bills.order_id` UNIQUE** = idempotent generation, C6), billNumber `INV-YYYY-####`, billDate/dueDate, isInterstate/placeOfSupply, subtotal, cgst/sgst/igst, total, paidAmount, status unpaid|partial|paid|overdue (overdue derived at read time, never stored). Items carry per-line cgst/sgst/igst + hsn via product join. Indexes on dueDate/status (me81).
- **`payments`** + **`payment_allocations`** — receivable receipts: paymentNumber `PAY-#####`, paymentDate, method cash|upi|bank|cheque, referenceNo (unique among non-voided per tenant), amount, unallocatedAmount, status successful|pending|failed|voided, notes, createdBy. Allocations link payment→bill with allocatedAmount; void reverses them.
- **`supplier_payments`** — `SPAY-#####`, same method enum, amount, reference/notes; no allocations (supplier balance is aggregate).
- **`returns`** + **`return_items`** — sales returns: `RET-####`, orderId?, pharmacyId, reason expired|damaged|wrong_item|cancelled|other, totalAmount, status requested|processed|rejected|cancelled, createdBy. Items link orderItemId?, batchId?, qty/rate/gstRate/lineTotal. Restock only for wrong_item/cancelled.

### 11.4 Ledger
- **`ledger_accounts`** — per-tenant chart, code unique per tenant, type asset|liability|income|expense|equity, parentId (unused). 16 seeded per tenant at registration: CASH, BANK, UPI_SUSPENSE, SUNDRY_DEBTORS (asset), SUNDRY_CREDITORS (liability), INVENTORY (asset), GRN_CLEARING (liability), SALES (income), SALES_RETURNS (expense), PURCHASES (expense), CGST/SGST/IGST_OUTPUT (liability), CGST/SGST/IGST_INPUT (asset).
- **`ledger_entries`** — txnDate, refType order|bill|payment|return|purchase|adjustment, refId, narration, createdBy. **`ledger_lines`** — entryId, accountId, partnerType pharmacy|supplier|null + partnerId (drives per-partner ledgers on pharmacy/supplier detail pages), debit/credit. `postEntry` rejects imbalance >0.01, resolves account codes per tenant, threads caller's tx (C2).

### 11.5 Pharmacy tenant entities
- **`pharmacy_purchase_orders`** + **`pharmacy_purchase_order_items`** — PO (§3.3): poNumber `PO-YYYY-####`, 11-state status, paymentMode, totals, notes, `externalOrderId` (uuid of the mirrored stockist order), rejectionReason, tracking fields, submittedAt/approvedAt. Items: catalogItemId?, **stockistProductId** (the stockist's product id — the cross-tenant key), productName snapshot, qty/freeQty/**receivedQty** (cumulative GRN progress), rate, gst, line amounts.
- **`pharmacy_grns`** + **`pharmacy_grn_items`** — `PGRN-YYYY-####`, receivedDate, status received|partial, notes. Items: purchaseOrderItemId?, local productId, batchId?, batchNumber/expiryDate, qty/freeQty, mrp/purchaseRate/saleRate.
- **`customers`** — retail customer master: name, phone?, email?, age?, gender?, allergies?, notes?. Only name+phone surfaced in UI.
- **`retail_sales`** + **`retail_sale_items`** — POS (§3.5): saleNumber `SALE-YYYY-####`, saleDate, customerId?, paymentMethod cash|upi|card, subtotal/taxAmount/discountAmount/total (GST-inclusive), amountReceived/changeAmount, status completed|voided (+voidedAt/By/Reason), cashierId, `paymentBreakdownJson` (split legs), **Rx fields (C26)**: rxNumber, doctorName, doctorRegNo, patientName, patientAge. Items pin batchId NOT NULL + batchNumber/expiry snapshot, qty/rate/gstRate/discountPercent/line amounts.
- **`payable_bills`** + **`payable_bill_items`** — AP mirror of stockist invoices (§3.6): stockistConnectionId, purchaseOrderId?, **externalBillId** (idempotency key) + externalOrderId, billNumber (stockist's), stockistName snapshot, dates, GST split, total/paidAmount/status (same enum as bills, overdue derived). Items: local productId? + externalProductId + productName/batch/expiry snapshots, per-line GST split.
- **`payable_payments`** + **`payable_payment_allocations`** — `PPAY-#####`, method, referenceNo (dedup), amount, status successful|voided. Allocations to payable bills; `payment.recorded`/`payment.voided` events mirror to the stockist side.
- **`stockist_returns`** + **`stockist_return_items`** — pharmacy→stockist returns (§3.7): `SRET-####`, stockistConnectionId, purchaseOrderId?/payableBillId?/externalReturnId, reason enum, totalAmount, status requested|approved|processed|rejected|cancelled, rejectionReason. Items: local productId, batchId?, qty/rate/gst/lineTotal.

### 11.6 Cross-tenant
- **`stockist_connections`** — stockistTenantId + pharmacyTenantId (pair-unique), linkedPharmacyId (the stockist's `pharmacies` CRM row), status pending|active|rejected|withdrawn|disconnected, requestSource discovery|invite_code|gstin_search, requestNote, expectedMonthlyVolume, **creditLimit/paymentTermsDays** (connection-level overrides), rejectionReason, connectedAt/disconnectedAt.
- **`stockist_catalog_items`** — per-connection synced catalogue (includes PTR `saleRate` + scheme fields + `localProductId` mapping + availabilityHint + syncedAt); unique (connectionId, stockistProductId).
- **`stockist_public_catalog_items`** — public listing per stockist product; `saleRate` column exists but is **never populated** (C12 — MRP + availability only); `isPublic` per-product visibility; unique (stockistTenantId, productId).
- **`cross_tenant_events`** — sourceTenantId/targetTenantId, eventType, payloadJson, deliveredAt (ack), createdAt; index (target, deliveredAt). **`processed_cross_tenant_events`** — (tenantId, eventId) unique claim table enabling atomic exactly-once handling.
- **`audit_logs`** — tenantId, userId?, action (METHOD path), entityType, entityId?, beforeJson/afterJson (redacted), ip, userAgent.

### 11.7 Umbrella extras (§9)
- **`online_orders`** + **`online_order_items`** — consumer B2C orders (`ONL-…`, status placed→…→delivered|cancelled, paymentMode cod|upi|online, deliveryAddressJson, prescriptionUrl). **`consultations`** — doctorId/consumerId/pharmacyTenantId?, mode audio|video|clinic, status scheduled|in_progress|completed|cancelled, scheduledAt, fee, prescriptionJson. **`mr_pharmacy_visits`** — mrId, free-text pharmacyName/phone/address/notes, visitedAt. **`smart_order_sessions`** — pharmacyTenantId, rawText, parsedJson, recommendationsJson.

### 11.8 Shared enums & constants (`shared/constants.ts`, `shared/types.ts`)
- `INDIA_STATE_CODES` — 30-entry code→name map (GST state codes; drives state dropdowns/validation). `GST_RATES = [0,5,12,18,28]`. `SCHEDULE_TYPES = NONE/H/H1/X/NDPS`. `LEDGER_ACCOUNT_CODES` (16, incl. M21 GRN_CLEARING comment). `DEFAULT_PAGE_SIZE 20`, `MAX_PAGE_SIZE 100`, `DEFAULT_CREDIT_LIMIT 50000`.
- `shared/types.ts` DTOs used by both sides: AuthUser, Login/RegisterRequest, Tenant, Pharmacy(+ListItem), Supplier, Product, ProductBatch, Order(+Item), StockistConnection, StockistCatalogItem, Bill(+Item), Payment(+Allocation), Purchase(+Item), Return(+Item), LedgerEntry/Line, AuditLog, StaffUser, `Paginated<T>` `{data,total,page,pageSize,pages}`, report shapes (SalesReportData, OutstandingReportData, GSTReportData, StockAgingItem, RequiredStockItem, ComplianceItem, DashboardKpis), AiParsedBill. Type-level enums: `PharmacyPOStatus` (all 11), `OrderStatus`, `BillStatus`, `PaymentMethod`, `PaymentStatus`, `ReturnStatus` (note: the shared type omits `rejected` which the DB/table supports), `PurchaseStatus`, `PartnerStatus`, `ScheduleType`, `ConnectionStatus` (shared type omits `withdrawn` which DB supports), `AvailabilityHint`, `LedgerRefType`, `AccountType`.

---

## 7H. ERP data dictionary (complete)

## 13. COMPLETE DATA DICTIONARY (every table, every field — from `src/integrations/supabase/types.ts`, 51 tables + 6 RPCs)

Conventions: all PKs are `id uuid` (gen_random_uuid). "→" = FK. Enums: `app_role` = stockist|pharmacy|admin|mr|patient|brand; legacy `user_role` = stockist|pharmacy (unused in app code).

### 13.1 Identity & roles
- **profiles** — mirror of auth users. Fields: `id` (= auth.uid), `email`, `created_at`, `updated_at`. Created by Login signup upsert and orphaned signup pages. Every other "user_id" FK points here.
- **user_roles** — `user_id`, `role app_role`, `created_at`. One row per role; unique (user_id, role) used as upsert conflict key. Read by `has_role()`/`is_admin()` SQL, AuthContext (maybeSingle → effectively assumes ONE role/user), useUserRole (all roles → priority pick), AdminRoute.
- **stockist_details** — the stockist business record. `profile_id` →profiles (1:1), `stockist_name`, `company_name`, `license_number`, `phone`, `address`, `gstin`; bank: `upi_id`, `bank_name`, `account_number`, `ifsc_code`, `account_holder_name`; commerce config: `catalogue_slug`, `catalogue_enabled`, `catalogue_created_at`, `default_credit_days`, `default_margin_percent`, `delivery_radius`, `business_hours Json`; dispatch geo: `dispatch_latitude/longitude/place_name` (used by calculate-delivery-fee Haversine). Created at onboarding; updated at StockistProfile & PaymentLinkDialog (inline UPI save).
- **pharmacy_details** — dual-ownership design: `profile_id` →**stockist_details.id** (the stockist who "owns"/manages the pharmacy record — used by ALL stockist RLS) and `auth_profile_id` →profiles.id (set only when the pharmacy itself has a login; the authenticated pharmacy portal keys on this). Fields: `pharmacy_name`, `owner_name`, `license_number` (public-catalogue password), `gst_number` (NOT NULL; process-bill-image inserts 'PENDING'), `phone`, `whatsapp_number`, `email`, `address`, `area`, `pin_code`, `google_maps_name`, `location_coordinates` (text "lat,lng") plus separate `latitude`/`longitude` numerics; money: `credit_limit`, `credit_balance`, `outstanding_balance` (maintained by trigger + client recalcs); denorm stats: `total_orders`, `total_revenue`, `last_order_date` (written by nothing in current UI — stale denorms); `is_active`.
- **patient_details** — `profile_id` (1:1), `patient_name`, `phone` (NOT NULL), `date_of_birth`, `gender`, `blood_group`, `allergies text[]`, `medical_conditions text[]`, `emergency_contact_name/phone`, `is_active`.
- **brand_details** — `profile_id` (1:1), `brand_name`, `company_name`, `contact_person`, `phone`, `email`, `gstin`, `manufacturing_license`, `address`, `is_verified` (gates the whole brand module; nothing in the UI sets it true — admin would have to flip it in DB), `is_active`.
- **mr_details** — structurally a clone of stockist_details (same bank/catalogue/credit columns incl. `upi_id`, `catalogue_slug`, `catalogue_enabled`, `default_credit_days`, `delivery_radius`, `business_hours`): `profile_id` (1:1), `mr_name`, `company_name`, `license_number`, `phone`, `address`, `gstin`. Only name/company/license/phone/address are used by the MR UI; the catalogue/bank columns are dormant.

### 13.2 Catalog & inventory
- **products** (stockist catalogue) — `stockist_id` →stockist_details, `name`, `generic_name`, `brand`, `manufacturer`, `category`, `type` (form), `strength`, `pack_size`, `description`, `image_url`, `hsn_code`, `batch_code`; pricing: `mrp`, `purchase_price` (PTR), `sale_price` (PTS), `gst_percentage` (default 5); stock: `stock_quantity`, `min_stock_threshold` (default 10), `moq` (default 1); `is_active`. Written by AddProduct/EditProduct/QuickUpdateStock/OCR scan/BulkUpload/AI enhance/edge auto-creation; decremented by order flows and `deduct_stock` RPC.
- **product_batches** — `product_id` →products, `batch_number`, `expiry_date` (NOT NULL), `manufacturing_date`, `quantity`. Read by the Products page expiry filter/badges; no UI writes batches (data would arrive via SQL/imports) — expiry badges only appear for products that have batch rows.
- **pharmacy_inventory** (authenticated pharmacy's own stock) — `pharmacy_id` →pharmacy_details, optional `stockist_id` provenance, `product_name`, `generic_name`, `manufacturer`, `category`, `pack_size`, `batch_number`, `hsn_code`, `gst_percentage`, `expiry_date`, `purchase_date`, `quantity`, `unit_price`, `sale_price`, `mrp`, `low_stock_threshold`. Read-only in the UI today (Inventory page lists it; Add/Edit unwired) — rows must originate outside the UI.
- **pharmacy_expiry_alerts** — auto-populated by DB trigger `trigger_create_expiry_alerts` on pharmacy_inventory insert/update (expiry >30d out): `pharmacy_id`, `inventory_id` →pharmacy_inventory, `product_name`, `batch_number`, `expiry_date`, `quantity`, `alert_days_before` (30), `status`, `acknowledged_at`. **No UI reads this table** — pure background data.
- **brand_products** — `brand_id` →brand_details, `product_name`, `generic_name`, `sku`, `batch_number` (all NOT NULL except generic), `category`, `manufacturer`, `description`, `image_url`, `mrp`, `selling_price`, `stock_quantity`, `prescription_required`, `is_active`. (PriceComparison's patient page queries `products` with these column names — schema mismatch documented in §11.)

### 13.3 Orders & delivery
- **orders** (the central B2B document) — `order_number` (unique human ref, see §10 numbering), `stockist_id` →stockist_details, `pharmacy_id` →pharmacy_details, `batch_cycle_id` →order_batch_cycles; money: `total_amount`, `net_amount`, `tax_amount`, `discount_amount`, `paid_amount`; status trio: `status` (draft/confirmed/cancelled), `payment_status` (paid/unpaid/partial), `delivery_status` (pending/dispatched/out_for_delivery/delivered); `order_source` (manual/platform/pharmacy_portal/whatsapp); `payment_due_date`, `payment_mode`, `delivery_date`, `delivery_address`, `notes`; bill capture: `bill_number`, `bill_image_url`. Three DB triggers fire on it (§14).
- **order_items** — `order_id` →orders, `product_name` (denormalized string — **no product_id FK**; items survive product deletion but stock updates must name-match), `product_description`, `quantity`, `unit_price`, `total_price`, `gst_percentage`, `tax_amount`, `batch_code`.
- **order_batch_cycles** — `stockist_id`, `cycle_start_date`, `cycle_end_date`, `delivery_date`, `status` (collecting/…), `total_orders`, `total_pharmacies`, `total_value`, `delivery_cost` (=orders×₹12), `cost_savings` (=orders×₹48). Written only by `create-batch-cycle` edge fn; read by BatchOrdering page.
- **patient_orders** (B2C) — `patient_id` →patient_details, `pharmacy_id` →pharmacy_details, `prescription_id` →patient_prescriptions, `delivery_address_id` →patient_addresses, `order_number`, `items Json` (embedded array, not a child table), `subtotal`, `delivery_fee`, `platform_fee`, `discount_amount`, `total_amount`, `order_status` (placed/confirmed/packed/dispatched/delivered/cancelled per dashboard color map), `payment_status`, `payment_method`, `delivery_slot`, `delivered_at`, `notes`. Read by patient dashboard/orders; **never inserted by the UI** (patient checkout is a demo stub).
- **patient_order_tracking** — `patient_order_id` →patient_orders, `status`, `message`, `latitude`, `longitude`. Data-model only; no UI.
- **brand_orders** — `brand_id`, `patient_id`, `pharmacy_id`, `delivery_address_id`, `order_number`, `items Json`, `subtotal`, `delivery_fee`, `platform_fee` (NOT NULL), `pharmacy_commission` (NOT NULL — models the pharmacy's cut for fulfilling a brand D2C order), `total_amount`, `order_status`, `payment_status`, `payment_method`, `delivered_at`. Read by Brand dashboard/analytics/fulfilment KPIs; no insert path in UI.
- **delivery_tracking** — `route_execution_id` →route_executions, `pharmacy_id`, `order_id`, `collection_amount`, `payment_mode`, `delivered_at`, `notes`. Table + RLS exist; **RouteExecution page does not write it** (collections go straight to payment_confirmations) — dormant.
- **route_executions** — `stockist_id`, `starting_address`, `pharmacy_ids uuid[]`, `optimized_order uuid[]`, `total_distance`, `status` (default 'in_progress'), `started_at`, `completed_at`. Same: modeled but the RouteExecution page keeps route state in React only and never persists a row — dormant.

### 13.4 Payments & finance
- **payment_confirmations** — the payment-approval object: `stockist_id`, `pharmacy_id`, `order_id` (nullable: null = "apply FIFO across orders"), `amount`, `payment_type` (custom/route_collection/manual_mark_paid/manual_partial/manual_payments_page/full_outstanding/custom_amount/specific_order per creating surface), `payment_method`, `payment_proof_url` (schema-only; no upload UI), `status` (pending/approved/rejected/on_hold), `pharmacy_notes`, `stockist_notes` (approve fn writes an itemized credit/FIFO breakdown here), `processed_by`, `processed_at`.
- **payment_reminders** — `pharmacy_id`, `stockist_id`, `order_id`, `amount`, `message`, `reminder_date`, `scheduled_date`, `sent_at`, `status` (default/sent), `auto_reminder_enabled` (schema-only — no scheduler exists). Written by Payments page Send Reminder and PharmacyRemindersList Nudge.
- **invoices** — `user_id` →profiles, `invoice_number`, `invoice_type`, `amount`, `tax_amount`, `total_amount`, `due_date`, `status`, `paid_at`, `invoice_url`. Dormant (no UI).
- **platform_fees** — `fee_name`, `fee_type` (percentage/fixed), `fee_value`, `calculation_method`, `applies_to` (stockist/pharmacy/both), `min_amount`, `max_amount`, `effective_from/to`, `is_active`. Admin CRUD only; **no fee is ever applied to an order anywhere in code**.
- **commission_ledger** — `user_id`, `order_id`, `commission_type`, `commission_rate`, `commission_amount`, `status`, `paid_at`, `payment_reference`. Dormant.
- **mr_order_commissions** — `mr_id` →mr_details, `order_id` →orders, `pharmacy_id`, `commission_amount` (default 0), `commission_rate`, `status`, `paid_at`. Read by MR Collections/Analytics; nothing in the UI creates rows.
- **subscription_plans** / **user_subscriptions** — SaaS billing scaffold (`plan_name`, `price`, `billing_cycle`, `features Json`, `max_products/pharmacies/orders_per_month`, `user_type`; subscriptions with `start/end_date`, `status`, `auto_renew`, payment dates). Entirely dormant.

### 13.5 Network, registration & territory
- **pharmacy_registration_requests** — full application snapshot (all pharmacy fields + `whatsapp_number`, `google_maps_name`, `location_coordinates`) + document URLs (`drug_license_url`, `gst_certificate_url`, `other_documents_url`) + dual-approval state machine: `status` (pending→approved/rejected), `admin_approved(+_at,_by)`, `stockist_approved(+_at,_by)`, `stockist_id` (set by the approving stockist), `rejection_reason`. Public INSERT policy allows unauthenticated submission.
- **pharmacy_stockist_connections** — `pharmacy_id`+`stockist_id` with per-relationship `credit_limit`, `outstanding_balance`, `last_order_date`, `is_active`. Modeled many-to-many trade relationship; **current code derives relationships from orders instead** — dormant.
- **pharmacy_documents** — `pharmacy_id`, `document_type`, `document_url`, `document_number`, `issue_date`, `expiry_date`, `status` (pending/verified/rejected via admin DocumentVerification page; code also writes `verification_status` naming per page — page sets status fields + `verified_at/by`, `rejection_reason`, `notes`).
- **territories** — admin-defined: `territory_name`, `state`, `district s[]`... actually `districts text[]`, `pin_codes text[]`, `territory_manager`, `is_active`. Reference data only (nothing enforces territories at order time).
- **stockist_service_areas** — `stockist_id`, `pin_code`, `area_name`, `district`, `state`, `is_active`. Enforced in: verify-pharmacy-license PIN check, StockistApprovals request filtering, BrowseStockists sorting.
- **stockist_delivery_dates** — `stockist_id`, `delivery_date`, `is_active`, `notes`. Set in DeliverySettings; surfaced as "next delivery" in BrowseStockists.
- **stockist_delivery_rules** — `stockist_id`, `rule_type` (order_amount/flat_fee/distance), `rule_name`, `flat_fee`, `min_order_amount`, `per_km_charge`, `base_distance_km`, `min_profit_amount` (unused), `free_on_delivery_date` (unused), `priority`, `is_active`. Consumed by calculate-delivery-fee.
- **batch_delivery_rules** — `stockist_id`, `delivery_day`, `min_order_value`, `require_payment_clearance`, `max_payment_overdue_days`, `is_active`. Dormant (no UI, not read by create-batch-cycle).

### 13.6 Patient engagement (mostly dormant beyond reads)
- **patient_addresses** — `patient_id`, `address_type`, `address_line`, `landmark`, `city`, `state`, `pin_code`, `latitude/longitude`, `is_default` (profile page enforces single default by unsetting others).
- **patient_prescriptions** — `patient_id`, `prescription_image_url` (NOT NULL), `prescription_date`, `medicines Json`, `doctor_name`, `clinic_name`, `diagnosis`, `notes`, `validity_days`, `is_active`. UI writes only image+date.
- **patient_refill_reminders** — `patient_id`, `medicine_name`, `frequency_days`, `last_refill_date`, `next_refill_date`, `is_active`. Read by dashboard "Pending Refills" KPI; no create UI.
- **patient_wishlist** — `patient_id`, `product_id`, `product_name`, `product_price`, `stockist_id`. Read+delete in UI; no add path wired.
- **wishlist** — generic (`user_id`, `product_id`, `product_type`) — dormant duplicate.
- **loyalty_points** (`points_balance/earned/redeemed`, `tier`) & **loyalty_transactions** (`points`, `transaction_type`, `order_id`, `description`) — dormant.
- **referrals** — `referrer_id`, `referee_id`, `referral_code`, `reward_amount`, `status`, `completed_at` — dormant.
- **ratings_reviews** — polymorphic `entity_type`+`entity_id`, `rating`, `review_text`, `is_verified_purchase`, `is_active` — dormant.
- **search_history** — `user_id` (nullable; anonymous insert policy exists), `search_query`, `search_type`, `results_count` — dormant.

### 13.7 Brand compliance
- **brand_campaigns** — `brand_id`, `campaign_name`, `campaign_type` (UI hardcodes "discount"), `description`, `discount_percentage`, `budget`, `actual_spend`, `start_date`, `end_date` (NOT NULL), `status` (UI inserts "draft"), `target_region text[]`.
- **brand_batch_verification** — anti-counterfeit: `brand_id`, `product_id` →brand_products, `batch_number`, `manufacturing_date`, `expiry_date`, `quantity`, `verification_code`, `qr_code_url`, `is_verified`. Public SELECT policy ("Public verify batches") exists but no verification UI.
- **batch_recalls** — `recall_number` (RCL-{ts}), `batch_number`, `product_name`, `manufacturer`, `severity` (critical/high/medium/low), `recall_reason`, `instructions`, `recall_date`, `status` (active/resolved), `initiated_by`, `affected_users_count`, `cdsco_reference` (Indian regulator ref — schema-only).
- **disputes** — `dispute_number`, `dispute_type`, `filed_by` →profiles, `pharmacy_id`, `stockist_id` (both NOT NULL), `order_id`, `subject`, `description`, `priority`, `status` (open/in_progress/resolved/closed/escalated), `assigned_to`, `resolution`, `resolved_at`. Admin resolves; **no user-facing "raise dispute" UI exists** — rows must be created externally.

### 13.8 Governance & communications
- **admin_notices** — `title`, `content`, `notice_type` (announcement/alert/update/warning/recall), `priority` (low/medium/high/urgent), targeting arrays `target_role/pin_codes/batch_codes/states/districts`, `expires_at`, `is_active`, `created_by`.
- **user_notice_recipients** — fan-out rows (`notice_id`, `user_id`, `read_at`, `dismissed_at`; unique notice+user). Created by `distribute_notice_to_users` RPC; consumed by stockist NoticesPanel.
- **message_templates** — `template_name`, `template_type` (email/sms/whatsapp), `category`, `subject`, `content` with `{variable}` placeholders, `variables Json`, `is_active`. Referenced by notification_queue.template_id but no send pipeline uses them.
- **notification_queue** — `user_id`, `notification_type`, `channel`, `template_id` →message_templates, `variables Json`, `recipient_email/phone`, `scheduled_at`, `sent_at`, `delivered_at`, `status` (pending=unread in the bell), `error_message`. Read by NotificationBell (patient/brand navs); **nothing enqueues or sends** — a queue with no producer or worker.
- **notification_preferences** — per-user switches `push/email/sms/whatsapp/marketing_enabled` (1:1 user). Exists in DB; the Settings page switches do NOT read/write it.
- **communication_log** — `pharmacy_id`, `type` (whatsapp), `message`, `status`, `sent_at`. Written by Payments page reminder flow only.
- **support_tickets** — `user_id`, `subject`, `category`, `priority`, `status`, `description`. Full lifecycle on the Support page (create + self-mark-resolved). No admin ticket console.
- **audit_logs** — `user_id`, `action`, `entity_type`, `entity_id`, `details Json`, `ip_address` (always null — client sends null), `user_agent`. Written via `useAuditLog` (admin user actions) — viewed at /admin/audit-logs.
- **activity_log** — stockist-scoped feed: `stockist_id`, `activity_type` (catalogue_update/price_change/order_modified/payment_reminder/payment_received/order_created/stock_reduced/product_created), `description`, `metadata Json`.
- **analytics_events** — `user_id`, `event_type`, `event_data Json`, `page_url`. Insert policy open to all; no code writes events — dormant.
- **platform_settings** — key/value store: `setting_key` (`app_info`, `{role}_announcement`), `setting_value Json`, `target_role`, `is_active`. Read/written by Settings page.
- **catalogue_rate_limits** — `identifier` (license/IP), `action_type` (license_verify/order_create/payment_submit envisioned; only license_verify used), `attempt_count`, `last_attempt_at`. Managed exclusively by `check_rate_limit` RPC under service role.

### 13.9 RPC signatures (types.ts Functions)
- `check_rate_limit(p_identifier, p_action_type, p_max_attempts, p_time_window_minutes) → jsonb {allowed, attempts_remaining | retry_after…}`
- `deduct_stock(p_product_id uuid, p_quantity int) → boolean` (false when insufficient)
- `distribute_notice_to_users(p_notice_id, p_target_role?, p_target_pin_codes?, p_target_batch_codes?, p_target_states?, p_target_districts?) → integer` (recipient count)
- `has_role(_user_id, _role app_role) → boolean` · `is_admin() → boolean` (both SECURITY DEFINER, used inside RLS)
- `search_users_by_batch_code(p_batch_code) → rows {user_type, user_id, user_name, contact_phone, product_count}`

---


## 4B.22 ERP workflow narratives

## 19. END-TO-END WORKFLOW NARRATIVES (step-by-step, exactly as the code executes)

### 19.1 Account creation → first dashboard (any role)
1. `/login` Sign Up tab: pick 1 of 5 role cards (admin excluded), email+password (≥6, confirmed). 2. `supabase.auth.signUp` (email redirect back to /login). 3. Client upserts `user_roles{user_id, role}` then `profiles{id, email}`. 4. Navigate straight to `roleConfig[role].onboarding`. 5. AuthContext sign-in effect fetches the role + the role's detail row; `onboardingComplete[role]=false` only when the detail query succeeds AND returns nothing. 6. Onboarding page inserts `{role}_details` → role dashboard. 7. Any later login: ProtectedRoute redirects to onboarding only if the detail row is still missing; errors fail open to the dashboard (anti-redirect-loop choice).

### 19.2 Pharmacy network formation (three distinct paths)
- **Path A — stockist manual add**: Pharmacies → AddPharmacyDialog. Insert `pharmacy_details` with `profile_id = stockist_details.id` (stockist ownership for RLS) + placeholder order `INIT-{ts}` (₹0/paid/delivered) so the orders-derived pharmacy list includes it instantly. No login is created; the pharmacy participates via the public catalogue using its drug license as the credential.
- **Path B — public self-registration + dual approval**: anonymous form at `/pharmacy-registration` (docs uploaded to the bills bucket) → `pharmacy_registration_requests{status:pending}`. Admin (all requests) and stockists (only requests whose PIN ∈ their active service areas) each approve independently: each approval sets its own flag; whichever approval lands **second** flips `status='approved'` and inserts `pharmacy_details` (stockist path sets profile_id = own stockist id; admin path uses the admin's own stockist_details lookup — see §11). Admin rejection requires a written reason. Realtime keeps both approval screens live.
- **Path C — pharmacy self-signup with login**: Login signup role=pharmacy → PharmacyOnboarding inserts `pharmacy_details` keyed by `auth_profile_id` (no owning stockist). Such a pharmacy uses the authenticated portal; a stockist-owned record for the same real-world pharmacy would be a separate row.

### 19.3 Order lifecycle (B2B, all sources converge on `orders`)
Creation (any of): stockist OrderCreation / QuickOrder (AI-parsed WhatsApp text) / QuickBill / BillUpload OCR (`process-bill-image`) / pharmacy portal checkout (per-stockist split + `deduct_stock` RPC + delivery fee) / public catalogue checkout (`create-platform-order`, PLT- number, per-item GST). All insert order (confirmed/unpaid/pending) + order_items, then reduce stock (client decrement, RPC, or edge ilike-match). DB trigger recalculates the pharmacy's outstanding_balance on every insert/update. Fulfilment: delivery_status pending → dispatched/out_for_delivery → delivered via the Pharmacies-page inline select, OrderActionsDropdown, or RouteExecution "Mark Delivered". Cancellation: status='cancelled' → trigger credits any paid_amount to credit_balance and the balance trigger drops it from outstanding. Editing: OrderItemsDialog (from order detail / pharmacy rows) mutates items.

### 19.4 Payment settlement (the money loop)
1. **Initiation** — pharmacy side: catalogue MarkPaymentDialog or post-checkout UPI screen → `mark-payment-paid` → **pending** payment_confirmation; stockist side: custom-amount input, Mark Paid buttons, partial-payment dialog, route collections → **approved** confirmations created directly (self-approved). 2. **Approval** — dashboard card or /stockist/payment-approvals → `approve-reject-payment` (approve/reject/on_hold; on_hold reversible). 3. **Application on approve** — credit-first (`creditUsed=min(amount, credit_balance)`), then FIFO oldest-first over unpaid/partial non-cancelled orders (or the single order when order_id set), 0.01 tolerance for 'paid', leftover → credit_balance, itemized note into stockist_notes, plus a self-healing pass marking any order with |total−paid|<0.01 as paid. 4. **Safety nets** — DB triggers clamp overpayment into credit and keep outstanding_balance canonical. 5. **Visibility** — pharmacy catalogue dashboard shows request statuses (⏳/✓/✗/⏸) and live balances via realtime; stockist Payments page tallies pending vs received-this-month.

### 19.5 Delivery-route day (stockist field workflow)
Quick Actions → Map Route: choose start address + pharmacies with undelivered orders → either "Open in Google Maps" (waypoint URL) or "Start Route with AI" → RouteExecution: `optimize-route` (Google Distance Matrix if key set, else random 5–20 km estimates) orders the stops; drag-drop reorder is cosmetic. Per stop: WhatsApp dispatch notification, per-order UPI payment links, cash/online/cheque collection recorded as approved route_collection confirmations with FIFO application, bulk mark-delivered. Nothing persists to route_executions/delivery_tracking.

### 19.6 Notices & recalls (admin → users)
Notice: admin composes with role/PIN/state/district/batch targeting → insert admin_notices → `distribute_notice_to_users` fan-out → stockist dashboards' NoticesPanel (realtime, read/dismiss per user). Recall: admin creates RCL record; `search_users_by_batch_code` identifies exposed stockists (products) and pharmacies (order history); notices with target_batch_codes can then reach affected stockists; Mark Resolved closes it. useAdminNotifications toasts other admins in-session.

### 19.7 Batch ordering cycle
BatchOrdering page → if no `status='collecting'` cycle, "Start New Cycle" → `create-batch-cycle` edge fn aggregates the stockist's pending+confirmed orders in the date range, stamps them with batch_cycle_id, and stores totals plus the modeled economics (delivery_cost = orders×₹12 vs individual ₹60 → cost_savings). No UI advances a cycle past 'collecting'.


## 4B.23 HUB user journeys (complete)

## 19. COMPLETE USER JOURNEYS (end-to-end, per role)

### 19.1 Customer (patient)
1. **Register** (3 steps, auto-active, no approval) → login (role "Patient") → `/customer`.
2. **Find medicine**: Dashboard → Search (cheapest-first across visible pharmacy inventories) or Pharmacies (PIN-matched via `pharmacy_serviceable_areas`) → pharmacy page → add to cart (single-pharmacy cart; switching pharmacy prompts clear).
3. **Order**: Cart → Checkout → delivery/pickup → fee + flat 5% GST → payment cash / pay_at_store / UPI(+proof upload, status "claimed") → Rx upload if cart has Rx items → order `pending`, pharmacy notified. (Alternate: inline order on pharmacy page — no GST/fee; or `upload-prescription` which creates an item-less `order_type:"prescription"` order for the pharmacy to price.)
4. **Track**: order detail stepper; pharmacy confirms (stock deducted) → prepares → out_for_delivery/ready_for_pickup → delivered. Customer may Cancel (pending/confirmed; restocks if confirmed+), "I've Paid", Reorder, Return (→ `customer_returns` pending), Review (writes orphan `reviews`), download invoice.
5. **Consult**: Book (choose doctor/type/free datetime, fee shown, pay-later or self-attested UPI) → doctor runs booked→in_progress→completed → prescription written → "Order Prescription Items" seeds cart at price 0 → pharmacy auto-prices. Reminders (localStorage), Wishlist, Addresses, Health profile support the loop.

### 19.2 Pharmacy (dual-mode)
1. **Register** (5 steps, docs) → pending → admin approves → login. **Purchase mode**: Find stockists → add to circle → order via stockist page cart (credit-limit enforced) or Quick Order (AI text parse → best-stockist ranking; no credit check) → stockist fulfils → on delivery stockist auto-populates `pharmacy_inventory` → pharmacy pays (Record Payment w/ UPI proof, status pending) or is collected from; ledger/credit notes track balance; returns requested via order detail.
2. **Inventory**: add manually (AI autofill), bulk-import from stockist catalog (qty 0, hidden), audit/expiry manage, visibility toggle for the B2C shopfront.
3. **Sale mode**: customer order arrives (notification) → verify Rx (gate) → confirm (stock deducts) → price/substitute/partial as needed → assign own delivery staff or ready_for_pickup → delivered (commissions fire if prescription-linked) → B2C bill, UPI verification, Mark Paid, customer-return approvals (refund only, no restock).
4. **Doctor partnerships**: accept doctor requests, per-rule commissions accrue on delivered Rx orders, Mark Paid per earning.

### 19.3 Stockist
1. **Register** (PIN-gated by `admin_serviceable_areas`, bank required) → approval → build catalog (form + AI, bulk XLSX, AI bill scan, batches via BatchManager).
2. **Circle**: find/accept pharmacies, set credit_limit/terms/blocked, monitor Net Due.
3. **Order lifecycle**: create manually/WhatsApp-parse (stock decrements at create) or receive platform/quick orders → packed (second deduction — known defect) → dispatched → assign staff (least-loaded suggestion) → out_for_delivery → delivered (+auto-populate pharmacy inventory). Edit/split/partial/duplicate/cancel/return along the way; bill per order or bulk; packing slip print.
4. **Money**: FIFO collect dialog, manual record, staff-collection approvals, WhatsApp reminders, receipts, ledgers, credit notes; analytics/reports/exports; ops via staff, routes, holidays, serviceable PINs, expiry buckets, stock transfer, manufacturer returns.

### 19.4 Doctor
Register (fees defaulted 300/500/200) → approval → set availability (unused by booking) → receive bookings → run consult (paste meeting link, notes, status transitions, mark paid) → write prescription (templates, pharmacy-inventory-aware item search, walk-in patient lookup) → partner with pharmacies (request → pharmacy accepts) → commission earnings accrue on delivered Rx orders → track earnings/analytics/patients/follow-ups.

### 19.5 Delivery staff (both kinds)
Owner creates credentials (hash_password RPC) → `/staff/login` (dual-type verify) → 24h localStorage session → see assigned open orders → Plan Route (Google Maps waypoints) → Mark Delivered (stockist staff: photo proof + optional cash/online collection → owner approval queue; pharmacy staff: status flip only) → KPIs (pending/today/total).

### 19.6 Admin
Hidden login (5-tap) → dashboard KPIs → approval queues (stockist/pharmacy/doctor, doc iframes, per-doc status, reject reasons, bulk loops) → oversight (orders w/ status override RPCs, payments, bills, returns, commissions, consultations override, refund state machine on cancelled paid B2C orders) → user ops (suspend/restore, view-as, force reset email, partial merge) → comms (broadcast/targeted, support chat as `admin` sender, quick-question CRUD) → safety (counterfeit alerts fan-out, license-expiry nudges, reviews view) → config (settings hub, banners, plans, areas, reference lists, maintenance flag, ToS) → intelligence (analytics drill-down, revenue, platform invoice, geo, system report, active users, login/audit trails, api monitoring) → Flowboard encyclopedia + architecture AI chat.


## 5C. HUB flowboard state machines (design vs code)

## 20. FLOWBOARD DATASET & DATABASE-SIDE LOGIC (`supabase/functions/flowboard-data/index.ts`, 875 lines)

### 20.1 Function mechanics
- `META = { version: "5.0.0", lastUpdated: new Date() }` wrapped around every response; endpoint `?type=` ∈ sections | nodes | screens | routes | business-logic | infrastructure | database; anything else → 400 with the valid list. CORS `*`, no auth.
- **Auto-discovery**: `buildCompleteNodesBySection()` walks a hardcoded `routeGroups` model and synthesizes an `auto-{role}-{slug}` UI node for every routed component not already hand-documented (default priority medium/complexity simple/status implemented). `buildCompleteScreens()` similarly synthesizes a `scr-{role}-{component}` screen entry per route with placeholder annotations ("Standard loading state" etc.). So Flowboard always shows 100% route coverage, with hand-curated depth (~251 `id:` entries) for the important nodes.
- **`?type=database`**: calls `rpc("get_flowboard_schema")` with the **service-role key** (live Postgres introspection: columns/FKs/RLS policies); on failure falls back to `KNOWN_TABLES` — a static list of 59 names returned with empty columns/FKs/policies. The static list includes `pharmacy_b2c_bills`, `tos_acceptances`, `tos_versions` which do NOT exist in the generated client types (historical/planned tables).

### 20.2 Database triggers documented in the model (server-side, not visible in client code)
`validate_order_status_transition` (BEFORE UPDATE on `orders`) and `validate_customer_order_status_transition` (BEFORE UPDATE on `customer_orders`) — DB-level status-transition guards (this is why admin overrides need SECURITY DEFINER RPCs "bypassing DB trigger validation"); `auto_hide_oos_products` (products BEFORE UPDATE), `auto_hide_expired_pharmacy_inventory` (pharmacy_inventory BEFORE UPDATE), `update_updated_at_column` (multiple tables), `handle_new_user` (auth.users AFTER INSERT — bootstraps `profiles`).

### 20.3 State machines as modeled (11) — with divergences from actual UI code
The model defines machines for B2B order (includes a `processing` state the UI never sets except in the "active" tab grouping), B2C order (**model says stock deducts at `preparing`; actual code deducts at `confirmed`**), B2B payment (unpaid→partial→paid), returns (model says `approved`; **code writes `completed`**), consultation (model includes a `confirmed` state; **code goes booked→in_progress→completed**), B2C payment (unpaid→paid→verified; code also uses `claimed`/`rejected`), approval (adds suspended↔approved and rejected→pending resubmission), customer return (model has `refunded`; code stops at approved/rejected), bill (draft→finalized→paid; **code writes `confirmed`/`final`, never draft**), credit note (active→used/expired; code never writes expired), partnership (pending→active⇄inactive / rejected). Treat the model as design intent; §9 of this document is the code truth.
- Model's RPC notes add server-side detail: `deduct_product_stock` is documented as **FIFO batch deduction looping batches by `expiry_date` ASC** (not a flat decrement), all stock/finance RPCs are SECURITY DEFINER, `verify_staff_credentials` uses **bcrypt**, `check_login_rate_limit` = 5 attempts / 15 min with cleanup in `record_login_attempt`.
- Infrastructure block lists buckets as `documents` (private, signed-URL), `avatars` (public — not referenced by current client code, which uses `public-assets`), `product-images` (public), `platform` (public); realtime tables notifications/messages/chat_messages; auth email-confirm on, email provider only.


---

## 4D. Additional merged specifications

### 4D.1 HUB complete route inventory (217 routes)

## 14. COMPLETE ROUTE INVENTORY (every route in `src/App.tsx`, verified)

### 14.1 Public / auth / staff (no `ProtectedRoute`)
| Route | Page | Notes |
|---|---|---|
| `/` | `RootRedirect` | role-priority redirect admin→stockist→pharmacy→customer→doctor→/login |
| `/login` | Login | role picker, admin 5-tap reveal, PWA install banner |
| `/register` | Register | 4 registration flows |
| `/forgot-password` | ForgotPassword | email reset link |
| `/reset-password` | ResetPassword | PASSWORD_RECOVERY handler |
| `/pending-approval` | PendingApproval | approval status + doc resubmission |
| `/onboarding/stockist`, `/onboarding/pharmacy` | static 3-slide carousels (never auto-navigated to) |
| `/staff/login`, `/staff` | StaffLogin / StaffDashboard | localStorage session, NOT Supabase auth |
| `/verify-bill/:billId` | VerifyBill | public bill verification (QR target) |
| `*` | NotFound | logs `console.error` with attempted path; "Return to Home" link |

`Index.tsx` (14 lines) is an unused placeholder ("Start building your amazing project here!") — not routed.

### 14.2 Role route trees (exact)
- **/stockist** (39 child routes): index Home; `products`, `products/add`, `products/:id`, `products/:id/edit`, `products/:id/price-history`; `orders`, `orders/create`, `orders/:id`; `pharmacies`, `pharmacies/find`, `pharmacies/:id`, `pharmacies/:id/ledger`; `more`, `payments`, `analytics`, `profile`, `business`, `export`, `reports`, `settings`, `help`, `notifications`, `privacy-security`, `returns`, `expiry-management`, `serviceable-areas`, `staff`, `staff/add`, `staff/:id/edit`, `delivery-routes`, `holidays`, `chats`, `chat/:peerId`, `messages`, `credit-notes`, `export-catalogue`, `bill-history`, `batch-management`, `record-payment`, `manufacturer-returns`, `bulk-bill`, `expiry-calendar`, `stock-transfer`.
- **/pharmacy** (44 child routes): index Dashboard; `orders`, `orders/quick`, `orders/:id`; `stockists`, `stockists/find`, `stockists/:id`; `browse`; `inventory`, `inventory/add`, `inventory/:id`, `inventory/:id/edit`; `more`, `profile`, `business`, `notifications`, `payments`, `analytics`, `export`, `reports`, `returns`, `help`, `privacy-security`, `settings`; `customer-orders`, `customer-orders/:id`; `staff-management`(+`/add`,`/:id/edit`); `delivery-routes`, `serviceable-areas`, `consultations`, `doctors`, `doctors/:id`, `expiry-management`, `chats`, `chat/:peerId`, `messages`, `commissions`, `customer-list`, `customer-list/:id`, `b2c-bills`, `quick-order-history`, `reorder-history`, `inventory-audit`, `stock-audit`, `bulk-import`, `recurring-orders`, `ledger/:stockistId`, `customer-returns`.
- **/customer** (31 child routes): index Dashboard; `orders`, `orders/quick`, `orders/:id`, `orders/:orderId/return`, `orders/:id/track`, `orders/:id/review`; `cart`, `checkout`; `pharmacies`, `pharmacies/:id`; `prescriptions`, `prescriptions/:id`; `consultations`, `consultations/book`, `consultations/:id`; `more`, `profile`, `settings`, `notifications`, `help`, `privacy-security`, `addresses`, `reminders`, `search`, `messages`, `chats`, `chat/:peerId`, `upload-prescription`, `health-profile`, `past-doctors`, `wishlist`.
- **/doctor** (23 child routes): index Dashboard; `consultations`(+`/:id`), `patients`(+`/:id`), `analytics`, `prescriptions`(+`/:id`, `/write`), `availability`, `earnings`, `more`, `profile`, `settings`, `notifications`, `help`, `privacy-security`, `pharmacies`(+`/:id`), `prescription-templates`, `messages`, `chats`, `chat/:peerId`.
- **/admin** (56 child routes): index Dashboard; `pharmacies`(+`/:id`), `stockists`(+`/:id`), `orders`(+`/:id`), `more`, `counterfeit`, `analytics`, `settings`, `notifications`, `messages`(+`/:userId`), `doctors`(+`/:id`), `customers`(+`/:id`), `customer-orders`(+`/:id`), `consultations`(+`/:id`), `returns`, `login-history`, `activity-log`, `commissions`, `delivery-staff`, `export`, `payments`, `bills`, `users`, `system-architecture`, `help`, `audit-trail`, `reviews`, `profile`, `refunds`, `revenue-detail`, `platform-invoice`, `banners`, `drug-schedules`, `product-categories`, `specializations`, `pharmacy-categories`, `serviceable-areas`, `subscriptions`, `impersonate`, `force-reset`, `system-report`, `active-users`, `maintenance`, `tos-management`, `license-expiry`, `merge-accounts`, `api-monitoring`, `geo-distribution`.

---

## 15. FULL DATA DICTIONARY (every table in `types.ts`, field-by-field)

Legend: `s`=string, `n`=number, `b`=boolean, `?`=nullable. Writers/readers from actual UI code.

### 15.1 Identity & access
- **profiles** (11): `id, user_id, full_name?, email?, phone?, avatar_url?, tos_accepted_at?, data_download_requested_at?, last_active_at?, created_at, updated_at`. One per auth user (all roles). Written at signup, ToS acceptance (`useToSAcceptance`), 5-min session heartbeat (`updated_at`). Read by TopNav avatar, admin user search/impersonate/targeted notifications.
- **user_roles** (3): `id, user_id, role(app_role enum: admin/stockist/pharmacy/customer/doctor)`. Inserted at registration; read at every login (role-match gate) and by `useAuth`. One user CAN hold multiple roles (RootRedirect picks by priority).
- **login_attempts** (4): `id, email, success:b, attempted_at`. Written by `record_login_attempt` RPC on every login try; read by `check_login_rate_limit` (15-min lockout) and AdminLoginHistory.
- **login_activity** (7): `id, user_id, status, device_info?, ip_address?, location?, created_at`. Read by AdminActivityLog, AdminActiveUsers, and per-role PrivacySecurity pages (last 10 logins). Re-pointed by MergeAccounts.
- **stockist_profiles** (26): business_name, business_type?, pan_number?, phone/whatsapp_number/email?, address/city/state/pin_code?, approval_status?, rejection_reason?, drug_license_url?, gst_certificate_url?, wholesale_license_url?, fssai_license_url?, drug_license_expiry?, bank fields (bank_name, account_number, ifsc_code, upi_id, account_holder_name), user_id, timestamps. `id` is the key used by ALL stockist child data.
- **pharmacy_profiles** (33): pharmacy_name, pharmacy_type?, license_number?, owner_name/owner_designation/owner_contact?, phone/whatsapp_number/email?, address/city/state/pin_code?, approval_status?/rejection_reason?, drug_license_url?/gst_certificate_url?/pharmacy_certificate_url?/drug_license_expiry?, bank fields + upi_id?, B2C commerce config: `delivery_fee?`, `free_delivery_above?`, `min_order_amount?` AND duplicate `minimum_order_amount?` (both exist), `operating_hours:Json?`, user_id, timestamps.
- **customer_profiles** (18): full_name, phone/email?, gender?, date_of_birth?, address/city/state/pin_code?, health fields `blood_group?, allergies?, chronic_conditions?, emergency_contact?`, avatar_url?, user_id, timestamps. No approval gating.
- **doctor_profiles** (26): full_name, specialization, qualification?, registration_number?, experience_years?, bio?, consultation_fee_audio/video/clinic?, `is_available?` (booking-list filter), approval_status?/rejection_reason?, medical_certificate_url?, id_proof_url?, `id_proof_status?` (approval_status enum — per-document status used by AdminDoctorDetail), avatar_url?, contact/address fields, user_id, timestamps.

### 15.2 Catalog & inventory
- **products** (33, stockist catalog): name, brand?, manufacturer?, category?, composition?, description?, pricing `mrp?, sale_price?, price?` (price kept = sale_price), `purchase_rate?`, stock `stock_quantity?, reserved_quantity?` (reserved never written by UI), `in_stock?`, `min_stock_level?, min_order_quantity?, moq?` (moq unused duplicate), `batch_number?, expiry_date?` (headline, mirrors latest batch), regulatory `hsn_code?, gst_rate?, drug_schedule?, drug_type?, fssai_license?, requires_prescription?, is_narcotic?`, `pack_type?, pack_size?, unit?`, image_url?, stockist_id. Created via ProductForm / BulkUploadCatalogue / BulkUploadPurchaseBill (upsert-by-name) / SharedProductDetail Clone. Deleted via detail-page confirm. Stock mutated by decrement_stock/deduct_product_stock/restore_product_stock RPCs, BatchManager re-aggregation, returns restock.
- **product_batches** (9): product_id, batch_number?, mrp?, sale_price?, purchase_rate?, stock_quantity?, expiry_date?, created_at. Written only by BatchManager and return-FIFO-restock; zeroed by ExpiryManagement Dispose and moved by StockTransfer.
- **product_media / pharmacy_inventory_media** (6 each): `image_url, is_primary, sort_order` + parent id. Delete-all-then-reinsert on gallery save.
- **product_categories** (4) / **pharmacy_categories** (3) / **drug_schedules** (5: schedule_name, description?, restrictions?) / **doctor_specializations** (3): admin CRUD config lists. NOTE: product forms actually use the hardcoded `PRODUCT_CATEGORIES`/`DRUG_SCHEDULES` constants, not these tables — the admin CRUD tables are not consumed by the forms.
- **pharmacy_inventory** (32): mirrors products schema (product_name instead of name, quantity instead of stock_quantity) + `is_visible_to_customers?`, `source_product_id?`, `source_stockist_id?` (set by bulk-import/auto-populate lineage), unit?. Rows created by: PharmacyInventoryForm, PharmacyBulkImport (qty 0, hidden), stockist-side `autoPopulateInventory` on B2B delivery (visible, qty added). Deducted by `deduct_pharmacy_inventory` on B2C confirm; restored by `restore_pharmacy_inventory` / cancel-restock.

### 15.3 B2B commerce
- **orders** (22): order_number, stockist_id, pharmacy_id, status?, payment_status, total_amount?, items_count, order_source (manual/whatsapp/platform/quick_order/split), notes?, `parent_order_id?` (split lineage), `partial_delivery_items:Json?`, `applied_credit_note_id?`, `credit_discount?`, delivery: `assigned_staff_id?`, `delivered_at?`, `delivery_proof_url?`, collection: `delivery_collected_amount?`, `delivery_payment_method?`, `delivery_payment_status?` (pending_approval/approved/rejected), timestamps.
- **order_items** (7): order_id, product_id, quantity, price?, `requested_batch?` (pharmacy can request a batch), created_at.
- **order_returns** (10): order_id, stockist_id, pharmacy_id, product_id, quantity, reason?, refund_amount?, status (pending/completed/rejected), created_at. Pharmacy requests → stockist approves/rejects; stockist can also create directly as completed.
- **order_status_history** (8): order_id, order_type, old_status?, new_status, changed_by?, notes?. Exists in schema; UI reads/writes it only sporadically (status transitions largely don't append here).
- **delivery_staff / pharmacy_delivery_staff** (12 each): name, phone, username, password_hash, is_active, aadhar_number?, age?, police_verification_id?, photo_url?, owner id. Auth via `verify_staff_credentials` RPC only.
- **delivery_settings** (8): stockist_id, pin_code, delivery_charge, delivery_days:s[], estimated_hours, free_delivery_above. Per-PIN config surfaced in QuickOrder "next delivery day".
- **delivery_route_templates** (6): stockist_id, name, pharmacy_ids:s[], notes?. Saved multi-stop selections.
- **stockist_holidays** (7): start_date, end_date, reason?, allow_preorder:b. Blocks/labels pharmacy ordering.
- **serviceable_areas** (4): stockist_id + pin_code (stockist coverage). **admin_serviceable_areas** (6): platform-level PIN whitelist (`is_active`) gating stockist registration. **pharmacy_serviceable_areas** (7): pharmacy_id, pin_code, delivery_charge?, estimated_hours?, free_delivery_above? — drives customer pharmacy discovery.

### 15.4 B2C commerce
- **customer_orders** (25): order_number, customer_id, pharmacy_id, status?, order_type? (delivery/pickup/prescription), payment_method?, payment_status?, total_amount?, delivery_fee?, gst_amount?, discount_amount? (schema-only, no UI writer), delivery_address?, delivery_pin_code?, prescription_id?, prescription_url?, prescription_verified?, upi_proof_url?, refund_status?, partial_items:Json?, assigned_staff_id?, delivered_at?, notes?, timestamps.
- **customer_order_items** (10): order_id, product_name, product_id?, quantity?, price?, requires_prescription?, `is_substitute?` + `original_product_name?` (substitution audit).
- **customer_returns** (8) + **customer_return_items** (5): pending→approved/rejected; refund_amount computed at approval; **no restock ever**.
- **customer_reviews** (10): customer_id, rating, comment?, pharmacy_id?/doctor_id?/order_id?, `reply?`+`reply_at?` (schema supports pharmacy replies; no UI writes replies). This is THE table read for all rating averages.
- **reviews** (7): customer_id, rating, comment?, target_type, target_id — written by CustomerReviewOrder, read nowhere (orphan write path).
- **customer_wishlist** (9): denormalized snapshot (product_name, price?, image_url?, pharmacy_name?, inventory_id?, pharmacy_id?).
- **customer_addresses** (9): label, address, city?/state?/pin_code?, is_default.

### 15.5 Finance
- **payments** (12): stockist_id, pharmacy_id, amount, payment_method, status (confirmed/pending), `collected_by?` (manual/delivery_staff/pharmacy), staff_id?, reference_id?, payment_proof_url?, notes?. Created by CollectPaymentDialog (confirmed), StockistRecordPayment (confirmed), staff-collection approval (confirmed), PharmacyPayments record-to-stockist (pending).
- **payment_reminders** (7): stockist_id, pharmacy_id, total_amount, sent_via ("whatsapp"), order_ids:s[]?.
- **bills** (12): bill_number, stockist_id, pharmacy_id, subtotal, total_amount, discount_type?/discount_value?, gst_amount? (never populated), due_date?, status ("confirmed" from BillPreviewDialog, "final" from BulkBill; "draft" never written). **bill_orders** (3): bill_id↔order_id join.
- **credit_notes** (9): credit_note_number ("CN-"+base36), stockist_id, pharmacy_id, order_id, return_id, amount, status (active/used). Created on returns; consumed in StockistCreateOrder.
- **subscription_plans** (9): name, price_monthly, price_yearly, target_role, features:Json?, is_active. Admin CRUD only — **no purchase/enforcement anywhere**.

### 15.6 Healthcare
- **consultations** (16): doctor_id, patient_id, pharmacy_id?, consultation_type (audio/video/clinic_visit), scheduled_at, fee, status? (booked/in_progress/completed/cancelled), payment_status?, meeting_link?, notes?, duration_minutes?, follow_up_date?/follow_up_notes?.
- **prescriptions** (8): doctor_id, patient_id, consultation_id?, pharmacy_id?, notes?, status?. **prescription_items** (9): product_name, product_id?, dosage?, duration?, quantity?, notes?.
- **prescription_templates** (5): doctor_id, template_name, items:Json.

### 4D.2 HUB admin module pages (full)

## 16. ADMIN MODULE — PER-PAGE DETAIL (previously only name-listed; now source-verified)

### 16.1 Entity detail pages (approval workbenches)
- **AdminStockistDetail** (`stockists/:id`, 245 lines): loads profile + last orders (`orders ⋈ pharmacy_profiles`) + circle rows (`stockist_pharmacy_circle ⋈ pharmacy_profiles`) + last 100 products. **Approve/Reject buttons** update `stockist_profiles.approval_status` directly; reject requires a typed `rejection_reason`; either action notifies the stockist. **Per-document status setter**: updates arbitrary `[field]: status` on the profile (doc-level approve/reject). Documents render in an **inline `<iframe>` viewer** (h-80). Tabs/sections: profile info, documents, connected pharmacies (circle with outstanding), products list, orders (click → `/admin/orders/:id`). Footer "Message" button → `/admin/messages/{user_id}`.
- **AdminPharmacyDetail** (`pharmacies/:id`, 265 lines): identical pattern — profile, iframe documents with per-doc status, circle (stockists side), last-100 `pharmacy_inventory`, orders, approve/reject + reason + notify, message button.
- **AdminDoctorDetail** (`doctors/:id`, 175 lines): doctor profile + consultation fees card + Account Status card (approve/reject w/ reason + notify) + Documents (medical certificate, ID proof; iframe) + consultations list.
- **AdminCustomerDetail** (`customers/:id`, 172 lines): customer profile + Orders (click→customer-order detail) + Consultations + Prescriptions lists + Message button. **AdminCustomers**: card list of all `customer_profiles`, newest first.
- **AdminConsultationDetail** (`consultations/:id`, 142 lines): patient + doctor cards, prescription list, and an **"Admin Override Status"** card that updates `consultations.status` directly (plain `.update()`, not an RPC).

### 16.2 Oversight & finance pages
- **AdminOrders** (`orders`): two tabs — B2B (`orders` all) and B2C (`customer_orders` all), cards navigate to respective detail pages.
- **AdminCustomerOrders**: flat list of all `customer_orders` → detail.
- **AdminPayments** (167 lines): B2B `payments` list + a second query of `customer_orders` treated as B2C payment records (click → customer-order detail).
- **AdminBills**: all `bills` read-only list.
- **AdminDeliveryStaff**: merges `delivery_staff` (⋈ stockist business name) + `pharmacy_delivery_staff` (⋈ pharmacy name) into one read-only roster with active badges.
- **AdminReviewsManagement**: reads `customer_reviews` with 5-star renderer; **read-only** (no delete/moderation action).
- **AdminLicenseExpiry**: stockist + pharmacy profiles with non-null `drug_license_expiry`; per-row "Send Notification" inserts a `notifications` row to the licensee (toast "Notification sent to {name}"). NOTE: selects `drug_license_number` which is not in generated types.
- **AdminConsultations**: flat list. **AdminReturns/AdminCommissions**: read-only (as previously noted).

### 16.3 Analytics & reporting pages
- **AdminAnalytics** (216 lines): one `["adminAnalytics"]` query across 7 tables (orders, payments, all 4 profile tables, customer_orders); KPI grid with a **drill-down panel** (clicking a stat opens a card listing the underlying rows for that `drilldown.type`).
- **AdminRevenueDetail**: period selector; delivered B2B revenue (⋈ pharmacy+stockist names), delivered B2C revenue (⋈ pharmacy+customer names), commission totals; "Revenue Trend (B2B + B2C)" chart + "Top Pharmacies by B2C Revenue".
- **AdminPlatformInvoice**: month picker (12 back); pulls delivered B2B + B2C totals, confirmed payments, and `platform_settings.platform_commission_pct` + `gst_rate_medicines` → computes a hypothetical platform commission invoice for that month. **Display-only; nothing is billed or persisted.**
- **AdminSystemReport**: whole-platform counts (4 profile tables head-counts, orders/customer_orders/payments/bills/consultations sums, product count, return count) + "Download" (client file, toast "Report downloaded").
- **AdminActiveUsers**: recent `login_activity` → dedup user_ids → join `profiles` + `user_roles` → active-user list (uses zero-UUID sentinel to avoid empty `.in()`).
- **AdminLoginHistory**: raw `login_attempts` (email/success/time). **AdminActivityLog**: raw `login_activity`. **AdminAuditTrail**: raw `admin_audit_log` list.
- **AdminApiMonitoring**: 7-day counts of orders/customer_orders/notifications/login_activity + total profiles/consultations shown as "Operations (Last 7 Days)"; health indicator hardcoded (no real probes).
- **AdminGeoDistribution**: state/city tallies across the 4 profile tables → "Top Cities" + "Users by State" lists.
- **AdminExportData**: per-table export buttons; `select("*").limit(5000)` → XLSX; toasts success/`No data to export`.

### 16.4 Configuration CRUD (exact behavior)
All follow the same pattern: list query, inline create form, toggle `is_active` where applicable, hard delete, `qc.invalidateQueries`.
- **AdminSubscriptions**: create needs name + monthly price (yearly optional, features text); toggle/delete. No consumer.
- **AdminBanners**: title required; message, banner_type, `target_roles[]`; toggle/delete. No renderer in any layout. (Earlier note about an image URL field applies to the prior iteration; the current table has no image column.)
- **AdminServiceableAreas**: `admin_serviceable_areas` pin/city/state; unique-PIN violation surfaces as toast error; toggling `is_active` immediately affects stockist-registration PIN gate.
- **AdminSpecializations / AdminDrugSchedules / AdminProductCategories / AdminPharmacyCategories**: name(+description/restrictions) create + delete; **not consumed by product/registration forms** (those use hardcoded constants), so these are admin-side reference data only.
- **AdminSettings** (192 lines) — the platform config hub: platform **logo upload** to `platform` bucket (upsert, public URL, key `logo_url` → consumed by TopNav); generic `saveSetting(key,value)` upsert into `platform_settings`; **platform commission %** (`platform_commission_pct`, numeric-validated); **GST rate per category** (`gst_rate_{category}`; note Checkout still hardcodes 5% — these settings are only read by AdminPlatformInvoice); **payment-method toggles** ("Payment methods saved"); **quick_questions CRUD** (question+answer+category; feeds chat-bot and ChatPage chips).

### 16.5 Admin misc
- **AdminMessages**: conversation list from `conversations` ⋈ `profiles` + last `chat_messages`; click → `/admin/messages/:userId` (ChatPage in admin mode — admin replies write `sender_type:"admin"`).
- **AdminProfileSettings / AdminMore / AdminHelpCenter**: standard profile form, MenuPage grid of all admin routes, static help.

---

### 4D.3 DSW stockist & pharmacy modules

### 3.6 Orders (`/stockist/orders` — `StockistOrders`)
- Sticky search (orderNumber/pharmacyName) + "Record" dropdown → only "Record Order (Phone/Walk-in)" → `/stockist/orders/create`.
- Tabs w/ live counts + icons: **new** (`getNewIncomingOrders` = 5; badge pulses), **active** (`getActiveOrders`), **delivered**, **all** (`mockOrders.length`=6). New tab renders `IncomingOrderCard`s (Accept/Decline dialogs → toast-only). Others render `OrderCard`s → detail / UpdateStatus / SharePaymentLink. Each tab has its own EmptyState.

### 3.7 Order Detail (`/stockist/orders/:id` — `OrderDetail`)
- `getOrderById` + `getPharmacyById`; else EmptyState. Header shows orderNumber + StatusBadge (from local `currentStatus`) + created datetime; Print (`window.print()` + toast), Share (→SharePaymentLinkDialog), Edit (→EditOrderItemsDialog).
- Pharmacy card (name/owner/phone/address, View→detail).
- **Order Items + totals:** `subtotal = Σ(rate*quantity)`; **`gstAmount = subtotal*0.18` (hardcoded 18%, ignores per-product gstRate of 5/12)**; Total shows `order.totalAmount` (the mock's pre-computed value, which used per-product GST — so displayed subtotal+GST(18%) will NOT equal displayed Total).
- Payment card: `paidAmount = Σ approved payments`, `pendingAmount = totalAmount - paidAmount`, paid/pending tiles, payment history rows, "Add Payment" (if pending) → AddPaymentDialog.
- **Delivery Status:** 6-option RadioGroup (pending/confirmed/processing/out-for-delivery/delivered/cancelled) with icons/colors. `isTerminalStatus` (delivered/cancelled) disables the other options. `handleStatusChange` = local state + toast (no persistence). "cancelled" shows a note.

### 3.8 Create Order (`/stockist/orders/create` — `CreateOrder`) — "AI Parsing"
- Select pharmacy (`mockPharmacies` = circle 8). Paste textarea (badge "AI Parsing" w/ Sparkles — cosmetic). `handleParseOrder`: split lines, regex `/^(.+?)\s+(\d+)\s*$/`, fuzzy substring match against `mockProducts`. Each ParsedItem: matched product (rate=salePrice) or unmatched (rate 0, with a "Match product…" Select). Editable qty (recomputes amount), remove.
- Status badges: {matched} Matched / {unmatched} Unmatched. Fixed bottom summary (shown when matched>0): `subtotal = Σ matched amount`; **`gst = subtotal*0.18`**; `total = subtotal+gst`. `handleCreateOrder` (needs pharmacy + ≥1 matched) = toast + `navigate('/stockist/orders')` (no persistence).

### 3.9 Create Bill (`/stockist/bills/create` — `CreateBill`)
- 3 stages: select → preview → success. Select pharmacy (mockPharmacies) → unpaid orders (`paymentStatus !== 'paid'`) with checkboxes + Select/Deselect All; discount (percent|fixed). Totals use **real per-order fields**: `selectedOrdersTotal = Σ totalAmount`, `selectedOrdersGst = Σ gstAmount`, `selectedOrdersSubtotal = Σ subtotal`; `discountAmount` = %·total or fixed; `finalAmount = total - discount`. `billNumber = BILL-${Date.now().slice(-8)}`.
- Preview: printable bill (header GSTIN **hardcoded `27AABCU9603R1ZM`**, "MedKart Distribution"). Success: share options.
- Actions: **`handleShareWhatsApp` opens a real `wa.me` URL (wired)**. Print/Download/CopyLink = toast/clipboard stubs.

### 3.10 Payments (`/stockist/payments` — `StockistPayments`)
- KPI card (3): Outstanding=`getTotalOutstanding()`, Pending=`getPendingPayments().length`, **Received = Σ approved payment amounts** (labeled "Received", uses ` approvedThisMonth`).
- Sticky search (pharmacyName/orderNumber) + "Send Reminder" (→SendReminderDialog) + pharmacy filter Select.
- Tabs: **Outstanding** (`mockOrders` where `paymentStatus !== 'paid'`; per-row `pendingAmount = totalAmount - paidAmount`; "Remind" toast-only), **Pending Approvals** (`mockPayments` status 'pending'; View Screenshot; **Approve/Hold/Reject all toast-only**, incl. quick-approve), **All Payments** (all filtered payments read-only).

### 3.11 Analytics (`/stockist/analytics` — `StockistAnalytics`)
- Date-range Select (today/week/month/quarter/year) — **does nothing**.
- KPIs: Total Revenue = `Σ delivered totalAmount` (real); Total Orders = `mockOrders.length` (real); Active Pharmacies = `mockPharmacies.length` (real); **Collection Rate = `(totalRevenue/(totalRevenue*1.2))*100 = 83.3%` (meaningless)**. Growth deltas **hardcoded** (+12.5% / +8.3% / +2 / −2.1%).
- Charts: `revenueData` (6-mo hardcoded LineChart), `orderStatusData` (hardcoded pie 45/12/8/3), `categoryData` (hardcoded bar). Top Pharmacies (real: top 5 by Σ order value), Top Products (real: `isTopSelling` sorted by salesCount, top 5).

### 3.12 Operational pages (page-local mock arrays; writes are stubs unless noted)
| Page | Route | Data | Status vocab | Key logic / notes |
|---|---|---|---|---|
| **Credit Notes** | `/stockist/credit-notes` | local `mockCreditNotes`(3) | pending/approved/processed/rejected | Summary: total, pending count, processed count, `totalPending=Σ pending totalAmount`. New/Approve/Reject toast-only. |
| **Delivery Routes** | `/stockist/routes` | local `mockRoutes`(3) + `mockPharmacies` stops | planned/in-progress/completed | "Today's Routes" = date `=== '2026-01-27'` (hardcoded); past routes else. Call staff (`tel:`) wired; Create Route toast. Per-stop completed via `index < completedCount`. |
| **Expiry Mgmt** | `/stockist/expiry` | `mockProducts` computed | expired/≤30/≤60/≤90 buckets | `getDaysToExpiry`; filter pills 30/60/90/180d; `totalValue = Σ(salePrice*stockQuantity)` for filtered; Return toast; Write-off (only if daysToExpiry≤0) toast. |
| **Purchase Orders** | `/stockist/purchases` | local `mockPurchaseOrders`(4) | draft/ordered/partial/received/cancelled | `pendingValue = Σ (ordered+partial) totalAmount`; Receive Stock / Send to Supplier / Create toast. |
| **Staff Mgmt** | `/stockist/staff` | local `mockStaff`(4) | active/on-leave/inactive | 3 stat cards; Call (`tel:`) wired; Add/Edit toast. |
| **Reports** | `/stockist/reports` | local `reportTypes`(6) | h1/hnx/gst/sales | Month/Year/Type Selects; Download = `setTimeout(2000)` toast (simulated); per-report type Badge. |
| **Documents** | `/stockist/documents` | local `useState(mockDocuments)`(4) | license/gst/invoice/other | Category chips; **Upload (via UploadDocumentDialog) & Delete mutate local state (real)**; Download/View stubs (DocumentPreviewDialog is a placeholder viewer). |
| **Notifications** | `/stockist/notifications` | local `useState`(5) | order/payment/alert/system | Filter chips; **mark-read / mark-all / delete real (local)**; Settings panel (4 Switches, local); ₹ amounts hardcoded in messages. |
| **Messages** | `/stockist/messages` | local `mockTickets`(3) + chat | open/pending/resolved | Ticket list + chat view; **send message real (local)**; bot auto-reply after 1.5s from random `adminResponses`(7); typing indicator. |
| **Help** | `/stockist/help` | local `faqs`(8) + `tutorials`(4) | — | Search filters FAQs (question+answer); Accordion; Chat/Call/Email/Tutorial/FeatureRequest all toast. |

### 3.13 More (`/stockist/more` — `StockistMore`)
- Profile card (`defaultStockistData` businessName/type/phone). Menu sections: Account (Profile, Business Details), Operations (Delivery Routes, Staff, Returns & Credits, Expiry, Purchase Orders), Finance (Payments **badge "3" hardcoded**, Analytics), Communication (Notifications **badge "5" hardcoded**, Support Chat toast), Documents & Security (Documents, Privacy & Security), Reports (Export Data→ExportDialog, Regulatory Reports), Preferences (App Settings, Help Center, **"Replay Welcome Tour"** = `localStorage.removeItem('stockist_tour_completed')` + toast — real). Logout→toast+/auth. Version "Digi Swasthya v1.0.0".

### 3.14 Settings
- **ProfileSettings:** photo (upload = "coming soon" toast). `ownerName` computed oddly as `accountHolderName.split(" ")[0] + " Kumar"` (→ "Rajesh Kumar"). Business info (name, ownerName). Contact info via `VerificationInput` for email & phone (both start "verified"; changing value resets to "unverified"; **OTP verify accepts ANY 6-digit code**). Alternate phone, WhatsApp Business number. Save = toast (validates required present). Change Password (current/new/confirm, show/hide, requires match + ≥8 chars) = toast.
- **BusinessSettings:** Business info + `DocumentUpload`×4 (all `verificationStatus="verified"`, compact) + address + bank details. Save = toast.
- **SecuritySettings:** 2FA Switch (toast), Phone card (**hardcoded `+91 98765 43210` Verified**) + Change Phone dialog (10-digit check → send OTP → verify requires 6 digits → toast). Login Notifications switch. Active Sessions from local `mockSessions`(4) — logout-session/logout-all mutate local array (real). Login History local `loginHistory`(5) (success/blocked). Delete Account dialog → toast.
- **AppSettings:** Theme (light/dark/system buttons; `handleThemeChange` = toast with comment "In a real app, you'd apply the theme here" — **inert**). Language (7 options) & Currency (INR/USD) Selects (local). Notifications (push/email/sms/sound/vibration Switches). Data & Sync (autoSync/wifi-only/offline Switches + "Sync Now" `setTimeout` toast). Default Views (dashboard/order-sort/items-per-page Selects). **Storage: `cacheSize=12.5`, `totalStorage=50` hardcoded**; Clear Cache sets cache to 0.2 + toast. Reset All Settings (local). Version "v1.0.0 (Build 2026.01.27)".

### 3.15 Stockist dialogs (all in `src/components/stockist/dialogs/`) — fields & submit
- **AddProductDialog:** imageUrl, name*, brand*, manufacturer, category*(Select: Analgesics/Antibiotics/Gastrointestinal/Antihistamines/Antidiabetic/Cardiovascular/Vitamins/Other), mrp*, salePrice*, stockQuantity, minStock, batchNumber, expiryDate(date), hsnCode, gstRate(Select 0/5/12/18/28, default 12), drugSchedule(None/H/H1/X/G/J), drugType(Allopathy/Ayurvedic/Homeopathy/Unani), composition, packSize, fssaiLicense, requiresPrescription/isNarcotic checkboxes. Submit requires name/brand/category/mrp/salePrice → toast + reset.
- **EditProductDialog:** prefilled from product; categories list here differs (Tablets/Capsules/Syrups/Injections/Topical/Drops/Other); regulatory fields default blank (not read from product). Submit requires name/mrp/salePrice → toast.
- **AddStockDialog:** quantity* (>0), batchNumber, expiryDate, purchasePrice; shows current stock + computed new level. Toast.
- **QuickBillDialog:** same 3-stage bill flow as CreateBill page (select/preview/success), optional `pharmacyId` prefill. WhatsApp share wired; others stub.
- **QuickOrderDialog:** same regex paste-parse flow as CreateOrder page (GST 18%). Create = toast + reset.
- **CollectPaymentDialog:** amount* (>0), quick-amount buttons (25%/50%/Full of outstanding), method (cash/upi/bank/cheque), reference. "Record Payment" = toast.
- **PaymentApprovalDialog:** review mode (approvalAmount editable, notes) vs reject mode (reason* required). Calls `onApprove/onReject/onHold` (parent toasts).
- **SearchPharmacyDialog:** live search across `mockAllPharmacies` (name/owner/phone, slice 10); "In Circle" badge via `isInCircle`; Add (if not in circle) → onAddToCircle.
- **AddToCircleDialog:** creditLimit (default 50000), paymentTerms (cod/7/15/30days), preferredDay (Mon–Sat/Any), notes. Toast.
- **EditPharmacyDialog:** name*, ownerName*, phone*, email, address, gstNumber(upper), drugLicense(upper), creditLimit. Toast.
- **AcceptOrderDialog:** editable per-item quantities (recomputes amount + `gstAmount*0.12`), delivery date (default tomorrow, min today). Accept → onAccept + toast.
- **DeclineOrderDialog:** reason RadioGroup (out_of_stock/credit_limit/delivery_area/minimum_order/other) + custom message. Decline → onDecline + toast.
- **UpdateStatusDialog:** current-status display + new-status RadioGroup (earlier statuses disabled unless 'cancelled') + note. Update disabled if unchanged → toast.
- **SharePaymentLinkDialog:** shows `paymentLink = pay.digiswasthya.com/{id}` (readonly) + Copy (clipboard) + QR placeholder + WhatsApp (`wa.me` real) + Email (`mailto:` real).
- **EditOrderItemsDialog:** editable qty/rate per item, remove, add product Select; `New Total = Σ qty*rate` with delta vs original. Save (≥1 item) → toast.
- **ExportDialog:** format radios (csv/excel/pdf, default excel), date range (today/week/month/all), data-type checkboxes (Orders✓, Payments✓, Products, Pharmacies). Export = `setTimeout(1500)` toast (simulated).
- **SendReminderDialog:** 5-step (select→customize→message→sending→complete). Select pharmacies with `outstandingBalance>0`; per-pharmacy amount option (25/50/100/custom%) + early-payment-discount toggle+%; message mode common vs individual; priority (high/medium/low); `simulateSending` progress via setInterval; final "WhatsApp messages sent" (simulated). `calculateTotalRequested` sums per-pharmacy %.
- **ScanProductDialog:** camera placeholder; Scan (`setTimeout(1500)` returns a random product) or manual barcode/HSN search; stock adjust +/−; Update Stock = toast. (Simulated OCR/scan.)
- **BulkUploadDialog:** 5-stage (upload→extracting→preview→importing→complete) w/ drag-drop; `mockParsedData`(5 rows, one invalid) shown in editable table (Name/Brand/Price/Stock); inline edit re-validates; Import = simulated progress; Done = toast.
- **UploadDocumentDialog:** file drop (sets `"document.pdf"` on click — fake), documentName* required, documentType (license/gst/invoice/other). `onUpload(name,type)` → parent adds to local docs.
- **DocumentPreviewDialog:** type-specific placeholder preview (image/pdf/excel); Open/Print/Share/Download all toast.
- **ViewScreenshotDialog:** placeholder image + zoom controls (0.5–2×); Download = `console.log`.
- **ConfirmDeleteDialog:** generic AlertDialog; supports custom title/description/confirmLabel or itemType presets (pharmacy/product/order); `onConfirm` or fallback toast.
- **CreateReturnDialog** (orphaned): 3-step (select delivered order → select items+qty+reason → review+notes) → "Submit Credit Note" toast. Reasons: damaged/expired/wrong_product/quality_issue/excess_quantity/customer_return/other.
- **MapRouteDialog** (orphaned): aggregates out-for-delivery/processing orders into stops; map placeholder; Optimize (toast), Copy Route (clipboard), Open Maps (`maps.google.com` real), Start Navigation (toast). `estimatedTime = stops*15min`.
- **BillPreviewDialog** (orphaned): printable bill from passed orders; `window.print()` wired; Share/Download toast. GSTIN hardcoded.

---

## 4. PHARMACY — PURCHASE VIEW

Data: `src/data/pharmacy-mock-data.ts` — `stockists`(8, STK001–008), `products`(15, PROD001–015 each with `stockistPrices[]`), `cartItems`(5), `pharmacyOrders`(6, PO001–006), `offers`(7), `paymentHistory`(4), `messages`(3), `notifications`(4), `savedAddresses`(2), `categories`(14). "Best price" computed inline everywhere via `stockistPrices.reduce(min)`.

### 4.1 Home (`/pharmacy/home` — `PharmacyHome`)
- Read-only search bar → `/pharmacy/browse`.
- Quick Actions: Smart Order→`/pharmacy/orders/smart-create`; Compare→ComparePricesDialog; Reorder→ReorderDialog; Offers→ViewOffersDialog.
- **KPI row all hardcoded** (`kpiData`): Total Spent ₹2,45,000, Savings ₹18,500, Active Orders 3, Delivered 24.
- Active Orders: `getActiveOrders().slice(0,3)` → detail. Your Stockists: `getFavoriteStockists().slice(0,3)` → detail. Active Offers: `offers.slice(0,3)`.

### 4.2 Browse (`/pharmacy/browse` — `PharmacyBrowse`)
- Search Enter → `/pharmacy/browse/products?q=`. Two cards (Browse Stockists `{stockists.length}` / Browse Products `{products.length}+`). Categories grid (`categories.slice(0,8)` → `?category=`). Top Rated Stockists (`rating>=4.5`, slice 3). Popular Products (`products.slice(0,4)`, best price inline).

### 4.3 Stockists list (`/pharmacy/browse/stockists` — `PharmacyStockists`)
- **Not integrated:** page-local hardcoded 4-item `stockists` array (id 1–4, NOT the shared `stockists`). Search Input decorative; cards not clickable. Columns: name, location, rating, deliveryTime, discount, minOrder.

### 4.4 Stockist Detail (`/pharmacy/browse/stockists/:id` — `PharmacyStockistDetail`)
- Real `stockists.find`. Header (rating/reviews, favorite toggle toast-only), quick info grid, stats (maxDiscount, minOrder, free/paid delivery). Actions Contact (ContactStockistDialog) / Start Order (→cart). Active Offers list. Tabs: Products (`products.filter(stockistPrices.some(sp.stockistId===id))`; per-product price = that stockist's price; Add → AddToCartDialog) / **Reviews ("Reviews coming soon")**.

### 4.5 Products (`/pharmacy/browse/products` — `PharmacyProducts`)
- Reads `?category`/`?q`. Sticky search + category chips (`categories.slice(0,6)` + All). `localProducts` state; wishlist toggle local + toast. `getBestPrice` inline; `savings = mrp - bestPrice.price` (computed, not rendered). Cards: 💊 placeholder, Rx badge, category, best price + discount badge, Add→AddToCartDialog, "{n} stockists".

### 4.6 Product Detail (`/pharmacy/browse/products/:id` — `PharmacyProductDetail`)
- Real `products.find`; else "Product not found". Best-price block ("You save ₹{savings}") + Add→AddToCartDialog. Price comparison list per stockist (`isBest = price===bestPrice.price`; In/Out of stock; Add disabled if !inStock). Product Details (composition, description).

### 4.7 Cart (`/pharmacy/cart` — `PharmacyCart`)
- **Not integrated:** page-local hardcoded 3-item array. `total = Σ price*qty`. Clear All, qty +/−, Place Order — **all no-ops** (no handlers). Fixed bottom Total + "Place Order".

### 4.8 Checkout (`/pharmacy/checkout` — `Checkout`)
- Reads shared `cartItems`(5). **`subtotal = Σ price*qty`; `gst = subtotal*0.18`; `deliveryFee = 0` (shown "FREE"); `total = subtotal+gst+deliveryFee`.** 3 steps (Review→Payment→Success). Step1: delivery address (hardcoded "City Pharmacy…"), order items, expected delivery (hardcoded). Step2: payment RadioGroup (upi/credit/cod/card) + coupon input (decorative "Apply"). Place Order = toast + step 3. Success shows **hardcoded `#ORD-2025-0042`**, "2 stockists", total. Track Order→orders; Continue Shopping→home.

### 4.9 Smart Order (`/pharmacy/orders/smart-create` — `SmartOrder`) — simulated AI
- 3 steps. Step1: textarea → "Process with AI" = `setTimeout(1500)` then regex parse (qty regex `/(\d+)\s*(strips?|tablets?|bottles?|boxes?)?/i`, match product by first-word or brand substring). Step2: matched/unmatched list with per-item best price. Step3: 3 recommendations — `cheapest.total = Σ bestPrice*qty`, stockistCount = unique matched stockists; **`quickest.total = round(base*1.1)`, stockistCount `1`; `best_value.total = round(base*1.05)`, stockistCount `2`** (placeholder multipliers). Add to Cart = toast + `/pharmacy/cart`.

### 4.10 Orders (`/pharmacy/orders` — `PharmacyOrders`)
- **Not integrated:** page-local hardcoded 3 orders. Tabs all/active/delivered/cancelled — **only "All" renders**; others show placeholder text ("Filter shows … orders"). Cards not clickable. Search decorative.

### 4.11 Order Detail (`/pharmacy/orders/:id` — `PharmacyOrderDetail`)
- Real `pharmacyOrders.find`; else "Order not found". `statusSteps`(6: placed/confirmed/processing/shipped/out_for_delivery/delivered). Timeline shows first 4 steps; progress bar `width = Math.min(currentStep/3*100,100)%`. Order items + price breakdown from real order fields (subtotal, deliveryFee "Free" if 0, discount, total). Payment (method + status badge), delivery address. Actions gated: Rate (delivered & !rating)→RateStockistDialog; Report Issue (delivered)→ReportIssueDialog; Contact (non-terminal)→ContactStockistDialog. TrackOrderDialog available.

### 4.12 Payments / Wishlist / Notifications / Messages / Help / More
- **Payments** (`/pharmacy/payments`): `paymentHistory`(4); search + tabs all/success/pending/failed; read-only; status icon+color map.
- **Wishlist** (`/pharmacy/wishlist`): `products.filter(isWishlisted)` into local state (5 wishlisted in data); remove local+toast; Add to Cart→AddToCartDialog; empty state.
- **Notifications** (`/pharmacy/notifications`): `notifications`(4) local state; mark-read/mark-all/delete real; type→icon (order/offer/price_drop/delivery); clicking navigates to `actionUrl` (some point to `/pharmacy/orders/PO…`, `/pharmacy/browse/...`).
- **Messages** (`/pharmacy/messages`): `messages`(3) list → chat view showing single `lastMessage`; **send button has no handler** (disabled unless text; does nothing on click).
- **Help** (`/pharmacy/help`): 4 FAQ categories (Orders/Payments/Returns/Account) with Accordion; search filters q+a (real); Call/Email/Chat cards decorative.
- **More** (`/pharmacy/more`): profile "HealthPlus Pharmacy"; sections Account, Shopping (Wishlist **badge "4"**), Communication (Notifications **"2"**, Messages **"3"**), Support, Preferences (App Settings, **"Switch to Sale View"** = `switchToSale` wired). Logout→toast+/auth. Version "DigiSwasthya v1.0.0".
- **Settings (profile/business/security/app):** mirror stockist settings pattern (form local state, saves toast-only). (Routed; per FEATURES the dark-mode toggle is inert — consistent with stockist AppSettings.)

### 4.13 Purchase dialogs (`src/components/pharmacy/dialogs/`)
- **AddToCartDialog:** qty +/−, `total = bestPrice.price*qty`; Add = toast + reset.
- **ComparePricesDialog:** **placeholder** — search input + "Search for a product to compare prices" text; no results ever.
- **ReorderDialog:** delivered orders (slice 5); Reorder = toast.
- **ViewOffersDialog:** read-only list of all `offers`(7) with code badges.
- **ContactStockistDialog:** message textarea; Send = toast.
- **RateStockistDialog:** 1–5 star selector + review textarea; Submit (rating>0) = toast.
- **ReportIssueDialog:** issue type Select (wrong/damaged/missing/late/other) + description; Submit = toast.
- **TrackOrderDialog:** 5-step tracker (placed→delivered) highlighting current; shows ETA.
- **Orphaned:** CheckoutDialog (place order toast→/pharmacy/orders), SmartOrderDialog (full duplicate of SmartOrder page), ApplyCouponDialog (code input → onApply).

---

## 5. PHARMACY — SALE VIEW

### 4D.4 DSW patient & doctor modules

## 6. PATIENT MODULE

Data: `src/data/patient-mock-data.ts` — generated `mockPatients`(100), `mockPatientOrders`(200), `mockPatientPrescriptions`(150), `mockPatientConsultations`(100), `mockNearbyPharmacies`(50). Generated order math: `deliveryFee = subtotal>=500 ? 0 : 40`; `discount = i%3===0 ? floor(subtotal*0.1) : 0`; `total = subtotal + deliveryFee - discount`. Consult `fee = 300 + (i%5)*100`. `getActiveOrders` (placed/confirmed/processing/out_for_delivery). Patient uses `getLiveInventoryForPatients` from `unified-data-helpers` (random price jitter → non-deterministic prices).

### 6.1 Dashboard (`/patient/dashboard` — `PatientDashboard`)
- Greeting "Hello, Rahul! 👋". Read-only search → `/patient/search`.
- **KPI row all hardcoded** (`kpiData`): Active Orders 3, Prescriptions 5, Wishlist 12, Refill Due 2. Quick Actions: Upload Prescription→UploadPrescriptionDialog, Book Consultation→BookConsultationDialog, Wishlist→`/patient/wishlist`.
- Recent Orders = `getActiveOrders().slice(0,3)` → `/patient/orders/:id`. Nearby Pharmacies = `getNearbyPharmaciesForPatient(5).slice(0,3)` → **`/patient/pharmacies/:id` (404)**; View All → **`/patient/pharmacies` (404)**. **Refill Reminders fully hardcoded** (Metformin 3d/City Pharmacy, Amlodipine 5d/Health Plus). Book Consultation CTA.

### 6.2 Search (`/patient/search` — `PatientSearch`)
- `getLiveInventoryForPatients(10)`. Category chips from live products. `getLowestPrice = Math.min(...pharmacyPrices.map(price))` (fallback MRP); `discount = round(((mrp-lowest)/mrp)*100)`; nearest = sort by distance. Cards → **`/patient/medicines/:id` (404)**. **Add to Cart = toast; Filter button no-op.** Clear filters wired.

### 6.3 Prescriptions (`/patient/prescriptions` — `PatientPrescriptions`)
- "Prescription Vault"; `mockPatientPrescriptions.slice(0,20)`. Search (doctorName/diagnosis) + status pills (all/active/partially_ordered/ordered/expired). Quick stats (active/pending/expired counts). Cards (doctor, status badge, Uploaded badge, diagnosis, medicines preview, dates) → **`/patient/prescriptions/:id` (404)**. "Order" (active only) → `/patient/search` (no real ordering). Upload→UploadPrescriptionDialog.

### 6.4 Orders (`/patient/orders` — `PatientOrders`)
- `mockPatientOrders.slice(0,30)`. Search + tabs all/processing/out_for_delivery/delivered. Cards → `/patient/orders/:id`.

### 6.5 Order Detail (`/patient/orders/:id` — `PatientOrderDetail`)
- **Fully hardcoded local `mockOrder` (ORD-P-001); ignores `useParams().id`.** Timeline (5 steps, 4 completed), pharmacy card (Call toast), items, payment summary (subtotal 205 / delivery 30 / discount −20 / total 215), Contact/Rate = toast stubs.

### 6.6 Consultations (`/patient/consultations` — `PatientConsultations`)
- **Local hardcoded 4-item `mockConsultations` (CONS-001…004), NOT `mockPatientConsultations`(100).** Search + tabs all/scheduled(Upcoming)/completed. Status badges completed/scheduled/cancelled. Cards → `/patient/consultations/:id`. **"Book New" (header) and empty-state "Book Consultation" have no handlers.**

### 6.7 Consultation Detail (`/patient/consultations/:id` — `PatientConsultationDetail`)
- **Fully hardcoded local `mockConsultation` (CONS-001); ignores id.** Doctor card, schedule, symptoms/diagnosis/notes, Prescription (3 medicines + advice list + follow-up), payment. Download/Rate = toast; Order Medicines → `/patient/search`.

### 6.8 Wishlist (`/patient/wishlist` — `PatientWishlist`)
- **Fully hardcoded 2 items (Vitamin D3, Omega-3).** "Add to Cart" and delete buttons have **no handlers**.

### 6.9 Profile / More / Help
- **Profile** (`/patient/profile`): hardcoded patient (Rahul Sharma, O+, allergies Penicillin/Dust, Hypertension). Health summary counts. Menu links to settings (several 404 — see §0.3). Logout→toast+/auth.
- **More** (`/patient/more`): profile "Rahul Sharma, B+". Health Alerts card → prescriptions. Menu w/ badges (Orders "2", Notifications "3"); several 404 links. Logout→/auth.
- **Help** (`/patient/help`): 6 collapsible FAQ categories; **search input is NOT wired to filter** (state set but unused); Chat/Call/Email = toast.

### 6.10 Settings
- **ProfileSettings** (`/patient/settings/profile`): hardcoded form (name/email/phone/DOB/gender Select/address/city/state/pincode); photo toast; Save = toast + back.
- **MedicalSettings** (`/patient/settings/medical`): bloodGroup Select; allergies/conditions/currentMedications chip lists with **real local add/remove**; Save = toast + back.
- **SecuritySettings** (`/patient/settings/security`): change password (match check only) = toast; 2FA & Biometric Switches (toast/local); Active Sessions (1 hardcoded "Current Device"); Log Out All (no handler); Delete Account = toast. (Note: file appends a stray `import { Badge }` at the bottom.)

### 6.11 Patient dialogs
- **BookConsultationDialog:** 3-step (select doctor = `mockDoctors.filter(active).slice(0,10)` → details → confirm). Type video/voice; symptoms* required; preferred time Select (now/morning/afternoon/evening). `handleConfirmBooking` = toast only (no scheduling).
- **UploadPrescriptionDialog:** file input (Browse real; Camera decorative) + notes; Upload requires file → `await setTimeout(1500)` → success toast. **No OCR / no real upload.** "How it works" claims AI extraction (not implemented).

---

## 7. DOCTOR MODULE

Data: `src/data/doctor-mock-data.ts` — `mockDoctors`(60, first 10 explicit + 50 generated; every 20th 'pending'), `mockAppointments`(23; apt-001 scheduled/apt-002 completed/apt-003 in_progress + 20 generated cycling scheduled/completed/cancelled), `mockPrescriptions`(16), `mockDoctorEarnings`(31; earn-001 + 30 generated), `mockDoctorPatients`(50). `getTotalEarnings = Σ netAmount`; `getPendingEarnings = Σ netAmount where status==='pending'`; `getTodaysAppointments` (real date → empty at runtime); `getPendingAppointments` (status scheduled).

### 7.1 Dashboard (`/doctor/dashboard` — `DoctorDashboard`)
- Greeting "…, Dr. Sharma!" + "You have {pending} appointments today". "Start Consult"→appointments.
- KPIs: Today=`getTodaysAppointments().length` (0 runtime), Pending=`getPendingAppointments().length`, Earnings=`getTotalEarnings()`, **Patients = hardcoded "50"**.
- Quick Actions (Start Consult/Patients/Prescriptions/Earnings). Earnings summary (total + pending withdraw; **"+12% this week" hardcoded**). Upcoming Appointments (`mockAppointments.slice(0,4)`) → detail. Recent Earnings (slice 3).

### 7.2 Appointments (`/doctor/appointments` — `DoctorAppointments`)
- Search (patientName) + tabs w/ counts: all/scheduled(Upcoming)/in_progress(Active)/completed(Done). Cards (patient, age/gender, via pharmacy, status badge, symptom chips, datetime, type). **Start (scheduled) = `handleStartCall` toast only**; View → detail.

### 7.3 Appointment Detail (`/doctor/appointments/:id` — `DoctorAppointmentDetail`)
- Real `mockAppointments.find`; else not-found. Patient info, schedule, symptoms/notes. If scheduled: **Start Call (toast) + Prescribe → `/doctor/prescriptions/new?patient=:id` (404)**. If completed + prescriptionId: View Prescription → `/doctor/prescriptions/:id` (404).

### 7.4 Patients (`/doctor/patients` — `DoctorPatients`)
- `mockDoctorPatients`(50). Search (name/phone). Stats: Total=50, This Week=`lastVisit > now-7d`, Total Visits=`Σ totalVisits`. Cards (age/gender/bloodGroup, phone, last visit, visits, allergy/condition badges) → detail.

### 7.5 Patient Detail (`/doctor/patients/:id` — `DoctorPatientDetail`)
- Real lookups (patient + `mockAppointments.filter(patientId)` + `mockPrescriptions.filter(patientId)`). Start Consult = toast; **Call = no-op**. Medical info, recent appointments (slice 3), prescriptions (slice 3).

### 7.6 Prescriptions (`/doctor/prescriptions` — `DoctorPrescriptions`)
- `mockPrescriptions`(16). Search (patientName/diagnosis). Stats: Total, With Follow-ups (`followUpDate` truthy). Cards (patient, diagnosis, medicine preview, created date, follow-up badge). Download = toast. (No status field on doctor Prescription interface.)

### 7.7 Earnings (`/doctor/earnings` — `DoctorEarnings`)
- Summary: Total=`getTotalEarnings()` (+12% hardcoded), Pending=`getPendingEarnings()` + Withdraw (disabled if 0) = toast. **"This Month" block hardcoded** (23 consults / ₹8,500 earned / ₹850 fee). Tabs all/paid/pending. Earning rows (net, fee, platformFee, status).

### 7.8 More / Settings / Dialog
- **More** (`/doctor/more`): profile "Dr. Arun Sharma". Sections Account (Profile, Availability), Finance (Earnings, **Tax Reports→`/doctor/reports` 404**), Communication (Notifications **"5"**→404, Consultation History→appointments), Settings (**Security→404, App→404, Help→404**). Logout→/auth.
- **ProfileSettings** (`/doctor/settings/profile`): hardcoded form — name/email/phone, specialization Select(8), qualification, regNumber, experience, languages, bio, consultationFee, clinic address. Save = toast + back.
- **AvailabilitySettings** (`/doctor/settings/availability`): consultationDuration Select (10/15/20/30, default 15), bufferTime Select (0/5/10/15, default 5); weekly schedule (Mon–Sun) with per-day enable Switch + add/remove/edit time slots — **real local mutation**. Save = toast + back.
- **BankSettings** (`/doctor/settings/bank`): **routed but not linked from anywhere**. "Available ₹12,500 / Pending ₹3,200" hardcoded; Withdraw no-op. Bank fields (holder/account/confirm/IFSC/type Select/bankName/branch) + UPI; Save (match check) = toast. Weekly Payouts info.
- **WritePrescriptionDialog** (orphaned; not imported by any page): diagnosis* + dynamic medicine cards (name Select from `commonMedicines`(8), dosage/frequency/duration/instructions Selects), add/remove (min 1), general instructions, follow-up Select. Submit (diagnosis + medicine[0].name) = toast only. Because the "Prescribe" button navigates to a non-existent route instead of opening this dialog, **the doctor→patient prescription creation flow is effectively unimplemented**.

---

## 8. ADMIN MODULE

Data: `src/data/admin-mock-data.ts` — `platformStats` (hardcoded: totalUsers 235, stockists 20, pharmacies 55, doctors 60, patients 100, activeUsers 180, totalOrders 2450, totalRevenue 4,850,000, todayOrders 45, todayRevenue 125,000, pendingVerifications 12, activeConsultations 8), `mockAdminUsers`(235: 20 stk + 55 pharm + 60 doc + 100 pat), `mockVerificationRequests`(15; first 3 explicit + 12 generated, all pending), `mockPlatformOrders`(100), `mockPlatformTransactions`(150), `mockConsultationLogs`(50). **`getPlatformMetrics()` (computed) unused.**

### 8.1 Dashboard (`/admin/dashboard` — `AdminDashboard`)
- User Stats KPI (from `platformStats`). Revenue AreaChart (local hardcoded `revenueData` 7-day), User Distribution PieChart (local hardcoded 100/55/60/20). Quick stats: Total Revenue (**+15% hardcoded**), Today's Orders + revenue, Active Consultations→consultations. Pending Verifications (`mockVerificationRequests.filter(pending)` — only computed value; slice 4; **"Review" buttons no-op**). Recent Orders (`getRecentOrders(5)`).

### 8.2 Users (`/admin/users` — `AdminUsers`)
- `mockAdminUsers`. Search (name/email). Tabs all/stockist/pharmacy/doctor/patient with live counts; list `slice(0,20)` ("Showing 20 of N"). Status badge (active/pending/suspended/rejected) + verificationStatus. Dropdown: View Details→`/admin/users/:id`, and status-gated Approve/Suspend/Reactivate = **`handleAction` toast only**.

### 8.3 User Detail (`/admin/users/:id` — `AdminUserDetail`)
- Reads **local `mockUsers` keyed only by `"stockist-1" | "pharmacy-1" | "doctor-1"`**. Since list pages pass ids like `stk-003`, `pharm-001`, `doc-002`, `PAT-001`, `STK-001` etc., **almost every navigation renders "User Not Found."** Where resolved: user overview + Documents tab (per-doc Approve/Reject/Approve-All mutate local state, reset on reload; Reject requires reason via dialog; doc preview dialog shows `/placeholder.svg`) + Details tab (role-specific business/professional fields).

### 8.4 Orders / Payments / Consultations (read-only)
- **Orders** (`/admin/orders`): `mockPlatformOrders`; search (orderNumber/buyerName); tabs all/pending/confirmed/delivered w/ counts; b2b/b2c type badge; `slice(0,20)`.
- **Payments** (`/admin/payments`): `mockPlatformTransactions`; search (fromName); tabs all/order_payment/consultation_fee/commission w/ counts; shows amount + platformFee; `slice(0,20)`.
- **Consultations** (`/admin/consultations`): `mockConsultationLogs`; stats Total / Completed / **Platform Revenue = `Σ platformFee`**; search (doctor/patient); `slice(0,20)`.

### 8.5 Per-role pages (each uses its OWN page-local 5-row array — NOT `mockAdminUsers`)
- **Stockists** (`/admin/stockists`): local `mockStockists`(5, STK-001…005). Search + tabs all/active/pending/suspended. Card: GST/Drug License check/clock icons, pharmacies/orders badges (active only). Dropdown View→`/admin/users/STK-00x` (→ not-found), Approve/Suspend toast.
- **Pharmacies** (`/admin/pharmacies`): local(5, PH-001…005) + LIVE badge; same pattern; View→`/admin/users/PH-00x` (not-found).
- **Doctors** (`/admin/doctors`): local(5, DOC-001…005) + rating/consults/fee; Registration verified icon; View→`/admin/users/DOC-00x` (not-found).
- **Patients** (`/admin/patients`): local(5, PAT-001…005); vocab **active/inactive** (no approve/suspend actions, only View→not-found); orders/consults badges, joinedDate.

### 8.6 Reports / Settings
- **Reports** (`/admin/reports`): summary (**Growth +15% hardcoded**, activeUsers, totalOrders, totalRevenue from `platformStats`); 4 export cards (Users/Orders/Revenue/Consultations) all toast (no file).
- **Settings** (`/admin/settings`): uncontrolled `defaultValue` inputs — Platform Name, Support Email, Support Phone; Order Commission % (2), Consultation Commission % (10); feature-flag Switches (Teleconsultations✓, Patient App✓, Maintenance Mode✗). Save = toast (values not even collected — uncontrolled).

---


### 4D.5 DMVP known stubs & mock behavior


### 4D.6 ERP database triggers & SQL functions

## 14. DATABASE-SIDE BUSINESS LOGIC (triggers & SQL functions — server automations that run regardless of which client writes)

From `supabase/migrations/*.sql` (~80 migration files, Nov 8 – Dec 20, 2025; 297 CREATE TABLE/FUNCTION/POLICY/TRIGGER statements):

- **`recalculate_pharmacy_balance()`** — trigger `trg_orders_recalc_balance` AFTER INSERT/UPDATE/DELETE on `orders` (also legacy `update_pharmacy_balance`). Final version: `pharmacy_details.outstanding_balance = Σ (total_amount − COALESCE(paid_amount,0))` over that pharmacy's orders with `payment_status IN (unpaid, partial) AND status != 'cancelled'`. The function evolved across migrations (an intermediate version ROUND()ed both amounts; the final one does not, cancelled-order exclusion was added later). This means the many client-side `recalculatePharmacyBalance()` duplications (§10) are redundant-but-consistent: the DB recomputes the same number on every order write anyway.
- **`handle_order_cancellation()`** — trigger `trg_orders_handle_cancel` AFTER UPDATE on `orders` WHEN status transitions to 'cancelled': if `paid_amount > 0`, adds the paid amount to `pharmacy_details.credit_balance` (auto credit-note). A backfill migration granted credit for historical cancelled paid orders. This is why the UI cancel-confirm dialog says "₹X will be added as credit" — the DB does it.
- **`prevent_overpayment()`** — trigger `trg_prevent_overpayment` BEFORE UPDATE on `orders` WHEN `paid_amount IS NOT NULL`: if `paid_amount > total_amount`, clamps `paid_amount = total_amount`, forces `payment_status='paid'`, and pushes the excess into `pharmacy_details.credit_balance`. A DB-level safety net beneath all five client FIFO implementations.
- **`create_expiry_alerts()`** — trigger on `pharmacy_inventory` AFTER INSERT OR UPDATE OF expiry_date, quantity: inserts a `pharmacy_expiry_alerts` row (alert_days_before=30) when expiry_date > today+30d. (Note the condition is `>` 30 days out, so items already inside the 30-day window never get an alert row — and no UI reads the table anyway.)
- **`deduct_stock(product_id, qty)`** — atomic conditional decrement (`WHERE stock_quantity >= qty`), returns false instead of going negative. Used only by the pharmacy portal checkout; other order paths decrement client-side or in edge functions with `max(0, …)` clamping.
- **`check_rate_limit(...)`** — SECURITY DEFINER, `SELECT … FOR UPDATE` row-lock on `catalogue_rate_limits` per (identifier, action_type) within the time window; creates/increments the attempt row and returns `{allowed, attempts_remaining}` or a denial with retry info. Only caller: verify-pharmacy-license (5 attempts / 15 min keyed by normalized license).
- **`distribute_notice_to_users(...)`** — SECURITY DEFINER fan-out: joins profiles ⋈ user_roles ⋈ stockist_details ⋈ pharmacy_details (via the stockist's pharmacies) ⋈ stockist_service_areas ⋈ products, filters by role / PIN (pharmacy pin OR service-area pin) / product batch_code / service-area state / district, then inserts `user_notice_recipients` rows (ON CONFLICT DO NOTHING) and returns the count. Because pharmacy/geo/batch joins run through stockist_details, geo/batch-targeted notices effectively reach **stockist accounts** whose network matches — pharmacies without logins can't receive them.
- **`search_users_by_batch_code(code)`** — SECURITY DEFINER two-part UNION: stockists having active products with that `batch_code`, plus pharmacies that ordered items with that batch code (via order_items.batch_code). Powers admin recall impact search.
- **`has_role` / `is_admin`** — STABLE SECURITY DEFINER lookups on user_roles; embedded in dozens of RLS policies (avoids RLS recursion on user_roles itself).
- **`update_updated_at_column()` / `update_patient_details_updated_at`** — generic BEFORE UPDATE `updated_at = now()` triggers attached to ~20 tables (orders, products, product_batches, profiles, stockist/pharmacy/mr/brand/patient details, registration requests, connections, inventory, documents, platform_settings, service areas, recalls, campaigns, disputes, templates, fees, territories).


### 4D.7 ERP security model (RLS)

## 15. SECURITY MODEL — RLS POLICIES, STORAGE, EDGE-FUNCTION AUTH

### 15.1 Row-Level Security (all app tables have RLS enabled; policy summary by principal)
- **Admin** (`is_admin()`): full manage on batch_recalls, campaigns, disputes, pharmacy_documents, platform_fees, message_templates, territories, notices + recipients, platform_settings, delivery dates/rules, commission_ledger, subscriptions, brand_details, mr_details, connections; view-all on audit_logs, registration requests, service areas, analytics_events, pharmacy_inventory, expiry alerts, patient_orders.
- **Stockist** (owns via `stockist_details.profile_id = auth.uid()`, most policies also require `has_role('stockist')`): manage own stockist_details, own products & product_batches, own orders & order_items, own pharmacies (`pharmacy_details.profile_id = stockist_details.id` — the ownership chain), payment reminders (stockist_id column added specifically to harden this policy), delivery dates/rules/service areas, activity_log inserts, communication_log inserts, route_executions ("Stockists manage own routes"), delivery_tracking (via route join), disputes view (own stockist_id).
- **Pharmacy (authenticated)**: view/insert/update own profile (`auth_profile_id = auth.uid()`), manage own pharmacy_inventory, view/update own expiry alerts, view own connections, view/update patient orders addressed to them, view brand fulfilment orders.
- **Patient**: manage own details/addresses/prescriptions (incl. storage policies for the prescriptions bucket)/refill reminders/wishlist; view own orders & tracking.
- **Brand**: manage own details/products/campaigns/batch verification; view own orders.
- **MR**: manage own details & visits ("MRs manage their visits"); view own commissions.
- **Any authenticated**: view own profile/roles/notice recipients/notifications/invoices/loyalty/referrals/search history/subscriptions/analytics; insert own roles during signup; manage own notification_preferences, reviews, generic wishlist; view active fees/plans/recalls/territories/campaigns/settings/notices.
- **Public/anonymous** (what makes the no-login catalogue possible): view catalogue-enabled stockists (and MRs), view catalogue products, view active delivery dates/rules/service areas, "Public can verify pharmacy by license", "Public can view orders via license verification", create registration requests, create payment confirmations ("Anonymous can create payment confirmations"), insert search history, verify brand batches.
- **Service role only**: catalogue_rate_limits; system insert/update policies on patient_order_tracking and loyalty_transactions.

### 15.2 Storage buckets
- `product-images` — **public**; anyone can read; authenticated users upload/update/delete (paths namespaced `{uid}/{timestamp}_{name}` by storage.ts).
- `bills` — **private**; authenticated upload, owners read own, stockists delete from their folder; accessed via 1-hour signed URLs (except PharmacyRegistration, which stores getPublicUrl links into a private bucket — those links won't render for reviewers without signing, a real quirk).
- `prescriptions` — **private**; patient upload/read/delete-own policies; PrescriptionVault likewise stores a getPublicUrl for a private bucket.

### 15.3 Edge function JWT matrix (`supabase/config.toml`)
`verify_jwt=false` (public): verify-pharmacy-license, create-platform-order, mark-payment-paid, calculate-delivery-fee, get-pharmacy-outstanding-orders, ai-symptom-checker. `verify_jwt=true`: approve-reject-payment, reduce-stock-for-order, process-bill-image, extract-bill-items, optimize-route, parse-order-message, extract-product-label, fetch-product-info, extract-prescription, create-batch-cycle, chat-assistant. (So extract-bill-items/optimize-route/chat-assistant, which lack in-code auth checks, are still gated by platform JWT verification.) Supabase project id `cdkrutfrvlezywnffztb`; client env in `.env`: VITE_SUPABASE_URL/PROJECT_ID/PUBLISHABLE_KEY (anon key committed — standard for Lovable projects).


### 4D.8 MASTER_FLOW_INDEX Part E — where to find definitions

# PART E — WHERE TO FIND FULL DEFINITIONS

| Need | Go to |
|------|-------|
| Merged superset by module | `UNIFIED_FEATURES.md` → Part I, Modules 1–19 |
| Every field in a specific app's login form | `UNIFIED_FEATURES.md` → Appendix A–H, §1 Auth |
| Per-repo complete review | `_reviews/review-<repo>.md` |
| HUB user flow narratives | `digi-swasthya-hub/docs/user-flows-*.md` |
| ERP single-app deep doc | `stockpharmaerp/APPLICATION_OVERVIEW.md` |
| HUB architecture nodes | `digi-swasthya-hub/supabase/functions/flowboard-data/index.ts` |
| SP server business rules | `STOCKIST-PHARMACY/server/src/services/*.ts` |
| Re-run full review | `EXHAUSTIVE_REVIEW_PROMPT.md` |

---

*Index generated from code-derived reviews in UNIFIED_FEATURES.md. For field-level definitions, validation rules, formulas, and edge cases, always consult the full module sections and per-repo appendices.*

## Appendix: Source file references

| File | Path | Lines |
|------|------|-------|
| review-stockpharmaerp.md | reviews/ | ~2403 |
| review-digi-swasthya-hub.md | reviews/ | ~2280 |
| review-greetings-pal-git.md | reviews/ | ~1523 |
| review-stockistpayments.md | reviews/ | ~2085 |
| review-digimvplaunch.md | reviews/ | ~1625 |
| review-digiswasthya.md | reviews/ | ~1405 |
| review-digiswasthyamvp.md | reviews/ | ~1417 |
| review-STOCKIST-PHARMACY.md | reviews/ | ~3974 |
| UNIFIED_FEATURES.md Part I | root | ~640 |
| MERGED_REVIEWS.md Part I | root | ~640 |
| MASTER_FLOW_INDEX.md | root | 462 |

*Generated 2026-07-04. Exhaustive on flows and business rules; per-app verbatim appendices excluded by design.*



