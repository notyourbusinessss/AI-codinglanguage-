; ak: the Ak compiler, written in Ak. Compiles Ak source to a native x86-64 Linux executable (no libc, no linker).
;   ak file.ak [args]      compile and run        ak build file.ak out   write an executable
;   ak -e 'code'           run a snippet           ak check file.ak       parse + resolve only
(use "parse.ak")
(use "lower.ak")
(use "gen.ak")
(use "fmt.ak")
PRELUDE=(++ (embed "../rt/core.ak") "\n" (embed "../rt/data.ak") "\n" (embed "../rt/map.ak") "\n" (embed "../rt/num.ak") "\n" (embed "../rt/show.ak") "\n" (embed "../rt/io.ak") "\n" (embed "../rt/math.ak") "\n" (embed "../rt/regex.ak") "\n" (embed "../rt/big.ak") "\n" (embed "../rt/json.ak") "\n" (embed "../rt/typed.ak") "\n" (embed "../rt/gc.ak") "\n" (embed "../rt/prof.ak"))
VERSION="0.5.0"

; ---- tree shaking: keep only the runtime functions the program can reach (by name)
ROOTS=["at" "dot" "put" "setdot" "dotc" "setdotc" "slice" "apply" "concat" "isnum" "iter" "len" "list" "map" "sym" "toarr" "fatal" "finish" "gc" "chars_init" "bigfrom"
       "add2" "sub2" "mul2" "div2" "lt2" "gt2" "le2" "ge2" "eq2" "ne2" "mod2" "fdiv2" "pow2" "band2" "bor2" "bxor2" "shl2" "shr2" "ushr2" "neg1" "bnot1"]
(= (collect x out) (? (is "sym" x) out[($ x)]=true (is "list" x) (for y x (collect y out))))
(= (fdef x)
  (? (&& (is "list" x) #x>=3 (is "sym" x[0]) (== ($ x[0]) "=") (is "list" x[1]) #x[1]>0 (is "sym" x[1][0]) (! (starts ($ x[1][0]) "%")))
     ($ x[1][0])))
(= (shake pre user)
  need={} (for r ROOTS need[r]=true) (for u user (collect u need))
  defs=[] (for f pre n=(fdef f) (? n (push defs [n f]) (collect f need)))
  incl={} changed=true
  (wh changed changed=false
    (for [n f] defs (? (&& need[n] (! incl[n])) (: incl[n]=true (collect f need) changed=true))))
  (~? f=>(|| (! (fdef f)) incl[(fdef f)]) pre))

(= (tm what) (? (env "AK_TIME") (ep what (clock))))
(= (front src file)           ; source text -> main IR
  (tm "start")
  pre=(parse PRELUDE "rt/core.ak")
  (tm "parsed prelude")
  user=(~ y=>(expand y (dirname file) {}) (parse src file))
  (tm "parsed user")
  pre=(shake pre user)
  main=(lower_program pre user file)
  (tm "lowered")
  main)
(= (compile_src src file) bytes=(gen_program (front src file)) (tm "generated") bytes)

(= (usage) (ep "usage: ak file.ak [args] | ak build file.ak out | ak -e 'code' | ak check file.ak | ak --version") (exit 2))
(= (cli) a=(args)
  (? #a==0 (usage)
     (sw a[0]
       ["-v" "--version" "version"] (p (++ "ak " VERSION))
       "-e" (? #a<2 (usage) (runx (compile_src a[1] "<-e>") a[2..]))
       ["build" "exe"] (? #a!=3 (usage) (wrx a[2] (compile_src (rd a[1]) a[1])))
       "check" (? #a!=2 (usage) (: (front (rd a[1]) a[1]) (p "ok")))
       "fmt" (? #a!=2 (usage) (pr (fmtforms (parse (rd a[1]) a[1]))))
       "run" (? #a<2 (usage) (runx (compile_src (rd a[1]) a[1]) a[2..]))
       "compile" (? #a!=3 (usage) (wrx a[2] (compile_src (rd a[1]) a[1])))
       (runx (compile_src (rd a[0]) a[0]) a[1..]))))
(? (env "AK_DEBUG") (cli) (try (cli) e=>(: (ep (++ "error: " e)) (exit 1))))
