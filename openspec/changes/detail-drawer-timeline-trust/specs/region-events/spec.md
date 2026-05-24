## ADDED Requirements

### Requirement: Region event trace interface
The system SHALL keep a region-level event trace interface for internal data validation and future product exploration, but the MVP frontend SHALL NOT show a raw GDELT event timeline by default.

#### Scenario: Region events requested through the route handler
- **WHEN** `/api/region-events` is requested with valid `date`, `regionKey`, and optional `limit`
- **THEN** the system returns recent clean events for that region and date
- **AND** each event includes event time, event code display text, channel, Actor1, Actor2, Goldstein value, and source link fields when available

#### Scenario: User opens region situation tab
- **WHEN** a user opens the `地区态势` tab for a selected region
- **THEN** the frontend does not render a raw GDELT event timeline
- **AND** the frontend does not automatically request `/api/region-events`

#### Scenario: No clean events are available
- **WHEN** no `gdelt_events_clean` rows are available for the selected region and date
- **THEN** the route handler returns an empty events list with a clear status message
