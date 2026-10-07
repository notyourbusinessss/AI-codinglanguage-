import http.server, threading, urllib.request, json
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        s.send_response(200); s.end_headers()
        s.wfile.write(json.dumps({"path": s.path, "n": 3}).encode())
    def log_message(s, *a): pass
srv = http.server.HTTPServer(("127.0.0.1", 0), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
body = json.loads(urllib.request.urlopen("http://127.0.0.1:%d/hi" % srv.server_port).read())
print("server said", body["path"], body["n"])
srv.shutdown()
