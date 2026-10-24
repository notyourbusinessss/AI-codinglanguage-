#!/bin/sh
# lib/http.aklang URL handling against a local Ak server. Prints "ok name" or "FAIL name: detail". Run from the repository root.
AK=$PWD/bin/ak; D=$(mktemp -d); trap 'kill $SRV 2>/dev/null; rm -rf $D' EXIT
check() { if [ "$2" = "$3" ]; then echo "ok $1"; else echo "FAIL $1: got [$2] want [$3]"; fi; }
$AK tests/lib/http_echo.aklang 6 > $D/out 2>&1 & SRV=$!
i=0; while [ ! -s $D/out ] && [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done; PORT=$(head -1 $D/out)
g() { $AK -e "(use \"$PWD/lib/http.aklang\" as h) (p (try (: r=(h.get \"$1\") r.body) e=>(++ \"ERR \" e)))" 2>&1; }
check "fragment is not sent" "$(g "http://127.0.0.1:$PORT/a#frag")" "GET /a HTTP/1.1|127.0.0.1:$PORT|"
check "query without a path" "$(g "http://127.0.0.1:$PORT?x=1")" "GET /?x=1 HTTP/1.1|127.0.0.1:$PORT|"
check "user:pass@ becomes Basic authentication" "$(g "http://u:p@127.0.0.1:$PORT/a")" "GET /a HTTP/1.1|127.0.0.1:$PORT|Basic dTpw"
check "upper-case scheme" "$(g "HTTP://127.0.0.1:$PORT/a")" "GET /a HTTP/1.1|127.0.0.1:$PORT|"
check "redirect drops the fragment" "$(g "http://127.0.0.1:$PORT/redir")" "GET /landed HTTP/1.1|127.0.0.1:$PORT|"
check "bad port is a clear error" "$(g "http://127.0.0.1:80x/")" "ERR bad port in URL: http://127.0.0.1:80x/"
