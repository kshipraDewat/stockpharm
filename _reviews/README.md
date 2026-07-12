# Complete Application Specifications — 8 Repositories

Each file in this folder is the **definitive documentation** for one sibling repository. Content is derived **exclusively from actual source code** — not roadmap, not gap analysis, not external requirements.

A reader should be able to understand the entire application from the review file alone, without opening the codebase.

## Files

| File | Code | Repository | Stack summary |
|------|------|------------|---------------|
| [review-stockpharmaerp.md](./review-stockpharmaerp.md) | ERP | `stockpharmaerp/` | Supabase + React; 6 roles; 17 edge functions |
| [review-digi-swasthya-hub.md](./review-digi-swasthya-hub.md) | HUB | `digi-swasthya-hub/` | Supabase + React; 5 roles + staff; 8 edge functions |
| [review-greetings-pal-git.md](./review-greetings-pal-git.md) | MED | `greetings-pal-git/` | Supabase + React; stockist/pharmacy B2B; smart order |
| [review-stockistpayments.md](./review-stockistpayments.md) | MR | `stockistpayments/` | Supabase + React; MR/stockist/pharmacy/admin marketplace |
| [review-digimvplaunch.md](./review-digimvplaunch.md) | MVP | `digimvplaunch/` | Client-only; localStorage state machine |
| [review-digiswasthya.md](./review-digiswasthya.md) | DSW | `digiswasthya/` | Client-only PWA; mock data; 6 role panels |
| [review-digiswasthyamvp.md](./review-digiswasthyamvp.md) | DMVP | `digiswasthyamvp/` | Mock Supabase client; B2B demo |
| [review-STOCKIST-PHARMACY.md](./review-STOCKIST-PHARMACY.md) | SP | `STOCKIST-PHARMACY/` | Express + PGlite + React; full ERP |

**Total:** ~16,700 lines (original reviews + **EXPANSION — Code-Derived Additions (Audit Pass)** appended to each).

## Document structure

Each review contains:

1. **Original exhaustive review** — pages, modals, fields, workflows, journeys
2. **EXPANSION section (E.1–E.9+)** — route tables, entity catalogs, API indexes, auth matrices, calculation references, stub/mock inventory, dead code

## Related docs

| Doc | Purpose |
|-----|---------|
| [../EXHAUSTIVE_REVIEW_PROMPT.md](../EXHAUSTIVE_REVIEW_PROMPT.md) | Template to re-run a review |
| [../MERGED_REVIEWS.md](../MERGED_REVIEWS.md) | All 8 merged (Part I unified + Part II appendices) |
| [../MASTER_FLOW_INDEX.md](../MASTER_FLOW_INDEX.md) | Flow/page/modal index |
| [../_reviews/](../_reviews/) | Mirror of this folder |

## Re-run or extend

Copy `EXHAUSTIVE_REVIEW_PROMPT.md` into an agent session, point at one repo, and **append** new findings under `## EXPANSION` — never shorten prior content.
