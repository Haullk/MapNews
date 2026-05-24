## Context

The MapNews homepage already uses a Next.js server component, but
`getInitialWorkspaceData()` only returns metadata. The interactive workspace then
waits for client-side fetches before showing hotspots and the daily brief. This
creates an avoidable empty first impression and makes slow or failed client
requests look like missing data.

The same page is implemented mostly inside `src/components/news-map.tsx`, which
is currently about 1900 lines. That file owns data fetching, map projection,
marker rendering, side panel rendering, hover behavior, detail loading, trend
loading, and interaction handling. Further product changes should not continue
to compound that file.

Constraints:

- Keep the MVP architecture: no Docker and no independent backend API service.
- Next.js server code continues to query PostgreSQL directly.
- Do not introduce fake news events as default empty-state content.
- Preserve existing map interaction, filtering, ranking, region detail, channel
  detail, hover cards, and trend behavior.

## Goals / Non-Goals

**Goals:**

- Render initial hotspots and daily brief from server-provided data when
  available.
- Keep the map usable if a later client refresh fails.
- Show clear database unavailable, no-data, loading, and refresh-error states.
- Parallelize full workspace refreshes where practical.
- Extract coherent frontend responsibilities into smaller hooks/components.
- Add a safe rendering boundary around the interactive workspace.
- Add a basic mobile layout that avoids horizontal overflow and preserves core
  interactions.
- Add stable marker identity and transitions for smoother updates.

**Non-Goals:**

- No complete panel IA redesign or new three-tab detail model.
- No event timeline implementation.
- No lifecycle model beyond existing `trendLabel` rendering.
- No AvgTone divergence, GKG theme filtering, DOC API enrichment, or push
  notifications.
- No database schema migration or data backfill.

## Decisions

### Decision 1: Extend `getInitialWorkspaceData()` instead of adding a new API

`getInitialWorkspaceData()` will return:

- `initialHotspots`
- `initialBrief`
- existing `dates`, `channels`, `databaseReady`, `status`

The server component will pass these values into `NewsMap`. `NewsMap` will use
them as initial state and avoid a redundant first full client request when both
hotspots and brief are present.

Alternative considered: add a new `/api/workspace` endpoint and call it from the
client. That would still leave the first screen client-dependent and does not
use the existing server component.

### Decision 2: Bound the SSR hotspot payload

Initial SSR hotspots will use a bounded default limit, matching the current map
query behavior but capped by `queryMapHotspots`. The first payload must be large
enough for the global view while keeping page payload acceptable.

Alternative considered: SSR only ranking items. That would improve the side
panel but leave the map visually empty, which does not solve the first-screen
problem.

### Decision 3: Client refreshes preserve last usable data

Client fetch failures will set a message but keep existing hotspots, ranking,
brief, and status when possible. Empty results from a successful query are still
valid and should show a no-results message.

Alternative considered: clear state on every refresh start. That causes flicker
and makes transient network errors look like data loss.

### Decision 4: Extract by responsibility, not by final ideal architecture

This change will split the component into a pragmatic first layer:

- workspace data hook
- map projection/geometry hook
- map renderer
- hotspot marker layer
- side panel
- ranking list
- error/empty state helpers

The target is lower risk and better local ownership, not a perfect final
component tree. More granular detail-panel components can be extracted in the
next product change.

Alternative considered: execute the full review-proposed 20+ file split now.
That would mix refactor risk with first-screen behavior changes and make
regressions harder to isolate.

### Decision 5: Use real empty states instead of demo data

When no real data is available, the UI will explain the database/import state
and show the map shell where possible. It will not invent fake hotspots by
default.

Alternative considered: show static demo hotspots. That can make the product
look alive, but it creates trust risk in a news product unless the demo mode is
explicit and intentionally entered.

### Decision 6: Keep marker identity region-based

Default markers represent region aggregate hotspots. Marker keys should be based
on stable region identity, with date kept out of the key unless needed for a
specific reset. Data updates should mutate marker position/content rather than
destroying the marker on every date/filter update.

Alternative considered: `regionKey-channel`. That mismatches the current marker
semantics because the default marker is no longer a single-channel point.

## Risks / Trade-offs

- **SSR payload becomes too large** -> Keep the initial hotspot limit bounded and
  verify build/browser performance. Reduce to 300 if payload becomes a problem.
- **Refactor introduces behavior regressions** -> Extract incrementally, run
  typecheck/build, and browser-check map load, filtering, hover, click, and
  detail behavior.
- **Skipping initial client fetch can leave stale status** -> Allow background
  viewport/status refresh after hydration, but do not block first paint on it.
- **Empty states may hide operational issues** -> Copy must distinguish database
  unavailable, connected-but-empty, and current-filter-empty states.
- **Mobile baseline may feel basic** -> Acceptable for this change. The goal is
  usable, not a full mobile-specific interaction model.

## Migration Plan

1. Add new TypeScript types/props for initial hotspots and brief.
2. Extend server-side initial workspace query.
3. Initialize client state from server payload.
4. Extract hooks/components while preserving behavior.
5. Add empty/error boundary components and mobile CSS.
6. Run verification.

Rollback strategy: revert this change. No database migration or persistent data
format change is required.

## Open Questions

- The initial hotspot limit will start with the current default map limit. If
  measured payload is high, reduce the limit before release.
- Full demo mode remains explicitly out of scope; it can be revisited later as a
  separate product decision.
