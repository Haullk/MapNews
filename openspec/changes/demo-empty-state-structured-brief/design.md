## Context

The homepage currently has enough infrastructure for SSR data, explicit empty
messages, and a right-side details drawer. The remaining weak point is system
empty state: users need to understand what to do when data is missing. The
daily brief was reviewed as redundant for the current left sidebar and should be
removed from the primary workspace.

## Design

### Sidebar Brief Removal

The left sidebar will no longer render a `今日态势简报` block. The homepage
will also stop requesting daily brief data during initial workspace render and
client full refreshes. The `/api/daily-brief` route and worker-generated
`daily_briefs` table can remain for future use, but they are not part of the
current primary workspace.

### Demo Mode

Demo mode is frontend-only and activated only when there are no real hotspots
and the workspace is in a system-empty state:

- database unavailable; or
- database connected but `currentDataDate` is missing; or
- no available dates and no real hotspots.

Demo hotspots are sample `MapHotspot` objects with negative IDs and visible
copy saying "演示数据". They are used to keep the map understandable during
setup, not to simulate real current news. Clicking demo hotspots opens a local
demo detail drawer and does not call source enrichment.

When real data exists but the current filter/map viewport returns zero results,
the UI does not enter demo mode. It shows scoped no-result copy instead.

### Import Status

`DataStatus` will add optional `latestImportBatch` metadata:

- import date
- status fields
- files imported/total
- started/completed timestamps
- error message

The UI will summarize this inside the sidebar and demo/empty state.

## Risks

- Demo mode can harm trust if it looks real. Mitigation: label every demo
  surface clearly and keep operational state copy adjacent to the demo map.
- Removing the brief can make the sidebar feel more utilitarian. Mitigation:
  keep ranking, filters, data status, and the detail drawer as the primary
  navigation model.
