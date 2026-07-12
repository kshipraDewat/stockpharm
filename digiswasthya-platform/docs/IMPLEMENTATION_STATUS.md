# Implementation Status — Built from MERGED_REVIEWS.md

> Spec: [`MERGED_REVIEWS.md`](./MERGED_REVIEWS.md) (Part I unified map + Part II per-app reviews).  
> Runnable code: [`../app/`](../app/) (Express + React monorepo).

Legend: **Done** = wired end-to-end on localhost · **Partial** = core flow exists, spec gaps remain · **Planned** = in spec, not yet ported · **Ref** = use sibling repo under `../../` for reference only

## Module × status

| # | Module | Status | Routes / notes |
|---|--------|--------|----------------|
| 1 | Platform Overview & Roles | **Done** | `/` home picker; 6 account kinds + tenant staff roles |
| 2 | Auth / Sessions / Onboarding | **Partial** | Login, forgot/reset; **3-step register wizard** (HUB-style); no doc upload yet |
| 3 | Stockist | **Done** | `/dashboard` … orders, bills, payments, purchases, reports |
| 4 | Pharmacy — B2B purchase | **Done** | `/pharmacy/purchase-orders`, GRN, payables, stockist connections |
| 5 | Pharmacy — B2C sale | **Partial** | `/pharmacy/pos`, retail sales; no full HUB Rx pipeline |
| 6 | Public Catalogue | **Partial** | `/pharmacy/discover`, `/api/public/stockists`; ERP license-verify UI backlog |
| 7 | Seller variants (MR/Distributor) | **Partial** | MR panel only; no distributor enum |
| 8 | Patient / Customer | **Partial** | `/shop/*` B2C; no ERP loyalty/wishlist |
| 9 | Doctor | **Partial** | `/doctor/*` consultations; no HUB availability/slots |
| 10 | Brand | **Planned** | ERP brand portal — see `review-stockpharmaerp.md` |
| 11 | Delivery Staff | **Planned** | HUB `/staff` credential system |
| 12 | Admin | **Partial** | `/platform/*` cross-tenant; no ERP recalls/disputes/fees |
| 13 | AI & Edge Functions | **Partial** | Smart order parse; bill OCR flag; no Lovable gateway |
| 14 | Smart Order engine | **Done** | `/pharmacy/smart-order`, `/api/smart-order/*` |
| 15 | Payments / Credit / Money | **Done** | Ledger, allocations, credit limits, payable mirror |
| 16 | Delivery config & fees | **Planned** | ERP/HUB delivery rules |
| 17 | Realtime / Offline / PWA | **Planned** | ERP offline queue, HUB SW |
| 18 | Data model | **Partial** | PGlite Drizzle; Supabase tables not all migrated |
| 19 | Cross-cutting conventions | **Done** | ₹ formatting, tenant isolation, event bus |

## Panels on one localhost (:3000 / :4000)

| Panel | Login | Merged from |
|-------|-------|-------------|
| Stockist | `/login` | SP, ERP, HUB, MED |
| Pharmacy | `/login?panel=pharmacy` | SP, ERP, HUB, MED |
| Platform Admin | `/platform/login` | HUB, ERP admin |
| Customer | `/shop/login` | HUB, DSW, ERP patient |
| Doctor | `/doctor/login` | HUB, DSW |
| MR | `/mr/login` | MR, ERP mr |

## Next ports (priority from MERGED_REVIEWS Part I)

1. Multi-step registration **document upload** + approval workflow (HUB PharmacyRegistration 5-step)
2. HUB B2C **Rx verification** on consumer checkout
3. **Delivery staff** auth + delivery routes (HUB Module 11)
4. **Brand portal** (ERP Module 10)
5. ERP **patient** loyalty, prescriptions upload
6. MR **OTC partnerships**, distributor role

## Reference repos (unchanged)

See [`../sources/README.md`](../sources/README.md).
