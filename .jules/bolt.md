## 2024-08-06 - Optimized Rule Evaluation

**Learning:** When writing performance enhancements, repeated $O(N)$ operations against large arrays (like an entire rule set) compound when functions chain together.

**Action:** Filtering an array once and evaluating rules directly avoids redundant loops when calling multiple independent helpers (`getExpandedDesired`, `getCrossMatchedDesired`).
