#!/bin/sh
# Ak installer: a first step towards an automatic install. For now it installs the compiler (bin/ak, one static executable) from a clone of this repository.
#   ./install.sh                     install to ~/.local/bin/ak
#   ./install.sh --prefix /usr/local install to /usr/local/bin/ak (use sudo if needed)
#   ./install.sh --check             only report whether this machine is supported and where ak would go
#   ./install.sh --uninstall         remove <prefix>/bin/ak
# Not done yet (see the end of this file): downloading a release when there is no clone (curl | sh), checksums and version pinning,
# editing the shell profile for you, other platforms.
set -eu

PREFIX="${HOME:-/tmp}/.local"; MODE=install
while [ $# -gt 0 ]; do
  case "$1" in
    --prefix)    [ $# -ge 2 ] || { echo "install.sh: --prefix needs a directory" >&2; exit 2; }; PREFIX="$2"; shift ;;
    --check)     MODE=check ;;
    --uninstall) MODE=uninstall ;;
    -h|--help)   sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)           echo "install.sh: unknown option $1 (try --help)" >&2; exit 2 ;;
  esac
  shift
done
HERE=$(cd "$(dirname "$0")" && pwd)
SRC="$HERE/bin/ak"; DEST="$PREFIX/bin/ak"
OS="${AK_INSTALL_OS:-$(uname -s)}"; ARCH="${AK_INSTALL_ARCH:-$(uname -m)}"      # the two AK_INSTALL_* variables exist for the tests

supported() { [ "$OS" = Linux ] && { [ "$ARCH" = x86_64 ] || [ "$ARCH" = amd64 ]; }; }
on_path() { case ":$PATH:" in *":$PREFIX/bin:"*) return 0 ;; *) return 1 ;; esac; }
smoke() { [ "$("$1" -e '(p 1+2)' 2>/dev/null)" = 3 ]; }                         # does this ak compile and run a program?

if ! supported; then
  echo "Ak runs on Linux x86-64 only (this is $OS $ARCH)." >&2
  echo "On Windows use WSL2; on macOS or ARM use a Linux x86-64 VM or container, then run this script inside it." >&2
  exit 1
fi

case "$MODE" in
  check)
    echo "supported: Linux $ARCH"
    if [ -x "$SRC" ] && smoke "$SRC"; then echo "source: $SRC (works)"; else echo "source: $SRC is missing or does not run (run this script from a clone of the repository)" >&2; exit 1; fi
    echo "would install to: $DEST"; on_path && echo "$PREFIX/bin is on your PATH" || echo "$PREFIX/bin is NOT on your PATH"
    ;;
  uninstall)
    if [ -e "$DEST" ]; then rm -f "$DEST" && echo "removed $DEST"; else echo "nothing to remove: $DEST does not exist"; fi
    ;;
  install)
    [ -x "$SRC" ] || { echo "install.sh: $SRC not found; run this script from a clone of the repository (git clone https://github.com/notyourbusinessss/AI-codinglanguage-)" >&2; exit 1; }
    smoke "$SRC" || { echo "install.sh: $SRC does not run on this machine" >&2; exit 1; }
    mkdir -p "$PREFIX/bin" || { echo "install.sh: cannot create $PREFIX/bin (try --prefix DIR, or sudo)" >&2; exit 1; }
    cp "$SRC" "$DEST.new" && chmod 755 "$DEST.new" && mv -f "$DEST.new" "$DEST" || { rm -f "$DEST.new"; echo "install.sh: cannot write $DEST (try --prefix DIR, or sudo)" >&2; exit 1; }
    smoke "$DEST" || { echo "install.sh: the installed $DEST does not work" >&2; exit 1; }
    echo "installed $DEST"
    if on_path; then echo "try it: ak -e '(p 1+2)'"
    else echo "add it to your PATH (bash/zsh):  echo 'export PATH=\"$PREFIX/bin:\$PATH\"' >> ~/.profile   then open a new shell"; fi
    ;;
esac

# TODO (next steps for the automatic install):
#  1. no clone: download bin/ak for a pinned version from the GitHub release (curl/wget), verify a SHA-256 published next to it, then continue as above
#  2. offer to add the PATH line to the shell profile (ask first, never silently), and --yes for scripts
#  3. install the examples/ and lib/ (x11.ak, canvas.ak) somewhere `(use ...)` can find them, so the games run without the checkout
#  4. an update command that compares versions, shell completions, a man page; packaging (deb/rpm/AUR/Nix) once there are releases
