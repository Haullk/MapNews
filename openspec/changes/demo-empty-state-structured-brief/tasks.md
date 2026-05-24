## 1. OpenSpec

- [x] 1.1 Create proposal, design, tasks, and spec delta.
- [x] 1.2 Run `openspec validate demo-empty-state-structured-brief`.

## 2. Data And API

- [x] 2.1 Extend `DataStatus` with latest import batch progress metadata.
- [x] 2.2 Stop fetching daily brief data for the homepage workspace.
- [x] 2.3 Keep existing daily brief API available for future use without rendering it in the sidebar.

## 3. Frontend

- [x] 3.1 Remove the `今日态势简报` sidebar block.
- [x] 3.2 Add a clearly labelled demo/empty-state panel.
- [x] 3.3 Show demo hotspots only for system-empty states, not scoped filter-empty states.
- [x] 3.4 Ensure filters, data status, and ranking remain the primary left-sidebar content.

## 4. Verification

- [x] 4.1 Run `npm run typecheck`.
- [x] 4.2 Run `npm run build`.
- [x] 4.3 Browser-verify the daily brief block is gone and ranking/detail interactions still work.
- [x] 4.4 Browser-verify demo/empty-state behavior where practical.
