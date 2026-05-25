## 1. OpenSpec

- [x] 1.1 Create proposal, design, tasks, and spec delta.
- [x] 1.2 Run `openspec validate workspace-toolbar-global-search`.

## 2. Toolbar And Sidebar

- [x] 2.1 Move homepage toolbar rendering into the client workspace.
- [x] 2.2 Move date, topic, sort, and unified search controls out of the old static page header.
- [x] 2.3 Remove the old left-sidebar filter block.
- [x] 2.4 Add a compact daily brief card to the left sidebar.
- [x] 2.5 Move date, topic, and search into the left sidebar and move the daily brief into the toolbar.
- [x] 2.6 Move sorting into the result list header.
- [x] 2.7 Replace persistent data import status copy with a top-right latest-data date badge.

## 3. Data And API

- [x] 3.1 Extend daily brief data with yesterday hotspot delta.
- [x] 3.2 Add `q` support to `/api/hotspots`.
- [x] 3.3 Ensure keyword search is global and ignores bbox.
- [x] 3.4 Ensure search aggregation includes only matched channels.

## 4. Visual And Interaction Polish

- [x] 4.1 Unify result list colors to Goldstein attitude colors.
- [x] 4.2 Add sidebar loading skeletons and refresh copy.
- [x] 4.3 Add marker fade-in and smoother marker transitions.
- [x] 4.4 Close details drawer on map blank click without affecting drag or marker click.

## 5. Verification

- [x] 5.1 Run `openspec validate workspace-toolbar-global-search`.
- [x] 5.2 Run `npm run typecheck`.
- [x] 5.3 Run `npm run build`.
- [x] 5.4 Browser-verify toolbar controls, search, brief card, colors, skeletons, blank-click close, and detail interactions.
- [x] 5.5 Re-run OpenSpec, typecheck, build, and browser smoke after the layout refinement.
