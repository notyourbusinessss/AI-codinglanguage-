#!/usr/bin/env python3
"""Ak: a compact prefix language designed for LLM authorship. See SPEC.md."""
import sys, re, json, functools

sys.setrecursionlimit(100000)

class Kw(str):
    """Keyword :name, self-evaluating, usable as map key."""
    def __repr__(s): return ':' + str.__str__(s)

class Sym(str): pass
class AkError(Exception): pass

class Fn:
    __slots__ = ('ps', 'rest', 'body', 'env', 'name')
    def __init__(s, ps, rest, body, env, name='\\'):
        s.ps, s.rest, s.body, s.env, s.name = ps, rest, body, env, name

class Env(dict):
    __slots__ = ('up',)
    def __init__(s, up=None): s.up = up
    def find(s, k):
        e = s
        while e is not None:
            if k in e: return e
            e = e.up
        raise AkError('undefined: ' + k)

TOK = re.compile(r'''\s+|;[^\n]*|("(?:\\.|[^"\\])*")|([()\[\]{}])|([^\s()\[\]{}";]+)''')

def parse(src):
    toks = []
    for m in TOK.finditer(src):
        if m.group(1) is not None: toks.append(('s', json.loads(m.group(1))))
        elif m.group(2): toks.append(('p', m.group(2)))
        elif m.group(3): toks.append(('a', m.group(3)))
    pos = 0
    def atom(t):
        if t[0] == 's': return t[1]
        a = t[1]
        if a == 'T': return True
        if a == 'F': return False
        if a == '_': return None
        if a[0] == ':' and len(a) > 1: return Kw(a[1:])
        try: return int(a)
        except ValueError: pass
        try: return float(a)
        except ValueError: return Sym(a)
    def rd():
        nonlocal pos
        if pos >= len(toks): raise AkError('unexpected EOF')
        t = toks[pos]; pos += 1
        if t[0] != 'p': return atom(t)
        c = t[1]
        if c in ')]}': raise AkError('unexpected ' + c)
        close = {'(': ')', '[': ']', '{': '}'}[c]
        xs = []
        while True:
            if pos >= len(toks): raise AkError('missing ' + close)
            if toks[pos] == ('p', close): pos += 1; break
            xs.append(rd())
        if c == '[': return [Sym('list')] + xs
        if c == '{': return [Sym('map')] + xs
        return xs
    out = []
    while pos < len(toks): out.append(rd())
    return out

def truthy(x): return x is not False and x is not None

def ev(x, env):
    while True:
        if isinstance(x, Sym):
            return env.find(x)[x]
        if not isinstance(x, list): return x
        if not x: return None
        h = x[0]
        if isinstance(h, Sym):
            if h == '?':   # (? c a c b ... [else])
                i, n = 1, len(x)
                while i + 1 < n:
                    if truthy(ev(x[i], env)): x = x[i + 1]; break
                    i += 2
                else:
                    if i < n: x = x[i]
                    else: return None
                continue
            if h == ':':
                for s in x[1:-1]: ev(s, env)
                if len(x) == 1: return None
                x = x[-1]; continue
            if h == '=':
                t = x[1]
                if isinstance(t, list):  # (= (f a b) body...)
                    ps, rest = params(t[1:])
                    body = [Sym(':')] + x[2:]
                    env[t[0]] = Fn(ps, rest, body, env, t[0])
                    return env[t[0]]
                v = ev(x[2], env)
                if isinstance(v, Fn) and v.name == '\\': v.name = t
                env[t] = v
                return v
            if h == '<-':
                v = ev(x[2], env); env.find(x[1])[x[1]] = v; return v
            if h == '\\':
                ps, rest = params(x[1])
                return Fn(ps, rest, [Sym(':')] + x[2:], env)
            if h == '&':
                v = True
                for s in x[1:]:
                    v = ev(s, env)
                    if not truthy(v): return v
                return v
            if h == '|':
                v = False
                for s in x[1:]:
                    v = ev(s, env)
                    if truthy(v): return v
                return v
            if h == 'wh':  # (wh cond body...)
                while truthy(ev(x[1], env)):
                    for s in x[2:]: ev(s, env)
                return None
            if h == 'for':  # (for (i coll) body...)
                v, c = x[1]
                for it in list(ev(c, env)):
                    e = Env(env); e[v] = it
                    for s in x[2:]: ev(s, e)
                return None
            if h == 'try':  # (try body handler-fn)
                try: return ev(x[1], env)
                except AkError as e: f = ev(x[2], env); return call(f, [str(e)])
                except (ZeroDivisionError, IndexError, KeyError, TypeError, ValueError) as e:
                    f = ev(x[2], env); return call(f, [type(e).__name__ + ': ' + str(e)])
            if h == 'let':  # (let (a 1 b 2) body...)  sequential
                e = Env(env); b = x[1]
                for i in range(0, len(b), 2): e[b[i]] = ev(b[i + 1], e)
                for s in x[2:-1]: ev(s, e)
                env, x = e, x[-1]; continue
            if h == 'q': return x[1]
        f = ev(h, env)
        args = [ev(a, env) for a in x[1:]]
        if isinstance(f, Fn):
            env = bind(f, args); x = f.body; continue  # TCO
        return call(f, args)

def params(ps):
    rest = None
    if len(ps) >= 2 and ps[-2] == '..': rest = ps[-1]; ps = ps[:-2]
    return list(ps), rest

def bind(f, args):
    e = Env(f.env)
    n = len(f.ps)
    if len(args) < n or (f.rest is None and len(args) > n):
        raise AkError(f'{f.name}: expected {n}{"+" if f.rest else ""} args, got {len(args)}')
    for p, a in zip(f.ps, args): e[p] = a
    if f.rest is not None: e[f.rest] = args[n:]
    return e

def call(f, args):
    if isinstance(f, Fn): return ev(f.body, bind(f, args))
    if callable(f): return f(*args)
    if isinstance(f, (list, dict, str)): return at(f, *args)
    raise AkError('not callable: ' + show(f))

def at(c, i, j=None, *more):
    if more or (j is not None and not isinstance(c, (list, str))): raise AkError('@: bad args')
    if isinstance(c, dict): return c.get(i)
    if j is not None: return c[i:j]
    if not isinstance(i, int): raise AkError('@: index must be int')
    if -len(c) <= i < len(c): return c[i]
    return None

def show(x):
    if x is True: return 'T'
    if x is False: return 'F'
    if x is None: return '_'
    if isinstance(x, Kw): return ':' + str.__str__(x)
    if isinstance(x, str): return json.dumps(x)
    if isinstance(x, list): return '[' + ' '.join(map(show, x)) + ']'
    if isinstance(x, dict): return '{' + ' '.join(show(k) + ' ' + show(v) for k, v in x.items()) + '}'
    if isinstance(x, Fn): return f'<fn {x.name}>'
    if isinstance(x, float) and x == int(x) and abs(x) < 1e15: return str(float(x))
    return str(x)

def tostr(x): return x if isinstance(x, str) and not isinstance(x, Kw) else show(x)

def eq(a, b):
    if isinstance(a, bool) != isinstance(b, bool): return False
    return a == b

def arith(op, ident):
    def f(*a):
        if not a: return ident
        if len(a) == 1 and op in (_sub,): return -a[0]
        return functools.reduce(op, a)
    return f
_sub = lambda a, b: a - b
def div(a, b):
    if b == 0: raise AkError('division by zero')
    if isinstance(a, int) and isinstance(b, int): return a // b if a % b == 0 else a / b
    return a / b
def chain(op):
    return lambda *a: all(op(a[i], a[i + 1]) for i in range(len(a) - 1))
def cat(*a):
    if a and isinstance(a[0], list): return [y for x in a for y in x]
    return ''.join(tostr(x) for x in a)
def p(*a): print(' '.join(tostr(x) for x in a)); return a[-1] if a else None
def err(*a): raise AkError(' '.join(tostr(x) for x in a))
def rng(a, b=None, s=1):
    if b is None: a, b = 0, a
    return list(range(a, b, s))
def sort(a, b=None):
    if b is None: return sorted(a)
    return sorted(b, key=lambda v: call(a, [v]))
def red(f, a, b=None):
    if b is None: a, b = None, a; return functools.reduce(lambda x, y: call(f, [x, y]), b)
    return functools.reduce(lambda x, y: call(f, [x, y]), b, a)
def mapf(f, *ls): return [call(f, list(t)) for t in zip(*ls)]
def setf(c, k, v):
    if isinstance(c, dict): d = dict(c); d[k] = v; return d
    l = list(c); l[k] = v; return l
def mut(c, k, v): c[k] = v; return v
def push(l, *x): return l + list(x)
def mapc(*a): return {a[i]: a[i + 1] for i in range(0, len(a), 2)}
def num(s):
    try: return int(s)
    except ValueError:
        try: return float(s)
        except ValueError: return None
def keysf(m): return list(m.keys())
def valsf(m): return list(m.values())
def pairs(m): return [[k, v] for k, v in m.items()]
def rdf(path): return open(path).read()
def wrf(path, s): open(path, 'w').write(s); return s
def indexof(c, x):
    try: return c.index(x)
    except ValueError: return -1
def has(c, x): return x in c
def length(c): return len(c)
def zipf(*ls): return [list(t) for t in zip(*ls)]
def uniq(l):
    out = []
    for x in l:
        if x not in out: out.append(x)
    return out
def flat(l): return [y for x in l for y in (x if isinstance(x, list) else [x])]
def slice_(c, a, b=None): return c[a:b]
def isnum(x): return isinstance(x, (int, float)) and not isinstance(x, bool)
def tyf(x):
    if x is None: return Kw('nil')
    if isinstance(x, bool): return Kw('bool')
    if isnum(x): return Kw('num')
    if isinstance(x, Kw): return Kw('kw')
    if isinstance(x, str): return Kw('str')
    if isinstance(x, list): return Kw('list')
    if isinstance(x, dict): return Kw('map')
    return Kw('fn')

def globals_():
    g = Env()
    g.update({
        '+': arith(lambda a, b: a + b, 0), '-': arith(_sub, 0),
        '*': arith(lambda a, b: a * b, 1), '/': lambda a, *r: functools.reduce(div, r, a),
        '%': lambda a, b: a % b, '**': lambda a, b: a ** b,
        '<': chain(lambda a, b: a < b), '>': chain(lambda a, b: a > b),
        '<=': chain(lambda a, b: a <= b), '>=': chain(lambda a, b: a >= b),
        '==': lambda a, b: eq(a, b), '!=': lambda a, b: not eq(a, b),
        '!': lambda a: not truthy(a),
        '++': cat, 'p': p, 'err': err, '$': tostr, 'show': show,
        'list': lambda *a: list(a), 'map': mapc, '@': at, '#': length,
        '+>': push, 'set': setf, '<@': mut, '..': rng,
        '~': mapf, '~?': lambda f, l: [x for x in l if truthy(call(f, [x]))],
        '~/': red, 'sort': sort, 'rev': lambda l: l[::-1] if not isinstance(l, str) else l[::-1],
        'zip': zipf, 'uniq': uniq, 'flat': flat, 'idx': indexof, 'has': has,
        'keys': keysf, 'vals': valsf, 'prs': pairs, 'sub': slice_,
        'split': lambda s, d=None: s.split(d), 'join': lambda l, d='': d.join(map(tostr, l)),
        'num': num, 'ty': tyf, 'up': lambda s: s.upper(), 'lo': lambda s: s.lower(),
        'trim': lambda s: s.strip(), 'rep': lambda s, a, b: s.replace(a, b),
        'min': lambda *a: min(a[0]) if len(a) == 1 else min(a),
        'max': lambda *a: max(a[0]) if len(a) == 1 else max(a),
        'sum': lambda l: sum(l), 'abs': abs, 'int': lambda x: int(x),
        'sqrt': lambda x: x ** .5, 'any': lambda f, l: any(truthy(call(f, [x])) for x in l),
        'all': lambda f, l: all(truthy(call(f, [x])) for x in l),
        'rd': rdf, 'wr': wrf, 'in': lambda: sys.stdin.readline().rstrip('\n'),
        'args': lambda: ARGV, 'ap': lambda f, l: call(f, l),
        'json': lambda x: json.dumps(x), 'unjson': lambda s: json.loads(s),
        'is': lambda t, x: tyf(x) == t,
    })
    g['use'] = lambda path: run(open(path).read(), g)
    return g

ARGV = []

def run(src, env):
    r = None
    for form in parse(src): r = ev(form, env)
    return r

def repl(env):
    while True:
        try: line = input('ak> ')
        except EOFError: break
        try: print(show(run(line, env)))
        except Exception as e: print('error:', e)

def main(argv):
    global ARGV
    env = globals_()
    if len(argv) < 2: return repl(env)
    ARGV = argv[2:]
    try: run(open(argv[1]).read(), env)
    except AkError as e: print('error:', e, file=sys.stderr); return 1

if __name__ == '__main__': sys.exit(main(sys.argv))
