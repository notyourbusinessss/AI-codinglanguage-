; examples/httpd.ak's server loop driven by clients in the same process (three connections multiplexed)
(= (route path)
  (? path=="/" [200 "text/plain" "hello from Ak"]
     (starts path "/echo/") [200 "text/plain" path[6..]]
     path=="/time" [200 "application/json" (json {:now (now)})]
     [404 "text/plain" "not found"]))
(= (respond c rq)
  path=(split (split rq "\r\n")[0] " ")[1]
  [code type body]=(route path)
  (fdw c (++ "HTTP/1.0 " code " " (? code==200 "OK" "Not Found") "\r\nContent-Type: " type "\r\nContent-Length: " #body "\r\n\r\n" body)))
(= (serve l n)                            ; handle n responses
  bufs={}
  (wh n>0
    fds=[l ..(~ num (keys bufs))]
    (for f (fdwait fds -1)
      (? f==l (set_buf bufs (tcpa l) "")
         (: d=(fdr f)
            (? d=="" (: (fdc f) bufs=(del bufs (tostr f)))
               (: bufs[(tostr f)]=(++ bufs[(tostr f)] d)
                  (? (has bufs[(tostr f)] "\r\n\r\n") (: (respond f bufs[(tostr f)]) (fdc f) bufs=(del bufs (tostr f)) n-=1)))))))))
(= (set_buf bufs c v) bufs[(tostr c)]=v)
l=(tcpl 0 "127.0.0.1") port=(tcpp l) cs=[]
(for pth ["/" "/echo/abc" "/nope"] c=(tcpc "127.0.0.1" port) (push cs c) (fdw c (++ "GET " pth " HTTP/1.0\r\n\r\n")))
(serve l 3)
(for c cs
  r="" more=true
  (wh more d=(fdr c) (? d=="" more=false r+=d))
  (p (split r "\r\n")[0] "|" (split r "\r\n\r\n")[1]) (fdc c))
