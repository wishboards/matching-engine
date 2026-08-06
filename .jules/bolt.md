## 2024-06-25 - Avoid Dynamic RegExp Compilation for Hot Code Paths

**Learning:** Recompiling dynamic `RegExp` expressions (even short ones like word boundaries `\b`) inside a highly iterative matching engine has a huge performance cost. While emulating regex behaviour (like `\b` boundary checks) using `indexOf` and manual boundary checking is extremely fast, it introduces edge case bugs due to differing behaviour on non-word characters.
**Action:** When optimizing a hot path involving Regex, use a `Map` to cache the compiled `RegExp` object. This provides a safe, significant performance boost without altering complex and hard-to-emulate Regex behaviour like `\b` boundaries.
