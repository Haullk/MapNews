## ADDED Requirements

### Requirement: Attitude-first map polish
The workspace SHALL make attitude, heat, and trend easier to judge without exposing technical terminology.

#### Scenario: User scans the toolbar
- **WHEN** the daily brief is available
- **THEN** it appears as a compact horizontal data band with hotspot count, yesterday comparison, and leading topics
- **AND** the toolbar still does not show search, filters, or sorting controls

#### Scenario: User scans the result list
- **WHEN** hotspots appear in the result list
- **THEN** each item shows region name, topic, trend label, attitude value, and a heat bar
- **AND** the item uses attitude color rather than topic color

#### Scenario: User hovers a marker
- **WHEN** the user hovers a map hotspot
- **THEN** the hover card shows plain-language heat, event signal count, source count, topic, trend, and an attitude indicator
- **AND** the hover card does not show GDELT or QuadClass as persistent front-facing labels

#### Scenario: User reads the map legend
- **WHEN** the legend is visible
- **THEN** it labels the gradient as conflict tendency, neutral/mixed, and cooperation tendency
- **AND** it avoids academic wording as the primary title

#### Scenario: User opens hotspot overview
- **WHEN** the user opens the region overview
- **THEN** the overview includes an attitude indicator positioned by weighted attitude value

#### Scenario: User sees marker trend motion
- **WHEN** visible markers have warming, active, cooling, or no-comparison trends
- **THEN** warming pulses more visibly, active pulses slowly, cooling remains static, and reduced-motion preferences disable marker pulse animation
