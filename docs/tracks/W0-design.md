# W0 — 액자 걷어내기 (design-lead 상세안)

`docs/BUILD_PLAN.md` W0의 설계 산출물. 대상 파일은 `app/globals.css`(25.7KB) · `app/handsfree.css`(12.9KB) · `app/profile.css`(4.1KB) · `app/login/login.css` · `app/onboarding/onboarding.css` · `app/layout.tsx` · `app/page.tsx`.

측정은 전부 실제 파일에서 뽑았다. 대비비는 WCAG 2.x 상대휘도 공식으로 직접 계산했고, 텍스트 폭은 `public/fonts/Ubuntu-*.ttf`의 `hmtx`/`cmap` 테이블을 파싱해 실제 advance width로 계산했다. 추정한 값은 "산출"로 표기했다.

---

## 0. 요약 — 세 줄

1. **타이포는 "액자를 걷으면 깨지는" 게 아니라 이미 깨져 있다.** `.phone`은 `transform:scale`을 쓰지 않고, `@media(max-width:520px)`에서 이미 액자가 걷힌다. 실기기 375px에서 지금 이 순간 5.5px 탭 라벨이 그대로 렌더된다. (→ §6 이견 1)
2. **W0은 M이 아니라 L이다.** font-size 선언 233개 중 196개(84%)가 12px 미만, 인터랙티브 규칙 42개 중 35개(83%)가 44px 미달, 색 선언 197개 중 60개(30%)가 대비 미달, 하드코딩 hex 141종. 액자 제거(진짜 S)와 타이포 재조정(L)은 하나의 트랙으로 묶을 성격이 아니다. (→ §5, §6 이견 2)
3. **BUILD_PLAN에 없는 차단 항목 4개가 W0 안에 있다**: `maximumScale:1`(핀치줌 차단), `viewportFit` 미설정으로 기존 safe-area 코드가 전부 죽어 있음, `.phone`의 `aria-live="polite"`(화면 전체가 라이브 리전), `layout.tsx`의 외부 Figma CDN 스크립트. (→ §6 이견 5)

---

## 1. 현재 치수 감사 (전수)

### 1.1 폰트 크기 — 233개 선언

| 크기 | 선언 수 | 판정 |
| --- | ---: | --- |
| 5px | 24 | 절대 하한(10px) 미달 |
| 5.5px | 2 | 절대 하한 미달 |
| 6px | 62 | 절대 하한 미달 |
| 7px | 43 | 절대 하한 미달 |
| 8px | 26 | 절대 하한 미달 |
| 9px | 23 | 절대 하한 미달 |
| 10px | 11 | 라벨로만 허용 (본문이면 미달) |
| 11px | 5 | 라벨 OK / 본문 미달 |
| 12px | 9 | 본문 하한 통과 |
| 13–18px | 12 | 통과 |
| 21–39px | 16 | 통과 (단, 39px는 폭 초과 — §2.4) |

**미달 집계: 절대 하한 10px 미만 = 180개(77.3%). 본문 하한 12px 미만 = 196개(84.1%).**

### 1.2 최악 20개 (크기순)

| 클래스 | 파일 | px | 역할 | 실기기 판정 |
| --- | --- | ---: | --- | --- |
| `.store-actions button` | handsfree | **5** | 매장 액션 버튼 **라벨** | 버튼 글자가 5px |
| `.simulation-badge` | handsfree | **5** | `Simulated` 표기 | 제품 규칙 3번의 고지가 5px |
| `.product-list small` | globals | **5** | 상품 카드 상단 라벨 | 판독 불가 |
| `.handling-list header small` / `>div small` | handsfree | **5** | 취급 구분(파손/냉장) | **안전 관련 정보가 5px** |
| `.bag-selector header small` | handsfree | **5** | 가방 선택 헤더 | 판독 불가 |
| `.handsfree-proof small` | handsfree | **5** | 근거 카드 라벨 | 판독 불가 |
| `.shop-route-line small` | handsfree | **5** | 경로 스텝 | 판독 불가 |
| `.trip-card small` / `.profile-form small` / `.profile-budget small` | globals | **5** | 폼 라벨 | 폼 라벨이 5px |
| `.memory-strip small` / `.ai-memory-card small,em,>div span` / `.area-planner small,>p` / `.trip-area-preview span` | profile | **5** | 메모리·지역 | 판독 불가 |
| `.trip-history article>button small` / `>div>div span` | profile | **5** | 과거 여행 날짜 | 판독 불가 |
| `.tracking-card section small` | globals | **5** | **배송 단계 라벨** (Sealed/Collected/On route/At hotel) | **핵심 상태가 5px** |
| `.tab-bar span` | globals | **5.5** | 탭 라벨 5개 | **1차 내비게이션이 5.5px** |
| `.trip-history article>button em` | profile | **5.5** | 구매 요약 | 판독 불가 |
| `.budget-warning button` | handsfree | **6** | **예산 초과 승인 버튼** | 헌법 ②의 액션이 6px |
| `.visit-actions button` | handsfree | **6** | 매장 방문 액션 | 6px |
| `.ai-memory-card footer button` | profile | **6** | 메모리 동의/철회 | 6px |
| `.ownership-note` | handsfree | **6** | 소유·책임 고지 | **법적 고지가 6px** |
| `.draft-badge` | globals | **6** | `DRAFT` 배지 | 6px |
| `.attachment-chip` | handsfree | **6** | 첨부 표시 | 6px |
| `.area-chips button` | profile | **6** | 지역 칩(삭제 가능) | 6px |

가장 심각한 셋은 크기 순위가 아니라 **역할** 때문이다: 배송 단계(5px), 취급 구분(5px), 예산 초과 승인 버튼(6px). 셋 다 제품 헌법이 직접 걸리는 정보다.

### 1.3 터치 타깃 — 인터랙티브 규칙 42개 전수

높이는 `padding × 2 + font-size × line-height`로 산출했다(별도 `line-height` 없으면 1.2). 네이티브 위젯은 UA 기본값 기준.

**미달 35개 (83%)**

| 클래스 | 실측/산출 | 비고 |
| --- | ---: | --- |
| `.trip-history article>div>button` | **≈7px** | `padding:0` + 6px 글자. 최악 |
| `.text-action` | **≈10px** | 헤더 우측 텍스트 액션 (Edit/Skip/Done) |
| `.budget-warning button` | **≈13px** | `padding:3px 0` |
| `.profile-budget button` | **≈15px** | `padding:7px 0 0` |
| `.store-actions button` | **≈18px** | `padding:5px 6px` + 5px 글자 |
| `.tracking-card>button` | **≈18px** | |
| `.visit-actions button` / `.area-chips button` / `.ai-memory-card footer button` | **≈19px** | |
| `.suggestion-chip button` / `.suggestion-chip button.ghost` | **≈20px** | |
| `.quick-replies button` | **≈22px** | 채팅 빠른 응답 |
| `.live-draft button` | **≈24px** | |
| `.handsfree-trigger button` / `.refund-button` | **≈26px** | 환불 요청 버튼이 26px |
| `.back-to-chat` | **≈28px** | 폭은 100%, 높이만 미달 |
| `.chat-input button` | **29×29** | 첨부 버튼 |
| `.area-add input` / `.area-add button` | **≈29px** | |
| `.purchase-sheet header button` / `.memory-sheet header button` | **29×29** | 시트 닫기 |
| `.round-button` / `.avatar` | **31×31** | 뒤로가기 / 프로필. 앱 전역 |
| `.purchase-sheet input,select` | **≈33px** | 구매 기록 입력 |
| `.chat-input button:last-child` | **34×34** | **전송 버튼** |
| `.area-planner form input` / `form button` | **34px** | |
| `.bags-empty button` | **≈32px** | |
| `.bag-selector label` | **≈37px** | |
| `.bag-selector` 체크박스 | **UA 기본 ≈13×13** | 크기 미지정. 그리드 열은 20px |
| `.pay-methods input[type=radio]` | **14×14** | 라벨(≈45px)이 타깃이라 기능상 통과, 시각 표적은 미달 |
| `.pay-testing input[type=checkbox]` | **14×14** | 동일 |
| `.onboarding-form label.stacked` | **≈42px** | 경계 미달 |
| `.tab-bar button` | **43px 폭** | 높이는 ≈47px 확보, **폭이 1px 모자람** |
| `.date-pair label` | 산출 불가(네이티브 date) | 7px 폰트 강제 |

**통과 7개**: `.main-button`(min 56) · `.settings-card label`(min 53) · `.trip-history article>button`(≈53) · `.starter-list button`(≈50) · `.profile-form>label`(min 48) · `.login-form label`(≈47) · `.pay-methods label`(≈44, 경계).

### 1.4 대비 — 실측

토큰 기준선 (계산값):

| 조합 | 비율 | 4.5:1 |
| --- | ---: | --- |
| `--ink #142227` / `--paper #f5f6f1` | **15.01** | 통과 |
| `--ink` / `#ffffff` | **16.31** | 통과 |
| `--navy #12343d` / `--paper` | **12.20** | 통과 |
| `--paper` / `--navy` | **12.20** | 통과 |
| `--lime #cbea5b` / `--navy` | **9.76** | 통과 |
| `--yellow #f2d56d` / `--navy` | **9.16** | 통과 |
| `--blue #90d7eb` / `--navy` | **8.27** | 통과 |
| `--peach #ffb18a` / `--navy` | **7.52** | 통과 |
| **`--muted #6e7e83` / `--paper`** | **3.89** | **미달** |
| **`--muted` / `#ffffff`** | **4.22** | **미달** |
| **`--muted` / `--soft #ebefea`** | **3.63** | **미달** |
| `--line #dde2dc` / `--paper` | **1.21** | 비텍스트 3:1도 미달 |
| `--line` / `#ffffff` | **1.31** | 비텍스트 3:1 미달 |
| 포커스링 `#347d8d` / `--paper` | **4.33** | 비텍스트 3:1은 통과 |

**`--muted`가 앱 전역의 보조 텍스트 토큰인데 어느 표면에서도 4.5:1을 넘지 못한다.** `--muted`를 쓰는 본문·라벨 선언이 **46개**다(로그인·온보딩·프로필·핸즈프리·글로벌 전부).

**미달 항목 — 산출 방법**

`color:`를 선언한 규칙 **197개** 전부에 대해, 선택자 조상 사슬을 거슬러 실제 배경을 해석한 뒤 대비를 계산했다. `.tracking-screen`/`.trip-card`/`.budget-editor` 같은 **네이비 표면 위의 자손은 네이비 기준으로 다시 계산**했고(라임·연회색 텍스트 대부분이 여기서 살아난다), 18px 이상 또는 14px+700인 큰 텍스트에는 3:1을 적용했다.

**집계: 197개 검사 · 실질 미달 60개(30%). 그중 46개(77%)가 `--muted` 토큰 하나다.**

| 비율 | 전경/배경 | 클래스 | 크기 |
| ---: | --- | --- | ---: |
| **2.21** | `#a9b0ad` / white | `.tracking-card section>span` — **미완료 배송 단계 라벨** | 5px |
| **2.66** | `#96a19e` / 탭바 white | **`.tab-bar button` 비활성 (라벨 + 아이콘)** | 5.5 / 15px |
| **3.14** | `--muted` / `--navy` | `.budget-editor small` — 예산 편집기 보조 설명 | 6px |
| **3.24** | `#ffffff` / `#e26b5c` | `.pay-failed>i` — 결제 실패 아이콘 | 13px |
| **3.59** | `#6e858a` / paper | `.starter-list em` | — |
| **3.59–3.86** | `--muted` / `--soft` 계열 (`#e9eee8` `#eaeeea` `#eaf2d0` `#f0f2ef` `#f1f6df` `#f2f7e4`) | `.chat-status small` · `.how-it-works span` · `.profile-link small` · `.tracking-card footer span` · `.ai-memory-card p` · `.suggestion-chip button.ghost` | 6–10px |
| **3.76** | `#71817e` / paper | `.area-chips i` (칩 삭제 표식) | — |
| **3.81** | `#a5734c` / `#fff6ec` | `.pay-testing small` | 7px |
| **3.89** | **`--muted` / `--paper`** | `.home-hero>span` `.result-title>span` `.drop-copy>span` `.section-label span` `.starter-list small` `.review-intro small` `.plan-impact small` `.product-list p` `.profile-intro small` `.profile-section-label span` `.pay-methods header small,small` `.handsfree-proof em` `.shop-route-line p,em` `.memory-sheet>p` `.login-intro p,small` `.login-form small` `.login-note` `.onboarding-*` 4개 — **23개 규칙** | 6–10px |
| **4.01** | `#67787d` / `#edf0ed` | `.visit-actions .quiet` | — |
| **4.06–4.18** | `#6e7e83`·`#6a7f3a`·`#607c38`·`#31805c`·`#638137`·`#647e3b`·`#568038` | `.trip-history article>div p` · `.suggestion-chip small` · `.approved-banner small` · `.chat-status em` · `.live-draft small` · `.ai-memory-card small,em` | 5–6px |
| **4.22** | **`--muted` / `#ffffff`** | `.settings-card small` `.preferences small` `.result-route>small` `.tracking-card>div span` `.profile-form small` `.profile-budget em` `.offline-note span` **`.handling-list>div small`** **`.bag-selector label small`** `.workflow-link small` `.area-planner>p` `.trip-history …small,em` `.onboarding-form label small` — **13개 규칙** | 5–6px |
| **4.25 / 4.42** | `#5d6b3e` / `#5c683c` on `--lime` | `.handsfree-trigger em` · **`.main-button small`** (앱 주요 CTA의 부제) | 6px |
| **4.38** | `#607b37` / `#f3f7e3` | `.memory-strip small` | 5px |
| **4.46** | `#61757b` / paper | `.handsfree-proof small` | 5px |
| **4.49** | `#397887` / `#fff0e9` | **`.budget-warning button`** — 예산 초과 승인 액션 (헌법 ②) | 6px |

**핵심 진단 두 가지**

1. **`--muted`가 앱 전역 보조 텍스트 토큰인데 어느 표면에서도 4.5:1을 넘지 못한다.** paper 3.89 / white 4.22 / soft 3.63 / navy 3.14. 60개 미달 중 46개가 이것 하나다. **토큰 한 개를 바꾸면 미달의 77%가 사라진다** — W0d에서 가장 값싼 수정이다.
2. **경계선 통과(4.5~5.0)가 통과로 기능하지 않는다.** `.draft-badge`(4.75) · `.ai-orbit`(4.75) · `.handling-list header em`(4.98) · `.transfer-chip`(4.73)은 숫자상 통과지만 글자가 6~7px다. **크기가 먼저 깨져 있어서 대비 합격이 의미를 갖지 못한다.** 크기를 올리면 이 구간은 오히려 여유가 생기므로, 대비 수정은 크기 수정 다음에 하는 게 맞다(§5 d6 → d7 순서).

참고로 **`--line #dde2dc`는 paper 1.21 / white 1.31**로 비텍스트 3:1 기준에도 한참 못 미친다. 카드·폼 필드의 경계를 지금은 사실상 못 본다 — 입력 필드가 어디서 끝나는지 안 보인다는 뜻이다. `--line-strong`이 필요한 이유(§2.3).

### 1.5 구조 감사

| 항목 | 현재 | 문제 |
| --- | --- | --- |
| 토큰 | `:root` 11개 | 하드코딩 hex **141종 / 161회**. `var()` 201회. **하드코딩이 전체 색 사용의 44%** |
| 4px 간격 체계 | `padding`/`margin`/`gap` 337개 중 4배수 **81개(24%)** | 사실상 그리드 없음. 7·9·11·13·17·19·21·43·53px 산재 |
| 고정 `height:px` | **54개 규칙** | 200% 텍스트 확대 시 클리핑 |
| `min-height:px` | 8개 (`.phone` 650/620, `.messages` 260, `.product-list article` 96, `.route-product-list article` 126 …) | |
| `max-width:px` | 7개 (`.starter-list small` 230, `.attachment-chip` 250, 278, 335, 350) | 반응형 차단 |
| `position:absolute` | **13개** — `.status-bar` `.chat-input` `.tab-bar` `.home-indicator` `.modal-backdrop` `.app-toast` `.attachment-chip` 등 | **전부 `.phone`을 포함블록으로 가정.** 액자 제거 시 최우선 위험 |
| `prefers-reduced-motion` | 있음 (globals 끝) | 유지 |
| `prefers-color-scheme` | **없음** | |
| `viewportFit` | **없음** | → `env(safe-area-inset-*)` 4곳이 **전부 0으로 계산되어 죽어 있다** |
| `maximumScale` | **1** | 핀치줌 차단. WCAG 1.4.4 실패 |
| `.phone` `aria-live` | `"polite"` (화면 전체) | 화면 전환마다 전체 콘텐츠 낭독 |
| 외부 스크립트 | `layout.tsx` head에 `https://mcp.figma.com/mcp/html-to-design/capture.js` | 외부 CDN 금지 규칙 위반 |
| 유니코드 아이콘 | 15종 / 82회 | §4 |

---

## 2. 타이포 스케일 제안

### 2.1 스케일

```
--fs-display : 32px / lh 1.02 / ls -.03em   히어로 h1
--fs-num     : 26px / lh 1.10 / ls -.02em   결제 금액 등 숫자 표시
--fs-title   : 22px / lh 1.15 / ls -.02em   화면 제목
--fs-h       : 18px / lh 1.25               섹션 제목
--fs-lead    : 15px / lh 1.35               카드 제목, 강조 본문
--fs-body    : 13px / lh 1.50               기본 본문  ← 기본값
--fs-body-s  : 12px / lh 1.45               조밀 본문  ← 본문 하한
--fs-label   : 11px / lh 1.35 / w500        폼 라벨, 보조 정보
--fs-label-s : 10px / lh 1.30 / w700 / ls .06em / uppercase   ← 절대 하한
```

`--fs-label-s`는 **대문자 라벨 전용**이고 문장에는 쓰지 않는다. 문장은 `--fs-body-s`(12px)가 하한.

### 2.2 현행 → 신규 매핑

| 현행 | 선언 수 | 신규 | 판단 기준 |
| ---: | ---: | ---: | --- |
| 5 / 5.5 | 26 | **10** | 전부 대문자 라벨 또는 상태 표시 |
| 6 | 62 | **10 또는 12** | 대문자 라벨이면 10, 문장이면 12 |
| 7 | 43 | **11 또는 12** | 라벨 11, 버튼·문장 12 |
| 8 | 26 | **12** | |
| 9 | 23 | **13** | |
| 10 | 11 | **13** | |
| 11 | 5 | **15** | |
| 12 | 9 | **15** | `.header-title` 포함 |
| 13 | 2 | **15** | |
| 14–16 | 8 | **18** | `.brand>b`, `.trail-face` |
| 18 | 4 | **22** | |
| 21–27 | 4 | **22** ↓ | `.review-intro h1` 25→22, `.profile-intro h1` 27→22 |
| 29–39 | 6 | **32** ↓ | `.home-hero h1` 39→32 등 |
| 24 (아이콘) | 3 | SVG 24 | §4 |

**핵심은 큰 글자를 내리고 작은 글자를 올린다는 것이다.** 지금 히어로:탭라벨 비율은 39:5.5 = **7.1배**. 제안은 32:10 = **3.2배**. 줄어든 대비는 크기가 아니라 **굵기(400/500/700) · 색(ink / muted-strong / navy) · 간격(4px 그리드)**으로 만든다.

### 2.3 색 토큰 보강 (대비 미달 해소)

추가할 토큰 6개. **값은 전부 계산해서 확인했다.**

| 토큰 | 값 | paper 3.89… | white | soft `#ebefea` | navy | 용도 |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `--muted` | `#6e7e83` (유지) | 3.89 | 4.22 | 3.63 | 3.14 | **텍스트 금지로 강등.** 장식 아이콘·플레이스홀더 전용 |
| `--muted-strong` | **`#5a6a6f`** | **5.19** | **5.64** | **4.85** | 2.35 ✗ | **밝은 표면의 보조 텍스트 기본값** |
| `--muted-on-dark` | **`#a3b6ba`** | — | — | — | **6.29** | **네이비 표면의 보조 텍스트** (위 토큰은 다크에서 못 쓴다) |
| `--accent` | **`#2f6f7d`** | **5.24** | **5.69** | **4.90** | — | 링크·텍스트 액션. 기존 `#2c7484`(paper 4.91) 대체 |
| `--line-strong` | **`#859089`** | **3.05** | **3.31** | — | — | 입력 필드·카드 경계. **3:1 확보** |
| `--focus` | `#347d8d` (유지) | 4.33 | 4.70 | — | 2.82 ✗ | 밝은 표면 포커스링 |
| `--focus-on-dark` | **`#90d7eb`** (=`--blue`) | — | — | — | **8.27** | **네이비 화면의 포커스링.** 현재 `#347d8d`는 네이비 위 2.82로 안 보인다 |

**주의 두 가지 — 처음 잡았던 값이 틀려서 다시 계산했다.**
- `--muted-strong`은 **네이비 위에서 2.35로 실패한다.** `.tracking-screen`·`.trip-card`·`.budget-editor`·`.pay-amount`·`.journey-card`·`.shop-summary`는 전부 네이비다. 밝은 표면용/어두운 표면용 **두 개가 필요하다.** 한 토큰으로 퉁치면 다크 화면이 그대로 깨진다.
- 포커스링도 같은 문제다. **`#347d8d`는 네이비 위에서 2.82로 비텍스트 3:1을 못 넘는다.** 지금 `.tracking-screen`에서 키보드 포커스가 사실상 안 보인다. `--focus-on-dark`가 필요하다. **포커스 아웃라인은 제거하지 않는 것만으로 부족하고, 보이는지까지 확인해야 한다.**

기존 `--line #dde2dc`(1.21/1.31)는 **장식 전용으로 강등**하고, 폼 필드·카드처럼 경계 자체가 정보인 곳은 `--line-strong`을 쓴다. 다만 `--line-strong`을 전부에 쓰면 화면이 무거워지므로 규칙을 나눈다: **입력 가능한 것 = `--line-strong`, 읽기만 하는 것 = `--line`.**

`--muted` → **`--muted-strong`(밝은 표면) / `--muted-on-dark`(네이비 표면)** 치환 한 번으로 **미달 60개 중 46개(77%)가 해소된다.** 남는 14개는 개별 처리:

| 남는 항목 | 조치 |
| --- | --- |
| `.tab-bar button` 비활성 2.66 | `--muted-strong`(5.19). **비활성/활성 구분은 대비가 아니라 굵기(400↔700) + 아이콘 fill로.** `.dark-tabs`는 `--muted-on-dark` |
| `.tracking-card section>span` 2.21 | 미완료 단계도 읽혀야 한다 → `--muted-strong`. 완료는 `--ink`+700 |
| `.pay-failed>i` 3.24 (white/`#e26b5c`) | 오류색을 `#c0392b`급으로 어둡게(white 대비 5.9) 하거나 아이콘을 `--ink`로 |
| `.main-button small` 4.42, `.handsfree-trigger em` 4.25 (라임 위) | 라임 위 텍스트는 **`--navy` 하나만** 허용(9.76). 회녹색 변형 금지 |
| `.budget-warning button` 4.49 | `--accent`(5.24) |
| `.tracking-card section>span`(2.21) `.starter-list em`(3.59) `.area-chips i`(3.76) `.pay-testing small`(3.81) `.visit-actions .quiet`(4.01) `.memory-strip small`(4.38) `.handsfree-proof small`(4.46) 등 | 전부 `--muted-strong` 또는 `--accent`로 흡수. **해당 하드코딩 색 8종은 삭제한다** |

**색 사용 규칙 (문서화 대상)**
- `--lime` 텍스트는 **`--navy` 배경 위에서만.** 밝은 표면에서 라임은 배경/강조 도형으로만 쓴다(paper 1.25:1).
- `--peach` `--blue` `--yellow`도 동일 — **텍스트 색이 아니라 표면 색이다.**
- 밝은 표면의 텍스트는 `--ink` / `--muted-strong` / `--accent` **세 개뿐**. 그 밖의 하드코딩 색은 신규 금지.

### 2.4 390px 폭 실증 — Ubuntu TTF 실측

컨테이너: `.screen` 좌우 패딩을 17→16px로 정리하면 **390 뷰포트 = 콘텐츠 358px / 375 = 343px / 320 = 288px**.

| 텍스트 | 신규 크기 | 실측 폭 | 배치 가능폭 | 판정 |
| --- | --- | ---: | ---: | --- |
| `Keep your hands free.` | 32px R (ls -.03em ⇒ −20px) | **297px** | 358 / 343 / 288 | 320에서도 통과 |
| 〃 **현행** | 39px R (ls -.055em ⇒ −45px) | **342px** | 343 | **375에서 1px 여유. 이미 한계** |
| `Trail finds gift stops along today's route.` | 13px R | 238px | 358 | 통과 (2행 랩) |
| `HANDS-FREE SOUVENIR TRAVEL` | 10px B + ls .06em | 158 + 26 = **184px** | 358−16(칩 패딩) | 통과 |
| 탭 라벨 최장 `Today` | 10px B | **29.3px** | 44px 타깃 | 통과 |
| W3 4탭 최장 `Ask AI` | 10px B | **30.6px** | 44px | 통과 |
| 탭바 5개 × 44px | — | **220px** | 288 (320뷰포트) | 통과 |
| 추적 스텝 최장 `Collected` | 10px R | **43.3px** | 4열 각 78px (375 기준) | 통과 |
| `Maple butter tin` | 15px B | **117.6px** | `1fr` ≈ 201px | 통과 |
| `Sweet Bee Provisions · 4 min walk` | 12px R | **182.6px** | 201px | 통과 |
| `CAD $128` | 13px B | **60.0px** | `auto` | 통과 |
| `CAD $1,240.00` | 26px B | **177.2px** | 358 | 통과 |
| `Update budget and bag transfer options` | 11px R | **201.0px** | 271px (`.main-button` 내부) | 통과 |
| `Delivery not available in this area` | 15px B | **239.8px** | 358 | 통과 |
| `Waiting to sync · 3 changes` | 11px B | **140.6px** | 358 | 통과 (W7 동기화 칩 대비) |
| `PARTNER DROP-OFF · SEALED` | 10px B + ls | **146 + 25 = 171px** | 358 | 통과 |
| **`Standard · fragile · chilled`** | **13px B** | **149px** | `.handsfree-proof` 2열 내부 **128px** | **초과** |

**폭 검증 결론: 1건만 안 들어간다.**

`.handsfree-proof`는 `grid-template-columns:1fr 1.2fr` + `b{white-space:nowrap}`이다. 조치 두 가지, 둘 다 필요:
- `.handsfree-proof b{white-space:nowrap}` **삭제** — 이 nowrap이 랩을 막아 오버플로를 만든다.
- 카피 단축: `Standard · fragile · chilled` → **`Fragile · chilled`** (13px B = 95px, 통과). 3중 나열은 값이 아니라 목록이므로 `em` 줄로 내리는 게 정보구조상 맞다.

부수 조치: `.starter-list small{max-width:230px}` 삭제 → `min-width:0` + `text-overflow:ellipsis`로 대체(고정 px max-width는 반응형에서 항상 틀린다).

### 2.5 정보 밀도 검증 — 세로

밀도가 실제로 유지되는지가 이 제안의 핵심 리스크다. 세 블록을 산출했다.

**A. `.home-hero` (히어로)**

| | 현행 | 신규 |
| --- | ---: | ---: |
| 패딩 상 | 24 | 24 |
| `.ai-orbit` (칩) | 18 + mb17 | 28 + mb16 |
| eyebrow `p` | 8.4 + mb8 | 13 + mb8 |
| `h1` 2행 | 39×0.96×2 = 74.9 + mb13 | 32×1.02×2 = 65.3 + mb12 |
| 리드 `span` 2행 | 10×1.55×2 = 31 | 13×1.5×2 = 39 |
| 패딩 하 | 19 | 20 |
| **합계** | **213px** | **225px** |

**+12px (+5.6%).** 본문 10→13px, 라벨 7→10px로 올리고도 히어로 높이는 사실상 그대로다. h1을 39→32로 내린 것이 상승분을 상쇄한다.

**B. `.product-list article` (상품 카드)**

현행 내부 콘텐츠 산출 66.6px, 그런데 `min-height:96px`가 이미 걸려 있다.
신규 내부 콘텐츠 산출: 라벨10(12) + h2 15(18) + p 12(14.4) + em 11(13.2) + 마진 14 + 패딩 22 = **92.6px**.

**기존 `min-height:96px` 안에 그대로 들어간다. 증가 0px.** 이 카드는 지금 32px를 빈 공간으로 낭비하고 있었다.

**C. `.handsfree-proof article` (근거 카드)**

현행 45.6 → 신규 64.8. **+19px (+42%).** 이건 실제 비용이다. 완화:
- 3층(small/b/em) 구조를 2층(라벨 10px + 값 13px)으로 축약. `em`의 내용은 값 줄에 병합하거나 삭제.
- 2층으로 줄이면 신규 = 12+2+15.6+20 = **49.6px**, 현행 대비 **+4px**.

**밀도 결론.** 3층 리스트 아이템(`small`/`b`/`em` 패턴)이 유일한 실질 비용이다. 이 패턴은 `.handsfree-proof` · `.handling-list` · `.bag-selector header` · `.shop-summary` · `.journey-card` · `.trip-history` · `.suggestion-chip` 등 **14곳**에서 반복된다.

**제안: 3층 → 2층 원칙.** 라벨(10px 대문자) + 값(13px) 두 층으로 통일하고, 세 번째 층(`em`)은 (a) 값 줄에 `·`로 병합하거나 (b) 삭제한다. 이건 밀도 손실이 아니라 **밀도 정리다** — 지금 세 번째 층 대부분은 값의 반복이거나 장식이다. 예: `.handsfree-proof`의 `ALONG YOUR ROUTE / 3 local stops / Only +13 min` → `ALONG YOUR ROUTE / 3 stops · +13 min`.

---

## 3. 레이아웃 전환 방안

### 3.1 목표 구조

```
현행:  main.stage (회색 무대) > section.phone (390×844 액자) > div.screen (스크롤) + nav.tab-bar + .home-indicator
신규:  body > div.app (100dvh 그리드) > header.app-header + main.screen (스크롤) + nav.tab-bar
```

`.stage`/`.phone`은 **globals.css에서 삭제하지 않고 `/workflow` 전용으로 격리**한다. `/workflow`는 이미 자기 CSS(`app/workflow/workflow.css`)에 `.wf-phone`을 별도로 갖고 있으므로 실제로는 **globals의 `.stage`/`.phone`을 그냥 삭제해도 `/workflow`는 안 깨진다.** 확인했다. 다만 `/workflow`의 쇼케이스 성격을 강화하려면 `.wf-phone` 쪽에 상태바 목업을 옮겨 붙인다.

### 3.2 CSS 전략

```css
html{background:var(--paper);-webkit-text-size-adjust:100%}
body{margin:0;min-height:100dvh;background:var(--paper);color:var(--ink);font-family:"Ubuntu",sans-serif;font-size:var(--fs-body)}
.app{min-height:100vh;min-height:100dvh;display:grid;grid-template-rows:auto 1fr auto;max-width:var(--app-max);margin-inline:auto;position:relative;background:var(--paper)}
.screen{overflow-y:auto;overscroll-behavior:contain;padding:var(--sp-4) var(--sp-4) var(--sp-6);padding-top:calc(var(--sp-4) + env(safe-area-inset-top))}
.tab-bar{position:sticky;bottom:0;z-index:7;display:flex;justify-content:space-between;gap:var(--sp-1);padding:var(--sp-2) var(--sp-4);padding-bottom:calc(var(--sp-2) + env(safe-area-inset-bottom));padding-left:calc(var(--sp-4) + env(safe-area-inset-left));padding-right:calc(var(--sp-4) + env(safe-area-inset-right));background:color-mix(in srgb,var(--paper) 92%,transparent);border-top:1px solid var(--line-strong);backdrop-filter:blur(12px)}
.tab-bar button{flex:1;min-width:44px;min-height:44px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border:0;background:transparent;color:var(--muted-strong);cursor:pointer}
```

핵심 다섯 가지:

1. **`100vh` → `100dvh` 이중 선언 (순서 중요).** `vh`를 먼저 쓰고 `dvh`로 덮는다. `dvh` 미지원 브라우저는 `vh`로 폴백하고, 지원 브라우저는 주소창 축소/확장 시 레이아웃이 점프하지 않는다. **순서를 뒤집으면 폴백이 최종값이 되어 의미가 없다.**
2. **`position:absolute` 13곳을 `sticky`/`fixed`/`grid`로 재배치.** 이게 전환 작업의 실질 난이도다:
   - `.tab-bar` → `position:sticky;bottom:0` (그리드 3행 중 마지막)
   - `.status-bar` / `.home-indicator` → **삭제**
   - `.chat-input{position:absolute;bottom:80px}` → `.app` 그리드의 마지막 행 위 `sticky;bottom:0`, `bottom:80px` 하드코딩 제거. `.attachment-chip{bottom:136px}`도 같이 — 이 두 값은 탭바 76px에 종속된 마법의 상수다
   - `.modal-backdrop{position:absolute;inset:0}` → `position:fixed;inset:0` (뷰포트 기준으로 바뀌어야 스크롤 중에도 덮는다)
   - `.app-toast{position:absolute;bottom:88px}` → `position:fixed;bottom:calc(var(--tab-h) + env(safe-area-inset-bottom) + 12px)`
3. **safe-area 활성화 선행.** `app/layout.tsx`의 `viewport`에 `viewportFit:"cover"`를 넣기 전까지 `env(safe-area-inset-*)`는 전부 0이다. 이 한 줄이 없으면 나머지 safe-area 작업이 전부 무의미하다. 동시에 `maximumScale:1` 삭제(핀치줌 허용).
4. **`--app-max` 브레이크포인트**
   ```
   기본(≤599)      --app-max: 100%          내용폭 = 뷰포트
   ≥600 (태블릿 세로) --app-max: 560px         중앙 정렬, 좌우에 --soft 배경
   ≥900 (태블릿 가로) --app-max: 720px + 2열 리스트 (§3.3)
   ≥1200 (데스크톱)  --app-max: 1040px + 사이드 내비 (§3.3)
   ```
5. **`overflow:hidden` 제거.** `.phone{overflow:hidden}`이 사라지면 200% 확대 시 잘리는 대신 스크롤된다. 이게 200% 확대 대응의 실체다. 추가로 고정 `height:px` 54개 중 **텍스트를 담는 것만** `min-height`로 전환(아이콘/장식용 정사각형은 그대로 둔다).

### 3.3 태블릿·데스크톱 — 여백만 늘리지 않는다

| 뷰포트 | 내비 | 본문 | 밀도 조정 |
| --- | --- | --- | --- |
| ≤599 | 하단 탭바 (sticky) | 1열 | 기본 |
| 600–899 | 하단 탭바 유지 | 1열 560px | 카드 패딩 +4, 3층 리스트에서 `em` 복원 허용 |
| 900–1199 | **좌측 세로 레일 (아이콘+라벨, 폭 88px)** | 720px, **카드 리스트 2열** | `.product-list`/`.starter-list`를 `repeat(auto-fill,minmax(280px,1fr))` |
| ≥1200 | 좌측 레일 + **우측 고정 패널 320px (Trip Wallet + 오늘의 다음 액션)** | 중앙 640px | 지갑을 스크롤에서 빼내 상시 노출 |

**≥1200의 우측 패널은 W2(3버킷 지갑)의 정보를 상시 노출하는 자리다.** 데스크톱을 "여백 넓은 폰"으로 두면 W2에서 다시 만든다. 지금 자리만 잡아둔다(빈 컬럼 + `aside` 마크업).

BUILD_PLAN "결정 대기 4번(데모 화면이 노트북인지 폰인지)"은 이 설계를 **막지 않는다**. 900/1200 레이어는 순수 가산이고, 결정이 늦어도 나중에 붙일 수 있다. (→ §6 이견 7)

### 3.4 안 깨지게 하는 순서

액자 제거는 "규칙 6개 지우기"가 아니라 **포함블록이 바뀌는 작업**이다. 순서를 지키지 않으면 오버레이 6개가 동시에 튄다.

```
1. viewportFit:"cover" 추가 + maximumScale 삭제        (layout.tsx, 2줄)
   → 이 시점에 기존 env() 4곳이 처음으로 살아난다. 여기서 하단 여백 변화를 먼저 확인
2. .app 래퍼 도입. .stage/.phone은 남겨둔 채 .app을 병렬로 추가하고
   page.tsx / login / onboarding 세 곳의 최상위만 교체         (3파일, 각 1줄)
3. .status-bar / .home-indicator 마크업+CSS 삭제           (여기서 상단 43px 패딩 재계산)
4. position:absolute 6개(.tab-bar .chat-input .attachment-chip .modal-backdrop .app-toast) 재배치
   → 각각 단독 커밋. 여기가 유일한 회귀 위험 구간
5. .stage/.phone 및 @media(max-width:520px) 블록 삭제
6. 브레이크포인트(600/900/1200) 추가
```

2번에서 `.app`을 **병렬로 추가**하는 게 요점이다. `.phone`을 지우고 시작하면 3~5번이 전부 동시에 깨진 상태에서 디버깅해야 한다.

---

## 4. 아이콘 전환

### 4.1 전수 목록 (`app/**/*.tsx`, 82회 / 15종)

| 글자 | U+ | 회수 | 쓰이는 곳 | 스크린리더 낭독 | 의도 |
| --- | --- | ---: | --- | --- | --- |
| `→` | 2192 | 40 | 버튼 후미, 워크플로 화살표 | "오른쪽 화살표" 또는 무시 | 진행 |
| `✦` | 2726 | 10 | AI 마커(`.ai-orbit` `.chat-status` `.message.ai` `.review-intro .spark` `.ai-memory-card`), **탭바 Ask** | "네 꼭짓점 별" | Trail AI |
| `✓` | 2713 | 9 | 완료 상태, 저장됨, 배송 단계 done | "체크 표시" | 완료 |
| `▣` | 25A3 | 8 | 가방/이송, **탭바 Bags**, transfer-chip, 취급=Standard | "속 채운 사각형" | 가방·이송 |
| `⌁` | 2301 | 4 | 경로, **탭바 Shop**, workflow-link | **낭독 안 됨** | 경로 |
| `⌄` `⌃` | 2304/2303 | 5 | select 표시, 아코디언 개폐 | 낭독 안 됨 | 펼침/접힘 |
| `＋` | FF0B | 3 | 첨부 버튼, 지역 추가 | "전각 플러스" | 추가 |
| `❄` | 2744 | 3 | **취급=Chilled** (냉장) | "눈송이" | 냉장 취급 |
| `✎` | 270E | 2 | 편집 가능 필드 표시 | "연필" | 편집 |
| `◇` | 25C7 | 2 | **취급=Fragile** (파손주의) | "마름모" | 파손주의 |
| `⌂` | 2302 | 2 | **탭바 Today**, 호텔 주소 필드 | 낭독 안 됨 | 홈/호텔 |
| `◎` | 25CE | 2 | **탭바 Trips**, 동행자 필드 | "동심원" | 여행/사람 |
| `←` | 2190 | 1 | 뒤로가기 (`aria-label` 있음) | | 뒤로 |
| `↑` | 2191 | 1 | 전송 (`aria-label` 있음) | | 전송 |
| `↺` | 21BA | 1 | 재시도 | "반시계 원호 화살표" | 재시도 |
| `⌖` | 2316 | 1 | 현재 여행 위치 | 낭독 안 됨 | 위치 |
| `›` | 203A | 1 | 리스트 진입 | | 진입 |

**가장 위험한 셋**: `❄`(냉장) · `◇`(파손) · `▣`(표준)는 **가방 취급 등급을 표현하는 유일한 시각 신호**다. 스크린리더는 "눈송이/마름모/속 채운 사각형"으로 읽는다. `.handling-list`의 텍스트 라벨은 5px다. 즉 **취급 등급은 시각적으로도 청각적으로도 전달되지 않는다.** 안전 관련 정보다.

`⌂ ⌁ ⌄ ⌖`는 아예 낭독되지 않는다 — **탭바 5개 중 3개(Today/Shop/Trips)의 아이콘이 무음**이고, 라벨은 5.5px다.

### 4.2 대체안 — 인라인 SVG 스프라이트

외부 CDN 금지, 아이콘 폰트 금지(폰트 로딩 실패 시 두부 글자), 이모지 금지. 남는 선택은 두 가지고 스프라이트를 택한다.

```
public/icons.svg            <svg><symbol id="i-home" viewBox="0 0 24 24">…</symbol>…</svg>
app/icon.tsx                export function Icon({name,size=20}:{name:IconName;size?:number}){
                              return <svg className="icon" width={size} height={size} aria-hidden focusable="false"><use href={`/icons.svg#i-${name}`}/></svg>;
                            }
```

- **`<use href>` 외부 참조**를 쓰면 스프라이트가 브라우저 캐시에 한 번만 들어가고 페이지 HTML이 무거워지지 않는다. 단 첫 렌더에 한 프레임 늦게 뜬다.
- 오프라인이 중요한 앱이므로 **W7에서 서비스워커 프리캐시 목록 1순위에 `/icons.svg`를 넣는다.** 그 전까지는 앱 셸이 오프라인일 때 아이콘이 안 뜬다 — W7 전에는 `layout.tsx`에서 스프라이트를 인라인으로 주입하는 것도 대안(약 3KB).
- `stroke:currentColor;fill:none;stroke-width:1.75;stroke-linecap:round` 통일. 색은 CSS가 결정한다.
- 아이콘 기본 20px, 탭바 24px, 히어로 28px. **3사이즈만** 허용.

### 4.3 심볼 목록 (17개)

`home` `sparkle`(AI) `route` `bag` `trips` `check` `chevron-down` `chevron-right` `chevron-left` `arrow-right` `arrow-up` `plus` `pencil` `refresh` `pin` `snowflake`(냉장) `fragile`(깨진 잔)

`snowflake`/`fragile`/`bag`은 **국제 물류 픽토그램 관례**를 따른다(깨진 잔 = fragile, 눈결정 = keep refrigerated). 여행자가 매장에서 본 포장 표기와 같은 그림이어야 한다.

### 4.4 접근성 처리 규칙

| 상황 | 처리 |
| --- | --- |
| 아이콘 + 옆에 텍스트 라벨 (탭바, 리스트) | `<Icon aria-hidden/>` + 보이는 텍스트. **추가 aria 금지** |
| 아이콘만 있는 버튼 (뒤로, 전송, 첨부, 시트 닫기) | `<button aria-label="…">` + `<Icon aria-hidden/>` |
| 상태를 나타내는 아이콘 (취급 등급, 배송 단계 done) | `<Icon aria-hidden/>` + `<span class="visually-hidden">Fragile</span>` — **`.visually-hidden`은 globals에 이미 있다** |
| 순수 장식 (`✦` 히어로 스파클, 구분 `─`) | `aria-hidden`, 대체 텍스트 없음 |
| 토글 | `role="switch"` + `aria-checked` — 현재 1곳만 적용됨(`page.tsx`에 `role="switch"` 1회). 메모리 동의·`forceFail`·핸즈프리 전환에 확대 |
| 토스트 | `role="status"` — **이미 적용됨. 유지** |
| 포커스 | `outline:3px solid var(--focus);outline-offset:2px` — **현행 규칙 유지, 절대 제거 금지.** `.tab-bar button`처럼 `background:transparent`인 곳은 `outline-offset:-2px`로 잘림 방지 |

**병행 필수 수정**: `<section className="phone" aria-live="polite">`의 `aria-live` **삭제**. 화면 전체가 라이브 리전이면 화면 전환마다 전체 콘텐츠가 낭독된다. 화면 전환 안내는 `.screen`에 `tabIndex={-1}` + 전환 시 `focus()` + `<h1>` 제목으로 처리하고, 라이브 리전은 토스트(`role="status"`)와 오프라인/동기화 칩만 갖는다.

---

## 5. 작업 순서와 크기

### W0a — 뷰포트 섀시 (**S**, 반나절)

| # | 파일 | 작업 | 크기 |
| --- | --- | --- | --- |
| a1 | `app/layout.tsx` | ~~`viewportFit:"cover"` 추가 · `maximumScale:1` 삭제~~ **(2026-08-15 다른 트랙에서 이미 반영됨 — 확인함)** · **Figma CDN `<script>` 삭제는 아직 남아 있다** | S |
| a2 | `app/globals.css` | `.app` 그리드 래퍼 추가 (`.stage`/`.phone`은 아직 유지) | S |
| a3 | `app/page.tsx` · `app/login/page.tsx` · `app/onboarding/new-trip-form.tsx` | 최상위를 `.stage>.phone` → `.app`으로. **`aria-live="polite"` 삭제** | S |
| a4 | `app/globals.css` · `app/page.tsx` | `.status-bar` · `.home-indicator` 삭제 | S |
| a5 | `app/globals.css` · `app/handsfree.css` | `position:absolute` 6개 재배치 (탭바·chat-input·attachment-chip·modal-backdrop·app-toast) — **각각 단독 커밋** | M |
| a6 | `app/globals.css` | `.stage`/`.phone`/`@media(max-width:520px)` 삭제 · 600/900/1200 브레이크포인트 추가 | S |

W0a는 화면 로직·카피·컴포넌트를 **전혀** 건드리지 않는다. 되돌리기도 쉽다.

### W0b — 토큰 확정 (**S**, 반나절) ← **이게 진짜 선행 항목이다**

| # | 파일 | 작업 | 크기 |
| --- | --- | --- | --- |
| b1 | `app/globals.css` `:root` | `--fs-*` 9개 · `--lh-*` · `--sp-1..8`(4px 배수) · `--muted-strong` `--accent` `--accent-on-w` `--line-strong` `--focus` `--tab-h` `--app-max` 추가 | S |
| b2 | `docs/tracks/W0-design.md` | 스케일·색 사용 규칙 확정 (본 문서 §2가 그 명세) | — |

**b1이 끝나는 순간 W3·W4의 새 화면은 새 스케일 위에 작성할 수 있다.** 액자가 아직 남아 있어도 상관없다.

### W0c — 아이콘 (**M**, 1일)

| # | 파일 | 작업 | 크기 |
| --- | --- | --- | --- |
| c1 | `public/icons.svg` · `app/icon.tsx` | 스프라이트 17개 + `<Icon>` 컴포넌트 | M |
| c2 | `app/page.tsx` | 유니코드 82회 치환 + `aria-label` / `.visually-hidden` 부착 | M |
| c3 | `app/login/page.tsx` · `app/onboarding/new-trip-form.tsx` | 동일 | S |
| c4 | `app/globals.css` | `.icon` 규칙 · `i{font-size}` 아이콘용 선언 12개 정리 | S |

### W0d — 타이포·타깃 적용 (**L**, 3–4일)

파일 단위로 쪼갠다. **`page.tsx`가 아니라 CSS 파일 단위**로 커밋해야 리뷰가 가능하다.

| # | 파일 | 선언 수 | 작업 | 크기 |
| --- | --- | ---: | --- | --- |
| d1 | `app/login/login.css` | 11 | 가장 작다. **여기서 스케일을 실증하고 스크린샷으로 합의** | S |
| d2 | `app/onboarding/onboarding.css` | 10 | | S |
| d3 | `app/profile.css` | 26 | `.trip-history`·`.ai-memory-card`. **단, W3에서 `profile` 해체 예정 — §6 이견 4 참조** | M |
| d4 | `app/handsfree.css` | 63 | `.handling-list`·`.bag-selector`·`.simulation-badge` 등 안전 정보 밀집 구역. **최우선** | L |
| d5 | `app/globals.css` | 123 | 3층→2층 축약 14곳 포함 | L |
| d6 | 전 CSS | — | 터치 타깃 35개를 44px로. `.text-action`·`.round-button`·`.tab-bar button`·체크박스/라디오 우선 | M |
| d7 | 전 CSS | — | `--muted` → `--muted-strong` 치환(미달 46개 일괄 해소) · 잔여 14개 개별 처리(§2.3 표) | M |
| d8 | 전 CSS | — | 고정 `height:px` 54개 중 텍스트 컨테이너를 `min-height`로 · `max-width:px` 7개 제거 | M |

### W0e — 검증 (**S**)

`npm run build` · `npm run lint` · `npm test` + **실제 뷰포트 375 / 768 / 1280 캡처**. 추가로 320px(최소)과 **375px @ 200% 확대**를 반드시 본다 — 후자가 고정 height 54개의 실질 테스트다.

### 합계

**S×3 + M×4 + L×2 ≈ 6–8일.** BUILD_PLAN의 "M"과는 두 배 이상 차이 난다.

---

## 6. 계획에 대한 이견

### 이견 1 — "액자 안이라 성립하던 값"은 사실이 아니다 (사실관계 정정)

> BUILD_PLAN W0: "현재 5.5px 탭 라벨·6px 캡션은 액자 안이라 성립하던 값이라 액자를 걷으면 읽히지 않는다."

두 군데가 틀렸다.

1. `.phone{width:390px}`에는 **`transform:scale`도 `zoom`도 없다.** 전 CSS를 검색했다 — 0건. 액자 안 5.5px은 화면 위에서 그냥 5.5px이다. 액자는 텍스트를 축소해 보여준 적이 없다.
2. `@media(max-width:520px)`가 **이미** `.phone{width:100%;height:100svh;border:0;border-radius:0}`으로 액자를 걷는다. 즉 **실기기 375px에서는 지금 이 순간 액자가 없고 5.5px 라벨이 그대로 렌더된다.**

**따라서 "액자를 걷으면 읽히지 않는다"가 아니라 "이미 읽히지 않는다"다.** 이건 말꼬리가 아니라 우선순위를 바꾸는 사실이다 — 타이포 문제는 액자 제거에 **종속된 후속 작업이 아니라, 액자와 무관하게 이미 프로덕션에서 터져 있는 접근성 결함**이다. 액자 제거가 미뤄져도 타이포는 미룰 이유가 없다.

### 이견 2 — W0을 하나의 M으로 묶은 건 과소평가다

측정치: font-size 233개 중 196개 수정 대상, 터치 타깃 35개, 하드코딩 hex 141종, 4px 그리드 준수율 24%, `position:absolute` 13개 재배치, 유니코드 아이콘 82회, CSS 파일 5개 전부 + TSX 3개.

**M(1–2일)이 아니라 L(6–8일)이다.** 그리고 성격이 다른 두 작업이 한 트랙에 묶여 있다:
- 액자 제거 = **구조 작업.** 규칙 ~10개, 화면 로직 무관, 되돌리기 쉬움 → **S**
- 타이포·타깃·색 = **전수 작업.** 5개 파일 전면, 화면마다 눈으로 확인해야 함 → **L**

묶어두면 "W0 완료" 판정이 불가능하다. §5처럼 W0a~W0e로 쪼갤 것을 제안한다.

### 이견 3 — "새 화면을 옛 액자 안에 만들면 전부 다시 만든다"는 절반만 맞다

액자는 **컨테이너 하나**다. 새 화면이 `.screen` 안에 들어가는 한, 액자를 걷어도 그 화면의 마크업은 한 줄도 안 바뀐다. 실제로 다시 만들게 되는 건 액자가 아니라 **타이포 스케일**이다 — 새 화면을 6px 라벨로 작성하면 그 화면만큼 재작업이 늘어난다.

**즉 진짜 선행 항목은 액자 제거가 아니라 스케일 토큰 확정이다.** §5의 W0b(반나절)만 먼저 박으면, 액자가 남아 있어도 W3·W4가 그 위에 쌓인다. 이게 W0 전체를 다른 트랙의 선행으로 걸어 병목을 만드는 것보다 훨씬 싸다.

**수정 제안:**
```
BUILD_PLAN:  W0(전부) → W3 → W7
제안:        W0b(토큰, 반나절) → W0a(섀시, 반나절) ─┬→ W3 (새 스케일로 작성)
                                                    └→ W0d (잔존 화면 정리, W3과 병렬)
```

### 이견 4 — W0d를 W3 앞에 통째로 두면 두 번 일한다

W3은 5탭 → 4탭, 선형 3화면(picks/shop/drop) → 인페이지 `Gifts|Map|Budget|Delivery`다. 즉 `globals.css`의 상당 부분이 **재배치되거나 삭제된다.** BUILD_PLAN §1.4는 `profile` 해체도 명시한다.

`app/profile.css`(26개 선언)와 `globals.css`의 `.picks`/`.shop`/`.drop` 계열을 W0d에서 전부 손보고 W3에서 그 화면들을 해체하면 **그 작업은 버려진다.**

**요청**: product-lead에게 **W3 폐기 예정 클래스 목록**을 받아야 한다. 그 목록에 있는 클래스는 W0d에서 건드리지 않는다. 목록이 안 나오면 W0d는 `handsfree.css`(d4, 안전 정보 밀집)와 `login`/`onboarding`(d1/d2, W3 영향 없음)만 하고 `globals.css`/`profile.css`는 W3 이후로 미룬다.

### 이견 5 — BUILD_PLAN에 없는 차단 항목 4개

W0 정의에 반드시 추가되어야 한다. 넷 다 **한 줄~몇 줄**인데 넷 다 차단급이다.

| # | 항목 | 현상 | 영향 |
| --- | --- | --- | --- |
| 1 | `app/layout.tsx` `maximumScale:1` | 핀치줌 차단 | **WCAG 1.4.4 실패.** 5px 글자를 확대해서 볼 수단마저 막았다. 사실상 이 앱에서 가장 심한 접근성 결함. **→ 2026-08-15 수정 반영 확인** |
| 2 | `viewportFit` 미설정 | `env(safe-area-inset-*)` 4곳이 **전부 0으로 계산** | BUILD_PLAN은 safe-area를 "추가할 일"로 적었지만 실제로는 **이미 쓴 코드가 죽어 있었다**. **→ 2026-08-15 `viewportFit:"cover"` 반영 확인.** 이제 기존 `max(43px,env(safe-area-inset-top))`·`max(21px,env(safe-area-inset-bottom))`가 처음으로 살아나므로, **노치 기기에서 상하 여백이 갑자기 늘어난 것처럼 보인다.** W0a는 이 상태를 기준선으로 삼아야 한다 |
| 3 | `.phone` `aria-live="polite"` | 화면 전체가 라이브 리전 | 화면 전환마다 전체 콘텐츠 낭독. 스크린리더로 이 앱은 사용 불가다 |
| 4 | `layout.tsx` head의 `https://mcp.figma.com/mcp/html-to-design/capture.js` | 매 요청 외부 CDN 스크립트 | **"외부 CDN을 추가하지 않는다" 규칙 위반.** 프로덕션에 피그마 캡처 스크립트가 들어가 있다. 렌더 블로킹 + 프라이버시 |

### 이견 6 — "결정 대기 3: 뷰포트 전환 때 다크 테마도 함께 갈지" → **함께 가면 안 된다**

하드코딩 hex가 141종이다. 토큰화 전에 다크를 얹으면 **141종을 두 벌 만든다.** 순서는 하나뿐이다:

```
색 토큰화(W0d7) → prefers-color-scheme (W7 이후)
```

W0에서는 `@media(prefers-color-scheme:dark){:root{ /* 미정 */ }}` 훅만 남기고 실제 팔레트는 만들지 않는다. **다크 팔레트를 지금 그리면 W0가 L에서 XL이 된다.**

참고로 다크 전환 시 재검토가 필요한 토큰은 `--lime`이다. 라임은 밝은 표면에서 이미 못 쓴다(흰 배경 1.36:1). 다크에서는 반대로 유일한 강조색이 된다 — `--lime`/`--navy` 9.76:1. 즉 **다크가 오히려 현재 팔레트에 더 맞다.** 그래도 순서는 토큰화가 먼저다.

### 이견 7 — "결정 대기 4: 데모 화면이 노트북인지 폰인지" → W0 착수를 막지 않는다

`max-width` 중앙 정렬은 어느 쪽이든 성립한다. 900/1200 레이어(2열, 사이드 레일, 우측 지갑 패널)는 **순수 가산**이라 나중에 붙여도 이미 만든 것을 안 버린다. **이 결정을 기다리느라 W0를 미루지 말 것.**

다만 데모가 노트북이면 §3.3의 ≥1200 우측 패널이 시연에서 가장 크게 먹히는 화면이 된다(지갑 상시 노출 = "우리는 예산을 실시간으로 관리한다"가 한 화면에 보인다). 결정이 "노트북"으로 나면 그 레이어를 W3에 포함시킬 것을 제안한다.

### 동의하는 부분

- **W0을 W1(데이터 정합)과 병렬로 여는 것**은 옳다. 겹치는 파일이 없다.
- **폰 목업을 `/workflow`에만 남긴다**는 결론은 옳고, 실행도 쉽다 — `/workflow`는 이미 자체 CSS의 `.wf-phone`을 쓰므로 globals의 `.stage`/`.phone`을 삭제해도 안 깨진다.
- **"뷰포트 전환은 타이포 재조정과 한 묶음"**이라는 판단 자체는 결과적으로 맞다. 다만 이유가 다르다 — 액자 때문이 아니라, 액자를 걷는 커밋에서 상하 패딩(43/103)과 탭바 높이(76)를 재계산하는데 그 값이 폰트 크기에 종속되기 때문이다.

---

## 7. W7(PWA)로 넘길 시각 명세 — 미리 확정해둘 것

W0에서 만들지는 않지만, W0의 토큰이 이걸 지탱해야 하므로 크기·색만 확정한다.

| 항목 | 명세 |
| --- | --- |
| 매니페스트 | `display:standalone` · `theme_color:#12343d`(=`--navy`) · `background_color:#f5f6f1`(=`--paper`) · `start_url:/` |
| 아이콘 | 192/512 + maskable 512. 마크는 `.brand>span`의 라임-온-네이비 각진 모서리(9/9/9/3) 도형을 그대로 승격 |
| 스플래시 | `--paper` 바탕 + 중앙 마크. **애니메이션 없음**(`prefers-reduced-motion` 예외 처리 불필요하게) |
| 오프라인 화면 | `--paper` 바탕. 아이콘 없이 32px 제목 + 13px 본문. **"오프라인이지만 QR 패스와 오늘의 경로는 그대로 씁니다"** — 이게 이 앱의 오프라인 화면이 말해야 할 유일한 문장 |
| **동기화 대기 칩** | 상단 sticky, `--yellow` 배경 / `--ink` 텍스트 (9.16:1 상당). 11px B `Waiting to sync · 3 changes` = **실측 140.6px, 358px 안에 여유**. `role="status"` + `aria-live="polite"` |
| **오프라인 배지** | 탭바 위 sticky, `--blue` 배경 / `--navy` (8.27:1). 아이콘 없이 텍스트만 — 오프라인에서 스프라이트가 안 뜰 수 있으므로 **오프라인 표시 자체는 SVG에 의존하면 안 된다** |
| QR 패스 | 오프라인에서도 떠야 하므로 `<img>`가 아니라 인라인 SVG 또는 캔버스. 배경 반드시 `#ffffff` 실색(투명 금지 — 다크 대응 시 스캔 실패) |
| 설치 프롬프트 | `beforeinstallprompt` 후킹, Account에 `Install Trail` 행. 자동 모달 금지 |

**오프라인 표시가 SVG 스프라이트에 의존하면 안 된다**는 점이 §4.2의 캐시 전략과 직결된다. 매장 안에서 신호가 끊긴 상태가 이 앱의 정상 상태다.
