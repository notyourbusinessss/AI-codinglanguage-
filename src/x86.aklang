; x86-64 assembler + ELF writer, in Ak. API: (R n) (X n) (I v) (M base disp) (MX base idx scale disp) (MA addr) operands,
; (ins "mnemonic" a b c), labels/fixups, and a text front end (asm "mov rax, [rbx+rcx*8+16]") used by the tests.
A={:code [] :labels {} :fix [] :base 0 :ext {}}
CODE_BASE=0x401000
DATA_BASE=0x10000000
GLOB_BASE=0x30000000
(= (asm_reset) A.code=[] A.labels={} A.fix=[] A.base=0 A.ext={})
(= (here) A.base+#A.code)         ; absolute offset: the code of a prebuilt image (A.base bytes) comes first
(= (emit b) (push A.code b&255))
(= (emit32 v) (for i 4 (emit v>>(8*i))))
(= (emit64 lo hi) (emit32 lo) (emit32 hi))
(= (emit_all bs) (for b bs (emit b)))

REG64=["rax" "rcx" "rdx" "rbx" "rsp" "rbp" "rsi" "rdi" "r8" "r9" "r10" "r11" "r12" "r13" "r14" "r15"]
REG8=["al" "cl" "dl" "bl" "spl" "bpl" "sil" "dil" "r8b" "r9b" "r10b" "r11b" "r12b" "r13b" "r14b" "r15b"]
ALU={"add" 0 "or" 1 "adc" 2 "sbb" 3 "and" 4 "sub" 5 "xor" 6 "cmp" 7}
SHIFT={"shl" 4 "shr" 5 "sar" 7}
UN={"not" [0xF7 2] "neg" [0xF7 3] "mul" [0xF7 4] "div" [0xF7 6] "idiv" [0xF7 7] "inc" [0xFF 0] "dec" [0xFF 1]}
CC={"o" 0 "no" 1 "b" 2 "c" 2 "nae" 2 "ae" 3 "nb" 3 "nc" 3 "e" 4 "z" 4 "ne" 5 "nz" 5 "be" 6 "na" 6 "a" 7 "nbe" 7 "s" 8 "ns" 9 "p" 10 "pe" 10 "np" 11 "po" 11 "l" 12 "nge" 12 "ge" 13 "nl" 13 "le" 14 "ng" 14 "g" 15 "nle" 15}
SSE_RR={"addsd" [0xF2 0x58] "mulsd" [0xF2 0x59] "subsd" [0xF2 0x5C] "minsd" [0xF2 0x5D] "divsd" [0xF2 0x5E] "maxsd" [0xF2 0x5F] "sqrtsd" [0xF2 0x51]
        "cvtss2sd" [0xF3 0x5A] "cvtsd2ss" [0xF2 0x5A] "ucomisd" [0x66 0x2E] "xorpd" [0x66 0x57] "andpd" [0x66 0x54] "andnpd" [0x66 0x55] "orpd" [0x66 0x56]}
SCALE={1 0 2 1 4 2 8 3}
NOARG={"ret" [0xC3] "syscall" [0x0F 0x05] "cqo" [0x48 0x99] "nop" [0x90] "int3" [0xCC] "ud2" [0x0F 0x0B] "leave" [0xC9] "cld" [0xFC] "hlt" [0xF4]
       "rep_movsb" [0xF3 0xA4] "rep_stosb" [0xF3 0xAA] "rep_movsq" [0xF3 0x48 0xA5] "rep_stosq" [0xF3 0x48 0xAB] "rep_cmpsb" [0xF3 0xA6]}

; ---- operands: ["r" n] 64-bit reg, ["r8" n] byte reg, ["x" n] xmm, ["i" v] imm, ["m" base idx scale disp size] mem, ["l" name] label
(= (R n) ["r" n])
(= (R8 n) ["r8" n])
(= (X n) ["x" n])
(= (I v) ["i" v])
(= (LB name) ["l" name])
(= (M base disp=0 size=8) ["m" base -1 1 disp size])
(= (MX base idx scale disp=0 size=8) ["m" base idx scale disp size])
(= (MA addr size=8) ["m" -1 -1 1 addr size])
(= (isr o) o[0]=="r")
(= (isr8 o) o[0]=="r8")
(= (isx o) o[0]=="x")
(= (isi o) o[0]=="i")
(= (ism o) o[0]=="m")
(= (isl o) o[0]=="l")
(= (fits8 v) -128<=v<=127)
(= (fits32 v) -2147483648<=v<=2147483647)

; ---- ModRM / SIB / displacement
(= (modrm reg rm)
  (? (|| (isr rm) (isr8 rm) (isx rm)) (emit 0xC0|reg<<3|rm[1]&7)
     (: [_ base idx sc disp size]=rm
        ss=SCALE[sc]
        (? base<0
             (: (emit reg<<3|4) (emit ss<<6|(? idx<0 4 idx&7)<<3|5) (emit32 disp))
           (: sib=(|| idx>=0 base&7==4)
              md=(? (&& disp==0 base&7!=5) 0 (fits8 disp) 1 2)
              (emit md<<6|reg<<3|(? sib 4 base&7))
              (? sib (emit ss<<6|(? idx<0 4 idx&7)<<3|base&7))
              (? md==1 (emit disp) md==2 (emit32 disp)))))))

; prefix, REX, opcode bytes, ModRM. reg: register number / opcode extension; rm: operand
(= (enc pfx w opc reg rm force=false)
  b=(? (ism rm) (? rm[1]>=0 (rm[1]>>3)&1 0) (rm[1]>>3)&1)
  x=(? (&& (ism rm) rm[2]>=0) (rm[2]>>3)&1 0)
  rex=(? w 8 0)|((reg>>3)&1)<<2|x<<1|b
  (? pfx (emit pfx))
  (? (|| rex!=0 force) (emit 0x40|rex))
  (emit_all opc)
  (modrm reg&7 rm))
(= (needrex8 o) (&& (isr8 o) 4<=o[1]<=7))

(= (movri r v)
  (? (fits32 v) (: (enc 0 true [0xC7] 0 (R r)) (emit32 v))
     (: (emit 0x48|(r>>3)) (emit 0xB8+(r&7)) (emit64 v%4294967296 (v//4294967296)&0xFFFFFFFF))))
; mov r64, imm64 given as two 32-bit halves (used for NaN-boxed constants)
(= (mov_imm64 r hi lo) (emit 0x48|(r>>3)) (emit 0xB8+(r&7)) (emit64 lo hi))

(= (alu n a b)
  (? (isi b) (: v=b[1]
              (? (&& (ism a) a[5]==1) (: (enc 0 false [0x80] n a) (emit v&255))
                 (&& (ism a) a[5]==4) (? (fits8 v) (: (enc 0 false [0x83] n a) (emit v&255)) (: (enc 0 false [0x81] n a) (emit32 v)))
                 (&& (isr a) a[1]==0 !(fits8 v)) (: (emit 0x48) (emit 0x05+8*n) (emit32 v))
                 (fits8 v) (: (enc 0 true [0x83] n a) (emit v))
                 (: (enc 0 true [0x81] n a) (emit32 v))))
     (ism b) (enc 0 true [0x03+8*n] a[1] b)
     (enc 0 true [0x01+8*n] b[1] a)))

(= (mov a b)
  (? (isi b) (? (isr a) (movri a[1] b[1]) (: (enc 0 true [0xC7] 0 a) (emit32 b[1])))
     (ism b) (enc 0 true [0x8B] a[1] b)
     (&& (ism a) (isr8 b)) (enc 0 false [0x88] b[1] a (needrex8 b))
     (&& (ism a) a[5]==4) (enc 0 false [0x89] b[1] a)
     (enc 0 true [0x89] b[1] a)))

(= (ins mn a=nil b=nil c=nil)
  (? (has NOARG mn) (emit_all NOARG[mn])
     (has ALU mn) (alu ALU[mn] a b)
     mn=="mov" (mov a b)
     mn=="lea" (enc 0 true [0x8D] a[1] b)
     mn=="test" (? (isi b) (? (&& (isr a) a[1]==0) (: (emit 0x48) (emit 0xA9) (emit32 b[1])) (: (enc 0 true [0xF7] 0 a) (emit32 b[1])))
                   (enc 0 true [0x85] b[1] a))
     mn=="imul" (? c!=nil (? (fits8 c[1]) (: (enc 0 true [0x6B] a[1] b) (emit c[1])) (: (enc 0 true [0x69] a[1] b) (emit32 c[1])))
                    (enc 0 true [0x0F 0xAF] a[1] b))
     (has UN mn) (enc 0 true [UN[mn][0]] UN[mn][1] a)
     (has SHIFT mn) (? (isi b) (? b[1]==1 (enc 0 true [0xD1] SHIFT[mn] a) (: (enc 0 true [0xC1] SHIFT[mn] a) (emit b[1])))
                       (enc 0 true [0xD3] SHIFT[mn] a))
     mn=="push" (? (isr a) (: (? a[1]>=8 (emit 0x41)) (emit 0x50+(a[1]&7)))
                   (isi a) (? (fits8 a[1]) (: (emit 0x6A) (emit a[1])) (: (emit 0x68) (emit32 a[1])))
                   (enc 0 false [0xFF] 6 a))
     mn=="pop" (? (isr a) (: (? a[1]>=8 (emit 0x41)) (emit 0x58+(a[1]&7))) (enc 0 false [0x8F] 0 a))
     mn=="call" (? (isl a) (call_l a[1]) (enc 0 false [0xFF] 2 a))
     mn=="jmp" (? (isl a) (jmp_l a[1]) (enc 0 false [0xFF] 4 a))
     mn=="movzx" (enc 0 true [0x0F (? (&& (ism b) b[5]==2) 0xB7 0xB6)] a[1] b (needrex8 b))
     mn=="movq" (? (isx a) (? (ism b) (enc 0xF3 false [0x0F 0x7E] a[1] b) (enc 0x66 true [0x0F 0x6E] a[1] b))
                   (? (ism a) (enc 0x66 false [0x0F 0xD6] b[1] a) (enc 0x66 true [0x0F 0x7E] b[1] a)))
     mn=="movsd" (? (isx a) (enc 0xF2 false [0x0F 0x10] a[1] b) (enc 0xF2 false [0x0F 0x11] b[1] a))
     mn=="movss" (? (isx a) (enc 0xF3 false [0x0F 0x10] a[1] b) (enc 0xF3 false [0x0F 0x11] b[1] a))
     (has SSE_RR mn) (enc SSE_RR[mn][0] false [0x0F SSE_RR[mn][1]] a[1] b)
     mn=="cvtsi2sd" (enc 0xF2 true [0x0F 0x2A] a[1] b)
     mn=="cvttsd2si" (enc 0xF2 true [0x0F 0x2C] a[1] b)
     mn=="roundsd" (: (enc 0x66 false [0x0F 0x3A 0x0B] a[1] b) (emit c[1]))
     (&& (starts mn "set") (has CC mn[3..])) (enc 0 false [0x0F 0x90+CC[mn[3..]]] 0 a (needrex8 a))
     (&& (starts mn "cmov") (has CC mn[4..])) (enc 0 true [0x0F 0x40+CC[mn[4..]]] a[1] b)
     (&& (starts mn "j") (has CC mn[1..]) (isl a)) (jcc_l CC[mn[1..]] a[1])
     (err "unknown instruction" mn)))

; ---- labels and fixups
(= (label name) A.labels[name]=(here))
(= (fixup kind name) (push A.fix [(here) kind name]) (emit32 0))
(= (jmp_l name) (emit 0xE9) (fixup "rel32" name))
(= (call_l name) (emit 0xE8) (fixup "rel32" name))
(= (jcc_l cc name) (emit 0x0F) (emit 0x80+cc) (fixup "rel32" name))
(= (lea_l r name) (enc 0 true [0xC7] 0 (R r)) (fixup "abs32" name))      ; mov r64, <address of code label>
(= (patch pos v) (for i 4 A.code[pos-A.base+i]=(v>>(8*i))&255))
(= (link)
  (for [pos kind name] A.fix
    t=(?? A.labels[name] A.ext[name])
    (? t==nil (err "undefined label" name))
    (? kind=="rel32" (patch pos t-(pos+4)) (patch pos CODE_BASE+t))))

; ---- ELF64 static executable: code segment (R+X) and data segment (R+W, plus bss)
(= (le v n) r=[] (for _ n (push r v%256) v=v//256) r)
(= (elf_bytes code data gsize entry)     ; code, data: lists of bytes or u8 arrays; gsize: bytes of zero-initialised globals at GLOB_BASE
  codeoff=0x1000
  dataoff=((codeoff+#code+0xFFF)//0x1000)*0x1000
  nph=(? gsize>0 3 2)
  hdr=[0x7F 0x45 0x4C 0x46 2 1 1 0 0 0 0 0 0 0 0 0
       ..(le 2 2) ..(le 0x3E 2) ..(le 1 4) ..(le CODE_BASE+entry 8) ..(le 64 8) ..(le 0 8) ..(le 0 4) ..(le 64 2) ..(le 56 2) ..(le nph 2) ..(le 64 2) ..(le 0 2) ..(le 0 2)]
  ph1=[..(le 1 4) ..(le 5 4) ..(le codeoff 8) ..(le CODE_BASE 8) ..(le CODE_BASE 8) ..(le #code 8) ..(le #code 8) ..(le 0x1000 8)]
  ph2=[..(le 1 4) ..(le 6 4) ..(le dataoff 8) ..(le DATA_BASE 8) ..(le DATA_BASE 8) ..(le #data 8) ..(le #data 8) ..(le 0x1000 8)]
  ph3=(? gsize>0 [..(le 1 4) ..(le 6 4) ..(le 0 8) ..(le GLOB_BASE 8) ..(le GLOB_BASE 8) ..(le 0 8) ..(le gsize 8) ..(le 0x1000 8)] [])
  head=[..hdr ..ph1 ..ph2 ..ph3]
  (bcat head (u8 codeoff-#head) code (u8 dataoff-codeoff-#code) data))

; ---- text front end (Intel syntax), for tests and debugging
(= (regno name) (idx REG64 name))
(= (parse_num s) neg=(starts s "-") t=(? neg s[1..] s)
  v=(? (starts t "0x") (: r=0 (for c t[2..] r=r*16+(idx "0123456789abcdef" (lo c))) r) (num t))
  (? neg -v v))
(= (parse_mem s size)
  inner=s[1..#s-1] base=-1 idx=-1 sc=1 disp=0
  (for t (split (rep inner "-" "+-") "+")
    t=(trim t)
    (? t=="" nil
       (has t "*") (: [r k]=(split t "*") idx=(regno (trim r)) sc=(num (trim k)))
       (regno t)>=0 (? base<0 base=(regno t) idx=(regno t))
       disp=(parse_num t)))
  (MX base idx sc disp size))
(= (parse_op s)
  s=(trim s) size=8
  (for [pre sz] [["qword ptr " 8] ["dword ptr " 4] ["xmmword ptr " 16] ["word ptr " 2] ["byte ptr " 1]] (? (starts s pre) (: size=sz s=(trim s[#pre..]))))
  (? (starts s "[") (parse_mem s size)
     (regno s)>=0 (R (regno s))
     (idx REG8 s)>=0 (R8 (idx REG8 s))
     (&& (starts s "xmm") (num s[3..])!=nil) (X (num s[3..]))
     (starts s ".") (LB s)
     (I (parse_num s))))
ASMC={}
ASMP={}
(= (asm_parse line)
  line=(trim line)
  (? (starts line "rep ") ["rep" (++ "rep_" (trim line[4..]))]
     (starts line "repe ") ["rep" (++ "rep_" (trim line[5..]))]
     (: sp=(idx line " ")
        mn=(? sp<0 line line[..sp])
        rest=(? sp<0 "" (trim line[sp..]))
        (? mn=="movabs" (: [rn vt]=(~ trim (split rest ","))
                           (? (starts vt "0x") (: h=(padl vt[2..] 16 "0") ["mov_imm64" (regno rn) (parse_num (++ "0x" h[..8])) (parse_num (++ "0x" h[8..]))])
                              (: v=(num vt) ["mov_imm64" (regno rn) ((v//4294967296)&0xFFFFFFFF) (v%4294967296)])))
           (: ops=(? rest=="" [] (~ parse_op (split rest ",")))
              ["ins" mn ops[0] ops[1] ops[2]])))))
(= (asm_exec p)
  (sw p[0]
    "rep" (ins p[1])
    "mov_imm64" (mov_imm64 p[1] p[2] p[3])
    (ins p[1] p[2] p[3] p[4])))
(= (asm line)             ; text -> machine code; parse results and label-free encodings are memoized
  b=ASMC[line]
  (? b (emit_all b)
     (: p=ASMP[line]
        (? p==nil (: p=(asm_parse line) ASMP[line]=p))
        n0=#A.code f0=#A.fix
        (asm_exec p)
        (? (== #A.fix f0) ASMC[line]=A.code[n0..]))))
