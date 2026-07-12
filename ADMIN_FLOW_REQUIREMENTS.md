# Platform Admin — Flow Requirements

> Extracted from `PROJECT_FLOW_REQUIREMENTS.md`, per-app reviews, and `digi-swasthya-hub/docs/user-flows-admin.md`.  
> **Scope:** **Platform / governance admin only** — not stockist operations, not pharmacy operations, not tenant-scoped staff admin (`SP` stockist/pharmacy `admin | biller | pharmacist | cashier`).

**Currency:** ₹ throughout.

---

## 1. What counts as “Admin” here

| Kind | Role / account | Apps | In scope? |
|------|----------------|------|-----------|
| **Platform admin** | `app_role = admin` in Supabase apps; hidden login in HUB/MVP | ERP, HUB, MR, MVP, DSW, DMVP | ✅ Yes |
| **Platform super-admin** | `platform_users.role = super_admin`; `/platform/*` | SP, digiswasthya-platform, stockpharma-unified | ✅ Yes |
| **Tenant staff admin** | Per-tenant `users.role = admin` (Settings, staff, audit) | SP only | ❌ No |
| **Stockist / pharmacy user** | Any stockist or pharmacy panel | All | ❌ No |

**Admin role superset (platform):** governs registrations, users, orders (oversight), compliance, communications, platform config, analytics, audit — across tenants and roles (stockist, pharmacy, doctor, customer, MR where applicable).

---

## 2. Canonical admin journey

```
Admin login (dedicated page or hidden reveal)
  → Dashboard (platform KPIs)
  → Review pending registrations (approve / reject, per-doc where applicable)
  → User management (search, suspend, verify, impersonate, force-reset)
  → Order & payment oversight (B2B + B2C; status override where supported)
  → Returns / refunds / counterfeit / recalls
  → Communications (broadcast, targeted, support chat)
  → Platform configuration (schedules, categories, serviceable areas, fees, banners, maintenance)
  → Analytics, audit trail, system architecture (Flowboard)
```

**Flow IDs (auth-related):**

| Flow ID | Name | Steps | Apps |
|---------|------|-------|------|
| AUTH-06 | Admin hidden reveal | 5-tap logo within 1.5s → Admin role option → credentials | HUB, MVP |
| — | Dedicated admin login | Email + password → role check → dashboard | ERP, MR, DSW, DMVP, SP `/platform/login` |
| — | Admin self-registration | User type Admin + password gate `jit@ADMIN1` + mandatory doc | MR only |

---

## 3. Authentication & session flows

### 3.1 Login paths

| App | Entry | Steps | Post-login |
|-----|-------|-------|------------|
| **HUB** | `/login` | 5-tap logo (<1500ms) → select Admin → email/password → `user_roles.admin` → rate limit RPC → approval N/A for admin | `/admin` |
| **ERP** | `/login` | Admin not on public signup; admin users use login with admin role (no self-register) | `/admin` |
| **MVP** | `/admin-login` or 5× logo tap on unrouted Login | Demo login always succeeds | Admin dashboard |
| **DSW** | `/auth` ghost “Admin Login” or `/admin/dashboard` | Inputs ignored in demo; navigates to admin home | `/admin/dashboard` |
| **DMVP** | Hardcoded admin persona | No guards; `admin` = Platform Admin | `/admin` |
| **MR** | Signup with Admin type + `jit@ADMIN1` OR existing admin login | `/onboarding` omits admin | `/` → AdminDashboard |
| **SP / unified** | `/platform/login` | `POST /api/platform/login` → bcrypt → httpOnly JWT `accountKind: platform`, `role: super_admin` | `/platform/dashboard` |

**Admin creation (bootstrap):**

- **HUB / DMVP:** `seed-admin` edge function (one-time).
- **SP / unified:** Boot-seed from env `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD`, `PLATFORM_ADMIN_NAME` → `platform_users` row.

### 3.2 Session & route protection

| App | Guard | Behavior |
|-----|-------|----------|
| **ERP** | `AdminRoute` | Re-queries `user_roles` server-side every mount; non-admin → `/not-authorized` |
| **HUB** | `ProtectedRoute role="admin"` | ~56 child routes under `/admin` |
| **MR** | `ProtectedRoute` (login only) | Real enforcement via RLS + edge functions |
| **MVP / DSW / DMVP** | Weak or none | Role is nav choice; many actions toast-only |
| **SP** | `AccountProtectedRoute accountKind="platform"` | `GET /auth/me` validates `accountKind === platform` |

### 3.3 Password & account ops (admin-initiated)

| Flow | Steps | Apps |
|------|-------|------|
| Force password reset | Admin enters user email → `resetPasswordForEmail` | HUB |
| Impersonate (view-only) | Search user → view as user (read-only) | HUB |
| Merge accounts | Re-point notifications + login_activity from secondary to primary email | HUB |
| Forgot password | Standard reset email flow | ERP, HUB, MR, SP (tenant auth; platform uses same pattern if implemented) |

---

## 4. Registration approval flows

Platform admin approves **other roles’** registrations — not admin self-service signup (except MR gate).

### 4.1 HUB — primary reference implementation

**Entities:** stockist, pharmacy, doctor (customer is auto-active, no admin approval).

**List flows** (`/admin/stockists`, `/admin/pharmacies`, `/admin/doctors`):

1. List with `approval_status` badge, search, filter.
2. **Bulk approve / bulk reject** (client loop over selected rows).
3. Navigate to detail.

**Detail flows** (`/admin/stockists/:id`, `/admin/pharmacies/:id`, `/admin/doctors/:id`):

1. View profile + documents (iframe viewer).
2. **Per-document approval:** set doc field status on profile (Drug License, GST, Business Registration, MR Agreement, Pharmacy Certificate, Medical Council Certificate, ID Proof).
3. **Overall approval:** `approval_status = approved` when ready.
4. **Rejection:** typed `rejection_reason` required → `approval_status = rejected` → notification to user.

**Stockist registration constraint (admin-configured):** PIN must exist in `admin_serviceable_areas` (active) before stockist can register.

### 4.2 ERP — pharmacy registration (dual approval)

**Path:** Public `/pharmacy-registration` → `pharmacy_registration_requests{status:pending}`.

**Admin flow** (`/admin/pharmacy-approvals`):

1. Realtime table of all requests.
2. **Approve as Admin** → sets `admin_approved`; if `stockist_approved` already true → `status=approved` + insert `pharmacy_details`.
3. **Reject** → requires `rejection_reason`.

*(Stockist-side approval on the same request is out of scope here — platform admin only needs the admin leg.)*

### 4.3 MVP — Approval Center

1. List pending stockists/pharmacists.
2. Actions: Verify, Reject, Request Update (real state changes).
3. Suspend toggles `approval_status` to `rejected` (no `suspended` enum used).

### 4.4 DMVP — approval queues

1. Bulk Approve/Reject on list (no reason on bulk).
2. Detail: reject requires reason + notification; per-doc `updateDocStatus`.

### 4.5 SP / unified — tenant approval

1. `GET /platform/tenants?approvalStatus&tenantType` (newest, cap 200).
2. `PATCH /platform/tenants/:id/approval { status: approved | rejected }` → `tenants.approvalStatus`.
3. **Gap:** informational only — not enforced at tenant login; no KYC doc review UI.

---

## 5. User management flows

| Capability | Flow | Apps | Maturity |
|------------|------|------|----------|
| User directory | Search/filter by role, email, name; paginated list | ERP, HUB, MR, MVP, DSW, DMVP | HUB/ERP/MR real; DSW/MVP toast |
| Verify / unverify | Toggle `is_verified` on profile | MR | ✅ |
| Suspend / restore | Toggle `approval_status` or suspend flag | HUB (`AdminUsers`), DMVP | ✅ HUB |
| Activate / deactivate | Toggle active status | ERP | ⚠️ Audit-log only; not persisted |
| User detail | Role-specific profile, docs, orders, message link | HUB (per-role detail pages) | ✅ |
| Role audit | Distribution + full user table + XLSX export | MR `/admin/role-audit` | ✅ |
| Danger zone wipe | Type confirm phrase → wipe all users/data | MR `admin-wipe` edge fn | ✅ MR only |

**HUB `AdminUsers`:** aggregates stockist + pharmacy + doctor + customer profiles; customers exempt from suspend; links to role detail routes.

---

## 6. Order, payment & finance oversight

### 6.1 B2B orders

| Step | Detail | Apps |
|------|--------|------|
| List all orders | Filter status, date, B2B tab | HUB, DSW (mock), DMVP |
| Order detail | View lines, parties, timeline | HUB |
| Status override | `admin_override_order_status(p_order_id, p_new_status)` RPC | HUB, DMVP (RPC no-op in mock) |

### 6.2 B2C customer orders

| Step | Detail | Apps |
|------|--------|------|
| List | `/admin/customer-orders` | HUB, DSW |
| Detail + override | `admin_override_customer_order_status` RPC | HUB |
| Refunds | Refund state machine on cancelled paid orders: pending → approved → rejected → processed | HUB `/admin/refunds` |

### 6.3 Payments & bills (read-mostly)

| Screen | Purpose | Apps |
|--------|---------|------|
| `/admin/payments` | B2B payments + B2C orders as payment records | HUB |
| `/admin/bills` | All B2B bills read-only | HUB, DMVP (GST sum real) |
| `/admin/commissions` | Doctor commission earnings | HUB (read-only) |
| `/admin/platform-invoice` | Hypothetical monthly platform commission invoice (display-only) | HUB |
| `/admin/revenue-detail` | B2B + B2C delivered revenue trends | HUB |

### 6.4 Returns

- **HUB `/admin/returns`:** all return requests, filter by status, read-only detail.
- **ERP:** admin does not own returns module (stockist/pharmacy flows).

---

## 7. Compliance & safety flows

### 7.1 Document verification (ERP)

**Route:** `/admin/documents`

1. Queue: `pharmacy_documents` joined to pharmacy.
2. Review dialog: **Verify** or **Reject** (reason required).
3. Sets `verification_status`, `verified_at`, `verified_by`.

### 7.2 Batch recalls (ERP)

**Route:** `/admin/recalls`

1. **Create recall:** Batch #, product, manufacturer, severity (critical/high/medium/low), reason, instructions → `RCL-{timestamp}`, status `active`.
2. **Impact search:** RPC `search_users_by_batch_code` → stockists (products) + pharmacies (order history).
3. **Mark resolved** on active recalls.
4. Optional: targeted **notices** with `target_batch_codes` (see §8.2).

### 7.3 Counterfeit alerts (HUB)

**Route:** `/admin/counterfeit`

1. Create/toggle `counterfeit_alerts`.
2. Fuzzy-match products/inventory → notify affected users.
3. Enforced in MVP cart/order when flagged.

### 7.4 Disputes (ERP)

**Route:** `/admin/disputes`

1. List disputes (open → in_progress → resolved → closed → escalated).
2. Assign resolution text; mark resolved with `resolved_at`.
3. **Gap:** no user-facing “raise dispute” UI — rows created externally.

### 7.5 License expiry nudges (HUB)

**Route:** `/admin/license-expiry`

1. List stockists/pharmacies with `drug_license_expiry`.
2. Per-row **Send Notification** → insert `notifications` row.

### 7.6 Reviews moderation (HUB)

**Route:** `/admin/reviews` — read-only `customer_reviews` (no delete/moderate action).

---

## 8. Communications flows

### 8.1 Broadcast & targeted notifications

**HUB `/admin/notifications`:**

1. **Broadcast:** title + message + type → batches of 100 users.
2. **Targeted:** `admin_send_targeted_notification(p_user_id, p_title, p_message)` RPC.
3. Target roles: All / Stockists / Pharmacies / Customers / Doctors.
4. View history.

**ERP `/admin/notices`:**

1. Create notice: title, content, type (announcement/alert/update/warning/recall), priority.
2. **Granular targeting:** role, batch codes, PIN codes, states, districts (comma-separated → arrays).
3. RPC `distribute_notice_to_users` → fan-out to `user_notice_recipients`.
4. Toggle `active`; optional expiration datetime.

**DMVP:** same broadcast/targeted pattern; chunks of 100.

### 8.2 Message templates (ERP)

**Route:** `/admin/templates`

- CRUD `message_templates`: name, type (email/sms/whatsapp), subject, body with `{variable}` placeholders.
- **Gap:** not wired to any sender in UI.

### 8.3 Campaigns (ERP)

**Route:** `/admin/campaigns`

- CRUD promotional/informational/reminder campaigns; target audience; schedule.
- **Send Now** → status `sent` (stamp only).

### 8.4 Support & chat

| Flow | Steps | Apps |
|------|-------|------|
| Support inbox | List conversations → open thread → reply as `sender_type: admin` | HUB `/admin/messages`, MR `/admin/support` |
| Ticket triage | Inline status select (open → in_progress → resolved → closed) | MR |
| Chat oversight | Read support + peer conversations | HUB |
| Quick questions CRUD | Feeds chat-bot fuzzy match | HUB (in Settings hub) |

---

## 9. Platform configuration flows

### 9.1 Reference data CRUD (HUB)

Pattern: list → inline create → toggle `is_active` → delete.

| Route | Entity | Consumed by registration/forms? |
|-------|--------|----------------------------------|
| `/admin/drug-schedules` | `drug_schedules` | ⚠️ Admin reference only (forms use hardcoded constants) |
| `/admin/product-categories` | `product_categories` | ⚠️ Same |
| `/admin/pharmacy-categories` | pharmacy categories | ⚠️ Same |
| `/admin/specializations` | doctor specializations | ⚠️ Same |
| `/admin/serviceable-areas` | `admin_serviceable_areas` PIN/city/state | ✅ Stockist registration PIN gate |
| `/admin/subscriptions` | `subscription_plans` | ❌ No purchase/enforcement |
| `/admin/banners` | `platform_banners` | ❌ No client renderer |

### 9.2 Platform settings hub (HUB `/admin/settings`)

1. **Logo upload** → `platform` bucket → `platform_settings.logo_url` (TopNav).
2. Generic key-value upsert into `platform_settings`.
3. **Platform commission %** (`platform_commission_pct`).
4. **GST rate per category** (`gst_rate_{category}`) — read by Platform Invoice; checkout still hardcodes 5%.
5. Payment-method toggles (display saved; checkout may not honor).
6. **Quick questions** CRUD (question, answer, category).

### 9.3 Territories & fees (ERP)

| Route | Flow |
|-------|------|
| `/admin/territories` | CRUD territories (name, state, district, PIN array) + read-only stockist service areas view |
| `/admin/fees` | CRUD `platform_fees` (% or fixed, applies to stockist/pharmacy/both) — **fees never applied to orders in code** |

### 9.4 Maintenance & legal (HUB)

| Route | Flow | Enforced? |
|-------|------|-----------|
| `/admin/maintenance` | Store maintenance flag + message | ❌ Flag not enforced app-wide |
| `/admin/tos-management` | ToS / Privacy URLs in settings | Display links only |

### 9.5 ERP Settings “Manage” tab (admin-only on `/settings`)

- Edit `platform_settings.app_info` (name, version, tagline, developer, email, copyright).
- Per-role announcement banners: stockist, pharmacy, patient, brand, mr (title, message, show_banner).

---

## 10. Analytics, reporting & audit flows

### 10.1 Dashboard KPIs

**Common metrics (where implemented):**

- Total / pending stockists, pharmacies, doctors, customers
- Pending approvals (by entity type)
- B2B + B2C order counts
- Revenue (delivered orders sum)
- New registrations today; revenue today vs yesterday
- Active consultations; counterfeit alerts; DAU

**HUB:** 13 clickable KPIs with drill-down; recharts (6-mo revenue, B2C status pie, top pharmacies); **System Health hardcoded “Operational”**.

**ERP:** Quick stats + 11-module nav grid; realtime admin notifications (disputes, documents, recalls).

### 10.2 Analytics pages

| Route | Content | Apps |
|-------|---------|------|
| `/admin/analytics` | KPI grid + drill-down panel (HUB); stat cards + placeholder charts (ERP) | HUB, ERP, MVP, DSW, DMVP |
| `/admin/enhanced-analytics` | Extra KPIs (not linked from ERP dashboard) | ERP |
| `/admin/revenue-detail` | Period B2B/B2C revenue + charts | HUB |
| `/admin/geo-distribution` | State/city tallies across profile tables | HUB |
| `/admin/system-report` | Whole-platform counts + client download | HUB |
| `/admin/export` | Per-table XLSX export (limit 5000 rows) | HUB |
| `/admin/reports` | Summary + export toasts | DSW (stub) |

### 10.3 Audit & activity

| Route | Source | Apps |
|-------|--------|------|
| `/admin/audit-logs` | `audit_logs` (last 100) | ERP |
| `/admin/audit-trail` | `admin_audit_log` | HUB |
| `/admin/activity-log` | `login_activity` | HUB |
| `/admin/login-history` | `login_attempts` | HUB, DMVP (empty in mock) |
| `/admin/active-users` | Deduped recent `login_activity` | HUB |
| `/admin/api-monitoring` | 7-day operation counts; health hardcoded | HUB |

**ERP realtime admin alerts:** `useAdminNotifications` on INSERT to disputes, pharmacy_documents, batch_recalls (in-memory badge, not persisted).

---

## 11. System architecture (Flowboard) — HUB

**Route:** `/admin/system-architecture`

1. Load static v5.0.0 dataset from `flowboard-data` edge function (16 tabs).
2. Views: screens, routes, entities, APIs, flows, dependencies, system graph, etc.
3. **Architecture AI:** `architecture-ai` edge fn — Q&A about architecture (Bearer auth).

**MVP equivalent:** `UserFlowPage` — static documentation of idealized backend (not live).

---

## 12. Consultations oversight (HUB)

| Route | Flow |
|-------|------|
| `/admin/consultations` | List all consultations; filter status |
| `/admin/consultations/:id` | Patient + doctor cards; prescriptions; **Admin Override Status** on `consultations.status` (direct update, not RPC) |

---

## 13. Delivery staff roster (HUB)

**Route:** `/admin/delivery-staff`

- Read-only merge of `delivery_staff` (stockist-side) + `pharmacy_delivery_staff` with business names and active badges.
- Admin does not create staff here (stockist/pharmacy admins create credentials).

---

## 14. SP platform super-admin flows (detailed)

### 14.1 Login & dashboard

1. `/platform/login` → email/password.
2. `/platform/dashboard` — StatCards from `GET /platform/stats`: totalTenants, stockists, pharmacies, pendingApprovals.

### 14.2 Tenant approvals

1. `/platform/tenants` or `/platform/approvals` (same page).
2. Table: business name, tenant type, email, approval status.
3. **Approve** / **Reject** → `PATCH /platform/tenants/:id/approval`.
4. Optional drill: `GET /platform/tenants/:id` → `{ tenant, staff[] }`.

### 14.3 API surface

```
POST   /api/platform/login
GET    /api/platform/me
GET    /api/platform/stats
GET    /api/platform/tenants
GET    /api/platform/tenants/:id
PATCH  /api/platform/tenants/:id/approval
```

**Demo account (unified apps):** `admin@demo.com` / `Demo1234`

---

## 15. Admin routes index (platform admin only)

### 15.1 Cross-app screen matrix

| Screen | Route | ERP | HUB | MR | MVP | DSW | DMVP | SP platform |
|--------|-------|-----|-----|-----|-----|-----|------|-------------|
| Dashboard | `/admin` or `/platform/dashboard` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Users | `/admin/users` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Entity approvals | `/admin/stockists`, `/pharmacies`, `/doctors` | pharmacy-approvals | ✓ | — | ✓ | ✓ | ✓ | tenants |
| Orders B2B+B2C | `/admin/orders`, `/customer-orders` | — | ✓ | — | — | mock | — | — |
| Consultations | `/admin/consultations` | — | ✓ | — | — | — | — | — |
| Returns / Refunds | `/admin/returns`, `/refunds` | — | ✓ | — | — | — | — | — |
| Analytics | `/admin/analytics` | ✓ | ✓ | — | ✓ | ✓ | ✓ | stats |
| Counterfeit | `/admin/counterfeit` | — | ✓ | — | ✓ | — | — | — |
| Audit | `/admin/audit-logs`, `/audit-trail` | ✓ | ✓ | role-audit | ✓ | ✓ | ✓ | — |
| Recalls | `/admin/recalls` | ✓ | — | — | — | — | — | — |
| Notices | `/admin/notices` | ✓ | — | — | — | — | — | — |
| Disputes | `/admin/disputes` | ✓ | — | — | — | — | — | — |
| Drug schedules | `/admin/drug-schedules` | — | ✓ | — | — | — | — | — |
| Serviceable areas | `/admin/serviceable-areas` | territories | ✓ | — | — | — | — | — |
| Flowboard | `/admin/system-architecture` | — | ✓ | — | doc page | — | — | — |
| Maintenance / ToS | `/admin/maintenance`, `/tos-management` | — | ✓ | — | — | — | — | — |
| Impersonate / reset | `/admin/impersonate`, `/force-reset` | — | ✓ | — | — | — | — | — |
| Geo / API monitor | `/admin/geo-distribution`, `/api-monitoring` | — | ✓ | — | — | — | — | — |
| Support | `/admin/support`, `/messages` | — | ✓ | ✓ | — | — | ✓ | — |
| Subscriptions | `/admin/subscriptions` | — | CRUD | approve (404 route) | — | — | — | — |
| Fee / templates / campaigns | `/admin/fees`, `/templates`, `/campaigns` | ✓ | — | — | — | — | — | — |

### 15.2 HUB full route tree (~56 routes under `/admin`)

`index`, `pharmacies`, `pharmacies/:id`, `stockists`, `stockists/:id`, `doctors`, `doctors/:id`, `customers`, `customers/:id`, `orders`, `orders/:id`, `customer-orders`, `customer-orders/:id`, `consultations`, `consultations/:id`, `returns`, `refunds`, `payments`, `bills`, `commissions`, `delivery-staff`, `users`, `notifications`, `messages`, `messages/:userId`, `counterfeit`, `analytics`, `revenue-detail`, `platform-invoice`, `settings`, `drug-schedules`, `product-categories`, `pharmacy-categories`, `specializations`, `serviceable-areas`, `subscriptions`, `banners`, `system-architecture`, `export`, `login-history`, `activity-log`, `audit-trail`, `reviews`, `license-expiry`, `impersonate`, `force-reset`, `merge-accounts`, `maintenance`, `tos-management`, `system-report`, `active-users`, `api-monitoring`, `geo-distribution`, `help`, `profile`, `more`.

---

## 16. Admin RPCs & edge functions

| RPC / function | Purpose |
|----------------|---------|
| `admin_override_order_status` | B2B order status override |
| `admin_override_customer_order_status` | B2C order status override |
| `admin_send_targeted_notification` | Single-user notification |
| `distribute_notice_to_users` | ERP notice fan-out by role/geo/batch |
| `search_users_by_batch_code` | Recall impact search |
| `has_role` / `is_admin` | RLS and route guards |
| `seed-admin` | Bootstrap admin user |
| `flowboard-data` | Static architecture dataset |
| `architecture-ai` | Architecture Q&A |
| `admin-wipe` | MR full data wipe (admin + confirm phrase) |
| `assign-role` | MR role assignment (admin needs `jit@ADMIN1`) |

---

## 17. Data model (admin-governed entities)

**Supabase apps (ERP/HUB/MR/MVP/DSW/DMVP):**

- Governance: `admin_notices`, `user_notice_recipients`, `admin_audit_log`, `audit_logs`, `platform_settings`, `platform_banners`, `admin_serviceable_areas`, `drug_schedules`, `product_categories`, `counterfeit_alerts`, `batch_recalls`, `disputes`, `message_templates`, `campaigns`, `platform_fees`, `territories`, `subscription_plans`, `quick_questions`, `login_attempts`, `login_activity`.
- Approval fields: `*_profiles.approval_status`, `rejection_reason`, per-document status columns on profiles.
- **ERP-only admin tables:** `pharmacy_registration_requests`, `pharmacy_documents`.

**SP / unified:**

- `platform_users` (global super_admin)
- `tenants.approvalStatus` (pending | approved | rejected)

---

## 18. Implementation maturity matrix

| Capability | ERP | HUB | MR | MVP | DSW | DMVP | SP platform |
|------------|-----|-----|-----|-----|-----|------|-------------|
| Real backend | ✅ | ✅ | ✅ | ❌ localStorage | ❌ mock | ❌ mock | ✅ PGlite |
| Registration approval | ✅ dual (pharmacy) | ✅ full | — | ✅ partial | toast | ✅ partial | ✅ basic |
| User management | ⚠️ audit only | ✅ | ✅ | toast | toast | ✅ | — |
| Order override | — | ✅ RPC | — | — | read-only | no-op | — |
| B2C refunds | — | ✅ | — | — | — | — | — |
| Recalls / disputes | ✅ | — | — | — | — | — | — |
| Counterfeit | — | ✅ | — | ✅ | — | — | — |
| Broadcast notify | ✅ notices | ✅ | — | — | — | ✅ | — |
| Config CRUD | territories, fees | ✅ broad | — | banners | toast | toast | — |
| Analytics | ⚠️ placeholders | ✅ | ⚠️ wrong scope | fake | fake | partial | ✅ stats |
| Audit trail | ✅ | ✅ | ✅ XLSX | partial | partial | partial | — |
| Flowboard | — | ✅ | — | static doc | — | — | — |

---

## 19. Known gaps & stubs (admin-specific)

| Gap | Apps |
|-----|------|
| User `is_active` toggle not persisted (audit only) | ERP |
| Analytics chart areas are placeholders; trend % hardcoded | ERP, MVP, DSW |
| `platform_fees` never applied to transactions | ERP |
| `message_templates` not connected to senders | ERP |
| Maintenance mode flag stored but not enforced | HUB |
| Reference CRUD (schedules, categories) not used by product/registration forms | HUB |
| `subscription_plans` CRUD with no billing enforcement | HUB |
| Banners CRUD with no UI renderer | HUB |
| MR subscription approval page unrouted (404) | MR |
| Admin analytics on MR shows seller-scoped empty data | MR |
| DSW admin actions are toasts; UserDetail keys mismatch → “User Not Found” | DSW |
| DMVP `admin_override_*` RPCs no-op; login_history empty | DMVP |
| SP tenant `approvalStatus` not enforced at login; no doc review | SP |
| MED: admin enum + RLS only — zero admin screens | MED |

---

## 20. Source references

| Document | Path |
|----------|------|
| Merged flow spec (Module 12) | `PROJECT_FLOW_REQUIREMENTS.md` §4.14, §4A Module 12, §7D, §8 Module 12 |
| HUB admin user flows | `digi-swasthya-hub/docs/user-flows-admin.md` |
| ERP admin module | `reviews/review-stockpharmaerp.md` §7 |
| HUB admin routes & pages | `reviews/review-digi-swasthya-hub.md` §16, route table |
| SP platform panel | `reviews/review-STOCKIST-PHARMACY.md` §9.3 |
| Flow index (admin screens) | `MASTER_FLOW_INDEX.md` Module 12 |

*Generated 2026-07-06 — platform admin scope only; excludes stockist, pharmacy, and tenant staff admin flows.*
