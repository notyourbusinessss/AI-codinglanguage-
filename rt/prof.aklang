; Sampling profiler: build with AK_TRACE=1, run with AK_PROF=1 -> function histogram on stderr at exit.
PROFH=0
(= (profstart)
  h=(scratch) m=(scratch)
  (<- PROFH h) (put64 268435520 h)
  act=m itv=m+256
  (put64 act ($label ".sigprof")) (put64 act+8 335544320) (put64 act+16 ($label ".sigret"))
  ($syscall 13 27 act 0 8)
  (put64 itv+8 1000) (put64 itv+24 1000)
  ($syscall 38 2 itv 0))
(= (profdump)
  ($syscall 38 2 (scratch) 0)
  rows=[] total=0
  (for id 65536 w=($peekw PROFH+8*id) c=($bitslo w)
    (? c>0 (: (push rows [c id]) total+=c)))
  (<- PROFH 0)
  names={} (for l (split ($tracenames) "\n") sp=(split l " ") (? #sp>=2 names[(num sp[0])]=(join sp[1..] " ")))
  rows=(rev (sort rows))
  (eout (++ "-- profile: " total " samples\n"))
  (for r rows[..40] (eout (++ (padl r[0] 7) " " (padl (fmtint ($ffloor (($fdiv ($fmul r[0] 1000) total)))) 5) "‰ " (?? names[r[1]] r[1]) "\n"))))
(? (env "AK_PROF") (profstart))
(chars_init)
