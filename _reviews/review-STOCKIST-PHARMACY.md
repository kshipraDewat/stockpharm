# STOCKIST‑PHARMACY — Exhaustive Functional Review

> Code-derived, screen-by-screen and flow-by-flow. Covers both tenant panels (Stockist + Pharmacy), all staff roles, every page/modal/slide-over with fields + validation, all cross-tenant flows, every server service rule and error path, and every API route ↔ service mapping. Read directly from `client/src/**`, `server/src/**`, `shared/*`, plus `FEATURES.md` / `additions.md`.

---

## 0. Platform Shape, Stack & Tenancy

- **Monorepo (npm workspaces):** `client` (React 19 · Vite · Tailwind · TanStack Query 5 · Zustand 5 · React Router 7 · axios · Recharts · jsPDF/html2canvas · react-hot-toast), `server` (Express 4 · Drizzle ORM over **PGlite** embedded Postgres · jose JWT · bcryptjs · multer · helmet · zod · `@google/genai`), `shared` (DTOs + enums + constants imported by both).
- **Two tenant types**, one codebase, one DB, **never cross-read**: `tenants.tenantType ∈ {stockist, pharmacy}`. All cross-tenant state flows through a **connection record** + an append-only **event queue** (`cross_tenant_events`).
- **Roles (`users.role`)**: `admin | biller | pharmacist | cashier` — per-tenant staff roles, **no platform super-admin** (`additions.md §D`). Stockist uses admin/biller; Pharmacy uses admin/pharmacist/cashier.
- **Server boot** (`server/src/index.ts`): helmet (CSP off), CORS with credentials, JSON limit 10 MB, connect DB, run inline migration, listen on `PORT` (default 4000). `DATABASE_URL` defaults to `pglite:memory`.
- **Client entry** (`App.tsx`): `QueryProvider` → `Toaster` (top-right) → `BrowserRouter` → `SessionExpiredRedirect` + `AppRoutes`. All pages `React.lazy` under `<Suspense>`.
- **Two shells:** `MainLayout` (Sidebar/Header/BottomNav, **blue** accent, brand word "Stockist") for `/*`; `PharmacyMainLayout` (**teal** accent, "Pharmacy") for `/pharmacy/*`. Both mount `useEvents(50,{poll:true})` — polls `POST /events/process` every 10 s (§16).
- **Axios** (`api/client.ts`): `baseURL:/api`, `withCredentials`. On any non-`/auth/login` 401 → `triggerAuthRedirect` to `/login` or `/login?panel=pharmacy` (chosen by whether the current path starts with `/pharmacy`).

---

## 1. Authentication, Sessions, Registration, Panels

### 1.1 Routes (`client/src/routes/index.tsx`)
Public (no shell): `/login`, `/register`, `/forgot-password`, `/reset-password`. Legacy `/pharmacy/login` and `/pharmacy/register` **redirect** to unified `/login`/`/register`; `/pharmacy/forgot-password` and `/pharmacy/reset-password` render the same page components.
Per-route role wrappers: `admin(el, deniedRedirect?)` = `requiredRole="admin"`; `billerReports` = admin+biller; `pharmPlus` = admin+pharmacist; `cashierPlus` = admin+pharmacist+cashier.

### 1.2 ProtectedRoute (`components/auth/ProtectedRoute.tsx`)
- On mount (if `!initialized`) calls `GET /auth/me`; success → `setUser`; failure → `logout()`. Renders "Loading…" until initialized.
- No user → `<Navigate to="/login" state={{from}}>`.
- Wrong `requiredTenantType` → redirect to the user's own `defaultDashboard` (`/dashboard` or `/pharmacy/dashboard`).
- `requiredRole==='admin'` and not admin → either `deniedRedirect` (with error toast) or a full "Access Denied" panel. `allowedRoles` mismatch → "Access Denied" panel.

### 1.3 Login page (`auth/LoginPage.tsx`)
- Panel detected from path/`?panel=` (`lib/panel.detectPanelFromPath`). Brand accent + wordmark switch blue/teal.
- **Fields:** Email (text, `inputMode=email`, required, autofocus), Password (with show/hide eye toggle). "Forgot password?" link → `forgotPasswordPath(panel)`.
- **Submit:** `POST /auth/login` with `{email,password, tenantType:'pharmacy' only if pharmacy panel}`. On success → `setUser`, navigate to `location.state.from` (unless it contains `/login`) else `defaultDashboard(tenantType)`.
- **Error handling:** no response → "Cannot reach server…"; 429 → "Too many attempts…"; 401 → server error msg or "Invalid credentials"; ≥502 → server-down message; else generic.

### 1.4 Register page (`auth/RegisterPage.tsx`) — SINGLE FORM (multi-step wizard is missing, `additions.md §B/§C`)
- Stockist/Pharmacy **toggle** (initial from `?panel`). Labels adapt ("Pharmacy Name" vs "Business Name").
- **Fields:** Business/Pharmacy Name, Your Name, Email, Phone (`type=tel`), State Code (`maxLength 2`), **Drug License (DL) — pharmacy only, required**, Password (with live strength meter via `passwordStrength`), Confirm Password. All eye-toggles.
- **Client validation (`lib/validation`):** all-required check; pharmacy DL required; `validateEmail`, `validatePhone` (last-10 digits `^[6-9]\d{9}$`), `validateStateCode` (`^\d{2}$`), `validatePassword` (≥8, upper+lower+digit), password==confirm. Errors toasted sequentially (120 ms stagger).
- **Submit:** `POST /auth/register` with `phone: normalizePhone(phone)` (last 10 digits), then `GET /auth/me`, then navigate to default dashboard. NOT collected (gaps): business type, PAN, WhatsApp, city, own PIN, serviceable pincodes, document uploads, bank details.

### 1.5 Auth server (`routes/auth.ts`, `services/userService.ts`, `lib/cookies.ts`, `middleware/auth.ts`)
- **JWT** via jose HS256, secret `env.JWT_SECRET` (**boot fails if < 32 chars**, `env.ts`). Payload `{sub,tenantId,email,name,role,tenantType}`, `setIssuedAt`, `setExpirationTime(JWT_ACCESS_TTL default 24h)`. Delivered as **httpOnly cookie** `accessToken` (`sameSite lax`, `secure` in prod only, maxAge 24 h). `getAuthTokenFromRequest` also accepts `Authorization: Bearer`.
- **`register`** — Zod `RegisterSchema`: businessName≥2, name≥2, email, password(min8 +upper+lower+digit), stateCode `^\d{2}$`, phone `^[6-9]\d{9}$`, optional gstin (full GSTIN regex) or `''`, optional dlNumber, tenantType default `stockist`; **`superRefine`: pharmacy requires dlNumber ≥3 chars**. `registerTenant`: rejects duplicate email (409 "already exists"); bcrypt hash (rounds 10); creates tenant, one `users` row `role:'admin'`, seeds 16 ledger accounts, generates `inviteCode` (`randomBytes(4).hex().toUpperCase()`) **for stockists only**; on user-insert failure **rolls back the tenant** (delete). Rate-limited + `auditMiddleware('auth')`.
- **`login`** — `loginUser` looks up **all** active users with that email across tenants, bcrypt-compares each; if `tenantType` supplied filters to that panel, else throws `This account is registered on the {Pharmacy|Stockist} panel` (→ 403). Updates `lastLoginAt`. Returns onboarding fields.
- **`me`** — identity + tenantType + `onboardingCompleted/onboardingStep` from live tenant row.
- **`logout`** — clears cookie.
- **`forgot-password`** — `forgotPassword` creates a `password_reset_tokens` row (jti, 15-min expiry) + a jose reset JWT; returns generic message always; `emailConfigured` from SMTP/Resend env; dev returns `devToken`. Only exact single-user match proceeds.
- **`reset-password`** — verifies reset JWT purpose+jti+sub, checks token row unused/unexpired, bcrypt-sets new hash, marks `usedAt`, **revokes refresh tokens**. Rate-limited + audited.
- **Session validity (`authenticate`)** — re-queries user+tenant on **every** request: 401 if user missing/`!isActive`; 401 `Session expired` if `floor(user.updatedAt/1000) > token.iat` (password change / profile update invalidates tokens); `tenantType` from live tenant.
- **Refresh tokens** — table + `revokeUserTokens()` exist (used on password change/deactivation) but **no `/auth/refresh` endpoint** (`additions.md`).

### 1.6 SessionExpiredRedirect
`authStore.triggerAuthRedirect` sets `pendingAuthRedirect`; the redirect component (mounted in `App`) reacts and routes to login. `authStore` also holds `user/initialized/logout` (best-effort `POST /auth/logout` then clears local).

### 1.7 Middleware posture (`server/src/middleware/*`)
- `authenticate` (§1.5). `requireRole(...roles)` → 403. `requireRoleForTenant({stockist:[],pharmacy:[]})` → tenant-scoped role gate; exports `sharedProductWrite`/`sharedProductAdjust` (`stockist:['admin']`, `pharmacy:['admin','pharmacist']`).
- `requireTenantType('stockist'|'pharmacy')` → 403 if wrong panel; 400 if tenantType missing.
- `auditMiddleware(entityType)` — on POST/PUT/PATCH/DELETE captures before-state (PATCH/PUT by id, or tenant PATCH), writes `audit_logs` on 2xx `finish`, **redacts** password/passwordHash/token/etc. Non-fatal on error.
- `rateLimit({windowMs,max,keyFn})` — in-memory fixed window per IP; sets `Retry-After`; 429. `authRateLimit` = 5/min prod, 200/min dev; `/api/public/*` = 60/min.
- `errorHandler` — ZodError→400; `InsufficientStockError`→409; `Error.statusCode===409`→409; `DUPLICATE_REFERENCE:`→409 (strips prefix); `Invalid credentials`→401; `…registered on the…`→403; else 500.
- **Router tenant pinning:** stockist-only = orders, bills, payments, supplier-payments, purchases, returns, suppliers, pharmacies; pharmacy-only = purchase-orders, grn, payable-bills, payable-payments, retail-sales, customers, stockist-returns; shared = products, settings, stockist-connections, reports, events, communication; `audit-logs`+`system` require admin; `public` unauthenticated.

---

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

## 5. Money Logic

- **GST (`lib/gst.ts` + client `gstClient`):** `isInterstate = sellerState !== buyerState`. Per line `tax=round2(sub*rate/100)`. Intra: `cgst=round2(tax/2)`, `sgst=round2(tax−cgst)` (symmetric, no paisa drift). Inter: all to igst. Rates 0/5/12/18/28. Order/bill lines GST-**exclusive**; retail POS GST-**inclusive**.
- **FEFO (`lib/inventory.ts`):** `reserveStock` selects non-expired batches (`qtyOnHand>0`, `expiryDate>asOfDate`) ordered by expiry asc then receivedAt asc, atomic conditional decrement per batch, **recurses** on concurrent consumption, throws `InsufficientStockError` (→409). `receiveStock` upserts batch on (tenant,product,batch,expiry). `releaseStock` restocks (fails loudly if batch missing). `getProductStock` sums non-expired only. Every mutation writes `stock_movements` (C24).
- **Double-entry ledger (`lib/ledger.ts`):** `postEntry` throws on imbalance (>0.01) and threads the caller's tx. 16 seeded accounts incl. **GRN_CLEARING** suspense bucket reconciling GRN (Inventory Dr / GRN_CLEARING Cr) vs later payable bill (GRN_CLEARING+GST-input Dr / Creditors Cr).
- **Credit exposure (`getPharmacyExposure`):** unpaid bill balances + approved-unbilled in-flight orders; enforced at create/finalize/approve; connection creditLimit precedence; `pharmacies.outstanding` denormalized + reconcilable.
- **Numbering (`lib/ids.ts`):** `ORD-YYYY-####`, `INV-YYYY-####`, `PAY-#####`, `RET-####`, `GRN-YYYY-####`, `SPAY-#####`, `PO-YYYY-####`, `PGRN-YYYY-####`, `SALE-YYYY-####`, `PPAY-#####`, `SRET-####`. Order/PO use count/max-scan with collision retry.
- **Dates:** business dates as `YYYY-MM-DD` text; `todayIST()` (Asia/Kolkata) governs same-day void; `validateExpiryDate` accepts YYYY-MM-DD / YYYY-MM / MM/YY → last day of month.

---

## 6. AI, WhatsApp, Public API, DB

- **AI bill parse** (`aiParseService`, `POST /purchases/parse`, multer ≤10MB): Gemini `gemini-2.0-flash`, strict-JSON prompt, strips fences, sanitizes numerics, fuzzy product match (exact→substring). Gated `FEATURE_AI_PARSE`+`GEMINI_API_KEY`. Also `aiOrderParseService` (`/orders/parse-text`) and `aiProductService` (`/products/autofill`, infers metadata) — server endpoints, product autofill has no dedicated UI wire beyond the gated route.
- **WhatsApp** (`whatsappService`, `POST /communication/send-bill`): client PDF (base64) → Meta Graph v20.0 media upload + document message; normalizes phone (+91); 502 on Graph failure. Gated `FEATURE_WHATSAPP`+token+phone id.
- **Bill verification** (`billVerificationService`, `GET /api/public/verify-bill/:id`): returns non-sensitive fields (billNumber/date/total/status/stockist/pharmacy). Front end now exists: invoice-footer QR on `BillDetailPage` + public `/verify-bill/:billId` page (see §8 update and §9.1).
- **Public API** (`routes/public.ts`, IP 60/min): `/stockists`, `/stockists/:slug`, `/stockists/:slug/catalog` (page ≤20, no PTR), `/verify-bill/:id`.
- **DB**: PGlite (`pglite:memory` default, `pglite:<path>` disk, else `pg` Pool). Schema in `db/schema.ts` — money `numeric(14,2)` as strings, `(tenantId,id)` unique indexes for scoping, `bills.order_id` unique (idempotent bills), stock_movements canonical log.

---

## 7. Error Codes / Edge Cases (consolidated)

`InsufficientStockError`→409; `CREDIT_LIMIT_EXCEEDED`; `PHARMACY_INACTIVE`; `CONNECTION_INACTIVE`; `PO_NOT_SUBMITTABLE`/`PO_NOT_CANCELLABLE`; `CATALOG_DRIFT`; `OVER_RECEIVE`; `EXPIRED_BATCH`; `BATCH_NOT_AVAILABLE`; `RX_REQUIRED`; `SPLIT_MISMATCH`; `DUPLICATE_REFERENCE`; `REFERENCE_REQUIRED`; `BILL_REQUIRED` (portal delivery); `ORDER_HAS_BILL` (cancel); `REQUEST_COOLDOWN` (7-day); `PAYMENT_EVENT_NO_CONNECTION/NO_BILLS`, `PAYMENT_VOID_*`, `RETURN_REQUEST_*`, `RETURN_PAYABLE_NOT_FOUND`, `CANCEL_REQUEST_*`, `UNKNOWN_EVENT_TYPE` (event handlers). Concurrency handled via conditional UPDATEs + transactions + atomic event claims + GRN idempotency key. Same-day-only voids (retail); last-admin & self-guards on users; adjust-stock cannot exceed qtyReceived; overdue derived not stored.

---

## 8. Known Stubs / Gaps (`additions.md`)

- **Bill QR verification — NOW IMPLEMENTED end-to-end** (superseding older gap notes): stockist `BillDetailPage` renders a QR image in the invoice footer via external `api.qrserver.com` (`data = {origin}/verify-bill/{bill.id}`, note: external CDN dependency, no offline QR lib), plus copy "Scan this QR code to verify your invoice now." Public page `/verify-bill/:billId` (`components/public/BillVerifyPage.tsx`, unauthenticated) calls `GET /api/public/verify-bill/:id` and renders Verified (green check, Bill#/Date/Total/Stockist/Pharmacy/Status) or "Bill Not Found" (red X). `billId==='demo'` renders explainer copy instead of querying. Pharmacy `PayableBillDetailPage` has no QR/print (still read-only).
- **Multi-step registration — Missing** (single form; PAN, WhatsApp, city, own PIN, serviceable pincodes, document uploads, bank details not collected — although `tenants` schema now has columns for all of them plus `approvalStatus`, so only the form is missing).
- **Platform admin panel — NOW IMPLEMENTED (basic)** (superseding older gap note): `/platform/login` + `/platform/dashboard` + `/platform/tenants|approvals` backed by `platform_users` (role `super_admin`), `routes/platform.ts` and `platformService`. See §9. No KYC document review or per-tenant drill UI beyond approve/reject; `listTenants` caps at 200 rows and filters in JS.
- **Copy/duplicate order — Both sides now have it** (pharmacy PO "Duplicate to Draft" is still **rejected-only**, no confirm dialog; stockist `OrderDetailPage` has a **Duplicate** button → `/orders/create?duplicateFrom={id}`, which `CreateOrderPage` honours by prefilling pharmacy/paymentMode/notes/lines from `useOrder(duplicateFrom)` — client-side only, no server endpoint needed).
- **AI** single model `gemini-2.0-flash`, no fallback, name-only fuzzy match; no-op without key.
- **WhatsApp** requires client to rasterize invoice; disabled without Meta creds.
- **Overdue** intentionally derived; `markOverdueBills`/`markOverduePayableBills` are no-ops.
- **Refresh tokens** in schema + revoked on password change/deactivation, but no `/auth/refresh`; sessions rely on 24h cookie + `updatedAt>iat` check.
- **Catalog push** always full re-syncs; `changedProductIds` unused.

---

## Appendix — API Surface (routes ↔ services)

`/auth` (userService) · `/public` (publicCatalogService, billVerificationService) · `/pharmacies` [stockist] · `/suppliers` [stockist] · `/supplier-payments` [stockist] · `/products` [shared] (+ `POST /autofill` aiProductService) · `/orders` [stockist] (orderService/billService/returnService/aiOrderParse) · `/bills` [stockist] · `/payments` [stockist] · `/purchases` [stockist] (purchaseService/aiParse) · `/returns` [stockist] · `/reports` [shared] · `/audit-logs` [shared admin] · `/users` [shared admin] · `/system` [shared admin] · `/settings` [shared] (+ publicCatalogService) · `/stockist-connections` [shared] · `/communication` [shared] (whatsapp) · `/purchase-orders` [pharmacy] · `/grn` [pharmacy] · `/payable-bills` [pharmacy] · `/payable-payments` [pharmacy] · `/retail-sales` [pharmacy] · `/customers` [pharmacy] · `/stockist-returns` [pharmacy] · `/events` [shared] · **`/platform`** [platform super_admin] (platformService) · **`/smart-order`** [pharmacy] (smartOrderService) · **`/accounts`** [consumer/doctor/mr] (extendedAccountService).

All are mounted in `server/src/index.ts` under `/api/*`; `GET /api/health` returns `{status:'ok'}`. On boot, after DB connect + inline migration, if `PLATFORM_ADMIN_EMAIL` and `PLATFORM_ADMIN_PASSWORD` are set, `ensurePlatformAdmin` seeds (idempotently) a `platform_users` super-admin row.

---

## 9. EXTENDED PANELS — Digital Swasthya umbrella (Home, Platform, Consumer, Doctor, MR)

The app is branded **"Digital Swasthya"** at the umbrella level (HomePage, invoice QR copy, verify page). Beyond the two tenant panels it ships four additional account kinds, each with its own auth tables, JWT `accountKind` claim, middleware, routes, and minimal client panel. These consolidate sibling-repo features (comments cite HUB/DSW/PharmaMR/Chameleon/MedOrder).

### 9.1 Home & public pages
- **`/` HomePage** (`components/home/HomePage.tsx`, no auth): "Digital Swasthya — Unified pharmaceutical distribution & healthcare platform" hero + a 6-card panel chooser: Stockist/Distributor (`/login`, blue), Pharmacy (`/login?panel=pharmacy`, teal), Customer/Patient (`/shop/login`, violet), Doctor (`/doctor/login`, emerald), Medical Representative (`/mr/login`, amber), Platform Admin (`/platform/login`, slate). Footer links: "Register as Stockist or Pharmacy" (`/register`) and "Verify a bill" (`/verify-bill/demo`). Labels come from `lib/panel.PANEL_LABELS`.
- **`/verify-bill/:billId` BillVerifyPage** — public, described in §8 update. Uses TanStack Query keyed `['verify-bill', billId]`, disabled for the `demo` id.

### 9.2 Panel plumbing (`lib/panel.ts`, `AccountProtectedRoute`, `authenticateAny`)
- `AppPanel = 'stockist'|'pharmacy'|'platform'|'consumer'|'doctor'|'mr'`. `detectPanelFromPath` maps path prefixes `/pharmacy`, `/platform`, `/shop|/consumer`, `/doctor`, `/mr` (else `?panel=` query, else stockist). `defaultDashboard(accountKind, tenantType)` → `/platform/dashboard`, `/shop/dashboard`, `/doctor/dashboard`, `/mr/dashboard`, `/pharmacy/dashboard`, or `/dashboard`. `loginPath`/`registerPath` map likewise (`/shop/login`, `/shop/register`, etc.).
- **`AccountProtectedRoute`** (`components/auth/AccountProtectedRoute.tsx`): props `accountKind` (+ optional `requiredTenantType`). On mount always calls `GET /auth/me` (which uses `authenticateAny` and returns `accountKind` in the payload); failure → `logout()`. Not logged in → redirect to that panel's `loginPath` preserving `state.from`. Wrong `accountKind` → redirect to the user's own `defaultDashboard`. Used to wrap `/platform/*`, `/shop/*`, `/doctor/*`, `/mr/*`.
- **Server middleware `accountAuth.ts`**: `authenticatePlatform/Consumer/Doctor/Mr` each verify the JWT, require `payload.accountKind === kind` (403 "X access required"), re-fetch the account row and 401 `Account inactive` if missing/inactive, then synthesize `req.user` (`tenantId:'platform'` or the account's own id; `role: 'super_admin'|'consumer'|'doctor'|'mr'`). **`authenticateAny`** dispatches on `payload.accountKind` (default `'tenant'` falls through to a users+tenants lookup — note: unlike tenant `authenticate` it does NOT perform the `updatedAt > iat` session-invalidation check). `GET /auth/me` uses `authenticateAny`, so one cookie endpoint serves all six panels.
- **JWTs for these accounts** are issued via the same `issueAccessToken` with `accountKind` in the payload and set as the same `accessToken` httpOnly cookie — logging into one panel replaces any other session in that browser.
- **Client layout wiring caveat (as-is behavior)**: `PlatformLayout`, `ConsumerLayout`, `DoctorLayout`, `MrLayout` render `<Outlet />` and accept no `children` prop, but `routes/index.tsx` passes the nested `<Routes>` as JSX **children** (`<PlatformLayout><Routes>…</Routes></PlatformLayout>`). The children are therefore discarded by the layout component; only the header/sidebar chrome + empty `<main>` render for these four panels as currently wired. Documented as observed in code — the tenant panels use the `children`-accepting `MainLayout`/`PharmacyMainLayout` and are unaffected.

### 9.3 Platform admin (`/api/platform`, `platform_users`)
- **Login** `POST /platform/login` (rate-limited 10/min prod, 200 dev): bcrypt against `platform_users`, issues cookie with `accountKind:'platform'`, role `super_admin`. `GET /platform/me` echoes identity.
- **`GET /platform/stats`** → `{totalTenants, stockists, pharmacies, pendingApprovals}` (pendingApprovals = tenants with `approvalStatus='pending'`).
- **`GET /platform/tenants?approvalStatus&tenantType`** → newest-first, LIMIT 200, filters applied in JS after the query. **`GET /platform/tenants/:id`** → `{tenant, staff[]}` (full user rows for the tenant). **`PATCH /platform/tenants/:id/approval {status:'approved'|'rejected'}`** → sets `tenants.approvalStatus`.
- **Client**: `PlatformLoginPage`; `PlatformDashboardPage` (4 StatCards from `/platform/stats`); `TenantApprovalsPage` (table Business/Type/Email/Status + Approve/Reject buttons per row, both always visible). Sidebar: Dashboard / Tenants / Approvals (both nav items render the same TenantApprovalsPage) + logout.
- **Note:** `tenants.approvalStatus` defaults to `'approved'` at registration and nothing in tenant login/middleware currently checks it — approval status is recorded and displayed but does not yet gate tenant access.

### 9.4 Consumer / shop panel (`/api/accounts/consumer/*`, tables `consumer_accounts`, `consumer_addresses`, `online_orders`, `online_order_items`)
- **Register** (`POST /accounts/consumer/register`: email/password≥8/name≥2/phone?; 409 on duplicate email) and **login**; both set the cookie (`accountKind:'consumer'`).
- **Unauthenticated browse:** `GET /accounts/consumer/pharmacies` (all publicly-listed pharmacy tenants: id/businessName/slug/city/stateCode) and `GET /accounts/consumer/pharmacies/:id/products` (active products: id/name/genericName/mrp/saleRate/category — the pharmacy's actual retail catalogue).
- **Orders:** `POST /accounts/consumer/orders` (auth) — items[{productId, productName, qty, unitPrice, gstRate?}], paymentMode `cod|upi|online` (default cod), deliveryAddress record, optional notes/prescriptionUrl. Server computes subtotal, `taxTotal = Σ qty·price·gst/100` (GST-exclusive, default rate 12), order number **`ONL-{base36 timestamp}`**, status `placed`. Statuses in schema: `placed → confirmed → preparing → out_for_delivery → delivered | cancelled` — **no transition endpoints exist yet** (orders stay `placed`); no stock consumption, no ledger, and no surfacing of online orders inside the pharmacy tenant panel. `GET /accounts/consumer/orders` lists the consumer's orders.
- **Doctors:** `GET /accounts/consumer/doctors` (active + approved only: name/specialization/video fee). `POST /accounts/consumer/consultations` books: fee picked from doctor's audio/video/clinic fee by mode, `scheduledAt` defaults now, status `scheduled`.
- **Client pages:** ConsumerDashboard (3 cards: Browse Pharmacies / My Orders / Consult a Doctor), ConsumerPharmaciesPage, ConsumerPharmacyShopPage (product grid + Add buttons, in-memory cart, sticky violet cart bar, "Place Order (COD)" hard-codes paymentMode cod, gstRate 12 and a placeholder delivery address `{line:'To be collected', city:'—', pin:'000000'}`), ConsumerOrdersPage (orderNumber/status/total/date cards), ConsumerDoctorsPage (Book → video consult). `consumer_addresses` table exists but no UI/API uses it yet.

### 9.5 Doctor panel (`/api/accounts/doctor/*`, tables `doctor_accounts`, `consultations`)
- Register (email/password/name/phone?/specialization?) — `approvalStatus` is `'approved'` in development, `'pending'` in production (so prod doctors are invisible to consumers until approved — but **no approval endpoint/UI exists for doctors**; the platform panel only approves tenants). Login returns `approvalStatus`.
- `GET /accounts/doctor/consultations` lists the doctor's consultations. Client: DoctorDashboardPage (static copy + link) and DoctorConsultationsPage (mode/status/fee/date cards). Consultation fields `prescriptionJson`, statuses `in_progress/completed/cancelled` and the fee-editing surface have **no endpoints/UI** yet.

### 9.6 MR panel (`/api/accounts/mr/*`, tables `mr_accounts`, `mr_pharmacy_visits`)
- Register (email/password/name/phone?/brand?), login. `GET/POST /accounts/mr/visits` — record `{pharmacyName≥2, phone?, address?, notes?}` visit rows (free-text pharmacy names, not linked to tenants). Client: MrDashboardPage (static) and MrVisitsPage (inline record-visit form + visit list). `territory` column unused by UI.

---

## 10. SMART ORDER (pharmacy) — `/pharmacy/smart-order`, `/api/smart-order`, `smart_order_sessions`

- **Access:** pharmacy panel, `pharmPlus` route wrapper (admin+pharmacist); server `requireTenantType('pharmacy')`. Sidebar entry "Smart Order" (Sparkles icon) in the Procurement group.
- **Page (`SmartOrderPage.tsx`):** textarea ("Dolo 650 x 10…"), **Analyse** → `POST /smart-order/parse {rawText}`; shows parsed items with catalogue-match counts. **Get Recommendations** → `POST /smart-order/recommend {sessionId}`; renders up to 3 strategy cards, each with label/description, "Covers X/Y items · N stockist(s) · ₹total", green "Saves ₹… vs best single" when applicable, and a **Create PO** button.
- **`parseSmartOrder`:** loads ALL active connections + their `stockist_catalog_items` for the pharmacy. Line parsing: if `GEMINI_API_KEY` set and ≥1 connection, delegates to `parseOrderText` (Gemini) against the **first** connection's stockist catalogue; else (or on any AI error) `parseLinesLocally` — regex `^(.*?)[sep](x?)(\d+)(unit)?$` per line, qty default 1. Each parsed name is fuzzy-matched (exact → contains-either-way → token>2 overlap) against the merged catalogue, dropping `out_of_stock` items; matches carry connectionId/stockistName/catalogItemId/stockistProductId/saleRate/mrp/availability. Persists a `smart_order_sessions` row (`rawText`, `parsedJson`) and returns `{sessionId, items}`.
- **`recommendSmartOrder`:** rebuilds from the stored session. Three strategies: **best_single** (stockist covering most items, tie-break lowest cost), **cheapest_split** (per-item minimum saleRate across stockists; computes `savingsVsSingle`), **fastest_delivery** (per-item rank in_stock<low<out, tie-break price — "same as best single for now (no delivery calendar)"). Stores `recommendationsJson` on the session, returns `{sessionId, recommendations}` (each with items[], totalCost, stockistCount, itemsCovered, totalItems).
- **Create PO handoff:** if the recommendation uses exactly one connection, the page writes `sessionStorage['smart-order-draft'] = {connectionId, lines:[{catalogItemId, productName, qty, unitPrice}]}` and navigates to `/pharmacy/purchase-orders/create?fromSmartOrder=1`. **As currently wired, `CreatePurchaseOrderPage` does not read `fromSmartOrder` or the `smart-order-draft` key** — the create page opens blank; the handoff is a stub. Multi-stockist recommendations show an info toast ("create separate POs per stockist") instead.

---

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

## 13. CLIENT ARCHITECTURE — state, data flow, shared UI

- **TanStack Query 5** is the only server-state cache. `api/queryClient.ts`: `staleTime 30s`, `retry 1`, `refetchOnWindowFocus false`. ~25 hook modules under `client/src/hooks/` wrap every API family (useBills, useCustomers, useDebounce, useEvents, useGrn, useOrders, usePanelBasePath, usePayableBills, usePayablePayments, usePayments, usePharmacies, usePharmacyConnections, useProducts, usePublicStockists, usePurchaseOrders, usePurchases, useReports, useReportsHubLink, useRetailSales, useReturns, useSettings, useStockistConnections, useStockistReturns, useSuppliers, useUsers); mutations invalidate their query keys on success.
- **Zustand** holds exactly two stores: `authStore` (user, initialized, setUser/setInitialized, logout [best-effort `POST /auth/logout` then local clear], pendingAuthRedirect + triggerAuthRedirect used by the axios 401 interceptor and `SessionExpiredRedirect`) and `eventSyncStore` (`lastError` string for the cross-tenant sync banner).
- **Event polling pipeline (`useEvents`):** mounted once per layout shell with `poll:true`. Query `['events', limit]` fetches `GET /events` every **10 s**; whenever pending events exist it POSTs `/events/process`, then invalidates a fixed fan-out of query keys (events, events-history, purchase-orders, payable-bills, stockist-connections, pharmacy-connections, returns, stockist-returns, orders, bills, payments, incoming-orders). Failures surface one deduped toast (`id:'event-sync-error'`) + `eventSyncStore.lastError`; success clears both. A one-shot effect drains the queue on first mount. `useProcessEvents` powers the header "Sync now" button with the same invalidation set.
- **Local/session storage:** `stockist:createOrderDraft` (CreateOrderPage autosave), `smart-order-draft` (Smart Order → PO handoff, currently unread), plus print flags via URL params (`?print=1`).
- **Shared UI kit (`components/common/`):** Badge, BottomNav, Button, Card, ConfirmDialog, Input, LoadingSpinner, PageHeader (title+breadcrumbs+actions), SlideOver (right panel used by nearly every create/edit form), StatCard, tables are hand-rolled per page with mobile card fallbacks. Toasts via react-hot-toast (top-right). Charts via Recharts. PDF via jsPDF+html2canvas (`lib/invoicePdf.ts`). CSV utils in `lib/exportUtils.ts`/`csvParse.ts`. Formatters (`formatCurrency` ₹, `formatDate`) in `lib/formatters.ts`. `lib/expiry.ts` tiers expiry badges; `lib/money.ts` rounding; `lib/nav.ts`/`pharmacyQuery.ts`/`tenantSettings.ts`/`fields.ts` misc helpers.

---

## 14. RECENT UNCOMMITTED CHANGES — documented as the code is NOW

1. **CreateOrderPage "Paste Order" panel** (stockist): toggle button (ClipboardList icon) above the line table opens an inline panel with a monospace textarea ("Paste WhatsApp order — one item per line", placeholder `Paracetamol -10 / Azithral 500 x 5 / Pan 40 20`). **Parse & Add** runs the regex `^(.*?)[\s,:\-–—]*(?:x\s*)?(\d+)\s*(?:n|nos|tabs?|strips?|boxes?|pcs?|units?)?\.?$` per line (qty defaults 1) and fuzzy-matches names against the loaded product list (exact → contains-either-way → token>2). Matched lines are appended priced at product saleRate; toast reports "Added N item(s)" and lists unmatched raw lines; zero matches → error toast; panel auto-closes only on full success. Purely client-side (does not call `/orders/parse-text`).
2. **CreateOrderPage `?duplicateFrom=`** support + OrderDetailPage **Duplicate** button (see §8 update).
3. **Onboarding dismiss fix (`OnboardingFlow.handleSkip`)**: Dismiss/X/backdrop is explicitly "set up later" — best-effort saves step-0 fields if DL is filled and GSTIN passes validation, best-effort persists the current step (never `onboardingCompleted`), and **always closes** even if either call fails (both wrapped in swallow-try). Back button also persists the step. Completing requires reaching step 4 and passes `onboardingCompleted:true` (server min-setup gates still apply, §2.11).
4. **UploadBillModal**: (a) when features load and `aiParse` is off (and no `initialProductId` deep-link), `entryMode` auto-switches to **manual** since the Upload tab would be a dead-end; the Upload tab button is disabled + labelled "Upload PDF (AI off)" and the upload pane is replaced by an amber notice with an inline switch-to-manual link; footer **Save Purchase is disabled while on the Upload tab** ("Add items in Manual Entry before saving"). (b) **Per-line validation**: before save, the first partially-filled line produces a pinpoint toast `Line N: fill product, batch #, expiry, quantity, MRP, purchase rate` (only missing fields listed); untouched empty lines are skipped; at least one fully valid line required. Products can be picked from a searchable select or typed as a new name (server creates them). AI parse fills lines then switches to manual mode for review.
5. **AI endpoints live now**: `POST /api/orders/parse-text` (admin/biller, gated `FEATURE_AI_PARSE`, Gemini order-text→catalogue-matched lines, no dedicated UI); `POST /api/products/autofill` (`sharedProductWrite` roles; gated on `GEMINI_API_KEY`; name≥3 chars; Gemini `gemini-2.0-flash` prompt infers genericName/manufacturer/category [fixed 13-value list]/scheduleType/hsnCode ["usually 3004"]/gstRate, strips code fences, nulls when unsure; **server-only, no UI wire**); `GET /api/public/verify-bill/:id` now consumed by the invoice QR + BillVerifyPage.

---

## 15. SERVER ENV & FEATURE FLAGS (`server/src/env.ts`)

`JWT_SECRET` (required ≥32 chars, boot fails), `JWT_ACCESS_TTL` (24h) / `JWT_REFRESH_TTL` (7d, unused), `PORT` (4000), `DATABASE_URL` (`pglite:memory` | `pglite:<path>` | postgres URL), `FEATURE_AI_PARSE` + `GEMINI_API_KEY` (AI bill/order parse + autofill), `FEATURE_WHATSAPP` + `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_ID` (invoice send), SMTP_* / Resend (password-reset mail; otherwise dev returns `devToken`), `PLATFORM_ADMIN_EMAIL/PASSWORD/NAME` (boot-seeded super admin). `GET /settings/features` exposes `{whatsapp, aiParse, whatsappConfigured}` to the client (`useFeatures`).

---

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

## 17. DOCUMENT MAP / READING ORDER

§0 stack & tenancy → §1 auth → §2 stockist pages → §3 pharmacy pages → §4 connections/catalogs/events → §5 money logic → §6 AI/WhatsApp/public/DB → §7 error codes → §8 stubs/gaps (with 2026-07 corrections) → §9 umbrella panels (platform/consumer/doctor/MR) → §10 smart order → §11 full schema (48 tables) + shared enums → §12 ledger posting matrix → §13 client architecture → §14 recent uncommitted changes → §15 env/flags → §16 role journeys → Appendix API surface.

---

*Documentation audit pass appended below — code-derived additions only; prior content preserved.*

## EXPANSION — Code-Derived Additions (Audit Pass)

*Audit date: 2026-07-04. Content derived exclusively from source under `STOCKIST-PHARMACY/`. Documents implemented behavior only.*

### E.1 Complete Route Table

**Frontend routes extracted:** 92 | **Server API routes:** 165

| # | Path | Component | Role/Gate | Source |
|---|------|-----------|-----------|--------|
| 1 | `/` | HomePage | — | `client/src/routes/index.tsx` |
| 2 | `/verify-bill/:billId` | BillVerifyPage | — | `client/src/routes/index.tsx` |
| 3 | `/login` | LoginPage | — | `client/src/routes/index.tsx` |
| 4 | `/register` | RegisterPage | — | `client/src/routes/index.tsx` |
| 5 | `/forgot-password` | ForgotPasswordPage | — | `client/src/routes/index.tsx` |
| 6 | `/reset-password` | ResetPasswordPage | — | `client/src/routes/index.tsx` |
| 7 | `/pharmacy/forgot-password` | ForgotPasswordPage | — | `client/src/routes/index.tsx` |
| 8 | `/pharmacy/reset-password` | ResetPasswordPage | — | `client/src/routes/index.tsx` |
| 9 | `/platform/login` | PlatformLoginPage | — | `client/src/routes/index.tsx` |
| 10 | `/shop/login` | ConsumerLoginPage | — | `client/src/routes/index.tsx` |
| 11 | `/shop/register` | ConsumerRegisterPage | — | `client/src/routes/index.tsx` |
| 12 | `/doctor/login` | DoctorLoginPage | — | `client/src/routes/index.tsx` |
| 13 | `/doctor/register` | DoctorRegisterPage | — | `client/src/routes/index.tsx` |
| 14 | `/mr/login` | MrLoginPage | — | `client/src/routes/index.tsx` |
| 15 | `/mr/register` | MrRegisterPage | — | `client/src/routes/index.tsx` |
| 16 | `/platform/dashboard` | PlatformDashboardPage | — | `client/src/routes/index.tsx` |
| 17 | `/platform/tenants` | TenantApprovalsPage | — | `client/src/routes/index.tsx` |
| 18 | `/platform/approvals` | TenantApprovalsPage | — | `client/src/routes/index.tsx` |
| 19 | `/shop/dashboard` | ConsumerDashboardPage | — | `client/src/routes/index.tsx` |
| 20 | `/shop/pharmacies` | ConsumerPharmaciesPage | — | `client/src/routes/index.tsx` |
| 21 | `/shop/pharmacies/:pharmacyId` | ConsumerPharmacyShopPage | — | `client/src/routes/index.tsx` |
| 22 | `/shop/orders` | ConsumerOrdersPage | — | `client/src/routes/index.tsx` |
| 23 | `/shop/doctors` | ConsumerDoctorsPage | — | `client/src/routes/index.tsx` |
| 24 | `/doctor/dashboard` | DoctorDashboardPage | — | `client/src/routes/index.tsx` |
| 25 | `/doctor/consultations` | DoctorConsultationsPage | — | `client/src/routes/index.tsx` |
| 26 | `/mr/dashboard` | MrDashboardPage | — | `client/src/routes/index.tsx` |
| 27 | `/mr/visits` | MrVisitsPage | — | `client/src/routes/index.tsx` |
| 28 | `/pharmacy/dashboard` | PharmacyDashboardPage | cashierPlus | `client/src/routes/index.tsx` |
| 29 | `/pharmacy/discover` | DiscoverStockistsPage | pharmPlus | `client/src/routes/index.tsx` |
| 30 | `/pharmacy/discover/:slug` | StockistPublicProfilePage | pharmPlus | `client/src/routes/index.tsx` |
| 31 | `/pharmacy/stockists` | StockistListPage | pharmPlus | `client/src/routes/index.tsx` |
| 32 | `/pharmacy/stockists/:connectionId` | StockistDetailPage | pharmPlus | `client/src/routes/index.tsx` |
| 33 | `/pharmacy/purchase-orders` | PurchaseOrderListPage | pharmPlus | `client/src/routes/index.tsx` |
| 34 | `/pharmacy/purchase-orders/create` | CreatePurchaseOrderPage | pharmPlus | `client/src/routes/index.tsx` |
| 35 | `/pharmacy/purchase-orders/:id` | PurchaseOrderDetailPage | pharmPlus | `client/src/routes/index.tsx` |
| 36 | `/pharmacy/smart-order` | SmartOrderPage | pharmPlus | `client/src/routes/index.tsx` |
| 37 | `/pharmacy/grn` | GrnListPage | pharmPlus | `client/src/routes/index.tsx` |
| 38 | `/pharmacy/grn/:id` | GrnDetailPage | pharmPlus | `client/src/routes/index.tsx` |
| 39 | `/pharmacy/products` | PharmacyProductListPage | cashierPlus | `client/src/routes/index.tsx` |
| 40 | `/pharmacy/products/:id` | PharmacyProductDetailPage | cashierPlus | `client/src/routes/index.tsx` |
| 41 | `/pharmacy/pos` | PosPage | cashierPlus | `client/src/routes/index.tsx` |
| 42 | `/pharmacy/sales` | SalesHistoryPage | cashierPlus | `client/src/routes/index.tsx` |
| 43 | `/pharmacy/sales/:id` | SaleDetailPage | cashierPlus | `client/src/routes/index.tsx` |
| 44 | `/pharmacy/customers` | PharmacyCustomersPage | cashierPlus | `client/src/routes/index.tsx` |
| 45 | `/pharmacy/payable-bills` | PayableBillListPage | pharmPlus | `client/src/routes/index.tsx` |
| 46 | `/pharmacy/payable-bills/:id` | PayableBillDetailPage | pharmPlus | `client/src/routes/index.tsx` |
| 47 | `/pharmacy/payments` | PayablePaymentsPage | pharmPlus | `client/src/routes/index.tsx` |
| 48 | `/pharmacy/returns` | StockistReturnListPage | pharmPlus | `client/src/routes/index.tsx` |
| 49 | `/pharmacy/returns/:id` | StockistReturnDetailPage | pharmPlus | `client/src/routes/index.tsx` |
| 50 | `/pharmacy/reports` | PharmacyReportsHub | pharmPlus | `client/src/routes/index.tsx` |
| 51 | `/pharmacy/reports/sales` | PharmacySalesReport | pharmPlus | `client/src/routes/index.tsx` |
| 52 | `/pharmacy/reports/stock-aging` | PharmacyStockAgingReport | pharmPlus | `client/src/routes/index.tsx` |
| 53 | `/pharmacy/reports/gst` | PharmacyGstReport | admin | `client/src/routes/index.tsx` |
| 54 | `/pharmacy/reports/payables-aging` | PharmacyPayablesReport | admin | `client/src/routes/index.tsx` |
| 55 | `/pharmacy/reports/payables` | PharmacyPayablesReport | admin | `client/src/routes/index.tsx` |
| 56 | `/pharmacy/reports/profit` | PharmacyProfitReport | admin | `client/src/routes/index.tsx` |
| 57 | `/pharmacy/reports/compliance` | PharmacyComplianceReport | admin | `client/src/routes/index.tsx` |
| 58 | `/pharmacy/expiry-alerts` | PharmacyExpiryAlertsPage | pharmPlus | `client/src/routes/index.tsx` |
| 59 | `/pharmacy/audit-logs` | PharmacyAuditLogsPage | admin | `client/src/routes/index.tsx` |
| 60 | `/pharmacy/settings` | PharmacySettingsPage | admin | `client/src/routes/index.tsx` |
| 61 | `/pharmacy/*` | p | — | `client/src/routes/index.tsx` |
| 62 | `/dashboard` | DashboardPage | — | `client/src/routes/index.tsx` |
| 63 | `/pharmacies` | PharmacyListPage | — | `client/src/routes/index.tsx` |
| 64 | `/pharmacies/:id` | PharmacyDetailPage | — | `client/src/routes/index.tsx` |
| 65 | `/products` | ProductListPage | — | `client/src/routes/index.tsx` |
| 66 | `/products/:id` | ProductDetailPage | — | `client/src/routes/index.tsx` |
| 67 | `/orders` | OrderListPage | — | `client/src/routes/index.tsx` |
| 68 | `/orders/create` | CreateOrderPage | admin | `client/src/routes/index.tsx` |
| 69 | `/orders/:id` | OrderDetailPage | — | `client/src/routes/index.tsx` |
| 70 | `/bills` | BillListPage | — | `client/src/routes/index.tsx` |
| 71 | `/bills/:id` | BillDetailPage | — | `client/src/routes/index.tsx` |
| 72 | `/payments` | PaymentListPage | — | `client/src/routes/index.tsx` |
| 73 | `/payments/:id` | PaymentDetailPage | — | `client/src/routes/index.tsx` |
| 74 | `/purchase-bills` | PurchaseListPage | — | `client/src/routes/index.tsx` |
| 75 | `/purchase-bills/:id` | PurchaseDetailPage | — | `client/src/routes/index.tsx` |
| 76 | `/suppliers` | SupplierListPage | — | `client/src/routes/index.tsx` |
| 77 | `/suppliers/:id` | SupplierDetailPage | — | `client/src/routes/index.tsx` |
| 78 | `/required-stock` | RequiredStockPage | — | `client/src/routes/index.tsx` |
| 79 | `/returns` | ReturnsListPage | — | `client/src/routes/index.tsx` |
| 80 | `/returns/:id` | ReturnDetailPage | — | `client/src/routes/index.tsx` |
| 81 | `/reports` | ReportsHub | billerReports | `client/src/routes/index.tsx` |
| 82 | `/reports/sales` | SalesReport | billerReports | `client/src/routes/index.tsx` |
| 83 | `/reports/outstanding` | OutstandingReport | admin | `client/src/routes/index.tsx` |
| 84 | `/reports/gst` | GSTReport | admin | `client/src/routes/index.tsx` |
| 85 | `/reports/stock-aging` | StockAgingReport | billerReports | `client/src/routes/index.tsx` |
| 86 | `/reports/profit` | ProfitReport | admin | `client/src/routes/index.tsx` |
| 87 | `/reports/compliance` | ComplianceReport | admin | `client/src/routes/index.tsx` |
| 88 | `/reports/portal-orders` | PortalOrdersReport | admin | `client/src/routes/index.tsx` |
| 89 | `/reports/purchase-analysis` | PurchaseAnalysisReport | admin | `client/src/routes/index.tsx` |
| 90 | `/audit-logs` | AuditLogsPage | admin | `client/src/routes/index.tsx` |
| 91 | `/settings` | SettingsPage | admin | `client/src/routes/index.tsx` |
| 92 | `/*` | p | — | `client/src/routes/index.tsx` |

#### Server / API Routes

| # | Method | Path | File |
|---|--------|------|------|
| 1 | GET | `/` | `server/src/routes/customers.ts` |
| 2 | GET | `/:id` | `server/src/routes/customers.ts` |
| 3 | POST | `/` | `server/src/routes/customers.ts` |
| 4 | PATCH | `/:id` | `server/src/routes/customers.ts` |
| 5 | DELETE | `/:id` | `server/src/routes/customers.ts` |
| 6 | GET | `/` | `server/src/routes/pharmacies.ts` |
| 7 | GET | `/:id` | `server/src/routes/pharmacies.ts` |
| 8 | GET | `/:id/orders` | `server/src/routes/pharmacies.ts` |
| 9 | GET | `/:id/bills` | `server/src/routes/pharmacies.ts` |
| 10 | GET | `/:id/outstanding-bills` | `server/src/routes/pharmacies.ts` |
| 11 | GET | `/:id/credit-info` | `server/src/routes/pharmacies.ts` |
| 12 | POST | `/` | `server/src/routes/pharmacies.ts` |
| 13 | PATCH | `/:id` | `server/src/routes/pharmacies.ts` |
| 14 | GET | `/:id/returns` | `server/src/routes/pharmacies.ts` |
| 15 | GET | `/:id/ledger` | `server/src/routes/pharmacies.ts` |
| 16 | POST | `/:id/reconcile-outstanding` | `server/src/routes/pharmacies.ts` |
| 17 | GET | `/` | `server/src/routes/stockistReturns.ts` |
| 18 | GET | `/:id` | `server/src/routes/stockistReturns.ts` |
| 19 | POST | `/` | `server/src/routes/stockistReturns.ts` |
| 20 | GET | `/` | `server/src/routes/suppliers.ts` |
| 21 | GET | `/:id` | `server/src/routes/suppliers.ts` |
| 22 | GET | `/:id/purchases` | `server/src/routes/suppliers.ts` |
| 23 | POST | `/` | `server/src/routes/suppliers.ts` |
| 24 | PATCH | `/:id` | `server/src/routes/suppliers.ts` |
| 25 | GET | `/:id/ledger` | `server/src/routes/suppliers.ts` |
| 26 | GET | `/` | `server/src/routes/bills.ts` |
| 27 | GET | `/:id` | `server/src/routes/bills.ts` |
| 28 | PATCH | `/:id/status` | `server/src/routes/bills.ts` |
| 29 | GET | `/dashboard` | `server/src/routes/reports.ts` |
| 30 | GET | `/sales` | `server/src/routes/reports.ts` |
| 31 | GET | `/outstanding` | `server/src/routes/reports.ts` |
| 32 | GET | `/gst` | `server/src/routes/reports.ts` |
| 33 | GET | `/stock-aging` | `server/src/routes/reports.ts` |
| 34 | GET | `/required-stock` | `server/src/routes/reports.ts` |
| 35 | GET | `/compliance` | `server/src/routes/reports.ts` |
| 36 | GET | `/profit` | `server/src/routes/reports.ts` |
| 37 | GET | `/portal-orders` | `server/src/routes/reports.ts` |
| 38 | GET | `/purchase-analysis` | `server/src/routes/reports.ts` |
| 39 | POST | `/consumer/register` | `server/src/routes/extendedAccounts.ts` |
| 40 | POST | `/consumer/login` | `server/src/routes/extendedAccounts.ts` |
| 41 | GET | `/consumer/pharmacies` | `server/src/routes/extendedAccounts.ts` |
| 42 | GET | `/consumer/pharmacies/:id/products` | `server/src/routes/extendedAccounts.ts` |
| 43 | GET | `/consumer/orders` | `server/src/routes/extendedAccounts.ts` |
| 44 | POST | `/consumer/orders` | `server/src/routes/extendedAccounts.ts` |
| 45 | GET | `/consumer/doctors` | `server/src/routes/extendedAccounts.ts` |
| 46 | POST | `/consumer/consultations` | `server/src/routes/extendedAccounts.ts` |
| 47 | POST | `/doctor/register` | `server/src/routes/extendedAccounts.ts` |
| 48 | POST | `/doctor/login` | `server/src/routes/extendedAccounts.ts` |
| 49 | GET | `/doctor/consultations` | `server/src/routes/extendedAccounts.ts` |
| 50 | POST | `/mr/register` | `server/src/routes/extendedAccounts.ts` |
| 51 | POST | `/mr/login` | `server/src/routes/extendedAccounts.ts` |
| 52 | GET | `/mr/visits` | `server/src/routes/extendedAccounts.ts` |
| 53 | POST | `/mr/visits` | `server/src/routes/extendedAccounts.ts` |
| 54 | GET | `/features` | `server/src/routes/settings.ts` |
| 55 | GET | `/tenant` | `server/src/routes/settings.ts` |
| 56 | PATCH | `/tenant` | `server/src/routes/settings.ts` |
| 57 | PATCH | `/onboarding` | `server/src/routes/settings.ts` |
| 58 | GET | `/public-catalog` | `server/src/routes/settings.ts` |
| 59 | POST | `/public-catalog/sync` | `server/src/routes/settings.ts` |
| 60 | PATCH | `/public-catalog/:productId` | `server/src/routes/settings.ts` |
| 61 | POST | `/send-bill` | `server/src/routes/communication.ts` |
| 62 | POST | `/parse` | `server/src/routes/smartOrder.ts` |
| 63 | POST | `/recommend` | `server/src/routes/smartOrder.ts` |
| 64 | POST | `/login` | `server/src/routes/platform.ts` |
| 65 | GET | `/me` | `server/src/routes/platform.ts` |
| 66 | GET | `/stats` | `server/src/routes/platform.ts` |
| 67 | GET | `/tenants` | `server/src/routes/platform.ts` |
| 68 | GET | `/tenants/:id` | `server/src/routes/platform.ts` |
| 69 | PATCH | `/tenants/:id/approval` | `server/src/routes/platform.ts` |
| 70 | GET | `/` | `server/src/routes/stockistConnections.ts` |
| 71 | GET | `/search` | `server/src/routes/stockistConnections.ts` |
| 72 | GET | `/by-stockist/:stockistTenantId` | `server/src/routes/stockistConnections.ts` |
| 73 | GET | `/:id` | `server/src/routes/stockistConnections.ts` |
| 74 | POST | `/request` | `server/src/routes/stockistConnections.ts` |
| 75 | POST | `/:id/withdraw` | `server/src/routes/stockistConnections.ts` |
| 76 | POST | `/:id/approve` | `server/src/routes/stockistConnections.ts` |
| 77 | POST | `/:id/reject` | `server/src/routes/stockistConnections.ts` |
| 78 | POST | `/:id/disconnect` | `server/src/routes/stockistConnections.ts` |
| 79 | POST | `/:id/sync-catalog` | `server/src/routes/stockistConnections.ts` |
| 80 | POST | `/:id/pull-catalog` | `server/src/routes/stockistConnections.ts` |
| 81 | GET | `/:id/catalog` | `server/src/routes/stockistConnections.ts` |
| 82 | PATCH | `/:id/catalog/:catalogItemId/map` | `server/src/routes/stockistConnections.ts` |
| 83 | GET | `/` | `server/src/routes/retailSales.ts` |
| 84 | GET | `/:id` | `server/src/routes/retailSales.ts` |
| 85 | POST | `/` | `server/src/routes/retailSales.ts` |
| 86 | POST | `/:id/void` | `server/src/routes/retailSales.ts` |
| 87 | GET | `/` | `server/src/routes/returns.ts` |
| 88 | GET | `/:id` | `server/src/routes/returns.ts` |
| 89 | POST | `/:id/process` | `server/src/routes/returns.ts` |
| 90 | POST | `/:id/reject` | `server/src/routes/returns.ts` |
| 91 | POST | `/autofill` | `server/src/routes/products.ts` |
| 92 | GET | `/` | `server/src/routes/products.ts` |
| 93 | GET | `/export` | `server/src/routes/products.ts` |
| 94 | GET | `/categories` | `server/src/routes/products.ts` |
| 95 | GET | `/:id` | `server/src/routes/products.ts` |
| 96 | GET | `/:id/batches` | `server/src/routes/products.ts` |
| 97 | POST | `/from-catalog/:catalogItemId` | `server/src/routes/products.ts` |
| 98 | POST | `/` | `server/src/routes/products.ts` |
| 99 | PATCH | `/:id` | `server/src/routes/products.ts` |
| 100 | POST | `/:id/adjust-stock` | `server/src/routes/products.ts` |
| 101 | POST | `/parse-text` | `server/src/routes/orders.ts` |
| 102 | GET | `/` | `server/src/routes/orders.ts` |
| 103 | GET | `/:id` | `server/src/routes/orders.ts` |
| 104 | POST | `/` | `server/src/routes/orders.ts` |
| 105 | POST | `/:id/finalize` | `server/src/routes/orders.ts` |
| 106 | POST | `/:id/deliver` | `server/src/routes/orders.ts` |
| 107 | POST | `/:id/ship` | `server/src/routes/orders.ts` |
| 108 | POST | `/:id/approve` | `server/src/routes/orders.ts` |
| 109 | POST | `/:id/reject` | `server/src/routes/orders.ts` |
| 110 | POST | `/:id/cancel-approved` | `server/src/routes/orders.ts` |
| 111 | POST | `/:id/cancel` | `server/src/routes/orders.ts` |
| 112 | POST | `/:id/bill` | `server/src/routes/orders.ts` |
| 113 | POST | `/:id/return` | `server/src/routes/orders.ts` |
| 114 | GET | `/` | `server/src/routes/purchases.ts` |
| 115 | GET | `/:id` | `server/src/routes/purchases.ts` |
| 116 | GET | `/:id/ledger` | `server/src/routes/purchases.ts` |
| 117 | POST | `/` | `server/src/routes/purchases.ts` |
| 118 | POST | `/sale-rates` | `server/src/routes/purchases.ts` |
| 119 | POST | `/parse` | `server/src/routes/purchases.ts` |
| 120 | POST | `/:id/receive` | `server/src/routes/purchases.ts` |
| 121 | PATCH | `/:id` | `server/src/routes/purchases.ts` |
| 122 | GET | `/` | `server/src/routes/events.ts` |
| 123 | GET | `/history` | `server/src/routes/events.ts` |
| 124 | POST | `/process` | `server/src/routes/events.ts` |
| 125 | POST | `/:id/apply` | `server/src/routes/events.ts` |
| 126 | GET | `/` | `server/src/routes/payablePayments.ts` |
| 127 | POST | `/` | `server/src/routes/payablePayments.ts` |
| 128 | POST | `/:id/void` | `server/src/routes/payablePayments.ts` |
| 129 | GET | `/` | `server/src/routes/users.ts` |
| 130 | POST | `/` | `server/src/routes/users.ts` |
| 131 | PATCH | `/:id` | `server/src/routes/users.ts` |
| 132 | POST | `/change-password` | `server/src/routes/users.ts` |
| 133 | GET | `/` | `server/src/routes/grn.ts` |
| 134 | GET | `/:id` | `server/src/routes/grn.ts` |
| 135 | POST | `/` | `server/src/routes/grn.ts` |
| 136 | GET | `/` | `server/src/routes/purchaseOrders.ts` |
| 137 | GET | `/:id` | `server/src/routes/purchaseOrders.ts` |
| 138 | POST | `/` | `server/src/routes/purchaseOrders.ts` |
| 139 | PATCH | `/:id` | `server/src/routes/purchaseOrders.ts` |
| 140 | POST | `/:id/submit` | `server/src/routes/purchaseOrders.ts` |
| 141 | POST | `/:id/cancel` | `server/src/routes/purchaseOrders.ts` |
| 142 | POST | `/:id/confirm-receipt` | `server/src/routes/purchaseOrders.ts` |
| 143 | DELETE | `/:id` | `server/src/routes/purchaseOrders.ts` |
| 144 | GET | `/` | `server/src/routes/audit.ts` |
| 145 | GET | `/:id` | `server/src/routes/audit.ts` |
| 146 | GET | `/check-reference` | `server/src/routes/payments.ts` |
| 147 | GET | `/` | `server/src/routes/payments.ts` |
| 148 | GET | `/:id` | `server/src/routes/payments.ts` |
| 149 | POST | `/` | `server/src/routes/payments.ts` |
| 150 | POST | `/:id/void` | `server/src/routes/payments.ts` |
| 151 | GET | `/health` | `server/src/routes/system.ts` |
| 152 | GET | `/verify-bill/:id` | `server/src/routes/public.ts` |
| 153 | GET | `/stockists` | `server/src/routes/public.ts` |
| 154 | GET | `/stockists/:slug` | `server/src/routes/public.ts` |
| 155 | GET | `/stockists/:slug/catalog` | `server/src/routes/public.ts` |
| 156 | GET | `/` | `server/src/routes/supplierPayments.ts` |
| 157 | POST | `/` | `server/src/routes/supplierPayments.ts` |
| 158 | POST | `/register` | `server/src/routes/auth.ts` |
| 159 | POST | `/login` | `server/src/routes/auth.ts` |
| 160 | POST | `/logout` | `server/src/routes/auth.ts` |
| 161 | GET | `/me` | `server/src/routes/auth.ts` |
| 162 | POST | `/forgot-password` | `server/src/routes/auth.ts` |
| 163 | POST | `/reset-password` | `server/src/routes/auth.ts` |
| 164 | GET | `/` | `server/src/routes/payableBills.ts` |
| 165 | GET | `/:id` | `server/src/routes/payableBills.ts` |

### E.2 Entity / Table Catalog

**Tables/schemas found:** 52

#### `audit_logs`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `action` | `column` |
| `addressLine` | `column` |
| `afterJson` | `column` |
| `approvalStatus` | `column` |
| `beforeJson` | `column` |
| `city` | `column` |
| `consultationFeeAudio` | `column` |
| `consultationFeeClinic` | `column` |
| `consultationFeeVideo` | `column` |
| `consumerId` | `column` |
| `createdAt` | `column` |
| `deliveryAddressJson` | `column` |
| `doctorId` | `column` |
| `email` | `column` |
| `entityId` | `column` |
| `entityType` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `ip` | `column` |
| `isActive` | `column` |
| `isDefault` | `column` |
| `label` | `column` |
| `lineTotal` | `column` |
| `mode` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `orderId` | `column` |
| `orderNumber` | `column` |
| `passwordHash` | `column` |
| `paymentMode` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `pinCode` | `column` |
| `prescriptionUrl` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `qty` | `column` |
| `registrationNo` | `column` |
| `role` | `column` |
| `specialization` | `column` |
| `stateCode` | `column` |
| `status` | `column` |
| `subtotal` | `column` |
| `taxTotal` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `unitPrice` | `column` |
| `userAgent` | `column` |
| `userId` | `column` |

#### `bill_items`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `allocatedAmount` | `column` |
| `amount` | `column` |
| `batchId` | `column` |
| `billId` | `column` |
| `cgst` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `freeQty` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `igst` | `column` |
| `lineSubtotal` | `column` |
| `lineTotal` | `column` |
| `method` | `column` |
| `notes` | `column` |
| `orderId` | `column` |
| `orderItemId` | `column` |
| `paymentDate` | `column` |
| `paymentId` | `column` |
| `paymentNumber` | `column` |
| `pharmacyId` | `column` |
| `productId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `reason` | `column` |
| `referenceNo` | `column` |
| `returnDate` | `column` |
| `returnId` | `column` |
| `returnNumber` | `column` |
| `sgst` | `column` |
| `status` | `column` |
| `supplierId` | `column` |
| `tenantId` | `column` |
| `totalAmount` | `column` |
| `unallocatedAmount` | `column` |

#### `bills`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `amount` | `column` |
| `batchId` | `column` |
| `billDate` | `column` |
| `billId` | `column` |
| `billNumber` | `column` |
| `cgst` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `delta` | `column` |
| `dueDate` | `column` |
| `freeQty` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `igst` | `column` |
| `isInterstate` | `column` |
| `lineSubtotal` | `column` |
| `lineTotal` | `column` |
| `method` | `column` |
| `notes` | `column` |
| `orderId` | `column` |
| `paidAmount` | `column` |
| `paymentDate` | `column` |
| `paymentNumber` | `column` |
| `performedBy` | `column` |
| `pharmacyId` | `column` |
| `placeOfSupply` | `column` |
| `productId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `reason` | `column` |
| `refId` | `column` |
| `refNumber` | `column` |
| `refType` | `column` |
| `referenceNo` | `column` |
| `sgst` | `column` |
| `status` | `column` |
| `subtotal` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `unallocatedAmount` | `column` |

#### `consultations`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `address` | `column` |
| `brand` | `column` |
| `consumerId` | `column` |
| `doctorId` | `column` |
| `email` | `column` |
| `fee` | `column` |
| `id` | `column` |
| `isActive` | `column` |
| `mode` | `column` |
| `mrId` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `parsedJson` | `column` |
| `passwordHash` | `column` |
| `pharmacyName` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `prescriptionJson` | `column` |
| `rawText` | `column` |
| `recommendationsJson` | `column` |
| `scheduledAt` | `column` |
| `status` | `column` |
| `territory` | `column` |
| `visitedAt` | `column` |

#### `consumer_accounts`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `address` | `column` |
| `addressLine` | `column` |
| `approvalStatus` | `column` |
| `brand` | `column` |
| `city` | `column` |
| `consultationFeeAudio` | `column` |
| `consultationFeeClinic` | `column` |
| `consultationFeeVideo` | `column` |
| `consumerId` | `column` |
| `deliveryAddressJson` | `column` |
| `doctorId` | `column` |
| `email` | `column` |
| `fee` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `isActive` | `column` |
| `isDefault` | `column` |
| `label` | `column` |
| `lineTotal` | `column` |
| `mode` | `column` |
| `mrId` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `orderId` | `column` |
| `orderNumber` | `column` |
| `passwordHash` | `column` |
| `paymentMode` | `column` |
| `pharmacyName` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `pinCode` | `column` |
| `prescriptionJson` | `column` |
| `prescriptionUrl` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `qty` | `column` |
| `registrationNo` | `column` |
| `scheduledAt` | `column` |
| `specialization` | `column` |
| `stateCode` | `column` |
| `status` | `column` |
| `subtotal` | `column` |
| `taxTotal` | `column` |
| `territory` | `column` |
| `total` | `column` |
| `unitPrice` | `column` |
| `visitedAt` | `column` |

#### `consumer_addresses`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `address` | `column` |
| `addressLine` | `column` |
| `approvalStatus` | `column` |
| `brand` | `column` |
| `city` | `column` |
| `consultationFeeAudio` | `column` |
| `consultationFeeClinic` | `column` |
| `consultationFeeVideo` | `column` |
| `consumerId` | `column` |
| `deliveryAddressJson` | `column` |
| `doctorId` | `column` |
| `email` | `column` |
| `fee` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `isActive` | `column` |
| `isDefault` | `column` |
| `label` | `column` |
| `lineTotal` | `column` |
| `mode` | `column` |
| `mrId` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `orderId` | `column` |
| `orderNumber` | `column` |
| `passwordHash` | `column` |
| `paymentMode` | `column` |
| `pharmacyName` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `pinCode` | `column` |
| `prescriptionJson` | `column` |
| `prescriptionUrl` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `qty` | `column` |
| `registrationNo` | `column` |
| `scheduledAt` | `column` |
| `specialization` | `column` |
| `stateCode` | `column` |
| `status` | `column` |
| `subtotal` | `column` |
| `taxTotal` | `column` |
| `territory` | `column` |
| `total` | `column` |
| `unitPrice` | `column` |
| `visitedAt` | `column` |

#### `cross_tenant_events`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `action` | `column` |
| `addressLine` | `column` |
| `afterJson` | `column` |
| `approvalStatus` | `column` |
| `beforeJson` | `column` |
| `city` | `column` |
| `consultationFeeAudio` | `column` |
| `consultationFeeClinic` | `column` |
| `consultationFeeVideo` | `column` |
| `consumerId` | `column` |
| `createdAt` | `column` |
| `deliveredAt` | `column` |
| `deliveryAddressJson` | `column` |
| `email` | `column` |
| `entityId` | `column` |
| `entityType` | `column` |
| `eventType` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `ip` | `column` |
| `isActive` | `column` |
| `isDefault` | `column` |
| `label` | `column` |
| `lineTotal` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `orderId` | `column` |
| `orderNumber` | `column` |
| `passwordHash` | `column` |
| `payloadJson` | `column` |
| `paymentMode` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `pinCode` | `column` |
| `prescriptionUrl` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `qty` | `column` |
| `registrationNo` | `column` |
| `role` | `column` |
| `sourceTenantId` | `column` |
| `specialization` | `column` |
| `stateCode` | `column` |
| `status` | `column` |
| `subtotal` | `column` |
| `targetTenantId` | `column` |
| `taxTotal` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `unitPrice` | `column` |
| `userAgent` | `column` |
| `userId` | `column` |

#### `customers`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `age` | `column` |
| `allergies` | `column` |
| `amountReceived` | `column` |
| `batchId` | `column` |
| `batchNumber` | `column` |
| `billDate` | `column` |
| `billId` | `column` |
| `billNumber` | `column` |
| `cashierId` | `column` |
| `cgst` | `column` |
| `changeAmount` | `column` |
| `customerId` | `column` |
| `discountAmount` | `column` |
| `discountPercent` | `column` |
| `doctorName` | `column` |
| `doctorRegNo` | `column` |
| `dueDate` | `column` |
| `email` | `column` |
| `expiryDate` | `column` |
| `externalBillId` | `column` |
| `externalOrderId` | `column` |
| `gender` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `igst` | `column` |
| `isInterstate` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `paidAmount` | `column` |
| `patientAge` | `column` |
| `patientName` | `column` |
| `paymentBreakdownJson` | `column` |
| `paymentMethod` | `column` |
| `phone` | `column` |
| `placeOfSupply` | `column` |
| `productId` | `column` |
| `purchaseOrderId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `rxNumber` | `column` |
| `saleDate` | `column` |
| `saleId` | `column` |
| `saleNumber` | `column` |
| `sgst` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `stockistName` | `column` |
| `subtotal` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `voidReason` | `column` |
| `voidedAt` | `column` |
| `voidedBy` | `column` |

#### `doctor_accounts`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `address` | `column` |
| `approvalStatus` | `column` |
| `brand` | `column` |
| `consultationFeeAudio` | `column` |
| `consultationFeeClinic` | `column` |
| `consultationFeeVideo` | `column` |
| `consumerId` | `column` |
| `doctorId` | `column` |
| `email` | `column` |
| `fee` | `column` |
| `id` | `column` |
| `isActive` | `column` |
| `mode` | `column` |
| `mrId` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `parsedJson` | `column` |
| `passwordHash` | `column` |
| `pharmacyName` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `prescriptionJson` | `column` |
| `rawText` | `column` |
| `recommendationsJson` | `column` |
| `registrationNo` | `column` |
| `scheduledAt` | `column` |
| `specialization` | `column` |
| `status` | `column` |
| `territory` | `column` |
| `visitedAt` | `column` |

#### `ledger_accounts`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `accountId` | `column` |
| `approvedAt` | `column` |
| `catalogItemId` | `column` |
| `code` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `credit` | `column` |
| `debit` | `column` |
| `entryId` | `column` |
| `externalOrderId` | `column` |
| `freeQty` | `column` |
| `grnNumber` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `name` | `column` |
| `narration` | `column` |
| `notes` | `column` |
| `orderDate` | `column` |
| `parentId` | `column` |
| `partnerId` | `column` |
| `partnerType` | `column` |
| `paymentMode` | `column` |
| `poNumber` | `column` |
| `productName` | `column` |
| `purchaseOrderId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `receivedDate` | `column` |
| `receivedQty` | `column` |
| `refId` | `column` |
| `refType` | `column` |
| `rejectionReason` | `column` |
| `shippedAt` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `stockistProductId` | `column` |
| `submittedAt` | `column` |
| `subtotal` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `trackingAwb` | `column` |
| `trackingCarrier` | `column` |
| `txnDate` | `column` |
| `type` | `column` |

#### `ledger_entries`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `accountId` | `column` |
| `approvedAt` | `column` |
| `catalogItemId` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `credit` | `column` |
| `debit` | `column` |
| `entryId` | `column` |
| `externalOrderId` | `column` |
| `freeQty` | `column` |
| `grnId` | `column` |
| `grnNumber` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `narration` | `column` |
| `notes` | `column` |
| `orderDate` | `column` |
| `partnerId` | `column` |
| `partnerType` | `column` |
| `paymentMode` | `column` |
| `poNumber` | `column` |
| `productName` | `column` |
| `purchaseOrderId` | `column` |
| `purchaseOrderItemId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `receivedDate` | `column` |
| `receivedQty` | `column` |
| `refId` | `column` |
| `refType` | `column` |
| `rejectionReason` | `column` |
| `shippedAt` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `stockistProductId` | `column` |
| `submittedAt` | `column` |
| `subtotal` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `trackingAwb` | `column` |
| `trackingCarrier` | `column` |
| `txnDate` | `column` |

#### `ledger_lines`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `accountId` | `column` |
| `approvedAt` | `column` |
| `batchId` | `column` |
| `batchNumber` | `column` |
| `catalogItemId` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `credit` | `column` |
| `debit` | `column` |
| `entryId` | `column` |
| `expiryDate` | `column` |
| `externalOrderId` | `column` |
| `freeQty` | `column` |
| `grnId` | `column` |
| `grnNumber` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `mrp` | `column` |
| `notes` | `column` |
| `orderDate` | `column` |
| `partnerId` | `column` |
| `partnerType` | `column` |
| `paymentMode` | `column` |
| `poNumber` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `purchaseOrderId` | `column` |
| `purchaseOrderItemId` | `column` |
| `purchaseRate` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `receivedDate` | `column` |
| `receivedQty` | `column` |
| `rejectionReason` | `column` |
| `saleRate` | `column` |
| `shippedAt` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `stockistProductId` | `column` |
| `submittedAt` | `column` |
| `subtotal` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `trackingAwb` | `column` |
| `trackingCarrier` | `column` |

#### `mr_accounts`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `address` | `column` |
| `brand` | `column` |
| `email` | `column` |
| `id` | `column` |
| `isActive` | `column` |
| `mrId` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `parsedJson` | `column` |
| `passwordHash` | `column` |
| `pharmacyName` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `rawText` | `column` |
| `recommendationsJson` | `column` |
| `territory` | `column` |
| `visitedAt` | `column` |

#### `mr_pharmacy_visits`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `address` | `column` |
| `id` | `column` |
| `mrId` | `column` |
| `notes` | `column` |
| `parsedJson` | `column` |
| `pharmacyName` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `rawText` | `column` |
| `recommendationsJson` | `column` |
| `visitedAt` | `column` |

#### `online_order_items`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `address` | `column` |
| `approvalStatus` | `column` |
| `brand` | `column` |
| `consultationFeeAudio` | `column` |
| `consultationFeeClinic` | `column` |
| `consultationFeeVideo` | `column` |
| `consumerId` | `column` |
| `doctorId` | `column` |
| `email` | `column` |
| `fee` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `isActive` | `column` |
| `lineTotal` | `column` |
| `mode` | `column` |
| `mrId` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `orderId` | `column` |
| `parsedJson` | `column` |
| `passwordHash` | `column` |
| `pharmacyName` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `prescriptionJson` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `qty` | `column` |
| `rawText` | `column` |
| `recommendationsJson` | `column` |
| `registrationNo` | `column` |
| `scheduledAt` | `column` |
| `specialization` | `column` |
| `status` | `column` |
| `territory` | `column` |
| `unitPrice` | `column` |
| `visitedAt` | `column` |

#### `online_orders`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `address` | `column` |
| `approvalStatus` | `column` |
| `brand` | `column` |
| `consultationFeeAudio` | `column` |
| `consultationFeeClinic` | `column` |
| `consultationFeeVideo` | `column` |
| `consumerId` | `column` |
| `deliveryAddressJson` | `column` |
| `doctorId` | `column` |
| `email` | `column` |
| `fee` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `isActive` | `column` |
| `lineTotal` | `column` |
| `mode` | `column` |
| `mrId` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `orderId` | `column` |
| `orderNumber` | `column` |
| `parsedJson` | `column` |
| `passwordHash` | `column` |
| `paymentMode` | `column` |
| `pharmacyName` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `prescriptionJson` | `column` |
| `prescriptionUrl` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `qty` | `column` |
| `rawText` | `column` |
| `recommendationsJson` | `column` |
| `registrationNo` | `column` |
| `scheduledAt` | `column` |
| `specialization` | `column` |
| `status` | `column` |
| `subtotal` | `column` |
| `taxTotal` | `column` |
| `territory` | `column` |
| `total` | `column` |
| `unitPrice` | `column` |
| `visitedAt` | `column` |

#### `order_items`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `batchId` | `column` |
| `billDate` | `column` |
| `billId` | `column` |
| `billNumber` | `column` |
| `cgst` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `delta` | `column` |
| `dueDate` | `column` |
| `freeQty` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `igst` | `column` |
| `isInterstate` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `notes` | `column` |
| `orderId` | `column` |
| `paidAmount` | `column` |
| `performedBy` | `column` |
| `pharmacyId` | `column` |
| `placeOfSupply` | `column` |
| `productId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `reason` | `column` |
| `refId` | `column` |
| `refNumber` | `column` |
| `refType` | `column` |
| `sgst` | `column` |
| `status` | `column` |
| `subtotal` | `column` |
| `tenantId` | `column` |
| `total` | `column` |

#### `orders`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `approvedAt` | `column` |
| `approvedBy` | `column` |
| `batchId` | `column` |
| `billDate` | `column` |
| `billNumber` | `column` |
| `cgst` | `column` |
| `createdBy` | `column` |
| `dueDate` | `column` |
| `externalPharmacyOrderId` | `column` |
| `freeQty` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `igst` | `column` |
| `isInterstate` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `notes` | `column` |
| `orderDate` | `column` |
| `orderId` | `column` |
| `orderNumber` | `column` |
| `paidAmount` | `column` |
| `paymentMode` | `column` |
| `pharmacyId` | `column` |
| `placeOfSupply` | `column` |
| `productId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `rejectionReason` | `column` |
| `sgst` | `column` |
| `shippedAt` | `column` |
| `source` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `submittedAt` | `column` |
| `subtotal` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `trackingAwb` | `column` |
| `trackingCarrier` | `column` |

#### `password_reset_tokens`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `address` | `column` |
| `baseUnit` | `column` |
| `batchNumber` | `column` |
| `category` | `column` |
| `contactPerson` | `column` |
| `convFactor` | `column` |
| `createdAt` | `column` |
| `creditLimit` | `column` |
| `dlNumber` | `column` |
| `email` | `column` |
| `expiresAt` | `column` |
| `expiryDate` | `column` |
| `genericName` | `column` |
| `gstRate` | `column` |
| `gstin` | `column` |
| `hsnCode` | `column` |
| `id` | `column` |
| `isActive` | `column` |
| `jti` | `column` |
| `manufacturer` | `column` |
| `minStockLevel` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `openingBalance` | `column` |
| `outstanding` | `column` |
| `packSize` | `column` |
| `paymentTermsDays` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `portalConnected` | `column` |
| `productId` | `column` |
| `purchaseRate` | `column` |
| `qtyOnHand` | `column` |
| `qtyReceived` | `column` |
| `receivedAt` | `column` |
| `saleRate` | `column` |
| `saleUnit` | `column` |
| `scheduleType` | `column` |
| `schemeBase` | `column` |
| `schemeBonus` | `column` |
| `sourcePurchaseId` | `column` |
| `stateCode` | `column` |
| `status` | `column` |
| `supplierId` | `column` |
| `tenantId` | `column` |
| `usedAt` | `column` |
| `userId` | `column` |

#### `payable_bill_items`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `allocatedAmount` | `column` |
| `amount` | `column` |
| `batchId` | `column` |
| `batchNumber` | `column` |
| `billId` | `column` |
| `cgst` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `expiryDate` | `column` |
| `externalProductId` | `column` |
| `externalReturnId` | `column` |
| `freeQty` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `igst` | `column` |
| `lineSubtotal` | `column` |
| `lineTotal` | `column` |
| `linkedPharmacyId` | `column` |
| `method` | `column` |
| `notes` | `column` |
| `payableBillId` | `column` |
| `paymentDate` | `column` |
| `paymentId` | `column` |
| `paymentNumber` | `column` |
| `pharmacyTenantId` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `purchaseOrderId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `reason` | `column` |
| `referenceNo` | `column` |
| `rejectionReason` | `column` |
| `requestSource` | `column` |
| `returnDate` | `column` |
| `returnId` | `column` |
| `returnNumber` | `column` |
| `sgst` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `stockistTenantId` | `column` |
| `tenantId` | `column` |
| `totalAmount` | `column` |
| `unallocatedAmount` | `column` |

#### `payable_bills`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `allocatedAmount` | `column` |
| `amount` | `column` |
| `batchNumber` | `column` |
| `billDate` | `column` |
| `billId` | `column` |
| `billNumber` | `column` |
| `cgst` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `dueDate` | `column` |
| `expiryDate` | `column` |
| `externalBillId` | `column` |
| `externalOrderId` | `column` |
| `externalProductId` | `column` |
| `externalReturnId` | `column` |
| `freeQty` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `igst` | `column` |
| `isInterstate` | `column` |
| `lineSubtotal` | `column` |
| `lineTotal` | `column` |
| `method` | `column` |
| `notes` | `column` |
| `paidAmount` | `column` |
| `payableBillId` | `column` |
| `paymentDate` | `column` |
| `paymentId` | `column` |
| `paymentNumber` | `column` |
| `placeOfSupply` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `purchaseOrderId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `reason` | `column` |
| `referenceNo` | `column` |
| `returnDate` | `column` |
| `returnNumber` | `column` |
| `sgst` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `stockistName` | `column` |
| `subtotal` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `totalAmount` | `column` |
| `unallocatedAmount` | `column` |

#### `payable_payment_allocations`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `allocatedAmount` | `column` |
| `availabilityHint` | `column` |
| `batchId` | `column` |
| `billId` | `column` |
| `category` | `column` |
| `connectedAt` | `column` |
| `connectionId` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `creditLimit` | `column` |
| `disconnectedAt` | `column` |
| `expectedMonthlyVolume` | `column` |
| `externalReturnId` | `column` |
| `genericName` | `column` |
| `gstRate` | `column` |
| `hsnCode` | `column` |
| `id` | `column` |
| `isPublic` | `column` |
| `lineTotal` | `column` |
| `linkedPharmacyId` | `column` |
| `manufacturer` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `packSize` | `column` |
| `payableBillId` | `column` |
| `paymentId` | `column` |
| `paymentTermsDays` | `column` |
| `pharmacyTenantId` | `column` |
| `productId` | `column` |
| `purchaseOrderId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `reason` | `column` |
| `rejectionReason` | `column` |
| `requestNote` | `column` |
| `requestSource` | `column` |
| `returnDate` | `column` |
| `returnId` | `column` |
| `returnNumber` | `column` |
| `saleRate` | `column` |
| `scheduleType` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `stockistTenantId` | `column` |
| `syncedAt` | `column` |
| `tenantId` | `column` |
| `totalAmount` | `column` |

#### `payable_payments`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `allocatedAmount` | `column` |
| `amount` | `column` |
| `batchId` | `column` |
| `billId` | `column` |
| `category` | `column` |
| `connectedAt` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `creditLimit` | `column` |
| `disconnectedAt` | `column` |
| `expectedMonthlyVolume` | `column` |
| `externalReturnId` | `column` |
| `genericName` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `lineTotal` | `column` |
| `linkedPharmacyId` | `column` |
| `manufacturer` | `column` |
| `method` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `payableBillId` | `column` |
| `paymentDate` | `column` |
| `paymentId` | `column` |
| `paymentNumber` | `column` |
| `paymentTermsDays` | `column` |
| `pharmacyTenantId` | `column` |
| `productId` | `column` |
| `purchaseOrderId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `reason` | `column` |
| `referenceNo` | `column` |
| `rejectionReason` | `column` |
| `requestNote` | `column` |
| `requestSource` | `column` |
| `returnDate` | `column` |
| `returnId` | `column` |
| `returnNumber` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `stockistTenantId` | `column` |
| `tenantId` | `column` |
| `totalAmount` | `column` |
| `unallocatedAmount` | `column` |

#### `payment_allocations`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `accountId` | `column` |
| `allocatedAmount` | `column` |
| `amount` | `column` |
| `batchId` | `column` |
| `billId` | `column` |
| `code` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `credit` | `column` |
| `debit` | `column` |
| `entryId` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `lineTotal` | `column` |
| `method` | `column` |
| `name` | `column` |
| `narration` | `column` |
| `notes` | `column` |
| `orderId` | `column` |
| `orderItemId` | `column` |
| `parentId` | `column` |
| `partnerId` | `column` |
| `partnerType` | `column` |
| `paymentDate` | `column` |
| `paymentId` | `column` |
| `paymentNumber` | `column` |
| `pharmacyId` | `column` |
| `productId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `reason` | `column` |
| `refId` | `column` |
| `refType` | `column` |
| `referenceNo` | `column` |
| `returnDate` | `column` |
| `returnId` | `column` |
| `returnNumber` | `column` |
| `status` | `column` |
| `supplierId` | `column` |
| `tenantId` | `column` |
| `totalAmount` | `column` |
| `txnDate` | `column` |
| `type` | `column` |

#### `payments`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `allocatedAmount` | `column` |
| `amount` | `column` |
| `batchId` | `column` |
| `billId` | `column` |
| `code` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `lineTotal` | `column` |
| `method` | `column` |
| `name` | `column` |
| `narration` | `column` |
| `notes` | `column` |
| `orderId` | `column` |
| `orderItemId` | `column` |
| `parentId` | `column` |
| `paymentDate` | `column` |
| `paymentId` | `column` |
| `paymentNumber` | `column` |
| `pharmacyId` | `column` |
| `productId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `reason` | `column` |
| `refId` | `column` |
| `refType` | `column` |
| `referenceNo` | `column` |
| `returnDate` | `column` |
| `returnId` | `column` |
| `returnNumber` | `column` |
| `status` | `column` |
| `supplierId` | `column` |
| `tenantId` | `column` |
| `totalAmount` | `column` |
| `txnDate` | `column` |
| `type` | `column` |
| `unallocatedAmount` | `column` |

#### `pharmacies`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `address` | `column` |
| `baseUnit` | `column` |
| `batchNumber` | `column` |
| `category` | `column` |
| `contactPerson` | `column` |
| `convFactor` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `creditLimit` | `column` |
| `dlNumber` | `column` |
| `email` | `column` |
| `expiryDate` | `column` |
| `genericName` | `column` |
| `grnNumber` | `column` |
| `gstRate` | `column` |
| `gstin` | `column` |
| `hsnCode` | `column` |
| `id` | `column` |
| `invoiceDate` | `column` |
| `invoiceFileUrl` | `column` |
| `isActive` | `column` |
| `manufacturer` | `column` |
| `minStockLevel` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `openingBalance` | `column` |
| `outstanding` | `column` |
| `packSize` | `column` |
| `paymentTermsDays` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `portalConnected` | `column` |
| `productId` | `column` |
| `purchaseRate` | `column` |
| `qtyOnHand` | `column` |
| `qtyReceived` | `column` |
| `receivedAt` | `column` |
| `receivedDate` | `column` |
| `saleRate` | `column` |
| `saleUnit` | `column` |
| `scheduleType` | `column` |
| `schemeBase` | `column` |
| `schemeBonus` | `column` |
| `sourcePurchaseId` | `column` |
| `stateCode` | `column` |
| `status` | `column` |
| `subtotal` | `column` |
| `supplierId` | `column` |
| `supplierInvoiceNo` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |

#### `pharmacy_grn_items`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `age` | `column` |
| `allergies` | `column` |
| `amountReceived` | `column` |
| `batchId` | `column` |
| `batchNumber` | `column` |
| `billDate` | `column` |
| `billNumber` | `column` |
| `cashierId` | `column` |
| `changeAmount` | `column` |
| `createdAt` | `column` |
| `customerId` | `column` |
| `discountAmount` | `column` |
| `discountPercent` | `column` |
| `doctorName` | `column` |
| `doctorRegNo` | `column` |
| `dueDate` | `column` |
| `email` | `column` |
| `expiryDate` | `column` |
| `externalBillId` | `column` |
| `externalOrderId` | `column` |
| `freeQty` | `column` |
| `gender` | `column` |
| `grnId` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `isInterstate` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `patientAge` | `column` |
| `patientName` | `column` |
| `paymentBreakdownJson` | `column` |
| `paymentMethod` | `column` |
| `phone` | `column` |
| `placeOfSupply` | `column` |
| `productId` | `column` |
| `purchaseOrderId` | `column` |
| `purchaseOrderItemId` | `column` |
| `purchaseRate` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `rxNumber` | `column` |
| `saleDate` | `column` |
| `saleId` | `column` |
| `saleNumber` | `column` |
| `saleRate` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `stockistName` | `column` |
| `subtotal` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `voidReason` | `column` |
| `voidedAt` | `column` |
| `voidedBy` | `column` |

#### `pharmacy_grns`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `age` | `column` |
| `allergies` | `column` |
| `amountReceived` | `column` |
| `batchId` | `column` |
| `batchNumber` | `column` |
| `cashierId` | `column` |
| `changeAmount` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `customerId` | `column` |
| `discountAmount` | `column` |
| `discountPercent` | `column` |
| `doctorName` | `column` |
| `doctorRegNo` | `column` |
| `email` | `column` |
| `expiryDate` | `column` |
| `freeQty` | `column` |
| `gender` | `column` |
| `grnId` | `column` |
| `grnNumber` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `patientAge` | `column` |
| `patientName` | `column` |
| `paymentBreakdownJson` | `column` |
| `paymentMethod` | `column` |
| `phone` | `column` |
| `productId` | `column` |
| `purchaseOrderId` | `column` |
| `purchaseOrderItemId` | `column` |
| `purchaseRate` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `receivedDate` | `column` |
| `rxNumber` | `column` |
| `saleDate` | `column` |
| `saleId` | `column` |
| `saleNumber` | `column` |
| `saleRate` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `subtotal` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `voidReason` | `column` |
| `voidedAt` | `column` |
| `voidedBy` | `column` |

#### `pharmacy_purchase_order_items`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `age` | `column` |
| `allergies` | `column` |
| `amountReceived` | `column` |
| `batchId` | `column` |
| `batchNumber` | `column` |
| `cashierId` | `column` |
| `catalogItemId` | `column` |
| `changeAmount` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `customerId` | `column` |
| `discountAmount` | `column` |
| `doctorName` | `column` |
| `doctorRegNo` | `column` |
| `email` | `column` |
| `expiryDate` | `column` |
| `freeQty` | `column` |
| `gender` | `column` |
| `grnId` | `column` |
| `grnNumber` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `patientAge` | `column` |
| `patientName` | `column` |
| `paymentBreakdownJson` | `column` |
| `paymentMethod` | `column` |
| `phone` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `purchaseOrderId` | `column` |
| `purchaseOrderItemId` | `column` |
| `purchaseRate` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `receivedDate` | `column` |
| `receivedQty` | `column` |
| `rxNumber` | `column` |
| `saleDate` | `column` |
| `saleNumber` | `column` |
| `saleRate` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `stockistProductId` | `column` |
| `subtotal` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `voidReason` | `column` |
| `voidedAt` | `column` |
| `voidedBy` | `column` |

#### `pharmacy_purchase_orders`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `age` | `column` |
| `allergies` | `column` |
| `approvedAt` | `column` |
| `batchId` | `column` |
| `batchNumber` | `column` |
| `catalogItemId` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `email` | `column` |
| `expiryDate` | `column` |
| `externalOrderId` | `column` |
| `freeQty` | `column` |
| `gender` | `column` |
| `grnId` | `column` |
| `grnNumber` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `orderDate` | `column` |
| `paymentMode` | `column` |
| `phone` | `column` |
| `poNumber` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `purchaseOrderId` | `column` |
| `purchaseOrderItemId` | `column` |
| `purchaseRate` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `receivedDate` | `column` |
| `receivedQty` | `column` |
| `rejectionReason` | `column` |
| `saleDate` | `column` |
| `saleNumber` | `column` |
| `saleRate` | `column` |
| `shippedAt` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `stockistProductId` | `column` |
| `submittedAt` | `column` |
| `subtotal` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `trackingAwb` | `column` |
| `trackingCarrier` | `column` |

#### `platform_users`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `addressLine` | `column` |
| `approvalStatus` | `column` |
| `brand` | `column` |
| `city` | `column` |
| `consultationFeeAudio` | `column` |
| `consultationFeeClinic` | `column` |
| `consultationFeeVideo` | `column` |
| `consumerId` | `column` |
| `deliveryAddressJson` | `column` |
| `doctorId` | `column` |
| `email` | `column` |
| `fee` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `isActive` | `column` |
| `isDefault` | `column` |
| `label` | `column` |
| `lineTotal` | `column` |
| `mode` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `orderId` | `column` |
| `orderNumber` | `column` |
| `passwordHash` | `column` |
| `paymentMode` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `pinCode` | `column` |
| `prescriptionJson` | `column` |
| `prescriptionUrl` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `qty` | `column` |
| `registrationNo` | `column` |
| `role` | `column` |
| `scheduledAt` | `column` |
| `specialization` | `column` |
| `stateCode` | `column` |
| `status` | `column` |
| `subtotal` | `column` |
| `taxTotal` | `column` |
| `territory` | `column` |
| `total` | `column` |
| `unitPrice` | `column` |

#### `processed_cross_tenant_events`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `action` | `column` |
| `addressLine` | `column` |
| `afterJson` | `column` |
| `beforeJson` | `column` |
| `city` | `column` |
| `consultationFeeAudio` | `column` |
| `consumerId` | `column` |
| `createdAt` | `column` |
| `deliveredAt` | `column` |
| `deliveryAddressJson` | `column` |
| `email` | `column` |
| `entityId` | `column` |
| `entityType` | `column` |
| `eventId` | `column` |
| `eventType` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `ip` | `column` |
| `isActive` | `column` |
| `isDefault` | `column` |
| `label` | `column` |
| `lineTotal` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `orderId` | `column` |
| `orderNumber` | `column` |
| `passwordHash` | `column` |
| `payloadJson` | `column` |
| `paymentMode` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `pinCode` | `column` |
| `prescriptionUrl` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `qty` | `column` |
| `registrationNo` | `column` |
| `role` | `column` |
| `sourceTenantId` | `column` |
| `specialization` | `column` |
| `stateCode` | `column` |
| `status` | `column` |
| `subtotal` | `column` |
| `targetTenantId` | `column` |
| `taxTotal` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `unitPrice` | `column` |
| `userAgent` | `column` |
| `userId` | `column` |

#### `product_batches`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `approvedAt` | `column` |
| `approvedBy` | `column` |
| `batchNumber` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `expiryDate` | `column` |
| `externalPharmacyOrderId` | `column` |
| `freeQty` | `column` |
| `grnNumber` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `invoiceDate` | `column` |
| `invoiceFileUrl` | `column` |
| `isInterstate` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `mrp` | `column` |
| `notes` | `column` |
| `orderDate` | `column` |
| `orderNumber` | `column` |
| `paymentMode` | `column` |
| `pharmacyId` | `column` |
| `placeOfSupply` | `column` |
| `productId` | `column` |
| `purchaseId` | `column` |
| `purchaseRate` | `column` |
| `qty` | `column` |
| `qtyOnHand` | `column` |
| `qtyReceived` | `column` |
| `receivedAt` | `column` |
| `receivedDate` | `column` |
| `rejectionReason` | `column` |
| `saleRate` | `column` |
| `shippedAt` | `column` |
| `source` | `column` |
| `sourcePurchaseId` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `submittedAt` | `column` |
| `subtotal` | `column` |
| `supplierId` | `column` |
| `supplierInvoiceNo` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `trackingAwb` | `column` |
| `trackingCarrier` | `column` |

#### `products`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `baseUnit` | `column` |
| `batchNumber` | `column` |
| `category` | `column` |
| `convFactor` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `expiryDate` | `column` |
| `freeQty` | `column` |
| `genericName` | `column` |
| `grnNumber` | `column` |
| `gstRate` | `column` |
| `hsnCode` | `column` |
| `id` | `column` |
| `invoiceDate` | `column` |
| `invoiceFileUrl` | `column` |
| `isActive` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `manufacturer` | `column` |
| `minStockLevel` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `orderDate` | `column` |
| `orderNumber` | `column` |
| `packSize` | `column` |
| `pharmacyId` | `column` |
| `productId` | `column` |
| `purchaseId` | `column` |
| `purchaseRate` | `column` |
| `qty` | `column` |
| `qtyOnHand` | `column` |
| `qtyReceived` | `column` |
| `receivedAt` | `column` |
| `receivedDate` | `column` |
| `saleRate` | `column` |
| `saleUnit` | `column` |
| `scheduleType` | `column` |
| `schemeBase` | `column` |
| `schemeBonus` | `column` |
| `sourcePurchaseId` | `column` |
| `status` | `column` |
| `subtotal` | `column` |
| `supplierId` | `column` |
| `supplierInvoiceNo` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |

#### `purchase_items`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `approvedAt` | `column` |
| `approvedBy` | `column` |
| `batchId` | `column` |
| `batchNumber` | `column` |
| `billDate` | `column` |
| `billNumber` | `column` |
| `cgst` | `column` |
| `createdBy` | `column` |
| `dueDate` | `column` |
| `expiryDate` | `column` |
| `externalPharmacyOrderId` | `column` |
| `freeQty` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `igst` | `column` |
| `isInterstate` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `mrp` | `column` |
| `notes` | `column` |
| `orderDate` | `column` |
| `orderId` | `column` |
| `orderNumber` | `column` |
| `paidAmount` | `column` |
| `paymentMode` | `column` |
| `pharmacyId` | `column` |
| `placeOfSupply` | `column` |
| `productId` | `column` |
| `purchaseId` | `column` |
| `purchaseRate` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `rejectionReason` | `column` |
| `sgst` | `column` |
| `shippedAt` | `column` |
| `source` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `submittedAt` | `column` |
| `subtotal` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `trackingAwb` | `column` |
| `trackingCarrier` | `column` |

#### `purchases`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `approvedAt` | `column` |
| `approvedBy` | `column` |
| `batchId` | `column` |
| `batchNumber` | `column` |
| `createdBy` | `column` |
| `expiryDate` | `column` |
| `externalPharmacyOrderId` | `column` |
| `freeQty` | `column` |
| `grnNumber` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `invoiceDate` | `column` |
| `invoiceFileUrl` | `column` |
| `isInterstate` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `mrp` | `column` |
| `notes` | `column` |
| `orderDate` | `column` |
| `orderId` | `column` |
| `orderNumber` | `column` |
| `paymentMode` | `column` |
| `pharmacyId` | `column` |
| `placeOfSupply` | `column` |
| `productId` | `column` |
| `purchaseId` | `column` |
| `purchaseRate` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `receivedDate` | `column` |
| `rejectionReason` | `column` |
| `shippedAt` | `column` |
| `source` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `submittedAt` | `column` |
| `subtotal` | `column` |
| `supplierId` | `column` |
| `supplierInvoiceNo` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `trackingAwb` | `column` |
| `trackingCarrier` | `column` |

#### `refresh_tokens`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `address` | `column` |
| `baseUnit` | `column` |
| `batchNumber` | `column` |
| `category` | `column` |
| `contactPerson` | `column` |
| `convFactor` | `column` |
| `creditLimit` | `column` |
| `dlNumber` | `column` |
| `email` | `column` |
| `expiresAt` | `column` |
| `expiryDate` | `column` |
| `genericName` | `column` |
| `gstRate` | `column` |
| `gstin` | `column` |
| `hsnCode` | `column` |
| `id` | `column` |
| `isActive` | `column` |
| `jti` | `column` |
| `manufacturer` | `column` |
| `minStockLevel` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `openingBalance` | `column` |
| `outstanding` | `column` |
| `packSize` | `column` |
| `paymentTermsDays` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `portalConnected` | `column` |
| `productId` | `column` |
| `purchaseRate` | `column` |
| `qtyOnHand` | `column` |
| `qtyReceived` | `column` |
| `revokedAt` | `column` |
| `saleRate` | `column` |
| `saleUnit` | `column` |
| `scheduleType` | `column` |
| `schemeBase` | `column` |
| `schemeBonus` | `column` |
| `sourcePurchaseId` | `column` |
| `stateCode` | `column` |
| `status` | `column` |
| `supplierId` | `column` |
| `tenantId` | `column` |
| `tokenHash` | `column` |
| `usedAt` | `column` |
| `userId` | `column` |

#### `retail_sale_items`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `allocatedAmount` | `column` |
| `amount` | `column` |
| `batchId` | `column` |
| `batchNumber` | `column` |
| `billDate` | `column` |
| `billId` | `column` |
| `billNumber` | `column` |
| `cgst` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `discountPercent` | `column` |
| `dueDate` | `column` |
| `expiryDate` | `column` |
| `externalBillId` | `column` |
| `externalOrderId` | `column` |
| `externalProductId` | `column` |
| `freeQty` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `igst` | `column` |
| `isInterstate` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `method` | `column` |
| `notes` | `column` |
| `paidAmount` | `column` |
| `paymentDate` | `column` |
| `paymentId` | `column` |
| `paymentNumber` | `column` |
| `placeOfSupply` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `purchaseOrderId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `referenceNo` | `column` |
| `saleId` | `column` |
| `sgst` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `stockistName` | `column` |
| `subtotal` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `unallocatedAmount` | `column` |

#### `retail_sales`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `amountReceived` | `column` |
| `batchId` | `column` |
| `batchNumber` | `column` |
| `billDate` | `column` |
| `billId` | `column` |
| `billNumber` | `column` |
| `cashierId` | `column` |
| `cgst` | `column` |
| `changeAmount` | `column` |
| `customerId` | `column` |
| `discountAmount` | `column` |
| `discountPercent` | `column` |
| `doctorName` | `column` |
| `doctorRegNo` | `column` |
| `dueDate` | `column` |
| `expiryDate` | `column` |
| `externalBillId` | `column` |
| `externalOrderId` | `column` |
| `externalProductId` | `column` |
| `freeQty` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `igst` | `column` |
| `isInterstate` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `notes` | `column` |
| `paidAmount` | `column` |
| `patientAge` | `column` |
| `patientName` | `column` |
| `paymentBreakdownJson` | `column` |
| `paymentMethod` | `column` |
| `placeOfSupply` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `purchaseOrderId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `rxNumber` | `column` |
| `saleDate` | `column` |
| `saleId` | `column` |
| `saleNumber` | `column` |
| `sgst` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `stockistName` | `column` |
| `subtotal` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `voidReason` | `column` |
| `voidedAt` | `column` |
| `voidedBy` | `column` |

#### `return_items`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `accountId` | `column` |
| `approvedAt` | `column` |
| `batchId` | `column` |
| `catalogItemId` | `column` |
| `code` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `credit` | `column` |
| `debit` | `column` |
| `entryId` | `column` |
| `externalOrderId` | `column` |
| `freeQty` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `lineSubtotal` | `column` |
| `lineTotal` | `column` |
| `name` | `column` |
| `narration` | `column` |
| `notes` | `column` |
| `orderDate` | `column` |
| `orderItemId` | `column` |
| `parentId` | `column` |
| `partnerId` | `column` |
| `partnerType` | `column` |
| `paymentMode` | `column` |
| `poNumber` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `purchaseOrderId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `receivedQty` | `column` |
| `refId` | `column` |
| `refType` | `column` |
| `rejectionReason` | `column` |
| `returnId` | `column` |
| `shippedAt` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `stockistProductId` | `column` |
| `submittedAt` | `column` |
| `subtotal` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `trackingAwb` | `column` |
| `trackingCarrier` | `column` |
| `txnDate` | `column` |
| `type` | `column` |

#### `returns`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `accountId` | `column` |
| `approvedAt` | `column` |
| `batchId` | `column` |
| `code` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `credit` | `column` |
| `debit` | `column` |
| `entryId` | `column` |
| `externalOrderId` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `lineTotal` | `column` |
| `name` | `column` |
| `narration` | `column` |
| `notes` | `column` |
| `orderDate` | `column` |
| `orderId` | `column` |
| `orderItemId` | `column` |
| `parentId` | `column` |
| `partnerId` | `column` |
| `partnerType` | `column` |
| `paymentMode` | `column` |
| `pharmacyId` | `column` |
| `poNumber` | `column` |
| `productId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `reason` | `column` |
| `refId` | `column` |
| `refType` | `column` |
| `rejectionReason` | `column` |
| `returnDate` | `column` |
| `returnId` | `column` |
| `returnNumber` | `column` |
| `shippedAt` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `submittedAt` | `column` |
| `subtotal` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `totalAmount` | `column` |
| `trackingAwb` | `column` |
| `trackingCarrier` | `column` |
| `txnDate` | `column` |
| `type` | `column` |

#### `smart_order_sessions`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `id` | `column` |
| `parsedJson` | `column` |
| `pharmacyTenantId` | `column` |
| `rawText` | `column` |
| `recommendationsJson` | `column` |

#### `stock_movements`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `allocatedAmount` | `column` |
| `amount` | `column` |
| `batchId` | `column` |
| `billId` | `column` |
| `cgst` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `delta` | `column` |
| `freeQty` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `igst` | `column` |
| `lineSubtotal` | `column` |
| `lineTotal` | `column` |
| `method` | `column` |
| `notes` | `column` |
| `orderId` | `column` |
| `paymentDate` | `column` |
| `paymentId` | `column` |
| `paymentNumber` | `column` |
| `performedBy` | `column` |
| `pharmacyId` | `column` |
| `productId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `reason` | `column` |
| `refId` | `column` |
| `refNumber` | `column` |
| `refType` | `column` |
| `referenceNo` | `column` |
| `returnDate` | `column` |
| `returnNumber` | `column` |
| `sgst` | `column` |
| `status` | `column` |
| `supplierId` | `column` |
| `tenantId` | `column` |
| `totalAmount` | `column` |
| `unallocatedAmount` | `column` |

#### `stockist_catalog_items`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `action` | `column` |
| `addressLine` | `column` |
| `afterJson` | `column` |
| `availabilityHint` | `column` |
| `beforeJson` | `column` |
| `category` | `column` |
| `city` | `column` |
| `connectionId` | `column` |
| `consumerId` | `column` |
| `createdAt` | `column` |
| `deliveredAt` | `column` |
| `email` | `column` |
| `entityId` | `column` |
| `entityType` | `column` |
| `eventId` | `column` |
| `eventType` | `column` |
| `genericName` | `column` |
| `gstRate` | `column` |
| `hsnCode` | `column` |
| `id` | `column` |
| `ip` | `column` |
| `isActive` | `column` |
| `isDefault` | `column` |
| `label` | `column` |
| `localProductId` | `column` |
| `manufacturer` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `orderNumber` | `column` |
| `packSize` | `column` |
| `passwordHash` | `column` |
| `payloadJson` | `column` |
| `paymentMode` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `pinCode` | `column` |
| `role` | `column` |
| `saleRate` | `column` |
| `scheduleType` | `column` |
| `schemeBase` | `column` |
| `schemeBonus` | `column` |
| `sourceTenantId` | `column` |
| `stateCode` | `column` |
| `status` | `column` |
| `stockistProductId` | `column` |
| `subtotal` | `column` |
| `syncedAt` | `column` |
| `targetTenantId` | `column` |
| `taxTotal` | `column` |
| `tenantId` | `column` |
| `userAgent` | `column` |
| `userId` | `column` |

#### `stockist_connections`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `action` | `column` |
| `availabilityHint` | `column` |
| `category` | `column` |
| `connectedAt` | `column` |
| `connectionId` | `column` |
| `createdAt` | `column` |
| `creditLimit` | `column` |
| `deliveredAt` | `column` |
| `disconnectedAt` | `column` |
| `eventId` | `column` |
| `eventType` | `column` |
| `expectedMonthlyVolume` | `column` |
| `genericName` | `column` |
| `gstRate` | `column` |
| `hsnCode` | `column` |
| `id` | `column` |
| `isPublic` | `column` |
| `linkedPharmacyId` | `column` |
| `localProductId` | `column` |
| `manufacturer` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `packSize` | `column` |
| `payloadJson` | `column` |
| `paymentTermsDays` | `column` |
| `pharmacyTenantId` | `column` |
| `productId` | `column` |
| `rejectionReason` | `column` |
| `requestNote` | `column` |
| `requestSource` | `column` |
| `saleRate` | `column` |
| `scheduleType` | `column` |
| `schemeBase` | `column` |
| `schemeBonus` | `column` |
| `sourceTenantId` | `column` |
| `status` | `column` |
| `stockistProductId` | `column` |
| `stockistTenantId` | `column` |
| `syncedAt` | `column` |
| `targetTenantId` | `column` |
| `tenantId` | `column` |
| `userId` | `column` |

#### `stockist_public_catalog_items`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `action` | `column` |
| `afterJson` | `column` |
| `availabilityHint` | `column` |
| `beforeJson` | `column` |
| `category` | `column` |
| `connectionId` | `column` |
| `createdAt` | `column` |
| `deliveredAt` | `column` |
| `email` | `column` |
| `entityId` | `column` |
| `entityType` | `column` |
| `eventId` | `column` |
| `eventType` | `column` |
| `genericName` | `column` |
| `gstRate` | `column` |
| `hsnCode` | `column` |
| `id` | `column` |
| `ip` | `column` |
| `isActive` | `column` |
| `isPublic` | `column` |
| `localProductId` | `column` |
| `manufacturer` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `packSize` | `column` |
| `passwordHash` | `column` |
| `payloadJson` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `productId` | `column` |
| `role` | `column` |
| `saleRate` | `column` |
| `scheduleType` | `column` |
| `schemeBase` | `column` |
| `schemeBonus` | `column` |
| `sourceTenantId` | `column` |
| `stockistProductId` | `column` |
| `stockistTenantId` | `column` |
| `syncedAt` | `column` |
| `targetTenantId` | `column` |
| `tenantId` | `column` |
| `userAgent` | `column` |
| `userId` | `column` |

#### `stockist_return_items`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `availabilityHint` | `column` |
| `batchId` | `column` |
| `category` | `column` |
| `connectedAt` | `column` |
| `connectionId` | `column` |
| `creditLimit` | `column` |
| `disconnectedAt` | `column` |
| `eventId` | `column` |
| `expectedMonthlyVolume` | `column` |
| `genericName` | `column` |
| `gstRate` | `column` |
| `hsnCode` | `column` |
| `id` | `column` |
| `isPublic` | `column` |
| `lineTotal` | `column` |
| `linkedPharmacyId` | `column` |
| `localProductId` | `column` |
| `manufacturer` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `packSize` | `column` |
| `paymentTermsDays` | `column` |
| `pharmacyTenantId` | `column` |
| `productId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `rejectionReason` | `column` |
| `requestNote` | `column` |
| `requestSource` | `column` |
| `returnId` | `column` |
| `saleRate` | `column` |
| `scheduleType` | `column` |
| `schemeBase` | `column` |
| `schemeBonus` | `column` |
| `status` | `column` |
| `stockistProductId` | `column` |
| `stockistTenantId` | `column` |
| `syncedAt` | `column` |
| `tenantId` | `column` |

#### `stockist_returns`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `availabilityHint` | `column` |
| `batchId` | `column` |
| `category` | `column` |
| `connectedAt` | `column` |
| `connectionId` | `column` |
| `createdBy` | `column` |
| `creditLimit` | `column` |
| `disconnectedAt` | `column` |
| `expectedMonthlyVolume` | `column` |
| `externalReturnId` | `column` |
| `genericName` | `column` |
| `gstRate` | `column` |
| `hsnCode` | `column` |
| `id` | `column` |
| `isPublic` | `column` |
| `lineTotal` | `column` |
| `linkedPharmacyId` | `column` |
| `manufacturer` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `packSize` | `column` |
| `payableBillId` | `column` |
| `paymentTermsDays` | `column` |
| `pharmacyTenantId` | `column` |
| `productId` | `column` |
| `purchaseOrderId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `reason` | `column` |
| `rejectionReason` | `column` |
| `requestNote` | `column` |
| `requestSource` | `column` |
| `returnDate` | `column` |
| `returnId` | `column` |
| `returnNumber` | `column` |
| `saleRate` | `column` |
| `scheduleType` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `stockistProductId` | `column` |
| `stockistTenantId` | `column` |
| `syncedAt` | `column` |
| `tenantId` | `column` |
| `totalAmount` | `column` |

#### `supplier_payments`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `accountId` | `column` |
| `amount` | `column` |
| `batchId` | `column` |
| `code` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `credit` | `column` |
| `debit` | `column` |
| `entryId` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `lineTotal` | `column` |
| `method` | `column` |
| `name` | `column` |
| `narration` | `column` |
| `notes` | `column` |
| `orderDate` | `column` |
| `orderId` | `column` |
| `orderItemId` | `column` |
| `parentId` | `column` |
| `partnerId` | `column` |
| `partnerType` | `column` |
| `paymentDate` | `column` |
| `paymentNumber` | `column` |
| `pharmacyId` | `column` |
| `poNumber` | `column` |
| `productId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `reason` | `column` |
| `refId` | `column` |
| `refType` | `column` |
| `referenceNo` | `column` |
| `returnDate` | `column` |
| `returnId` | `column` |
| `returnNumber` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `supplierId` | `column` |
| `tenantId` | `column` |
| `totalAmount` | `column` |
| `txnDate` | `column` |
| `type` | `column` |

#### `suppliers`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `address` | `column` |
| `baseUnit` | `column` |
| `batchNumber` | `column` |
| `category` | `column` |
| `contactPerson` | `column` |
| `convFactor` | `column` |
| `createdAt` | `column` |
| `creditLimit` | `column` |
| `dlNumber` | `column` |
| `email` | `column` |
| `expiryDate` | `column` |
| `genericName` | `column` |
| `grnNumber` | `column` |
| `gstRate` | `column` |
| `gstin` | `column` |
| `hsnCode` | `column` |
| `id` | `column` |
| `invoiceDate` | `column` |
| `isActive` | `column` |
| `manufacturer` | `column` |
| `minStockLevel` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `openingBalance` | `column` |
| `outstanding` | `column` |
| `packSize` | `column` |
| `paymentTermsDays` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `portalConnected` | `column` |
| `productId` | `column` |
| `purchaseRate` | `column` |
| `qtyOnHand` | `column` |
| `qtyReceived` | `column` |
| `receivedAt` | `column` |
| `saleRate` | `column` |
| `saleUnit` | `column` |
| `scheduleType` | `column` |
| `schemeBase` | `column` |
| `schemeBonus` | `column` |
| `sourcePurchaseId` | `column` |
| `stateCode` | `column` |
| `status` | `column` |
| `supplierId` | `column` |
| `supplierInvoiceNo` | `column` |
| `tenantId` | `column` |

#### `tenants`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `aboutText` | `column` |
| `acceptingNewConnections` | `column` |
| `address` | `column` |
| `addressJson` | `column` |
| `approvalStatus` | `column` |
| `bankAccountJson` | `column` |
| `businessName` | `column` |
| `businessType` | `column` |
| `categories` | `column` |
| `city` | `column` |
| `contactPerson` | `column` |
| `coverageStateCodes` | `column` |
| `creditLimit` | `column` |
| `dlNumber` | `column` |
| `documentsJson` | `column` |
| `email` | `column` |
| `expiresAt` | `column` |
| `gstin` | `column` |
| `id` | `column` |
| `inviteCode` | `column` |
| `isActive` | `column` |
| `isPubliclyListed` | `column` |
| `jti` | `column` |
| `lastLoginAt` | `column` |
| `logoUrl` | `column` |
| `name` | `column` |
| `notificationsJson` | `column` |
| `onboardingCompleted` | `column` |
| `onboardingStep` | `column` |
| `openingBalance` | `column` |
| `outstanding` | `column` |
| `panNumber` | `column` |
| `passwordHash` | `column` |
| `paymentTermsDays` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `pinCode` | `column` |
| `portalConnected` | `column` |
| `publicSlug` | `column` |
| `revokedAt` | `column` |
| `role` | `column` |
| `stateCode` | `column` |
| `status` | `column` |
| `tenantId` | `column` |
| `tenantType` | `column` |
| `tokenHash` | `column` |
| `usedAt` | `column` |
| `userId` | `column` |
| `whatsapp` | `column` |

#### `users`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `address` | `column` |
| `baseUnit` | `column` |
| `category` | `column` |
| `contactPerson` | `column` |
| `convFactor` | `column` |
| `creditLimit` | `column` |
| `dlNumber` | `column` |
| `email` | `column` |
| `expiresAt` | `column` |
| `genericName` | `column` |
| `gstRate` | `column` |
| `gstin` | `column` |
| `hsnCode` | `column` |
| `id` | `column` |
| `isActive` | `column` |
| `jti` | `column` |
| `lastLoginAt` | `column` |
| `manufacturer` | `column` |
| `minStockLevel` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `openingBalance` | `column` |
| `outstanding` | `column` |
| `packSize` | `column` |
| `passwordHash` | `column` |
| `paymentTermsDays` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `portalConnected` | `column` |
| `purchaseRate` | `column` |
| `revokedAt` | `column` |
| `role` | `column` |
| `saleRate` | `column` |
| `saleUnit` | `column` |
| `scheduleType` | `column` |
| `schemeBase` | `column` |
| `schemeBonus` | `column` |
| `stateCode` | `column` |
| `status` | `column` |
| `tenantId` | `column` |
| `tokenHash` | `column` |
| `usedAt` | `column` |
| `userId` | `column` |

### E.3 API / Backend Surface

#### Express/Node REST Endpoints

**`server/src/index.ts`**

- `GET /api/health`

**`server/src/routes/audit.ts`**

- `GET /`
- `GET /:id`

**`server/src/routes/auth.ts`**

- `POST /register`
- `POST /login`
- `POST /logout`
- `GET /me`
- `POST /forgot-password`
- `POST /reset-password`

**`server/src/routes/bills.ts`**

- `GET /`
- `GET /:id`
- `PATCH /:id/status`

**`server/src/routes/communication.ts`**

- `POST /send-bill`

**`server/src/routes/customers.ts`**

- `GET /`
- `GET /:id`
- `POST /`
- `PATCH /:id`
- `DELETE /:id`

**`server/src/routes/events.ts`**

- `GET /`
- `GET /history`
- `POST /process`
- `POST /:id/apply`

**`server/src/routes/extendedAccounts.ts`**

- `POST /consumer/register`
- `POST /consumer/login`
- `GET /consumer/pharmacies`
- `GET /consumer/pharmacies/:id/products`
- `GET /consumer/orders`
- `POST /consumer/orders`
- `GET /consumer/doctors`
- `POST /consumer/consultations`
- `POST /doctor/register`
- `POST /doctor/login`
- `GET /doctor/consultations`
- `POST /mr/register`
- `POST /mr/login`
- `GET /mr/visits`
- `POST /mr/visits`

**`server/src/routes/grn.ts`**

- `GET /`
- `GET /:id`
- `POST /`

**`server/src/routes/orders.ts`**

- `POST /parse-text`
- `GET /`
- `GET /:id`
- `POST /`
- `POST /:id/finalize`
- `POST /:id/deliver`
- `POST /:id/ship`
- `POST /:id/approve`
- `POST /:id/reject`
- `POST /:id/cancel-approved`
- `POST /:id/cancel`
- `POST /:id/bill`
- `POST /:id/return`

**`server/src/routes/payableBills.ts`**

- `GET /`
- `GET /:id`

**`server/src/routes/payablePayments.ts`**

- `GET /`
- `POST /`
- `POST /:id/void`

**`server/src/routes/payments.ts`**

- `GET /check-reference`
- `GET /`
- `GET /:id`
- `POST /`
- `POST /:id/void`

**`server/src/routes/pharmacies.ts`**

- `GET /`
- `GET /:id`
- `GET /:id/orders`
- `GET /:id/bills`
- `GET /:id/outstanding-bills`
- `GET /:id/credit-info`
- `POST /`
- `PATCH /:id`
- `GET /:id/returns`
- `GET /:id/ledger`
- `POST /:id/reconcile-outstanding`

**`server/src/routes/platform.ts`**

- `POST /login`
- `GET /me`
- `GET /stats`
- `GET /tenants`
- `GET /tenants/:id`
- `PATCH /tenants/:id/approval`

**`server/src/routes/products.ts`**

- `POST /autofill`
- `GET /`
- `GET /export`
- `GET /categories`
- `GET /:id`
- `GET /:id/batches`
- `POST /from-catalog/:catalogItemId`
- `POST /`
- `PATCH /:id`
- `POST /:id/adjust-stock`

**`server/src/routes/public.ts`**

- `GET /verify-bill/:id`
- `GET /stockists`
- `GET /stockists/:slug`
- `GET /stockists/:slug/catalog`

**`server/src/routes/purchaseOrders.ts`**

- `GET /`
- `GET /:id`
- `POST /`
- `PATCH /:id`
- `POST /:id/submit`
- `POST /:id/cancel`
- `POST /:id/confirm-receipt`
- `DELETE /:id`

**`server/src/routes/purchases.ts`**

- `GET /`
- `GET /:id`
- `GET /:id/ledger`
- `POST /`
- `POST /sale-rates`
- `POST /parse`
- `POST /:id/receive`
- `PATCH /:id`

**`server/src/routes/reports.ts`**

- `GET /dashboard`
- `GET /sales`
- `GET /outstanding`
- `GET /gst`
- `GET /stock-aging`
- `GET /required-stock`
- `GET /compliance`
- `GET /profit`
- `GET /portal-orders`
- `GET /purchase-analysis`

**`server/src/routes/retailSales.ts`**

- `GET /`
- `GET /:id`
- `POST /`
- `POST /:id/void`

**`server/src/routes/returns.ts`**

- `GET /`
- `GET /:id`
- `POST /:id/process`
- `POST /:id/reject`

**`server/src/routes/settings.ts`**

- `GET /features`
- `GET /tenant`
- `PATCH /tenant`
- `PATCH /onboarding`
- `GET /public-catalog`
- `POST /public-catalog/sync`
- `PATCH /public-catalog/:productId`

**`server/src/routes/smartOrder.ts`**

- `POST /parse`
- `POST /recommend`

**`server/src/routes/stockistConnections.ts`**

- `GET /`
- `GET /search`
- `GET /by-stockist/:stockistTenantId`
- `GET /:id`
- `POST /request`
- `POST /:id/withdraw`
- `POST /:id/approve`
- `POST /:id/reject`
- `POST /:id/disconnect`
- `POST /:id/sync-catalog`
- `POST /:id/pull-catalog`
- `GET /:id/catalog`
- `PATCH /:id/catalog/:catalogItemId/map`

**`server/src/routes/stockistReturns.ts`**

- `GET /`
- `GET /:id`
- `POST /`

**`server/src/routes/supplierPayments.ts`**

- `GET /`
- `POST /`

**`server/src/routes/suppliers.ts`**

- `GET /`
- `GET /:id`
- `GET /:id/purchases`
- `POST /`
- `PATCH /:id`
- `GET /:id/ledger`

**`server/src/routes/system.ts`**

- `GET /health`

**`server/src/routes/users.ts`**

- `GET /`
- `POST /`
- `PATCH /:id`
- `POST /change-password`

### E.4 Auth, Roles, and Permissions

#### Roles referenced in code

- `admin`
- `button`
- `consumer`
- `dialog`
- `doctor`
- `menu`
- `menuitem`
- `mr`
- `super_admin`
- `user`

#### RLS policies (migrations)


### E.5 Workflows and State Machines

#### `status_values`

`active` → `approved` → `cancelled` → `confirmed` → `delivered` → `draft` → `inactive` → `paid` → `partial` → `pending` → `rejected` → `unpaid`

#### Edge-function status mutations


### E.6 Dashboards, Reports, and Formulas

**Extracted calculation lines:** 179

#### `client/src/components/dashboard/DashboardPage.tsx`

- L54: `<StatCard label="Total Outstanding" value={formatCurrency(kpis?.outstandingTotal ?? 0)} icon={<IndianRupee />}  color="red"    isLoading={isLoading} />`
- L59: `<StatCard label="Low Stock Items"  value={String(kpis?.lowStockCount ?? 0)}            icon={<Package />}        color="amber"  isLoading={isLoading} onClick={(`
- L60: `<StatCard label="Overdue Bills"    value={String(kpis?.overdueCount ?? 0)}             icon={<AlertTriangle />}  color="red"    isLoading={isLoading} onClick={(`
- L98: `<span className="text-sm font-semibold text-slate-900">{formatCurrency(o.total ?? o.totalAmount)}</span>`

#### `client/src/components/dashboard/IncomingOrdersWidget.tsx`

- L36: `<span className="text-sm font-semibold">{formatCurrency(getTotal(o))}</span>`

#### `client/src/components/dashboard/OnboardingFlow.tsx`

- L30: `const [currentStep, setCurrentStep] = useState(user?.onboardingStep ?? 0);`
- L32: `const [gstin, setGstin] = useState('');`
- L39: `const hasPharmacy = (pharmaciesData?.total ?? pharmaciesData?.data?.length ?? 0) > 0;`
- L40: `const hasProducts = (productsData?.total ?? productsData?.data?.length ?? 0) > 0;`
- L44: `if (user?.onboardingStep != null) setCurrentStep(user.onboardingStep);`
- L57: `const gstErr = validateGstin(gstin, false); // GST is optional, but if entered it must be a valid 15-char GSTIN`
- L58: `if (gstErr) { toast.error(gstErr); return; }`
- L96: `if (currentStep === 0 && dlNumber.trim() && !validateGstin(gstin, false)) {`
- L145: `<Input label="GST Number" value={gstin} onChange={e => setGstin(e.target.value)} placeholder="Optional" />`

#### `client/src/components/payment/PaymentListPage.tsx`

- L38: `const total = data?.total ?? payments.length;`
- L101: `<Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />`
- L135: `<Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />`

#### `client/src/components/payment/RecordPaymentModal.tsx`

- L45: `const pharmacyOutstanding = Number(selectedPharmacyRow?.outstanding ?? 0);`
- L46: `const { data: outstandingBills } = useOutstandingBills(selectedPharmacy);`
- L47: `const bills = outstandingBills ?? [];`
- L64: `const selectedAllocSum = useMemo(() =>`
- L65: `allocs.filter(a => a.selected).reduce((s, a) => s + (Number(a.amount) || 0), 0),`
- L147: `<label className="block text-sm font-medium text-gray-700 mb-1">Pharmacy account</label>`
- L159: `Outstanding balance: <span className="font-bold">{formatCurrency(pharmacyOutstanding)}</span>`
- L208: `<span className="ml-2">Allocated: {formatCurrency(selectedAllocSum)}</span>`
- L254: `<tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">No outstanding bills</td></tr>`

#### `client/src/components/pharmacy-panel/dashboard/PharmacyDashboardPage.tsx`

- L34: `const hasProducts = (productsData?.total ?? productsData?.data?.length ?? 0) > 0;`
- L86: `<StatCard label="Payables Outstanding" value={formatCurrency(kpis?.payablesOutstanding ?? 0)} icon={<IndianRupee />} color="red" isLoading={isLoading} onClick={`
- L87: `<StatCard label="Low Stock Items" value={String(kpis?.lowStockCount ?? 0)} icon={<Package />} color="amber" isLoading={isLoading} onClick={() => navigate('/phar`
- L133: `<p className="text-sm font-medium text-slate-700 mt-0.5">{formatCurrency(po.total)}</p>`

#### `client/src/components/pharmacy-panel/dashboard/PharmacyOnboardingFlow.tsx`

- L31: `const [currentStep, setCurrentStep] = useState(user?.onboardingStep ?? 0);`
- L33: `const [gstin, setGstin] = useState('');`
- L43: `const hasProducts = (productsData?.total ?? productsData?.data?.length ?? 0) > 0;`
- L46: `if (user?.onboardingStep != null) setCurrentStep(user.onboardingStep);`
- L59: `const gstErr = validateGstin(gstin, false); // GST optional; if entered must be a valid 15-char GSTIN`
- L60: `if (gstErr) { toast.error(gstErr); return; }`
- L98: `if (currentStep === 0 && dlNumber.trim() && !validateGstin(gstin, false)) {`
- L147: `<Input label="GST Number" value={gstin} onChange={e => setGstin(e.target.value)} placeholder="Optional" />`
- L171: `<p className="text-[11px] text-slate-500 mt-1 line-clamp-1">{stockist.gstin ?? 'GSTIN hidden'}</p>`

#### `client/src/components/pharmacy-panel/payables/PayablePaymentsPage.tsx`

- L29: `const total = data?.total ?? 0;`
- L33: `const outstanding = Number(b.outstanding ?? (Number(b.total) - Number(b.paidAmount ?? 0)));`
- L34: `return outstanding > 0;`
- L56: `const outstanding = Number(bill.outstanding ?? (Number(bill.total) - Number(bill.paidAmount ?? 0)));`
- L70: `const outstanding = Number(selectedBill.outstanding ?? (Number(selectedBill.total) - Number(selectedBill.paidAmount ?? 0)));`
- L147: `<Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />`
- L160: `<option value="">Select bill with outstanding balance</option>`
- L162: `const outstanding = Number(b.outstanding ?? (Number(b.total) - Number(b.paidAmount ?? 0)));`

#### `client/src/components/pharmacy-panel/reports/PharmacyComplianceReport.tsx`

- L40: `<p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : (data?.total ?? entries.length)}</p>`

#### `client/src/components/pharmacy-panel/reports/PharmacyGstReport.tsx`

- L10: `const PharmacyGstReport = () => {`
- L13: `const { data, isLoading } = useGstReport(month);`
- L15: `const outputTax = Number(data?.outputGst?.tax ?? 0);`
- L16: `const inputTax = Number(data?.inputGst?.tax ?? 0);`
- L17: `const netPayable = Number(data?.netPayable ?? outputTax - inputTax);`
- L33: `<h1 className="text-2xl font-bold text-gray-900">GST Summary</h1>`
- L34: `<p className="text-sm text-gray-500">Output vs input GST for retail and purchases</p>`
- L45: `<p className="text-xs font-bold text-gray-400 uppercase">Output GST (Sales)</p>`
- L46: `<p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : formatCurrency(outputTax)}</p>`
- L47: `<p className="text-xs text-gray-500 mt-1">Taxable: {formatCurrency(Number(data?.outputGst?.taxable ?? 0))}</p>`
- L50: `<p className="text-xs font-bold text-gray-400 uppercase">Input GST (ITC)</p>`
- L51: `<p className="text-2xl font-bold text-green-600 mt-1">{isLoading ? '—' : formatCurrency(inputTax)}</p>`
- L52: `<p className="text-xs text-gray-500 mt-1">Taxable: {formatCurrency(Number(data?.inputGst?.taxable ?? 0))}</p>`

#### `client/src/components/pharmacy-panel/reports/PharmacyPayablesReport.tsx`

- L13: `const { data, isLoading } = useOutstandingReport(asOfDate);`
- L33: `<p className="text-sm text-gray-500">Outstanding bills to stockists</p>`
- L44: `<p className="text-xs font-bold text-gray-400 uppercase">Total Outstanding</p>`
- L45: `<p className="text-2xl font-bold text-red-600 mt-1">{isLoading ? '—' : formatCurrency(data?.totalOutstanding ?? 0)}</p>`
- L69: `<thead><tr className="border-b"><th className="text-left py-2 text-gray-400">Stockist</th><th className="text-right py-2 text-gray-400">Bills</th><th className=`
- L74: `<td className="py-2 text-right">{s.billCount}</td>`
- L75: `<td className="py-2 text-right font-medium">{formatCurrency(Number(s.outstanding ?? 0))}</td>`
- L84: `<thead><tr className="border-b"><th className="text-left py-2 text-gray-400">Bill #</th><th className="text-left py-2 text-gray-400">Stockist</th><th className=`
- L91: `<td className="py-2 text-right font-medium">{formatCurrency(Number(b.outstanding ?? 0))}</td>`

#### `client/src/components/pharmacy-panel/reports/PharmacyProfitReport.tsx`

- L17: `const summary = data?.summary ?? {};`
- L39: `<Card padding="sm"><p className="text-xs font-bold text-gray-400 uppercase">Revenue</p><p className="text-2xl font-bold mt-1">{isLoading ? '—' : formatCurrency(`
- L40: `<Card padding="sm"><p className="text-xs font-bold text-gray-400 uppercase">Cost</p><p className="text-2xl font-bold mt-1">{isLoading ? '—' : formatCurrency(sum`
- L41: `<Card padding="sm"><p className="text-xs font-bold text-gray-400 uppercase">Profit</p><p className="text-2xl font-bold text-green-600 mt-1">{isLoading ? '—' : f`
- L42: `<Card padding="sm"><p className="text-xs font-bold text-gray-400 uppercase">Margin %</p><p className="text-2xl font-bold mt-1">{isLoading ? '—' : `${summary.mar`

#### `client/src/components/pharmacy-panel/reports/PharmacySalesReport.tsx`

- L22: `const totalRevenue = data?.summary?.total ?? 0;`
- L23: `const totalOrders = data?.summary?.orders ?? 0;`
- L24: `const avgOrder = data?.summary?.avgOrderValue ?? 0;`
- L25: `const chartData = (data?.dailySales ?? []).map((d: { date?: string; total?: number }) => ({`
- L32: `const totalPages = Math.ceil((data?.ordersPagination?.total ?? totalOrders) / PAGE_SIZE);`
- L56: `<p className="text-xs font-bold text-gray-400 uppercase">Total Sales</p>`
- L57: `<p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : formatCurrency(totalRevenue)}</p>`
- L62: `<p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : totalOrders}</p>`
- L89: `<span className="font-medium">{formatCurrency(Number(p.total ?? 0))} ({p.count})</span>`
- L113: `<thead><tr className="border-b"><th className="text-left py-2 text-gray-400">Sale #</th><th className="text-left py-2 text-gray-400">Date</th><th className="tex`
- L120: `<td className="py-2 text-right font-medium">{formatCurrency(Number(o.total ?? 0))}</td>`
- L128: `<span className="text-sm text-gray-500 self-center">Page {page} of {totalPages}</span>`
- L129: `<Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>`

#### `client/src/components/platform/PlatformDashboardPage.tsx`

- L6: `const { data: stats } = useQuery({`
- L8: `queryFn: async () => (await api.get('/platform/stats')).data,`
- L15: `<StatCard label="Total Tenants" value={String(stats?.totalTenants ?? '—')} />`
- L16: `<StatCard label="Stockists" value={String(stats?.stockists ?? '—')} />`
- L17: `<StatCard label="Pharmacies" value={String(stats?.pharmacies ?? '—')} />`
- L18: `<StatCard label="Pending Approvals" value={String(stats?.pendingApprovals ?? '—')} />`

#### `client/src/components/reports/GSTReport.tsx`

- L11: `const GSTReport = () => {`
- L16: `const { data, isLoading } = useGstReport(month);`
- L20: `const isPharmacyGst = !!(data?.outputGst || data?.inputGst);`
- L22: `const outputCgst = isPharmacyGst ? 0 : (sales.cgst ?? 0);`
- L23: `const outputSgst = isPharmacyGst ? 0 : (sales.sgst ?? 0);`
- L24: `const outputIgst = isPharmacyGst ? 0 : (sales.igst ?? 0);`
- L25: `const inputCgst = isPharmacyGst ? 0 : (purchases.cgstInput ?? 0);`
- L26: `const inputSgst = isPharmacyGst ? 0 : (purchases.sgstInput ?? 0);`
- L27: `const inputIgst = isPharmacyGst ? 0 : (purchases.igstInput ?? 0);`
- L28: `const totalOutput = isPharmacyGst ? Number(data?.outputGst?.tax ?? 0) : outputCgst + outputSgst + outputIgst;`
- L29: `const totalInput = isPharmacyGst ? Number(data?.inputGst?.tax ?? 0) : inputCgst + inputSgst + inputIgst;`
- L30: `const netLiability = isPharmacyGst ? Number(data?.netPayable ?? 0) : totalOutput - totalInput;`
- L31: `const taxableOutput = isPharmacyGst ? Number(data?.outputGst?.taxable ?? 0) : (sales.taxableValue ?? 0);`
- L32: `const taxableInput = isPharmacyGst ? Number(data?.inputGst?.taxable ?? 0) : (purchases.taxableValue ?? 0);`
- L50: `<h1 className="text-2xl font-bold text-gray-900">GST Breakdown</h1>`
- L51: `<p className="text-sm text-gray-500">Monthly CGST, SGST and IGST reports for compliance</p>`
- L63: `<p className="text-xs font-bold text-gray-400 uppercase">Input Tax (ITC)</p>`
- L64: `<p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : formatCurrency(totalInput)}</p>`
- L67: `<p className="text-xs font-bold text-gray-400 uppercase">Output Tax</p>`
- L68: `<p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : formatCurrency(totalOutput)}</p>`
- L74: `{!isLoading && netLiability < 0 && <span className="text-sm font-normal text-green-500 ml-1">(credit)</span>}`
- L78: `<p className="text-xs font-bold text-gray-400 uppercase">Taxable Sales</p>`
- L79: `<p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : formatCurrency(taxableOutput)}</p>`
- L83: `<Card title={`GST Summary — ${month}`}>`
- L92: `<th className="px-4 py-3 font-semibold text-gray-500 uppercase text-right">Taxable Value</th>`
- L93: `<th className="px-4 py-3 font-semibold text-gray-500 uppercase text-right">CGST</th>`
- L94: `<th className="px-4 py-3 font-semibold text-gray-500 uppercase text-right">SGST</th>`
- L95: `<th className="px-4 py-3 font-semibold text-gray-500 uppercase text-right">IGST</th>`
- L96: `<th className="px-4 py-3 font-semibold text-gray-500 uppercase text-right">Total Tax</th>`
- L102: `<td className="px-4 py-3 text-right text-gray-700">{formatCurrency(taxableOutput)}</td>`
- *+12 more*

#### `client/src/components/reports/OutstandingReport.tsx`

- L23: `const OutstandingReport = () => {`
- L26: `const { data, isLoading } = useOutstandingReport(asOfDate);`
- L29: `const totalOutstanding = data?.totalOutstanding ?? 0;`
- L35: `? (data?.byStockist ?? []).map((s: { stockistName: string; outstanding: number }) => ({ name: s.stockistName, outstanding: s.outstanding }))`
- L72: `<h1 className="text-2xl font-bold text-gray-900">{isPharmacyPayables ? 'Payables Aging' : 'Outstanding Payments'}</h1>`
- L73: `<p className="text-sm text-gray-500">{isPharmacyPayables ? 'Accounts payable aging by stockist' : 'Track unpaid bills and aging credit balances'}</p>`
- L83: `<p className="text-xs font-bold text-gray-400 uppercase">Total Outstanding</p>`
- L84: `<p className="text-2xl font-bold text-red-600 mt-1">{isLoading ? '—' : formatCurrency(totalOutstanding)}</p>`
- L107: `formatter={(v: number) => [formatCurrency(v), 'Outstanding']} />`
- L130: `<td className="px-4 py-3 text-right font-bold text-red-600">{formatCurrency(Number(p.outstanding ?? 0))}</td>`
- L147: `<Card title="Outstanding Bills">`
- L154: `<th className="px-4 py-3 font-semibold text-gray-500 uppercase text-right">Outstanding</th>`
- L164: `<td className="px-4 py-3 text-right font-bold text-red-600">{formatCurrency(Number(b.outstanding ?? 0))}</td>`

#### `client/src/components/reports/PortalOrdersReport.tsx`

- L52: `<div className="bg-white p-4 rounded-lg border"><p className="text-xs text-slate-400">Total Portal Orders</p><p className="text-2xl font-bold">{data.summary?.to`
- L53: `<div className="bg-white p-4 rounded-lg border"><p className="text-xs text-slate-400">Approval Rate</p><p className="text-2xl font-bold">{data.summary?.approval`
- L54: `<div className="bg-white p-4 rounded-lg border"><p className="text-xs text-slate-400">Rejections</p><p className="text-2xl font-bold">{data.summary?.rejectionCo`
- L77: `<thead><tr className="border-b bg-slate-50"><th className="px-4 py-2 text-left">Order #</th><th className="px-4 py-2 text-left">Pharmacy</th><th className="px-4`
- L91: `<td className="px-4 py-2 text-right">{formatCurrency(o.total)}</td>`

#### `client/src/components/reports/ProfitReport.tsx`

- L21: `const totalRevenue = data?.totalRevenue ?? data?.summary?.revenue ?? data?.summary?.total ?? 0;`
- L22: `const totalProfit = data?.totalProfit ?? data?.summary?.profit ?? data?.grossProfit ?? 0;`
- L23: `const totalMargin = data?.profitMargin ?? data?.summary?.margin ?? (totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0);`
- L54: `<p className="text-xs font-bold text-gray-400 uppercase">Total Revenue</p>`
- L55: `<p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : formatCurrency(totalRevenue)}</p>`
- L59: `<p className="text-2xl font-bold text-green-600 mt-1">{isLoading ? '—' : formatCurrency(totalProfit)}</p>`
- L63: `<p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : `${Number(totalMargin).toFixed(1)}%`}</p>`

#### `client/src/components/reports/PurchaseAnalysisReport.tsx`

- L52: `<div className="bg-white p-4 rounded-lg border"><p className="text-xs text-slate-400">Total Purchases</p><p className="text-2xl font-bold">{data.summary?.totalP`
- L53: `<div className="bg-white p-4 rounded-lg border"><p className="text-xs text-slate-400">Total Spend</p><p className="text-2xl font-bold">{formatCurrency(data.summ`
- L54: `<div className="bg-white p-4 rounded-lg border"><p className="text-xs text-slate-400">Suppliers</p><p className="text-2xl font-bold">{data.summary?.supplierCoun`
- L77: `<thead><tr className="border-b bg-slate-50"><th className="px-4 py-2 text-left">GRN</th><th className="px-4 py-2 text-left">Supplier</th><th className="px-4 py-`
- L87: `<td className="px-4 py-2 text-right">{formatCurrency(p.total)}</td>`

#### `client/src/components/reports/ReportsHub.tsx`

- L44: `...(userRole === 'admin' ? [{ section: 'Dashboard KPIs', metric: 'Total Outstanding', value: dash.outstandingTotal }] : []),`

#### `client/src/components/reports/SalesReport.tsx`

- L25: `const totalRevenue = data?.summary?.total ?? data?.totalRevenue ?? 0;`
- L26: `const totalOrders = data?.summary?.orders ?? data?.totalOrders ?? 0;`
- L27: `const avgOrder = data?.summary?.avgOrderValue ?? (totalOrders > 0 ? totalRevenue / totalOrders : 0);`
- L28: `const chartData = (data?.dailySales ?? data?.monthlySales ?? []).map((d: { date?: string; total?: number; amount?: number }) => ({`
- L34: `const totalPages = Math.ceil((data?.ordersPagination?.total ?? totalOrders) / PAGE_SIZE);`
- L60: `<p className="text-xs font-bold text-gray-400 uppercase">Total Sales</p>`
- L61: `<p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : formatCurrency(totalRevenue)}</p>`
- L71: `<p className="text-xs font-bold text-gray-400 uppercase">Total Orders</p>`
- L72: `<p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : totalOrders}</p>`
- L146: `<td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(getTotal(order as Parameters<typeof getTotal>[0]))}</td>`
- L157: `<p className="text-sm text-gray-500">Page {page} of {totalPages} ({totalOrders} orders)</p>`
- L160: `<Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>`

### E.7 Modals / Dialogs / Sheets Inventory

**Files:** 14

| File | Count | Components |
|------|-------|------------|
| `client/src/components/order/OrderDetailPage.tsx` | 0 | (inline) |
| `client/src/components/settings/ConnectionsTab.tsx` | 0 | (inline) |
| `client/src/components/settings/SettingsPage.tsx` | 0 | (inline) |
| `client/src/components/pharmacy/PharmacyDetailPage.tsx` | 0 | (inline) |
| `client/src/components/payment/PaymentDetailPage.tsx` | 0 | (inline) |
| `client/src/components/return/ReturnDetailPage.tsx` | 0 | (inline) |
| `client/src/components/common/ConfirmDialog.tsx` | 0 | ConfirmDialog |
| `client/src/components/common/BottomNav.tsx` | 0 | (inline) |
| `client/src/components/purchase/PurchaseDetailPage.tsx` | 0 | (inline) |
| `client/src/components/pharmacy-panel/customers/PharmacyCustomersPage.tsx` | 0 | (inline) |
| `client/src/components/pharmacy-panel/settings/PharmacySettingsPage.tsx` | 0 | (inline) |
| `client/src/components/pharmacy-panel/purchase-orders/PurchaseOrderDetailPage.tsx` | 0 | (inline) |
| `client/src/components/pharmacy-panel/pos/PosPage.tsx` | 0 | (inline) |
| `client/src/components/pharmacy-panel/payables/PayablePaymentsPage.tsx` | 0 | openRecordModal |

### E.8 Mock, Stub, and Incomplete Behavior

**Files flagged:** 80

| File | Tags | Sample |
|------|------|--------|
| `server/src/index.ts` | debug | L86: console.log('Database connected.'); |
| `server/src/db/migrateInline.ts` | debug | L1009: console.log('Schema ready.'); |
| `server/src/routes/users.ts` | demo | L58: // C16: own-account guards apply for both deactivation and role demotion. |
| `server/src/services/userService.ts` | debug | L199: console.log(`[DEV] Password reset token for ${email}: ${resetToken}`); |
| `client/src/components/order/OrderDetailPage.tsx` | placeholder | L352: placeholder="Reason for cancellation..." |
| `client/src/components/order/RejectPharmacyOrderModal.tsx` | placeholder | L45: placeholder="Rejection reason (required, min 3 characters)" |
| `client/src/components/order/CreateOrderPage.tsx` | placeholder | L290: placeholder={"Paracetamol -10\nAzithral 500 x 5\nPan 40 20"} |
| `client/src/components/order/ShipOrderModal.tsx` | placeholder | L48: <Input label="Carrier (optional)" value={carrier} onChange={e => setCarrier(e.target.value |
| `client/src/components/order/OrderListPage.tsx` | placeholder | L100: <input type="text" placeholder="Search..." value={search} |
| `client/src/components/order/InitiateReturnModal.tsx` | placeholder | L186: placeholder="0" |
| `client/src/components/settings/RejectConnectionModal.tsx` | placeholder | L73: placeholder="Enter custom rejection reason" |
| `client/src/components/settings/OrderDefaultsTab.tsx` | placeholder | L53: placeholder={String(DEFAULT_CREDIT_LIMIT)} |
| `client/src/components/settings/PublicProfileTab.tsx` | placeholder | L84: <Input label="Public URL slug" value={publicSlug} onChange={e => setPublicSlug(e.target.va |
| `client/src/components/settings/AddUserModal.tsx` | placeholder | L60: <Input label="Full Name" placeholder="e.g. John Doe" value={name} onChange={e => setName(e |
| `client/src/components/home/HomePage.tsx` | demo | L43: <Link to="/verify-bill/demo" className="text-blue-600 hover:underline">Verify a bill</Link |
| `client/src/components/pharmacy/AddPharmacyModal.tsx` | placeholder | L71: const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white foc |
| `client/src/components/pharmacy/EditPharmacyModal.tsx` | placeholder | L91: const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white foc |
| `client/src/components/pharmacy/PharmacyListPage.tsx` | placeholder | L45: placeholder="Search..." |
| `client/src/components/bill/BillListPage.tsx` | placeholder | L56: placeholder="Search..." |
| `client/src/components/bill/BillDetailPage.tsx` | placeholder | L151: placeholder="Notes (required)" |
| `client/src/components/mr/MrRegisterPage.tsx` | placeholder | L32: className="w-full border rounded-lg px-3 py-2" placeholder={f} value={form[f]} onChange={( |
| `client/src/components/mr/MrVisitsPage.tsx` | placeholder | L28: <input required placeholder="Pharmacy name" className="w-full border rounded px-3 py-2" va |
| `client/src/components/auth/RegisterPage.tsx` | placeholder | L84: const inputBase = `w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white  |
| `client/src/components/auth/LoginPage.tsx` | placeholder | L62: const inputBase = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white  |
| `client/src/components/auth/ForgotPasswordPage.tsx` | placeholder | L44: const inputBase = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white  |
| `client/src/components/auth/ResetPasswordPage.tsx` | placeholder | L50: const inputBase = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white  |
| `client/src/components/payment/PaymentListPage.tsx` | placeholder | L49: placeholder="Search pharmacy..." |
| `client/src/components/payment/RecordPaymentModal.tsx` | placeholder | L165: <Input label="Amount Received (₹)" type="number" placeholder="0.00" value={amount} onChan |
| `client/src/components/platform/PlatformLoginPage.tsx` | placeholder | L36: <input type="email" required placeholder="Email" className="w-full px-3 py-2 border rounde |
| `client/src/components/doctor/DoctorRegisterPage.tsx` | placeholder | L33: className="w-full border rounded-lg px-3 py-2" placeholder={f} value={form[f]} onChange={( |
| `client/src/components/doctor/DoctorLoginPage.tsx` | placeholder | L31: <input type="email" required className="w-full border rounded-lg px-3 py-2" value={email}  |
| `client/src/components/return/ReturnDetailPage.tsx` | placeholder | L212: placeholder="Reason for rejection…" |
| `client/src/components/return/ReturnListPage.tsx` | placeholder | L53: placeholder="Search return # or pharmacy..." |
| `client/src/components/product/EditProductModal.tsx` | placeholder | L116: <Input placeholder="Category" required value={form.category} onChange={set('category')} / |
| `client/src/components/product/ProductListPage.tsx` | placeholder | L60: placeholder="Search..." |
| `client/src/components/product/AdjustStockModal.tsx` | placeholder | L140: placeholder="e.g. -5 or +3" |
| `client/src/components/product/AddProductModal.tsx` | placeholder | L84: <Input label="Medicine / Product Name" placeholder="Product name" required value={form.nam |
| `client/src/components/dashboard/OnboardingFlow.tsx` | placeholder | L145: <Input label="GST Number" value={gstin} onChange={e => setGstin(e.target.value)} placehol |
| `client/src/components/common/SearchBar.tsx` | placeholder | L7: placeholder?: string; |
| `client/src/components/common/Header.tsx` | placeholder | L128: placeholder="Search products… (Enter)" |
| `client/src/components/common/Input.tsx` | placeholder | L38: placeholder:text-slate-400 |
| `client/src/components/public/BillVerifyPage.tsx` | demo | L9: const isDemo = billId === 'demo'; |
| `client/src/components/supplier/AddSupplierModal.tsx` | placeholder | L49: const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white foc |
| `client/src/components/supplier/SupplierListPage.tsx` | placeholder | L39: placeholder="Search..." |
| `client/src/components/supplier/EditSupplierModal.tsx` | placeholder | L57: const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white foc |
| `client/src/components/supplier/RecordSupplierPaymentModal.tsx` | placeholder | L67: <Input label="Amount Paid (₹)" type="number" placeholder="0.00" value={amount} onChange={e |
| `client/src/components/purchase/SetSaleRatesModal.tsx` | placeholder | L100: placeholder="PTR" |
| `client/src/components/purchase/PurchaseListPage.tsx` | placeholder | L61: <input type="text" placeholder="Search bill / supplier..." value={search} |
| `client/src/components/purchase/UploadBillModal.tsx` | placeholder | L278: <input type="text" placeholder="Search suppliers…" className="w-full px-3 py-2 text-sm bo |
| `client/src/components/pharmacy-panel/customers/PharmacyCustomersPage.tsx` | placeholder | L68: placeholder="Search name or phone…" |
| `client/src/components/pharmacy-panel/discover/StockistPublicProfilePage.tsx` | placeholder | L128: placeholder="Search products..." |
| `client/src/components/pharmacy-panel/discover/DiscoverStockistsPage.tsx` | placeholder | L51: placeholder="Search by name, GSTIN..." |
| `client/src/components/pharmacy-panel/purchase-orders/PurchaseOrderListPage.tsx` | placeholder | L43: placeholder="Search PO#..." |
| `client/src/components/pharmacy-panel/purchase-orders/CreatePurchaseOrderPage.tsx` | placeholder | L231: placeholder="Instructions for stockist..." |
| `client/src/components/pharmacy-panel/sales/SaleDetailPage.tsx` | placeholder | L190: placeholder="Reason (e.g., entered wrong amount, customer changed mind)" |
| `client/src/components/pharmacy-panel/sales/SalesHistoryPage.tsx` | placeholder | L38: <input type="text" placeholder="Search sale#..." value={search} onChange={e => { setSearch |
| `client/src/components/pharmacy-panel/layout/PharmacyHeader.tsx` | placeholder | L110: placeholder="Search products… (Enter)" |
| `client/src/components/pharmacy-panel/stockists/ConnectStockistModal.tsx` | placeholder | L68: <input type="text" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" |
| `client/src/components/pharmacy-panel/stockists/StockistListPage.tsx` | placeholder | L60: placeholder="Search name, GSTIN..." |
| `client/src/components/pharmacy-panel/dashboard/PharmacyOnboardingFlow.tsx` | placeholder | L147: <Input label="GST Number" value={gstin} onChange={e => setGstin(e.target.value)} placehol |
| `client/src/components/pharmacy-panel/pos/PosPage.tsx` | placeholder | L215: placeholder="Search products (Enter to add exact match)..." |
| `client/src/components/pharmacy-panel/payables/PayableBillListPage.tsx` | placeholder | L41: <input type="text" placeholder="Search bill#..." value={search} onChange={e => { setSearch |
| `client/src/components/pharmacy-panel/grn/GrnListPage.tsx` | placeholder | L76: placeholder="Search GRN#..." |
| `client/src/components/pharmacy-panel/returns/InitiateStockistReturnModal.tsx` | placeholder | L267: placeholder="0" |
| `client/src/components/pharmacy-panel/smart-order/SmartOrderPage.tsx` | placeholder | L63: <textarea rows={6} className="w-full border rounded-xl p-3 font-mono text-sm" placeholder= |
| `client/src/components/consumer/ConsumerRegisterPage.tsx` | placeholder | L35: className="w-full border rounded-lg px-3 py-2" placeholder={f.charAt(0).toUpperCase() + f. |
| `client/src/components/consumer/ConsumerLoginPage.tsx` | placeholder | L35: <input type="email" required className="w-full border rounded-lg px-3 py-2" value={email}  |
| `client/src/components/requiredstock/RequiredStockPage.tsx` | placeholder | L53: <input type="text" placeholder="Search..." value={search} |
| `client/src/hooks/useProducts.ts` | placeholder | L8: placeholderData: keepPreviousData, |
| `client/src/hooks/useGrn.ts` | placeholder | L13: placeholderData: keepPreviousData, |
| `client/src/hooks/useBills.ts` | placeholder | L8: placeholderData: keepPreviousData, |
| `client/src/hooks/usePurchaseOrders.ts` | placeholder | L14: placeholderData: keepPreviousData, |
| `client/src/hooks/useRetailSales.ts` | placeholder | L15: placeholderData: keepPreviousData, |
| `client/src/hooks/usePayableBills.ts` | placeholder | L14: placeholderData: keepPreviousData, |
| `client/src/hooks/usePurchases.ts` | placeholder | L11: placeholderData: keepPreviousData, |
| `client/src/hooks/useOrders.ts` | placeholder | L9: placeholderData: keepPreviousData, |
| `client/src/hooks/usePublicStockists.ts` | placeholder | L14: placeholderData: keepPreviousData, |
| `client/src/hooks/useReturns.ts` | placeholder | L8: placeholderData: keepPreviousData, |
| `client/src/hooks/useCustomers.ts` | placeholder | L8: placeholderData: keepPreviousData, |
| `client/src/hooks/useSuppliers.ts` | placeholder | L8: placeholderData: keepPreviousData, |

### E.9 Dead Code, Orphan Routes, and Broken Links

#### Duplicate filenames


