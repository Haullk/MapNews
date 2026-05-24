## ADDED Requirements

### Requirement: Persistent global sidebar with detail drawer
The homepage SHALL keep global browsing controls and ranking visible while showing selected hotspot details in a separate drawer on desktop.

#### Scenario: Initial homepage load
- **WHEN** a user opens the homepage without selecting a hotspot
- **THEN** the left global sidebar and map are visible
- **AND** the right detail drawer is not visible

#### Scenario: User selects a map hotspot
- **WHEN** a user clicks a map hotspot
- **THEN** the right detail drawer appears
- **AND** the drawer opens the `地区态势` tab
- **AND** the left global sidebar still shows ranking and filters

#### Scenario: User selects a ranking item
- **WHEN** a user clicks a ranking item
- **THEN** the map focuses the hotspot
- **AND** the right detail drawer appears with the `地区态势` tab active

### Requirement: Separate region situation and source analysis
The details drawer SHALL separate region-level situation analysis from channel-level source analysis.

#### Scenario: Region situation tab
- **WHEN** a region hotspot is selected
- **THEN** the `地区态势` tab shows region summary, metrics, trend, QuadClass distribution, actors, and channel breakdown

### Requirement: Reader-friendly region situation
The region situation tab SHALL explain selected hotspots in ordinary news-reader language before showing technical metrics.

#### Scenario: Region situation summary
- **WHEN** a region hotspot is selected
- **THEN** the top of the `地区态势` tab shows a plain-language hotspot overview
- **AND** the overview emphasizes dominant theme, heat level, trend direction, and source coverage
- **AND** raw heat score and formula details are not the primary first-read content

#### Scenario: Theme breakdown priority
- **WHEN** the `地区态势` tab is shown
- **THEN** theme breakdown appears before trend charts and technical situation distribution
- **AND** the breakdown is shown as a single donut chart using channel heat-share proportions
- **AND** selecting a donut segment opens the matching source analysis

#### Scenario: Technical labels
- **WHEN** QuadClass and Goldstein information is shown
- **THEN** it is presented as supporting context rather than the main headline

#### Scenario: Source analysis tab before channel data is ready
- **WHEN** a user opens `来源分析` before a channel detail is available
- **THEN** the tab remains selectable and shows a loading or empty state instead of being disabled

#### Scenario: User selects a channel from region detail
- **WHEN** a user clicks a channel breakdown donut segment
- **THEN** the drawer switches to `来源分析`
- **AND** the selected channel detail is shown and highlighted

#### Scenario: Primary channel preload
- **WHEN** a region hotspot is selected
- **THEN** the system preloads the primary channel detail
- **AND** it starts the existing source enrichment flow when the channel detail still needs enrichment

#### Scenario: Theme donut hover and keyboard interaction
- **WHEN** a user hovers or focuses a theme donut segment
- **THEN** the segment is visually emphasized
- **AND** the donut center shows that theme's name, heat share, and source count
- **AND** pressing Enter or Space opens the matching source analysis

### Requirement: Reader-friendly source analysis
The source analysis tab SHALL avoid repeating region summary content and focus on source traceability.

#### Scenario: Source analysis summary
- **WHEN** a channel detail is shown in `来源分析`
- **THEN** the top diagnosis consolidates channel, source count, domain count, representative source count, and story-group count
- **AND** a separate definition-list block for region, theme, heat score, and source count is not shown

#### Scenario: Source analysis theme switching
- **WHEN** a region hotspot has multiple themes
- **THEN** the `来源分析` tab shows theme switch buttons for every theme in the selected region
- **AND** the current theme is highlighted
- **AND** selecting another theme reuses the existing channel detail loading and enrichment flow
- **AND** the theme switch buttons remain visible when the detail is loading or empty

#### Scenario: Source analysis sections
- **WHEN** a channel detail is shown in `来源分析`
- **THEN** the tab does not show the region-level `为什么热` section
- **AND** the tab does not show the `主题与参与方` section
- **AND** the tab keeps story groups, source quality, uncertainty, representative sources, and the shared data trust panel

### Requirement: Marker visuals remain unchanged
This change SHALL preserve the current marker visual language.

#### Scenario: Detail drawer implementation
- **WHEN** the details drawer is implemented
- **THEN** map markers do not regain channel letters, multi-color rings, or emoji icons
