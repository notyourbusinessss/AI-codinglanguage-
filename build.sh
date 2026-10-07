#!/bin/sh
# Build the Ak compiler (bin/ak). Needs either the seed binary (bin/ak) or Node (for the one-time JS bootstrap).
#   ./build.sh            rebuild bin/ak from src/ with the existing bin/ak (or bootstrap with Node if there is none)
#   ./build.sh --boot     rebuild from scratch with the JS bootstrap (boot/ak.js)
# The compiler is rebuilt by itself until its output stops changing (a fixpoint), which proves it reproduces itself.
set -e
cd "$(dirname "$0")"
mkdir -p bin
if [ "$1" = "--boot" ] || [ ! -x bin/ak ]; then
  node boot/ak.js src/main.ak build src/main.ak bin/ak.next
else
  bin/ak build src/main.ak bin/ak.next
fi
for i in 1 2 3 4 5; do
  bin/ak.next build src/main.ak bin/ak.new
  if cmp -s bin/ak.next bin/ak.new; then
    mv bin/ak.new bin/ak; rm -f bin/ak.next; echo "bin/ak rebuilt (fixpoint after $i self-build(s))"; exit 0
  fi
  mv bin/ak.new bin/ak.next
done
echo "error: no fixpoint after 5 rounds (nondeterministic code generation?)" >&2; exit 1
