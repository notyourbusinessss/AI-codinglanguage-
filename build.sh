#!/bin/sh
# Build the Ak compiler (bin/ak). Needs either the seed binary (bin/ak) or Node (for the one-time JS bootstrap).
#   ./build.sh            rebuild bin/ak from src/ with the existing bin/ak (or bootstrap with Node if there is none)
#   ./build.sh --boot     rebuild from scratch with the JS bootstrap (boot/ak.js)
set -e
cd "$(dirname "$0")"
mkdir -p bin
if [ "$1" = "--boot" ] || [ ! -x bin/ak ]; then
  node boot/ak.js src/main.ak build src/main.ak bin/ak.stage1
else
  bin/ak build src/main.ak bin/ak.stage1
fi
bin/ak.stage1 build src/main.ak bin/ak.stage2
if cmp -s bin/ak.stage1 bin/ak.stage2; then
  mv bin/ak.stage2 bin/ak; rm -f bin/ak.stage1; echo "bin/ak rebuilt (self-hosting fixpoint reached: stage1 == stage2)"
else
  echo "warning: stage1 != stage2 (the compiler's output depends on the compiler that built it)" >&2; mv bin/ak.stage2 bin/ak; exit 1
fi
