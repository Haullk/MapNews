## 1. Search And Filters

- [x] 1.1 Remove frontend `region` from workspace filter state.
- [x] 1.2 Make matched place search perform only map positioning and hotspot selection.
- [x] 1.3 Make unmatched search use `q` and expose a closable search chip.
- [x] 1.4 Add a separate closable location chip.

## 2. Viewport Data Flow

- [x] 2.1 Query map markers with current bbox, date, channel, q, and sort.
- [x] 2.2 Query ranking without bbox so it follows filters rather than viewport.
- [x] 2.3 Keep API/DB `region` support available as a low-level capability.
- [x] 2.4 Add user feedback for one-character keyword searches.
- [x] 2.5 Add user feedback while location search is matching hotspot data.

## 3. Map UI

- [x] 3.1 Update overlay copy to show visible, total, and hidden-overlap counts.
- [x] 3.2 Add zoom in, zoom out, global reset, and fit-result controls.
- [x] 3.3 Make the attitude legend collapsible.

## 4. Verification

- [x] 4.1 Run `openspec validate map-app-search-filtering`.
- [x] 4.2 Run `npm run typecheck`.
- [x] 4.3 Run `npm run build`.
- [x] 4.4 Browser-check default view, location search, keyword search, viewport ranking sync, and map controls.
