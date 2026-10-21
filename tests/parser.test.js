// 실행: node --test tests/
// 해석기(parser.js)와 LaTeX 변환(latex.js)이 기존 식을 그대로 해석하는지 확인한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const MP = require('../parser.js');
const { latexToExpr } = require('../latex.js');

const R = String.raw;
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * (1 + Math.abs(b)), `${a} ≠ ${b}`);
const P = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { v }]));
/** 식을 컴파일해 y=f(x)의 값을 구한다 */
const ev = (src, x, pv = {}, deg = false) => {
  const c = MP.compileGraph(src, deg, P(pv));
  assert.equal(c.kind, 'explicit', `${src}: ${c.err || c.kind}`);
  return c.f(x);
};

test('사칙연산과 거듭제곱', () => {
  close(ev('y=2x', 3), 6);
  close(ev('y=-x^2', 2), -4);
  close(ev('y=(-x)^2', 2), 4);
  close(ev('y=x^3-3x', 2), 2);
  close(ev('y=(x-1)(x+2)^2', 2), 16);
  close(ev('y=2^x', 3), 8);
  close(ev('y=x^-1', 4), 0.25);
});

test('유리·무리·세제곱근', () => {
  close(ev('y=(2x+1)/(x-1)', 3), 3.5);
  close(ev('y=1/(x^2-1)', 2), 1 / 3);
  close(ev('y=sqrt(x+2)', 2), 2);
  close(ev('y=√(4-x^2)', 0), 2);
  close(ev('y=cbrt(x)', -8), -2);
  close(ev('y=x^(1/3)', -8), -2);
});

test('지수·로그·삼각', () => {
  close(ev('y=e^(x-1)+2', 1), 3);
  close(ev('y=log2(x)', 8), 3);
  close(ev('y=log(x)', 100), 2);
  close(ev('y=ln(x)', Math.E), 1);
  close(ev('y=sin(x)', Math.PI / 2), 1);
  close(ev('y=2cos(3x)+1', 0), 3);
  close(ev('y=sin^2(x)', Math.PI / 2), 1);
  close(ev('y=sin(x)', 30, {}, true), 0.5);
});

test('절댓값·구간별 함수', () => {
  close(ev('y=|x-1|+2', -1), 4);
  close(ev('y=abs(x^2-4)', 0), 4);
  close(ev('y=x^2 (x<1); 2x-1 (x>=1)', 0.5), 0.25);
  close(ev('y=x^2 (x<1); 2x-1 (x>=1)', 3), 5);
});

test('이차곡선(음함수)을 알아본다', () => {
  const c = MP.compileGraph('(x-2)^2+(y+1)^2=9', false);
  assert.equal(c.kind, 'implicit');
  assert.ok(c.circle);
  close(c.circle.cx, 2); close(c.circle.cy, -1); close(c.circle.r, 3);
  const e = MP.compileGraph('x^2/9+y^2/4=1', false);
  assert.equal(e.kind, 'implicit');
  assert.ok(e.quad);
});

test('잘못된 식은 오류로 알려 준다', () => {
  for (const s of ['y=', 'y=(x+1', 'y=x+)', 'y=foo(x)', 'y=2x$']) {
    assert.equal(MP.compileGraph(s, false).kind, 'error', s);
  }
  assert.equal(MP.compileGraph('', false).kind, 'empty');
});

test('매개변수(슬라이더)를 찾아 값을 반영한다', () => {
  const c = MP.compileGraph('y=ax^2+bx+c', false, P({ a: 2, b: 1, c: -3 }));
  assert.deepEqual(c.pars, ['a', 'b', 'c']);
  close(c.f(2), 7);
  assert.deepEqual(MP.compileGraph('y=x^2', false).pars, []);
  // 값이 바뀌면 다시 컴파일한 결과에 반영된다
  const pv = P({ a: 1 });
  const c1 = MP.compileGraph('y=a(x-1)^2', false, pv); close(c1.f(3), 4);
  pv.a.v = 3;
  const c2 = MP.compileGraph('y=a(x-1)^2', false, pv); close(c2.f(3), 12);
});

test('매개변수가 든 음함수도 이차곡선으로 알아본다', () => {
  const c = MP.compileGraph('x^2+y^2=r^2', false, P({ r: 4 }));
  assert.ok(c.circle); close(c.circle.r, 4);
  assert.deepEqual(c.pars, ['r']);
});

test('매개변수 글자가 함수 이름·상수와 겹치지 않는다', () => {
  close(ev('y=abs(x)', -3), 3);
  close(ev('y=arctan(x)', 1), Math.PI / 4);
  close(ev('y=cot(x)+ceil(x)', 1, {}, false), 1 / Math.tan(1) + 1);
  assert.deepEqual(MP.compileGraph('y=pi x', false).pars, []);
  assert.deepEqual(MP.compileGraph('y=e^x', false).pars, []);
  assert.deepEqual(MP.compileGraph('y=sqrt(x)', false).pars, []);
});

test('구간 조건에도 매개변수를 쓸 수 있다', () => {
  const pv = P({ a: 1 });
  const c = MP.compileGraph('y=x (x<a); 5 (x>=a)', false, pv);
  close(c.f(0), 0); close(c.f(2), 5);
});

/* ---------- LaTeX → 식 문자열 ---------- */
const same = (latex, src, xs = [-2, 0.5, 3], pv = { a: 2, b: -1, c: 3 }) => {
  const e = latexToExpr(latex);
  const A = MP.compileGraph(e, false, P(pv)), B = MP.compileGraph(src, false, P(pv));
  assert.equal(A.kind, B.kind, `${latex} → ${e}: ${A.err || A.kind}`);
  if (A.kind === 'explicit') for (const x of xs) {
    const p = A.f(x), q = B.f(x);
    assert.ok((Number.isNaN(p) && Number.isNaN(q)) || Math.abs(p - q) < 1e-9 * (1 + Math.abs(q)), `${latex} → ${e}: x=${x} ${p} ≠ ${q}`);
  }
};

test('LaTeX: 분수와 지수', () => {
  same(R`y=\frac{x^{2}}{9}+1`, 'y=x^2/9+1');
  same(R`y=\frac{2x+1}{x-1}`, 'y=(2x+1)/(x-1)');
  same(R`y=2\frac{1}{2}x`, 'y=2*(1/2)*x');
  same(R`y=x^{-1}`, 'y=1/x');
  same(R`y=x^{12}`, 'y=x^12');
  same(R`y=2^{x+1}`, 'y=2^(x+1)');
  same(R`y=x^{\frac{1}{3}}`, 'y=x^(1/3)');
  same(R`y=e^{-x}`, 'y=e^(-x)');
});

test('LaTeX: 근호·절댓값', () => {
  same(R`y=\sqrt{x+5}`, 'y=sqrt(x+5)');
  same(R`y=\sqrt[3]{x}`, 'y=cbrt(x)');
  same(R`y=\sqrt[5]{x}`, 'y=x^(1/5)');
  same(R`y=\left|x-1\right|+2`, 'y=|x-1|+2');
  same(R`y=\left|\left|x\right|-1\right|`, 'y=abs(abs(x)-1)');
  same(R`y=\lvert x \rvert`, 'y=abs(x)');
});

test('LaTeX: 함수와 상수', () => {
  same(R`y=\sin\left(2x\right)+\pi`, 'y=sin(2x)+pi');
  same(R`y=\sin^{2}x`, 'y=sin^2(x)');
  same(R`y=\cos x`, 'y=cos(x)');
  same(R`y=\ln\left(x\right)`, 'y=ln(x)', [0.5, 2, 3]);
  same(R`y=\log_{2}\left(x\right)`, 'y=log2(x)', [0.5, 2, 8]);
  same(R`y=\log\left(x\right)`, 'y=log(x)', [0.5, 2, 8]);
  same(R`y=\exponentialE^{x}`, 'y=e^x');
  same(R`y=\operatorname{abs}\left(x\right)`, 'y=abs(x)');
  same(R`y=\tan x`, 'y=tan(x)');
});

test('LaTeX: 매개변수와 곱셈 기호', () => {
  same(R`y=ax^{2}+bx+c`, 'y=a x^2+b x+c');
  same(R`y=a\left(x-b\right)^{2}+c`, 'y=a(x-b)^2+c');
  same(R`y=a\cdot x`, 'y=a*x');
  same(R`y=3\times x\div 2`, 'y=3*x/2');
});

test('LaTeX: 이차곡선·구간별 함수', () => {
  assert.equal(MP.compileGraph(latexToExpr(R`\frac{x^{2}}{9}+\frac{y^{2}}{4}=1`), false).kind, 'implicit');
  const c = MP.compileGraph(latexToExpr(R`\left(x-2\right)^{2}+\left(y+1\right)^{2}=9`), false);
  assert.ok(c.circle); close(c.circle.r, 3);
  const pw = MP.compileGraph(latexToExpr(R`y=x^{2}\left(x<1\right);2x-1\left(x\ge1\right)`), false);
  assert.equal(pw.kind, 'explicit'); close(pw.f(3), 5); close(pw.f(0.5), 0.25);
  const iq = MP.compileGraph(latexToExpr(R`y=x\left(x\le 1\right)`), false);
  assert.equal(iq.kind, 'explicit');
});

test('LaTeX: 변수 글자는 붙여 쓰고, 함수 이름이 우연히 생기지 않게 한다', () => {
  assert.equal(latexToExpr('y=abx'), 'y=abx');
  assert.equal(latexToExpr(R`y=ax^{2}+bx`), 'y=ax^2+bx');
  // a, b, s를 이어 쓴다고 abs 함수가 되면 안 된다 (s는 변수가 아니므로 오류가 맞다)
  assert.equal(latexToExpr('abs'), 'a b s');
  assert.equal(MP.compileGraph('y=' + latexToExpr('abs'), false).kind, 'error');
  const c = MP.compileGraph(latexToExpr('y=abx'), false, P({ a: 2, b: 3 }));
  assert.equal(c.kind, 'explicit'); close(c.f(2), 12);
});

test('LaTeX: 지원하지 않는 기호는 이해하기 쉬운 오류를 낸다', () => {
  assert.throws(() => latexToExpr(R`\sum x`), /지원하지 않는/);
  assert.equal(MP.compileGraph(latexToExpr(R`y=\left|x`), false).kind, 'error'); // 닫히지 않은 절댓값은 해석기가 오류로 알려 준다
  assert.throws(() => latexToExpr(R`y=x_{1}`), /아래 첨자/);
  assert.equal(latexToExpr(''), '');
});
