# Additions & Missing Features Tracker

Single source of truth for features, user flows, and journeys that are **missing** or **only partially implemented** in Digital Swastha / Stockist. Audited against the codebase on 2026-06-30.

**Legend:** **Missing** = not implemented. **Partial** = some plumbing exists but does not meet the stated requirement.

---

## A. Bill / Invoice QR Code Verification

**Status: Missing** (bill generation and print/PDF exist; QR and verification flow do not)

### Requirement

- On generated bills, include a QR code at the bottom of the invoice.
- Accompanying text: *"This bill was generated using digital swastha and can be verified on the application. Scan this QR code to verify your items now."*
- Scanning should allow verification of bill items within the application.

### Current implementation (audit)

| Area | What exists | Location |
|------|-------------|----------|
| Bill creation (server) | Idempotent bill generation from orders; GST line items; bill number sequencing | `server/src/services/billService.ts` |
| Bill detail UI | Full invoice layout: seller/buyer, line items, tax breakdown, payments | `client/src/components/bill/BillDetailPage.tsx` (`#invoice-content`) |
| Print | Browser `window.print()` on bill detail | `BillDetailPage.tsx` |
| PDF export | Client-side `html2canvas` + `jsPDF` → base64 PDF | `client/src/lib/invoicePdf.ts` |
| WhatsApp share | PDF generated from same DOM, sent via Meta API | `BillDetailPage.tsx`, `server/src/routes/communication.ts`, `server/src/services/whatsappService.ts` |
| Pharmacy payable view | Read-only bill detail (no print/QR) | `client/src/components/pharmacy-panel/payables/PayableBillDetailPage.tsx` |
| Invoice footer | Generic disclaimer only: *"This is a computer generated invoice…"* | `BillDetailPage.tsx` (bottom of `#invoice-content`) |

### Gaps

| Item | Status |
|------|--------|
| QR code image on invoice (screen, print, PDF) | **Missing** |
| Required verification message copy | **Missing** |
| QR payload (bill ID, tenant, signed token, or public verify URL) | **Missing** |
| Public or authenticated **bill verification** page/API | **Missing** — no routes, services, or UI for `/verify` or similar |
| QR library dependency (e.g. `qrcode`) | **Missing** |
| Pharmacy-side payable bill print/PDF with QR | **Missing** |
| DB fields for verification tokens / scan audit | **Missing** |

### Notes for implementation

- PDF path renders `#invoice-content` via canvas; any QR must live inside that element (or be composited into PDF generation) so print, PDF, and WhatsApp stay consistent.
- Decide: public verify URL (no login) vs in-app scan (pharmacy/stockist logged in). No schema or API exists yet for either.

---

## B. Stockist Registration (multi-step)

**Status: Missing** (single-page signup + post-login onboarding only)

### Requirement — multi-step registration

1. **Business details:** business type (pharmaceutical stockist, others), business name, PAN number, GST
2. **Documents:** drug license, GST certificate, wholesale license **or** FSSAI license
3. **Contact & address:** phone, WhatsApp, email, password, full address, state, city, pin code, serviceable area pin codes
4. **Bank details**

### Current implementation (audit)

| Area | What exists | Location |
|------|-------------|----------|
| Registration UI | **Single form**, not multi-step; stockist/pharmacy toggle | `client/src/components/auth/RegisterPage.tsx` |
| Stockist fields at signup | Business name, your name, email, phone, state code (2-digit), password | `RegisterPage.tsx` |
| Stockist fields **not** at signup | Business type, PAN, GST (UI), documents, WhatsApp, city, pin code, serviceable pincodes, bank | — |
| API schema | `businessName`, `name`, `email`, `password`, `stateCode`, `phone`, optional `gstin`, optional `dlNumber`, `tenantType` | `server/src/routes/auth.ts` (`RegisterSchema`) |
| Tenant persistence | `name`, `businessName`, `stateCode`, `phone`, `email`, `gstin`, `dlNumber`, `addressJson` (unstructured text) | `server/src/db/schema.ts` (`tenants`) |
| Post-login onboarding | 4-step slide-over: business profile (DL/GST/address line), first pharmacy, products, staff — **not** registration | `client/src/components/dashboard/OnboardingFlow.tsx` |
| Settings (post-login) | Business name, email, phone, DL, GSTIN, address line, state code | `client/src/components/settings/SettingsPage.tsx` |

### Field-by-field gap

| Required field | Status | Notes |
|----------------|--------|-------|
| Business type (pharma stockist / others) | **Missing** | No enum on `tenants` |
| Business name | **Partial** | Collected at signup |
| PAN number | **Missing** | No schema or UI |
| GST | **Partial** | API accepts `gstin`; stockist signup UI does not collect it; onboarding/settings can add later |
| Drug license (document upload) | **Missing** | DL number text only in onboarding/settings; no file upload |
| GST certificate (upload) | **Missing** | |
| Wholesale license or FSSAI (upload) | **Missing** | |
| Phone | **Partial** | Signup |
| WhatsApp | **Missing** | |
| Email | **Partial** | Signup |
| Password | **Partial** | Signup |
| Full address (structured) | **Partial** | Single `addressJson` line; no city/pin |
| State | **Partial** | `stateCode` only (numeric), not state name |
| City | **Missing** | |
| Pin code (own) | **Missing** | |
| Serviceable area pin codes | **Missing** | `coverageStateCodes` exists for public profile but not pin-level service areas |
| Bank details | **Missing** | No bank account schema |

### Notes for implementation

- Replace or extend `RegisterPage` with a wizard (steps 1–4) for `tenantType === 'stockist'`.
- Requires migrations: `businessType`, `pan`, `whatsapp`, `city`, `pinCode`, `serviceablePinCodes`, document URLs/metadata, bank fields.
- Document storage needs upload pipeline (S3/local) — only `invoiceFileUrl` on purchases exists as a file reference pattern.

---

## C. Pharmacy Registration (multi-step)

**Status: Missing** (single-page signup + post-login onboarding only)

### Requirement — multi-step registration

1. Pharmacy name, pharmacy type, license number
2. **Documents:** drug license, GST certificate, pharmacy certificate
3. **Contact & address:** phone, etc., own pin code

### Current implementation (audit)

| Area | What exists | Location |
|------|-------------|----------|
| Registration UI | Same single form as stockist; pharmacy mode adds DL number field | `RegisterPage.tsx` |
| Pharmacy fields at signup | Pharmacy name (`businessName`), your name, email, phone, state code, DL number, password | `RegisterPage.tsx` |
| API | DL required when `tenantType === 'pharmacy'` | `auth.ts` `RegisterSchema.superRefine` |
| Post-login onboarding | Business profile, connect stockist, products, opening stock, staff | `PharmacyOnboardingFlow.tsx` |
| Pharmacy settings | Similar to stockist settings tab | `PharmacySettingsPage.tsx` |

### Field-by-field gap

| Required field | Status | Notes |
|----------------|--------|-------|
| Pharmacy name | **Partial** | `businessName` at signup |
| Pharmacy type | **Missing** | No type enum |
| License number | **Partial** | `dlNumber` at signup (drug license style) |
| Drug license (document) | **Missing** | Text only |
| GST certificate (document) | **Missing** | |
| Pharmacy certificate (document) | **Missing** | |
| Contact (phone, email, password) | **Partial** | Signup |
| WhatsApp | **Missing** | |
| Full address | **Partial** | Onboarding/settings only; unstructured |
| Own pin code | **Missing** | |

### Notes for implementation

- Mirror stockist wizard pattern with pharmacy-specific steps and document requirements.
- Reuse tenant table extensions from stockist work where applicable (`pharmacyType`, `pinCode`, document refs).

---

## D. Admin Panel

**Status: Missing** (tenant-scoped `admin` **role** exists; no platform admin panel)

### Requirement

- A dedicated **admin panel** for platform operators (exact scope TBD by product owner).

### Current implementation (audit)

| Area | What exists | Location |
|------|-------------|----------|
| User role `admin` | Per-tenant role for stockist/pharmacy users | `users.role` in schema; `ProtectedRoute` in routes |
| Tenant admin capabilities | Settings, audit logs, some reports gated to `admin` | `client/src/routes/index.tsx` |
| System route | Tenant-scoped health check for admin role | `server/src/routes/system.ts` |
| Super-admin / platform routes | **None** | No `/admin/*` app shell, no cross-tenant management UI |
| Tenant approval / KYC review | **None** | Registration is instant, no moderation queue |
| Global user/tenant listing | **None** | |

### Gaps

| Item | Status |
|------|--------|
| Platform admin application (separate from stockist/pharmacy panels) | **Missing** |
| Cross-tenant dashboards (tenants, registrations, documents) | **Missing** |
| Admin auth model (super-admin users, separate from tenant `admin`) | **Missing** |
| Feature requirements | **TBD** — awaiting product detail |

### Distinction

The in-app **`admin` role** is a **tenant administrator** (manage users/settings within one stockist or pharmacy), not a **Digital Swastha platform admin panel**.

---

## E. Order Duplicate / Copy Order (Order Details Page)

**Status: Partial** (pharmacy purchase orders only, limited); **Missing** on stockist order detail

### Requirement

- On order details page: **"Duplicate"** or **"Copy order"** action.
- Copies **same items** and **same pharmacy** (stockist) / **same stockist** (pharmacy) into a **new draft** — not a full clone of metadata, status, or IDs.
- After confirmation, user lands on the **new order** page.

### Pharmacy purchase orders — Partial

| Area | What exists | Location |
|------|-------------|----------|
| Duplicate action | Button **"Duplicate to Draft"** only when `po.status === 'rejected'` | `PurchaseOrderDetailPage.tsx` |
| Copy behavior | Navigates to `create?duplicateFrom={id}`; pre-fills connection + line items from source PO | `CreatePurchaseOrderPage.tsx` |
| Save flow | Creates new draft PO; navigates to `/pharmacy/purchase-orders/{newId}` | `CreatePurchaseOrderPage.tsx` `save()` |
| Confirmation dialog | **Missing** — immediate navigation to create page | |

### Pharmacy gaps

| Item | Status |
|------|--------|
| Duplicate on delivered / received / cancelled / other terminal states | **Missing** (rejected only) |
| Explicit confirmation step before copy | **Missing** |
| Label "Copy order" / broader availability | **Partial** |

### Stockist orders — Missing

| Area | What exists | Location |
|------|-------------|----------|
| Order detail page | Full workflow (pack, ship, deliver, bill, return); print only | `client/src/components/order/OrderDetailPage.tsx` |
| Create order page | Manual create; session draft in `sessionStorage` | `CreateOrderPage.tsx` |
| Duplicate / copy | **No** `duplicateFrom` query param, button, or API | — |
| Server duplicate endpoint | **None** | `server/src/services/orderService.ts` |

### Stockist gaps

| Item | Status |
|------|--------|
| "Duplicate" / "Copy order" on `OrderDetailPage` | **Missing** |
| Pre-fill pharmacy + items on create page from existing order | **Missing** |
| Optional `POST /orders/:id/duplicate` or client-side copy into create flow | **Missing** |

### Notes for implementation

- Pharmacy: extend `handleDuplicate` visibility beyond `rejected`; add confirm modal; align button copy with spec.
- Stockist: mirror pharmacy pattern — `CreateOrderPage?duplicateFrom={orderId}` loading order items + `pharmacyId`, then `navigate(/orders/{newId})` after draft create.

---

## Summary matrix

| Feature | Overall status | Highest-value next step |
|---------|----------------|-------------------------|
| A. Bill QR verification | **Missing** | QR in `#invoice-content` + public verify route |
| B. Stockist registration wizard | **Missing** | Schema + multi-step `RegisterPage` |
| C. Pharmacy registration wizard | **Missing** | Schema + pharmacy wizard steps |
| D. Platform admin panel | **Missing** | Product spec; super-admin auth + routes |
| E. Copy order | **Partial** | Stockist `OrderDetailPage` duplicate; broaden pharmacy PO |

---

## Out of scope (this document)

- Features already implemented and not listed above.
- Detailed implementation plans — added when product provides further requirements.
