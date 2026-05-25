## ADDED Requirements

### Requirement: Dynamic attitude color scale
The workspace map SHALL use a dynamic Goldstein color scale for the current hotspot result set so users can distinguish attitude differences in dense map views.

#### Scenario: User views current map results
- **WHEN** hotspot results contain valid weighted Goldstein values
- **THEN** map markers, marker hover attitude color, and ranking item attitude color use the current result set P5~P95 Goldstein range
- **AND** the displayed Goldstein numeric values remain unchanged

#### Scenario: User changes map or filters
- **WHEN** the current hotspot result set changes because of viewport, date, topic, or text search
- **THEN** the dynamic color scale recalculates from the new result set
- **AND** marker and ranking colors remain consistent with each other

#### Scenario: User reads the map legend
- **WHEN** the map legend is open
- **THEN** it shows conflict, neutral/mixed, and cooperation labels
- **AND** it displays the current approximate Goldstein color range

#### Scenario: User opens stable explanatory views
- **WHEN** the user views hotspot details, 90-day trend charts, or data credibility explanations
- **THEN** those views continue to use the fixed Goldstein interpretation rather than the dynamic map color scale

#### Scenario: Dynamic scale is unavailable
- **WHEN** there are too few valid Goldstein values or the values are too tightly clustered
- **THEN** the UI falls back to a stable readable range without breaking marker, ranking, hover, or legend rendering
