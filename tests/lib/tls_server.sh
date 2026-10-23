#!/bin/sh
# Drives lib/tls.aklang's server side with real clients (curl, openssl s_client, the Ak client); prints "ok name" or "FAIL name: detail" per check.
# usage: tls_server.sh   (run from the repository root; needs openssl and curl)
AK=$PWD/bin/ak; D=$(mktemp -d); trap 'kill $(jobs -p) 2>/dev/null; rm -rf $D' EXIT
cd "$D" || exit 1; R=$OLDPWD
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout ca.key -out ca.pem -subj /CN=ca -days 30 -addext basicConstraints=critical,CA:TRUE -addext keyUsage=critical,keyCertSign 2>/dev/null
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout other.key -out other.pem -subj /CN=other -days 30 -addext basicConstraints=critical,CA:TRUE -addext keyUsage=critical,keyCertSign 2>/dev/null
printf 'basicConstraints=CA:FALSE\nsubjectAltName=DNS:localhost,DNS:foo.example\n' > leaf.ext
leaf() { openssl genpkey $2 -out $1.key 2>/dev/null; openssl req -new -key $1.key -subj /CN=localhost -out $1.csr; openssl x509 -req -in $1.csr -CA ca.pem -CAkey ca.key -CAcreateserial -days 30 -extfile leaf.ext -out $1.pem 2>/dev/null; }
leaf ec256 "-algorithm EC -pkeyopt ec_paramgen_curve:P-256"
leaf ec384 "-algorithm EC -pkeyopt ec_paramgen_curve:secp384r1"
leaf rsa "-algorithm RSA -pkeyopt rsa_keygen_bits:2048"
openssl ec -in ec256.key -out ec256.sec1 2>/dev/null
openssl rsa -in rsa.key -traditional -out rsa.trad 2>/dev/null
cat ec256.pem ca.pem > chain.pem
serve() { rm -f srv.out; ( cd "$R" && exec $AK tests/lib/tls_serve.aklang "$D/$1" "$D/$2" "$3" ) > srv.out 2>&1 & i=0; while [ ! -s srv.out ] && [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done; PORT=$(head -1 srv.out); }
finish() { i=0; while [ "$(wc -l < srv.out)" -le "$1" ] && [ $i -lt 150 ]; do sleep 0.1; i=$((i+1)); done; }
check() { if [ "$2" = "$3" ]; then echo "ok $1"; else echo "FAIL $1: got [$2] want [$3]"; fi; }
for k in ec256:ec256.pem:ec256.key ec384:ec384.pem:ec384.key rsa:rsa.pem:rsa.key rsa-trad:rsa.pem:rsa.trad ec-sec1:ec256.pem:ec256.sec1 chain:chain.pem:ec256.key; do
  n=${k%%:*}; r=${k#*:}; serve ${r%%:*} ${r#*:} 2
  check "curl $n" "$(curl -sS --cacert ca.pem https://localhost:$PORT/ 2>&1)" "hello localhost"
  check "curl $n 300 KB" "$(curl -sS --cacert ca.pem https://localhost:$PORT/big 2>&1 | wc -c | tr -d ' ')" 300000
  finish 2; kill $(jobs -p) 2>/dev/null; wait
done
serve ec256.pem ec256.key 6
for s in TLS_AES_128_GCM_SHA256 TLS_AES_256_GCM_SHA384 TLS_CHACHA20_POLY1305_SHA256; do
  o=$( (printf 'GET / HTTP/1.0\r\n\r\n'; sleep 2) | openssl s_client -connect localhost:$PORT -CAfile ca.pem -verify_return_error -verify_hostname localhost -servername foo.example -ciphersuites $s -tls1_3 2>&1)
  case "$o" in *"Cipher is $s"*"hello foo.example"*|*"Cipher    : $s"*"hello foo.example"*) echo "ok s_client $s, sni";; *) echo "FAIL s_client $s: $o" | head -5;; esac
done
check "ak client" "$(cd "$R" && $AK tests/tls_driver.aklang localhost $PORT "$D/ca.pem" 2>&1)" "OK 10 $(printf 'echo:hello' | sha256sum | cut -d' ' -f1)"
check "curl wrong CA is rejected" "$(curl -sS --cacert other.pem https://localhost:$PORT/ 2>&1 | grep -c 'SSL certificate')" 1
o=$(printf 'x' | openssl s_client -connect localhost:$PORT -tls1_2 2>&1); case "$o" in *"alert protocol version"*|*"protocol version"*) echo "ok TLS 1.2 client gets protocol_version";; *) echo "FAIL tls1.2: $o" | head -3;; esac
finish 6; sed 1d srv.out | sort | uniq -c | sed 's/^ *//' | sort > counts
check "server log" "$(cat counts)" "$(printf '1 ERR tls: the client does not support TLS 1.3\n3 ok foo.example\n1 ok localhost\n1 ERR tls: alert 48 (unknown_ca)' | sort)"
