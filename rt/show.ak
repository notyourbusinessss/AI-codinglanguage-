; Native runtime part 4: printing, number formatting/parsing, fmt, json, IO.
(= (fmtint x)                  ; |x| < 2^53, integral
  neg=x<0 x=(abs x)
  (? x==0 "0"
     (: buf=(strnew 24) i=24
        (wh x>0 q=($ffloor ($fdiv x 10)) d=($fsub x ($fmul q 10)) i-=1 ($stb buf i 48+d) x=q)
        (? neg (: i-=1 ($stb buf i 45)))
        (strslice buf i 24))))
(= (digits m)                  ; m: integral double < 1e17 -> decimal digit string
  (? m<9007199254740992 (fmtint m)
     (: hi=($ffloor ($fdiv m 100000000)) lo=($fsub m ($fmul hi 100000000))
        (? lo<0 (: hi=($fsub hi 1) lo=($fadd lo 100000000)))
        (strcat2 (fmtint hi) (padl (fmtint lo) 8 "0")))))
P10=nil
(= (pow10 k)                   ; 10^k, exact for 0 <= k <= 22
  (? ($isnil P10) (: l=(mklist 23) v=1 (for i 23 (lpush l v) v=($fmul v 10)) (<- P10 l)))
  (lget P10 k))
(= (scale10 m e)               ; m * 10^e with a single rounding when |e| <= 22
  (? e==0 m
     e>0 (: (wh e>22 m=($fmul m 1e22) e-=22) ($fmul m (pow10 e)))
     (: e=($fsub 0 e) (wh e>22 m=($fdiv m 1e22) e-=22) ($fdiv m (pow10 e)))))
(= (shortest ax)               ; positive finite double -> [digit string, n] with ax = 0.DIGITS * 10^n
  e10=0 t=ax
  (wh t>=10 t=($fdiv t 10) e10+=1)
  (wh t<1 t=($fmul t 10) e10-=1)
  res=nil p=1
  (wh (&& ($isnil res) p<=17)
    m=($ffloor ($fadd (scale10 ax p-1-e10) 0.5))
    (? m>=(pow10 (? p>22 22 p)) (: e10+=1 m=($ffloor ($fadd (scale10 ax p-1-e10) 0.5))))
    (? (== (scale10 m e10-p+1) ax) res=(list m p))
    (? (&& ($isnil res) p==17) res=(list m p))
    p+=1)
  ds=(digits res[0])
  ; strip trailing zeros
  k=#ds (wh (&& k>1 (== ($ldb ds k-1) 48)) k-=1)
  (list (strslice ds 0 k) e10+1))
(= (fmtflt x)
  neg=x<0 ax=(abs x) r=(shortest ax) ds=r[0] n=r[1] k=#ds
  s=(? (&& k<=n n<=21) (strcat2 ds (rpt "0" n-k))
       (&& 0<n n<=21) (strcat2 (strcat2 (strslice ds 0 n) ".") (strslice ds n k))
       (&& -6<n n<=0) (strcat2 (strcat2 "0." (rpt "0" (- n))) ds)
       (: e=n-1 es=(strcat2 (? e<0 "-" "+") (fmtint (abs e)))
          (? k==1 (strcat2 (strcat2 ds "e") es)
             (strcat2 (strcat2 (strcat2 (strslice ds 0 1) ".") (strslice ds 1 k)) (strcat2 "e" es)))))
  (? neg (strcat2 "-" s) s))
(= (fmtnum x)
  (? (!= x x) "NaN"
     (== x 0) "0"
     (> x 1.7976931348623157e308) "Infinity"
     (< x -1.7976931348623157e308) "-Infinity"
     (&& (== x ($ffloor x)) (< (abs x) 9007199254740992)) (fmtint x)
     (fmtflt x)))

; ---- show: printable form (strings quoted)
(= (jquote s)
  n=($hlen s) extra=0
  (for i n c=($ldb s i) (? (|| c==34 c==92) extra+=1 c<32 extra+=(? (|| c==8 c==9 c==10 c==12 c==13) 1 5)))
  r=(strnew n+extra+2) o=0 ($stb r 0 34) o=1
  (for i n c=($ldb s i)
    (? (|| c==34 c==92) (: ($stb r o 92) ($stb r o+1 c) o+=2)
       c<32 (? (== c 8) (: ($stb r o 92) ($stb r o+1 98) o+=2)
                (== c 9) (: ($stb r o 92) ($stb r o+1 116) o+=2)
                (== c 10) (: ($stb r o 92) ($stb r o+1 110) o+=2)
                (== c 12) (: ($stb r o 92) ($stb r o+1 102) o+=2)
                (== c 13) (: ($stb r o 92) ($stb r o+1 114) o+=2)
                (: ($stb r o 92) ($stb r o+1 117) ($stb r o+2 48) ($stb r o+3 48)
                   ($stb r o+4 (+ 48 (>> c 4))) ($stb r o+5 (? (< (& c 15) 10) (+ 48 (& c 15)) (+ 87 (& c 15)))) o+=6))
       (: ($stb r o c) o+=1)))
  ($stb r o 34) r)
(= (show x)
  (? ($isnum x) (fmtnum x)
     ($isnil x) "nil"
     ($eqp x true) "true"
     ($eqp x false) "false"
     (: t=($type x)
        (? t==1 (jquote x)
           t==7 (symstr x)
           t==2 (: parts=(mklist ($ldw x 1)) (for i ($ldw x 1) (lpush parts (show (lget x i)))) (strcat2 (strcat2 "[" (join parts " ")) "]"))
           t==4 (: parts=(mklist ($ldw x 1)) ent=($ldw x 2)
                   (for e ($ldw x 4) k=($ldw ent 2*e+1)
                     (? (! ($eqp k UNDEF)) (lpush parts (strcat2 (strcat2 (show k) " ") (show ($ldw ent 2*e+2))))))
                   (strcat2 (strcat2 "{" (join parts " ")) "}"))
           t==5 "<fn>"
           t==8 (strcat2 (strcat2 "[" (join (bytes x) " ")) "]")
           "<obj>"))))

; ---- printing
(= (p ..a) (out (join a " ")) (out "\n") (? #a (lget a #a-1) nil))
(= (pr ..a) (out (join a " ")) (? #a (lget a #a-1) nil))
(= (ep ..a) (eout (strcat2 (join a " ") "\n")) (? #a (lget a #a-1) nil))

; ---- number parsing
(= (isdig c) (&& c>=48 c<=57))
(= (digitval c) (? (&& c>=48 c<=57) c-48 (&& c>=97 c<=122) c-87 (&& c>=65 c<=90) c-55 99))
(= (parseradix s start n radix)
  (? start>=n nil
     (: v=0 ok=true i=start
        (wh (&& ok i<n) d=(digitval ($ldb s i)) (? d>=radix ok=false (: v=($fadd ($fmul v radix) d) i+=1)))
        (? ok v nil))))
(= (parsedec s i n)
  m=0 digits=0 frac=0
  (wh (&& i<n (isdig ($ldb s i))) m=($fadd ($fmul m 10) (- ($ldb s i) 48)) i+=1 digits+=1)
  (? (&& i<n (== ($ldb s i) 46))
     (: i+=1 (wh (&& i<n (isdig ($ldb s i))) m=($fadd ($fmul m 10) (- ($ldb s i) 48)) i+=1 digits+=1 frac+=1)))
  (? digits==0 nil
     (: ex=0 ok=true
        (? (&& i<n (|| (== ($ldb s i) 101) (== ($ldb s i) 69)))
           (: i+=1 eneg=false
              (? (&& i<n (|| (== ($ldb s i) 43) (== ($ldb s i) 45))) (: eneg=(== ($ldb s i) 45) i+=1))
              ed=0 (wh (&& i<n (isdig ($ldb s i))) ex=($fadd ($fmul ex 10) (- ($ldb s i) 48)) i+=1 ed+=1)
              (? ed==0 ok=false)
              (? eneg ex=($fsub 0 ex))))
        (? (&& ok i==n) (scale10 m ex-frac) nil))))
(= (num s)
  (? ($isnum s) s
     (! (isstr s)) nil
     (: s=(trim s) n=($hlen s)
        (? n==0 nil
           (: c=($ldb s 0)
              (? (&& n>2 c==48 (|| (== ($ldb s 1) 120) (== ($ldb s 1) 88))) (parseradix s 2 n 16)
                 (&& n>2 c==48 (|| (== ($ldb s 1) 98) (== ($ldb s 1) 66))) (parseradix s 2 n 2)
                 (&& n>2 c==48 (|| (== ($ldb s 1) 111) (== ($ldb s 1) 79))) (parseradix s 2 n 8)
                 (: neg=false i=0
                    (? (|| c==43 c==45) (: neg=(c==45) i=1))
                    v=(? (streq (strslice s i n) "Infinity") ($fdiv 1 0) (parsedec s i n))
                    (? (&& (! ($isnil v)) neg) ($fsub 0 v) v))))))))

; ---- fmt: %[-][0][width][.prec](s|d|f|x|X|b|o|%)
(= (tofixed x prec)
  neg=x<0 ax=(abs x)
  m=($ffloor ($fadd (scale10 ax prec) 0.5))
  ds=(digits m)
  (? (<= #ds prec) ds=(strcat2 (rpt "0" prec+1-#ds) ds))
  s=(? prec==0 ds (strcat2 (strcat2 (strslice ds 0 #ds-prec) ".") (strslice ds #ds-prec #ds)))
  (? (&& neg (> m 0)) (strcat2 "-" s) s))
(= (toradix x radix)
  neg=x<0 x=(abs ($ftrunc x))
  (? x==0 "0"
     (: buf=(strnew 64) i=64
        (wh x>0 q=($ffloor ($fdiv x radix)) d=($fsub x ($fmul q radix)) i-=1 ($stb buf i (? d<10 48+d 87+d)) x=q)
        (? neg (: i-=1 ($stb buf i 45)))
        (strslice buf i 64))))
(= (fmt f ..a)
  r=(mklist 8) n=#f i=0 ai=0
  (wh i<n
    c=($ldb f i)
    (? (!= c 37) (: j=i (wh (&& j<n (!= ($ldb f j) 37)) j+=1) (lpush r (strslice f i j)) i=j)
       (: i+=1 left=false zero=false w=0 prec=nil
          (? (&& i<n (== ($ldb f i) 45)) (: left=true i+=1))
          (? (&& i<n (== ($ldb f i) 48)) (: zero=true i+=1))
          (wh (&& i<n (isdig ($ldb f i))) w=w*10+(($ldb f i)-48) i+=1)
          (? (&& i<n (== ($ldb f i) 46)) (: i+=1 prec=0 (wh (&& i<n (isdig ($ldb f i))) prec=prec*10+(($ldb f i)-48) i+=1)))
          t=(? i<n ($ldb f i) 0) i+=1
          (? t==37 (lpush r "%")
             (: v=(at a ai) ai+=1
                s=(sw t
                    115 (: s=(tostr v) (? (! ($isnil prec)) (strslice s 0 (? prec<#s prec #s)) s))
                    100 (fmtint ($ftrunc (tonum v)))
                    102 (tofixed (tonum v) (?? prec 6))
                    120 (toradix (tonum v) 16)
                    88 (up (toradix (tonum v) 16))
                    98 (toradix (tonum v) 2)
                    111 (toradix (tonum v) 8)
                    (strcat2 "%" (chr t)))
                pad=w-#s
                (lpush r (? pad<=0 s left (strcat2 s (rpt " " pad))
                            zero (? (&& #s>0 (== ($ldb s 0) 45)) (strcat2 "-" (strcat2 (rpt "0" pad) (strslice s 1 #s))) (strcat2 (rpt "0" pad) s))
                            (strcat2 (rpt " " pad) s))))))))
  (join r ""))

; ---- json
(= (jstr x ind lvl)
  (? ($isnil x) "null"
     ($isnum x) (? (|| (!= x x) (> (abs x) 1.7976931348623157e308)) "null" (fmtnum x))
     (isbool x) (show x)
     (isstr x) (jquote x)
     (issym x) (jquote (symstr x))
     (islist x) (? #x==0 "[]"
                   (jwrap "[" "]" (~ y=>(jstr y ind lvl+1) x) ind lvl))
     (ismap x) (? #x==0 "{}"
                  (jwrap "{" "}" (~ kv=>(strcat2 (strcat2 (jquote (tostr kv[0])) (? ind ": " ":")) (jstr kv[1] ind lvl+1)) (mapentries x)) ind lvl))
     "null"))
(= (jwrap open close parts ind lvl)
  (? ind (: pad=(strcat2 "\n" (rpt " " ind*(lvl+1))) end=(strcat2 "\n" (rpt " " ind*lvl))
            (strcat2 (strcat2 (strcat2 open pad) (join parts (strcat2 "," pad))) (strcat2 end close)))
     (strcat2 (strcat2 open (join parts ",")) close)))
(= (json x ind=nil) (jstr x ind 0))
