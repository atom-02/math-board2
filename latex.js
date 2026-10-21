/* ============================================================
   MathLive가 만든 LaTeX → 이 앱의 식 문자열 (예: \frac{x^2}{9} → ((x^2)/(9)))
   브라우저에서는 window.LatexBridge, Node(테스트)에서는 module.exports 로 내보낸다.
   ============================================================ */
(function (root) {
'use strict';

const err = (m) => { const e = new Error(m); e.user = true; return e; };

const FN = ['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'ln', 'log', 'exp'];
const SYMBOL = {
  pi: 'pi', exponentialE: 'e', cdot: '*', times: '*', ast: '*', div: '/',
  le: '<=', leq: '<=', leqslant: '<=', ge: '>=', geq: '>=', geqslant: '>=', lt: '<', gt: '>',
};
const IGNORE = new Set([',', ';', ':', '!', ' ', 'quad', 'qquad', 'displaystyle', 'textstyle', 'bigl', 'bigr', 'Bigl', 'Bigr']);
const RESERVED = /(arcsin|arccos|arctan|asin|acos|atan|sinh|cosh|tanh|cbrt|sqrt|floor|ceil|sgn|abs|exp|sin|cos|tan|sec|csc|cot|log|ln|pi)/i;

/** LaTeX 문자열을 토큰으로 나눈다: { c: '\\frac' } | { t: '{' } | { t: '}' } | { ch: 'x' } */
function lex(s) {
  const out = []; let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '\\') {
      const m = /^\\([a-zA-Z]+)/.exec(s.slice(i));
      if (m) { out.push({ cmd: m[1] }); i += m[0].length; }
      else { out.push({ cmd: s[i + 1] || '' }); i += 2; }
      continue;
    }
    if (ch === '{') { out.push({ t: '{' }); i++; continue; }
    if (ch === '}') { out.push({ t: '}' }); i++; continue; }
    if (/\s/.test(ch)) { i++; continue; }
    out.push({ ch }); i++;
  }
  return out;
}

function latexToExpr(latex) {
  const toks = lex(String(latex == null ? '' : latex));
  let pos = 0, barOpen = false;

  /** 중괄호 한 덩어리({...})의 안쪽 토큰을 돌려준다. 중괄호가 없으면 토큰 하나. */
  function takeGroup() {
    const t = toks[pos];
    if (!t) throw err('식이 중간에 끝났어요');
    if (t.t === '{') {
      let d = 0; const start = pos + 1;
      for (let i = pos; i < toks.length; i++) {
        if (toks[i].t === '{') d++; else if (toks[i].t === '}') { d--; if (d === 0) { pos = i + 1; return toks.slice(start, i); } }
      }
      throw err('중괄호가 닫히지 않았어요');
    }
    pos++; return [t];
  }
  /** [n] 형태의 선택 인자 (\sqrt[3]{x}) */
  function takeOptional() {
    const t = toks[pos];
    if (!t || t.ch !== '[') return null;
    let i = pos + 1; const inner = [];
    while (i < toks.length && toks[i].ch !== ']') { inner.push(toks[i]); i++; }
    if (i >= toks.length) throw err('대괄호가 닫히지 않았어요');
    pos = i + 1; return inner;
  }
  const sub = (tl) => run(tl);
  const simple = (s) => /^[0-9]+(\.[0-9]+)?$/.test(s) || /^[a-z]$/i.test(s) || s === 'pi';
  const wrap = (s) => (simple(s) ? s : '(' + s + ')');

  function textOf(tl) { return tl.map((t) => (t.ch !== undefined ? t.ch : t.cmd !== undefined ? t.cmd : '')).join(''); }

  function run(list) {
    const sT = toks.slice(); const sP = pos, sB = barOpen;
    toks.length = 0; list.forEach((t) => toks.push(t)); pos = 0; barOpen = false;
    let out = '';
    const push = (s) => {
      // 글자가 연달아 붙어 abs, sin 같은 함수 이름이 우연히 만들어지지 않도록 사이에 공백을 둔다.
      if (/[a-z]$/i.test(out) && /^[a-z]/i.test(s)) out += ' ';
      out += s;
    };
    while (pos < toks.length) {
      const t = toks[pos++];
      if (t.t === '{') { pos--; const g = takeGroup(); push('(' + sub(g) + ')'); continue; }
      if (t.t === '}') throw err('중괄호가 너무 많아요');
      if (t.ch !== undefined) {
        if (t.ch === '^') { const g = takeGroup(); const e = sub(g); out += '^' + (simple(e) || /^-?[0-9]+$/.test(e) ? e : '(' + e + ')'); continue; }
        if (t.ch === '_') { takeGroup(); throw err('아래 첨자는 log₂ 같은 경우에만 쓸 수 있어요'); }
        if (t.ch === '|') { if (barOpen) { out += ')'; barOpen = false; } else { push('abs('); barOpen = true; } continue; }
        if (t.ch === '$') continue;
        push(t.ch); continue;
      }
      const c = t.cmd;
      if (c === 'frac' || c === 'dfrac' || c === 'tfrac') {
        const a = sub(takeGroup()), b = sub(takeGroup());
        push('((' + a + ')/(' + b + '))'); continue;
      }
      if (c === 'sqrt') {
        const n = takeOptional(); const a = sub(takeGroup());
        if (!n) push('sqrt(' + a + ')');
        else { const k = textOf(n); push(k === '3' ? 'cbrt(' + a + ')' : k === '2' ? 'sqrt(' + a + ')' : '((' + a + ')^(1/(' + sub(n) + ')))'); }
        continue;
      }
      if (c === 'left' || c === 'right') {
        const nx = toks[pos++]; const d = nx && (nx.ch !== undefined ? nx.ch : nx.cmd);
        if (c === 'left') {
          if (d === '|' || d === 'vert' || d === 'lvert') { push('abs('); } else if (d === 'lfloor') { push('floor('); } else if (d === 'lceil') { push('ceil('); } else if (d === '.') { /* 빈 구분자 */ } else push('(');
        } else if (d === '.') { /* 빈 구분자 */ } else out += ')';
        continue;
      }
      if (c === 'lvert') { push('abs('); continue; }
      if (c === 'rvert') { out += ')'; continue; }
      if (c === 'lfloor') { push('floor('); continue; }
      if (c === 'rfloor' || c === 'rceil') { out += ')'; continue; }
      if (c === 'lceil') { push('ceil('); continue; }
      if (c === 'lbrace' || c === '{') { out += '('; continue; }
      if (c === 'rbrace' || c === '}') { out += ')'; continue; }
      if (c === 'operatorname' || c === 'mathrm' || c === 'text' || c === 'mathit' || c === 'operatorname*') {
        const name = textOf(takeGroup());
        if (/^(abs|sgn|floor|ceil|sqrt|cbrt|exp|sin|cos|tan|sec|csc|cot|ln|log|arcsin|arccos|arctan|sinh|cosh|tanh)$/.test(name)) push(name + ' ');
        else if (name) push(name);
        continue;
      }
      if (c === 'placeholder') { takeOptional(); if (toks[pos] && toks[pos].t === '{') takeGroup(); continue; }
      if (FN.includes(c)) {
        if (c === 'log' && toks[pos] && toks[pos].ch === '_') {
          pos++; const b = textOf(takeGroup());
          if (!/^[0-9]+(\.[0-9]+)?$/.test(b)) throw err('log의 밑은 숫자만 쓸 수 있어요');
          push('log' + b); continue;
        }
        push(c + ' '); continue;
      }
      if (Object.prototype.hasOwnProperty.call(SYMBOL, c)) { push(SYMBOL[c]); continue; }
      if (IGNORE.has(c)) continue;
      throw err('지원하지 않는 기호예요: \\' + c);
    }
    if (barOpen) throw err('절댓값 기호 |  |가 닫히지 않았어요');
    // 변수 글자 사이에 넣어 둔 공백은, 합쳐도 함수 이름(abs, sin …)이 생기지 않으면 지운다 (a x → ax)
    const res = out.replace(/\s+/g, ' ').trim().replace(/(^|[^a-z])([a-z](?: [a-z])+)(?![a-z])/gi, (m, pre, run) => {
      const joined = run.replace(/ /g, '');
      return RESERVED.test(joined) ? m : pre + joined;
    });
    toks.length = 0; sT.forEach((t) => toks.push(t)); pos = sP; barOpen = sB;
    return res;
  }

  return run(toks.slice());
}

const api = { latexToExpr };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LatexBridge = api;
})(typeof self !== 'undefined' ? self : this);
