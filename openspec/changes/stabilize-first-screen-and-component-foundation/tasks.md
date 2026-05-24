## 1. OpenSpec Setup

- [x] 1.1 Validate proposal, design, and spec artifacts for the change.

## 2. Server Initial Workspace Data

- [x] 2.1 Extend workspace data types and `getInitialWorkspaceData()` to return bounded `initialHotspots` and `initialBrief`.
- [x] 2.2 Pass initial hotspot and brief payloads from `page.tsx` into the client workspace.
- [x] 2.3 Initialize client state from server-provided payloads and skip the redundant first full client fetch when initial data is available.

## 3. Client Refresh And State Handling

- [x] 3.1 Parallelize full workspace refreshes for hotspots, daily brief, and data status where cache state permits.
- [x] 3.2 Preserve last usable hotspots, ranking, brief, and status when client refresh fails.
- [x] 3.3 Add clear unavailable, connected-empty, filter-empty, loading, and refresh-error messages.

## 4. Component Foundation

- [x] 4.1 Extract workspace data loading state/effects into a focused hook.
- [x] 4.2 Extract map projection/path/label calculations into a focused hook or map utility module.
- [x] 4.3 Extract map renderer and hotspot marker layer from `news-map.tsx`.
- [x] 4.4 Extract the ranking list from `news-map.tsx`; keep the larger side-panel detail body in place for a later, lower-risk extraction.
- [x] 4.5 Keep existing search, pan/zoom, hover, ranking click, region detail, channel detail, enrichment, and trend behavior working.

## 5. Resilience And Responsive UI

- [x] 5.1 Add a client-side Error Boundary around the interactive workspace.
- [x] 5.2 Add stable marker keys and transition styling for marker updates.
- [x] 5.3 Add baseline mobile layout CSS for viewports below 768px.

## 6. Verification

- [x] 6.1 Run `openspec validate stabilize-first-screen-and-component-foundation`.
- [x] 6.2 Run `npm run typecheck`.
- [x] 6.3 Run `npm run build`.
- [x] 6.4 Run relevant Python tests.
- [x] 6.5 Browser-verify initial render, map markers, filtering/search, region/channel details, empty/error states where practical, and mobile-width layout.
