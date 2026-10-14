; Native runtime: JSON parsing. (unjson s) -> maps (insertion ordered), lists, numbers, strings, true/false, nil.
JS=""
JI=0
(= (jerr msg) ($throw (strcat2 (strcat2 (strcat2 "invalid JSON: " msg) " at position ") (fmtint JI))))
(= (jws) (wh (&& JI<($hlen JS) (isspace ($ldb JS JI))) (<- JI JI+1)))
(= (jhex4) v=0 (for k 4 c=(? JI+k<($hlen JS) (digitval ($ldb JS JI+k)) 99) (? c>=16 (jerr "bad \\u escape")) v=v*16+c) (<- JI JI+4) v)
(= (jstring)                      ; at the opening quote
  (<- JI JI+1) start=JI n=($hlen JS)
  (wh (&& JI<n (!= ($ldb JS JI) 34) (!= ($ldb JS JI) 92) (>= ($ldb JS JI) 32)) (<- JI JI+1))     ; fast path: no escapes
  (? (&& JI<n (== ($ldb JS JI) 34)) (: s=(strslice JS start JI) (<- JI JI+1) s)
     (jstring_slow start)))
(= (jstring_slow start)
  (<- JI start) parts=(mklist 4) done=false
  (wh (! done)
    (? JI>=($hlen JS) (jerr "unterminated string"))
    c=($ldb JS JI)
    (? c==34 (: (lpush parts (strslice JS start JI)) (<- JI JI+1) done=true)
       c==92 (: (lpush parts (strslice JS start JI)) (<- JI JI+1) e=($ldb JS JI) (<- JI JI+1)
                (lpush parts (sw e 110 "\n" 116 "\t" 114 "\r" 98 (chr 8) 102 (chr 12) 34 "\"" 92 "\\" 47 "/"
                                  117 (: cp=(jhex4)
                                         (? (&& cp>=55296 cp<56320 JI+1<($hlen JS) (== ($ldb JS JI) 92) (== ($ldb JS JI+1) 117))
                                            (: (<- JI JI+2) lo=(jhex4) (chr (+ 65536 (* (- cp 55296) 1024) (- lo 56320))))
                                            (chr cp)))
                                  (jerr "bad escape")))
                start=JI)
       c<32 (jerr "control character in string")
       (<- JI JI+1))
    nil)
  (join parts ""))
(= (jvalue)
  (jws)
  (? JI>=($hlen JS) (jerr "unexpected end"))
  c=($ldb JS JI)
  (? c==123 (: (<- JI JI+1) m=(map) (jws)
               (? (&& JI<($hlen JS) (== ($ldb JS JI) 125)) (<- JI JI+1)
                  (: more=true
                     (wh more
                       (jws) (? (!= ($ldb JS JI) 34) (jerr "expected string key"))
                       k=(jstring) (jws) (? (!= ($ldb JS JI) 58) (jerr "expected :")) (<- JI JI+1)
                       (mapset m k (jvalue)) (jws)
                       d=($ldb JS JI) (<- JI JI+1)
                       (? d==44 nil d==125 more=false (jerr "expected , or }")))))
               m)
     c==91 (: (<- JI JI+1) l=(mklist 8) (jws)
              (? (&& JI<($hlen JS) (== ($ldb JS JI) 93)) (<- JI JI+1)
                 (: more=true
                    (wh more
                      (lpush l (jvalue)) (jws)
                      d=(? JI<($hlen JS) ($ldb JS JI) -1) (<- JI JI+1)
                      (? d==44 nil d==93 more=false (jerr "expected , or ]")))))
              l)
     c==34 (jstring)
     (jscalar)))
(= (jlit w)                       ; does the literal w start at JI?
  n=($hlen w) ok=(<= (+ JI n) ($hlen JS)) i=0
  (wh (&& ok i<n) (? (!= ($ldb JS JI+i) ($ldb w i)) ok=false) i+=1)
  ok)
(= (jnumchar c) (|| (&& c>=48 c<=57) c==43 c==45 c==46 c==101 c==69))
(= (jscalar)                      ; number / true / false / null at JI
  n=($hlen JS) j=JI
  (wh (&& j<n (jnumchar ($ldb JS j))) j+=1)
  (? j>JI
     (: v=(jfastnum JI j)
        (? ($isnil v) (: v=(num (strslice JS JI j)) (? ($isnil v) (jerr "bad number"))))
        (<- JI j) v)
     (jlit "true") (: (<- JI JI+4) true)
     (jlit "false") (: (<- JI JI+5) false)
     (jlit "null") (: (<- JI JI+4) nil)
     (jerr "unexpected character")))
(= (jfastnum a b)                 ; -?digits[.digits] with at most 15 digits: exact without allocating; nil = use the general parser
  i=a neg=false
  (? (&& i<b (== ($ldb JS i) 45)) (: neg=true i+=1))
  m=0 nd=0 fd=0 ok=(< i b)
  (wh (&& ok i<b (isdig ($ldb JS i))) m=($fadd ($fmul m 10) (- ($ldb JS i) 48)) nd+=1 i+=1)
  (? (&& ok i<b (== ($ldb JS i) 46))
     (: i+=1 (wh (&& i<b (isdig ($ldb JS i))) m=($fadd ($fmul m 10) (- ($ldb JS i) 48)) nd+=1 fd+=1 i+=1) (? fd==0 ok=false)))
  (? (&& ok i==b nd>0 nd<=15) (: v=(scale10 m (- fd)) (? neg ($fsub 0 v) v)) nil))
(= (unjson s)
  (<- JS (tostr s)) (<- JI 0)
  v=(jvalue) (jws)
  (? JI<($hlen JS) (jerr "trailing characters"))
  v)
