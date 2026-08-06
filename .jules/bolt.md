## 2024-08-06 - Pre-parsing outside nested loops

**Learning:** Avoid executing identical string allocations and array manipulation (like `.split(',').map(...)`) inside a nested loop if they only depend on the outer/inner collection variables that don't change.
**Action:** When iterating over combinations (e.g. comparing many items against many rules), identify operations tied to just one of the collections and hoist them outside the loop entirely.
