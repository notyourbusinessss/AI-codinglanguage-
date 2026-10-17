# Stability and versions

Ak is at 0.x. This page says what a release promises, so that "1.0" means something. Until 1.0 the same rules apply, but a breaking change may happen in any minor release (0.6 -> 0.7) as long as it follows the deprecation rule below.

## What is stable

A change to any of these is a breaking change:

- **The syntax and builtins in SPEC.md**, and the extra builtins in SPEC-extra.md: what a program that runs today prints tomorrow.
- **The `ak` command line**: the commands and flags in `ak --help`, their exit codes (0 success, 1 error, 2 usage) and what goes to stdout and stderr.
- **`use` and `use ... as`**: how paths are resolved and how names are kept apart.
- **Error kinds** (`errkind`) and the `error: message (file:line:col)` first line of an uncaught error.
- **The public functions of `lib/`** that docs/libraries.md documents. Functions it does not document are internal.

## What may change in any release

- Internals of `lib/` and `rt/`, the generated machine code, and the bytes of `bin/ak`.
- Performance, memory use and the exact wording of error messages after the first words.
- Layout details of `ak fmt` output. Formatting twice stays a no-op, and the formatted program means the same as the original.
- Anything marked "known limit" in the README, until it is fixed.
- Bugs. Making a program that relied on a bug fail with an error is a fix, not a breaking change, and goes under "Fixed" in the changelog.

## Deprecation

1. A feature that will go away prints a warning (`warning: ... is deprecated, use ...`) for at least one minor release before it is removed. The changelog names it under "Deprecated".
2. When a rewrite can be mechanical, the warning says how, and `ak fmt` or a note in the changelog shows the replacement.
3. Removal is listed under "Removed" in the changelog of the release that does it.

## The changelog

[`CHANGELOG.md`](../CHANGELOG.md) has one section per release, newest first, plus an "Unreleased" section that pull requests add to. A release pull request renames "Unreleased" to the version and date. `tests/version.test.js` fails when the current version has no section.

## Version numbers

The number lives in three places, and a test fails when they differ: `"version"` in `package.json`, `VERSION` in `src/main.aklang` (what `ak --version` prints; `bin/ak` must be rebuilt after changing it) and the release tag `vX.Y.Z` (the release workflow refuses a tag that does not match `package.json`).

- 0.MINOR.0: new features or breaking changes (before 1.0).
- 0.MINOR.PATCH: fixes only.
- From 1.0: MAJOR for breaking changes, MINOR for features, PATCH for fixes.
