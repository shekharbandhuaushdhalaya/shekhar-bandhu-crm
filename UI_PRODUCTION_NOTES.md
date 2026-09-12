# UI / UX Production Hardening — September 2026

## What changed
- Reworked the shared design system around a calm, accessible botanical-green palette with warm neutral surfaces.
- Added consistent semantic colors for success, warning, danger, info and pipeline states.
- Expanded spacing, radius and typography tokens for consistent future screens.
- Modernized the persistent desktop sidebar with larger targets, clearer grouping, stronger active states and branded workspace context.
- Modernized the shared `ScreenHeader` with clearer hierarchy, responsive actions and accessibility labels.
- Refined the shared `DataTable` with clearer headers, more comfortable rows and improved scanability.
- Refined the global shell/header and responsive logo treatment.
- Updated app appearance/splash configuration to match the new light-first design while retaining dark-theme support.
- Refined login branding to match the new visual system.

## Production UX principles
1. Fewer visual decisions and one clear primary action per context.
2. Larger targets for users with limited computer experience.
3. Clear hierarchy: title → context → action → data.
4. Semantic color used for status rather than decoration.
5. Responsive layouts that simplify on smaller screens.
6. Consistent cards, tables, headers and navigation through shared tokens.
7. Accessibility roles/labels on key shared interactive controls.

## Validation
A dependency install was attempted for a TypeScript/Expo build check, but the execution environment timed out before completion. The partial dependency directory was removed from the deliverable.

Recommended final CI command:
`npm ci && npx tsc --noEmit && npx expo export --platform web`
