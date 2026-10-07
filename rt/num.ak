; Native runtime part: exact number <-> text conversion (needs bignums: JS-identical output for every double).
;   bignum = list of base-2^24 limbs, little endian, no trailing zero limbs ([] is zero)
BNB=16777216
(= (bn_norm a) n=#a (wh (&& n>0 (== (lget a n-1) 0)) (pop a) n-=1) a)
(= (bn_small k) r=(mklist 4) (wh k>0 q=($ffloor ($fdiv k BNB)) (lpush r ($fsub k ($fmul q BNB))) k=q) r)
(= (bn_mul_small a k)          ; k <= 2^24
  r=(mklist #a+2) c=0
  (for i #a t=($fadd ($fmul (lget a i) k) c) q=($ffloor ($fdiv t BNB)) (lpush r ($fsub t ($fmul q BNB))) c=q)
  (wh c>0 q=($ffloor ($fdiv c BNB)) (lpush r ($fsub c ($fmul q BNB))) c=q)
  (bn_norm r))
(= (bn_add a b) n=(? #a>#b #a #b) r=(mklist n+1) c=0
  (for i n t=($fadd ($fadd (? i<#a (lget a i) 0) (? i<#b (lget b i) 0)) c)
    (? t>=BNB (: (lpush r ($fsub t BNB)) c=1) (: (lpush r t) c=0)))
  (? c>0 (lpush r c)) r)
(= (bn_sub a b)                ; a >= b
  r=(mklist #a) c=0
  (for i #a t=($fsub ($fsub (lget a i) (? i<#b (lget b i) 0)) c)
    (? t<0 (: (lpush r ($fadd t BNB)) c=1) (: (lpush r t) c=0)))
  (bn_norm r))
(= (bn_cmp a b)
  (? #a!=#b (? #a<#b -1 1)
     (: i=#a-1 r=0 (wh (&& r==0 i>=0) (? (< (lget a i) (lget b i)) r=-1 (> (lget a i) (lget b i)) r=1) i-=1) r)))
(= (bn_shl a n)
  (? #a==0 a
     (: limbs=($ffloor ($fdiv n 24)) bits=n-limbs*24
        r=(bn_mul_small a (** 2 bits))
        (? limbs>0 (: z=(mklist limbs+#r) (for i limbs (lpush z 0)) (for x r (lpush z x)) z) r))))
(= (bn_divmod_small a k)       ; -> [quotient remainder], k <= 2^24
  q=(mklist #a) (for i #a (lpush q 0)) rem=0 i=#a-1
  (wh i>=0 t=($fadd ($fmul rem BNB) (lget a i)) d=($ffloor ($fdiv t k)) (lset q i d) rem=($fsub t ($fmul d k)) i-=1)
  (list (bn_norm q) rem))
(= (bn_shr a n)                ; floor(a / 2^n)
  limbs=($ffloor ($fdiv n 24)) bits=n-limbs*24
  (? limbs>=#a [] (: b=(slice a limbs nil) (? bits>0 (lget (bn_divmod_small b (** 2 bits)) 0) b))))
(= (bn_pow10 k) r=[1] (wh k>=7 r=(bn_mul_small r 10000000) k-=7) (bn_mul_small r (** 10 k)))
(= (bn_pow2 k) (bn_shl [1] k))
(= (bn_tostr a)
  (? #a==0 "0"
     (: parts=(mklist 8) x=a
        (wh #x>0 qr=(bn_divmod_small x 10000000) (lpush parts (fmtint qr[1])) x=qr[0])
        n=#parts out=(lget parts n-1)
        (for i 1..n out=(strcat2 out (padl (lget parts n-1-i) 7 "0"))) out)))

; ---- IEEE-754 decomposition: positive finite x = mz * 2^ez
(= (decomp x) hi=($bitshi x) lo=($bitslo x) be=($band ($ushr hi 20) 2047) frac=($fadd ($fmul ($band hi 1048575) 4294967296) lo)
  (? be==0 (list frac -1074) (list ($fadd frac 4503599627370496) be-1075)))
(= (mkdouble mz ez)            ; mz * 2^ez for 0 <= mz <= 2^53, exactly representable (or overflowing to Infinity)
  (? mz>=9007199254740992 (: mz=($fdiv mz 2) ez+=1))
  (? mz==0 0
     (? mz<4503599627370496 (? ez!=-1074 ($throw "mkdouble: unnormalized") ($frombits ($ffloor ($fdiv mz 4294967296)) ($fsub mz ($fmul ($ffloor ($fdiv mz 4294967296)) 4294967296))))
        (: be=ez+1075 f=($fsub mz 4503599627370496) fh=($ffloor ($fdiv f 4294967296)) fl=($fsub f ($fmul fh 4294967296))
           (? be>=2047 ($fdiv 1 0) ($frombits ($fadd ($fmul be 1048576) fh) fl))))))
(= (nextup z) m=(decomp z) (mkdouble ($fadd m[0] 1) m[1]))
(= (nextdown z) m=(decomp z) mz=m[0] ez=m[1]
  (? (&& mz==4503599627370496 ez>-1074) (mkdouble 9007199254740991 ez-1) (mkdouble ($fsub mz 1) ez)))
(= (floorlog2 x) ($fsub ($band ($ushr ($bitshi x) 20) 2047) 1023))   ; x >= 1 normal double

; ---- shortest digits that round-trip (Burger & Dybvig free-format): positive finite x -> [digit string, n], x = 0.DIGITS * 10^n
(= (shortest x)
  m=(decomp x) mz=m[0] ez=m[1] even=(== ($band mz 1) 0) two52=4503599627370496
  r=nil s=nil mp=nil mm=nil
  (? ez>=0
     (? (!= mz two52)
        (: r=(bn_shl (bn_small mz) ez+1) s=(bn_small 2) mp=(bn_shl [1] ez) mm=mp)
        (: r=(bn_shl (bn_small mz) ez+2) s=(bn_small 4) mp=(bn_shl [1] ez+1) mm=(bn_shl [1] ez)))
     (? (|| ez==-1074 (!= mz two52))
        (: r=(bn_small ($fmul mz 2)) s=(bn_shl [1] 1-ez) mp=[1] mm=[1])
        (: r=(bn_small ($fmul mz 4)) s=(bn_shl [1] 2-ez) mp=[2] mm=[1])))
  lg=ez+(floorlog2 mz)
  k=($fceil ($fsub ($fmul lg 0.30102999566398114) 1e-10))
  (? k>=0 s=(bn_mul_big s (bn_pow10 k))
     (: sc=(bn_pow10 (- k)) r=(bn_mul_big r sc) mp=(bn_mul_big mp sc) mm=(bn_mul_big mm sc)))
  (? (? even (>= (bn_cmp (bn_add r mp) s) 0) (> (bn_cmp (bn_add r mp) s) 0))
     k+=1
     (: r=(bn_mul_small r 10) mp=(bn_mul_small mp 10) mm=(bn_mul_small mm 10)))
  out=(mklist 20) done=false
  (wh (! done)
    d=0 (wh (>= (bn_cmp r s) 0) r=(bn_sub r s) d+=1)
    tc1=(? even (<= (bn_cmp r mm) 0) (< (bn_cmp r mm) 0))
    tc2=(? even (>= (bn_cmp (bn_add r mp) s) 0) (> (bn_cmp (bn_add r mp) s) 0))
    (? (! tc1) (? (! tc2) (: (lpush out d) r=(bn_mul_small r 10) mp=(bn_mul_small mp 10) mm=(bn_mul_small mm 10))
                          (: (lpush out d+1) done=true))
       (! tc2) (: (lpush out d) done=true)
       (: cc=(bn_cmp (bn_shl r 1) s) (lpush out (? cc<0 d cc>0 d+1 (== ($band d 1) 0) d d+1)) done=true)))
  ds=(strnew #out) (for i #out ($stb ds i 48+(lget out i)))
  (list ds k))
(= (bn_mul_big a b)            ; schoolbook; limbs < 2^24 so partial products < 2^48 and sums stay exact
  (? (|| #a==0 #b==0) []
     (: n=#a+#b r=(mklist n) (for i n (lpush r 0))
        (for i #a x=(lget a i)
          (? x>0 (: c=0 j=0
                    (wh (|| j<#b c>0)
                      t=($fadd ($fadd (lget r i+j) c) (? j<#b ($fmul x (lget b j)) 0))
                      q=($ffloor ($fdiv t BNB)) (lset r i+j ($fsub t ($fmul q BNB))) c=q j+=1))))
        (bn_norm r))))

; ---- exact decimal -> double. dg: significant digits (string, no leading zeros), e10: x = 0.dg... no: x = dg * 10^e10
(= (strtod dg e10)
  nd=#dg
  (? nd==0 0
     (: m=0 (for i (? nd<17 nd 17) m=($fadd ($fmul m 10) (- ($ldb dg i) 48)))
        e=(? nd>17 e10+nd-17 e10)
        (? (&& nd<=15 e>=-22 e<=22) (scale10 m e)
           (: z=(scale10 m e)
              (? (|| (== z 0) (> z 1.7976931348623157e308))
                 (? (> z 1.7976931348623157e308) z (refine 4.9406564584124654e-324 (bigfromdigits dg) e10))
                 (refine z (bigfromdigits dg) e10)))))))
(= (bigfromdigits dg) r=[] n=#dg i=0
  (wh i<n j=(? i+7<n i+7 n) chunk=0
    (for k i..j chunk=($fadd ($fmul chunk 10) (- ($ldb dg k) 48)))
    r=(bn_add (bn_mul_small r (** 10 (- j i))) (bn_small chunk)) i=j)
  r)
(= (refine z M E)              ; correct z (an estimate within a few ulps) to the double nearest M * 10^E
  tries=0 done=false
  (wh (&& (! done) tries<80)
    tries+=1
    d=(decomp z) mz=d[0] ez=d[1]
    c=(? 2-ez>0 2-ez 0) a=(? E<0 (- E) 0)
    xs=(bn_shl (bn_mul_big M (bn_pow10 (? E>0 E 0))) c)
    p10=(bn_pow10 a)
    up=(bn_shl (bn_mul_big (bn_add (bn_mul_small (bn_small mz) 2) [1]) p10) ez-1+c)
    lowp=(? (&& mz==4503599627370496 ez>-1074) (bn_shl (bn_mul_big (bn_sub (bn_mul_small (bn_small mz) 4) [1]) p10) ez-2+c) (bn_shl (bn_mul_big (bn_sub (bn_mul_small (bn_small mz) 2) [1]) p10) ez-1+c))
    cu=(bn_cmp xs up)
    (? (> cu 0) z=(nextup z)
       (&& (== cu 0) (== ($band mz 1) 1)) z=(nextup z)
       (: cl=(bn_cmp xs lowp)
          (? (< cl 0) z=(nextdown z)
             (&& (== cl 0) (== ($band mz 1) 1)) z=(nextdown z)
             done=true))))
  z)

(= (tofixed x prec)
  neg=x<0 ax=(abs x)
  (? ax>=1e21 (fmtnum x)
     (: d=(? ax==0 (list 0 -1074) (decomp ax)) mz=d[0] ez=d[1]
        n0=(bn_mul_big (bn_small mz) (bn_pow10 prec))
        nn=(? ez>=0 (bn_shl n0 ez) (bn_shr (bn_add n0 (bn_pow2 -ez-1)) (- ez)))
        ds=(bn_tostr nn)
        (? (<= #ds prec) ds=(strcat2 (rpt "0" prec+1-#ds) ds))
        r=(? prec==0 ds (strcat2 (strcat2 (strslice ds 0 #ds-prec) ".") (strslice ds #ds-prec #ds)))
        (? neg (strcat2 "-" r) r))))
