#!/bin/sh
# TLS 1.3 session resumption (tickets and PSK) in lib/tls.aklang, client and server, against openssl. Prints "ok name" or "FAIL name: detail". Run from the repository root.
AK=$PWD/bin/ak; D=$(mktemp -d); trap 'kill $SRV $SRV2 2>/dev/null; rm -rf $D' EXIT
cd "$D" || exit 1; R=$OLDPWD
mkca() { openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout $1.key -out $1.pem -subj /CN=$1 -days 30 -addext basicConstraints=critical,CA:TRUE -addext keyUsage=critical,keyCertSign 2>/dev/null; }
mkca ca
printf 'basicConstraints=CA:FALSE\nsubjectAltName=DNS:localhost\n' > leaf.ext
leaf() { openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out $1.key 2>/dev/null; openssl req -new -key $1.key -subj /CN=$1 -out $1.csr; openssl x509 -req -in $1.csr -CA ca.pem -CAkey ca.key -CAcreateserial -days 30 -extfile leaf.ext -out $1.pem 2>/dev/null; }
leaf srv; leaf client
check() { if [ "$2" = "$3" ]; then echo "ok $1"; else echo "FAIL $1: got [$2] want [$3]"; fi; }
aksrv() { rm -f $1.out; ( cd "$R" && exec $AK tests/lib/tls_serve.aklang "$D/srv.pem" "$D/srv.key" "$2" "${3:--}" "${4:--}" ) > $1.out 2>&1 & SRV=$!; i=0; while [ ! -s $1.out ] && [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done; PORT=$(head -1 $1.out); }
# one s_client connection; $1 = extra arguments; prints "Reused|New" and the server's reply
sc() { (printf 'GET / HTTP/1.0\r\n\r\n'; sleep 1) | openssl s_client -connect localhost:$PORT -CAfile ca.pem -verify_hostname localhost -tls1_3 "$@" 2>&1 | grep -a "^hello\|^Reused\|^New,\|alert" | sed 's/, TLSv1.3.*//; s/---$//; s/closed$//' | tr '\n' ' ' | sed 's/ *$//'; }
aksrv a 8
rm -f sess; sc -sess_out sess > /dev/null
check "server: second connection resumes" "$(sc -sess_in sess -sess_out sess)" "Reused hello - alpn=- peer=no resumed=yes"
check "server: and again with the new ticket" "$(sc -sess_in sess)" "Reused hello - alpn=- peer=no resumed=yes"
check "server: a fresh connection is a full handshake" "$(sc)" "New hello - alpn=- peer=no"
rm -f sess2; sc -groups X448:X25519 -sess_out sess2 > /dev/null
check "server: resumption after a HelloRetryRequest" "$(sc -groups X448:X25519 -sess_in sess2)" "Reused hello - alpn=- peer=no resumed=yes"
kill $SRV 2>/dev/null; wait $SRV 2>/dev/null
aksrv b 2
check "server: a ticket from another server is ignored" "$(sc -sess_in sess)" "New hello - alpn=- peer=no"
kill $SRV 2>/dev/null; wait $SRV 2>/dev/null
aksrv c 2 - "$D/ca.pem"
check "server: with client certificates required there is a full handshake and no ticket" "$(sc -cert client.pem -key client.key)|$( (printf 'GET / HTTP/1.0\r\n\r\n'; sleep 1) | openssl s_client -connect localhost:$PORT -CAfile ca.pem -tls1_3 -cert client.pem -key client.key -msg 2>&1 | grep -c 'NewSessionTicket')" "New hello - alpn=- peer=yes|0"
kill $SRV 2>/dev/null; wait $SRV 2>/dev/null
# the Ak client
akr() { (cd "$R" && $AK tests/lib/tls_resume.aklang localhost $PORT "$D/ca.pem" 2>&1); }
srv() { rm -f ossl.out; openssl s_server -accept 0 -cert srv.pem -key srv.key "$@" -www > ossl.out 2>&1 & SRV=$!; i=0; while ! grep -q "ACCEPT" ossl.out && [ $i -lt 50 ]; do sleep 0.1; i=$((i+1)); done; PORT=$(sed -n 's/.*ACCEPT.*:\([0-9]*\).*/\1/p' ossl.out | head -1); }
srv -tls1_3
case "$(akr)" in "false "*" | true "*" | true "*) echo "ok client: resumes with openssl s_server";; *) echo "FAIL client resumption: $(akr)";; esac
kill $SRV 2>/dev/null; wait $SRV 2>/dev/null
srv -tls1_3 -groups P-256
case "$(akr)" in "false "*" | true "*" | true "*) echo "ok client: resumes after a HelloRetryRequest";; *) echo "FAIL client resumption with HRR: $(akr)";; esac
kill $SRV 2>/dev/null; wait $SRV 2>/dev/null
aksrv d 3
check "client: resumes with the Ak server" "$(akr)" "false hello localhost alpn=- peer=no | true hello localhost alpn=- peer=no resumed=yes | true hello localhost alpn=- peer=no resumed=yes"
srv -tls1_2
case "$(akr)" in "false "*" | true "*" | true "*) echo "ok client: TLS 1.2 session ticket resumption with openssl s_server";; *) echo "FAIL TLS 1.2 resumption: $(akr)";; esac
kill $SRV 2>/dev/null; wait $SRV 2>/dev/null
srv -tls1_2 -no_ticket
case "$(akr)" in "false "*" | false "*" | false "*) echo "ok client: a server without tickets gives full handshakes";; *) echo "FAIL TLS 1.2 without tickets: $(akr)";; esac
kill $SRV 2>/dev/null; wait $SRV 2>/dev/null
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out rsa.key 2>/dev/null; openssl req -new -key rsa.key -subj /CN=rsa -out rsa.csr; openssl x509 -req -in rsa.csr -CA ca.pem -CAkey ca.key -CAcreateserial -days 30 -extfile leaf.ext -out rsa.pem 2>/dev/null
srv -tls1_2 -cipher ECDHE-RSA-AES256-GCM-SHA384 -cert rsa.pem -key rsa.key
case "$(akr)" in "false "*" | true "*" | true "*) echo "ok client: TLS 1.2 resumption with an RSA certificate and AES-256";; *) echo "FAIL TLS 1.2 RSA resumption: $(akr)";; esac
kill $SRV 2>/dev/null; wait $SRV 2>/dev/null
