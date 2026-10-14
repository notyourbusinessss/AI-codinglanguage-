#!/bin/sh
# Build the Ak compiler (bin/ak). Needs either the seed binary (bin/ak) or Node (for the one-time JS bootstrap).
#   ./build.sh            rebuild bin/ak from src/ with the existing bin/ak (or bootstrap with Node if there is none)
#   ./build.sh --boot     rebuild from scratch with the JS bootstrap (boot/ak.js)
# The compiler is rebuilt by itself until its output stops changing (a fixpoint), which proves it reproduces itself.
set -e
cd "$(dirname "$0")"
mkdir -p bin
if [ "$1" = "--boot" ] || [ ! -x bin/ak ]; then
  node boot/ak.js src/main.aklang build --image src/main.aklang bin/ak.next
else
  bin/ak build --image src/main.aklang bin/ak.next 2>/dev/null || {
    echo "the seed cannot build the current sources (they use a newer runtime); bootstrapping with Node" >&2
    node boot/ak.js src/main.aklang build --image src/main.aklang bin/ak.next; }
fi
for i in 1 2 3 4 5; do
  bin/ak.next build --image src/main.aklang bin/ak.new
  if cmp -s bin/ak.next bin/ak.new; then
    mv bin/ak.new bin/ak; rm -f bin/ak.next; bin/ak -e '(p "smoke test ok")' >/dev/null || { echo "error: the new compiler cannot compile programs (runtime error?)" >&2; exit 1; }; echo "bin/ak rebuilt (fixpoint after $i self-build(s))"; exit 0
  fi
  mv bin/ak.new bin/ak.next
done
echo "error: no fixpoint after 5 rounds (nondeterministic code generation?)" >&2; exit 1
