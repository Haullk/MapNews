## ADDED Requirements

### Requirement: Clearly labelled demo mode for system-empty states
The homepage SHALL provide a clearly labelled demo mode when no real map
hotspots are available because the data system is unavailable, empty, or still
waiting for import output.

#### Scenario: Database unavailable
- **WHEN** the homepage cannot reach the database
- **THEN** the map can show sample demo hotspots
- **AND** the sidebar clearly says the points are demo data
- **AND** the copy explains that real data will appear when the data service is restored

#### Scenario: Database connected but no display data
- **WHEN** the database is connected but has no displayable hotspots
- **THEN** the user sees demo mode with import/data status context
- **AND** the UI does not imply that demo hotspots are current real news

#### Scenario: Filter returns no results
- **WHEN** real data exists but the current filter or viewport returns zero hotspots
- **THEN** the UI shows a scoped no-results message
- **AND** demo mode is not used

### Requirement: Daily brief removed from primary workspace
The homepage SHALL not show the daily brief block in the primary left sidebar.

#### Scenario: Real data is available
- **WHEN** the homepage renders with displayable hotspots
- **THEN** the left sidebar starts with filters, data status, and ranking
- **AND** no `今日态势简报` block is shown

#### Scenario: Workspace refreshes
- **WHEN** the homepage refreshes workspace data
- **THEN** it does not request daily brief data for the hidden sidebar brief

### Requirement: Import status context
The workspace SHALL expose latest import batch context in user-facing empty and
demo states.

#### Scenario: Latest import batch exists
- **WHEN** the database has a latest import batch
- **THEN** the sidebar can show import date, status, and imported file progress

#### Scenario: Latest import batch has an error
- **WHEN** the latest import batch contains an error message
- **THEN** the empty/demo state includes a concise operational warning
