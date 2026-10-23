#!/bin/sh
# ALPN and client certificates (mutual TLS) in lib/tls.aklang, both sides, against curl and openssl; prints "ok name" or "FAIL name: detail" per check. Run from the repository root.
AK=$PWD/bin/ak; D=$(mktemp -d); trap 'kill $(jobs -p) 2>/dev/null; rm -rf $D' EXIT
cd "$D" || exit 1; R=$OLDPWD
mkca() { openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout $1.key -out $1.pem -subj /CN=$1 -days 30 -addext basicConstraints=critical,CA:TRUE -addext keyUsage=critical,keyCertSign 2>/dev/null; }
mkca ca; mkca other
printf 'basicConstraints=CA:FALSE\nsubjectAltName=DNS:localhost\n' > leaf.ext
leaf() { openssl genpkey $3 -out $1.key 2>/dev/null; openssl req -new -key $1.key -subj /CN=$1 -out $1.csr; openssl x509 -req -in $1.csr -CA $2.pem -CAkey $2.key -CAcreateserial -days 30 -extfile leaf.ext -out $1.pem 2>/dev/null; }
EC="-algorithm EC -pkeyopt ec_paramgen_curve:P-256"
leaf server ca "$EC"; leaf client ca "$EC"; leaf badclient other "$EC"; leaf rsaclient ca "-algorithm RSA -pkeyopt rsa_keygen_bits:2048"
serve() { rm -f srv.out; ( cd "$R" && exec $AK tests/lib/tls_serve.aklang "$D/server.pem" "$D/server.key" "$@" ) > srv.out 2>&1 & i=0; while [ ! -s srv.out ] && [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done; PORT=$(head -1 srv.out); }
finish() { i=0; while [ "$(wc -l < srv.out)" -le "$1" ] && [ $i -lt 150 ]; do sleep 0.1; i=$((i+1)); done; kill $(jobs -p) 2>/dev/null; wait; }
check() { if [ "$2" = "$3" ]; then echo "ok $1"; else echo "FAIL $1: got [$2] want [$3]"; fi; }
sc() { (printf 'GET / HTTP/1.0\r\n\r\n'; sleep 1) | openssl s_client -connect localhost:$PORT -CAfile ca.pem -verify_hostname localhost -quiet "$@" 2>&1 | grep -a "^hello\|alert\|error" | head -3; }
akc() { (cd "$R" && $AK tests/lib/tls_client.aklang localhost $PORT "$D/ca.pem" "$@" 2>&1); }
# ALPN
serve 5 h2,http/1.1
check "s_client -alpn http/1.1" "$(sc -alpn http/1.1)" "hello - alpn=http/1.1 peer=no"
check "s_client without ALPN" "$(sc)" "hello - alpn=- peer=no"
check "s_client -alpn h2,x picks the server's first" "$(sc -alpn x,http/1.1,h2)" "hello - alpn=h2 peer=no"
check "no common ALPN protocol is refused" "$(sc -alpn spdy | grep -c 'alert number 120')" 1
check "ak client ALPN" "$(akc h2)" "echo:hello alpn=h2 peer=no client-alpn=h2"
finish 5; check "alpn server log" "$(sed 1d srv.out | sort | uniq -c | sed 's/^ *//' | tr '\n' '|')" "1 ERR tls: no ALPN protocol in common|3 ok |1 ok localhost|"
# client certificates required
serve 7 - "$D/ca.pem"
check "s_client with a client certificate" "$(sc -cert client.pem -key client.key)" "hello - alpn=- peer=yes"
check "s_client with an RSA client certificate" "$(sc -cert rsaclient.pem -key rsaclient.key)" "hello - alpn=- peer=yes"
check "curl with a client certificate" "$(curl -sS --cacert ca.pem --cert client.pem --key client.key https://localhost:$PORT/ 2>&1)" "hello localhost alpn=- peer=yes"
check "ak client with a client certificate" "$(akc - "$D/client.pem" "$D/client.key")" "echo:hello alpn=- peer=yes client-alpn=-"
check "no client certificate is refused" "$(akc | grep -c ERR)" 1
check "client certificate from another CA is refused" "$(sc -cert badclient.pem -key badclient.key | grep -c 'alert')" 1
check "ak client certificate from another CA is refused" "$(akc - "$D/badclient.pem" "$D/badclient.key" | grep -c ERR)" 1
finish 7; check "mutual server log" "$(sed 1d srv.out | sort | uniq -c | sed 's/^ *//' | tr '\n' '|')" "2 ERR tls: client certificate: unable to find a trusted issuer|1 ERR tls: the client sent no certificate|2 ok |2 ok localhost|"
# optional
serve 2 - "$D/ca.pem" optional
check "optional: no certificate is fine" "$(sc)" "hello - alpn=- peer=no"
check "optional: certificate is seen" "$(sc -cert client.pem -key client.key)" "hello - alpn=- peer=yes"
finish 2
# the Ak client against openssl s_server asking for a certificate and offering ALPN
openssl s_server -accept 0 -cert server.pem -key server.key -CAfile ca.pem -Verify 1 -alpn h2 -www -tls1_3 > ossl.out 2>&1 &
i=0; while ! grep -q "ACCEPT" ossl.out && [ $i -lt 50 ]; do sleep 0.1; i=$((i+1)); done
PORT=$(sed -n 's/.*ACCEPT.*:\([0-9]*\).*/\1/p' ossl.out | head -1)
o=$(akc h2 "$D/client.pem" "$D/client.key" /); case "$o" in *"client-alpn=h2"*) echo "ok ak client to openssl s_server: mutual TLS and ALPN";; *) echo "FAIL ak client to s_server: $o";; esac
