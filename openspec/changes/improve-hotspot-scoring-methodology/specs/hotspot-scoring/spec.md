## ADDED Requirements

### Requirement: Hotspot scoring uses filtered evidence
The system SHALL keep all valid geocoded events in raw and cleaned tables while only allowing events with `effective_mentions >= 2` to contribute to map hotspot scoring.

#### Scenario: Low-mention event is cleaned but not scored
- **WHEN** a valid geocoded GDELT event has fewer than two effective mentions
- **THEN** the event is preserved in raw and cleaned event tables
- **AND** it does not contribute to `map_hotspots` aggregates

### Requirement: Heat score is log-scaled evidence
The system SHALL compute `heat_score` for a channel hotspot as `ln(1 + event_count) + ln(1 + mention_count) + ln(1 + source_domain_count)`.

#### Scenario: Hotspot heat is recalculated
- **WHEN** a processing run builds `map_hotspots`
- **THEN** each hotspot stores the log-scaled heat score
- **AND** event, mention, article, source, and domain counts remain available for display and audit

### Requirement: Trend uses recent historical baseline
The system SHALL classify hotspot trends using the previous seven available dates for the same `region_key + channel` and a Z-score when at least three baseline days exist.

#### Scenario: Sufficient baseline exists
- **WHEN** a hotspot has at least three prior baseline days
- **THEN** the system stores `baseline_mean`, `baseline_stddev`, `baseline_days`, and `relative_heat_zscore`
- **AND** it labels the trend using the configured Z-score thresholds

#### Scenario: Baseline is insufficient
- **WHEN** a hotspot has fewer than three prior baseline days
- **THEN** `relative_heat_zscore` is empty
- **AND** `trend_label` is `基线不足`

### Requirement: Goldstein aggregation preserves weight consistency
The system SHALL store `goldstein_weight` and use it consistently when aggregating `weighted_goldstein` from events to channel hotspots and from channel hotspots to region metrics.

#### Scenario: Region metric aggregates channel hotspots
- **WHEN** multiple channel hotspots exist for one region and date
- **THEN** the region `weighted_goldstein` is computed from channel `weighted_goldstein` values weighted by channel `goldstein_weight`
- **AND** it does not fall back to `event_count` weighting when `goldstein_weight` exists
