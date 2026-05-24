## ADDED Requirements

### Requirement: Data trust and heat explanation
The details drawer SHALL provide a shared explanation of data source, metrics, and limitations.

#### Scenario: User opens selected hotspot details
- **WHEN** a user views a selected hotspot in the right detail drawer
- **THEN** a collapsible data trust section is available below the detail tabs

#### Scenario: Data trust section expanded
- **WHEN** the user expands the data trust section
- **THEN** it explains that the source is GDELT Events
- **AND** it explains Goldstein as an automated CAMEO conflict-cooperation signal
- **AND** it shows the current heat formula and region aggregate heat policy
- **AND** it warns that news reporting volume is not the same as real-world event volume

#### Scenario: Selected hotspot has freshness metadata
- **WHEN** selected hotspot freshness or source metrics are available
- **THEN** the data trust section shows current event count, source count, and data update time
