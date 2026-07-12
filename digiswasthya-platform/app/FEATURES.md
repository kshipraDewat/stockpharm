# Stockist ↔ Pharmacy ERP — Detailed Feature Specification

> **In-product name:** Digital Swastha / Stockist (the two panels are branded internally as the **Stockist** app and the **Pharmacy** app)
> **Type:** Multi-tenant B2B pharmaceutical distribution & retail platform — a distributor (Stockist) ERP and a pharmacy (Pharmacy) ERP joined by a cross-tenant connection + event bus
> **Stack:** npm-workspaces monorepo (`client`, `server`, `shared`). **Client:** React 19 · Vite 6 · Tailwind 4 · TanStack Query 5 · Zustand 5 · React Router 7 · axios · jsPDF + html2canvas · Recharts · react-hot-toast. **Server:** Express 4 · Drizzle ORM 0.41 over **PGlite** (embedded Postgres, `@electric-sql/pglite`) · bcryptjs · **jose** (JWT in httpOnly cookies) · multer · helmet · pino · Zod · **@google/genai** (Gemini) for AI bill parsing. **Shared:** TypeScript DTOs/enums/constants imported by both sides.

This document is a **detailed, code-derived feature spec**. Every section reflects what the routes, services, libraries, middleware, and React components actually do — including GST math, FEFO stock consumption, double-entry ledger postings, credit-exposure checks, the stockist↔pharmacy event protocol, auth posture, and known stubs. See `additions.md` for the tracked list of missing/partial features.

---

## Table of Contents
1. [Platform Overview, Tenants & Roles](#1-platform-overview-tenants--roles)
2. [Authentication, Sessions & Registration](#2-authentication-sessions--registration)
3. [Middleware & Authorization Posture](#3-middleware--authorization-posture)
4. [Stockist Panel](#4-stockist-panel)
5. [Pharmacy Panel](#5-pharmacy-panel)
6. [Cross-Tenant Connections, Catalog Sync & Event Bus](#6-cross-tenant-connections-catalog-sync--event-bus)
7. [Money Logic: GST, FEFO, Credit, Ledger](#7-money-logic-gst-fefo-credit-ledger)
8. [Reports & Analytics](#8-reports--analytics)
9. [AI, WhatsApp & External Integrations](#9-ai-whatsapp--external-integrations)
10. [Client Architecture & Routing](#10-client-architecture--routing)
11. [API Surface (Routes ↔ Services)](#11-api-surface-routes--services)
12. [Data Model](#12-data-model)
13. [Cross-Cutting Conventions](#13-cross-cutting-conventions)
14. [Known Stubs, Placeholders & Gaps](#14-known-stubs-placeholders--gaps)

---

## 1. Platform Overview, Tenants & Roles

The platform is a **single codebase serving two tenant types** that trade with each other. Every business is a `tenant` row with `tenantType ∈ {stockist, pharmacy}` (`server/src/db/schema.ts` → `tenants`). A stockist distributes to pharmacies; a pharmacy buys from stockists and sells over the counter (POS). The two sides share one database but never read each other's tables directly — all cross-tenant state moves through the **connection** record and an append-only **event queue** (§6).

### 1.1 Tenant types
| Tenant type | Default dashboard | Core capability |
|-------------|-------------------|-----------------|
| **stockist** | `/dashboard` | Products/batches, pharmacy customers, sales orders, GST bills, receivables, purchases (GRN), sales returns, reports, connection approvals, public catalog |
| **pharmacy** | `/pharmacy/dashboard` | Discover/connect to stockists, purchase orders → GRN, own inventory, retail POS sales, payables to stockists, returns to stockist, reports |

`defaultDashboard(tenantType)` (client `lib/panel`) routes a user to `/dashboard` (stockist) or `/pharmacy/dashboard` (pharmacy). A user account belongs to exactly one tenant; a login can be pinned to a panel via `tenantType` (§2.2).

### 1.2 Roles (`shared/types.ts`, `users.role`)
Roles are **per-tenant staff roles**, not global. The `users.role` column is `'admin' | 'biller' | 'pharmacist' | 'cashier'`.

| Role | Applies to | Typical capability |
|------|-----------|--------------------|
| **admin** | both | Full control: settings, users, connections, approvals, deletes, voids, reports |
| **biller** | stockist | Create/bill orders, record payments, purchases, sales reports |
| **pharmacist** | pharmacy | Purchase orders, GRN, POS, products, returns, most reports |
| **cashier** | pharmacy | POS sales, view products/customers/dashboard |

There is **no platform "super-admin"** — the in-app `admin` role is a *tenant administrator*, confirmed in `additions.md §D`.

---

## 2. Authentication, Sessions & Registration

Server: `server/src/routes/auth.ts` + `server/src/services/userService.ts` + `server/src/lib/cookies.ts` + `server/src/middleware/auth.ts`.

### 2.1 Token model
- **JWT** signed with **jose** `HS256`, secret `env.JWT_SECRET` (boot fails if `< 32` chars, `server/src/env.ts`). Payload: `{ sub, tenantId, email, name, role, tenantType }`, `setIssuedAt()`, `setExpirationTime(JWT_ACCESS_TTL)` (default `24h`).
- Delivered as an **httpOnly cookie** `accessToken` (`setAuthCookie`): `sameSite: 'lax'`, `secure` only in production, `maxAge` 24 h. `getAuthTokenFromRequest` also accepts an `Authorization: Bearer` header as a fallback.
- **No refresh-token rotation is wired** into the request flow — a `refresh_tokens` table and `revokeUserTokens()` exist and are used on password change / deactivation, but there is no `/auth/refresh` endpoint. `login`/`register` set the 24 h cookie directly.

### 2.2 Login / register / me / logout
- `POST /api/auth/register` — Zod `RegisterSchema`: `businessName`, `name`, `email`, `password` (min 8, must contain upper+lower+digit), `stateCode` (2 digits), `phone` (`^[6-9]\d{9}$`), optional `gstin` (full GSTIN regex), optional `dlNumber`, `tenantType` (default `stockist`). **Pharmacy registration requires `dlNumber`** (`superRefine`). `registerTenant()` creates the `tenants` row, one `users` row with `role: 'admin'`, seeds the 16 ledger accounts (`seedLedgerAccounts`), and (stockists only) generates an `inviteCode` (`randomBytes(4).hex().toUpperCase()`). On failure the tenant row is rolled back (delete).
- `POST /api/auth/login` — `loginUser(email, password, tenantType?)` looks up **all** active users with that email across tenants, bcrypt-compares each, and if a `tenantType` is supplied filters to that panel — otherwise throws `This account is registered on the {Pharmacy|Stockist} panel`. Updates `lastLoginAt`.
- `GET /api/auth/me` — returns identity + `tenantType`, `onboardingCompleted`, `onboardingStep` from the live tenant row.
- `POST /api/auth/logout` — clears the cookie.
- `POST /api/auth/forgot-password` / `reset-password` — creates a `password_reset_tokens` row (jti, 15-min expiry) + a jose reset JWT; email is sent only if SMTP/Resend is configured, otherwise responds `emailConfigured:false` and (dev only) returns a `devToken`. Reset consumes the jti once and revokes refresh tokens.
- All auth endpoints are rate-limited (`authRateLimit`: 5/min in prod, 200/min in dev). `register` and `reset-password` also run `auditMiddleware('auth')`.

### 2.3 Session validity (server-enforced)
`authenticate` re-queries the user + tenant on **every** request: rejects if the user is missing or `!isActive`; rejects with `Session expired` when `users.updatedAt` (seconds) is newer than the token `iat` — so a password change or profile update invalidates existing tokens. `tenantType` is taken from the live tenant, not just the token.

### 2.4 Registration reality (per `additions.md`)
Registration is a **single form** (`client/.../auth/RegisterPage.tsx`), not the multi-step wizard the spec calls for. PAN, WhatsApp, city, own PIN, serviceable pin codes, document uploads, and bank details are **not collected** — see `additions.md §B/§C`.

---

## 3. Middleware & Authorization Posture

Server middleware (`server/src/middleware/*`), applied per-router:

| Middleware | Behavior |
|------------|----------|
| `authenticate` | Verifies JWT, loads user+tenant, sets `req.user` (§2.3). Returns 401 on any failure. |
| `requireRole(...roles)` | 403 unless `req.user.role` is in the list. |
| `requireRoleForTenant({stockist:[...], pharmacy:[...]})` | Role gating **scoped by tenant type** — prevents cross-panel role confusion. Exports `sharedProductWrite` (`stockist:['admin']`, `pharmacy:['admin','pharmacist']`) and `sharedProductAdjust` (same) for the shared `/products` router. |
| `requireTenantType('stockist'\|'pharmacy')` | 403 if the caller's tenant type isn't allowed on that router. |
| `auditMiddleware(entityType)` | On mutating methods (POST/PUT/PATCH/DELETE) captures a before-state (for PATCH/PUT by id) and writes an `audit_logs` row on a 2xx response, redacting `password/passwordHash/token/...`. Non-fatal on error. |
| `rateLimit({windowMs,max,keyFn})` | In-memory fixed-window bucket keyed by IP (default). Sets `Retry-After`, returns 429. Used on auth and all `/api/public` routes (60/min). |
| `errorHandler` | Maps `ZodError`→400, `InsufficientStockError`→409, `statusCode===409` and `DUPLICATE_REFERENCE:`→409, `Invalid credentials`→401, `registered on the …`→403, else 500. |

Routers pin tenant type at the top: `orders`, `bills`, `payments`, `supplier-payments`, `purchases`, `returns`, `suppliers`, `pharmacies` → **stockist only**; `purchase-orders`, `grn`, `payable-bills`, `payable-payments`, `retail-sales`, `customers`, `stockist-returns` → **pharmacy only**; `products`, `settings`, `stockist-connections`, `reports`, `events`, `communication`, `audit-logs`, `users` → **shared** (behavior branches on `tenantType`). `audit-logs` and `system` require `admin`.

**Client-side guard:** `ProtectedRoute` (`client/.../auth/ProtectedRoute.tsx`) bootstraps by calling `GET /auth/me`, stores the user in the Zustand `authStore`, redirects unauthenticated → `/login`, wrong `requiredTenantType` → the user's own default dashboard, and non-admin on admin routes → an "Access Denied" panel (or a `deniedRedirect` with a toast). Axios (`api/client.ts`) sends `withCredentials` and, on any non-login 401, triggers a redirect to `/login` (or `/login?panel=pharmacy`).

---

## 4. Stockist Panel

The distributor ERP. Routes live under `/*` behind `ProtectedRoute requiredTenantType="stockist"` (`client/src/routes/index.tsx`); server data comes from the stockist-scoped routers.

### 4.1 Dashboard (`/dashboard` → `getDashboardKpis`)
KPIs computed in `reportService.getDashboardKpis`: **today sales** (Σ `orders.total` for today), **period sales** (defaults to month-to-date), **outstanding total** (Σ `pharmacies.outstanding`), **low-stock count** (products whose Σ on-hand `< minStockLevel`), **pending orders**, **pack backlog** (pending that are stockist-created or already approved), **incoming portal orders** (pharmacy-submitted, pending, not yet approved), **overdue count** (`buildOverdueBillFilter`), **active connections**, plus the 5 most recent orders and 5 low-stock products. `IncomingOrdersWidget` surfaces portal orders needing action.

### 4.2 Pharmacies (`/pharmacies`, `/pharmacies/:id`)
`server/src/routes/pharmacies.ts` (stockist-only). Endpoints: list (search name/owner/phone), create (`admin`), edit (`admin`), and per-pharmacy `orders`, `bills`, `outstanding-bills`, `credit-info`, `returns`, and a **`ledger`** (chronological debit/credit statement). `credit-info` uses `getPharmacyExposure` (§7.4). `POST /:id/reconcile-outstanding` (`admin`) recomputes `pharmacies.outstanding` from bill balances. Modals: `AddPharmacyModal`, `EditPharmacyModal`; detail page `PharmacyDetailPage`.

### 4.3 Products & batches (`/products`, `/products/:id`)
Shared `/api/products` router (`requireRole` via `sharedProductWrite`/`sharedProductAdjust`). `currentStock` is a correlated subquery **summing only non-expired batches** (`expiry_date > today`). Endpoints: list (search name/generic/HSN, category filter, `includeInactive`, pagination, `export` admin-only up to 50 000 rows), `categories` (distinct), detail, `/:id/batches` (ordered by expiry asc), `POST /` (Zod `ProductSchema`), `PATCH /:id`, `POST /:id/adjust-stock`, and `POST /from-catalog/:catalogItemId` (pharmacy-only). Creating/updating a **stockist** product fires `pushCatalogToActiveConnections` (§6.3) in the background. **Stock adjustment** (`adjust-stock`) works on an existing batch only, forbids negative on-hand, forbids exceeding `qtyReceived` (C25 — cannot inflate stock without a purchase), and records a `stock_movements` row with reason `adjustment`. UI: `ProductListPage`, `AddProductModal`, `EditProductModal`, `AdjustStockModal`, `BulkPriceEditModal`.

### 4.4 Orders (`/orders`, `/orders/create`, `/orders/:id`)
`server/src/routes/orders.ts` + `orderService.ts`. Status vocabulary: **`pending → packed → shipped → delivered`**, plus `cancelled`. Source is `stockist_created` or `pharmacy_submitted`.

- **Create** (`POST /`, `admin`): `createOrder` prices each line at the product's `saleRate`, computes GST via `computeGst` using seller vs buyer state (`placeOfSupply = pharmacy.stateCode`), and for **credit** orders enforces the credit limit against `getPharmacyExposure`. Order numbers `ORD-YYYY-####` are allocated with a 3-attempt collision retry.
- **Finalize / pack** (`POST /:id/finalize`, `admin`): `finalizeOrder` runs in a transaction — re-checks credit exposure, **reserves stock FEFO** (`reserveStock`, §7.2) rolling back on `InsufficientStockError`, flips status to `packed`, increments `pharmacies.outstanding` for credit, posts the sales ledger entry (Debtors/Cash Dr; Sales + CGST/SGST or IGST Cr), and **generates the bill** for credit or portal orders. Portal orders emit `order.packed`.
- **Ship** (`POST /:id/ship`, `admin`): requires `packed`; sets carrier/AWB/`shippedAt`; also generates the bill (idempotent) and emits `order.shipped`.
- **Deliver** (`POST /:id/deliver`, `admin`): requires `packed`/`shipped`; **portal orders require an existing bill** (`BILL_REQUIRED`); emits `order.delivered`.
- **Approve / reject / cancel-approved** portal orders (`approvePharmacyOrder`, `rejectPharmacyOrder`, `cancelApprovedPharmacyOrder`): approval sets `approvedAt/approvedBy`, optionally finalizes immediately (`finalizeNow`), emits `order.accepted`/`order.rejected`. Credit-limit check prefers the connection's `creditLimit`.
- **Cancel** (`POST /:id/cancel`): allowed for `pending`/`packed`; **blocked if a bill exists** (`OrderHasBillError`); a packed cancel releases stock, decrements outstanding, and posts a reversing ledger entry.
- **Generate bill** (`POST /:id/bill`, `admin`/`biller`) and **initiate return** (`POST /:id/return`, `admin`).
- Order detail (`GET /:id`) returns items with `stockOnHand`, per-item `returnedQty`, the linked bill, and `creditInfo` (limit/used/available). UI modals: `ApprovePharmacyOrderModal`, `RejectPharmacyOrderModal`, `ShipOrderModal`, `RecordDeliveryModal`, `GenerateBillModal`, `InitiateReturnModal`.

### 4.5 Bills (`/bills`, `/bills/:id`)
`billService.ts`. `generateBill` is **idempotent** (unique index on `bills.order_id`, plus a `23505` short-circuit): computes GST per line, `subtotal + tax = total`, `dueDate = billDate + pharmacy.paymentTermsDays` (default 30). For portal orders it emits `bill.generated` carrying full line items so the pharmacy can mirror a **payable bill**. Status is `unpaid|partial|paid`; **overdue is derived** (`isBillOverdue` / `buildOverdueBillFilter` — `markOverdueBills` is an intentional no-op so `partial` is never clobbered). `PATCH /:id/status` (`admin`/`biller`). UI: `BillListPage`, `BillDetailPage` (`#invoice-content` printable, PDF via `lib/invoicePdf.ts` html2canvas+jsPDF, WhatsApp share). Invoice footer is a generic disclaimer — **no QR verification** (`additions.md §A`).

### 4.6 Payments received (`/payments`)
`paymentService.recordPayment` (`admin`/`biller`): validates that non-cash methods carry a **unique reference** (`DUPLICATE_REFERENCE`), then in one transaction allocates the amount **FIFO across oldest bills first** (or honors explicit `allocations`), using conditional SQL UPDATEs that recompute bill status and refuse over-allocation, decrements `pharmacies.outstanding` by the allocated sum, and posts the cash/UPI/bank ledger entry. `POST /:id/void` (`admin`) reverses allocations, restores outstanding, marks the payment `voided`, and posts the reversing entry. `GET /check-reference` supports client-side dedup. UI: `PaymentListPage`, `RecordPaymentModal`.

### 4.7 Purchases / GRN (`/purchase-bills`)
`purchaseService.ts` (stockist-only). `createPurchase` (`admin`/`biller`) resolves each line to a product (`findOrCreateProductFromLine` — creates a `General`-category product when only a name is given, sale rate 0), computes line subtotal/tax, and inserts a `pending` purchase (`GRN-YYYY-####`). Products with `saleRate <= 0` are returned as `productsNeedingSaleRate`; `POST /sale-rates` sets them (`SetSaleRatesModal`). `receivePurchase` (`POST /:id/receive`) refuses until all sale rates are set, then in a transaction calls `receiveStock` per line (FEFO-friendly batch upsert) and posts **Inventory Dr / GST-input Dr / Sundry Creditors Cr**. `POST /parse` (`admin`/`biller`, `multer` memory upload ≤10 MB) runs AI bill parsing (§9). UI: `PurchaseListPage`, `PurchaseDetailPage`, `UploadBillModal`, `EditPurchaseModal`, purchase `ledger`.

### 4.8 Suppliers & supplier payments (`/suppliers`, supplier-payments)
CRUD for `suppliers` (search, create/edit `admin`/`biller`, per-supplier `purchases` + `ledger`). `supplierPaymentService` records outbound payments (`SPAY-#####`) — `POST /` requires `admin`. UI: `SupplierListPage`, `SupplierDetailPage`, `RecordSupplierPaymentModal`.

### 4.9 Returns (`/returns`) — sales returns
`returnService.ts` (stockist-only). `createReturn` validates returnable qty against the order line minus prior returns. `processReturn` (`POST /:id/process`, `admin`) runs in a transaction with a conditional status flip (`requested → processed`): restocks only for reason `wrong_item`/`cancelled`, computes a **GST-inclusive credit**, reduces the linked bill's `paidAmount`/`total` and keeps `payment_allocations` in sync, decrements outstanding, posts the Sales-Returns ledger entry, and (portal returns) emits `return.processed` with explicit credit/allocation figures. `POST /:id/reject` records a reason and emits `return.rejected`. Returns also carry a `rejected` status in the DB. UI: `ReturnListPage`, `ReturnDetailPage`.

### 4.10 Required stock, audit logs, settings
- **Required stock** (`/required-stock` → `getRequiredStockReport`): products under `minStockLevel` with computed `deficit`.
- **Audit logs** (`/audit-logs`, `admin`): last N `audit_logs` with detail modal (`AuditLogsPage`, `AuditDetailModal`).
- **Settings** (`/settings`, `admin`): `GET/PATCH /settings/tenant` (business/GST/DL/state/phone/email + stockist marketing fields; strict Zod, GSTIN/phone/state regex, slug-collision → 409), `PATCH /settings/onboarding` (step machine, min-setup gate before `onboardingCompleted`), and **public-catalog** management (`GET`, `POST /sync`, `PATCH /:productId` visibility). UI tabs: `SettingsPage`, `ConnectionsTab`, `ApproveConnectionModal`, `RejectConnectionModal`, `CatalogSyncTab`, `PublicProfileTab`, `OrderDefaultsTab`, `AddUserModal`. `GET /settings/features` returns `{whatsapp, aiParse, whatsappConfigured}`.

---

## 5. Pharmacy Panel

The pharmacy ERP. Routes under `/pharmacy/*` behind `ProtectedRoute requiredTenantType="pharmacy"` (`PharmacyMainLayout`).

### 5.1 Dashboard & discovery
- **Dashboard** (`/pharmacy/dashboard` → `getPharmacyDashboardKpis`): retail-sale + payables oriented KPIs (`pharmacyReportService`).
- **Discover stockists** (`/pharmacy/discover`, `/discover/:slug`): browses the public catalog via the **shared public endpoints** proxied through `stockist-connections/search` and `/api/public/*` (`DiscoverStockistsPage`, `StockistPublicProfilePage`, `usePublicStockists`).
- **Connected stockists** (`/pharmacy/stockists`, `/stockists/:connectionId`): active connections, catalog browse, `ConnectStockistModal`.

### 5.2 Purchase orders (`/pharmacy/purchase-orders`)
`pharmacyPurchaseOrderService.ts` (pharmacy-only). Lifecycle enum (`PharmacyPOStatus`): **`draft → submitted → accepted/rejected → packed → shipped → delivered → partially_received → received`**, plus `cancel_requested`/`cancelled`. `createPurchaseOrder`/`updatePurchaseOrder` (draft only) price lines from the connection catalog (`PO-YYYY-####`). **`submitPurchaseOrder`** validates the connection is active, that every `stockistProductId` still exists in the catalog (`CATALOG_DRIFT`), and the connection credit limit (`getPayablesOutstanding` + PO total), then in one transaction **creates the mirror `orders` row on the stockist tenant** (`source: 'pharmacy_submitted'`, `externalPharmacyOrderId = PO.id`), copies line items, flips the PO to `submitted`, emits `order.submitted`, and — if the stockist has `autoApprovePortalOrders` — calls `approvePharmacyOrder` (rejecting on credit/stock failure). Cancel semantics are state-dependent (`cancelPurchaseOrder`): draft → local cancel; submitted-and-stockist-pending → cancel both sides + `order.cancelled`; accepted/packed → `cancel_requested` + event, finalized only on the stockist's ack. `confirmPurchaseOrderReceipt` flips shipped → delivered. UI: `PurchaseOrderListPage`, `CreatePurchaseOrderPage` (supports `?duplicateFrom=` for rejected POs — `additions.md §E`), `PurchaseOrderDetailPage`.

### 5.3 GRN — goods receipt (`/pharmacy/grn`)
`pharmacyGrnService.createGrn` (`admin`/`pharmacist`): receivable only against `delivered`/`partially_received` POs. Pre-aggregates lines per PO item, validates expiry via `validateExpiryDate` (must be after received date), then in a transaction upserts batches on `(tenant, product, batchNumber, expiry)`, records `stock_movements` (`grn_receive`), increments PO-line `receivedQty` with a **conditional over-receive guard** (`OVER_RECEIVE`), flips the PO to `received`/`partially_received`, posts **Inventory Dr / GRN_CLEARING Cr** at gross cost, auto-maps the stockist catalog item → local product, and notifies the stockist (`order.received`/`order.partially_received`). UI: `GrnListPage`, `GrnDetailPage`, `ReceiveGrnModal`.

### 5.4 Payable bills & payments (`/pharmacy/payable-bills`, `/payments`)
`payableBillService.createPayableBillFromEvent` materializes a `payable_bills` row (+ items, + ledger **GRN_CLEARING Dr / GST-input Dr / Sundry Creditors Cr**) from a `bill.generated` event, idempotent on `externalBillId`, mapping external product ids to local products. `payablePaymentService.recordPayablePayment` (`admin`/`pharmacist`) mirrors the stockist payment engine: reference dedup, FIFO allocation across oldest payable bills, conditional bill UPDATE, ledger (Creditors Dr / cash Cr), and emits **`payment.recorded`** back to the stockist (which records the reciprocal receipt). `voidPayablePayment` (`admin`) reverses and emits `payment.voided`. UI: `PayableBillListPage`, `PayableBillDetailPage` (read-only, no print/QR — `additions.md §A`), `PayablePaymentsPage`.

### 5.5 Retail POS & sales (`/pharmacy/pos`, `/sales`)
`retailSaleService.createRetailSale` (`admin`/`pharmacist`/`cashier`): the pharmacy's B2C counter. Prices lines at product `saleRate` (or an override), consumes stock **FEFO or by explicit `batchId`**, and treats prices as **GST-inclusive** (`lineTax = lineSubtotal * gst/(100+gst)`). Enforces **prescription capture (C26)** — Rx number, doctor name, patient name are required when any line is Schedule H/H1/X/NDPS (`RX_REQUIRED`). Supports split payments (cash/upi/card, must equal total within 0.02), computes change, and posts a cash-sale ledger entry. `SALE-YYYY-####`. `voidRetailSale` (`admin`) is **same-day only** (`todayIST`), restocks, and reverses the ledger. UI: `PosPage`, `SalesHistoryPage`, `SaleDetailPage`. Customers CRUD at `/pharmacy/customers` (`customerService`, `PharmacyCustomersPage`).

### 5.6 Returns to stockist (`/pharmacy/returns`)
`stockistReturnService.createStockistReturn` (`admin`/`pharmacist`): return goods to a connected stockist against a PO, a payable bill, or ad-hoc (`other` reason requires a batch). Validates returnable qty against received/bill qty minus prior returns, **maps local products to the stockist catalog** (`mapReturnItemsForStockist`), reduces local batch stock (FEFO or explicit batch), and emits `return.requested`. The stockist's `return.processed`/`return.rejected` events flip the local `stockist_returns` status (and restock on rejection). Statuses: `requested → approved/processed/rejected/cancelled`. UI: `StockistReturnListPage`, `StockistReturnDetailPage`, `InitiateStockistReturnModal`.

### 5.7 Products, inventory, reports, settings
- **Products** (`/pharmacy/products`) — shared `/api/products` router; pharmacies may create from a catalog item (`from-catalog`, resale `saleRate` defaults to MRP not cost).
- **Expiry alerts** (`/pharmacy/expiry-alerts`, `PharmacyExpiryAlertsPage`).
- **Reports** (`/pharmacy/reports/*`): sales, stock-aging, GST (admin), payables-aging (admin), profit (admin), compliance (admin) — served by `pharmacyReportService` via the shared `/reports` router branching on tenant type.
- **Settings** (`/pharmacy/settings`, admin) — `PharmacySettingsPage`, `PharmacyAddUserModal`; stockist-only marketing fields are stripped server-side for pharmacies.

---

## 6. Cross-Tenant Connections, Catalog Sync & Event Bus

The heart of the two-sided model — `connectionService.ts`, `eventService.ts`, `publicCatalogService.ts`, `lib/crossTenant.ts`.

### 6.1 Connections (`stockist_connections`)
Statuses: `pending | active | rejected | withdrawn | disconnected` (schema; the shared DTO omits `withdrawn`). A pharmacy requests a connection via **invite code**, **GSTIN search**, or **discovery** (`requestConnection`). Guards: can't self-connect, stockist must be `acceptingNewConnections`, only pharmacy tenants may request, and a **7-day cooldown** after rejection (`REQUEST_COOLDOWN`). `approveConnection` (stockist admin) sets a credit limit (default `DEFAULT_CREDIT_LIMIT = 50000` or the tenant's configured default), **creates or links a `pharmacies` row** on the stockist side (`portalConnected: true`), triggers a catalog sync, and emits `connection.approved`. `reject/withdraw/disconnect` emit the matching events. Routes in `stockist-connections.ts` gate by tenant type + role (`request/withdraw` pharmacy; `approve/reject/disconnect/sync-catalog` stockist; `pull-catalog/map` pharmacy).

### 6.2 Two catalogs
- **Connection catalog** (`stockist_catalog_items`, per active connection) — includes PTR (`saleRate`) and scheme fields; the price a specific pharmacy pays. Built by `syncCatalogToConnection` (upsert active products, delete removed ones, availability hint from stock vs `minStockLevel`). `mapCatalogLocalProduct` links a catalog item to a pharmacy-local product.
- **Public catalog** (`stockist_public_catalog_items`) — **never stores PTR/saleRate** (C12); MRP + availability only. `syncPublicCatalog` maintains it, `ensurePublicSlug` slugifies the business name, `dedupePublicStockistListings` hides duplicate public listings. Exposed via the public router (§9.3).

### 6.3 Catalog propagation
Creating/editing a stockist product calls `pushCatalogToActiveConnections`, which re-syncs every active connection catalog **and** the public catalog (currently a full re-sync; the `changedProductIds` param is a forward-looking hint, `me89`).

### 6.4 Event bus (`cross_tenant_events` + `processed_cross_tenant_events`)
`emitCrossTenantEvent(source, target, type, payload)` appends a row. `eventService.applyEvent` claims an event atomically (insert into `processed_cross_tenant_events` `onConflictDoNothing`), runs `handleEvent`, and acks (`deliveredAt`) — deleting the claim and rethrowing on handler failure so it can retry. `processPendingEvents` drains the queue for a tenant. The **client polls `POST /events/process` every 10 s** (`useEvents`, `useProcessEvents`) and invalidates the relevant query caches; `eventSyncStore` surfaces sync errors via toast.

Handled event types (`handleEvent`): `order.accepted/rejected/packed/shipped/delivered/received/partially_received/cancelled/cancel_requested`, `bill.generated`, `connection.requested/approved/rejected/disconnected/withdrawn`, `order.submitted`, `payment.recorded/voided`, `catalog.changed`, `return.requested/processed/rejected`. PO status transitions pass an **`allowedFrom` guard** so stale/replayed events can't regress state (C22).

---

## 7. Money Logic: GST, FEFO, Credit, Ledger

### 7.1 GST (`server/src/lib/gst.ts`)
`computeGst(lines, sellerState, buyerState)`: `isInterstate = sellerState !== buyerState`. Per line `tax = round2(lineSubtotal * gstRate/100)`. **Intra-state:** `cgst = round2(tax/2)`, `sgst = round2(tax - cgst)` (symmetric split, no paisa drift). **Inter-state:** the whole `tax` goes to `igst`. `round2(n) = Math.round(n*100)/100`. Valid rates: `0, 5, 12, 18, 28` (`shared/constants.ts`). Order/bill lines are GST-**exclusive**; retail POS lines are GST-**inclusive** (§5.5).

### 7.2 FEFO inventory (`server/src/lib/inventory.ts`)
`reserveStock` selects non-expired batches (`qtyOnHand > 0`, `expiryDate > asOfDate`) ordered by **expiry asc, then receivedAt asc** (FEFO). It decrements each batch with an **atomic conditional UPDATE** (`qtyOnHand >= take`) and, if a row was consumed concurrently, **recurses** with the remaining qty. Throws `InsufficientStockError` (→ HTTP 409) when total available `< qty`. Every mutation writes a `stock_movements` row (`recordStockMovement`, `lib/stockLedger.ts`) with a reason and ref. `receiveStock` upserts a batch on `(tenant, product, batchNumber, expiry)`. `releaseStock` adds qty back (restock/void). `getProductStock` sums only non-expired batches. Displayed `currentStock` (products route) mirrors this by excluding expired batches.

### 7.3 Double-entry ledger (`server/src/lib/ledger.ts`)
`postEntry` inserts a balanced `ledger_entries` + `ledger_lines` set; it **throws on imbalance** (`|Σdebit − Σcredit| > 0.01`) and can run inside a caller's transaction (`dbClient`) so ledger writes roll back atomically. 16 seeded accounts (`seedLedgerAccounts` / `LEDGER_ACCOUNT_CODES`): CASH, BANK, UPI_SUSPENSE, SUNDRY_DEBTORS, SUNDRY_CREDITORS, INVENTORY, **GRN_CLEARING**, SALES, SALES_RETURNS, PURCHASES, and CGST/SGST/IGST OUTPUT + INPUT. GRN_CLEARING is the suspense bucket that reconciles the pharmacy's GRN (Inventory Dr / GRN_CLEARING Cr) against the later payable bill (GRN_CLEARING + GST-input Dr / Creditors Cr).

### 7.4 Credit exposure (`orderService.getPharmacyExposure`)
Exposure = **unpaid bill balances** (`Σ max(0, total − paid)`) **+ in-flight approved-but-unbilled orders** (pending/packed/shipped with `approvedAt`, no linked bill). Credit orders are refused when `exposure + orderTotal > creditLimit` at **create, finalize, and approve** time; the connection's `creditLimit` takes precedence over the pharmacy record's. `pharmacies.outstanding` is a denormalized aggregate kept in sync (and reconcilable via `/pharmacies/:id/reconcile-outstanding`).

### 7.5 Numbering (`server/src/lib/ids.ts`)
Per-tenant sequences derived by count/max-scan: `ORD-YYYY-####`, `INV-YYYY-####`, `PAY-#####`, `RET-####`, `GRN-YYYY-####`, `SPAY-#####`, `PO-YYYY-####`, `PGRN-YYYY-####`, `SALE-YYYY-####`, `PPAY-#####`, `SRET-####`. Order/PO creation retries on unique-key collision.

---

## 8. Reports & Analytics

Served by the shared `/api/reports` router, branching on tenant type (`reportService.ts` for stockist, `pharmacyReportService.ts` for pharmacy). Roles: dashboard = any; sales/stock-aging/required-stock = `admin`/`biller`/`pharmacist`; outstanding/gst/compliance/profit/portal-orders/purchase-analysis = `admin`.

| Report | Endpoint | Logic of note |
|--------|----------|---------------|
| Dashboard | `/reports/dashboard` | §4.1 (stockist) / retail+payables (pharmacy). |
| Sales | `/reports/sales` | Daily totals, top products, top pharmacies, by-category, summary (avg order value); pharmacy → retail sales. |
| Outstanding / Payables aging | `/reports/outstanding` | Aging buckets (current/30/60/90/90+), top defaulters, per-bill age from `dueDate`. |
| GST | `/reports/gst` | Sales CGST/SGST/IGST + **purchase ITC** (intra/inter split by supplier vs tenant state) + per-rate breakdown. |
| Stock aging | `/reports/stock-aging` | Per-batch age from `receivedAt`, value = qty × purchaseRate, 0-30/31-60/61-90/90+ buckets. |
| Required stock | `/reports/required-stock` | Under-min products + deficit. |
| Compliance | `/reports/compliance` | Schedule H/H1/X/NDPS (or `all`) dispensing register with pharmacy DL, batch, bill number. |
| Profit | `/reports/profit` | COGS from batch (fallback product) `purchaseRate`; gross profit, margin %, by-category. |
| Portal orders | `/reports/portal-orders` | Approval rate (approved/(approved+rejected)), status counts, top pharmacies. |
| Purchase analysis | `/reports/purchase-analysis` | Total spend, supplier count, top suppliers. |

UI: `reports/ReportsHub` + one component per report; pharmacy mirror under `pharmacy-panel/reports/`. Charts use **Recharts**; export via `lib/exportUtils.ts`.

---

## 9. AI, WhatsApp & External Integrations

### 9.1 AI bill parsing (`aiParseService.ts`, `@google/genai`)
`POST /api/purchases/parse` (multer memory upload) → `parseInvoiceWithAi`. Requires `GEMINI_API_KEY`; uses model **`gemini-2.0-flash`** with a strict JSON extraction prompt (supplier, invoice no/date, and line items with batch/expiry/qty/mrp/purchaseRate/gstRate). It strips markdown fences, JSON-parses, sanitizes numerics, and **fuzzy-matches** each `productName` against the tenant catalog (exact then substring) to attach a `productId`. Gated behind `FEATURE_AI_PARSE` on the client via `/settings/features`. (Note: the model is `gemini-2.0-flash`, single-model, no fallback.)

### 9.2 WhatsApp (`whatsappService.ts`)
`POST /api/communication/send-bill` (auth) — gated by `FEATURE_WHATSAPP` + `WHATSAPP_TOKEN`/`WHATSAPP_PHONE_ID`. The **client** renders the invoice DOM to a PDF (`invoicePdf.ts`) and posts base64; the server normalizes the pharmacy phone (adds `+91`), uploads the PDF to the Meta Graph API (`graph.facebook.com/v20.0`), and sends it as a document message. Returns 502 on Graph failure.

### 9.3 Public catalog API (`routes/public.ts`)
Unauthenticated, IP rate-limited 60/min: `GET /api/public/stockists` (list, filter by state/category/q; dedupes listings), `/stockists/:slug` (profile + sample products + partner/product counts), `/stockists/:slug/catalog` (paginated public catalog, page size capped at 20, **no PTR**).

### 9.4 Database (`db/client.ts`, `db/migrateInline.ts`)
`getDb` lazily creates a singleton Drizzle client. `DATABASE_URL` defaults to **`pglite:memory`** (embedded in-process Postgres); `pglite:<path>` persists to disk; any other URL uses `pg` `Pool`. On boot (`index.ts`) the server connects, runs an inline migration, and listens on `env.PORT` (default 4000). Helmet is on (CSP disabled), CORS allows credentials, JSON limit 10 MB.

---

## 10. Client Architecture & Routing

- **Entry** (`App.tsx`): `QueryProvider` (TanStack Query) → `react-hot-toast` `Toaster` → `BrowserRouter` → `SessionExpiredRedirect` + `AppRoutes`.
- **Routing** (`routes/index.tsx`): all pages are `React.lazy` under `<Suspense>`. Two shells — `PharmacyMainLayout` for `/pharmacy/*` and `MainLayout` for `/*` — each wrapped by `ProtectedRoute` with the right `requiredTenantType`. Legacy `/pharmacy/login|register` redirect to the unified `/login|/register`. Per-route role wrappers: `admin(...)`, `billerReports(['admin','biller'])`, `pharmPlus(['admin','pharmacist'])`, `cashierPlus(['admin','pharmacist','cashier'])`.
- **State:** Zustand `authStore` (user/initialized/pendingAuthRedirect/logout), `eventSyncStore` (last sync error), `store/uiStore`. Server state via TanStack Query hooks (`hooks/use*.ts`, one per domain) hitting the axios `api` client (`baseURL:/api`, `withCredentials`). Vite dev proxies `/api` → `http://localhost:4000`.
- **Libs:** `lib/gstClient.ts`, `money.ts`, `formatters.ts` (₹ `en-IN`), `expiry.ts`, `csvParse.ts`, `invoicePdf.ts`, `exportUtils.ts`, `panel.ts`/`nav.ts` (panel routing), `tenantSettings.ts`, `validation.ts`. Common UI kit under `components/common/*` (Table, Modal, SlideOver, StatCard, Pagination, Badge, BottomNav/Sidebar/Header, etc.). Charts via Recharts.

---

## 11. API Surface (Routes ↔ Services)

All mounted under `/api` (`server/src/index.ts`). "Tenant" = router-level `requireTenantType`.

| Base path | Tenant | Backing service(s) | Notable endpoints |
|-----------|--------|--------------------|-------------------|
| `/auth` | — | `userService` | register, login, logout, me, forgot/reset-password |
| `/public` | — (public) | `publicCatalogService` | stockists, stockists/:slug, :slug/catalog |
| `/pharmacies` | stockist | `orderService`, pharmacy queries | CRUD, :id/{orders,bills,outstanding-bills,credit-info,returns,ledger}, reconcile-outstanding |
| `/suppliers` | stockist | inline + `purchaseService` | CRUD, :id/{purchases,ledger} |
| `/products` | shared | products route, `connectionService` | list/export/categories, CRUD, :id/batches, adjust-stock, from-catalog/:id |
| `/orders` | stockist | `orderService`, `billService`, `returnService` | CRUD, finalize, ship, deliver, approve, reject, cancel(-approved), bill, return |
| `/bills` | stockist | `billService` | list, :id, :id/status |
| `/payments` | stockist | `paymentService` | list, :id, check-reference, create, :id/void |
| `/supplier-payments` | stockist | `supplierPaymentService` | list, create |
| `/purchases` | stockist | `purchaseService`, `aiParseService` | list, :id, :id/ledger, create, sale-rates, parse (AI), :id/receive, PATCH :id |
| `/returns` | stockist | `returnService` | list, :id, :id/process, :id/reject |
| `/reports` | shared | `reportService` / `pharmacyReportService` | dashboard, sales, outstanding, gst, stock-aging, required-stock, compliance, profit, portal-orders, purchase-analysis |
| `/audit-logs` | shared (admin) | inline | list, :id |
| `/users` | shared (admin) | `userService` | list, create, PATCH :id (last-admin/self guards), change-password |
| `/system` | shared (admin) | inline | health |
| `/settings` | shared | inline + `publicCatalogService` | features, tenant, onboarding, public-catalog(/sync/:productId) |
| `/stockist-connections` | shared | `connectionService` | list, search, by-stockist/:id, :id, request, withdraw, approve, reject, disconnect, sync-catalog, pull-catalog, :id/catalog, catalog/:item/map |
| `/communication` | shared | `whatsappService`, `billService` | send-bill |
| `/purchase-orders` | pharmacy | `pharmacyPurchaseOrderService` | CRUD, submit, cancel, confirm-receipt |
| `/grn` | pharmacy | `pharmacyGrnService` | list, :id, create |
| `/payable-bills` | pharmacy | `payableBillService` | list, :id |
| `/payable-payments` | pharmacy | `payablePaymentService` | list, create, :id/void |
| `/retail-sales` | pharmacy | `retailSaleService` | list, :id, create, :id/void |
| `/customers` | pharmacy | `customerService` | CRUD |
| `/events` | shared | `eventService` | list, history, process, :id/apply |
| `/stockist-returns` | pharmacy | `stockistReturnService` | list, :id, create |

---

## 12. Data Model

Drizzle schema in `server/src/db/schema.ts`. All money is `numeric(14,2)` stored as strings; nearly every business table carries `tenantId` with a `(tenantId, id)` unique index for tenant scoping. Grouped:

- **Auth / tenancy:** `tenants` (type, stateCode, gstin, dlNumber, addressJson, notificationsJson, inviteCode, onboarding fields, public listing/slug/coverage/categories/logo), `users` (role enum, isActive, lastLoginAt; unique `(tenantId,email)`), `refresh_tokens`, `password_reset_tokens`.
- **Masters:** `suppliers`, `pharmacies` (creditLimit, paymentTermsDays, outstanding, openingBalance, portalConnected, pharmacyTenantId), `products` (schedule type, pack/base/sale units, convFactor, gstRate, mrp/purchase/sale rates, minStockLevel, scheme fields), `product_batches` (batchNumber, expiryDate, qtyReceived, qtyOnHand, sourcePurchaseId; unique on `(tenant,product,batch,expiry)`).
- **Stockist transactions:** `purchases` + `purchase_items`; `orders` (status, source, paymentMode, isInterstate, placeOfSupply, tracking, submittedAt/approvedAt/approvedBy, externalPharmacyOrderId, stockistConnectionId) + `order_items`; `bills` (**unique on order_id**, CGST/SGST/IGST, paidAmount, status, dueDate indexed) + `bill_items`; `payments` + `payment_allocations`; `supplier_payments`; `returns` (reason/status incl. `rejected`) + `return_items`.
- **Inventory ledger:** `stock_movements` (delta, reason enum, refType/refId/refNumber, performedBy) — the canonical mutation log (C24).
- **Pharmacy transactions:** `pharmacy_purchase_orders` (11-state status enum, externalOrderId, tracking) + `pharmacy_purchase_order_items` (catalogItemId, stockistProductId, receivedQty); `pharmacy_grns` (`received`/`partial`) + `pharmacy_grn_items`; `customers`; `retail_sales` (payment method, split-payment JSON, amountReceived/change, void fields, **Rx/doctor/patient fields**) + `retail_sale_items` (discountPercent, GST-inclusive lines); `payable_bills` (externalBillId/externalOrderId, purchaseOrderId, GST fields, status) + `payable_bill_items`; `payable_payments` + `payable_payment_allocations`; `stockist_returns` (status incl. `approved`/`rejected`, payableBillId) + `stockist_return_items`.
- **Cross-tenant:** `stockist_connections` (status, requestSource, credit/terms, connectedAt/disconnectedAt; unique per stockist+pharmacy), `stockist_public_catalog_items` (no PTR), `stockist_catalog_items` (per connection, with PTR + localProductId mapping), `cross_tenant_events` (source/target/type/payload/deliveredAt), `processed_cross_tenant_events` (idempotency claim).
- **Ledger:** `ledger_accounts` (code/name/type, unique per tenant+code), `ledger_entries` (txnDate/refType/refId/narration), `ledger_lines` (accountId, partnerType/partnerId, debit/credit).
- **Audit:** `audit_logs` (action, entityType/Id, before/after JSON, ip, userAgent).

**Enums (`shared/types.ts`):** `TenantType`, `Role`, `PharmacyRole`, `OrderSource`, `ConnectionStatus`, `AvailabilityHint`, `PharmacyPOStatus`, `OrderStatus`, `BillStatus`, `PaymentMethod`, `PaymentStatus`, `ReturnStatus`, `PurchaseStatus`, `PartnerStatus`, `ScheduleType`, `LedgerRefType`, `AccountType`. **Constants (`shared/constants.ts`):** `INDIA_STATE_CODES`, `GST_RATES`, `SCHEDULE_TYPES`, `LEDGER_ACCOUNT_CODES`, `DEFAULT_CREDIT_LIMIT = 50000`, page-size defaults.

---

## 13. Cross-Cutting Conventions

- **Currency:** `₹` formatted `en-IN` with 2 fraction digits (`lib/money.ts`/`formatters.ts`).
- **Dates:** business dates stored as `YYYY-MM-DD` text; `todayIST()` (Asia/Kolkata) governs same-day void rules; `validateExpiryDate` accepts `YYYY-MM`, `YYYY-MM-DD`, or `MM/YY` and normalizes to the last day of the month.
- **Transactions & idempotency:** every stock/ledger/status mutation runs in a Drizzle transaction with conditional UPDATEs (status flips, allocation guards, over-receive/over-allocate) to survive concurrency; ledger writes thread the tx so they roll back together; bills are idempotent per order; events are claimed once via `processed_cross_tenant_events`.
- **Feature flags:** `FEATURE_AI_PARSE`, `FEATURE_WHATSAPP` (+ credential presence) surfaced through `GET /settings/features`.
- **Data isolation:** all queries filter by `tenantId`; cross-tenant reads never happen — the peer tenant is reached only by emitting an event that its own service applies to its own tables.
- **Auth posture varies by router:** JWT+cookie everywhere except the intentionally public `/api/public/*` (Zod-free reads, IP rate-limited) and the auth endpoints (rate-limited, audited).

---

## 14. Known Stubs, Placeholders & Gaps

Tracked against the code (see `additions.md`, audited 2026-06-30):

- **Bill QR verification — Missing.** Bills print/PDF/WhatsApp fine, but there is no QR image, no verification copy, no `/verify` route/API/schema, and no QR dependency. Pharmacy-side payable bills have no print/PDF/QR at all.
- **Multi-step registration — Missing.** Both stockist and pharmacy signup are a single form; PAN, WhatsApp, city, own PIN, serviceable pin codes, document uploads, and bank details are not collected (`RegisterPage.tsx`, `RegisterSchema`).
- **Platform admin panel — Missing.** The `admin` role is a *tenant* admin only; there is no cross-tenant/super-admin app, KYC/moderation queue, or global user/tenant listing.
- **Copy/duplicate order — Partial.** Pharmacy PO detail offers "Duplicate to Draft" **only for rejected POs** with no confirm dialog; the stockist `OrderDetailPage` has no duplicate action or server endpoint.
- **AI bill parsing** uses a single model (`gemini-2.0-flash`) with no fallback and is a no-op unless `GEMINI_API_KEY` is set; it fuzzy-matches products by name only.
- **WhatsApp** relies on the client to rasterize the invoice to a PDF; it is disabled without `FEATURE_WHATSAPP` + Meta credentials.
- **Overdue status** is intentionally derived, not persisted — `markOverdueBills`/`markOverduePayableBills` are deliberate no-ops so `partial` isn't clobbered; the UI computes "overdue" from `dueDate < today`.
- **Refresh tokens** exist in schema and are revoked on password change/deactivation, but there is no refresh endpoint — sessions rely on the 24 h access cookie plus the server-side `updatedAt > iat` invalidation check.
- **Catalog push** (`pushCatalogToActiveConnections`) currently full-re-syncs every active connection + the public catalog; the `changedProductIds` delta hint is accepted but not yet used.

---

*Generated from source: `server/src/index.ts`, `server/src/routes/*`, `server/src/services/*`, `server/src/lib/*` (gst, inventory, ledger, stockLedger, ids, expiry, businessDate, crossTenant, cookies), `server/src/middleware/*`, `server/src/db/schema.ts`, `shared/{types,constants}.ts`, `client/src/App.tsx`, `client/src/routes/index.tsx`, `client/src/{stores,hooks,api}/*`, `client/src/components/**`, and the three `package.json` workspaces + `vite.config.ts`. Cross-checked against `additions.md`.*
