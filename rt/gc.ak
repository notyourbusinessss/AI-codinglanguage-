; Native runtime: copying garbage collector (Cheney). Polled at function entry and loop heads (see gen_poll).
; Roots: the value stack below the collector's own frame and the global table. All heap objects have >= 16 bytes:
;   STR/BYTES: 8 + ((len+8)&-8)    SYM: 32 + ((len+7)&-8)    ARR: 8 + 8*max(len,1)    LIST: 32    MAP: 48    CLOSURE: 16+8*k    BOX: 16
; A forwarded object has type byte 255 and the new pointer in word 1.
GCMIN=33554432
GCSPACE=17179869184
GCFREE=0
GCCOUNT=0
(= (gcsize h t) n=($bitshi h)
  (? (|| t==1 t==8) (+ 8 ($band (+ n 8) -8))
     t==7 (+ 32 ($band (+ n 7) -8))
     t==3 (+ 8 (* 8 (? n>0 n 1)))
     t==2 32
     t==4 48
     t==5 (+ 16 (* 8 n))
     t==6 16
     ($syscall 231 99)))
(= (gcfwd v fb fe)
  (? ($isptr v)
     (: a=($ptraddr v)
        (? (|| a<fb a>=fe) v
           (: h=($peekw a) t=($band ($bitslo h) 255)
              (? t==255 ($peekw a+8)
                 (: n=(gcsize h t) f=GCFREE
                    ($rawcopy f a n)
                    nv=($mkptr f)
                    ($pokew a ($frombits 0 255)) ($pokew a+8 nv)
                    (<- GCFREE f+n)
                    nv)))))
     v))
(= (gcwords h t) n=($bitshi h)
  (? t==3 (? n>0 n 1) t==2 3 t==4 5 t==5 n+1 t==6 1 0))
(= (gc)
  fb=($heapbase) fe=($hptr)
  tb=($syscall 9 0 GCSPACE 3 16418 -1 0)
  (? tb<0 ($syscall 231 137))
  (<- GCFREE tb)
  a=($vbase) vt=($vtop)
  (wh a<vt w=($peekw a) (? ($isptr w) ($pokew a (gcfwd w fb fe))) a+=8)
  g=268435520 ge=g+8*($nglob)
  (wh g<ge w=($peekw g) (? ($isptr w) ($pokew g (gcfwd w fb fe))) g+=8)
  sp=tb
  (wh sp<GCFREE
    h=($peekw sp) t=($band ($bitslo h) 255)
    nw=(gcwords h t)
    (for i 1..nw+1 p=sp+8*i w=($peekw p) (? ($isptr w) ($pokew p (gcfwd w fb fe))))
    sp+=(gcsize h t))
  live=GCFREE-tb
  ($syscall 11 fb GCSPACE)
  (<- GCCOUNT GCCOUNT+1)
  ($gcset GCFREE tb tb+GCSPACE-1048576 GCFREE+(? live>GCMIN live GCMIN))
  nil)
(= (gcinit) e=(env "AK_GCMIN") (? e (: (<- GCMIN (num e)) ($gclim GCMIN))))
(gcinit)
