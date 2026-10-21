# 수학 전자칠판

정적 파일만으로 동작합니다. 이 폴더 전체를 GitHub Pages에 올리세요.

| 파일 | 설명 |
|---|---|
| `index.html` | 앱 본체 |
| `parser.js` | 수식 해석기 (슬라이더 매개변수 포함) |
| `latex.js` | MathLive가 만든 LaTeX → 앱의 식 문자열 변환 |
| `mathlive.min.js`, `fonts/` | MathLive 0.111.1 (MIT). 수식 편집기와 가상 키보드 |
| `tests/parser.test.js` | 해석기·변환 테스트 (`npm test` 또는 `node --test tests/parser.test.js`) |

- `index.html`만 올리고 나머지를 빼먹으면 앱이 열리지 않습니다. `fonts/` 폴더가 없으면 수식 글꼴이 깨집니다.
- `mathlive.min.js`를 불러오지 못하면 기존 텍스트 입력창과 키패드로 자동 전환됩니다.
