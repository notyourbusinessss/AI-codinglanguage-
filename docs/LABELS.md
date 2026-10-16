# Issue labels

Every issue gets one priority label and one or more category labels. The issue body ends with a short "Priority" section (2-3 lines) saying why it has that level and why not higher or lower.

## Priority

Lower number means more important.

| Label | Meaning |
|-------|---------|
| `P1` | Major. Wrong results or data loss, for example a write that fails but reports success. Fix first. |
| `P2` | High. Core behaviour that is wrong or missing and affects many programs. |
| `P3` | Medium. Real problem or useful feature, with a workaround or a narrow impact. |
| `P4` | Minor. Edge cases, such as input validation of rare syntax, and small tool improvements. |
| `P5` | Low. Nice to have, no one is blocked. |

## Category

| Label | Meaning |
|-------|---------|
| `core` | Language semantics: how the language itself behaves (strings, errors, `use`). |
| `runtime` | The native runtime and what programs do when they run: syscalls, memory, networking, math. |
| `parser` | The lexer and parser: literals, escapes, regex syntax, rejecting bad source. |
| `tooling` | The `ak` command line: `fmt`, test runner, build, REPL. |
| `network` | Sockets, DNS, TLS, HTTP and other networking, on either target. Combine with `runtime` or `tooling` (library code). |
| `tests` | Missing or weak tests in the repository's own suite. Combine with the category of the code being tested when it applies. |

## Type (GitHub's standard labels)

| Label | Meaning |
|-------|---------|
| `bug` | Something behaves wrongly. |
| `enhancement` | A new feature or an improvement to an existing one. |
| `documentation` | Docs, README, comparisons, examples. |
| `good first issue` | Small and self-contained. |
| `help wanted` | Extra attention is welcome. |
| `question` | Needs discussion before it becomes work. |
| `duplicate`, `invalid`, `wontfix` | Reasons for closing an issue. |
| `accessibility` | Accessibility concerns. |

## Source

| Label | Meaning |
|-------|---------|
| `auto-found` | Filed by the scheduled "Ak gap review", which reads the code and files verified gaps. |
