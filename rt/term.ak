; Native runtime part 7: terminal control (Linux ioctl/poll): raw keyboard input and the screen size. Native target only.
(= (tcget fd buf) ($syscall 16 fd 21505 ($addr buf)))          ; TCGETS
(= (tcset fd buf) ($syscall 16 fd 21506 ($addr buf)))          ; TCSETS
(= (isatty) buf=($newb 1 64 64) (== (tcget 0 buf) 0))
(= (termsize)                                ; [rows cols] of the terminal, or nil when stdout is not one
  buf=($newb 1 16 16)
  (? (< ($syscall 16 1 21523 ($addr buf)) 0) nil     ; TIOCGWINSZ
     [(+ ($ldb buf 0) (* 256 ($ldb buf 1))) (+ ($ldb buf 2) (* 256 ($ldb buf 3)))]))
(= (rawmode f)                              ; run f() with the terminal in raw mode (no echo or line buffering; Ctrl-C arrives as a key); always restored
  old=($newb 1 64 64)
  (? (< (tcget 0 old) 0) (f)
     (: raw=($newb 1 64 64) ($copy raw 0 old 0 64)
        ($stb raw 1 ($band ($ldb raw 1) 250))                   ; iflag: no ICRNL, no IXON
        ($stb raw 12 ($band ($ldb raw 12) 244))                 ; lflag: no ISIG, ICANON, ECHO
        ($stb raw 13 ($band ($ldb raw 13) 127))                 ;        no IEXTEN
        ($stb raw 22 0) ($stb raw 23 1)                         ; VTIME 0, VMIN 1
        (tcset 0 raw)
        r=(try (f) e=>(: (tcset 0 old) ($throw e)))
        (tcset 0 old) r)))
KBUF=""
(= (keyname)                                ; decode and consume one key from KBUF
  n=#KBUF b=($ldb KBUF 0)
  (? b==27
     (? n==1 (: (<- KBUF "") "esc")
        (: c=($ldb KBUF 1)
           (? (|| c==91 c==79)
              (: i=2 (wh (&& i<n (< ($ldb KBUF i) 64)) i+=1)
                 f=(? i<n ($ldb KBUF i) 0)
                 (<- KBUF (strslice KBUF (? i<n i+1 n) n))
                 (sw f 65 "up" 66 "down" 67 "right" 68 "left" 72 "home" 70 "end" "other"))
              (: (<- KBUF (strslice KBUF 1 n)) "esc"))))
     (: len=(? b>=240 4 b>=224 3 b>=192 2 1)
        len=(? len>n n len)
        s=(strslice KBUF 0 len) (<- KBUF (strslice KBUF len n))
        (? b==13 "enter" b==10 "enter" b==127 "backspace" b==8 "backspace" b==9 "tab" b==3 "ctrl-c" b==4 "ctrl-d"
           b<32 (strcat2 "ctrl-" (chr1 b+96))
           s))))
(= (getkey ms=nil)                          ; next key: "up" "down" "left" "right" "enter" "esc" "tab" "backspace" "ctrl-c" "eof" or the typed character; nil if ms milliseconds pass without input
  (? #KBUF>0 (keyname)
     (? #(fdwait [0] ms)==0 nil
        (: d=(fdr 0 64) (? d=="" "eof" (: (<- KBUF d) (keyname)))))))
