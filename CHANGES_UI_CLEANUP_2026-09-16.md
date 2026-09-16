# UI Cleanup — 2026-09-16

Fixes for the two issues reported: inputs showing two borders, and
multiple loaders appearing on the same screen. Verified with a clean
`npx tsc --noEmit` and a successful `npx expo export -p web`.

No business logic, routes, permissions or data-fetching behavior changed.

---

## 1. Double borders on inputs — fixed

**Cause.** `components/AppTextInput.tsx` (the shared input used by every
screen) always applies its own `borderWidth: 1`, `borderColor` and
`backgroundColor: colors.bg.card`. That's correct for a standalone
input, but in the "icon + input" search-box pattern the wrapper `View`
*also* draws a border — so you saw wrapper border + input border, plus a
card-colored input rectangle inside a card-colored box.

`AppTextInput` already supports opting out: it checks
`resolved.borderWidth === 0` (its `hasNoBorder` flag) and skips its focus
ring when set. Some screens passed `borderWidth: 0`; two did not.

**Fixed:**
- `app/stockmovements.tsx` — `input` style now has
  `borderWidth: 0, backgroundColor: 'transparent'` (it sits inside the
  bordered `searchBox` wrapper).
- `app/login.tsx` — `input` style now has
  `borderWidth: 0, backgroundColor: 'transparent'` (it sits inside the
  bordered `inputContainer`, used by all three login fields).

**Already correct, left alone:** `app/doctors.tsx` (`searchInput`),
`app/medicalreps.tsx` (`searchInput`), `app/sales-workspace.tsx`
(`searchInput` inside `searchBar`).

A repo-wide sweep for bordered input wrappers
(`searchBox` / `inputContainer` / `inputWrapper` / `searchWrap`) found no
other instances.

## 2. Multiple loaders — fixed

Two separate causes, both addressed.

### 2a. `audit.tsx` rendered two loading messages at once

`components/WorkspacePrimitives.tsx`'s `WorkspaceLoading` already renders
a skeleton **plus** a title **plus** a message. `app/audit.tsx` was
rendering `<WorkspaceLoading />` (giving "Loading workspace…" /
"Fetching the latest business data.") **and** its own
`<Text>Loading audit records...</Text>` underneath — three loading
messages stacked.

**Fixed:** the screen now passes its copy into the component
(`<WorkspaceLoading title="Loading audit records…" message="Fetching the latest activity log." />`)
and the duplicate `<Text>` is removed.

### 2b. Most `DataTable` screens never used its built-in skeleton

`components/DataTable.tsx` renders `<TableSkeleton />` when `isLoading`
is true. Of the 14 screens using `DataTable`, only **3** passed it — the
rest showed an empty table while their own separate loader sat above it,
or showed nothing at all on first load.

**Now passing `isLoading` (9 screens, up from 3):**
`pricing.tsx`, `products.tsx`, `stockmovements.tsx` (were already
correct), plus `payments.tsx`, `quotations.tsx`, `invoices/sale.tsx`,
`invoices/purchase.tsx`, `parties/customers.tsx`, `parties/vendors.tsx`.

Several of these screens had **no initial-loading state at all** (only
`refreshing`), so a first visit showed an empty table rather than a
skeleton. Each now has an initial-load flag cleared in its `load()`
function:
- `payments.tsx` — cleared in a `finally` block
- `quotations.tsx` — `load()` wrapped in `try/finally`
- `invoices/sale.tsx`, `invoices/purchase.tsx` — cleared at end of
  `load()`; paginated screens keep using `isLoadingMore` for page 2+, so
  the skeleton only shows on the initial load, not on "load more"
- `parties/customers.tsx`, `parties/vendors.tsx` — named `listLoading`
  deliberately, because both files already have a **different**
  `loading` state scoped to their ledger modal. Reusing that name would
  have made the main table flash its skeleton whenever a ledger modal
  fetched. This was verified before making the change.

### Intentionally NOT changed (5 screens)

`ageing.tsx`, `audit.tsx`, `contacts.tsx`, `gst-returns.tsx`,
`orders.tsx` all use `DataTable` with the `embedded` prop, nested inside
a parent that already owns the loading state for that region. Passing
`isLoading` to these would have introduced a *new* duplicate loader —
the opposite of the fix. They were left as-is by design.

Net rule applied: **one loading indicator per screen region.** If
`DataTable` owns the region, `DataTable` owns the loader.

---

## Still open (from the earlier audit, not addressed here)

- `DataTable` has no mobile card layout — data screens still scroll
  horizontally on phones.
- Status filter on `orders.tsx` still uses a native `Alert.alert` rather
  than the app's own bottom-sheet pattern.
- The Part B minimalism items (cards drawing border *and* shadow *and*
  background; divider-line reduction; status-pill consolidation) are
  design decisions rather than bug fixes and were left for you to
  direct.
