#!/bin/sh
# Ak installer. It installs the compiler (bin/ak, one static executable) from a clone of this repository, or downloads it from a GitHub release.
#   ./install.sh                     install to ~/.local/bin/ak
#   ./install.sh --prefix /usr/local install to /usr/local/bin/ak (use sudo if needed)
#   ./install.sh --check             only report whether this machine is supported and where ak would go
#   ./install.sh --uninstall         remove <prefix>/bin/ak
#   ./install.sh --download          fetch bin/ak from the GitHub release instead of using the clone (done automatically when there is no clone);
#                                    --version X.Y.Z pins a release (default: the latest), the SHA-256 published next to it is checked
#   ./install.sh --yes               also add <prefix>/bin to PATH in ~/.profile when it is missing (without --yes it asks, if a terminal is attached)
# Not done yet (see the end of this file): installing examples/ and lib/, shell completions, a man page, packaging, other platforms.
set -eu

PREFIX="${HOME:-/tmp}/.local"; MODE=install; DOWNLOAD=0; VERSION=; YES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --prefix)    [ $# -ge 2 ] || { echo "install.sh: --prefix needs a directory" >&2; exit 2; }; PREFIX="$2"; shift ;;
    --check)     MODE=check ;;
    --uninstall) MODE=uninstall ;;
    --download)  DOWNLOAD=1 ;;
    --version)   [ $# -ge 2 ] || { echo "install.sh: --version needs a number like 0.5.0" >&2; exit 2; }; VERSION="$2"; DOWNLOAD=1; shift ;;
    -y|--yes)    YES=1 ;;
    -h|--help)   sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)           echo "install.sh: unknown option $1 (try --help)" >&2; exit 2 ;;
  esac
  shift
done
HERE=$(cd "$(dirname "$0")" && pwd)
SRC="$HERE/bin/ak"; DEST="$PREFIX/bin/ak"
OS="${AK_INSTALL_OS:-$(uname -s)}"; ARCH="${AK_INSTALL_ARCH:-$(uname -m)}"      # the two AK_INSTALL_* variables exist for the tests

REPO_URL="https://github.com/notyourbusinessss/AI-codinglanguage-"
ASSET="ak-linux-x86_64"
if [ -n "$VERSION" ]; then BASE="$REPO_URL/releases/download/v${VERSION#v}"; else BASE="$REPO_URL/releases/latest/download"; fi
BASE="${AK_INSTALL_BASE_URL:-$BASE}"                                              # AK_INSTALL_BASE_URL exists for the tests
supported() { [ "$OS" = Linux ] && { [ "$ARCH" = x86_64 ] || [ "$ARCH" = amd64 ]; }; }
on_path() { case ":$PATH:" in *":$PREFIX/bin:"*) return 0 ;; *) return 1 ;; esac; }
fetch() { if command -v curl >/dev/null 2>&1; then curl -fsSL -o "$2" "$1"; elif command -v wget >/dev/null 2>&1; then wget -q -O "$2" "$1"; else echo "install.sh: curl or wget is needed to download" >&2; return 1; fi; }
sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1; else return 1; fi; }
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
    if [ "$DOWNLOAD" = 1 ] || [ ! -e "$SRC" ]; then       # no clone (curl | sh) or --download: fetch the release and check its SHA-256
      WORK=$(mktemp -d) || { echo "install.sh: cannot create a temporary directory" >&2; exit 1; }
      trap 'rm -rf "$WORK"' EXIT
      echo "downloading $BASE/$ASSET"
      fetch "$BASE/$ASSET" "$WORK/$ASSET" && fetch "$BASE/$ASSET.sha256" "$WORK/$ASSET.sha256" || { echo "install.sh: download failed (is there a release at $BASE ? otherwise clone the repository: git clone $REPO_URL)" >&2; exit 1; }
      WANT=$(cut -d' ' -f1 "$WORK/$ASSET.sha256" | head -n 1); GOT=$(sha256 "$WORK/$ASSET") || { echo "install.sh: sha256sum or shasum is needed to verify the download" >&2; exit 1; }
      [ -n "$WANT" ] && [ "$WANT" = "$GOT" ] || { echo "install.sh: SHA-256 mismatch for $ASSET (expected $WANT, got $GOT); nothing installed" >&2; exit 1; }
      chmod 755 "$WORK/$ASSET"; SRC="$WORK/$ASSET"; echo "checksum ok"
    fi
    [ -x "$SRC" ] || { echo "install.sh: $SRC is not executable" >&2; exit 1; }
    smoke "$SRC" || { echo "install.sh: $SRC does not run on this machine" >&2; exit 1; }
    mkdir -p "$PREFIX/bin" || { echo "install.sh: cannot create $PREFIX/bin (try --prefix DIR, or sudo)" >&2; exit 1; }
    cp "$SRC" "$DEST.new" && chmod 755 "$DEST.new" && mv -f "$DEST.new" "$DEST" || { rm -f "$DEST.new"; echo "install.sh: cannot write $DEST (try --prefix DIR, or sudo)" >&2; exit 1; }
    smoke "$DEST" || { echo "install.sh: the installed $DEST does not work" >&2; exit 1; }
    echo "installed $DEST ($("$DEST" --version 2>/dev/null || echo unknown version))"
    if on_path; then echo "try it: ak -e '(p 1+2)'"
    else
      LINE="export PATH=\"$PREFIX/bin:\$PATH\""; PROFILE="${HOME:-/tmp}/.profile"; DO=0
      if [ "$YES" = 1 ]; then DO=1
      elif [ -t 0 ] && [ -t 1 ]; then printf "%s is not on your PATH. Add it to %s? [y/N] " "$PREFIX/bin" "$PROFILE"; read -r ANS || ANS=n; case "$ANS" in y|Y|yes) DO=1 ;; esac; fi
      if [ "$DO" = 1 ]; then
        if grep -qxF "$LINE" "$PROFILE" 2>/dev/null; then echo "$PROFILE already has the PATH line"
        else printf '\n# added by the Ak installer\n%s\n' "$LINE" >> "$PROFILE" && echo "added to $PROFILE; open a new shell"; fi
      else echo "add it to your PATH (bash/zsh):  echo '$LINE' >> ~/.profile   then open a new shell"; fi
    fi
    ;;
esac

# TODO (next steps for the automatic install):
#  1. install the examples/ and lib/ (x11.aklang, canvas.aklang) somewhere `(use ...)` can find them, so the games run without the checkout
#  2. shell completions, a man page; packaging (deb/rpm/AUR/Nix)
