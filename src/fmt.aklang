; AST -> canonical (token-cheap) Ak text. Port of fmt.js; parse(fmt(ast)) == ast for every valid AST.
BINPREC={"||" 3 "??" 3 "&&" 4 "==" 8 "!=" 8 "<" 8 ">" 8 "<=" 8 ">=" 8 ".." 9 "|" 10 "^" 11 "&" 12 "<<" 13 ">>" 13 ">>>" 13 "+" 14 "-" 14 "*" 15 "/" 15 "%" 15 "//" 15 "**" 17}
ASSIGN_OPS=["+=" "-=" "*=" "/=" "%=" "**=" "//=" "||=" "??="]
CHAIN_NONASSOC=["==" "!=" "<" ">" "<=" ">=" ".." "-" "/" "%" "//" "<<" ">>" ">>>" "**"]
SPECIALS=["?" ":" "=" "\\" "&&" "||" "??" "wh" "for" "try" "let" "sw" "q" "aw" "req" "js" "new" "." ".@" ".=" "%list" "%map" "%spread" "%cmp" "use"]
SFORMS=["?" ":" "wh" "for" "let" "try" "sw" "q" "aw" "req" "js" "new" "use"]
OPCHARS="+-*/%<>=!&|^~?@#\\:."
P_ASSIGN=1 P_LAMBDA=2 P_UNARY=17 P_POSTFIX=20 P_ATOM=100
CALLS=false                                       ; nested calls as f(a b) instead of (f a b)

(= (fisform x n) (&& (is "list" x) #x>0 (is "sym" x[0]) (== ($ x[0]) n)))
(= (identstart b) (|| (&& b>=65 b<=90) (&& b>=97 b<=122) b==95 b==36 b>=128))
(= (identchar b) (|| (identstart b) (&& b>=48 b<=57)))
(= (isidentstr s)
  (&& (is "str" s) #s>0 (identstart (ord s[0]))
      (all c=>(identchar (ord c)) s[1..])
      (! (has ["true" "false" "nil"] s))))
(= (isopsym s) (&& #s>0 (all c=>(has OPCHARS c) [..s])))
(= (negzero x) (&& (== x 0) (== (f64bits x)[0] 2147483648)))
(= (fatom x keyok)
  (? (== x true) "true" (== x false) "false" (== x nil) "nil"
     (is "num" x) (? (negzero x) "-0" ($ x))
     (is "str" x) (? (&& keyok (isidentstr x)) (++ ":" x) (json x))
     (is "sym" x) ($ x)
     (err "bad atom")))

(= (fpr x key=false)             ; -> [text prec]
  (? (! (is "list" x)) [(fatom x key) P_ATOM]
     #x==0 ["()" P_ATOM]
     (is "sym" x[0]) (fpr_sym ($ x[0]) x[1..] #x-1 x)
     (fsform x)))
(= (fpr_sym hn a n x)
  sp=(fn_special hn a n x)
  (? sp sp
     (&& (has ASSIGN_OPS hn) n==2 (! (is "list" a[0]))) [(++ (fat a[0] P_POSTFIX) hn (fat a[1] P_ASSIGN)) P_ASSIGN]
     (&& (has ASSIGN_OPS hn) n==2 (|| (fisform a[0] "@") (fisform a[0] ".@"))) [(++ (fat a[0] P_POSTFIX) hn (fat a[1] P_ASSIGN)) P_ASSIGN]
     (: p=BINPREC[hn]
        (? (&& p!=nil n>=2 (|| n==2 (has ["+" "*" "&&" "||" "??"] hn)))
             (? (&& (has CHAIN_NONASSOC hn) n!=2) (fsform x)
                (: rassoc=(== hn "**") iscmp=(== p 8)
                   s=(fat a[0] (? (|| rassoc iscmp) p+1 p))
                   (for i 1..#a s=(++ s hn (fat a[i] (? rassoc p p+1))))
                   [s p]))
           (&& (! (has SPECIALS hn)) (! (isopsym hn))) (? (&& CALLS n>=1) [(++ hn "(" (join (~ farg a) " ") ")") P_POSTFIX] [(car (fsform x)) P_ATOM])
           (fsform x)))))
(= (car x) x[0])

; the special forms: returns [text prec] or nil to fall through
(= (fn_special hn a n x)
  (sw hn
    "%bigint" (? n==1 [(++ a[0] "n") P_ATOM])
    "%list" [(++ "[" (join (~ e=>(farg e false) a) " ") "]") P_ATOM]
    "%map" [(++ "{" (join (~ [i e]=>(farg e (== (% i 2) 0)) (enum a)) " ") "}") P_ATOM]
    "%spread" (? n==1 [(++ ".." (fat a[0] P_UNARY)) P_UNARY])
    "%cmp" (: s=(fat a[0] 9) (for i (.. 1 #a 2) s=(++ s a[i] (fat a[i+1] 9))) [s 8])
    "=" (? (&& n==2 (! (is "list" a[0]))) [(++ (fat a[0] P_POSTFIX) "=" (fat a[1] P_ASSIGN)) P_ASSIGN]
           (&& n==2 (|| (fisform a[0] "%list") (fisform a[0] "%map"))) [(++ (car (fpr a[0])) "=" (fat a[1] P_ASSIGN)) P_ASSIGN])
    "<@" (? n==3 [(++ (fat a[0] P_POSTFIX) "[" (farg a[1]) "]=" (fat a[2] P_ASSIGN)) P_ASSIGN])
    ".=" (? (&& n==3 (isidentstr a[1])) [(++ (fat a[0] P_POSTFIX) "." a[1] "=" (fat a[2] P_ASSIGN)) P_ASSIGN])
    "@" (? n==2
           (: idx=[(farg a[1] true)] base=a[0]
              (wh (&& (fisform base "@") #base==3) (: idx=[(farg base[2] true) ..idx] base=base[1]))
              [(++ (fat base P_POSTFIX) "[" (join idx " ") "]") P_POSTFIX])
           n==3
           (: lo=(? (== a[1] nil) "" (fat a[1] 10)) hi=(? (== a[2] nil) "" (fat a[2] 10))
              [(++ (fat a[0] P_POSTFIX) "[" lo ".." hi "]") P_POSTFIX]))
    ".@" (? (&& n==2 (isidentstr a[1])) [(++ (fat a[0] P_POSTFIX) "." a[1]) P_POSTFIX])
    "." (? (&& n>=2 (isidentstr a[1])) [(++ (fat a[0] P_POSTFIX) "." a[1] "(" (join (~ farg a[2..]) " ") ")") P_POSTFIX])
    "\\" (? n==2 (flambda a x))
    "-" (? n==1 [(++ "-" (fat a[0] P_UNARY)) P_UNARY])
    "!" (? n==1 [(++ "!" (fat a[0] P_UNARY)) P_UNARY])
    "#" (? n==1 [(++ "#" (fat a[0] P_UNARY)) P_UNARY])
    "bnot" (? n==1 [(++ "~" (fat a[0] P_UNARY)) P_UNARY])
    (? (has SFORMS hn) (fsform x))))
(= (flambda a x)
  ps=a[0] body=a[1]
  (? (! (is "list" ps)) nil
     (: plist=(? (&& #ps==1 (is "sym" ps[0])) ($ ps[0]) (++ "(" (join (~ fparam ps) " ") ")"))
        (? (&& #ps==1 (! (is "sym" ps[0])) (! (fisform ps[0] "%list")) (! (fisform ps[0] "%map"))) (fsform x)
           (: pl=(? (&& #ps==1 (is "sym" ps[0])) plist (&& #ps==1 (fisform ps[0] "%list")) (car (fpr ps[0])) plist)
              [(++ pl "=>" (fat body P_LAMBDA)) P_LAMBDA])))))
(= (fparam p)
  (? (is "sym" p) ($ p)
     (&& (fisform p "=") #p==3 (is "sym" p[1])) (++ ($ p[1]) "=" (fat p[2] 2))
     (fisform p "%spread") (++ ".." (fat p[1] P_UNARY))
     (|| (fisform p "%list") (fisform p "%map")) (car (fpr p))
     (err "bad param")))
(= (fsform x) [(++ "(" (join (~ e=>(farg e false) x) " ") ")") P_ATOM])
(= (farg x key=false) (car (fpr x key)))
(= (fat x mn) r=(fpr x false) (? r[1]<mn (++ "(" r[0] ")") r[0]))

;---- layout 'tight' (same text as boot/fmt.js tight()): nested calls f(a b); a statement call or special form is a `head a b` line; a function is
; `f a b =` plus one indented line per statement; plain chunk statements share a line inside bodies, an implicit line inside a body is only used
; when it ends in a word character
NOCALL=[..SPECIALS "<@" "@" "-" "!" "#" "bnot" "<-" "true" "false" "nil"]
(= (iscallform x) (&& (is "list" x) #x>0 (is "sym" x[0]) (isidentstr ($ x[0])) !(has NOCALL ($ x[0]))))
(= (fimplicit x) (&& (is "list" x) #x>=2 (is "sym" x[0]) (|| (iscallform x) (has SFORMS ($ x[0])))))
(= (fimp x) s=(car (fsform x)) s[1..#s-1])          ; the S-form without its parens: "head a b"
(= (fword s) c=s[#s-1] (&& c (|| (&& c>="a" c<="z") (&& c>="A" c<="Z") (&& c>="0" c<="9") c=="_") true))
(= (fblock xs top) lines=[] open=false
  (for x xs
    (? (&& (fimplicit x) (|| top (fword (fimp x)))) (: (push lines (fimp x)) open=false)
       (is "sym" x) (? (&& open !top) lines[#lines-1]=(++ lines[#lines-1] " " (car (fpr x))) (: (push lines (car (fpr x))) open=false))
       (: (? (&& open !top) lines[#lines-1]=(++ lines[#lines-1] " " (car (fpr x))) (push lines (car (fpr x)))) open=true)))
  lines)
(= (fmtforms forms) out=[]
  (<- CALLS true)
  (for x forms
    (? (&& (fisform x "=") #x>=3 (iscallform x[1]))
         (: (push out (++ (join (~ [i e]=>(? (== i 0) ($ e) (farg e)) (enum x[1])) " ") " ="))
            (for l (fblock x[2..] false) (push out (++ " " l))))
       (for l (fblock [x] true) (push out l))))
  (<- CALLS false)
  (++ (join out "\n") "\n"))
