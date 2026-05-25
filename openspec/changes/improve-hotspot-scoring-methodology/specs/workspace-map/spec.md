## ADDED Requirements

### Requirement: Workspace exposes scoring context
The workspace SHALL expose reporting heat and recent-baseline trend context returned by the hotspot API without presenting new complex attitude indicators.

#### Scenario: Hotspot list renders scoring fields
- **WHEN** the hotspot API returns `relativeHeatZScore`, `baselineDays`, and `scoreVersion`
- **THEN** the map, ranking, and detail views can render the hotspot without type errors
- **AND** user-facing copy describes heat as reporting heat

#### Scenario: Trend baseline is unavailable
- **WHEN** the API returns a trend label of `基线不足`
- **THEN** the workspace displays that state as a valid trend state
- **AND** it does not imply that the system failed to load data
