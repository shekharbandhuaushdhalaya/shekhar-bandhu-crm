# CRM UI/UX Polish Update — 2026-09-13

This continuation applies the requested visual and interaction pass to the Expo app. Business logic, data flow, and navigation routes are unchanged.

## Foundation

- Added the shared `Typography` scale in `constants/theme.ts` and moved component and screen text onto named display, heading, body, caption, and eyebrow tokens.
- Bundled Manrope and Inter weights locally under `admin-crm/assets/fonts/`; `app/_layout.tsx` loads them with `expo-font` and keeps the splash screen visible until font loading completes.
- Increased card definition with the warm brand two-layer shadow treatment and kept light/dark semantic colors intact.

## Shared interaction components

- Added `AppText`, `AppTextInput`, `WorkspaceButton`, `PressableOpacity`, and `WorkspaceTransition`. Existing callbacks, values, routes, and disabled states continue through these wrappers.
- Standardized primary, secondary, and ghost button variants, 44px touch targets, focused input borders, and muted placeholder colors.
- Workspace tabs now expose selected accessibility state, swap outline icons for filled icons when active, and animate content changes with a short reduced-motion-aware fade/slide.
- Status pills now use a consistent small dot, tinted background, radius, and readable casing.
- Loading states use the existing skeleton system with a deterministic shimmer instead of a bare spinner; tables keep sticky headers, horizontal scrolling, subtle zebra rows, and shared empty states.

## Screen sweep

- Applied the shared typography and touch wrappers across the app.
- Added shared headers to Orders, Audit, GST Returns, and Receivable Ageing.
- Moved Orders and Audit feeds, GST B2B invoices, and ageing invoice groups onto the shared `DataTable` pattern.
- Replaced repeated list empty states and custom status/badge views across sales, inventory, manufacturing, compliance, payments, MR, doctors, contacts, and reports.

## Validation

- TypeScript: passed (`tsc --noEmit`, zero diagnostics).
- Expo web export: passed with Expo SDK 54 and the existing app configuration.
- The generated web bundle contains all eight local font assets.
- Browser screenshot smoke testing could not run in this environment because a Playwright browser executable is unavailable; the production export itself completed successfully.

# CRM Dashboard & UI Polish Update

This release is a UI/UX refinement pass on top of the latest Sales + MR + customer self-service CRM build. Business workflows and inventory rules are intentionally unchanged.

## Dashboard
- Replaced the dense ecommerce/B2B card wall with four primary KPIs.
- Added a compact Business Pulse strip for secondary signals.
- Added four task-oriented shortcuts for Sales Workspace, Challans, MR My Day and Sales Intelligence.
- Kept detailed MR, Manufacturing and Marketing analytics behind quiet workspace tabs.
- Preserved low-stock and expiry attention panels while reducing visual competition.
- Added a cleaner welcome/date header and clearer action hierarchy.

## Shared UI system
- Added `components/WorkspacePrimitives.tsx` with reusable workspace header, quiet tabs, metric tiles, panels, empty states and status pills.
- Refined `ScreenHeader.tsx` so established CRM pages inherit cleaner spacing and button treatment.

## Sales Workspace
- Reworked page hierarchy and whitespace.
- Added consistent search, tabs, status pills and compact KPI cards.
- Reworked Quick Sale into a cleaner inline panel with consistent inputs/selectors.
- Improved order fulfillment cards and progress indicators.
- Polished schemes, returns and commissions layouts.

## Sales Intelligence
- Converted the screen to the shared workspace UI.
- Clean Action Center metrics and attention states.
- Polished Customer 360, collections, lost-sales and margin views.
- Added consistent empty states and attention/health pills.

## MR My Day
- Reworked into a task-first field workspace.
- Cleaner MR selector, next-visit panel and compact priority KPIs.
- Two-column follow-up/collection and coverage/focus-product sections.
- Improved field-effectiveness summary.

## Medical Representatives
- Added a proper page header and unified workspace tabs.
- Refined content width, card radius/shadows, selector surfaces, directory cards, attendance, visits, expenses and modals.
- Removed decorative emoji-heavy labels from operational UI in favor of normal copy and icons.
- Reduced all-caps form styling for better readability.

## Validation
- TypeScript parser audit across the complete `admin-crm` TS/TSX source: passed with zero syntax diagnostics.
- Relative imports for edited files: passed with zero broken imports.
- A full Expo dependency build was not run because dependencies are not installed in this execution environment.

# UI Audit Continuation — 2026-09-13

The follow-up audit is now applied without changing business logic or route names.

- Restored a mobile bottom tab bar for Dashboard, Orders, Sales, MR My Day and More. The More route opens the existing full drawer through a device event; desktop keeps the sidebar layout and legacy destinations remain drawer-only.
- Raised drawer, sidebar, header, modal and form controls to a 44px minimum touch target and added the current page label beside the mobile brand mark.
- Orders detail and edit dialogs use the same responsive treatment: centered constrained surfaces on desktop and bottom sheets on mobile. Quotation detail and edit/create surfaces use the same backdrop and mobile sheet sizing.
- Dashboard KPI cards now have a capped width so cards settle into predictable one, two or four-column layouts as the viewport grows.
- Shared DataTable embedded mode now uses FlatList virtualization. The Sales Workspace order pipeline and Medical Representatives directory use FlatList renderers instead of mapping their primary cards inside ScrollViews.
- Removed decorative emoji and symbol glyphs from operational UI copy, including order contact/payment labels, reports, inventory, manufacturing and MR surfaces. The Ayurvedic loader retains its Hindi phrases with a neutral typographic marker.

## Second-pass validation

- TypeScript: passed (`tsc --noEmit`, zero diagnostics).
- Expo web export: passed with Expo SDK 54 after the responsive navigation and modal changes.
- Operational UI emoji grep across `admin-crm/app`, `admin-crm/components` and `admin-crm/constants`: zero matches.
