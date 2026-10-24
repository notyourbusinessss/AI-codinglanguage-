#!/bin/sh
# Server certificate choice by SNI (#160), against openssl s_client. Prints "ok name" or "FAIL name: detail". Run from the repository root.
AK=$PWD/bin/ak; D=$(mktemp -d); trap 'kill $SRV 2>/dev/null; rm -rf $D' EXIT
cd "$D" || exit 1; R=$OLDPWD
mk() { openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout $1.key -out $1.pem -subj "/CN=$2" -days 5 -addext "subjectAltName=DNS:$2" 2>/dev/null; }
mk a a.test; mk w '*.wild.test'; mk d default.test
( cd "$R" && exec $AK tests/lib/tls_sni_serve.aklang "$D" 6 ) > srv.out 2>&1 & SRV=$!
i=0; while [ ! -s srv.out ] && [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done; PORT=$(head -1 srv.out)
cn() { (printf 'GET / HTTP/1.0\r\n\r\n'; sleep 0.5) | openssl s_client -connect localhost:$PORT -tls1_3 "$@" 2>/dev/null | openssl x509 -noout -subject 2>/dev/null | sed 's/.*CN *= *//'; }
check() { if [ "$2" = "$3" ]; then echo "ok $1"; else echo "FAIL $1: got [$2] want [$3]"; fi; }
check "exact name" "$(cn -servername a.test)" "a.test"
check "wildcard name" "$(cn -servername x.wild.test)" "*.wild.test"
check "a wildcard does not match two labels" "$(cn -servername x.y.wild.test)" "default.test"
check "unknown name gets the default" "$(cn -servername other.test)" "default.test"
check "names are case-insensitive" "$(cn -servername A.TEST)" "a.test"
check "no server name gets the default" "$(cn -noservername)" "default.test"
