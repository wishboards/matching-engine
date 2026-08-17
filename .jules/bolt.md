## 2024-08-06 - Optimized Rule Evaluation

**Learning:** When writing performance enhancements, repeated $O(N)$ operations against large arrays (like an entire rule set) compound when functions chain together.
**Action:** Filtering an array once and evaluating rules directly avoids redundant loops when calling multiple independent helpers (`getExpandedDesired`, `getCrossMatchedDesired`).

## 2024-08-07 - RegExp Compilation in Hot Paths

**Learning:** Recompiling Regular Expressions using `new RegExp()` inside a highly iterative function like `hasToken` adds severe CPU and memory pressure, creating an O(N) complexity issue out of a function assumed to be O(1).
**Action:** When working on matching or rules engines that heavily rely on repeated regex generation based on variables, always use a `Map` cache (capped to a maximum size to avoid leaks) to reuse the compiled `RegExp` instances.

## 2024-06-25 - [Matching Engine Performance Caching]

**Learning:** Found multiple bottlenecks in `matchingEngine.ts` caused by recalculations and redundant iterations across large rule sets. For example, `parseAttributesInput` was unnecessarily re-parsing the same object repeatedly. In `isCompatible`, computing `allCategories` looped over every rule to map target attributes, and `hasToken` normalized the full string again for every check. Additionally, `getRuleIndex` wasn't caching `target_attribute`s forcing recalculations later. Finally, `normalizeArrayInput` was creating multiple arrays with `.flatMap()` leading to slow performance on large profile objects.
**Action:** Caching parsing (`parsedAttributesCache`), pre-indexing target attributes directly into `RuleIndex.all_target_attributes`, implementing early returns, rewriting flatMap to native loops, and avoiding string token normalization on cache hits yielded >20% better throughput on high rule/profile density. Next time, always check if `.flatMap` and map-over-arrays inside high-frequency checks like `isCompatible` can be natively looped or cached in index caches!

## 2024-08-14 - normalizeArrayInput optimization and SonarCloud

**Learning:** Replacing `.flatMap().map().filter()` with a native `for...of` loop provides a ~50% performance increase in `normalizeArrayInput`. However, to pass SonarCloud's strict checks on coercing `unknown` types to string, it's necessary to explicitly type-narrow/cast the values (e.g., checking if it's a string, number, or boolean before calling `String()`).
**Action:** When converting chained array operations to native loops in this codebase, ensure `unknown` types are properly narrowed before string coercion to satisfy the CI quality gate, maintaining both performance and code health.

## 2024-08-06 - Pre-parsing outside nested loops

**Learning:** Avoid executing identical string allocations and array manipulation (like `.split(',').map(...)`) inside a nested loop if they only depend on the outer/inner collection variables that don't change.
**Action:** When iterating over combinations (e.g. comparing many items against many rules), identify operations tied to just one of the collections and hoist them outside the loop entirely.
