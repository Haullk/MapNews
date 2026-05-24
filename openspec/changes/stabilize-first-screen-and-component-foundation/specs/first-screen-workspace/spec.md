## ADDED Requirements

### Requirement: Server-provided initial workspace data
The system SHALL provide initial map hotspots and the daily brief from the
server-rendered homepage when displayable data is available.

#### Scenario: Homepage opens with available data
- **WHEN** a user opens the MapNews homepage and the database contains displayable hotspots
- **THEN** the first rendered workspace includes hotspots, ranking data, status, dates, channels, and the daily brief without waiting for the first client hotspot request

#### Scenario: Server initial data query fails
- **WHEN** the server cannot query initial workspace data
- **THEN** the homepage renders a clear database-unavailable state instead of an indefinitely loading map

### Requirement: Client refresh preserves usable data
The system SHALL keep the last usable workspace data visible when a client-side
refresh fails.

#### Scenario: Viewport refresh fails after data is visible
- **WHEN** hotspots are visible and a subsequent viewport or filter refresh fails
- **THEN** the previous hotspots remain visible and the workspace shows an error message for the failed refresh

#### Scenario: Successful filter returns no hotspots
- **WHEN** a user applies a filter or map viewport that successfully returns zero hotspots
- **THEN** the workspace shows a no-results message that suggests adjusting filters or the map range

### Requirement: Explicit empty and unavailable states
The system SHALL distinguish between unavailable database, connected-but-empty
data, and current-filter-empty states.

#### Scenario: Database is unavailable
- **WHEN** the database connection is unavailable
- **THEN** the user sees an unavailable-state message that explains the data source cannot currently be reached

#### Scenario: Database is connected but has no display data
- **WHEN** the database is connected but no map hotspots are available
- **THEN** the user sees an empty-state message that explains data may need to be imported or processed

#### Scenario: Current filter has no results
- **WHEN** the database has data but the current date, theme, region, or viewport has no matching hotspots
- **THEN** the user sees a scoped no-results message without implying that the whole system has no data

### Requirement: Mobile baseline usability
The system SHALL provide a basic usable layout on narrow screens.

#### Scenario: User opens on a narrow viewport
- **WHEN** the viewport width is below 768 pixels
- **THEN** the map and side panel stack vertically without horizontal overflow

#### Scenario: User interacts with hotspots on a narrow viewport
- **WHEN** a user taps a hotspot marker on a narrow viewport
- **THEN** the detail content is reachable without losing access to the map

### Requirement: Smooth marker updates
The system SHALL use stable marker identity and lightweight transitions for map
hotspot updates.

#### Scenario: Hotspot data updates for the same region
- **WHEN** a hotspot for an existing region updates because of filtering, date selection, or viewport refresh
- **THEN** the marker updates position and visual state without unnecessary destroy/recreate flicker

#### Scenario: Map marker appears or changes
- **WHEN** markers appear, move, or update heat state
- **THEN** the visual transition is smooth enough that the update does not look like a rendering fault
