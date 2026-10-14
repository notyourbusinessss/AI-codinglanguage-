# Working agreement

This file records how changes are made in this repository. It applies to Claude Code sessions and to people.

## Every change is a pull request
- **Never push to `main`.** Not even docs or a one-line fix. Create a descriptively named branch (`aklang-extension`, `auto-install`), push it, and open a pull request. The owner accepts it on GitHub.
- One topic per branch and per pull request.

## Verify before opening the pull request
Scale the checking to the change, but never skip it:
1. Run the full `npm test` on a **fresh clone of the pushed branch**, not only in the working tree (the working tree can hide untracked files and stale state).
2. Run the user-facing flows the change touches by hand (the commands in the README, the examples, the CLI paths it affects).
3. Wait for GitHub's CI on the branch commit and see **both jobs green**: `npm test` and `bin/ak is up to date`.
4. If `src/` or `rt/` changed: `./build.sh`, commit the new `bin/ak`, and check that `./build.sh --boot` reproduces it byte for byte.
5. Docs-only change: CI green is enough.

A test that finds zero inputs must fail, not pass (the corpus test once reported "0/0 programs match" after a rename).

## The pull request
- Clear title. Body with: Summary, Why, What changed, Not changed, Testing, Notes for the merge. There is no template file.
- Testing says exactly what ran and what did not. Report failures and skipped checks honestly, with the output.
- After opening it, offer to watch it and answer review comments or CI failures.

## Reference
- Linux x86-64 only. Source files are `.aklang` (the old `.ak` still works).
- `npm test` is the whole suite (about 2 minutes). `./build.sh` rebuilds `bin/ak` from `src/` with itself.
- Measure token cost with `node tools/measure.js py aklang` (needs the tokenizer packages, see `tools/tok.js`).
