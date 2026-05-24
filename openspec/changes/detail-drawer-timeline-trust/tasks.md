## 1. OpenSpec

- [x] 1.1 Create proposal, design, tasks, and spec deltas.
- [x] 1.2 Run `openspec validate detail-drawer-timeline-trust`.

## 2. Region Events Data

- [x] 2.1 Add `RegionEvent` type and `queryRegionEvents()` query helper.
- [x] 2.2 Add `/api/region-events` route handler with date, regionKey, and limit validation.
- [x] 2.3 Add event-code display labels for timeline rows.

## 3. Details Layout

- [x] 3.1 Remove the old left-panel `ranking/detail` tab behavior.
- [x] 3.2 Keep left panel global content and ranking always visible.
- [x] 3.3 Add right-side details drawer that appears only after a region hotspot is selected.
- [x] 3.4 Ensure desktop drawer compresses the map instead of covering it.

## 4. Details Content

- [x] 4.1 Extract region detail content into a focused component.
- [x] 4.2 Extract channel/source analysis content into a focused component.
- [x] 4.3 Add drawer tabs for `地区态势` and `来源分析`.
- [x] 4.4 Auto-preload and auto-trigger enrichment for the selected region's primary channel.
- [x] 4.5 Clicking a channel breakdown row switches to `来源分析` and highlights the selected channel.

## 5. Event Trace Interface And Trust

- [x] 5.1 Keep `/api/region-events` available for internal trace and future exploration.
- [x] 5.2 Hide raw GDELT event timeline from the MVP frontend.
- [x] 5.3 Avoid automatically requesting `/api/region-events` from the region detail tab.
- [x] 5.4 Add shared data trust and heat explanation panel in the details drawer.

## 6. Reader-Friendly Region Detail

- [x] 6.1 Rewrite region hero as a plain-language hotspot overview.
- [x] 6.2 Move theme breakdown ahead of trend and situation distribution.
- [x] 6.3 Replace raw heat-first presentation with heat level and ranking context.
- [x] 6.4 Add per-theme summaries and clear source-analysis action labels.
- [x] 6.5 Soften technical QuadClass/Goldstein copy as supporting context.

## 7. Reader-Friendly Source Analysis

- [x] 7.1 Consolidate channel/source/domain/story metrics into source-analysis hero.
- [x] 7.2 Remove duplicate region/theme/heat/source definition block.
- [x] 7.3 Remove `为什么热` and `主题与参与方` sections from source analysis.
- [x] 7.4 Keep story groups, source quality, uncertainty, representative sources, and shared trust panel.

## 8. Theme Donut And Source Theme Switching

- [x] 8.1 Document theme donut and source theme switching in the active OpenSpec change.
- [x] 8.2 Replace the region theme card list with a single heat-share donut chart.
- [x] 8.3 Support hover, focus, click, and keyboard selection for donut segments.
- [x] 8.4 Add source-analysis theme switch buttons that reuse the existing hotspot loading and enrichment flow.
- [x] 8.5 Verify the map marker visual language remains unchanged.

## 9. Verification

- [x] 9.1 Run `openspec validate detail-drawer-timeline-trust`.
- [x] 9.2 Run `npm run typecheck`.
- [x] 9.3 Run `npm run build`.
- [x] 9.4 No worker-adjacent Python changes; Python tests not required for this change.
- [x] 9.5 Browser-verify theme donut hover/click, source theme switching, and unchanged marker/ranking selected states.
