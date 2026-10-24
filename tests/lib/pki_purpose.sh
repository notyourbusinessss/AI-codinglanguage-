#!/bin/sh
# Builds the certificates for tests/pki_purpose.test.aklang in the directory $1 (needs openssl).
set -e
cd "$1"
ca() { # name subject extensions [issuer]
  openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out $1.key 2>/dev/null
  printf '%s\n' "$3" > $1.ext
  if [ -n "$4" ]; then
    openssl req -new -key $1.key -subj "/CN=$1" -out $1.csr
    openssl x509 -req -in $1.csr -CA $4.pem -CAkey $4.key -CAcreateserial -days 5 -extfile $1.ext -out $1.pem 2>/dev/null
  else
    openssl req -x509 -new -key $1.key -subj "/CN=$1" -days 5 -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign" -out $1.pem
  fi
}
CA='basicConstraints=critical,CA:TRUE
keyUsage=critical,keyCertSign'
ca root x "$CA"
ca leaf_code x "extendedKeyUsage=codeSigning
subjectAltName=DNS:localhost" root
ca leaf_srv x "extendedKeyUsage=serverAuth
subjectAltName=DNS:localhost" root
ca leaf_none x "subjectAltName=DNS:localhost" root
ca leaf_any x "extendedKeyUsage=anyExtendedKeyUsage
subjectAltName=DNS:localhost" root
ca leaf_cli x "extendedKeyUsage=clientAuth
subjectAltName=DNS:localhost" root
# path length: root -> mid (pathlen 0) -> sub (CA) -> leaf, and root -> mid1 (pathlen 1) -> sub1 -> leaf
ca mid0 x "basicConstraints=critical,CA:TRUE,pathlen:0
keyUsage=critical,keyCertSign" root
ca sub0 x "$CA" mid0
ca leaf_pl0 x "subjectAltName=DNS:localhost" sub0
ca mid1 x "basicConstraints=critical,CA:TRUE,pathlen:1
keyUsage=critical,keyCertSign" root
ca sub1 x "$CA" mid1
ca leaf_pl1 x "subjectAltName=DNS:localhost" sub1
# name constraints
ca nc x "basicConstraints=critical,CA:TRUE
keyUsage=critical,keyCertSign
nameConstraints=critical,permitted;DNS:example.com,permitted;IP:10.0.0.0/255.0.0.0,excluded;DNS:bad.example.com" root
ca leaf_nc_ok x "subjectAltName=DNS:a.example.com,IP:10.1.2.3" nc
ca leaf_nc_dns x "subjectAltName=DNS:evil.test" nc
ca leaf_nc_bad x "subjectAltName=DNS:x.bad.example.com" nc
ca leaf_nc_ip x "subjectAltName=DNS:a.example.com,IP:192.0.2.1" nc
