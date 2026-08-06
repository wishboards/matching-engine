## 2024-08-06 - Rule Index Caching Optimization

**Learning:** O(N^2) bottlenecks in repeated evaluation over static lists can be efficiently resolved without altering public signatures by using `WeakMap` to cache an index on the array object reference itself. Furthermore, short-circuiting logical ANDs (like `triggerMatch && contextMatch`) before evaluating expensive inner branches yields disproportionately massive performance boosts.
**Action:** When asked to optimize redundant filtering loops over static arrays passed by reference, consider caching the grouped data in a `WeakMap<Array, Index>` so it scales without breaking backwards compatibility. Additionally, always look for opportunities to early return before evaluating nested complex sub-routines.
