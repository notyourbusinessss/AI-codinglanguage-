; AST -> Core IR for the native backend. Semantics mirror ak.js (function-local `=`, <- rebinding, per-iteration loop vars, ...).
; IR nodes are lists headed by a tag string:
;   ["nil"] ["true"] ["false"] ["num" x] ["str" s] ["sym" name]
;   ["ref" V] ["set" V e] ["init" V e]            V = variable record (map), resolved to slot/box/free/global at codegen
;   ["if" c a b] ["seq" e..] ["and" a b] ["or" a b] ["nilor" a b] ["not" e] ["while" c body]
;   ["call" f args] ["tcall" f args] ["fn" F] ["prim" op args] ["try" body V handler] ["throw" e]
; Records are maps compared by :id only (never ==, which would recurse through the cycles).
L={:cf nil :cs nil :uid 0 :file "<ak>" :nglob 0 :funcs [] :globals [] :line 1 :col 1 :prelude nil :mod nil}
POS={}
INLINE=["+" "-" "*" "/" "%" "//" "**" "<" ">" "<=" ">=" "==" "!=" "!" "&" "|" "^" "<<" ">>" ">>>" "bnot"]
INTRINSICS=["$ldw" "$stw" "$ldb" "$stb" "$type" "$hlen" "$sethdr" "$new" "$newb" "$addr" "$syscall" "$isptr" "$isnum" "$isnil" "$eqp" "$bitshi" "$bitslo" "$frombits" "$throw" "$peek" "$poke" "$argc" "$argv" "$toint" "$fadd" "$fsub" "$fmul" "$fdiv" "$fsqrt" "$ffloor" "$fceil" "$ftrunc" "$band" "$bor" "$bxor" "$shl" "$shr" "$ushr" "$tagof" "$void" "$copy" "$apply" "$tracetop" "$tracebase" "$tracenames" "$peekw" "$pokew" "$ptraddr" "$mkptr" "$rawcopy" "$vtop" "$vbase" "$hptr" "$heapbase" "$nglob" "$gcset" "$gclim" "$envp" "$gbase" "$label" "$islist" "$isstr" "$ismap" "$issym" "$isfn" "$strhash" "$streq" "$gccopy" "$ld16" "$st16" "$ldf32" "$stf32"]
PREDS={"islist" "$islist" "isstr" "$isstr" "ismap" "$ismap" "issym" "$issym" "isfn" "$isfn" "isnum" "$isnum"}
OPASSIGN=["+=" "-=" "*=" "/=" "%=" "**=" "//=" "||=" "??="]
(= (S n) (sym n))
(= (issym x) (is "sym" x))
(= (isform x n) (&& (is "list" x) #x>0 (is "sym" x[0]) (== ($ x[0]) n)))
(= (ispat x) (isform x "%list"))
(= (isspread x) (isform x "%spread"))
(= (islam x) (isform x "\\"))
(= (newid) L.uid+=1 L.uid)

; ---- errors / positions
(= (note x)
  (? (is "list" x) (: p=POS[x] (? p (: L.line=p[0] L.col=p[1])))
     (is "sym" x) (? (symline x)>0 (: L.line=(symline x) L.col=(symcol x)))))
(= (lerr msg node=nil) (? node (note node)) (err (++ L.file ":" L.line ":" L.col ": " msg)))

; ---- records
(= (newfn name parent)
  f={:id (newid) :name name :parent parent :nslots 1 :nparams 0 :rest false :hasdef false :free [] :freeidx {} :body nil :ismod false :root nil :ret nil :vars [] :static nil :pos (++ L.file ":" L.line)}
  (push L.funcs f) f)
(= (newslot) s=L.cf.nslots L.cf.nslots=s+1 s)
(= (mkvar name kind) {:id (newid) :name name :kind kind :fn L.cf :slot -1 :gid -1 :captured false :assigned false :param false :arity nil :isfn false :predecl false :set false})
(= (mklocal name) v=(mkvar name "local") v.slot=(newslot) (push L.cf.vars v) v)
(= (mkglobal name) v=(mkvar name "global") v.gid=L.nglob L.nglob+=1 (push L.globals v) v)

; ---- scopes
(= (push_scope) L.cs={:vars {} :parent L.cs :fn L.cf})
(= (pop_scope) L.cs=L.cs.parent)
(= (lookup name) s=L.cs r=nil (wh (&& s r==nil) r=s.vars[name] s=s.parent) r)
(= (lookup_local name) s=L.cs r=nil (wh (&& s r==nil s.fn.id==L.cf.id (! s.isprel)) r=s.vars[name] s=s.parent) r)   ; the runtime scope is not local to user code: user globals shadow runtime names
(= (lookup_outer name) s=L.cs (wh (&& s s.fn.id==L.cf.id) s=s.parent)
  r=nil (wh (&& s r==nil) r=s.vars[name] s=s.parent) r)
; a function-level variable (Python semantics): hoisted at the root of the current function; module level -> global
(= (declare_root name) v=(? L.cf.ismod (mkglobal name) (mklocal name)) L.cf.root.vars[name]=v v)
(= (declare_block name) v=(mklocal name) v.blk=true L.cs.vars[name]=v v)

; ---- names assigned at function level (descends into blocks, not into lambdas)
(= (leaves p out)
  (? (issym p) (? ($ p)!="_" out[($ p)]=false)
     (ispat p) (for q p[1..] (leaves (? (isspread q) q[1] q) out))))
(= (decls forms) out={}
  (= (walk x)
    (? (&& (is "list" x) #x>0)
       (? (!(issym x[0])) (for y x (walk y))
          (: n=($ x[0])
             (? (|| n=="\\" n=="q") nil
                n=="=" (: t=x[1]
                          (? (&& (is "list" t) (! (ispat t))) (? (issym t[0]) out[($ t[0])]=true)
                             (issym t) (: out[($ t)]=(|| (islam x[2]) (?? out[($ t)] false)) (walk x[2]))
                             (: (leaves t out) (walk x[2]))))
                n=="let" (: (walk x[1]) (for y x[2..] (walk y)))
                (for y x[1..] (walk y)))))))
  (for f forms (walk f))
  out)
(= (predeclare m)
  (for [name isfn] m (? !(lookup_local name) (: v=(declare_root name) v.isfn=isfn v.predecl=true))))
(= (mentions x name)
  (? (issym x) (== ($ x) name) (is "list" x) (any y=>(mentions y name) x) false))

; ---- capture: V used in function f (not its owner): add to f's free list, and to every function between
(= (capture f v)
  (? (&& f.id!=v.fn.id (== (?? f.freeidx[v.id] -1) -1))
     (: f.freeidx[v.id]=#f.free (push f.free v) v.captured=true
        (capture f.parent v))))

(= (const x) (? x==nil ["nil"] x==true ["true"] x==false ["false"] (is "num" x) ["num" x] (is "str" x) ["str" x] (lerr "unsupported literal")))

(= (lower_ref x)
  (note x) name=($ x) v=(lookup name)
  (? v==nil (lerr (++ "undefined: " name) x))
  (? (&& v.kind=="local" v.fn.id!=L.cf.id) (capture L.cf v))
  ["ref" v])

; ---- entry points
(= (lower x tail=false)
  (? (issym x) (lower_ref x)
     (! (is "list" x)) (const x)
     #x==0 ["nil"]
     (: (note x) h=x[0]
        (? (issym h) (lower_form ($ h) x tail) (lower_call x tail)))))
(= (lowerseq forms tail)
  (? #forms==0 ["nil"]
     #forms==1 (lower forms[0] tail)
     (: es=(~ f=>(lower f false) forms[..#forms-1]) (push es (lower forms[#forms-1] tail)) ["seq" ..es])))

(= (lower_form n x tail)
  (sw n
    "%list" (lower_list x)
    "%map" (lower_map x)
    "%spread" (lerr "..x spread is only allowed in call arguments and list literals" x)
    "%cmp" (lower (cmp_chain x) tail)
    "%bigint" (lower_rt "bigfrom" [x[1]])
    "?" (lower_if x[1..] tail)
    ":" (lowerseq x[1..] tail)
    "=" (lower_assign x)
    "<-" (lower_set x)
    ["+=" "-=" "*=" "/=" "%=" "**=" "//=" "||=" "??="] (lower_opassign n x)
    "\\" (lower_lambda x)
    "&&" (lower_and x[1..])
    "||" (lower_or x[1..])
    "??" (lower_nilor x[1..])
    "wh" (lower_while x)
    "for" (lower_for x)
    "try" (lower_try x tail)
    "let" (lower_let x tail)
    "sw" (lower (swexpand x) tail)
    "q" (lower_quote x[1])
    "@" (lower_at x tail)
    "<@" (lower_rt "put" x[1..])
    ".@" (? (is "str" x[2]) (lower_rt "dotc" [x[1] x[2] (hash23 x[2])]) (lower_rt "dot" [x[1] x[2]]))
    ".=" (? (is "str" x[2]) (lower_rt "setdotc" [x[1] x[2] (hash23 x[2]) x[3]]) (lower_rt "setdot" x[1..]))
    ["aw" "req" "js" "new" "."] (lerr (++ "(" n " ..) needs the JS target; the native target has no JS interop") x)
    (lower_call x tail)))

(= (lower_rt name args) ["call" (rtref name) (~ a=>(lower a false) args)])
(= (rtref name) v=L.prelude.vars[name] (? v==nil (err (++ "runtime function missing: " name))) ["ref" v])

(= (lower_quote x)
  (? (issym x) ["call" (rtref "sym") [["str" ($ x)]]]
     (is "list" x) ["call" (rtref "list") (~ lower_quote (? (ispat x) x[1..] x))]
     (const x)))

(= (hash23 s) h=0 (for c (bytes s) h=(h*31+c)&8388607) h)
(= (lower_at x tail)
  (? (&& #x==3 (is "str" x[2])) (lower_rt "dotc" [x[1] x[2] (hash23 x[2])])
     #x==3 (lower_rt "at" x[1..]) #x==4 (lower_rt "slice" x[1..]) (lerr "(@ obj index) or (@ obj lo hi)" x)))

; ---- list / map literals (spread -> concatenation of pieces)
(= (lower_list x) items=x[1..]
  (? (any isspread items)
     (: parts=[] cur=[]
        (for it items
          (? (isspread it) (: (? cur (: (push parts ["call" (rtref "list") (~ a=>(lower a false) cur)]) cur=[]))
                              (push parts ["call" (rtref "toarr") [(lower it[1] false)]]))
             (push cur it)))
        (? cur (push parts ["call" (rtref "list") (~ a=>(lower a false) cur)]))
        ["call" (rtref "concat") parts])
     ["call" (rtref "list") (~ a=>(lower a false) items)]))
(= (lower_map x) (? #x%2==0 (lerr "map literal needs key/value pairs" x)) ["call" (rtref "map") (~ a=>(lower a false) x[1..])])

; ---- conditionals and short circuit
(= (lower_if args tail)
  (? #args==0 ["nil"]
     #args==1 (lower args[0] tail)
     ["if" (lower args[0] false) (lower args[1] tail) (lower_if args[2..] tail)]))
(= (lower_and xs) (? #xs==0 ["true"] #xs==1 (lower xs[0] false) ["and" (lower xs[0] false) (lower_and xs[1..])]))
(= (lower_or xs) (? #xs==0 ["false"] #xs==1 (lower xs[0] false) ["or" (lower xs[0] false) (lower_or xs[1..])]))
(= (lower_nilor xs) (? #xs==0 ["nil"] #xs==1 (lower xs[0] false) ["nilor" (lower xs[0] false) (lower_nilor xs[1..])]))
(= (lower_while x) ["while" (lower x[1] false) (lowerseq x[2..] false)])

; ---- temps and chains
(= (newtemp name) v=(mklocal name) v.blk=true L.cs.vars[name]=v v)
(= (cmp_chain x) operands=[] ops=[]
  (for i #x-1 (push (? i%2==0 operands ops) x[i+1]))
  tests=[] left=operands[0]
  (for i #ops
    right=operands[i+1] nextleft=right
    (? i<#ops-1 (: g=(++ "%c" (newid)) (newtemp g) right=[(S "=") (S g) right] nextleft=(S g)))
    (push tests [(S ops[i]) left right])
    left=nextleft)
  r=[(S "&&") ..tests] (? POS[x] POS[r]=POS[x]) r)
(= (swexpand x)
  g=(++ "%sw" (newid)) (newtemp g)
  rest=x[2..] out=[] i=0
  (wh i+1<#rest
    c=rest[i]
    test=(? (ispat c) [(S "||") ..(~ v=>[(S "==") (S g) v] c[1..])] [(S "==") (S g) c])
    (push out test rest[i+1]) i+=2)
  (? i<#rest (push out rest[i]))
  [(S ":") [(S "=") (S g) x[1]] [(S "?") ..out]])

; ---- functions
(= (parse_params lst node)
  lst=(? (|| (issym lst) (ispat lst)) [lst] lst)
  (? !(is "list" lst) (lerr "parameter list must be (a b ..)" node))
  ps=[] rest=nil mn=0 seendef=false
  (for [i p] (enum lst)
    (? (issym p) (: (? seendef (lerr (++ "parameter " ($ p) " without default follows a default") node)) (push ps {:name ($ p)}) mn+=1)
       (&& (isform p "=") #p==3 (issym p[1])) (: (push ps {:name ($ p[1]) :def p[2] :hasdef true}) seendef=true)
       (&& (isspread p) (issym p[1])) (: (? i!=#lst-1 (lerr "rest parameter must be last" node)) rest=($ p[1]))
       (ispat p) (: (? seendef (lerr "pattern parameter follows a default" node)) (push ps {:pat p}) mn+=1)
       (lerr "bad parameter" node)))
  {:ps ps :rest rest :min mn :max (? rest 1e9 #ps)})

(= (lower_fn name plist body selfv node)
  pp=(parse_params plist node)
  f=(newfn name L.cf)
  (? selfv selfv.arity=[pp.min pp.max])
  savecf=L.cf savecs=L.cs
  L.cf=f
  (push_scope) f.root=L.cs
  f.nparams=#pp.ps f.rest=(pp.rest!=nil)
  pro=[]                                    ; prologue IR (defaults, pattern params)
  (for p pp.ps
    (? p.pat (: v=(mklocal "%pat") (push pro [p.pat v]) p.slot=v.slot)
       (: v=(mklocal p.name) v.param=true f.root.vars[p.name]=v p.v=v)))
  (? pp.rest (: v=(mklocal pp.rest) v.param=true f.root.vars[pp.rest]=v))
  f.hasdef=(any p=>p.hasdef pp.ps)
  (predeclare (decls [..body ..(~ q=>[(S "=") q[0] nil] pro)]))
  pre=[]
  (for p pp.ps
    (? p.hasdef (push pre ["if" ["prim" "isundef" [["ref" p.v]]] ["set" p.v (lower p.def false)] ["nil"]])
       (&& f.hasdef p.v) (push pre ["if" ["prim" "isundef" [["ref" p.v]]] ["set" p.v ["nil"]] ["nil"]])))
  (for [pat pv] pro
    (push pre (destructure pat ["ref" pv] (name val)=>(leaf_assign name val))))
  f.body=["seq" ..pre (lowerseq body true)]
  L.cf=savecf L.cs=savecs
  f)
(= (lower_lambda x)
  (? #x<2 (lerr "(\\ (params) body..)" x))
  ["fn" (lower_fn "\\" x[1] x[2..] nil x)])

; ---- assignment
(= (leaf_assign name val)
  v=(lookup_local name)
  (? v==nil v=(declare_root name))
  v.set=true
  ["set" v val])
(= (leaf_let name val)
  v=(declare_block name)
  ["init" v val])
(= (destructure pat src leaf)
  t=(newtemp (++ "%d" (newid))) items=pat[1..]
  steps=[["init" t ["call" (rtref "toarr") [src]]]]
  (for [k it] (enum items)
    (? (isspread it) (: (? (|| k!=#items-1 !(issym it[1])) (lerr "rest pattern ..x must be last" pat))
                        (? ($ it[1])!="_" (push steps (leaf ($ it[1]) ["call" (rtref "slice") [["ref" t] ["num" k] ["nil"]]]))))
       (issym it) (? ($ it)!="_" (push steps (leaf ($ it) ["call" (rtref "at") [["ref" t] ["num" k]]])))
       (ispat it) (push steps (destructure it ["call" (rtref "at") [["ref" t] ["num" k]]] leaf))
       (lerr "bad destructuring pattern (use names, _, nested [..], ..rest)" pat)))
  ["seq" ..steps ["ref" t]])

(= (lower_assign x)
  t=x[1]
  (? (&& (is "list" t) (! (ispat t)))                       ; (= (f a b) body..)
       (: (? !(issym t[0]) (lerr "function name must be a symbol" x))
          name=($ t[0]) v=(lookup_local name)
          (? v==nil v=(declare_root name))
          v.isfn=true v.set=true
          ["set" v ["fn" (lower_fn name t[1..] x[2..] v x)]])
     (: (? #x!=3 (lerr "(= name value) takes exactly one value" x))
        (? (ispat t) (lower_patassign t x[2])
           (issym t) (lower_symassign t x)
           (lerr "= target must be a name, a [pattern], or (name params..)" x)))))
(= (lower_patassign t v)
  (? (&& (ispat v) #v==#t (! (any isspread v[1..])) (all issym t[1..]))
       (: tmps=[] steps=[]
          (for e v[1..] tv=(newtemp (++ "%p" (newid))) (push steps ["init" tv (lower e false)]) (push tmps tv))
          (for [i y] (enum t[1..]) (? ($ y)!="_" (push steps (leaf_assign ($ y) ["ref" tmps[i]]))))
          ["seq" ..steps ["nil"]])
     (destructure t (lower v false) leaf_assign)))
(= (lower_symassign t x)
  name=($ t) v=(lookup_local name)
  (? v==nil v=(declare_root name))
  (? (&& v.predecl !v.set (lookup_outer name) (mentions x[2] name))
     (lerr (++ name " is local to this function (it is assigned here) but is read before assignment; to change the outer " name " use (<- " name " ..)") x))
  ; a lambda value keeps its name (arity checks / direct calls)
  rhs=(? (islam x[2]) (: v.isfn=true ["fn" (lower_fn name x[2][1] x[2][2..] v x[2])]) (lower x[2] false))
  v.set=true
  ["set" v rhs])

(= (lower_set x) t=x[1]
  (? #x!=3 (lerr "(<- name value)" x))
  (? (&& (isform t "@") #t==3) (lower_rt "put" [t[1] t[2] x[2]])
     (! (issym t)) (lerr "<- target must be a name" x)
     (: v=(lookup ($ t))
        (? v==nil (lerr (++ "<-: undefined variable " ($ t)) x))
        (? (&& v.kind=="local" v.fn.id!=L.cf.id) (capture L.cf v))
        v.set=true
        ["set" v (lower x[2] false)])))

(= (lower_opassign n x)
  op=n[..#n-1] t=x[1] v=x[2]
  (? (issym t)
       (: (? (lookup_local ($ t))==nil
             (? (lookup ($ t)) (lerr (++ ($ t) " belongs to an enclosing function/scope; assigning here would create a local. Use (<- " ($ t) " " ($ t) op "..) to modify it") x)
                (lerr (++ "undefined: " ($ t)) x)))
          (lower [(S "<-") t [(S op) t v]] false))
     (|| (isform t "@") (isform t ".@"))
       (: a=(++ "%o" (newid)) i=(++ "%i" L.uid) (newtemp a)
          constkey=(is "str" t[2])
          (? !constkey (newtemp i))
          (note x)
          ik=(? constkey t[2] (S i))
          (seq_ [["init" (lookup a) (lower t[1] false)] (? constkey ["nil"] ["init" (lookup i) (lower t[2] false)])
                 (lower (? (isform t "@") [(S "<@") (S a) ik [(S op) [t[0] (S a) ik] v]] [(S ".=") (S a) ik [(S op) [t[0] (S a) ik] v]]) false)]))
     (lerr (++ "invalid target for " n) x)))
(= (seq_ es) ["seq" ..es])

; ---- let / for / try
(= (lower_let x tail) b=x[1]
  (? (|| !(is "list" b) #b%2) (lerr "(let (name value ..) body..)" x))
  (push_scope) steps=[]
  (for k #b//2
    name=b[2*k] val=b[2*k+1]
    (? (ispat name) (push steps (destructure name (lower val false) leaf_let))
       (! (issym name)) (lerr "let: name must be a symbol or [pattern]" x)
       (islam val) (: v=(declare_block ($ name)) v.isfn=true v.set=true
                      (push steps ["init" v ["fn" (lower_fn ($ name) val[1] val[2..] v val)]]))
       (: e=(lower val false) v=(declare_block ($ name)) (push steps ["init" v e]))))
  r=(lowerseq x[2..] tail)
  (pop_scope)
  ["seq" ..steps r])

(= (bindvar v el)                       ; bind the loop variable (name or pattern) to IR element el
  (? (issym v) (? ($ v)!="_" (leaf_let ($ v) el) ["nil"])
     (destructure v el leaf_let)))
(= (lower_for x)
  x=(? (&& #x>=3 (is "num" x[1])) [x[0] (S "_") ..x[1..]] x)
  (? #x<3 (lerr "(for var coll body..)" x))
  v=x[1] c=x[2] body=x[3..]
  (? !(|| (issym v) (ispat v)) (lerr "for: variable must be a name or [pattern]" x))
  (push_scope)
  tk=(newtemp (++ "%k" (newid))) tn=(newtemp (++ "%n" (newid)))
  step=["set" tk ["prim" "+" [["ref" tk] ["num" 1]]]]
  isrange=(&& (isform c "..") 2<=#c<=3 (! (any isspread c[1..])))
  r=(? (|| isrange (&& (is "num" c) c>=0 c==(int c)))
       (: lo=(? (&& isrange #c==3) (lower c[1] false) ["num" 0])
          hi=(? isrange (lower c[#c-1] false) ["num" c])
          (push_scope)
          bind=(bindvar v ["ref" tk])
          bodyir=(lowerseq body false)
          (pop_scope)
          ["seq" ["init" tn ["prim" "num" [hi]]] ["init" tk ["prim" "num" [lo]]]
                 ["while" ["prim" "<" [["ref" tk] ["ref" tn]]] ["seq" bind bodyir step]]])
       (: tc=(newtemp (++ "%c" (newid))) tx=(newtemp (++ "%x" (newid))) tb=(newtemp (++ "%b" (newid)))
          coll=(lower c false)
          (push_scope)
          el=["if" ["ref" tb] ["ref" tk] ["call" (rtref "at") [["ref" tx] ["ref" tk]]]]
          bind=(bindvar v el)
          bodyir=(lowerseq body false)
          (pop_scope)
          ["seq" ["init" tc coll] ["init" tb ["call" (rtref "isnum") [["ref" tc]]]]
                 ["init" tx ["call" (rtref "iter") [["ref" tc]]]]
                 ["init" tn ["if" ["ref" tb] ["ref" tc] ["call" (rtref "len") [["ref" tx]]]]]
                 ["init" tk ["num" 0]]
                 ["while" ["prim" "<" [["ref" tk] ["ref" tn]]] ["seq" bind bodyir step]]]))
  (pop_scope)
  ["seq" r ["nil"]])

(= (lower_try x tail)
  (? #x!=3 (lerr "(try body handler)" x))
  body=(lower x[1] false) h=x[2]
  (push_scope)
  r=(? (&& (islam h) (is "list" h[1]) #h[1]<=1 (all issym h[1]))
       (: v=(? #h[1]==1 (declare_block ($ h[1][0])) (newtemp "%e"))
          ["try" body v (lowerseq h[2..] tail)])
     (: v=(newtemp "%e") ["try" body v ["call" (lower h false) [["ref" v]]]]))
  (pop_scope)
  r)

; ---- calls
(= (spread_args args) (lower_list [(S "%list") ..args]))
(= (lower_call x tail)
  h=x[0] args=x[1..]
  hasspread=(any isspread args)
  (? (issym h)
       (: name=($ h) v=(lookup name)
          (? v==nil (lerr (++ "undefined: " name) h))
          (? (&& v.kind=="local" v.fn.id!=L.cf.id) (capture L.cf v))
          (? (&& v.pre (has INLINE name) !hasspread) ["prim" name (~ a=>(lower a false) args)]
             (&& v.pre PREDS[name] #args==1 !hasspread) ["prim" PREDS[name] (~ a=>(lower a false) args)]
             (&& v.intrinsic) ["prim" name (~ a=>(lower a false) args)]
             (: (? (&& v.arity !hasspread (: [mn mx]=v.arity (|| #args<mn #args>mx)))
                   (lerr (++ name " takes " (arity_text v.arity) " argument" (? v.arity[1]==1 "" "s") ", got " #args) x))
                (finish_call ["ref" v] args hasspread tail))))
     (finish_call (lower h false) args hasspread tail)))
(= (arity_text a) (? a[0]==a[1] ($ a[0]) a[1]>=1e9 (++ a[0] "+") (++ a[0] "-" a[1])))
(= (finish_call f args hasspread tail)
  (? hasspread ["call" (rtref "apply") [f (spread_args args)]]
     [(? tail "tcall" "call") f (~ a=>(lower a false) args)]))

; ---- `use` / `embed` expansion (compile time), on the AST
(= (dirname f) i=(lastidx f "/") (? i<0 "." f[..i]))
(= (lastidx s c) r=-1 (for i #s (? s[i]==c r=i)) r)
(= (joinpath d f) (? (starts f "/") f (++ d "/" f)))
(= (expand x dir seen)
  (? !(is "list" x) x
     (&& #x>=2 (isform x "embed") (is "str" x[1])) (: f=(joinpath dir x[1]) (? !(ex f) (err (++ "embed: file not found: " x[1]))) (rd f))
     (&& #x>=2 (isform x "use") (is "str" x[1]))
       (: f=(joinpath dir x[1]) (? (&& !(ex f) (ex (++ f ".ak"))) f=(++ f ".ak"))
          (? !(ex f) (err (++ "use: file not found: " x[1])))
          (? seen[f] ["nil"]
             (: seen[f]=true
                forms=(parse (rd f) f)
                r=[(S ":") ..(~ y=>(expand y (dirname f) seen) forms)]
                (? POS[x] POS[r]=POS[x]) r)))
     (: r=(~ y=>(expand y dir seen) x) (? POS[x] POS[r]=POS[x]) r)))

; ---- whole program: prelude (runtime, in Ak) + user program
(= (lower_program prelude_forms user_forms file)
  L.file="rt/core.ak"
  main=(newfn "main" nil) main.ismod=true L.cf=main
  (push_scope) L.prelude=L.cs main.root=L.cs
  (for n INTRINSICS v=(mkvar n "intrinsic") v.intrinsic=true v.pre=true L.prelude.vars[n]=v)
  (predeclare (decls prelude_forms))
  (for [n v] L.prelude.vars v.pre=true)          ; operators inside the runtime itself are inlined too
  pre=(lowerseq prelude_forms false)
  L.file=file
  L.prelude.isprel=true
  (push_scope) main.root=L.cs
  (predeclare (decls user_forms))
  user=(lowerseq user_forms false)
  main.body=["seq" pre user]
  main)

; ---- IR pretty printer (debugging)
(= (irdump x)
  (? (is "list" x)
     (? (&& #x>0 (is "str" x[0]))
        (sw x[0]
          "ref" (++ "$" x[1].name (? x[1].kind=="global" (++ "@" x[1].gid) (++ "/" x[1].slot)))
          "set" (++ "(set " x[1].name " " (irdump x[2]) ")")
          "init" (++ "(init " x[1].name " " (irdump x[2]) ")")
          "fn" (++ "(fn#" x[1].id " " x[1].name ")")
          "num" ($ x[1])
          "str" (json x[1])
          "try" (++ "(try " (irdump x[1]) " " x[2].name " " (irdump x[3]) ")")
          (++ "(" x[0] (join (~ y=>(++ " " (irdump y)) x[1..]) "") ")"))
        (++ "[" (join (~ irdump x) " ") "]"))
     x==nil "nil"
     ($ x)))
