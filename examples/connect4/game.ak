; Connect Four: board, rules, the computer player (negamax with alpha-beta) and the HTML page. No server code here.
; Cells are numbered row*7+col with row 0 at the top. 0 = empty, 1 = you (red), 2 = the computer (yellow).
W=7 H=6
ORDER=[3 2 4 1 5 0 6]                                    ; centre columns first: better alpha-beta cutoffs
WIN=[]                                                   ; the 69 lines of four cells
(for r H (for c W (for [dr dc] [[0 1] [1 0] [1 1] [1 -1]]
  r2=r+3*dr c2=c+3*dc
  (? (&& 0<=r2<H 0<=c2<W) (push WIN (~ k=>(r+k*dr)*W+c+k*dc 0..4))))))
AT=(~ i=>[] 0..42)                                       ; the lines through each cell
(for w WIN (for i w (push AT[i] w)))
T=[0 1 4 20 0]
(= (drop b c p) r=H-1 (wh (&& r>=0 b[r*W+c]!=0) r-=1) (? r>=0 (: b[r*W+c]=p r*W+c) -1))
(= (won b i p) r=false (for w AT[i] (? (&& b[w[0]]==p b[w[1]]==p b[w[2]]==p b[w[3]]==p) r=w)) r)
(= (score b p)                                           ; static evaluation for p: open lines, plus a bonus for the centre column
  s=0 q=3-p
  (for w WIN m=0 o=0 (for i w (? b[i]==p m+=1 b[i]==q o+=1)) (? o==0 s+=T[m] m==0 s-=T[o]))
  (for r H (? b[r*W+3]==p s+=3 b[r*W+3]==q s-=3))
  s)
NODES=0
(= (nega b p d a bt last)                                ; value for p to move; last = the cell the opponent just played
  (<- NODES NODES+1) q=3-p
  (? (won b last q) -(1000+d) !(has b 0) 0 d==0 (score b p)
     (: v=-100000
        (for c ORDER (? (&& a<bt b[c]==0)
          (: i=(drop b c p) s=-(nega b q d-1 -bt -a i) b[i]=0 (? s>v v=s) (? v>a a=v))))
        v)))
(= (think b p d)                                         ; the best column for p, searching d plies
  (<- NODES 0) best=nil bv=-100000 a=-100000
  (for c ORDER (? b[c]==0
    (: i=(drop b c p)
       s=(? (won b i p) 100000 -(nega b 3-p d-1 -100000 -a i))
       b[i]=0
       (? (|| best==nil s>bv) (: best=c bv=s)) (? bv>a a=bv))))
  best)

B=nil LEVEL=5 LAST=-1 HL=[] OVER=false MSG="" STATS=""
(= (reset lvl) (<- B (rpt [0] 42)) (<- LEVEL lvl) (<- LAST -1) (<- HL []) (<- OVER false) (<- MSG "Your move: click a column.") (<- STATS ""))
(= (settle i p)                                          ; p just played cell i: did that end the game?
  w=(won B i p)
  (? w (: (<- HL w) (<- OVER true) (<- MSG (? p==1 "You win!" "The computer wins.")))
     !(has B 0) (: (<- OVER true) (<- MSG "A draw."))))
(= (play c)                                              ; you drop a disc in column c, the computer answers
  (? (&& !OVER c!=nil c==(int c) 0<=c<W B[c]==0)
     (: i=(drop B c 1) (<- LAST i) (settle i 1)
        (? !OVER
           (: t=(clock) col=(think B 2 LEVEL) j=(drop B col 2) (<- LAST j)
              (<- STATS (fmt "computer: column %d, %d positions in %d ms (looking %d moves ahead)" col+1 NODES (flr (- (clock) t)) LEVEL))
              (settle j 2)
              (? !OVER (<- MSG "Your move.")))))))

CSS=(embed "style.css")
(= (cell i) (++ "<i class='" (sw B[i] 1 "r" 2 "y" "e") (? (has HL i) " w" "") (? i==LAST " l" "") "'></i>"))
(= (column c)
  inner=(join (~ r=>(cell r*W+c) 0..H) "")
  (? (|| OVER B[c]!=0) (++ "<div class=col>" inner "</div>") (++ "<a class=col href='/move?c=" c "'>" inner "</a>")))
(= (levels) (join (~ [n d]=>(++ "<a href='/new?d=" d "'" (? d==LEVEL " class=on" "") ">" n "</a>") [["easy" 2] ["medium" 5] ["hard" 7]]) " "))
(= (page)
  (++ "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Connect Four</title><style>" CSS "</style>"
      "<main><h1>Connect Four</h1><p class=msg>" MSG "</p><div class=board>" (join (~ column 0..W) "") "</div><p class=stats>" STATS "</p>"
      "<p class=nav>new game: " (levels) "</p></main>"))
