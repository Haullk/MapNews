## ADDED Requirements

### Requirement: Sidebar-driven workspace filtering
The homepage SHALL expose date, topic, and unified search controls at the top of the left sidebar, with sorting in the result list header.

#### Scenario: User changes date or topic
- **WHEN** the user changes date or topic in the left sidebar
- **THEN** the map and result list refresh using the selected filters
- **AND** the top toolbar does not show duplicate filter controls

#### Scenario: User changes sort
- **WHEN** the user changes the result list sort control
- **THEN** the result list and hotspot query use the selected sort order

### Requirement: Compact daily brief in toolbar
The workspace SHALL show a compact daily brief card in the top toolbar.

#### Scenario: Brief data is available
- **WHEN** a daily brief exists for the selected date
- **THEN** the card shows hotspot count, leading topics, and yesterday comparison
- **AND** the card does not show data import completeness text

#### Scenario: Brief is loading
- **WHEN** the brief is loading and no prior brief is available
- **THEN** the card shows a skeleton instead of blank space

### Requirement: Single primary color semantics
The workspace SHALL use Goldstein attitude as the primary color semantic for map markers and result list items.

#### Scenario: User compares marker and list item
- **WHEN** a hotspot appears on the map and in the result list
- **THEN** both surfaces use the same attitude color meaning
- **AND** topic is shown as text or inside topic-specific detail charts

### Requirement: Global keyword search
The workspace SHALL support global keyword search across stored hotspot, event, actor, and source fields without requiring GKG data.

#### Scenario: User searches from the sidebar
- **WHEN** the user uses the sidebar search form
- **THEN** the map and result list refresh using the search query

#### Scenario: Keyword does not match a local place name
- **WHEN** the user searches a keyword
- **THEN** the query runs globally for the selected date and topic
- **AND** the query does not include the current map bbox
- **AND** the map resets to a global view

#### Scenario: Keyword matches hotspot content
- **WHEN** matching hotspots are found
- **THEN** only matched channels participate in each region aggregate
- **AND** the selected sort order is still applied

#### Scenario: Empty search
- **WHEN** the user submits an empty search
- **THEN** region and keyword filters are cleared

### Requirement: Details drawer blank-click close
The workspace SHALL close the details drawer when the user clicks blank map space.

#### Scenario: Blank map click
- **WHEN** a detail drawer is open and the user clicks blank map background without dragging
- **THEN** the details drawer closes

#### Scenario: Marker click or map drag
- **WHEN** the user clicks a hotspot marker or drags the map
- **THEN** the details drawer does not close because of the blank-click behavior

### Requirement: Loading and marker transition polish
The workspace SHALL avoid abrupt blank states during loading and abrupt marker appearance.

#### Scenario: Initial sidebar load
- **WHEN** sidebar brief or results are loading without previous content
- **THEN** skeleton placeholders are shown

#### Scenario: Marker appears after viewport or filter changes
- **WHEN** a marker is newly rendered
- **THEN** it fades in quickly instead of appearing without transition

### Requirement: Minimal freshness status
The workspace SHALL show latest data freshness as a date-only badge in the top-right corner.

#### Scenario: Latest data date exists
- **WHEN** the workspace has a current or latest successful data date
- **THEN** the top-right badge shows that latest data date
- **AND** the workspace does not show data import completion, file progress, or completeness copy as persistent frontend status text
