import os, pty, sys, time, select, struct, fcntl, termios
# Runs a command in a pseudo-terminal and drives it like a user. usage: tty_run.py ROWS COLS 'command' 'step;step;...'
#   steps: wait:TEXT (until it appears in the output) | text:STRING | send:HEXBYTES | sleep:SECONDS
# Everything the program wrote (raw bytes, escape sequences included) goes to stdout.
def run(cmd, rows, cols, steps, timeout=20):
    pid, fd = pty.fork()
    if pid == 0:
        os.execvp('/bin/sh', ['/bin/sh', '-c', cmd])
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
    buf = b''; t0 = time.time(); status = None
    def pump(dur):
        nonlocal buf, status
        end = time.time() + dur
        while time.time() < end:
            r, _, _ = select.select([fd], [], [], 0.05)
            if r:
                try: d = os.read(fd, 65536)
                except OSError: return False
                if not d: return False
                buf += d
        return True
    for st in steps:
        k, _, v = st.partition(':')
        if k == 'sleep': pump(float(v))
        elif k == 'send': os.write(fd, bytes.fromhex(v)); pump(0.15)
        elif k == 'text': os.write(fd, v.encode()); pump(0.15)
        elif k == 'wait':
            while v.encode() not in buf and time.time() - t0 < timeout:
                if not pump(0.1): break
    pump(0.3)
    try:
        _, st = os.waitpid(pid, os.WNOHANG)
    except ChildProcessError: st = 0
    if pid and st == 0:
        try: os.kill(pid, 9)
        except ProcessLookupError: pass
    return buf, st
if __name__ == '__main__':
    rows, cols, cmd = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
    steps = sys.argv[4].split(';') if len(sys.argv) > 4 and sys.argv[4] else []
    buf, st = run(cmd, rows, cols, steps)
    sys.stdout.buffer.write(buf)
