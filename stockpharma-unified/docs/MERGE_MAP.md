# Merge Map — One Localhost

All panels below run on **http://localhost:3000** with API **http://localhost:4000**.

## Live panels (merged & runnable)

| Panel | Routes | Source repos | Key features |
|-------|--------|--------------|--------------|
| **Home** | `/` | All | Panel picker + demo credentials |
| **Stockist** | `/dashboard`, `/orders`, `/bills`, … | SP, ERP, HUB, MED | B2B orders, billing, GST, ledger, portal orders, returns |
| **Pharmacy** | `/pharmacy/*` | SP, ERP, HUB, MED | PO to stockist, GRN, POS, payables, smart order, discover stockists |
| **Platform Admin** | `/platform/*` | HUB, ERP admin | Tenant list, approval status, KPIs |
| **Customer / Shop** | `/shop/*` | HUB, DSW, ERP patient | Browse pharmacies, cart, online orders, doctors list |
| **Doctor** | `/doctor/*` | HUB, DSW | Registration, consultations |
| **MR** | `/mr/*` | MR, ERP mr | Registration, pharmacy visit log |
| **Public** | `/verify-bill/:id` | ERP, HUB | Bill QR verification |

## API prefixes (unified server)

| Prefix | Purpose |
|--------|---------|
| `/api/auth/*` | Stockist/pharmacy tenant login |
| `/api/platform/*` | Platform admin |
| `/api/accounts/consumer/*` | Customer B2C |
| `/api/accounts/doctor/*` | Doctor |
| `/api/accounts/mr/*` | MR |
| `/api/smart-order/*` | MED Smart Order parse/recommend |
| `/api/public/*` | Catalogue, bill verify, demo credentials |
| `/api/orders`, `/api/bills`, … | SP core ERP |

## Backlog (in spec, not yet fully ported)

From `UNIFIED_FEATURES.md` Module × coverage matrix:

- Delivery staff system (HUB)
- Brand portal (ERP)
- Full HUB B2C Rx verification pipeline
- ERP patient loyalty / subscriptions
- MR OTC partnerships
- Multi-step registration + document upload
- Offline/PWA sync

Implement new features in `app/server` + `app/client` using SP patterns (Drizzle, Express services, React panels).

## Per-repo reference code

Original implementations remain in sibling folders — see `../sources/README.md`. Use them when porting a specific flow; do not run multiple localhost apps unless comparing legacy Supabase behavior.
