#!/bin/sh
# Key exchange groups and HelloRetryRequest in lib/tls.aklang, client and server, against openssl s_client / s_server. Prints "ok name" or "FAIL name: detail". Run from the repository root.
AK=$PWD/bin/ak; D=$(mktemp -d); trap 'kill $SRV 2>/dev/null; rm -rf $D' EXIT
cd "$D" || exit 1; R=$OLDPWD
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout ca.key -out ca.pem -subj /CN=ca -days 30 -addext basicConstraints=critical,CA:TRUE -addext keyUsage=critical,keyCertSign 2>/dev/null
printf 'basicConstraints=CA:FALSE\nsubjectAltName=DNS:localhost\n' > leaf.ext
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out srv.key 2>/dev/null; openssl req -new -key srv.key -subj /CN=localhost -out srv.csr
openssl x509 -req -in srv.csr -CA ca.pem -CAkey ca.key -CAcreateserial -days 30 -extfile leaf.ext -out srv.pem 2>/dev/null
check() { if [ "$2" = "$3" ]; then echo "ok $1"; else echo "FAIL $1: got [$2] want [$3]"; fi; }
akc() { (cd "$R" && $AK tests/lib/tls_client.aklang localhost $PORT "$D/ca.pem" - - - / 2>&1); }
stop() { kill $SRV 2>/dev/null; wait $SRV 2>/dev/null; }
# the Ak server: 6 connections
rm -f srv.out; ( cd "$R" && exec $AK tests/lib/tls_serve.aklang "$D/srv.pem" "$D/srv.key" 6 ) > srv.out 2>&1 & SRV=$!
i=0; while [ ! -s srv.out ] && [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done; PORT=$(head -1 srv.out)
sc() { (printf 'GET / HTTP/1.0\r\n\r\n'; sleep 1) | openssl s_client -connect localhost:$PORT -CAfile ca.pem -verify_hostname localhost -tls1_3 "$@" 2>&1 | grep -a "^hello\|Server Temp Key\|alert" | tr '\n' ' ' | sed 's/closed *$//; s/ *$//'; }
check "server: P-256 share" "$(sc -groups P-256)" "Server Temp Key: ECDH, prime256v1, 256 bits hello - alpn=- peer=no"
check "server: P-384 share" "$(sc -groups P-384)" "Server Temp Key: ECDH, secp384r1, 384 bits hello - alpn=- peer=no"
check "server: HelloRetryRequest to x25519" "$(sc -groups X448:X25519)" "Server Temp Key: X25519, 253 bits hello - alpn=- peer=no"
check "server: HelloRetryRequest to P-256" "$(sc -groups X448:P-256)" "Server Temp Key: ECDH, prime256v1, 256 bits hello - alpn=- peer=no"
check "server: no group in common" "$(sc -groups X448 | grep -c 'alert')" 1
check "server: x25519 still the default" "$(sc)" "Server Temp Key: X25519, 253 bits hello - alpn=- peer=no"
stop
# the Ak client against openssl s_server
srv() { rm -f ossl.out; openssl s_server -accept 0 -cert srv.pem -key srv.key "$@" -msg > ossl.out 2>&1 & SRV=$!; i=0; while ! grep -q "ACCEPT" ossl.out && [ $i -lt 50 ]; do sleep 0.1; i=$((i+1)); done; PORT=$(sed -n 's/.*ACCEPT.*:\([0-9]*\).*/\1/p' ossl.out | head -1); }
srv -tls1_3 -groups P-256 -www
o=$(akc); case "$o" in *"TLSv1.3, Cipher is"*) echo "ok client: TLS 1.3 with a server that only has P-256 (HelloRetryRequest)";; *) echo "FAIL client P-256 only: $(echo "$o" | head -3)";; esac
check "client: that was a HelloRetryRequest (two ServerHellos)" "$(grep -c '>>>.*ServerHello' ossl.out)" 2
stop
srv -tls1_3 -groups P-384 -www
o=$(akc); case "$o" in *"TLSv1.3, Cipher is"*) echo "ok client: TLS 1.3 with a server that only has P-384";; *) echo "FAIL client P-384 only: $(echo "$o" | head -3)";; esac
stop
srv -tls1_2 -groups P-256 -www
o=$(akc); case "$o" in *"TLSv1.2, Cipher is"*) echo "ok client: TLS 1.2 ECDHE on P-256";; *) echo "FAIL client TLS 1.2 P-256: $(echo "$o" | head -3)";; esac
stop
srv -tls1_2 -groups P-384 -www
o=$(akc); case "$o" in *"TLSv1.2, Cipher is"*) echo "ok client: TLS 1.2 ECDHE on P-384";; *) echo "FAIL client TLS 1.2 P-384: $(echo "$o" | head -3)";; esac
stop
srv -tls1_3 -groups X25519 -www
o=$(akc); case "$o" in *"TLSv1.3, Cipher is"*) echo "ok client: x25519 needs no retry";; *) echo "FAIL client x25519: $(echo "$o" | head -3)";; esac
check "client: no HelloRetryRequest for x25519" "$(grep -c '>>>.*ServerHello' ossl.out)" 1
