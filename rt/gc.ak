; Native runtime: copying garbage collector (Cheney). Polled at function entry and loop heads (see gen_poll).
; Roots: the value stack below the collector's own frame and the global table. All heap objects have >= 16 bytes:
;   STR/BYTES: 8 + ((len+8)&-8)    SYM: 32 + ((len+7)&-8)    ARR: 8 + 8*max(len,1)    LIST: 32    MAP: 48    CLOSURE: 16+8*k    BOX: 16
; A forwarded object has type byte 255 and the new pointer in word 1.
GCMIN=67108864
GCSPACE=17179869184
GCFREE=0
GCCOUNT=0
GCOTHER=0
GCOBJ=0
GCTB=0
GCFB=0
GCFE=0
GCPHASE=0
GCSRC=0
GCADDR=0
(= (gcsize h t) n=($bitshi h)
  (? (|| t==1 t==8) (+ 8 ($band (+ n 8) -8))
     t==7 (+ 32 ($band (+ n 7) -8))
     t==3 (+ 8 (* 8 (? n>0 n 1)))
     t==2 32
     t==4 48
     t==5 (+ 16 (* 8 n))
     t==6 16
     (: (eout (strcat2 (strcat2 (strcat2 (strcat2 "gc: bad object type " (fmtint t)) " phase ") (fmtint GCPHASE)) (strcat2 (strcat2 " src-tb " (fmtint GCSRC-GCTB)) (strcat2 (strcat2 " addr-fb " (fmtint GCADDR-GCFB)) (strcat2 (strcat2 " fe-fb " (fmtint GCFE-GCFB)) (strcat2 (strcat2 " free-tb " (fmtint GCFREE-GCTB)) (strcat2 " obj " (show GCOBJ)))))))) ($syscall 231 99))))
(= (gcfwd v fb fe)
  (? ($isptr v)
     (: a=($ptraddr v)
        (? (|| a<fb a>=fe) v
           (: h=($peekw a) t=($band ($bitslo h) 255) (<- GCADDR a)
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
  tb=(? GCOTHER GCOTHER ($syscall 9 0 GCSPACE 3 16418 -1 0))
  (? tb<0 ($syscall 231 137))
  (<- GCFREE tb) (<- GCTB tb) (<- GCFB fb) (<- GCFE fe)
  (? GCVERIFY (gcwalk fb fe))
  a=($vbase) vt=($vtop)
  (<- GCPHASE 1)
  (wh a<vt (<- GCSRC a) w=($peekw a) (? ($isptr w) ($pokew a (gcfwd w fb fe))) a+=8)
  g=($gbase) ge=g+8*($nglob)
  (<- GCPHASE 2)
  (wh g<ge (<- GCSRC g) w=($peekw g) (? ($isptr w) ($pokew g (gcfwd w fb fe))) g+=8)
  sp=tb ps=0 pt=0 pn=0
  (<- GCPHASE 3)
  (wh sp<GCFREE (<- GCSRC sp)
    h=($peekw sp) t=($band ($bitslo h) 255)
    (? (&& (!= t 1) (!= t 2) (!= t 3) (!= t 4) (!= t 5) (!= t 6) (!= t 7) (!= t 8)) (: (eout (strcat2 (strcat2 (strcat2 (strcat2 "gc scan: bad type " (fmtint t)) " at +") (fmtint sp-tb)) (strcat2 (strcat2 " prev type " (fmtint pt)) (strcat2 " hdr " (fmtint pn))))) ($syscall 231 98)))
    ps=sp pt=t pn=($bitshi h)
    nw=(gcwords h t)
    (for i 1..nw+1 p=sp+8*i w=($peekw p) (<- GCOBJ (list t i nw)) (? ($isptr w) ($pokew p (gcfwd w fb fe))))
    sp+=(gcsize h t))
  live=GCFREE-tb
  (gcverify tb fb fe vt)
  (<- GCOTHER fb)
  (<- GCCOUNT GCCOUNT+1)
  ($gcset GCFREE tb tb+GCSPACE-1048576 GCFREE+(? live*2>GCMIN live*2 GCMIN))
  nil)
(= (gcinit) e=(env "AK_GCMIN") (? e (: (<- GCMIN (num e)) ($gclim GCMIN))))
(gcinit)

(= (gcbad p w fb fe)
  (? ($isptr w) (: a=($ptraddr w) (? (&& a>=fb a<fe) (: (eout (strcat2 (strcat2 "gc verify: dangling pointer at " (fmtint p-GCTB)) (strcat2 " -> " (fmtint a-fb)))) ($syscall 231 97))))))
(= (gcverify tb fb fe vt)
  (? GCVERIFY
     (: a=($vbase) (wh a<vt (gcbad a ($peekw a) fb fe) a+=8)
        g=($gbase) ge=g+8*($nglob) (wh g<ge (gcbad g ($peekw g) fb fe) g+=8)
        sp=tb
        (wh sp<GCFREE h=($peekw sp) t=($band ($bitslo h) 255) nw=(gcwords h t)
          (for i 1..nw+1 (gcbad sp+8*i ($peekw sp+8*i) fb fe))
          sp+=(gcsize h t)))))
GCVERIFY=false
(? (env "AK_GCVERIFY") (<- GCVERIFY true))

(= (gcwalk fb fe)
  sp=fb pt=0 ps=0
  (wh sp<fe
    h=($peekw sp) t=($band ($bitslo h) 255)
    (? (&& (!= t 1) (!= t 2) (!= t 3) (!= t 4) (!= t 5) (!= t 6) (!= t 7) (!= t 8))
       (: (eout (strcat2 (strcat2 (strcat2 "gc walk: bad header type " (fmtint t)) " at +") (fmtint sp-fb)))
          (eout (strcat2 (strcat2 (strcat2 " prev object type " (fmtint pt)) (strcat2 " at +" (fmtint ps-fb))) (strcat2 " hlen " (fmtint pl))))
          ($syscall 231 96)))
    pt=t ps=sp pl=($bitshi h)
    sp+=(gcsize h t)))
