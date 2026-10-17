# Ak documentation

Ak is a small programming language that is cheap to read and write (few tokens), compiles to native x86-64 Linux executables, and ships its own libraries for networking, cryptography, TLS and windows. These pages are the user guide. The one-page language reference is [`../SPEC.md`](../SPEC.md); the reference for native-only features is [`../SPEC-extra.md`](../SPEC-extra.md). Both are kept short on purpose (they are what an LLM reads), so they say *what* exists, and these pages say *how to use it*.

| page | read it for |
|---|---|
| [Getting started](getting-started.md) | install, run a program, the `ak` commands, build a standalone executable |
| [Language tour](language-tour.md) | values, syntax, functions, lists and maps, errors, strings, files, processes |
| [Errors and tests](errors-and-tests.md) | `try`, error kinds, `raise`, stack traces, `ak test`, `ak repl` |
| [Libraries](libraries.md) | coroutines and `async`, sockets, DNS, `http`, `crypto`, `pki`, `tls`, windows and `canvas`, the terminal |
| [Examples](../examples) | complete programs: a game, a web server, a GUI |

Every code block marked `ak` in these pages is run by `npm test` (`tests/docs.test.js`), and when an `output` block follows it, the program's output must match it exactly. A block marked `ak no-run` needs a network or a display and is not run.

Project housekeeping (issue labels and priorities) is in [`LABELS.md`](LABELS.md).
