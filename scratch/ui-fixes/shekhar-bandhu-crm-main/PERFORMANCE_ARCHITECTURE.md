# Performance & Codebase Hygiene

## What changed
- Sidebar defaults to compact/collapsed groups and remembers the user choice.
- Data tables use tighter FlatList virtualization settings.
- API GET requests use bounded SWR caching + request deduplication without timestamp cache-busting.
- Writes invalidate only the affected domain and dashboard aggregates instead of flushing every cached screen.
- Dashboard analytics and expiry data load on demand rather than during first paint.
- Development scratch/archive scripts are excluded from the production source archive.

## Operating rule
Keep feature code inside `admin-crm/app`, reusable UI inside `admin-crm/components`, API/domain types inside `admin-crm/utils`, and production scripts inside `server/scripts`. Do not add one-off repair scripts to the application tree; place temporary migrations under `server/scripts` with a documented purpose.
