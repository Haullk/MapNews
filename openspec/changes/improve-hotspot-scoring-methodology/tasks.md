## 1. Data Model

- [x] 1.1 Add scoring baseline, z-score, Goldstein weight, and score version columns to product tables.
- [x] 1.2 Ensure indexes and defaults keep existing local data readable before reprocessing.

## 2. Worker Scoring

- [x] 2.1 Filter hotspot aggregates to events with `effective_mentions >= 2` while preserving raw and cleaned rows.
- [x] 2.2 Replace fixed heat score weights with the log evidence formula.
- [x] 2.3 Compute 7-day baseline fields and Z-score trend labels for channel hotspots.
- [x] 2.4 Store `goldstein_weight` and reuse it in region-level aggregation.

## 3. API And Frontend

- [x] 3.1 Return baseline, Z-score, and score version fields from hotspot queries and details.
- [x] 3.2 Update frontend hotspot types and trend/heat wording to treat heat as reporting heat.
- [x] 3.3 Keep existing map aggregation, ranking, filters, and detail interactions working.

## 4. Verification

- [x] 4.1 Add or update Python tests for low-mention filtering, log heat score, Z-score trend labels, and Goldstein weight aggregation.
- [x] 4.2 Run `openspec validate improve-hotspot-scoring-methodology`.
- [x] 4.3 Run Python tests.
- [x] 4.4 Run `npm run typecheck` and `npm run build`.
- [x] 4.5 Browser-check the default map, ranking, hotspot detail, and baseline-insufficient display.
