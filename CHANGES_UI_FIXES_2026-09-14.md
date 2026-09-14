# UI Fixes — 2026-09-14

## Root cause found and fixed: dashboard header/tabs gap (the screenshot issue)

`components/WorkspacePrimitives.tsx`'s `WorkspaceTabs` rendered its
horizontal `ScrollView` with no explicit `style` prop — only
`contentContainerStyle`. On web, a `ScrollView` without an explicit style
defaults to `flexGrow: 1`, so it stretches to fill all remaining space in
its flex-column parent. Since its content container also sets
`alignItems: 'flex-end'`, the actual tab row then gets pinned to the
*bottom* of that now-oversized box — producing exactly the symptom in the
screenshot: header, a large blank gap, then the tab row sitting low.

Fixed by giving the ScrollView an explicit
`style={{ flexGrow: 0, flexShrink: 0 }}` so it sizes to its content
instead of stretching.

**The same missing-`style` pattern was found in 16 other places** across
the app (filter-chip rows and horizontal scroll strips) and fixed
identically:
`app/medicalreps.tsx`, `app/sales-workspace.tsx`, `app/campaigns.tsx`,
`app/inventories.tsx`, `app/contacts.tsx`, `app/doctors.tsx`,
`app/ai-analytics.tsx`, `app/compliance.tsx`,
`app/products/modals/ProductDetailModal.tsx`,
`app/products/modals/AddEditProductModal.tsx`,
`app/manufacturing/components/ProductionSchedulerTab.tsx`,
`app/manufacturing/components/MRPPlanTab.tsx`, and
`app/manufacturing/modals/StockTraceModal.tsx` (5 instances).

Verified with a clean `tsc --noEmit` and a successful `expo export -p web`
build after the change. I don't have a way to render/screenshot the web
build in this environment, so please do a visual sanity check on the
dashboard once you have this — the fix is based on a well-understood
React Native Web default behavior, not a visual confirmation.

## Other fixes from the last UX audit round

- **Accessibility labels** added to previously unlabeled icon-only
  buttons: hamburger menu and drawer close button (`app/_layout.tsx`),
  theme toggle and logout button (`components/Sidebar.tsx`).
- **Keyboard handling**: `app/orders.tsx`'s Edit Details modal (a bottom
  sheet on mobile, with several text inputs) now wraps its content in
  `KeyboardAvoidingView`, matching the pattern already correct in
  `app/quotations.tsx`. Previously the keyboard could cover lower fields
  on a phone with no compensation.
- **Pull-to-refresh** added to `app/ageing.tsx`, which was the one
  list/report screen missing it while every comparable screen
  (`orders.tsx`, `sales-workspace.tsx`, `medicalreps.tsx`, `doctors.tsx`)
  already had it.
- **Hardcoded color cleanup**: the stray `#0d9488` teal used for the
  "Challan" action pill/button in `app/orders.tsx` (4 occurrences) is now
  `colors.info` / `colors.infoLight` from the theme, so it's dark-mode
  aware and consistent with the rest of the app instead of a magic hex
  value outside the theme system.

## Not yet done (carried over from the last audit, still open)

- `DataTable` mobile card mode — the shared table component still forces
  horizontal scroll on phones; this is a bigger change (new rendering
  branch) than fit in this pass.
- Native `Alert.alert` used for the status filter in `orders.tsx` is
  still inconsistent with the app's own bottom-sheet system.
