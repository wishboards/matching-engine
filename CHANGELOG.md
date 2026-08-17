# Changelog

## [1.1.2](https://github.com/wishboards/matching-engine/compare/matching-engine-v1.1.1...matching-engine-v1.1.2) (2026-08-17)


### Bug Fixes

* 🔒 update Improper RegExp Escaping Leading to Potential Logic Error ([#33](https://github.com/wishboards/matching-engine/issues/33)) ([c5d0c1d](https://github.com/wishboards/matching-engine/commit/c5d0c1dbd8e2913518b0db6e4575cdb882bfca7b))
* mitigate prototype pollution in parseAttributesInput ([#32](https://github.com/wishboards/matching-engine/issues/32)) ([bcb1340](https://github.com/wishboards/matching-engine/commit/bcb134034d46db5131c99d7239a1fa092f4014f4))


### Performance Improvements

* **bolt:** ⚡ Optimize Rule Evaluation Traversal ([#35](https://github.com/wishboards/matching-engine/issues/35)) ([8c50235](https://github.com/wishboards/matching-engine/commit/8c50235ee7d092039b0eb6cbf5266eb83a2d18d2))
* **bolt:** ⚡ Pre-parse rule targets in getExpandedDesired ([#34](https://github.com/wishboards/matching-engine/issues/34)) ([44d8cb3](https://github.com/wishboards/matching-engine/commit/44d8cb348316e0be963b8f18c161f281f670901f))
* **bolt:** ⚡ Remove redundant normalizeToken in hasToken ([#44](https://github.com/wishboards/matching-engine/issues/44)) ([e0b6313](https://github.com/wishboards/matching-engine/commit/e0b63139a1a8a870a6e87768685108cbaa3556a9))
* Caching rules and parsed objects on high frequency `isCompatible` loops ([0266db9](https://github.com/wishboards/matching-engine/commit/0266db9682edaadf36670600affe6e3d65eecef7))
* evaluate expansion layers sequentially with early returns in matchesAttribute ([#52](https://github.com/wishboards/matching-engine/issues/52)) ([eee67a9](https://github.com/wishboards/matching-engine/commit/eee67a9b487d2c2542d65a15a370892f07a6d8f4))
* **matchingEngine:** cache compiled RegExp in hasToken ([#38](https://github.com/wishboards/matching-engine/issues/38)) ([184b22b](https://github.com/wishboards/matching-engine/commit/184b22b9896dd43943fc376c297e6cb23b88feba))
* **matchingEngine:** optimize normalizeArrayInput with native loop ([#48](https://github.com/wishboards/matching-engine/issues/48)) ([f4e599b](https://github.com/wishboards/matching-engine/commit/f4e599b3010598a0ee62e186df7ce88da0309d45))
* Optimize matching engine array operations and inner loops ([#47](https://github.com/wishboards/matching-engine/issues/47)) ([253e118](https://github.com/wishboards/matching-engine/commit/253e118605b791bd7b55dd6dd393619bda0b2728))
* optimize rule condition evaluation to O(1) filtering ([#36](https://github.com/wishboards/matching-engine/issues/36)) ([e7bd67f](https://github.com/wishboards/matching-engine/commit/e7bd67f38f03d1cd6efb4dc8b597935e8007c9e8))

## [1.1.1](https://github.com/wishboards/matching-engine/compare/matching-engine-v1.1.0...matching-engine-v1.1.1) (2026-08-02)


### Bug Fixes

* add RELEASE_PLEASE_PAT token to release-please action ([#20](https://github.com/wishboards/matching-engine/issues/20)) ([323f0df](https://github.com/wishboards/matching-engine/commit/323f0df4873a637dfafa3e7a87b50ae1ca442e7a))
* generalize implicit attribute matching to be configuration-driven ([#18](https://github.com/wishboards/matching-engine/issues/18)) ([373058e](https://github.com/wishboards/matching-engine/commit/373058e29d73768f3b20ca9a0520b1c58807fb1a))

## [1.1.0](https://github.com/wishboards/matching-engine/compare/matching-engine-v1.0.2...matching-engine-v1.1.0) (2026-08-02)


### Features

* align repository & workflow standards with wishboard ([fdf80ea](https://github.com/wishboards/matching-engine/commit/fdf80ea2520662dc94f4a74ae01e922016c9fc2f))

## [1.0.2](https://github.com/wishboards/matching-engine/compare/matching-engine-v1.0.1...matching-engine-v1.0.2) (2026-08-02)


### Bug Fixes

* use npm 11.5.1+ for OIDC trusted publishing support ([0ca917d](https://github.com/wishboards/matching-engine/commit/0ca917d12c0815646afd9c6012261cb74978fcc5))

## [1.0.1](https://github.com/wishboards/matching-engine/compare/matching-engine-v1.0.0...matching-engine-v1.0.1) (2026-08-02)


### Bug Fixes

* establish repository standards and set up CI ([7c970e2](https://github.com/wishboards/matching-engine/commit/7c970e290cf9d4f804fbc331db5621b45bce2b1c))
