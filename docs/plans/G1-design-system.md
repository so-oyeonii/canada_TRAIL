# G1 · 디자인 시스템 — 실행 계획

기준: `docs/FIGMA_ADOPTION.md`. §1 협상 불가와 §4 그룹 간 계약을 따른다.
**`app/globals.css`의 `:root` 토큰 블록은 이 그룹만 고친다.** G2~G5는 아래 표의 이름만 쓴다.

G1은 재료를 먼저 내보내는 그룹이다. 그래서 이 계획은 "완성"이 아니라 **출고 순서**로 짜여 있다 —
§8의 `G1-A`(토큰)를 머지하는 순간 다른 그룹이 병렬로 착수할 수 있어야 한다.

색 값은 `docs/figma/` PNG에서 **직접 픽셀을 샘플링해** 뽑았다 (프레임은 1x, 폰 내부 폭이 정확히 390px이라
측정한 px가 곧 CSS px다). 대비비는 WCAG 2.x 상대휘도 공식으로 **직접 계산한 값**이며 표에 그대로 적는다.

기준선: 현재 `npm run build` 통과 (exit 0, 2026-08-18). G1의 어떤 단계도 이 상태를 깨고 끝나지 않는다.

---

## 0. 이번 회의에서 정한 것 (근거 포함)

| # | 결정 | 근거 |
| --- | --- | --- |
| 1 | 다크가 **기본값**이다. `:root`에 다크 값을 직접 쓰고 `color-scheme:dark`를 선언한다. `data-theme="dark"`는 삭제한다 | 지금은 `/bags/track` 한 화면만 다크라 포커스 링·탭바·머티드 색이 전부 `[data-theme="dark"]` 오버라이드로 이중 관리된다. 와이어프레임 25장이 전부 다크다 |
| 2 | 라이트 테마는 **값을 정의하되 노출하지 않는다** (`[data-theme="light"]` opt-in) | 검수 없이 켜지는 라이트 테마는 대비 회귀를 조용히 만든다. `prefers-color-scheme:light`에 자동 반응시키지 않는다. 값은 §1.2에 계산까지 끝내 두었으니 언제든 켤 수 있다 |
| 3 | 토큰을 **개명한다**. 다만 1단계에서는 기존 이름을 새 이름의 **별칭으로 남긴다** | `--lime` 91회, `--white` 72회, `--navy` 84회가 5개 CSS 파일에 흩어져 있다. 별칭을 거치면 `:root` 한 블록 수정으로 앱 전체가 다크로 넘어가고, 마크업 churn 없이 다른 그룹이 바로 착수한다. 별칭은 `G1-E`에서 제거한다 |
| 4 | 서체는 **Inter(본문) · Playfair Display(디스플레이) · IBM Plex Mono(데이터)**. 전부 OFL 1.1, 로컬 `.woff2` 서브셋 | 셋 다 OFL이라 재배포·웹폰트 임베딩에 조건이 없다. 현재 Ubuntu는 **TTF 1016KB**를 그대로 서빙 중이라, 3벌로 늘리면서 오히려 총량이 준다 |
| 5 | 본문 최소치를 **13px → 14px**, 라벨 최소치를 **10px → 11px**로 올린다 | 와이어프레임 실측(`Total budget` 글리프 높이 13px ≈ 14px 산세, `TORONTO TRAIL` 캡 높이 8px ≈ 11–12px 모노)이 이미 현재 구현보다 크다. `--fs-label-s:10px`가 59곳에 쓰여 있고 이게 실기기 가독성 하한을 깬다 |
| 6 | 사진은 **넣지 않는다**. `.tile-art`(그래디언트 + SVG 픽토그램)로 대체한다 | 카탈로그가 `Sample`인데 실사진을 붙이면 §1-1을 정면으로 깬다. 라이선스 있는 상품 사진도 없다 |

---

## 1. 토큰 표

### 1.1 색 — 다크 (기본, `:root`)

`대비` 열은 **canvas / surface / raised** 세 배경 각각에 대한 계산값이다.
`—`는 배경 자신이거나 대비 개념이 없는 경우.

| 변수 | 값 | 역할 | 대비 (canvas `#08121f` / surface `#0e1d2e` / raised `#162840`) |
| --- | --- | --- | --- |
| `--canvas` | `#08121f` | 페이지 바닥. `html`·`body`·`.app-shell` | — |
| `--surface` | `#0e1d2e` | 카드·패널·시트·탭바 바닥 | — |
| `--surface-raised` | `#162840` | 카드 안의 타일·입력·칩·보조 버튼·AI 말풍선 | — |
| `--surface-invert` | `#ede9e3` | **QR 패스 전용.** 스캐너가 읽으려면 밝아야 한다 | 위에 올리는 잉크는 `--canvas` (15.55) |
| `--hairline` | `#1f2d3d` | 카드 **안쪽** 행 구분선. 장식 전용 | 1.34 / 1.22 / 1.06 — 의도적. 단독 정보 전달 금지 |
| `--border` | `#2b3d52` | 카드 외곽선. 장식 전용 | 1.69 / 1.53 / 1.34 |
| `--border-strong` | `#647b91` | **인터랙티브 경계** — 입력·라디오·체크박스·보조 버튼·미래 타임라인 점 | **4.28 / 3.88 / 3.39** — 전부 ≥3:1 (1.4.11) |
| `--text` | `#ede9e3` | 본문·제목. 순백이 아니라 따뜻한 오프화이트 (프레임 실측) | **15.55 / 14.07 / 12.30** |
| `--text-muted` | `#7a93aa` | 보조 텍스트·섹션 라벨·비활성 스텝 | **5.89 / 5.33 / 4.66** — 전부 ≥4.5:1 |
| `--accent` | `#e9a222` | 앰버. 주 액션 **텍스트/아이콘** 색 | **8.65 / 7.83 / 6.84** |
| `--accent-fill` | `#e9a222` | 앰버 **면**. 주 CTA 배경, 사용자 말풍선 | 위에 `--on-accent` (8.65) |
| `--accent-hi` | `#f0b043` | hover·강조 수치 | 9.85 / 8.91 / 7.79 |
| `--accent-lo` | `#c9861a` | active(눌림) 면 | 위에 `--on-accent` (6.19) |
| `--accent-soft` | `#2c2313` | 앰버 칩 바닥 | 위에 `--accent` (7.12) |
| `--accent-line` | `#6d5320` | 앰버 칩 테두리. 장식 전용 | 2.36 — 칩은 면으로 이미 구분된다 |
| `--on-accent` | `#08121f` | 앰버/틸 면 위의 잉크 | 앰버 위 8.65, 틸 위 9.25 |
| `--teal` | `#3ec9c1` | 틸. 보조 액션·완료 상태·섹션 라벨 | **9.25 / 8.37 / 7.32** |
| `--teal-fill` | `#3ec9c1` | 틸 면 (`Start today's route →`) | 위에 `--on-accent` (9.25) |
| `--teal-hi` | `#7ee0d6` | 밝은 틸. 포커스 링과 같은 값 | 12.11 / 10.96 / 9.58 |
| `--teal-soft` | `#10333a` | 틸 칩 바닥 | 위에 `--teal` (6.64) |
| `--teal-line` | `#26787a` | 틸 칩 테두리 | 3.28 |
| `--success` | `#3ec9c1` | `--teal` 별칭. 완료·`Delivery paid` | 9.25 / 8.37 / 7.32 |
| `--danger` | `#ff8a75` | 실패·초과 텍스트. **`OVER PLAN` 여기로 올린다** | **8.19 / 7.41 / 6.48** (와이어프레임 `#e06060`은 4.90) |
| `--danger-soft` | `#241a20` | 실패 패널 바닥 | 위에 `--danger` (7.35) |
| `--danger-line` | `#5e3a34` | 실패 패널 테두리. 장식 전용 | 1.73 — 면 + 텍스트로 이미 구분 |
| `--warn` | `#f0b043` | 경고 텍스트 (`Simulated`, 예산 근접) | 9.85 / 8.91 / 7.79 |
| `--warn-soft` | `#2c2313` | 경고 패널 바닥 | 위에 `--warn` (8.10) |
| `--warn-line` | `#6d5320` | 경고 패널 테두리(점선) | 2.36 |
| `--focus` | `#7ee0d6` | 포커스 아웃라인. **절대 제거 금지** | **12.11 / 10.96 / 9.58** |
| `--scrim` | `rgba(4,11,20,.72)` | 시트/모달 뒤 막 | — |

> **앰버 면 위 포커스 링 주의.** `--focus`는 `--accent-fill` 위에서 1.40:1이다.
> 그래서 포커스 규칙은 항상 `outline:3px solid var(--focus);outline-offset:2px`다 —
> 링이 버튼 **바깥**, 즉 `--surface`/`--canvas` 위에 그려져 10.96:1을 확보한다.
> `outline-offset:0`이나 `inset` 링을 채색 버튼에 쓰지 않는다. 탭바처럼 화면 끝에 붙은 요소만
> `outline-offset:-4px`를 쓰되, 그 안쪽 바닥이 `--surface`이므로 여전히 10.96:1이다.

### 1.2 색 — 라이트 (`[data-theme="light"]`, 정의만 하고 노출하지 않음)

| 변수 | 값 | 대비 (canvas `#f5f6f1` / surface `#fff` / raised `#ebefea`) |
| --- | --- | --- |
| `--canvas` / `--surface` / `--surface-raised` | `#f5f6f1` / `#ffffff` / `#ebefea` | — |
| `--surface-invert` | `#0e1d2e` | — |
| `--hairline` / `--border` | `#dde2dc` / `#c9d2cb` | 장식 전용 |
| `--border-strong` | `#6b7a72` | **4.16 / 4.51 / 3.88** |
| `--text` | `#142227` | **15.01 / 16.31 / 14.03** |
| `--text-muted` | `#5a6a6f` | **5.19 / 5.64 / 4.85** |
| `--accent` (텍스트) | `#8a5406` | **5.77 / 6.27 / 5.39** |
| `--accent-fill` | `#e9a222` (다크와 동일) | 위에 `--on-accent` 7.50 |
| `--on-accent` | `#142227` | 앰버 위 7.50, 틸 위 8.02 |
| `--teal` (텍스트) | `#1d6b66` | 5.78 / 6.27 / 5.40 |
| `--teal-fill` | `#3ec9c1` | — |
| `--danger` | `#a33622` | 6.22 / 6.76 / 5.81 |
| `--focus` | `#347d8d` | 4.33 / 4.70 / 4.05 |

`--accent`(텍스트)와 `--accent-fill`(면)을 **분리한 이유**가 여기 있다.
`#e9a222`는 흰 배경에서 1.90:1이라 라이트에서 텍스트로 못 쓴다. 컴포넌트가 테마를 분기하지 않게
하려면 두 토큰이어야 한다. **다크에서도 반드시 용도에 맞는 쪽을 쓴다** — 텍스트엔 `--accent`,
배경엔 `--accent-fill`.

### 1.3 타이포

| 변수 | 값 | 쓰는 서체 | 어디에 |
| --- | --- | --- | --- |
| `--font-serif` | `"Playfair Display","Playfair Fallback",Georgia,"Times New Roman",serif` | 디스플레이 | `--fs-hero`~`--fs-title`에서만 |
| `--font-sans` | `"Inter","Inter Fallback",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif` | 본문 | 기본값 (`body`) |
| `--font-mono` | `"IBM Plex Mono","Plex Fallback",ui-monospace,"SFMono-Regular","Cascadia Mono",Consolas,monospace` | 데이터 | 금액·날짜·ID·대문자 섹션 라벨 |
| `--fs-hero` | `40px` | serif | `Delivered.` `CAD $9.00` — 화면당 1개 |
| `--fs-display` | `32px` | serif | `Good morning.` `Your bags are on the way` |
| `--fs-title` | `24px` | serif | `Toronto` `Hotel Delivery` `Plan with AI` |
| `--fs-h` | `20px` | sans 700 | 카드 제목 |
| `--fs-lead` | `16px` | sans | 리드문, 리스트 주 텍스트 |
| `--fs-body` | `14px` | sans | **본문 기본** (13→14) |
| `--fs-body-s` | `13px` | sans | 보조 설명. **이 아래로 본문 없음** |
| `--fs-label` | `12px` | mono | 데이터 라벨, 칩 |
| `--fs-label-s` | `11px` | mono | 대문자 + 트래킹 섹션 라벨. **하한** (10→11) |
| `--fs-icon` | `24px` | — | 탭바·헤더 아이콘 |
| `--lh-hero` | `1.05` | | |
| `--lh-display` | `1.08` | | |
| `--lh-title` | `1.2` | | |
| `--lh-body` | `1.5` | | |
| `--lh-label` | `1.35` | | |
| `--ls-display` | `-.02em` | | Playfair는 이미 촘촘하다. 기존 `-.03em`은 과하다 |
| `--ls-label` | `.08em` | | 모노 대문자 라벨 |
| `--fw-reg/med/bold` | `400 / 500 / 700` | | |

**11px 미만은 어떤 토큰에도 없다.** 위계가 더 필요하면 크기가 아니라
`--fw-*`(굵기) · `--text-muted`(색) · `--sp-*`(간격)로 만든다.

### 1.4 간격 · 치수

| 변수 | 값 | 비고 |
| --- | --- | --- |
| `--sp-1`~`--sp-8` | `4 8 12 16 20 24 28 32` | 4배수 유지. 프레임 실측 gutter 20px = `--sp-5` |
| `--gutter` | `var(--sp-5)` | 페이지 좌우 (실측 390−350=40, 양쪽 20) |
| `--pad-card` | `var(--sp-4)` | 카드 안쪽. 프레임은 12·20이 섞여 있어 16으로 통일 |
| `--tap` | `44px` | 최소 터치 타깃. **31px 기준은 폐기** |
| `--tab-h` | `calc(var(--sp-4) + var(--fs-icon) + 1.35em + var(--sp-3))` | ≈71px @14px. **em 항이 있어 200% 확대에서 탭바와 본문 패딩이 같이 늘어난다.** 고정 76px는 삭제 |
| `--app-max` | `100%` → `560px`(≥600px) → `720px`(≥960px) | ≥960px에서는 여백만 늘리지 않고 `.reco-rail`·`.store-grid`·`.trip-sections`의 열 수를 늘려 밀도를 유지한다 |
| `--r-s` | `10px` | 칩·배지·입력·버튼·프로그레스 (실측 앰버 버튼 10) |
| `--r-m` | `14px` | 카드·리스트 행·패널·아트 타일 (실측 카드 12, QR 14) |
| `--r-l` | `22px` | 바텀시트·QR 패스·히어로 |
| `--r-pill` | `999px` | 알약·원형. 크기가 아니라 형태라 스케일 3종에 포함하지 않는다 |

### 1.5 아트 타일 톤 (`.tile-art` 전용)

| 톤 | `--art-a` (밝은 스톱) | `--art-b` | `--art-ink` (픽토그램) | 픽토그램 대비 / `--text` 대비 |
| --- | --- | --- | --- | --- |
| `1` amber | `#3b2c14` | `#171008` | `#f0b043` | 7.07 / 11.16 |
| `2` teal | `#123a3c` | `#08191c` | `#3ec9c1` | 6.09 / 10.24 |
| `3` coral | `#3a201c` | `#180d0c` | `#ff8a75` | 6.52 / 12.38 |
| `4` violet | `#26203f` | `#100d1c` | `#a89bf0` | 6.33 / 12.76 |
| `5` sky | `#16304a` | `#0a1826` | `#8fc3ee` | 7.20 / 11.16 |

**규칙: 아트 타일 위에는 `--text`만 얹는다.** `--text-muted`는 밝은 스톱에서 3.88~4.84로
톤에 따라 4.5:1을 깬다. 타일 위 보조 정보는 타일 밖으로 뺀다.

### 1.6 모션

| 변수 | 값 |
| --- | --- |
| `--dur-1` / `--dur-2` | `.14s` / `.22s` |
| `--ease` | `cubic-bezier(.2,.7,.3,1)` |

`prefers-reduced-motion:reduce`에서 전부 `.01ms`로 눌린다 (기존 규칙 유지 + `transform` 애니메이션 제거).
**그림자 토큰은 만들지 않는다.** 다크에서 그림자는 보이지 않으면서 페인트 비용만 낸다.
현재 8곳의 `box-shadow`는 전부 삭제하고 표면 밝기 차(`--surface` vs `--surface-raised`)로 층을 만든다.

---

## 2. 서체 3벌 — 조달 · 서브셋 · 폴백

### 2.1 무엇을 어디서

| 역할 | 패밀리 | 웨이트 | 라이선스 | 출처 |
| --- | --- | --- | --- | --- |
| 디스플레이 | Playfair Display | 400, 700 | OFL 1.1 | `github.com/googlefonts/playfair` → `fonts/ttf/` |
| 데이터 | IBM Plex Mono | 400, 600 | OFL 1.1 | `github.com/IBM/plex` 릴리스 |
| 본문 | Inter | 400, 500, 700 | OFL 1.1 | `github.com/rsms/inter` 릴리스 (`Inter-*.woff2` 포함) |

OFL 1.1은 재배포·웹 임베딩에 조건이 없고 저작권 고지만 요구한다.
`public/fonts/OFL-Playfair.txt` · `OFL-IBMPlexMono.txt` · `OFL-Inter.txt` 세 파일을 함께 커밋한다.
**CDN·`next/font/google`·`@import url()` 전부 금지** — 오프라인 매장 안에서 서체가 사라지면 안 된다.

### 2.2 서브셋

```
pyftsubset SRC.ttf --flavor=woff2 --layout-features='kern,liga,tnum,calt' \
  --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+2000-206F,U+2074,\
U+20A0-20BF,U+2122,U+2190-2199,U+2212,U+25FC,U+FEFF,U+FFFD" \
  --output-file=public/fonts/NAME.woff2
```

- `U+20A0-20BF` — 통화 기호. `¥41,800` `₩` `€` 가 실제 화면에 나온다. 빼면 두부(□)가 된다.
- `U+2190-2199` — `→`. §2 정본 카피(`Continue with Trail AI →`)에 38회 들어 있다.
- `U+2212` — 진짜 마이너스. `−17` 같은 델타 표기에 쓰인다.
- `tnum` — **모노가 아닌 Inter에도 반드시 넣는다.** 금액이 흔들리면 지갑 표가 춤춘다.
  Inter는 `font-feature-settings:"tnum" 1`을 `.num` 유틸에 건다.
- CJK는 넣지 않는다. UI는 전 화면 영문이고(§2), 도시명도 로마자다.

예상 총량: Inter 3종 ≈ 55KB, Playfair 2종 ≈ 40KB, Plex Mono 2종 ≈ 45KB → **약 140KB.**
현재 Ubuntu TTF 3종 **1016KB**를 지우므로 순감이다.

### 2.3 `font-display`와 폴백

셋 다 `font-display:swap`. `optional`은 첫 방문에서 서체가 아예 안 뜨는데,
금액·트래킹 ID의 자간이 달라지면 오독 위험이 커서 쓰지 않는다.
대신 **폴백 메트릭을 맞춰 CLS를 없앤다** (`.woff2`가 늦게 와도 줄바꿈이 변하지 않는다):

```css
@font-face{font-family:"Inter Fallback";src:local("Segoe UI"),local("Helvetica Neue"),local("Arial");size-adjust:107%;ascent-override:90%;descent-override:22%;line-gap-override:0%}
@font-face{font-family:"Playfair Fallback";src:local("Georgia"),local("Times New Roman");size-adjust:104%;ascent-override:96%;descent-override:24%;line-gap-override:0%}
@font-face{font-family:"Plex Fallback";src:local("Consolas"),local("Menlo"),local("DejaVu Sans Mono");size-adjust:100%;ascent-override:92%;descent-override:24%;line-gap-override:0%}
```

**서체가 하나도 안 와도 화면은 성립해야 한다.** 그래서 위계는 서체가 아니라 크기·굵기·색·간격이
만든다. 세리프가 Georgia로 떨어져도, 모노가 Consolas로 떨어져도 레이아웃은 그대로다.
`<link rel="preload" as="font" type="font/woff2" crossorigin>`는 **Inter 400 하나만** 건다 —
첫 화면의 대부분이 본문이고, 나머지를 다 preload하면 서로 대역폭을 뺏는다.

---

## 3. 라디우스 — 7종 → 3종

현재 5개 CSS 파일에 `border-radius` 선언이 **135개**, 실제 값은 `8 9 10 11 12 13 14 15 16 17 18 19 20 22 24`
15종이 섞여 있다. 아래 매핑으로 일괄 치환한다 (스크립트는 §7.1).

| 현재 값 | 새 토큰 |
| --- | --- |
| `8 9 10 11 12` | `--r-s` (10px) |
| `13 14 15 16 17` | `--r-m` (14px) |
| `18 19 20 22 24` | `--r-l` (22px) |
| `20px`인데 알약(`padding` 좌우가 세로의 2배 이상) | `--r-pill` |
| `50%` | 유지 (원형) |

예외 1건: `.trail-face` / `.spark` / `.message>i` 의 `14px 14px 14px 4px` 같은 **말풍선 노치**는
브랜드 형태라 유지하되 `var(--r-m) var(--r-m) var(--r-m) var(--sp-1)`로 표기를 토큰화한다.

---

## 4. 컴포넌트 명세

상태 표기: **기본 / 활성 / 비활성 / 로딩**. 비활성은 `disabled` 대신 `aria-disabled="true"`를 기본으로 하고
(포커스 가능해야 이유를 읽어줄 수 있다), 실제 제출을 막는 곳만 `disabled`를 쓴다.

### 4.1 기존 17종 리스킨

| # | 클래스 | 마크업 구조 | 상태 | 리스킨 요점 |
| --- | --- | --- | --- | --- |
| 1 | `.app-shell` `.app-main` | `div > main#main` | — | `background:var(--canvas)`. `data-theme` 분기 제거. `padding` = `max(--gutter, env(safe-area-inset-*))`, 하단 `calc(var(--tab-h) + var(--sp-6) + env(safe-area-inset-bottom))` |
| 2 | `.app-header` `.brand` | `header > .brand(img+b) + button` | — | 워드마크 `trail` = `--font-serif` 700 `--accent`. 우측 원형 버튼 44×44 `--surface-raised` + `--border-strong` |
| 3 | `.tab-bar` | `nav > a×4 (svg[aria-hidden] + span)` | 기본 `--text-muted` / **활성** `--surface-raised` 알약 + `--accent` 아이콘·라벨 + `aria-current="page"` | `min-height:var(--tab-h)`(em 기반). 활성은 색만이 아니라 **알약 배경**으로도 구분 (색맹 대비). `backdrop-filter` 유지 |
| 4 | `.lens-nav` | `nav > a×4` | 기본 `--text-muted` / **활성** `--accent` + 하단 2px `--accent-fill` 언더라인 + `aria-current` | 프레임 20 기준. 알약형에서 **언더라인 탭**으로 변경. 각 `a` `min-height:var(--tap)` |
| 5 | `.ask-card` | `button > i.trail-face + span(small,b,em) + i` | 기본 / hover `--accent-hi` 테두리 / 비활성 | 배경 `--surface`, 테두리 `--border`. 그림자 삭제. `small` = mono `--teal` |
| 6 | `.starter-list` | `ul > li > button(i + span(b,small) + svg)` | 기본 / 눌림 `--surface-raised` | `i` 배경을 `--peach/--blue/--yellow`에서 `--art-*` 톤 1·2·5로 |
| 7 | `.message` `.messages` `.quick-replies` | `div.message > svg + p` | AI = `--surface-raised`+`--text` / **user** = `--accent-fill`+`--on-accent` / `.typing` | 프레임 16 그대로. `.quick-replies button` `min-height:var(--tap)` 유지, 배경 `--surface-raised` 테두리 `--border-strong` |
| 8 | `.chat-input` | `form > button + input + button` | 기본 / 전송중(로딩) | `--surface-raised` + `--border-strong`. 그림자 삭제. 전송 버튼 `--accent-fill`/`--on-accent`. **로딩 = 버튼 안 `.spinner` + `aria-busy`, 라벨은 "Sending"** |
| 9 | `.btn` (신설, `.main-button`·`.text-action`·`.back-to-chat`·`.visit-actions button`·`.store-actions button` 흡수) | `button.btn.btn--primary` 등 | 기본 / hover `--accent-hi` / active `--accent-lo` / **비활성** `--surface-raised`+`--text-muted`+`aria-disabled` / 로딩 `aria-busy` | 변형: `--primary`(앰버 면) `--teal`(틸 면) `--ghost`(`--surface-raised`) `--quiet`(투명+`--accent` 텍스트) `--danger`. **전 변형 `min-height:var(--tap)`.** 비활성에 반투명 앰버(`#6d5320`, 2.60:1) 금지 |
| 10 | `.field` (`.settings-card`·`.profile-form`·`.purchase-sheet`·`.recipient-amount` 흡수) | `label > span(small,b) + input` | 기본 / 포커스 / 오류 `aria-invalid` + `--danger` 테두리 + `.field-error[role="alert"]` / 읽기전용 | 입력 배경 `--surface-raised`, 테두리 `--border-strong`(3.39:1). 라벨 mono `--fs-label` `--text-muted`. 행 `min-height:var(--tap)` |
| 11 | `.toggle` | `button[role="switch"][aria-checked]` | off `--border-strong` / on `--accent-fill` + 노브 `--on-accent` | 이미 `::after{inset:-6px}`로 히트 확장 중 → `-10px`로 넓혀 52×32 시각 요소가 **72×52** 히트가 되게 |
| 12 | `.choice` (`.pay-methods`·`.bag-selector`·`.dropoff-picker` 흡수) | `label > input[type=radio\|checkbox] + i + span` | 기본 / 선택 `--accent-line` 테두리 + `--accent-soft` 바닥 / 비활성 | 입력 시각 크기 24px 유지 + `label{min-height:var(--tap)}` + `input::after{inset:-10px}`. **선택 상태를 테두리 색만으로 표시하지 않는다** — 체크 아이콘 병기 |
| 13 | `.product-list` + `.product-art` | `article > .tile-art + div + strong` | 기본 / 구매완료 / `Sample` | `.product-art` → `.tile-art` (§5). `.peach/.blue/.yellow` 톤 클래스 폐기 → `data-tone="1..5"` |
| 14 | `.trip-card` | `article > header + .trip-route + footer` | 현재 / 예정 / 지난 | `--surface` + `--border`. 금액·날짜 mono. 강조 수치 `--accent` |
| 15 | `.wallet` (`.split-meter`·`.budget-editor`·`.wallet-buckets`·`.profile-budget` 흡수) | `section > dl(행 5) + .meter` | 기본 / 초과 `--danger` | 프레임 2 실측: 행 높이 42px, 미터 6px. 버킷 색: planned `--accent-fill` / reserve `--teal-fill` / flexible `--border-strong`. **미터에 텍스트 요약 병기** (`84% allocated · CAD $31 flexible`) — 색만으로 전달 금지 |
| 16 | `.notice` (`.blocked-panel`·`.budget-warning`·`.pay-failed`·`.form-error`·`.route-dirty`·`.offline-note` 흡수) | `div[role="status"\|"alert"] > svg + b + p + .notice-actions` | info(`--teal-soft`) / warn(`--warn-soft`) / danger(`--danger-soft`) | `OVER PLAN` 라벨은 `--danger`(7.41:1)로. 실패 4분기(§1-2)가 전부 이 컴포넌트를 쓴다 |
| 17 | `.chip` / `.badge` (`.sync-chip`·`.app-toast`·`.simulation-badge`·`.draft-badge`·`.budget-pill`·`.transfer-chip`·`.attachment-chip` 흡수) | `span.badge.badge--sample` | 중립 / sample / simulated / pending / 오류 | mono `--fs-label-s`(11px) + `--ls-label`. **`Sample`·`Simulated`는 행의 `source` 값에서 그린다(§1-1).** `.sync-chip`은 `role="status"`, 토스트도 `role="status"` |
| — | `.drop-pass` (QR) | `section > div + svg.qr + b.mono` | 기본 / 만료 | 바닥 `--surface-invert`(#ede9e3), 잉크 `--canvas`. **여기만 밝다** — 스캐너 요구사항이라 예외를 문서에 남긴다 |

`.tracking-card`의 가로 4스텝 progress는 §4.2 `.timeline`으로 대체하고, 요약이 필요한 자리엔
`.timeline--compact`(가로) 변형만 남긴다.

### 4.2 신규 5종

| # | 클래스 | 소비 그룹 | 마크업 | 상태 | 치수 |
| --- | --- | --- | --- | --- | --- |
| N1 | `.reco-rail` | **G3** (`RECOMMENDATIONS NEAR YOU`, `Made for {city}`), G4 | `<section><h2 class="section-label">…</h2><ul><li><a><span class="tile-art">…</span><b>이름</b><em class="num">$58</em><span class="badge--sample">Sample</span></a></li></ul></section>` | 기본 / 로딩(스켈레톤 3장) / 빈 상태 | 아이템 **112px 폭 · 아트 112×128**, `gap:var(--sp-3)`, `scroll-snap-type:x mandatory`. 프레임의 47×54는 상품을 알아볼 수 없고 터치 타깃도 못 맞춰 **의도적으로 키운다**. `a{min-height:var(--tap)}` |
| N2 | `.store-grid` | **G3** (`Nearby Stores`) | `<ul><li><a><span class="tile-art">…</span><b>매장명</b><small>거리·카테고리</small><span class="badge--sample">Sample</span></a></li></ul>` | 기본 / 로딩 / 빈 상태 / 오프라인(캐시본 + `.badge--pending`) | `grid-template-columns:repeat(auto-fill,minmax(148px,1fr))`, 아트 `aspect-ratio:4/3`, `--r-m`. ≥600px 3열, ≥960px 4열 |
| N3 | `.trip-sections` | **G3** (`My Trips`) | `<section class="trip-sections"><h2 class="section-label">CURRENT</h2><ul>…</ul></section>` ×3 | 각 섹션 기본 / 빈 상태(문장 1줄) | `CURRENT`는 `.trip-card` 풀카드 + 바닥 CTA, `UPCOMING`·`PAST`는 행 높이 76px 컴팩트 행. `PAST`는 `--text-muted` 비중을 늘리되 4.66:1 하한 유지 |
| N4 | `.timeline` | **G5** (`Bag Tracking`, `Delivery Complete`) | `<ol class="timeline"><li class="is-done"><span class="timeline-dot"><svg/></span><b>Dropped off</b><time class="num">4:42 PM</time></li>…</ol>` | **done**(`--teal-fill` 점 + 체크 SVG) / **current**(`--accent-fill` 링 + `.badge` `in progress` + `aria-current="step"`) / **future**(`--surface` 점 + `2px solid var(--border-strong)` 테두리 + 라벨 `--text-muted`) | 점 24px, 연결선 2px(done `--teal`, 이후 `--border-strong`), 행 `min-height:var(--tap)`. **미래 스텝 2.22:1 → 4.66:1로 수정**(§6-1) |
| N5 | `.trip-context` | **G2** (전 화면 상단) | `<div class="trip-context"><button class="chip-trip" aria-haspopup="listbox"><svg class="flag" aria-hidden="true"/>Toronto<svg aria-hidden="true"/></button><a class="chip-ai">…AI</a></div>` | 기본 / 여행 없음(숨김) / 여행 전환 열림 | 좌 `--surface-raised` 알약 + `--border-strong`, 우 `--teal-soft` 알약 + `--teal`. 둘 다 `min-height:var(--tap)`. 아래에 mono 서브라인(`Toronto · Day 2 · CAD · The Annex Hotel`) 선택 |

**공용 프리미티브 3개** (5종에 딸려 나가지만 다른 곳도 쓴다):
`.tile-art`(§5) · `.section-label`(mono 11px 대문자 `--ls-label` `--text-muted`) · `.num`(mono + `tnum`).

**국기 처리.** 와이어프레임의 🇨🇦는 이모지 국기다 — Windows/Chrome에서 렌더링되지 않아 `CA` 두 글자로
떨어진다. §1-5의 "국기만 예외"는 유지하되 이모지 대신 `components/flags.tsx`의
**인라인 SVG 3:2 국기**(`aria-hidden` + 옆에 도시명)로 만든다. 시드 데이터의 6개국만 그린다.

---

## 5. 사진 대체 — `.tile-art`

와이어프레임의 `#c4c4c4` 회색 사각형 자리다. 실사진을 넣지 않는 이유는 §0-6.

**결정: 해시는 TS가 계산하고, CSS는 5개 톤 중 하나만 고른다.** `--seed`를 색상환에 직접 꽂아
`hsl(var(--h) …)`를 만들면 매장명에 따라 대비를 예측할 수 없는 색이 나온다. 톤을 5개로 고정하면
§1.5 표의 대비가 **모든 매장에 대해 보증된다.**

```ts
// lib/tile-art.ts (G1이 만들어 내보낸다)
export type TileArt = { tone: 1|2|3|4|5; icon: "bag"|"cup"|"leaf"|"gift"|"shop"|"map"; angle: 0|1|2|3 };
export function tileArt(seed: string): TileArt { let h = 2166136261; for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); } const n = h >>> 0; return { tone: ((n % 5) + 1) as TileArt["tone"], icon: (["bag","cup","leaf","gift","shop","map"] as const)[(n >>> 3) % 6], angle: ((n >>> 6) % 4) as TileArt["angle"] }; }
```

```tsx
const art = tileArt(store.name);
<span className="tile-art" data-tone={art.tone} data-angle={art.angle}>{ICONS[art.icon]}</span>
```

```css
.tile-art{position:relative;display:grid;place-items:center;border-radius:var(--r-m);background:linear-gradient(var(--art-angle,140deg),var(--art-a),var(--art-b));color:var(--art-ink);overflow:hidden}
.tile-art[data-tone="1"]{--art-a:#3b2c14;--art-b:#171008;--art-ink:#f0b043}
.tile-art[data-tone="2"]{--art-a:#123a3c;--art-b:#08191c;--art-ink:#3ec9c1}
.tile-art[data-tone="3"]{--art-a:#3a201c;--art-b:#180d0c;--art-ink:#ff8a75}
.tile-art[data-tone="4"]{--art-a:#26203f;--art-b:#100d1c;--art-ink:#a89bf0}
.tile-art[data-tone="5"]{--art-a:#16304a;--art-b:#0a1826;--art-ink:#8fc3ee}
.tile-art[data-angle="0"]{--art-angle:140deg}.tile-art[data-angle="1"]{--art-angle:200deg}.tile-art[data-angle="2"]{--art-angle:60deg}.tile-art[data-angle="3"]{--art-angle:320deg}
.tile-art>svg{width:38%;height:38%;opacity:.9}
```

- 픽토그램은 `components/icons.tsx`의 SVG, `aria-hidden="true"`. **타일은 장식이고 의미는 옆의 텍스트에 있다.**
- 서버에서 계산해도 클라이언트에서 계산해도 같은 값이 나온다(순수 FNV-1a) → 하이드레이션 불일치 없음.
- 진짜 사진이 생기는 날엔 `.tile-art`가 `<img>`의 **플레이스홀더/오류 폴백**으로 그대로 남는다.
- `Sample` 배지는 타일이 아니라 **DOM 요소**다. `source !== 'live'`일 때만 그린다(§1-1).

---

## 6. 접근성 수선 7건

| # | 문제 | 지금 | 고친 뒤 | 근거 |
| --- | --- | --- | --- | --- |
| 1 | 미래 타임라인 스텝 | 라벨 `#44586c` on `#0e1d2e` = **2.32:1**, 점은 `#162840`으로 배경과 **1.06:1** (사실상 안 보임) | 라벨 `--text-muted` **5.33:1**, 점 `2px solid var(--border-strong)` **3.88:1** | 1.4.3 / 1.4.11 |
| 2 | `OVER PLAN` | `#e06060` on `#1d1a26` = **4.90:1** (11px 라벨이라 4.5 턱걸이) | `--danger` `#ff8a75` on `--danger-soft` `#241a20` = **7.35:1**, 크기 11→12px | 1.4.3 |
| 3 | `Request` 등 소형 버튼 | `padding`만 있고 높이 미달 | `.btn` 전 변형 `min-height:var(--tap)` (44px). 아이콘 전용 버튼 44×44 + `aria-label` | 2.5.8 |
| 4 | 200% 확대 | `--tab-h:76px` 고정 + `min-height:56px` 행 다수 → 탭바가 본문을 덮음 | `--tab-h`를 em 포함 `calc()`로. 모든 `height:` → `min-height:`. 200%에서 탭바와 `.app-main` 하단 패딩이 함께 증가 | 1.4.4 / 1.4.10 |
| 5 | 유니코드 아이콘 | `▥`7 · `✓`2 · `☑`2 잔존, `→`38 (SR이 "right arrow"로 읽음) | 전부 `components/icons.tsx` SVG. 카피의 `→`는 `<span aria-hidden="true">→</span>`로 감싸 **접근명에서 제외** — §2 정본 문구는 시각적으로 그대로 유지 | §1-5 / 1.1.1 |
| 6 | 포커스 | `[data-theme="dark"]` 분기로 색이 갈림. 채색 버튼 위에서 링이 죽음 | 단일 `--focus:#7ee0d6` + `outline:3px;outline-offset:2px`. 분기 삭제. **어떤 규칙도 `outline:none`을 쓰지 않는다** | 2.4.7 / 2.4.11 |
| 7 | 색 단독 전달 | 지갑 버킷·선택된 결제수단·탭 활성이 색만으로 구분 | 버킷=색+라벨+수치, 선택=테두리+체크 SVG, 탭 활성=알약 배경+`aria-current` | 1.4.1 |

추가로 넣는 것: `prefers-contrast:more`에서 `--border`→`--border-strong`, `--text-muted`→`--text`,
`--hairline`→`--border`. 3줄로 끝나고 고대비 사용자에게 즉시 이득이다.

---

## 7. 파일별 작업

### 7.1 `app/globals.css`

| 단계 | 내용 | 규모 |
| --- | --- | --- |
| a | `:root` 블록 전체 교체 — §1.1~1.6 토큰. `color-scheme:dark`. **`--ink`·`--muted`·`--white`·`--navy`·`--lime*`·`--peach*`·`--blue*`·`--yellow`·`--paper`·`--soft`·`--line*`·`--accent`(구)를 새 토큰의 별칭으로 남긴다** | 1줄(장문) |
| b | `@font-face` 6개(Inter 3 + Playfair 2 + Plex 2 중 실제 로드분) + 폴백 메트릭 3개. Ubuntu 3줄 삭제 | 2줄 |
| c | `body{font-family:var(--font-sans)}`, `h1,h2,.display{font-family:var(--font-serif)}`, `.num,.section-label,time,.mono{font-family:var(--font-mono);font-feature-settings:"tnum" 1}` | 1줄 |
| d | 포커스 규칙 통합 — `[data-theme="dark"]` 셀렉터 체인 삭제, `--focus` 단일화 | 1줄 |
| e | `background:var(--white)`(18) → `--surface`, `color:var(--white)`(17) → `--text`, `background:var(--navy)`(17) → `--surface-raised`, `color:var(--navy)`(25) → `--on-accent`, `background:var(--lime)`(13) → `--accent-fill`, `color:var(--lime)`(12) → `--accent`, `background:var(--soft)`(6) → `--surface-raised` | sed 7패스 |
| f | `border-radius` 62개 → `--r-s/m/l/pill` (§3 매핑) | sed |
| g | `box-shadow` 5개 삭제 | sed |
| h | `--fs-label-s`(26회) 값 상승은 토큰에서 처리 → 마크업 무변경. 단 `.tab-bar`·`.tracking-card`의 고정 높이 `min-height`화 | 수동 4곳 |
| i | `.btn` `.field` `.choice` `.notice` `.chip/.badge` `.tile-art` `.section-label` `.num` **신규 프리미티브 블록** 추가 | 8줄 |
| j | `@media(min-width:600px){--app-max:560px}` + `@media(min-width:960px){--app-max:720px}` + 열 수 증가 규칙 | 1줄 |
| k | `@media(prefers-contrast:more)` 블록 | 1줄 |

### 7.2 `app/handsfree.css`

같은 sed 패스(e·f·g)를 적용: `--white` 29 · `--navy` 26 · `--lime*` 32 · `--peach*` 12 · `--blue*` 6 ·
`border-radius` 54 · `box-shadow` 3.
`.shop-route-line`(세로 스텝)은 §4.2 `.timeline`과 중복이므로 **`.timeline` 사용으로 흡수**하고 규칙을 지운다.
`.handsfree-proof`·`.journey-card`·`.cold-chain`은 `--surface`/`--surface-raised` 2단으로 정리.

### 7.3 `app/profile.css` · `app/onboarding/onboarding.css` · `app/login/login.css`

동일 sed. 각각 소규모(라디우스 13·6·3개). 로그인 화면은 첫인상이므로 워드마크 세리프 적용을 여기서 확인한다.

### 7.4 신규 파일

| 파일 | 내용 | 소유 |
| --- | --- | --- |
| `app/tokens.css` | `:root` 토큰 + `@font-face` + 폴백 메트릭만. `globals.css`가 첫 줄에서 `@import`. **G1 전용 파일이라 다른 그룹의 diff와 절대 충돌하지 않는다** | G1 |
| `app/components.css` | `.btn` `.field` `.choice` `.notice` `.chip` `.badge` `.tile-art` `.section-label` `.num` `.timeline` `.trip-context` | G1 |
| `app/discovery.css` | `.reco-rail` `.store-grid` `.trip-sections` | G1이 뼈대 → G3이 확장 |
| `lib/tile-art.ts` | §5 해시 | G1 |
| `components/flags.tsx` | 6개국 인라인 SVG | G1 |
| `public/fonts/*.woff2` + `OFL-*.txt` | 서체 7개 + 라이선스 3개 | G1 |

`app/layout.tsx`는 `themeColor:"#12343d"` → `"#08121f"` 한 줄만 바꾼다 (G2 소유 파일이 아니라 안전).
Ubuntu TTF 3개는 `G1-E`에서 삭제한다 (그 전에 지우면 중간 커밋이 두부가 된다).

### 7.5 `app/workflow/workflow.css`

**손대지 않는다.** 폰 목업 프레임은 쇼케이스에만 남긴다는 방침이라 `/workflow`가 유일한 목업 소비자다.
토큰 별칭 덕에 자동으로 다크로 따라오지만, 목업 프레임(`.phone` 테두리)은 그대로 둔다.

---

## 8. 출고 순서 — 다른 그룹을 막지 않기 위해

| 단계 | 산출물 | 이걸 내보내면 풀리는 것 | 선행 |
| --- | --- | --- | --- |
| **G1-A** | `app/tokens.css` + `globals.css` `:root` 교체 + 별칭 + `color-scheme:dark` | **G2·G3·G4·G5 전원 착수 가능.** 화면 전체가 이 커밋 하나로 다크가 된다 | G0(포커스 아웃라인 수리) |
| **G1-B** | 서체 3벌 + `@font-face` + 타이포 토큰(`--fs-*` 상승) | G2가 §2 카피를 정본 서체로 옮길 수 있다 | A |
| **G1-C** | `app/components.css` — `.btn` `.field` `.choice` `.notice` `.badge` `.tile-art` `.section-label` `.num` | G3·G5가 새 화면을 프리미티브로 조립. **여기서 §6의 3·5·6·7이 해결된다** | A |
| **G1-D** | `app/discovery.css` + `.timeline` + `.trip-context` + `lib/tile-art.ts` + `components/flags.tsx` | G3(N1·N2·N3) · G5(N4) · G2(N5)가 CSS를 직접 안 짜도 된다 | C |
| **G1-E** | 라디우스 일괄 치환 · `box-shadow` 삭제 · **별칭 토큰 제거** · Ubuntu TTF 삭제 · 죽은 규칙 정리 | — (마지막. §4 계약대로 기존 규칙 삭제는 G1이 한 번에) | 전 그룹 화면 머지 후 |

**A와 C 사이가 이 계획의 급소다.** A만 나가 있고 C가 없으면 다른 그룹이 각자 버튼을 만든다.
그러면 E에서 지울 것이 다섯 배가 된다. **A → C는 같은 날 안에 붙여서 낸다.**

`G1-E`는 다른 모든 그룹이 머지된 뒤다. 별칭을 먼저 지우면 아직 머지 안 된 브랜치가 전부 깨진다.

---

## 9. 검증 체크리스트 (각 단계 종료 조건)

1. `npm run build` exit 0 (기준선 유지). `npm run lint`, `npm test` 통과.
2. 실제 뷰포트 3종에서 스크린샷: **375 · 768 · 1280**. 1280에서 여백만 늘지 않고 `.store-grid`가 4열인지 확인.
3. **200% 확대**(375 → 187.5 CSS px 상당)에서 탭바가 본문을 덮지 않고, 가로 스크롤이 생기지 않을 것.
4. 대비 자동 검사: §1.1·1.2·1.5의 모든 쌍을 스크립트로 재계산해 하한(본문 4.5 / 비텍스트 3.0) 위반 0건.
5. 키보드만으로 전 화면 순회 — 포커스 링이 **모든 배경 위에서** 보일 것. 특히 앰버 CTA와 탭바.
6. `--fs-body` 13→14 회귀: 금액 행·칩·탭 라벨의 줄바꿈/말줄임 확인 (가장 깨지기 쉬운 곳: `.wallet` 행, `.trip-route`, `.tab-bar span`).
7. 서체 차단 테스트: DevTools에서 `.woff2` 3개를 전부 실패시켜도 레이아웃이 유지될 것(§2.3).
8. `prefers-reduced-motion` · `prefers-contrast:more` 각각 켠 상태로 1회씩.
9. 11px 미만 폰트 0건: `grep -o 'font-size:[0-9]*px'`로 잔존 하드코딩 확인.
10. 유니코드 아이콘 0건 (`→`는 `aria-hidden` 래퍼 안에만 존재).

---

## 10. G1이 지지 않는 책임 (넘기는 것)

- **PWA 매니페스트·아이콘 세트·스플래시·설치 프롬프트·오프라인 화면**은 이번 그룹 범위 밖이다.
  다만 오프라인/동기화 대기 표시는 이 앱의 기능적 급소라, `.badge--pending`과 `.notice--offline`의
  **시각 규격은 G1-C에서 미리 내보낸다**. 배선은 G5·platform이 한다.
- `app/(app)/shell.tsx` · `landing.ts`는 §4 계약상 **G2 소유**다. G1은 `.tab-bar` CSS만 고치고
  탭 개명·라우트 재배치에 손대지 않는다.
- `--tab-h`가 em 기반으로 바뀌면 `shell.tsx`의 스크롤 복원 계산에 영향이 없는지 **G2가 확인**해야 한다.
  (현재 코드는 `scrollY`만 저장하므로 영향 없을 것으로 보이나, G1-A 머지 시 G2에 통지한다.)
