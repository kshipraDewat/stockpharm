# Per-Application Exhaustive Reviews

One **code-derived functional review** per sibling app — every flow, sub-flow, screen, modal, field, logic rule, edge case, and user journey.

| File | Code | Repo folder | Size |
|------|------|-------------|------|
| [review-stockpharmaerp.md](./review-stockpharmaerp.md) | **ERP** | `stockpharmaerp` | Digi Swasthya Store |
| [review-digi-swasthya-hub.md](./review-digi-swasthya-hub.md) | **HUB** | `digi-swasthya-hub` | Digi Swasthya Hub |
| [review-greetings-pal-git.md](./review-greetings-pal-git.md) | **MED** | `greetings-pal-git` | MedOrder |
| [review-stockistpayments.md](./review-stockistpayments.md) | **MR** | `stockistpayments` | PharmaMR |
| [review-digimvplaunch.md](./review-digimvplaunch.md) | **MVP** | `digimvplaunch` | Click prototype |
| [review-digiswasthya.md](./review-digiswasthya.md) | **DSW** | `digiswasthya` | Lexend UI prototype |
| [review-digiswasthyamvp.md](./review-digiswasthyamvp.md) | **DMVP** | `digiswasthyamvp` | Mock Supabase B2B MVP |
| [review-STOCKIST-PHARMACY.md](./review-STOCKIST-PHARMACY.md) | **SP** | `STOCKIST-PHARMACY` | Full-stack ERP |

## What each review contains

Per [`EXHAUSTIVE_REVIEW_PROMPT.md`](../EXHAUSTIVE_REVIEW_PROMPT.md):

- **Global architecture** — routes, guards, layouts, nav, infra
- **Auth & onboarding** — every screen, field, validation, journey
- **Each module/role** — page content (KPIs, tables, tabs), actions, modals/sheets/drawers with all input fields
- **Business logic** — GST, stock, credit, status machines, numbering
- **Edge cases, stubs, dead code**
- **Backend** — APIs, RPCs, schema groups

## Merged master spec

All eight reviews are also merged (Part I de-duplicated + Part II appendices) in [`UNIFIED_FEATURES.md`](../UNIFIED_FEATURES.md).

## Flow index

Navigable index of every flow/page/modal: [`MASTER_FLOW_INDEX.md`](../MASTER_FLOW_INDEX.md).

## Re-run a review

Copy [`EXHAUSTIVE_REVIEW_PROMPT.md`](../EXHAUSTIVE_REVIEW_PROMPT.md) into an agent session and point it at one repo folder.
