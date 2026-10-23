#!/bin/sh
# lib/tls.aklang's TLS 1.2 client against openssl s_server: every cipher suite with EC and RSA certificates, a 300 KB download, ALPN, a client certificate, extended master secret, and that TLS 1.3 is still preferred. Prints "ok name" or "FAIL name: detail". Run from the repository root.
AK=$PWD/bin/ak; D=$(mktemp -d); trap 'kill $SRV 2>/dev/null; rm -rf $D' EXIT
cd "$D" || exit 1; R=$OLDPWD
mkca() { openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout $1.key -out $1.pem -subj /CN=$1 -days 30 -addext basicConstraints=critical,CA:TRUE -addext keyUsage=critical,keyCertSign 2>/dev/null; }
mkca ca; mkca other
printf 'basicConstraints=CA:FALSE\nsubjectAltName=DNS:localhost\n' > leaf.ext
leaf() { openssl genpkey $3 -out $1.key 2>/dev/null; openssl req -new -key $1.key -subj /CN=$1 -out $1.csr; openssl x509 -req -in $1.csr -CA $2.pem -CAkey $2.key -CAcreateserial -days 30 -extfile leaf.ext -out $1.pem 2>/dev/null; }
leaf ec ca "-algorithm EC -pkeyopt ec_paramgen_curve:P-256"; leaf ec384 ca "-algorithm EC -pkeyopt ec_paramgen_curve:secp384r1"; leaf rsa ca "-algorithm RSA -pkeyopt rsa_keygen_bits:2048"; leaf client ca "-algorithm EC -pkeyopt ec_paramgen_curve:P-256"
awk 'BEGIN { for (i = 0; i < 30000; i++) printf "abcdefghij" }' > big.txt
check() { if [ "$2" = "$3" ]; then echo "ok $1"; else echo "FAIL $1: got [$2] want [$3]"; fi; }
# srv name args...: start s_server on a free port, set PORT
srv() { rm -f ossl.out; openssl s_server -accept 0 "$@" > ossl.out 2>&1 & SRV=$!; i=0; while ! grep -q "ACCEPT" ossl.out && [ $i -lt 50 ]; do sleep 0.1; i=$((i+1)); done; PORT=$(sed -n 's/.*ACCEPT.*:\([0-9]*\).*/\1/p' ossl.out | head -1); }
stop() { kill $SRV 2>/dev/null; wait $SRV 2>/dev/null; }
akc() { (cd "$R" && $AK tests/lib/tls_client.aklang localhost $PORT "$D/ca.pem" "$@" 2>&1); }
for s in ECDHE-ECDSA-AES128-GCM-SHA256:ec ECDHE-ECDSA-AES256-GCM-SHA384:ec384 ECDHE-ECDSA-CHACHA20-POLY1305:ec ECDHE-RSA-AES128-GCM-SHA256:rsa ECDHE-RSA-AES256-GCM-SHA384:rsa ECDHE-RSA-CHACHA20-POLY1305:rsa; do
  c=${s%%:*}; k=${s#*:}
  srv -cert $k.pem -key $k.key -tls1_2 -cipher $c -www
  o=$(akc - - - /); case "$o" in *"TLSv1.2, Cipher is $c"*) echo "ok TLS 1.2 $c";; *) echo "FAIL TLS 1.2 $c: $(echo "$o" | head -3)";; esac
  stop
done
srv -cert ec.pem -key ec.key -tls1_2 -WWW
o=$(akc - - - /big.txt)
check "300 KB download over TLS 1.2" "$(printf '%s' "$o" | tail -c 24)" "abcdefghij client-alpn=-"
check "300 KB download length" "$(printf '%s' "$o" | wc -c)" "$(( 300000 + $(printf 'HTTP/1.0 200 ok\r\nContent-type: text/plain\r\n\r\n' | wc -c) + 14 ))"
stop
srv -cert ec.pem -key ec.key -tls1_2 -alpn h2,http/1.1 -www
check "ALPN over TLS 1.2" "$(akc h2,http/1.1 - - / | grep -c 'client-alpn=h2')" 1
stop
srv -cert ec.pem -key ec.key -tls1_2 -CAfile ca.pem -Verify 1 -www
o=$(akc - "$D/client.pem" "$D/client.key" /); case "$o" in *"Client certificate"*"CN = client"*|*"CN=client"*) echo "ok client certificate over TLS 1.2";; *) echo "FAIL client certificate over TLS 1.2: $(echo "$o" | head -3)";; esac
check "no client certificate is refused" "$(akc - - - / | grep -c ERR)" 1
stop
srv -cert ec.pem -key ec.key -tls1_2 -www
check "untrusted CA is rejected" "$(cd "$R" && $AK tests/lib/tls_client.aklang localhost $PORT "$D/other.pem" 2>&1)" "ERR tls: certificate: unable to find a trusted issuer"
check "wrong host name is rejected" "$(cd "$R" && $AK tests/lib/tls_client.aklang 127.0.0.1 $PORT "$D/ca.pem" 2>&1)" "ERR tls: certificate: host name 127.0.0.1 does not match the certificate"
stop
srv -cert ec.pem -key ec.key -www
o=$(akc - - - /); case "$o" in *"TLSv1.3"*) echo "ok TLS 1.3 is still preferred";; *) echo "FAIL TLS 1.3 preference: $(echo "$o" | head -3)";; esac
stop
srv -cert ec.pem -key ec.key -tls1_2 -no_ticket -no_etm -www
o=$(akc - - - /); case "$o" in *"Cipher is"*) echo "ok server without ETM";; *) echo "FAIL server without ETM: $(echo "$o" | head -3)";; esac
