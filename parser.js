/* ============================================================
   수식 해석기 (문자열 → 구문 트리 → 계산 함수). eval 없이 직접 해석한다.
   브라우저에서는 window.MathParser, Node(테스트)에서는 module.exports 로 내보낸다.
   ============================================================ */
(function (root) {
'use strict';
const FUNCS = ['arcsin','arccos','arctan','asin','acos','atan','sinh','cosh','tanh','cbrt','sqrt','floor','ceil','sgn','abs','exp','sin','cos','tan','sec','csc','cot','log','ln']
  .sort((a, b) => b.length - a.length);
/** 슬라이더(매개변수)로 쓰는 글자. x, y, e(자연상수), π와 함수 이름은 제외 */
const PARAM_NAMES = 'abcdhkmnpqrt';
let PARS = null;
const mkErr = (m) => { const e = new Error(m); e.user = true; return e; };

function normalize(src) {
  return String(src)
    .replace(/[−–—]/g, '-').replace(/[×·∙]/g, '*').replace(/÷/g, '/').replace(/\*\*/g, '^')
    .replace(/[²³⁴]/g, (m) => '^' + ({ '²': '2', '³': '3', '⁴': '4' })[m])
    .replace(/[（［｛]/g, '(').replace(/[）］｝]/g, ')').replace(/＝/g, '=').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/＜/g, '<').replace(/＞/g, '>').replace(/ /g, ' ')
    .replace(/[{\[]/g, '(').replace(/[}\]]/g, ')');
}

function tokenize(src) {
  const toks = []; const n = src.length; let i = 0;
  while (i < n) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let j = i; while (j < n && /[0-9]/.test(src[j])) j++;
      if (src[j] === '.') { j++; while (j < n && /[0-9]/.test(src[j])) j++; }
      const s = src.slice(i, j);
      if (s === '.' || !isFinite(+s)) throw mkErr('숫자 형식이 올바르지 않아요');
      toks.push({ t: 'num', v: +s }); i = j; continue;
    }
    if (ch === 'π') { toks.push({ t: 'id', v: 'pi' }); i++; continue; }
    if (ch === '√') { toks.push({ t: 'fn', v: 'sqrt' }); i++; continue; }
    if ('+-*/^'.includes(ch)) { toks.push({ t: 'op', v: ch }); i++; continue; }
    if (ch === '(' || ch === ')') { toks.push({ t: ch }); i++; continue; }
    if (ch === '|') { toks.push({ t: 'bar' }); i++; continue; }
    if (/[a-zA-Z]/.test(ch)) {
      const rest = src.slice(i).toLowerCase();
      const f = FUNCS.find((name) => rest.startsWith(name));
      if (f) {
        const tok = { t: 'fn', v: f }; i += f.length;
        if (f === 'log') {
          let j = i; if (src[j] === '_') j++;
          const m = /^[0-9]+(\.[0-9]+)?/.exec(src.slice(j));
          if (m) { tok.base = +m[0]; i = j + m[0].length; }
        }
        toks.push(tok); continue;
      }
      if (rest.startsWith('pi')) { toks.push({ t: 'id', v: 'pi' }); i += 2; continue; }
      const c = rest[0];
      if (c === 'x' || c === 'y' || c === 'e') { toks.push({ t: 'id', v: c }); i++; continue; }
      if (PARAM_NAMES.includes(c)) { toks.push({ t: 'id', v: c, par: true }); i++; continue; }
      const word = /^[a-zA-Z]+/.exec(src.slice(i))[0];
      throw mkErr('알 수 없는 문자나 함수예요: ' + word);
    }
    throw mkErr('쓸 수 없는 문자예요: ' + ch);
  }
  return toks;
}

function parse(tokens) {
  let pos = 0, barDepth = 0; const vars = new Set(), pars = new Set();
  const peek = () => tokens[pos]; const next = () => tokens[pos++];
  const atomStart = (t) => t && (t.t === 'num' || t.t === 'id' || t.t === 'fn' || t.t === '(' || (t.t === 'bar' && barDepth === 0));
  const isOp = (t, ...ops) => t && t.t === 'op' && ops.includes(t.v);

  function expr() {
    let l = term();
    while (isOp(peek(), '+', '-')) { const op = next().v; l = { k: 'bin', op, l, r: term() }; }
    return l;
  }
  function term() {
    let l = unary();
    for (;;) {
      const t = peek();
      if (isOp(t, '*', '/')) { next(); l = { k: 'bin', op: t.v, l, r: unary() }; }
      else if (atomStart(t)) { l = { k: 'bin', op: '*', l, r: power() }; }
      else break;
    }
    return l;
  }
  function unary() {
    if (isOp(peek(), '-')) { next(); return { k: 'neg', e: unary() }; }
    if (isOp(peek(), '+')) { next(); return unary(); }
    return power();
  }
  function power() {
    const base = atom();
    if (isOp(peek(), '^')) { next(); return { k: 'bin', op: '^', l: base, r: exponent() }; }
    return base;
  }
  function exponent() {
    if (isOp(peek(), '-')) { next(); return { k: 'neg', e: exponent() }; }
    if (isOp(peek(), '+')) { next(); return exponent(); }
    return power();
  }
  function noParenArg() {
    const t = peek();
    if (!t) throw mkErr('함수 뒤에 값이 필요해요');
    if (isOp(t, '-')) { next(); return { k: 'neg', e: noParenArg() }; }
    if (t.t === 'num') {
      next(); let node = { k: 'num', v: t.v }; const n2 = peek();
      if (atomStart(n2) && n2.t !== 'num') node = { k: 'bin', op: '*', l: node, r: power() };
      return node;
    }
    if (t.t === 'id' || t.t === 'fn' || t.t === '(' || (t.t === 'bar' && barDepth === 0)) return power();
    throw mkErr('함수 뒤에 값이 필요해요');
  }
  function funcArg() {
    if (peek() && peek().t === '(') {
      next(); const e = expr();
      if (!peek() || peek().t !== ')') throw mkErr('괄호가 닫히지 않았어요');
      next(); return e;
    }
    return noParenArg();
  }
  function atom() {
    const t = next();
    if (!t) throw mkErr('식이 중간에 끝났어요');
    if (t.t === 'num') return { k: 'num', v: t.v };
    if (t.t === 'id') {
      if (t.v === 'pi') return { k: 'num', v: Math.PI };
      if (t.v === 'e') return { k: 'num', v: Math.E };
      if (t.par) { pars.add(t.v); if (PARS) PARS.add(t.v); return { k: 'par', v: t.v }; }
      vars.add(t.v); return { k: 'var', v: t.v };
    }
    if (t.t === '(') {
      const e = expr();
      if (!peek() || peek().t !== ')') throw mkErr('괄호가 닫히지 않았어요');
      next(); return e;
    }
    if (t.t === 'fn') {
      // sin^2(x) 형태: 거듭제곱이 먼저 오면 (sin x)^2 로 읽는다
      if (isOp(peek(), '^')) {
        next(); let sign = 1;
        if (isOp(peek(), '-')) { next(); sign = -1; }
        const nt = next();
        if (!nt || nt.t !== 'num') throw mkErr('sin^2(x)처럼 지수는 숫자로 써 주세요');
        const call = { k: 'call', f: t.v, base: t.base, a: funcArg() };
        return { k: 'bin', op: '^', l: call, r: { k: 'num', v: sign * nt.v } };
      }
      return { k: 'call', f: t.v, base: t.base, a: funcArg() };
    }
    if (t.t === 'bar') {
      if (barDepth > 0) throw mkErr('절댓값 기호 안에 절댓값이 또 있으면 abs( )를 써 주세요');
      barDepth++; const e = expr(); barDepth--;
      if (!peek() || peek().t !== 'bar') throw mkErr('절댓값 기호 |  |가 닫히지 않았어요');
      next(); return { k: 'call', f: 'abs', a: e };
    }
    if (t.t === ')') throw mkErr('닫는 괄호가 너무 많아요');
    if (t.t === 'op') throw mkErr(`'${t.v}' 앞뒤에 값이 필요해요`);
    throw mkErr('식을 해석할 수 없어요');
  }
  if (!tokens.length) throw mkErr('식이 비어 있어요');
  const ast = expr();
  if (pos < tokens.length) {
    const t = tokens[pos];
    throw mkErr(t.t === ')' ? '닫는 괄호가 너무 많아요' : '식의 끝에 해석할 수 없는 부분이 있어요');
  }
  return { ast, vars, pars };
}

/** 음수의 유리수 거듭제곱: 분모가 홀수이면 실수 근을 돌려준다 (예: (-8)^(1/3) = -2). */
function powReal(b, e) {
  if (b >= 0 || Number.isInteger(e) || !Number.isFinite(e) || !Number.isFinite(b)) return Math.pow(b, e);
  for (let q = 3; q <= 15; q += 2) {
    const p = e * q;
    if (Math.abs(p - Math.round(p)) < 1e-9) return (Math.round(p) % 2 === 0 ? 1 : -1) * Math.pow(-b, e);
  }
  return NaN;
}
function compileNode(n, deg, P) {
  const R = Math.PI / 180;
  switch (n.k) {
    case 'num': { const v = n.v; return () => v; }
    case 'par': { const nm = n.v; return () => (P ? (P[nm] ? P[nm].v : 1) : NaN); }
    case 'var': return n.v === 'x' ? (x) => x : (x, y) => y;
    case 'neg': { const a = compileNode(n.e, deg, P); return (x, y) => -a(x, y); }
    case 'bin': {
      const l = compileNode(n.l, deg, P), r = compileNode(n.r, deg, P);
      switch (n.op) {
        case '+': return (x, y) => l(x, y) + r(x, y);
        case '-': return (x, y) => l(x, y) - r(x, y);
        case '*': return (x, y) => l(x, y) * r(x, y);
        case '/': return (x, y) => l(x, y) / r(x, y);
        default: return (x, y) => powReal(l(x, y), r(x, y));
      }
    }
    case 'call': {
      const a = compileNode(n.a, deg, P);
      const D = deg ? R : 1, I = deg ? 1 / R : 1;
      let fn;
      switch (n.f) {
        case 'sin': fn = (v) => Math.sin(v * D); break;
        case 'cos': fn = (v) => Math.cos(v * D); break;
        case 'tan': fn = (v) => Math.tan(v * D); break;
        case 'sec': fn = (v) => 1 / Math.cos(v * D); break;
        case 'csc': fn = (v) => 1 / Math.sin(v * D); break;
        case 'cot': fn = (v) => 1 / Math.tan(v * D); break;
        case 'asin': case 'arcsin': fn = (v) => Math.asin(v) * I; break;
        case 'acos': case 'arccos': fn = (v) => Math.acos(v) * I; break;
        case 'atan': case 'arctan': fn = (v) => Math.atan(v) * I; break;
        case 'sinh': fn = Math.sinh; break;
        case 'cosh': fn = Math.cosh; break;
        case 'tanh': fn = Math.tanh; break;
        case 'exp': fn = Math.exp; break;
        case 'ln': fn = Math.log; break;
        case 'log':
          if (n.base) { const lb = Math.log(n.base); fn = (v) => Math.log(v) / lb; }
          else fn = Math.log10;
          break;
        case 'sqrt': fn = Math.sqrt; break;
        case 'cbrt': fn = Math.cbrt; break;
        case 'abs': fn = Math.abs; break;
        case 'floor': fn = Math.floor; break;
        case 'ceil': fn = Math.ceil; break;
        case 'sgn': fn = Math.sign; break;
        default: throw mkErr('알 수 없는 함수예요: ' + n.f);
      }
      return (x, y) => fn(a(x, y));
    }
  }
  throw mkErr('식을 해석할 수 없어요');
}

function fitQuadratic(F) {
  const f0 = F(0, 0), fp = F(1, 0), fm = F(-1, 0), gp = F(0, 1), gm = F(0, -1), h = F(1, 1);
  if (![f0, fp, fm, gp, gm, h].every(Number.isFinite)) return null;
  const A = (fp + fm) / 2 - f0, D = (fp - fm) / 2, C = (gp + gm) / 2 - f0, E = (gp - gm) / 2;
  const B = h - f0 - A - C - D - E;
  for (const [x, y] of [[2, 3], [-1.5, 2.2], [0.7, -2.1], [3.3, -1.4]]) {
    const pred = A * x * x + B * x * y + C * y * y + D * x + E * y + f0, v = F(x, y);
    if (!Number.isFinite(v) || Math.abs(pred - v) > 1e-7 * (1 + Math.abs(v))) return null;
  }
  return { A, B, C, D, E, F0: f0 };
}

function fmt(n) {
  if (Math.abs(n) < 1e-10) return '0';
  return String(+n.toFixed(4)).replace('-', '−');
}

/** 괄호 깊이 0에서 문자를 기준으로 나눈다. */
function splitTop(str, ch) {
  const out = []; let d = 0, st = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '(') d++; else if (c === ')') d--;
    else if (c === ch && d === 0) { out.push(str.slice(st, i)); st = i + 1; }
  }
  out.push(str.slice(st)); return out;
}
function constOf(str, deg, P) {
  const p = parse(tokenize(str));
  if (p.vars.size) throw mkErr('조건의 기준값에는 x, y를 쓸 수 없어요: ' + str.trim());
  const v = compileNode(p.ast, deg, P)(0, 0);
  if (!Number.isFinite(v)) throw mkErr('조건의 값을 계산할 수 없어요: ' + str.trim());
  return v;
}
/** 'x<1', '0<=x<3', '2>x' 같은 조건을 구간으로 바꾼다. */
function parseCond(str, deg, P) {
  const parts = str.split(/(<=|>=|<|>)/).map((t) => t.trim());
  const isX = (t) => /^x$/i.test(t);
  const iv = { lo: -Infinity, hi: Infinity, loInc: false, hiInc: false };
  const upper = (op) => op === '<' || op === '<=';
  const bad = () => mkErr("조건은 'x<1', 'x>=2', '0<=x<3' 꼴로 써 주세요: " + str.trim());
  if (parts.length === 3) {
    let [a, op, b] = parts, x, c;
    if (isX(a) && !isX(b)) { x = op; c = constOf(b, deg, P); }
    else if (isX(b) && !isX(a)) { x = op === '<' ? '>' : op === '<=' ? '>=' : op === '>' ? '<' : '<='; c = constOf(a, deg, P); }
    else throw bad();
    if (upper(x)) { iv.hi = c; iv.hiInc = x === '<='; } else { iv.lo = c; iv.loInc = x === '>='; }
  } else if (parts.length === 5) {
    const [a, o1, m, o2, b] = parts;
    if (!isX(m) || upper(o1) !== upper(o2)) throw bad();
    const c1 = constOf(a, deg, P), c2 = constOf(b, deg, P);
    if (upper(o1)) { iv.lo = c1; iv.loInc = o1 === '<='; iv.hi = c2; iv.hiInc = o2 === '<='; }
    else { iv.hi = c1; iv.hiInc = o1 === '>='; iv.lo = c2; iv.loInc = o2 === '>='; }
  } else throw bad();
  return iv;
}
const inIv = (iv, x) => (x > iv.lo || (iv.loInc && x === iv.lo)) && (x < iv.hi || (iv.hiInc && x === iv.hi));
/** 구간별 함수: y = 식 (조건); 식 (조건); ... */
function compilePiecewise(rhs, deg, P) {
  rhs = rhs.trim();
  if (rhs.startsWith('(') && rhs.endsWith(')')) {
    let d = 0, ok = true;
    for (let i = 0; i < rhs.length; i++) { if (rhs[i] === '(') d++; else if (rhs[i] === ')') { d--; if (d === 0 && i < rhs.length - 1) { ok = false; break; } } }
    if (ok) rhs = rhs.slice(1, -1);
  }
  const pieces = [];
  for (let raw of splitTop(rhs, ';')) {
    raw = raw.trim(); if (!raw) continue;
    let e = raw, cond = null;
    if (raw.endsWith(')')) {
      let d = 0, m = -1;
      for (let i = raw.length - 1; i >= 0; i--) { if (raw[i] === ')') d++; else if (raw[i] === '(') { d--; if (d === 0) { m = i; break; } } }
      if (m >= 0 && /[<>]/.test(raw.slice(m))) { cond = raw.slice(m + 1, -1); e = raw.slice(0, m); }
    }
    if (cond === null) {
      const cs = splitTop(raw, ',');
      if (cs.length > 1 && /[<>]/.test(cs[cs.length - 1])) { cond = cs.pop(); e = cs.join(','); }
    }
    if (!e.trim()) throw mkErr('각 구간에 식이 필요해요');
    const p = parse(tokenize(e));
    if (p.vars.has('y')) throw mkErr('구간별 함수의 식에는 y를 쓸 수 없어요');
    const f = compileNode(p.ast, deg, P);
    pieces.push(cond === null ? { f, other: true } : Object.assign({ f }, parseCond(cond, deg, P)));
  }
  if (!pieces.length) throw mkErr('구간별 함수에 식이 필요해요');
  if (pieces.filter((q) => q.other).length > 1) throw mkErr('조건이 없는 구간은 하나만 쓸 수 있어요');
  const cond = pieces.filter((q) => !q.other), other = pieces.find((q) => q.other);
  const ff = (x) => {
    for (const q of cond) if (inIv(q, x)) return q.f(x, 0);
    return other ? other.f(x, 0) : NaN;
  };
  const breaks = [];
  for (const q of cond) { if (Number.isFinite(q.lo)) breaks.push(q.lo); if (Number.isFinite(q.hi)) breaks.push(q.hi); }
  return { kind: 'explicit', f: ff, pieces: cond, breaks, info: `구간별 함수 · ${pieces.length}개 구간` };
}

/** 한 줄 입력을 그래프 정보로 바꾼다. 실패하면 { err } 를 돌려준다. */
function compileGraphInner(src, deg, P) {
  try {
    const s = normalize(src).trim();
    if (!s) return { kind: 'empty' };
    if (s.includes(';') || /[<>]/.test(s)) {
      const m = /^(y|[a-z]\s*\(\s*x\s*\))\s*=(?![=<>])(.*)$/i.exec(s);
      if (!m) throw mkErr("구간별 함수는 'y = 식 (조건); 식 (조건)' 꼴로 써 주세요");
      return compilePiecewise(m[2], deg, P);
    }
    let L, R;
    if (s.includes('=')) {
      const parts = s.split('=');
      if (parts.length !== 2) throw mkErr("'='는 하나만 쓸 수 있어요");
      L = parts[0].trim(); R = parts[1].trim();
    }
    const explicitOf = (rhs) => {
      const p = parse(tokenize(rhs));
      if (p.vars.has('y')) throw mkErr('y = f(x) 꼴에서는 오른쪽에 y를 쓸 수 없어요');
      const f = compileNode(p.ast, deg, P);
      return { kind: 'explicit', f: (x) => f(x, 0) };
    };
    const implicitOf = (l, r) => {
      if (!l) throw mkErr('= 왼쪽에 식이 필요해요');
      if (!r) r = '0';
      const pl = parse(tokenize(l)), pr = parse(tokenize(r));
      const Fl = compileNode(pl.ast, deg, P), Fr = compileNode(pr.ast, deg, P);
      const F = (x, y) => Fl(x, y) - Fr(x, y);
      const out = { kind: 'implicit', F };
      const q = fitQuadratic(F);
      if (q) out.quad = q;
      if (q && Math.abs(q.A) > 1e-12 && Math.abs(q.A - q.C) <= 1e-9 * Math.abs(q.A) && Math.abs(q.B) <= 1e-9 * Math.abs(q.A)) {
        const cx = -q.D / (2 * q.A), cy = -q.E / (2 * q.A);
        const r2 = cx * cx + cy * cy - q.F0 / q.A;
        out.circle = { cx, cy, r2, r: r2 > 1e-12 ? Math.sqrt(r2) : 0 };
        out.info = r2 > 1e-12
          ? `원 · 중심 (${fmt(cx)}, ${fmt(cy)}) · 반지름 ${fmt(out.circle.r)}`
          : (r2 > -1e-12 ? `한 점 (${fmt(cx)}, ${fmt(cy)})` : '이 식을 만족하는 실수 점이 없어요');
      }
      return out;
    };
    if (L !== undefined) {
      if (/^y$/i.test(L) || /^[a-z]\s*\(\s*x\s*\)$/i.test(L)) {
        if (!R) throw mkErr('= 오른쪽에 식이 필요해요');
        return explicitOf(R);
      }
      return implicitOf(L, R);
    }
    const p = parse(tokenize(s));
    if (p.vars.has('y')) return implicitOf(s, '0');
    return explicitOf(s);
  } catch (e) {
    if (e.user) return { kind: 'error', err: e.message };
    return { kind: 'error', err: '식을 해석할 수 없어요' };
  }
}

/** 한 줄 입력을 그래프 정보로 바꾼다. P는 슬라이더 값 { a: { v }, ... }. 결과의 pars에 쓰인 매개변수가 담긴다. */
function compileGraph(src, deg, P) {
  PARS = new Set();
  try {
    const r = compileGraphInner(src, deg, P || {});
    r.pars = [...PARS].sort();
    return r;
  } finally { PARS = null; }
}

const api = { FUNCS, PARAM_NAMES, mkErr, normalize, tokenize, parse, powReal, compileNode, fitQuadratic, fmt, splitTop, constOf, parseCond, inIv, compilePiecewise, compileGraph };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MathParser = api;
})(typeof self !== 'undefined' ? self : this);
