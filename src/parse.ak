; Ak parser, written in Ak (port of syntax.js). AST: atoms are num/str/true/false/nil, symbols are `sym`s, forms are lists.
; Form positions live in POS (identity-keyed); symbols carry their own line/col.
P={:s "" :i 0 :file "" :starts [] :idx false}
POS={}
BIN=[[">>>" 13] ["**=" 1] ["//=" 1] ["||=" 1] ["??=" 1] ["=>" 2] ["==" 8] ["!=" 8] ["<=" 8] [">=" 8] ["&&" 4] ["||" 3] ["??" 3] ["**" 17] ["//" 15] ["<<" 13] [">>" 13] [".." 9] ["+=" 1] ["-=" 1] ["*=" 1] ["/=" 1] ["%=" 1] ["+" 14] ["-" 14] ["*" 15] ["/" 15] ["%" 15] ["<" 8] [">" 8] ["=" 1] ["&" 12] ["|" 10] ["^" 11]]
PREC={}
(for [op p] BIN PREC[op]=p)
ASSIGN=["=" "+=" "-=" "*=" "/=" "%=" "**=" "//=" "||=" "??="]
CMP=["<" ">" "<=" ">=" "==" "!="]
SPECIAL=["?" ":" "=" "\\" "&&" "||" "??" "wh" "for" "try" "let" "sw" "q" "aw" "req" "js" "new" "." ".@" ".=" "%list" "%map" "%spread" "%cmp"]
UNARY={"-" "-" "!" "!" "#" "#" "~" "bnot"}
OPCH="+-*/%<>=!&|^~?@#\\:."

(= (S n) (sym n))
(= (lc p) st=P.starts lo=0 hi=#st-1
  (wh lo<hi m=(lo+hi+1)//2 (? st[m]<=p lo=m hi=m-1))
  [lo+1 p-st[lo]+1])
(= (pos p=nil) (lc (?? p P.i)))
(= (perr msg at=nil) [l c]=(pos at) (err (++ P.file ":" l ":" c ": " msg)))
(= (mk items p) POS[items]=p items)
(= (isform x n) (&& (is "list" x) #x>0 (is "sym" x[0]) (== ($ x[0]) n)))
(= (issym x) (is "sym" x))
(= (isws c) (&& c (has " \t\n\r," c) true))
(= (isdig c) (&& c "0"<=c<="9"))
(= (ids c) (&& c (|| ("a"<=c<="z") ("A"<=c<="Z") c=="_" c=="$" c>="\u0080") true))
(= (idc c) (&& c (|| (ids c) (isdig c)) true))
(= (isopch c) (&& c (has OPCH c) true))
(= (closer c) (&& c (has ")]}" c) true))
(= (atbreak) c=P.s[P.i] (|| c==nil (isws c) (has ")]};" c)))
(= (skipws) c=P.s[P.i]
  (? (isws c) (: P.i+=1 (skipws))
     c==";" (: (wh (&& P.i<#P.s P.s[P.i]!="\n") P.i+=1) (skipws))))

(= (program) out=[] (skipws)
  (wh P.i<#P.s
    (? (closer P.s[P.i]) (perr (++ "unexpected '" P.s[P.i] "'")))
    (push out (chunk)) (skipws))
  out)

(= (elems close op) out=[] done=false
  (wh !done (skipws)
    (? P.i>=#P.s (perr (++ "missing '" close "' for '" op[0] "' opened at " op[1] ":" op[2]) #P.s)
       (: c=P.s[P.i]
          (? c==close (: P.i+=1 done=true)
             (closer c) (perr (++ "expected '" close "' but found '" c "' (opened at " op[1] ":" op[2] ")"))
             (push out (chunk))))))
  out)

(= (chunk) (bin 0))
(= (peekbin) r=nil (for [op _] BIN (? (&& r==nil P.s[P.i..P.i+#op]==op) r=op)) r)

(= (bin minp) left=(unary) done=false
  (wh !done
    (? (atbreak) done=true
       (: op=(peekbin)
          (? op==nil (perr (++ "unexpected '" (peek) "' after expression; elements must be separated by whitespace")))
          prec=PREC[op]
          (? prec<minp done=true
             (: oppos=(pos) P.i+=#op
                (? (&& op==".." P.idx (atbreak)) (: left=(mk [(S "..") left nil] oppos) done=true)
                   (: (? (atbreak) (perr (++ "dangling operator '" op "' (infix operators must not have spaces around them)") P.i-#op))
                      left=(binstep op prec left oppos))))))))
  left)

(= (peek o=0) P.s[P.i+o])

(= (binstep op prec left oppos)
  (? op=="=>" (: body=(bin 2) (mk [(S "\\") (toparams left) body] oppos))
     (has ASSIGN op) (: right=(bin 1) (mkassign op left right oppos))
     (has CMP op) (cmpchain op prec left oppos)
     (: right=(? op=="**" (bin prec) (bin prec+1)) (mk [(S op) left right] oppos))))

(= (cmpchain op prec left oppos) operands=[left] ops=[op] go=true
  (push operands (bin prec+1))
  (wh (&& go !(atbreak)) o2=(peekbin)
    (? (&& o2 (has CMP o2))
       (: P.i+=#o2 (? (atbreak) (perr (++ "dangling operator '" o2 "'") P.i-#o2)) (push ops o2) (push operands (bin prec+1)))
       go=false))
  (? #ops==1 (mk [(S op) operands[0] operands[1]] oppos)
     (: r=[operands[0]] (for k #ops (push r ops[k] operands[k+1])) (mk [(S "%cmp") ..r] oppos))))

(= (mkassign op target rhs p)
  (? op=="="
     (? (&& (isform target "@") #target==3) (mk [(S "<@") target[1] target[2] rhs] p)
        (isform target ".@") (mk [(S ".=") target[1] target[2] rhs] p)
        (|| (issym target) (isform target "%list") (isform target "%map")) (mk [(S "=") target rhs] p)
        (perr "invalid assignment target (use a name, a[i], a.b, or a [x y] pattern)"))
     (: (? !(|| (issym target) (isform target "@") (isform target ".@")) (perr (++ "invalid target for " op)))
        (mk [(S op) target rhs] p))))

(= (toparams x)
  (? (issym x) [x]
     (&& (is "list" x) #x==0) []
     (&& (is "list" x) !(&& (issym x[0]) (has SPECIAL ($ x[0])))) x
     (isform x "%list") [x]
     (perr "bad lambda parameters before =>")))

(= (symrun) j=P.i (wh (isopch P.s[j]) j+=1) c=P.s[j] (|| c==nil (isws c) (has ")]};" c)))

(= (unary) c=(peek) c2=(peek 1)
  (? (&& c=="." c2=="." (: nxt=P.s[P.i+2] (&& nxt!=nil !(isws nxt) !(closer nxt))))
       (: p=(pos) P.i+=2 operand=(bin (? P.idx 10 17)) (? P.idx (mk [(S "..") nil operand] p) (mk [(S "%spread") operand] p)))
     (&& c (has "-!#~" c) c2!=nil !(isws c2) !(closer c2) c2!=";" !(&& (isopch c2) (symrun)))
       (: p=(pos) P.i+=1 arg=(bin 17)
          (? (&& c=="-" (is "num" arg)) -arg
             (&& c=="-" (isform arg "%bigint")) (mk [(S "%bigint") (++ "-" arg[1])] p)
             (mk [(S UNARY[c]) arg] p)))
     (postfix (primary))))

(= (primary) c=(peek) p=(pos)
  (? c=="(" (: P.i+=1 sv=P.idx P.idx=false els=(elems ")" ["(" p[0] p[1]]) P.idx=sv
              (? #els==0 (mk [] p)
                 (&& #els==1 !(issym els[0])) els[0]
                 (mk els p)))
     c=="[" (: P.i+=1 sv=P.idx P.idx=false els=(elems "]" ["[" p[0] p[1]]) P.idx=sv (mk [(S "%list") ..els] p))
     c=="{" (: P.i+=1 sv=P.idx P.idx=false els=(elems "}" ["{" p[0] p[1]]) P.idx=sv
              (? #els%2 (perr "map literal needs key/value pairs" 0))
              (mk [(S "%map") ..els] p))
     c=="\"" (string)
     (|| (isdig c) (&& c=="." (isdig (peek 1)))) (number)
     (&& c==":" (ids (peek 1))) (: P.i+=1 st=P.i (wh (idc P.s[P.i]) P.i+=1) P.s[st..P.i])
     (ids c) (: st=P.i (wh (idc P.s[P.i]) P.i+=1) w=P.s[st..P.i]
               (? w=="true" true w=="false" false w=="nil" nil (: [l cc]=(pos st) (mksym w l cc))))
     (isopch c) (: st=P.i (wh (isopch P.s[P.i]) P.i+=1) w=P.s[st..P.i] nc=P.s[P.i]
                  (? !(|| nc==nil (isws nc) (closer nc) nc==";")
                     (perr (++ "operator '" w "' must be followed by a space (infix operators go between operands with no spaces: a" w "b)") st))
                  (S w))
     (perr (++ "unexpected '" c "'"))))

(= (mkcall callee args p)
  (? (&& (isform callee ".@") #callee==3 (is "str" callee[2])) (mk [(S ".") callee[1] callee[2] ..args] p)
     (mk [callee ..args] p)))

(= (postfix n) done=false
  (wh !done c=(peek)
    (? c=="(" (: p=(pos) P.i+=1 sv=P.idx P.idx=false args=(elems ")" ["(" p[0] p[1]]) P.idx=sv n=(mkcall n args p))
       c=="[" (: p=(pos) P.i+=1 sv=P.idx P.idx=true els=(elems "]" ["[" p[0] p[1]]) P.idx=sv
                (? #els==0 (perr "empty index []" P.i-2))
                (for e els (? (&& (isform e "..") #e==3) n=(mk [(S "@") n e[1] e[2]] p) n=(mk [(S "@") n e] p))))
       (&& c=="." (peek 1)!="." (ids (peek 1))) (: p=(pos) P.i+=1 st=P.i (wh (idc P.s[P.i]) P.i+=1) n=(mk [(S ".@") n P.s[st..P.i]] p))
       done=true))
  n)

(= (digits ok) (wh (&& (ok P.s[P.i])) P.i+=1))
(= (stripu s) (rep s "_" ""))
(= (hexdig c) (&& c (has "0123456789abcdefABCDEF_" c) true))
(= (radix s base) v=0 (for c s (? c!="_" v=v*base+(idx "0123456789abcdef" (lo c)))) v)
(= (number) s=P.s st=P.i
  (? (&& s[P.i]=="0" (has "xX" (?? s[P.i+1] "-")))
       (: P.i+=2 (digits hexdig) (radix s[st+2..P.i] 16))
     (&& s[P.i]=="0" (has "bB" (?? s[P.i+1] "-")))
       (: P.i+=2 (digits (c=>(&& c (has "01_" c) true))) (radix s[st+2..P.i] 2))
     (: (digits (c=>(|| (isdig c) c=="_")))
        (? s[P.i]=="n" (: P.i+=1 (mk [(S "%bigint") (stripu s[st..P.i-1])] (pos st)))
           (: (? (&& s[P.i]=="." (isdig s[P.i+1])) (: P.i+=1 (digits (c=>(|| (isdig c) c=="_")))))
              (? (has "eE" (?? s[P.i] "-"))
                 (: j=P.i+1 (? (has "+-" (?? s[j] "x")) j+=1) k=j (wh (isdig s[k]) k+=1) (? k>j P.i=k)))
              (num (stripu s[st..P.i])))))))

(= (hexval s) (radix s 16))
(= (string) s=P.s open=P.i out="" done=false P.i+=1
  (wh !done
    (? P.i>=#s (perr "unterminated string" open))
    c=s[P.i] P.i+=1
    (? c=="\"" done=true
       c!="\\" out+=c
       (: e=s[P.i] P.i+=1
          (sw e "n" out+="\n" "t" out+="\t" "r" out+="\r" "0" out+="\0" "e" out+="\e" "\\" out+="\\" "\"" out+="\"" "'" out+="'" "$" out+="$"
              "u" (? s[P.i]=="{" (: j=(idx s[P.i..] "}") out+=(chr (hexval s[P.i+1..P.i+j])) P.i+=j+1)
                     (: out+=(chr (hexval s[P.i..P.i+4])) P.i+=4))
              "x" (: out+=(chr (hexval s[P.i..P.i+2])) P.i+=2)
              (perr (++ "bad escape \\" e) P.i-2)))))
  out)

(= (parse src file)
  src=(? (starts src "#!") (: j=(idx src "\n") (? j<0 "" src[j..])) src)
  P.s=src P.i=0 P.file=file P.idx=false
  st=[0] (for i #src (? src[i]=="\n" (push st i+1)))
  P.starts=st
  (program))

; ---- debug dump (same format as tests/syntax.test.js)
(= (dump x)
  (? x==nil "nil" x==true "true" x==false "false"
     (is "sym" x) ($ x)
     (is "str" x) (json x)
     (is "num" x) ($ x)
     (isform x "%bigint") (++ x[1] "n")
     (++ "(" (join (~ dump x) " ") ")")))
