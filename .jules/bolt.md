## 2024-08-06 - Rule Index Caching Optimization

**Learning:** O(N^2) bottlenecks in repeated evaluation over static lists can be efficiently resolved without altering public signatures by using `WeakMap` to cache an index on the array object reference itself. Furthermore, short-circuiting logical ANDs (like `triggerMatch && contextMatch`) before evaluating expensive inner branches yields disproportionately massive performance boosts.
**Action:** When asked to optimize redundant filtering loops over static arrays passed by reference, consider caching the grouped data in a `WeakMap<Array, Index>` so it scales without breaking backwards compatibility. Additionally, always look for opportunities to early return before evaluating nested complex sub-routines.

## 2024-08-07 - RegExp Compilation in Hot Paths

**Learning:** Recompiling Regular Expressions using `new RegExp()` inside a highly iterative function like `hasToken` adds severe CPU and memory pressure, creating an O(N) complexity issue out of a function assumed to be O(1).
**Action:** When working on matching or rules engines that heavily rely on repeated regex generation based on variables, always use a `Map` cache (capped to a maximum size to avoid leaks) to reuse the compiled `RegExp` instances.

## 2024-06-25 - [Matching Engine Performance Caching]

**Learning:** Found multiple bottlenecks in `matchingEngine.ts` caused by recalculations and redundant iterations across large rule sets. For example, `parseAttributesInput` was unnecessarily re-parsing the same object repeatedly. In `isCompatible`, computing `allCategories` looped over every rule to map target attributes, and `hasToken` normalized the full string again for every check. Additionally, `getRuleIndex` wasn't caching `target_attribute`s forcing recalculations later. Finally, `normalizeArrayInput` was creating multiple arrays with `.flatMap()` leading to slow performance on large profile objects.
**Action:** Caching parsing (`parsedAttributesCache`), pre-indexing target attributes directly into `RuleIndex.all_target_attributes`, implementing early returns, rewriting flatMap to native loops, and avoiding string token normalization on cache hits yielded >20% better throughput on high rule/profile density. Next time, always check if `.flatMap` and map-over-arrays inside high-frequency checks like `isCompatible` can be natively looped or cached in index caches!

## 2024-08-14 - normalizeArrayInput optimization and SonarCloud

**Learning:** Replacing `.flatMap().map().filter()` with a native `for...of` loop provides a ~50% performance increase in `normalizeArrayInput`. However, to pass SonarCloud's strict checks on coercing `unknown` types to string, it's necessary to explicitly type-narrow/cast the values (e.g., checking if it's a string, number, or boolean before calling `String()`).
**Action:** When converting chained array operations to native loops in this codebase, ensure `unknown` types are properly narrowed before string coercion to satisfy the CI quality gate, maintaining both performance and code health.

## 2026-08-16 - [Early Returns in Expansion Layers]

**Learning:** Eagerly computing all possible expansion values (synonyms, cross-matches) and merging them into a single Set before checking for a match causes unnecessary allocations and GC overhead.
**Action:** Evaluate expansion layers sequentially, returning early if a match is found before computing subsequent, potentially expensive layers.
