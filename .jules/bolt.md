## 2024-08-06 - Redundant Array Traversal for Acceptance Rules
**Learning:** In matching engines where large arrays of rules are passed through multiple functions, avoiding re-filtering the same exact set (O(N) operation) repeatedly in helper functions yields measurable performance benefits.
**Action:** Always check if a pre-filtered array or subset can be passed down into helper methods when they need the exact same filtered subset. Use optional parameters to preserve backward compatibility for other callers.
