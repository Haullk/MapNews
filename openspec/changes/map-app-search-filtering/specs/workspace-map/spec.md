## ADDED Requirements

### Requirement: Location search does not filter data
The workspace SHALL treat map-place search as positioning rather than data filtering.

#### Scenario: User searches a known map place
- **WHEN** the user searches a term that matches a local country, region, or place
- **THEN** the map moves to that place
- **AND** the workspace does not write a region filter into the main data query
- **AND** the location state is shown separately from data filters

#### Scenario: User clears the search box
- **WHEN** the user submits an empty search
- **THEN** the workspace clears keyword search and location state
- **AND** the map returns to the global view

### Requirement: Keyword search filters map and global ranking
The workspace SHALL use unmatched search terms as keyword filters for both map markers and ranking, while keeping ranking independent from viewport clipping.

#### Scenario: User searches an unmatched keyword
- **WHEN** the search term does not match a local map place
- **THEN** the map hotspots query includes bbox, date, topic, and q
- **AND** the ranking query includes date, topic, and q without bbox
- **AND** a closable search chip is shown

#### Scenario: User searches a one-character keyword
- **WHEN** the search term does not match a local map place and has fewer than two characters
- **THEN** the workspace does not run keyword filtering
- **AND** it tells the user that search requires at least two characters

### Requirement: Ranking stays independent from viewport
The workspace SHALL keep the ranking list scoped to data filters rather than current map viewport.

#### Scenario: User pans or zooms the map
- **WHEN** the viewport changes
- **THEN** the hotspot markers refresh for the new bbox
- **AND** the ranking list is not clipped to the new bbox

### Requirement: Map app controls and declutter feedback
The workspace SHALL provide basic map controls and explicit marker declutter feedback.

#### Scenario: Markers are hidden by decluttering
- **WHEN** visible marker count is lower than the current result count
- **THEN** the overlay states the visible count, total count, and hidden overlap count
- **AND** it suggests zooming in to see more

#### Scenario: User uses map controls
- **WHEN** the user activates zoom, global reset, fit-result, or legend toggle controls
- **THEN** the map responds without changing date, topic, or keyword filters
