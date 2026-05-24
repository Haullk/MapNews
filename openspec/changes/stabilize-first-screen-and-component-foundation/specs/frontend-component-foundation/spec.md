## ADDED Requirements

### Requirement: Workspace rendering boundary
The system SHALL protect the homepage from full-page failure when the interactive
workspace throws a client-side render error.

#### Scenario: Workspace render error
- **WHEN** the interactive workspace fails during client rendering
- **THEN** the homepage shows a clear recoverable error state instead of a blank page

### Requirement: Focused workspace component ownership
The system SHALL separate major workspace responsibilities into focused
components or hooks.

#### Scenario: Workspace data loading logic changes
- **WHEN** a developer modifies workspace data loading behavior
- **THEN** the change is localized to a workspace data hook or closely related data module rather than the full map rendering component

#### Scenario: Marker rendering changes
- **WHEN** a developer modifies hotspot marker visuals
- **THEN** the change is localized to marker rendering code rather than the side panel or data-loading code

#### Scenario: Side panel ranking changes
- **WHEN** a developer modifies ranking-list presentation
- **THEN** the change is localized to side panel or ranking components rather than map projection or marker code

### Requirement: Behavior-preserving extraction
The system SHALL preserve existing core workspace behavior while extracting
components.

#### Scenario: User opens the map after extraction
- **WHEN** a user opens the homepage after the component extraction
- **THEN** map rendering, hotspot markers, ranking, hover cards, region details, channel details, filtering, search, and zoom/pan behavior remain available

#### Scenario: Verification after extraction
- **WHEN** the extraction is complete
- **THEN** typecheck, build, relevant tests, and browser verification pass before the change is considered complete
