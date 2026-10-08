; Connect Four in your terminal, against the computer (native target; needs a terminal of at least 50x24).
;   ak examples/connect4.ak          left/right or 1-7: choose a column   enter / space / down: drop   n: new game   l: level   q: quit
(use "connect4/game.ak")
E=(chr 27)
RESET=(++ E "[0m")
(= (fg n) (++ E "[38;5;" n "m"))
(= (bg n) (++ E "[48;5;" n "m"))
BOARD=27 HOLE=16 RED=196 YEL=220 WHITE=231 GRAY=245 GREEN=82
BW=44 TW=48                                              ; width of the board (7 cells of 6 columns plus a border column each side) and of the centred text
CUR=3 SCORE=[0 0 0] NOTE="" FLASH=false BUSY=false
(= (spaces n) (rpt " " (max 0 n)))
(= (center s) (++ (spaces (// (- TW #s) 2)) s))
(= (lvlname) (sw LEVEL 2 "easy" 5 "medium" "hard"))
(= (cellfg i fly)                                        ; colour of board cell i; fly = [row col player] is a disc in mid-air
  (? (&& fly i==fly[0]*W+fly[1]) (? fly[2]==1 RED YEL)
     (&& FLASH (has HL i)) WHITE
     B[i]==1 RED B[i]==2 YEL
     HOLE))
(= (glyph h piece)                                       ; a round disc drawn with braille dots: half h (0 top, 1 bottom); holes are a little smaller than pieces
  (? piece (? h==0 " ⣴⣿⣿⣦ " " ⠻⣿⣿⠟ ") (? h==0 " ⣰⣾⣷⣆ " " ⠹⢿⡿⠏ ")))
(= (boardline r h fly)                                   ; half h (0 top, 1 bottom) of board row r
  (++ (spaces (// (- TW BW) 2)) (bg BOARD) " "
      (join (~ c=>(: i=r*W+c k=(cellfg i fly) (++ (fg k) (glyph h k!=HOLE))) 0..W) "")
      (bg BOARD) " " RESET))
(= (pad) (++ (spaces (// (- TW BW) 2)) (bg BOARD) (spaces BW) RESET))
(= (preview h)                                           ; the disc you are about to drop, above the chosen column
  (? (&& !OVER !BUSY) (++ (spaces (+ 3 (* 6 CUR))) (fg RED) (glyph h true) RESET) ""))
(= (notecolor) (? !OVER 252 MSG=="You win!" GREEN MSG=="A draw." GRAY 203))
(= (frame fly)
  sz=(?? (termsize) [24 80])
  lm=(spaces (// (- sz[1] TW) 2)) tm=(max 0 (// (- sz[0] 23) 2))
  lines=[(++ (fg WHITE) E "[1m" (center "C O N N E C T   F O U R") RESET)
         (++ (fg (notecolor)) (center NOTE) RESET)
         (preview 0) (preview 1) (pad)]
  (for r H (push lines (boardline r 0 fly)) (push lines (boardline r 1 fly)))
  (push lines (pad))
  (push lines (++ (fg 252) (center (fmt "you %d   computer %d   draws %d   level: %s" SCORE[0] SCORE[1] SCORE[2] (lvlname))) RESET))
  (push lines (++ (fg GRAY) (center (? AI[0] (fmt "computer played column %d: %d positions, %d ms" AI[0] AI[1] AI[2]) "")) RESET))
  (push lines (++ (fg GRAY) (center "left/right or 1-7: choose a column") RESET))
  (push lines (++ (fg GRAY) (center "enter: drop   n: new game   l: level   q: quit") RESET))
  (++ E "[H" (rpt (++ E "[K\r\n") tm) (join (~ l=>(++ lm l E "[K") lines) "\r\n") E "[J"))
(= (draw fly) (fdw 1 (frame fly)))
(= (flushkeys) (wh (!= (getkey 0) nil)))
(= (anim i who)                                          ; a disc falls into cell i
  (<- BUSY true) B[i]=0
  (for r 0..i//W+1 (draw [r i%W who]) (sleep 45))
  B[i]=who (<- BUSY false))
(= (finish)                                              ; the game is over: update the score, flash the winning line
  (<- NOTE (++ MSG "   (n: new game)"))
  (? MSG=="You win!" SCORE[0]+=1 MSG=="A draw." SCORE[2]+=1 SCORE[1]+=1)
  (for k 6 (<- FLASH !FLASH) (draw nil) (sleep 170))
  (<- FLASH false))
(= (turn)                                                ; you drop a disc in the chosen column, then the computer answers
  i=(human CUR)
  (? i==nil (<- NOTE "that column is full")
     (: (anim i 1)
        (? OVER (finish)
           (: (<- NOTE "the computer is thinking...") (<- BUSY true) (draw nil) (sleep 350)
              j=(computer) (<- BUSY false) (anim j 2)
              (? OVER (finish) (<- NOTE "your move"))))))
  (flushkeys))
(= (newgame lvl) (reset lvl) (<- AI [0 0 0]) (<- NOTE "your move"))
(= (loop)
  run=true
  (wh run
    (draw nil)
    k=(getkey nil)
    (? (has ["q" "esc" "ctrl-c" "ctrl-d" "eof"] k) run=false
       k=="n" (newgame LEVEL)
       k=="l" (newgame (? LEVEL==2 5 LEVEL==5 7 2))
       OVER nil
       k=="left" (<- CUR (max 0 CUR-1))
       k=="right" (<- CUR (min 6 CUR+1))
       (has ["1" "2" "3" "4" "5" "6" "7"] k) (<- CUR (num k)-1)
       (has ["enter" "down" " "] k) (turn)))
  nil)
(= (main)
  (? !(isatty) (: (ep "connect4 needs an interactive terminal") (exit 2)))
  sz=(termsize)
  (? (|| sz[0]<24 sz[1]<50) (: (ep (++ "terminal too small: connect4 needs 50x24, this one is " sz[1] "x" sz[0])) (exit 2)))
  (newgame 5)
  (rawmode (\ ()
    (fdw 1 (++ E "[?1049h" E "[?25l" E "[2J"))
    r=(try (loop) e=>e)
    (fdw 1 (++ E "[?25h" E "[?1049l" RESET))
    (? (is "str" r) (err r))))
  (p "thanks for playing"))
(main)
