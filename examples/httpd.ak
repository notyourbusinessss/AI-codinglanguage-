; A small HTTP/1.0 server (native only): `ak examples/httpd.ak [port]`. One process, many connections, multiplexed with fdwait.
(= (route path)
  (? path=="/" [200 "text/plain" "hello from Ak"]
     (starts path "/echo/") [200 "text/plain" path[6..]]
     path=="/time" [200 "application/json" (json {:now (now)})]
     [404 "text/plain" "not found"]))
(= (respond c rq)
  path=(split (split rq "\r\n")[0] " ")[1]
  [code type body]=(route path)
  (fdw c (++ "HTTP/1.0 " code " " (? code==200 "OK" "Not Found") "\r\nContent-Type: " type "\r\nContent-Length: " #body "\r\n\r\n" body)))
(= (serve l)                              ; handle connections forever (stop with ^C)
  bufs={}
  (wh true
    fds=[l ..(~ num (keys bufs))]
    (for f (fdwait fds -1)
      (? f==l (set_buf bufs (tcpa l) "")
         (: d=(fdr f)
            (? d=="" (: (fdc f) bufs=(del bufs (tostr f)))
               (: bufs[(tostr f)]=(++ bufs[(tostr f)] d)
                  (? (has bufs[(tostr f)] "\r\n\r\n") (: (respond f bufs[(tostr f)]) (fdc f) bufs=(del bufs (tostr f)))))))))))
(= (set_buf bufs c v) bufs[(tostr c)]=v)
port=(num (?? (fst (args)) 8080))
l=(tcpl port)
(p "listening on" (tcpp l))
(serve l)
