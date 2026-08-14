# W3 4탭 IA 전환 · W7 웹앱(PWA) — 앱 트랙 상세

담당: app-engineer · 작성 2026-08-15
선행 문서: `docs/BUILD_PLAN.md`(트랙 분할) · `docs/APP_SPEC.md` §1.1~1.6(IA 확정), §2(화면 명세), §6(순서)
대상 코드: `app/page.tsx`(210줄 / 48KB 단일 상태머신) · `app/layout.tsx` · `app/onboarding/` · `app/login/` · `middleware.ts`

이 문서는 **어떻게 쪼갤 것인가**만 다룬다. 화면의 내용·카피·상태분기는 APP_SPEC이 진실원본이고 여기서 다시 정의하지 않는다.

---

## 0. 결론 먼저

1. **라우트 기반으로 간다.** 단일 페이지 유지는 불가. 근거는 §2.
2. **W0의 "액자 걷어내기"는 W3의 선행이 아니라 W3의 첫 커밋이다.** 셸을 두 번 만들지 않으려면 합쳐야 한다. 근거는 §6.
3. **W7은 하나의 트랙이 아니다.** manifest/설치/오프라인 셸(W3와 병렬 가능) · 서비스워커 캐시(W3 이후) · 오프라인 QR 패스(W4 + 아웃박스 이후)로 3등분해서 각각 다른 선행을 붙인다.
4. **인덱스 키(0/1/2)를 새 스토어로 그대로 옮기면 안 된다.** 옮기면 W1에서 스토어를 다시 짠다. W3는 라우트 골격까지만 먼저 가고, 쇼핑·가방 데이터 계약은 W1의 stop UUID를 기다린다.

---

## 1. 현재 상태머신 해부

`app/page.tsx`의 `export default function Home()` 안에 `useState` **31개**, `useMemo` 1개, 파생 지역변수 10개, `useEffect` 2개가 들어 있다. 전수 목록과 4탭 IA에서의 행선지다.

처리 코드: **유지**(클라이언트 로컬 UI 상태로 남음) · **이동**(다른 라우트/컴포넌트의 로컬 상태로) · **공유**(라우트 경계를 넘으므로 클라이언트 스토어로) · **서버**(Supabase가 소유, 화면은 파생) · **폐기**

### 1.1 화면·네비게이션

| 상태 | 현재 역할 | 처리 | 행선지와 근거 |
| --- | --- | --- | --- |
| `screen: Screen` | 9화면 스위치 | **폐기** | URL이 대체한다. `Screen` 유니온 자체가 사라진다 |
| `go(next)` | 화면 전환 + 스크롤 top | **폐기 → 재설계** | `router.push` + §4의 스크롤 정책. 지금처럼 무조건 top으로 리셋하면 탭 왕복마다 매장 안에서 위치를 잃는다 |
| `shopDestination()` | Shop 탭의 조건부 착지 | **이동** | 탭바 컴포넌트 → APP_SPEC §1.2 착지 규칙 함수로. 조건은 서버 상태(plan.status, stops)에서 파생 |
| `bagsDestination()` | Bags 탭의 조건부 착지 | **이동** | 동상 |
| `<nav className="tab-bar">` 5탭 | Today·Ask·Shop·Bags·Trips | **폐기 → 재구성** | 4탭 `Trips · Trail · Ask AI · Bags`. `Today`는 Trail 대시보드로 흡수, `Shop`은 Trail 하위 모드로 강등 |
| `screen === "tracking" ? "dark-tabs"` | 추적 화면만 다크 탭바 | **유지(조건만 이동)** | `/bags/track` 라우트에서 `data-theme`로 |

### 1.2 여행·계정

| 상태 | 처리 | 행선지 |
| --- | --- | --- |
| `trip: Trip` | **서버** | `trips` 행. `/api/state` 하이드레이션 → Trips ▸ Trip detail 폼은 서버값의 draft 사본만 로컬 보유 |
| `areaDraft: string` | **이동** | Trips ▸ Trip detail 폼 로컬 입력. 단 §4의 draft 보존 대상 |
| `expandedTrip: string \| null` | **이동** | Trips ▸ Past trips 아코디언 로컬 UI |
| `pastTrips` (모듈 상수) | **서버** | `trip_insights`. 지금은 `app/page.tsx` 상단 하드코딩 |
| `memoryEnabled: boolean` | **서버** | Account ▸ Memory & privacy. 항목별 동의로 확장(APP_SPEC AC-2) |
| `memoryOpen: boolean` | **이동** | Ask AI의 메모리 시트 로컬 상태 |

### 1.3 계획(brief)

| 상태 | 처리 | 행선지 |
| --- | --- | --- |
| `plan: Plan` | **서버 + 공유** | `plans.status='draft'`. 라우트 경계를 넘는다(Ask AI에서 편집 → Trail ▸ Plan에서 표시) → 클라이언트 스토어 필수 |
| `approvedPlan: Plan \| null` | **서버** | `plans.status='approved'`. 클라이언트 사본은 폐기. `activePlan = approvedPlan ?? plan` 파생만 남긴다 |
| `routeDirty: boolean` | **서버 파생 + 임시 유지** | approved revision ≠ draft revision 비교로 대체. 서버 리비전이 생기기 전(W1 이전)에는 지금 그대로 유지. **이 신호는 절대 지우지 않는다** — 헌법 1번의 승인 후 변경 감지 |
| `updatePlan / applyPatch / clearFields` | **이동** | 스토어 액션. AI patch는 **draft에만** 반영하고 approved는 건드리지 않는 현재 규칙을 그대로 옮긴다 |
| `estimates` (useMemo) | **유지(파생)** | W6에서 실데이터로 교체될 자리. 상태로 만들지 않는다 |

### 1.4 Ask AI

| 상태 | 처리 | 행선지 |
| --- | --- | --- |
| `messages: Message[]` | **서버 + 공유** | `chat_messages`. 로컬은 캐시 |
| `input: string` | **공유** | `/ask` 입력. **탭 전환으로 사라지면 안 된다**(§4) |
| `thinking: boolean` | **공유** | 요청 중 탭을 떠났다 돌아와도 진행 표시가 유지돼야 한다 |
| `suggestion: PlanPatch \| null` | **공유** | 미승인 제안. 탭 왕복으로 날아가면 **승인 게이트 자체가 사라진다**. 스토어 보관 대상 |
| `attachmentName: string` | **이동** | `/ask` 로컬. 업로드는 별도 결정 |
| `sendMessage / submit / startChat` | **이동** | `/ask` 라우트. `startChat(prompt)`의 `setTimeout(50)` 해킹은 라우트 이동 후 쿼리(`/ask?prompt=…`) 또는 스토어 pending prompt로 대체 |

### 1.5 쇼핑·구매 — **인덱스 키 4종이 전부 여기 있다**

| 상태 | 현재 키 | 처리 | 행선지와 위험 |
| --- | --- | --- | --- |
| `purchases: Record<number, Purchase>` | 배열 인덱스 | **서버** | `purchases` 행 + `stops` UUID. **W1 선행** |
| `replacementIds: Record<number, boolean>` | 배열 인덱스 | **폐기** | 대체품은 `stops` 행 교체로 표현. 지금은 `products[index]`가 `replacementIds[index]`에 따라 **같은 인덱스에 다른 상품**이 되고 `purchases[index]`는 그대로 붙어 있다 = 구매 기록이 다른 상품에 붙는다 |
| `savedStops: Record<number, boolean>` | 배열 인덱스 | **서버** | `stops.saved` + `client_op_id`(오프라인 재생 멱등) |
| `selectedBags: Record<number, boolean>` | 배열 인덱스 | **공유 → 서버** | 이송 draft 항목. 선택은 오프라인 로컬, 이송 생성은 온라인(APP_SPEC BG-1) |
| `shoppingStarted: boolean` | — | **폐기(파생)** | `stops` 중 하나라도 `visited/bought`면 쇼핑 중. 별도 플래그는 서버와 어긋난다 |
| `editingPurchase / purchaseDraft / purchaseError` | — | **이동** | 시트 → 전체 화면 `/trail/shop/[stopId]/record`. draft는 localStorage 키 단위 보존(§4) |
| `products` (파생) | — | **서버** | `stores`/`products` 시딩(W6). 지금은 모듈 상수 3+3개 |

### 1.6 이송·결제

| 상태 | 처리 | 행선지 |
| --- | --- | --- |
| `transferStatus: TransferStatus` | **서버** | `bag_transfers.status` |
| `deliveryStep: number` | **폐기** | `transfer_events`에서 파생. `Preview next status` 버튼은 W4에서 폐기 확정 |
| `payMethod: string` | **이동** | `/bags/pay` 로컬 |
| `payStatus / payFailure` | **이동** | `/bags/pay` + `/bags/pay` 실패 상태. 결제는 오프라인 차단이므로 스토어에 올릴 필요 없음 |
| `paymentRef: string` | **서버** | `payments` 행 |
| `forceFail: boolean` | **폐기(개발 전용)** | 제품 화면에서 제거. 개발용 쿼리 플래그 또는 dev API로 분리 |

### 1.7 전역·인프라

| 상태 | 처리 | 행선지 |
| --- | --- | --- |
| `toast: string` + `notify()` | **공유** | `(app)/layout.tsx`의 토스트 리전. 라우트가 바뀌어도 살아 있어야 한다 |
| `hydrated: boolean` | **유지(강화)** | 하이드레이션 게이트. PWA에서 캐시 스냅샷과 서버 응답이 갈리므로 오히려 더 필요해진다 |
| `saveDeviceState()` + `localStorage["trail-v3-state"]` | **폐기 → 캐시로 강등** | 지금은 **모든 상태를 한 덩어리 JSON**으로 저장한다. 부분 갱신·충돌 해소·멱등 재생이 불가능해서 아웃박스와 정면으로 충돌한다. 스냅샷 캐시(`trail:snapshot`)와 아웃박스(IndexedDB)로 분리 |
| `<section className="phone" aria-live="polite">` | **폐기** | 화면 전체가 라이브 리전이라 전환마다 전체를 다시 읽는다. 라우트 전환 시 제목 포커스 이동 + 국소 `role="status"`로 대체 |
| `Header` / `Toggle` / `Brand` | **이동** | `components/`로 추출. `Toggle`은 이미 `role="switch"` + `aria-checked` 준수 — 그대로 보존 |

### 1.8 파생값 — 상태로 만들지 말 것 (현행 유지)

`activePlan` · `products` · `boughtEntries` · `spent` · `bagCount` · `remaining` · `selectedBagCount` · `tripDates` · `estimates`.
전부 렌더 시 계산이고 그대로 둔다. 단 두 가지를 W2에서 고친다.

- `remaining = activePlan.budget - spent` → **`쇼핑 가능액 = planned − spent`**. 3버킷 지갑의 `planned` 버킷 기준으로 바꾼다. flexible은 포함하지 않는다.
- `bagCount`/`selectedBagCount`는 `purchase.bags` 합산이라 그대로 유효. 단 키가 인덱스 → UUID로 바뀐다.

---

## 2. 파일 분해 전략 — **라우트 기반으로 간다**

### 2.1 결정과 근거

단일 `app/page.tsx` 유지는 아래 중 어느 것도 못 준다.

| 요구 | 단일 페이지 | 라우트 |
| --- | --- | --- |
| 탭 전환·뒤로가기 | `screen` 히스토리가 없어 브라우저 back이 앱을 떠난다 | 기본 동작 |
| PWA 딥링크·`start_url`·shortcuts | 불가(항상 `home`에서 시작) | `/bags/pass` 같은 shortcut 가능 |
| 서비스워커 캐시 단위 | 앱 전체가 청크 하나 | 라우트별 청크 → 프리캐시 대상 특정 가능 |
| 서버에서 신원 읽기(`force-dynamic`) | `"use client"` 최상위라 불가 | 라우트별 서버 컴포넌트 |
| 오프라인 QR 패스 | 세션 서버 렌더에 묶여 못 뜬다 | `/bags/pass`만 클라이언트 라우트로 분리 가능 |
| 접근성(라우트 변경 알림·포커스 이동) | 조건부 JSX라 랜드마크가 하나 | 라우트마다 `<main>`+`<h1>` |

APP_SPEC §1.5가 이미 URL 구조를 확정했다. 그것을 따른다.

### 2.2 디렉터리 (제안)

```
app/
  (app)/layout.tsx            앱 셸: <main> 컨테이너(100dvh·safe-area) + TabBar + SyncChip + Toast + 스토어 Provider
  (app)/trips/page.tsx        · new/page.tsx · [tripId]/page.tsx · [tripId]/past/page.tsx
  (app)/trail/page.tsx        대시보드
  (app)/trail/plan/layout.tsx 인페이지 탭바 + 계획 데이터 1회 로드
  (app)/trail/plan/gifts|map|budget|delivery/page.tsx
  (app)/trail/shop/page.tsx   · [stopId]/record/page.tsx
  (app)/ask/page.tsx          · brief/page.tsx
  (app)/bags/select|review|pay|dropoff|track/page.tsx · receipt/[transferId]/page.tsx
  (app)/account/page.tsx      · memory|notifications|payment|data/page.tsx
  bags/pass/page.tsx          ★ (app) 그룹 밖. 오프라인 QR 전용 · 클라이언트 · 세션 서버 렌더 없음
  offline/page.tsx            ★ 정적 오프라인 셸 · 세션 무관
  login/ auth/callback/ onboarding/   (현행 유지)
  workflow/                   (제품 표면 아님 · 탭·링크에서 제거)
components/                   Header · TabBar · Toggle · SyncChip · Money · SampleTag …
lib/state/                    store.ts(useSyncExternalStore) · outbox.ts · cache.ts · scroll.ts
lib/pwa/                      register.ts · pass.ts
public/sw.js  public/manifest.webmanifest  public/icons/
```

### 2.3 라우팅 규칙 3개

1. **Plan 4렌즈도 URL을 가진다.** `/trail/plan/gifts|map|budget|delivery`. "인페이지 탭"이지만 딥링크·뒤로가기·`Plan changed` 배너에서의 복귀 대상이 필요하다. 데이터는 `plan/layout.tsx`가 **한 번** 읽어 내려준다(렌즈마다 fetch 금지).
2. **탭 이동은 `Link scroll={false}` + 수동 복원**(§4). Next 기본은 top 리셋이라 그대로 두면 지금 `go()`의 문제를 라우터로 옮기는 것뿐이다.
3. **`/bags/pass`와 `/offline`은 앱 셸 밖**이다. 탭바도, 세션 서버 렌더도, `/api/state` 의존도 없다. 오프라인에서 뜨는 것이 유일한 요구사항이라 의존을 0으로 만든다.

### 2.4 클라이언트 스토어

라이브러리를 추가하지 않는다. `lib/state/store.ts`에 `useSyncExternalStore` 기반 스토어 하나(≈40줄, 한 줄 스타일)를 두고 `(app)/layout.tsx`의 Provider가 초기 스냅샷을 주입한다.

- 서버 컴포넌트가 `GET /api/state` 결과를 초기값으로 내려준다(W1의 0-5).
- 스토어에 올리는 것: §1의 **공유** 표시 항목만. 나머지는 라우트 로컬 `useState`로 남긴다.
- 스토어는 **파생값을 저장하지 않는다**. `spent`/`bagCount`/`remaining`은 셀렉터 함수.
- 낙관적 변경은 스토어에 즉시 반영 + 아웃박스에 적재. 두 곳을 동시에 쓰는 함수는 `mutate(op)` 하나로 고정한다.

### 2.5 스타일 규약 — 그대로 간다

- **한 줄 압축 스타일 유지.** 컴포넌트·핸들러·타입 한 줄, CSS 규칙 한 줄. 라우트로 쪼갠다고 예쁘게 풀어쓰지 않는다.
- CSS는 화면별 파일 유지(`globals.css`의 `:root` 토큰 + `handsfree.css` / `profile.css` 분해). 라우트별 `import "./trail.css"`.
- 파일당 화면 하나. 화면이 2개 이상 필요하면 라우트를 하나 더 만든다.
- `Header`/`Toggle`은 현재 구현을 문자 그대로 옮긴다(리팩터링 금지 — 회귀 표면을 줄인다).

---

## 3. 화면 재배치 매핑표

APP_SPEC §1.4의 매핑에 **작업 내용과 크기**를 붙인 것. 크기: S(≤0.5일) / M(1–2일) / L(3일+)

| # | 현재 | 새 위치 | 작업 | 크기 | 선행 |
| --- | --- | --- | --- | --- | --- |
| 0 | `.stage`/`.phone`/`.status-bar`/`.home-indicator` + 5탭 nav | `(app)/layout.tsx` | 액자 제거 · `100dvh` · `env(safe-area-inset-*)` · 4탭 TabBar(SVG 아이콘·44px·`aria-current="page"`) · Toast · SyncChip 자리 | M | — |
| 1 | `home` | `/trail` | hands-free 히어로 유지 · `starters`는 `/ask`로 이관 · 지갑 3버킷/진행률/다음 액션은 W2 자리만 확보 | M | 0 |
| 2 | `chat` | `/ask` | 거의 그대로 이관 + `starters` 수용 · 메모리 스트립은 링크만 남기고 `/account/memory`로 · 입력/제안 상태를 스토어로 | M | 0 |
| 3a | `review` 요약 | `/ask`(brief 카드) | `94%` 하드코딩 제거 · 카드화 | S | 2 |
| 3b | `review` 폼 | `/ask/brief` | 전체 화면 편집 · 승인 버튼이 `plans.status` 전이 | M | 2 |
| 3c | `review` 예산 슬라이더 | `/trail/plan/budget` | 3버킷 지갑으로 승격 — **W2 소관**, W3는 라우트와 껍데기까지 | S(W3분) | 1 |
| 4a | `picks` 상품 카드 | `/trail/plan/gifts` | 카드 이관 + `Request` 버튼 자리 · `routeDirty` 배너를 여기 상단으로 | M | 1 |
| 4b | `picks` 경로 라인 | `/trail/plan/map` | 장식 div 이관(실지도는 W6) · 순서변경/건너뛰기 자리 | S | 1 |
| 5 | `shop` 체크리스트 | `/trail/shop` | 이관 + 스토어 연결. **오프라인 완전 동작** 대상 | M | 1, W1 |
| 6 | `shop` 구매 시트 | `/trail/shop/[stopId]/record` | 모달 → 전체 화면 승격 · draft 로컬 보존 · 아웃박스 적재 · `Waiting to sync` 칩 | M | 5, 아웃박스 |
| 7a | `drop` 가방 선택 | `/bags/select` | 이관 · 플랜 외 가방 추가는 W4 | M | W1 |
| 7b | `drop` 적격성 요약 | `/trail/plan/delivery`(읽기) + `/bags/review`(실행) | **2분할**. 읽기엔 게이트 없음, 실행엔 승인 게이트 | M | 7a |
| 8 | `pay` | `/bags/pay` | 이관 · `forceFail` 체크박스 제품 화면에서 제거 · 오프라인 차단 분기 | S | 7b |
| 9 | `tracking` | `/bags/dropoff` + `/bags/track` + `/bags/receipt/[id]` | **3분할** · `Preview next status` 제거는 W4 | M | 8 |
| 10a | `profile` 여행 폼·지역 | `/trips/[tripId]` | 폼 이관(`updateTrip`/`addArea` 그대로) | M | 0 |
| 10b | `profile` 과거 여행 | `/trips/[tripId]/past` (+ `/trips` 목록) | `pastTrips` 상수 → 서버 | M | 0 |
| 10c | `profile` 메모리 | `/account/memory` | 토글 이관 · 항목별 동의는 W6 | S | 0 |
| 10d | `profile`의 `/workflow` 링크 | — | **삭제** | S | — |
| 11 | (없음) | `/` | APP_SPEC §1.2 착지 규칙 리다이렉트 | S | 0 |
| 12 | (없음) | `/offline`, `/bags/pass` | W7 | — | §5 |

**W3 합계: L** (0·1·2·4a·5·7a·9·10a가 M 이상). 그래서 §6에서 W3-A / W3-B로 쪼갠다.

---

## 4. 탭 상태 보존

지금은 `go()`가 **모든 전환에서 무조건 스크롤을 top으로 스무스 리셋**한다. 매장 안에서 Bags를 확인하고 Trail로 돌아오면 세 번째 매장까지 다시 스크롤해야 한다. 라우터로 옮기면서 이 동작을 그대로 가져가면 안 된다.

### 4.1 스크롤 정책

| 전환 | 스크롤 |
| --- | --- |
| 새 화면 push (예: 매장 카드 → 구매 기록) | top |
| 뒤로가기(pop) | 브라우저 복원 |
| **탭 전환·탭 복귀** | 해당 탭에서 마지막으로 보던 위치 복원 |
| **Plan 인페이지 탭 전환** | 유지(같은 화면의 렌즈 교체이므로 top으로 튀지 않는다) |

구현: 스크롤 컨테이너를 `.screen` div가 아니라 **문서 스크롤**로 통일한다(주소창 자동 숨김과 `100dvh`가 함께 동작하려면 필요). `lib/state/scroll.ts`가 `pathname` 키로 `sessionStorage["trail:scroll:{path}"]`에 저장하고 복원한다. `Link`는 `scroll={false}`, 복원은 `useLayoutEffect`에서 1회.

### 4.2 탭별 마지막 하위 경로 기억

Bags를 눌렀을 때 `/bags`가 아니라 마지막에 보던 `/bags/track`으로 간다.

- 규칙: **세션 내에 사용자가 명시적으로 이동한 하위 경로가 있으면 그것, 없으면 APP_SPEC §1.2 착지 규칙.**
- 예외: 상태가 하위 경로를 무효화하면(결제 완료 → `/bags/pay` 복귀 금지) 착지 규칙이 이긴다. 무효 경로 목록을 탭별로 명시한다.
- 저장은 `sessionStorage`(탭 세션 한정). localStorage에 두면 어제 상태로 착지한다.

### 4.3 입력·draft 보존

| 대상 | 보존 위치 | 수명 |
| --- | --- | --- |
| `/ask` 입력·메시지·`thinking`·`suggestion` | 스토어(메모리) | 세션 |
| `/ask/brief` 편집 draft | 스토어 + 승인 시 서버 | 승인까지 |
| 구매 기록 draft | `localStorage["trail:draft:record:{stopId}"]` | **명시 저장/취소까지** — 매장에서 앱이 죽어도 살아남아야 한다 |
| 가방 선택 | 스토어 + 스냅샷 캐시 | 이송 생성까지 |
| 스크롤·탭 하위경로 | `sessionStorage` | 세션 |

`suggestion`(AI 미승인 제안)이 탭 왕복으로 사라지면 헌법 1번의 승인 게이트가 통째로 없어진다. **스토어 보관은 선택이 아니라 요구사항이다.**

### 4.4 접근성

- 라우트 변경 후 포커스를 `<main>`의 `<h1>`(`tabIndex={-1}`)으로 이동. `.phone`의 `aria-live="polite"`는 폐기.
- 탭바: `<nav aria-label="Main">` + 현재 탭 `aria-current="page"` + 각 버튼 44×44 이상 + 유니코드 아이콘 → SVG(`aria-hidden`) + 텍스트 라벨.
- Plan 인페이지 탭: `role="tablist"`가 아니라 링크 목록 + `aria-current="page"`(실제 라우트 이동이므로 tab 패턴은 거짓말이 된다).
- 포커스 아웃라인 제거 금지. 스크롤 복원 시 포커스를 훔치지 않는다.

---

## 5. W7 — 웹앱(PWA) 계획

### 5.1 manifest · 아이콘 · 뷰포트

`app/manifest.ts`(Next가 `/manifest.webmanifest` 생성)로 둔다. 정적 파일보다 타입 체크가 붙는다.

| 필드 | 값 |
| --- | --- |
| `name` / `short_name` | `TRAIL — hands-free souvenir travel` / `TRAIL` |
| `start_url` | `/?source=pwa` |
| `scope` | `/` |
| `display` | `standalone` (`display_override: ["standalone","minimal-ui"]`) |
| `orientation` | `portrait` |
| `theme_color` / `background_color` | `#12333c` / 라이트 배경 토큰 |
| `icons` | 192·512 + **512 `purpose:"maskable"`** + `apple-touch-icon` 180 |
| `shortcuts` | `Shopping → /trail/shop`, **`Drop-off pass → /bags/pass`** |

`app/layout.tsx` 수정 2건(둘 다 W0/W7 공동):

- `viewport.maximumScale: 1` **제거** — 확대 차단은 접근성 위반이다.
- `viewport.viewportFit: "cover"` 추가 — 없으면 safe-area 인셋이 0으로 온다.
- `<head>`의 figma capture 스크립트는 프로덕션 빌드에서 제외할지 결정 필요(외부 스크립트가 SW 스코프 안에 있다).

아이콘 자산은 W0의 SVG 아이콘 작업과 소스를 공유한다(별도로 만들지 않는다).

### 5.2 서비스워커 — 캐시할 것과 **절대 캐시하지 않을 것**

`public/sw.js` 수기 작성(빌드 플러그인 의존성 추가하지 않음). 등록은 `lib/pwa/register.ts`를 `(app)/layout.tsx`에서 클라이언트로.

**프리캐시(앱 셸)**
- `/offline`, `/bags/pass`의 HTML 셸(세션 무관 렌더)
- `_next/static/**`(해시 자산) · 폰트 · 아이콘 · `manifest.webmanifest`
- QR 생성 청크(오프라인에서 코드가 없으면 패스가 안 뜬다)

**런타임 캐시**
- 정적 해시 자산: cache-first(불변)
- 폰트·이미지: stale-while-revalidate
- 네비게이션 요청: **network-first + 실패 시 `/offline`**. **응답을 캐시에 넣지 않는다**

**절대 캐시 금지 — 세션 오염 방지**

| 대상 | 이유 |
| --- | --- |
| `/login`, `/auth/callback`, `/onboarding` 및 모든 `force-dynamic` HTML | 사용자별 렌더. 캐시는 origin 단위 공유라 계정 전환·로그아웃 후 이전 사용자 화면이 뜬다 |
| `*.supabase.co/auth/v1/**` | 토큰 교환. 캐시된 응답 재생 = 세션 되살아남 |
| `Authorization` 헤더 또는 인증 쿠키가 붙은 모든 요청 | 동상 |
| `/api/**`의 모든 비-GET | 멱등하지 않다. 재생은 아웃박스가 담당한다 |
| `/api/state` | 사용자 데이터. 캐시는 **IndexedDB 스냅샷**이 담당하고 SW는 손대지 않는다 |

**규칙 2개를 SW에 명문화한다.**
1. `fetch` 핸들러 최상단에서 `request.method !== "GET"` 이거나 `new URL(request.url).pathname.startsWith("/api")` 또는 `/auth` 면 **즉시 `return`**(패스스루).
2. 로그아웃 시 앱이 SW에 `postMessage({type:"SIGN_OUT"})` → SW가 런타임 캐시 삭제, 앱이 IndexedDB(스냅샷·아웃박스·패스) 퍼지. 미전송 아웃박스가 있으면 로그아웃 자체를 경고로 막는다(APP_SPEC AU-4).

**`middleware.ts` 수정 필요 — 발견 사항.** 현재 matcher는

```
["/((?!_next/static|_next/image|favicon.ico|fonts|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ttf|woff2?)$).*)"]
```

`.js`와 `.webmanifest`를 제외하지 않는다. `/sw.js`와 `/manifest.webmanifest` 요청마다 `supabase.auth.getUser()`가 돌고 `Set-Cookie`가 붙는다. SW 스크립트 응답에 세션 쿠키를 얹는 것은 캐시 헤더·업데이트 검사와 간섭할 수 있고, 무엇보다 불필요한 auth 왕복이다. matcher에 `sw.js|manifest.webmanifest|icons` 제외를 추가한다.

### 5.3 오프라인 셸 `/offline`

- **정적 라우트**(서버 세션 읽기 없음). 그래야 SW가 프리캐시할 수 있다.
- 내용: APP_SPEC GL-3 — `You're offline.` / `Your plan, your purchases and your drop-off pass all work without a connection.` + 오프라인에서 되는 것 목록 + **`Open drop-off pass` 버튼(`/bags/pass`)**.
- 온라인 복귀 감지 시 자동 재시도 링크(자동 리로드는 하지 않는다 — 매장에서 입력 중일 수 있다).

### 5.4 오프라인 QR 이송 패스 `/bags/pass` — W7의 핵심

**매장 안에서 이게 안 뜨면 이송 자체가 불가능하다.** 다른 모든 오프라인 기능보다 이것이 우선한다.

| 항목 | 설계 |
| --- | --- |
| 라우트 | `(app)` 그룹 **밖**. 탭바·세션 서버 렌더·`/api/state` 의존 0 |
| 데이터 | 결제 성공 시 서버가 서명 패스 토큰 발급(DB엔 `pass_token_hash`만) → 클라이언트가 IndexedDB `pass` 스토어에 토큰 + 표시용 필드(가방 수, 호텔명, 파트너 지점명·주소, 마감 시각, 만료, 발급 시각) 저장 |
| QR 렌더 | **클라이언트에서 생성**한다. 서버 이미지 URL(`/api/qr?...`)은 오프라인에서 절대 못 뜬다. 생성 청크를 프리캐시에 포함 |
| 폴백 | QR이 어떤 이유로든 못 뜨면 **텍스트 참조 ID**(`TR-2718`)를 크게 표시. 직원이 수기 입력할 수 있는 경로를 항상 남긴다 |
| 화면 | Wake Lock으로 화면 꺼짐 방지 + 최대 대비(흰 배경/검정 코드). 밝기 API는 없으므로 대비로 해결 |
| 정직성 | `This pass works offline.` + `Last synced 4:12 PM` + 만료 임박 시 `Reconnect before 7:00 PM to refresh this pass` |
| 만료 | 온라인이면 진입 시 갱신. 오프라인이고 만료면 QR을 숨기지 않고 **만료 표시와 함께** 보여준다(직원이 참조 ID로 조회 가능) |
| 스캔 검증 | 파트너 측이 온라인으로 검증. 우리 오프라인 책임은 **표시**까지 |
| 하이드레이션 | IndexedDB는 클라이언트 전용이므로 `hydrated` 게이트 뒤에서 렌더. 게이트 전에는 스켈레톤 |

**선행: W4**(패스 토큰·파트너 지점·`bag_transfers.pass_token_hash`). W4 없이 만들면 캐시할 대상이 없다.

### 5.5 아웃박스 + 동기화 대기 칩

| 계층 | 내용 |
| --- | --- |
| 저장소 | IndexedDB `outbox`: `{ id: client_op_id(클라 생성 UUID), kind, url, method, body, createdAt, tries, lastError, state }` |
| 멱등 | `client_op_id`를 서버가 유니크 키로 받는다. `purchases`·`payments`·`transfer_events`·`chat_messages`엔 이미 있고 **`stops`·`store_inquiries`·`budget_changes`에는 없다**(APP_SPEC §5.2-10) → W1에서 추가 |
| 낙관적 반영 | `mutate(op)` 하나가 스토어 갱신 + 아웃박스 적재를 함께 한다. 둘 중 하나만 하는 경로를 만들지 않는다 |
| 플러시 | SW `sync` 이벤트(tag `trail-outbox`) → **iOS Safari는 Background Sync 미지원**이므로 `online` 이벤트 + `visibilitychange` + 앱 내 타이머 폴백이 **정상 경로**다. SW 경로를 최적화로 취급한다 |
| 재시도 | 5xx·네트워크만 지수 백오프. **4xx는 재시도 없이 즉시 노출.** 401은 SW가 재시도 금지하고 앱에 postMessage |
| 충돌 | 행 단위 LWW. 단 **이미 `bought`인 건에 대한 늦은 `planned` 덮어쓰기는 409 거부** → 충돌 카드로 사용자에게 선택 |
| 전역 칩(GL-1) | 앱 셸 상단 고정. `숨김` / `N changes waiting` / `Syncing…` / `Couldn't save 1 change` + `Retry` |
| **항목 칩** | 전역 칩만으로는 부족하다. 구매 카드·저장 토글 등 **개별 항목에도 `Waiting to sync`를 표시**한다. 조용히 성공한 척하는 것이 이 앱에서 가장 위험한 실패다 |

### 5.6 설치 프롬프트

- `beforeinstallprompt` 캡처 → 즉시 띄우지 않고 보관. 노출 지점 2곳: `Account ▸ Install Trail`(상시), 첫 구매 기록 성공 후 인라인 배너 1회.
- iOS는 이벤트가 없다 → `navigator.standalone` 감지 + 수동 안내 시트(공유 → 홈 화면에 추가).
- `display-mode: standalone` 매치되면 전부 숨김.
- 알림 권한은 여기서 요청하지 않는다(ON-0의 권한 프라이밍 소관, W7 범위 밖).

### 5.7 W7 작업 분해

| # | 작업 | 크기 | 선행 |
| --- | --- | --- | --- |
| 7-1 | manifest + 아이콘 세트 + `viewport` 수정(`maximumScale` 제거·`viewportFit`) | S | W0 아이콘 |
| 7-2 | `/offline` 정적 셸 | S | — |
| 7-3 | `sw.js` + 등록 + 캐시 화이트리스트/블랙리스트 + `SIGN_OUT` 퍼지 + middleware matcher 수정 | M | W3 라우트 확정 |
| 7-4 | IndexedDB 아웃박스 + `mutate()` + 플러시(폴백 포함) | L | W1 멱등키 |
| 7-5 | GL-1 전역 칩 + 항목별 `Waiting to sync` | S | 7-4 |
| 7-6 | `/bags/pass` 오프라인 QR + Wake Lock + 참조 ID 폴백 | M | W4 |
| 7-7 | 설치 프롬프트 + iOS 안내 | S | 7-1 |
| 7-8 | 검수: Lighthouse installability · 기내모드 3종(패스·구매기록·앱 재시작) · **계정 전환 캐시 오염 테스트** | M | 전부 |

---

## 6. 위험과 이견

### 6.1 이견 — "W0을 먼저 해야 W3이 가능하다"는 절반만 맞다

BUILD_PLAN은 W3의 선행을 W0으로 잡았고, 근거는 "새 화면을 옛 액자 안에 만들면 전부 다시 만든다"이다. 근거 자체는 옳다. **그런데 그 논리를 끝까지 밀면 W0과 W3은 순서 의존이 아니라 같은 작업이 된다.**

W0은 성격이 다른 두 덩이를 묶고 있다.

- **W0a — 셸·뷰포트**: `.stage`/`.phone`/`.status-bar`/`.home-indicator` 제거, `100dvh`, safe-area, 컨테이너 최대폭, 탭바.
  이건 전부 **레이아웃 컴포넌트**의 일이다. W3는 `(app)/layout.tsx`를 새로 만든다. W0a를 따로 하면 **지금의 `app/page.tsx` 안 액자를 한 번 걷어내고, 며칠 뒤 새 레이아웃에 같은 것을 다시 만든다.** 두 번 만드는 것을 피하자는 원칙이 정확히 반대 결과를 낳는다.
  → **W0a는 W3의 첫 커밋(§3의 #0)으로 흡수한다.** 새 셸을 만들 때 액자를 안 만들면 그만이다.
- **W0b — 타이포·아이콘**: 본문 ≥14px, 라벨 ≥11px, 대비 4.5:1, 유니코드 → SVG.
  이건 `globals.css` 토큰과 아이콘 자산 레벨이라 라우트 구조와 **파일이 거의 겹치지 않는다**. W3와 **완전 병렬** 가능하고, 오히려 W3가 새 화면을 만드는 동안 토큰이 먼저 커져 있어야 한다.
  → **W0b는 W3와 동시에 연다.** 단 토큰 변수명을 먼저 확정하고 공유한다(충돌 지점은 여기 하나뿐).

**진짜 강한 선행은 W0이 아니라 W1이다.** W3는 화면을 라우트로 쪼개는데, 쪼갠 화면들이 `purchases`·`selectedBags`·`savedStops`·`replacementIds` 4종의 **배열 인덱스 키**를 라우트 경계 너머로 공유해야 한다. 인덱스 키를 그대로 스토어에 올리면 W1에서 스토어 계약을 다시 짠다. 그리고 인덱스 키 자체가 이미 버그다 — `replacementIds[i]`를 토글하면 `products[i]`가 다른 상품이 되는데 `purchases[i]`는 그대로 붙어 있다.

→ **W3를 둘로 쪼갠다.**

| | 범위 | 선행 | 크기 |
| --- | --- | --- | --- |
| **W3-A** | 앱 셸(=W0a) · 4탭 · 라우트 골격 · `/` 착지 규칙 · Trips/Trail/Ask 이관 · 스크롤/탭 보존 | 없음 | M~L |
| **W3-B** | `/trail/shop` · `/trail/shop/[stopId]/record` · `/bags/*` 이관 | **W1**(stop UUID·멱등키) | M |

### 6.2 W7의 선행도 정확하지 않다

BUILD_PLAN은 "W7 선행 = W0 + W3"이라 썼다. 실제로는 세 덩이가 각각 다르다.

| W7 덩이 | 실제 선행 |
| --- | --- |
| manifest·아이콘·설치·`/offline` | W0b(아이콘)뿐. **W3와 병렬 가능** |
| 서비스워커 캐시 | W3(캐시할 라우트가 정해져야 한다) |
| 아웃박스·동기화 칩 | W1(멱등키) |
| **오프라인 QR 패스** | **W4**(패스 토큰). W3·W7만으로는 못 만든다 |

즉 W7을 통째로 마지막에 두면 manifest 같은 반나절짜리가 몇 주 뒤로 밀린다. 7-1/7-2/7-7은 지금 열어도 된다.

### 6.3 나머지 위험

| 위험 | 영향 | 대응 |
| --- | --- | --- |
| **SW 캐시가 세션을 오염**시킨다 | 로그아웃/계정 전환 후 이전 사용자 화면 노출. 이 트랙 최대 사고 | §5.2의 금지 목록 + 패스스루 규칙 + `SIGN_OUT` 퍼지. 검수 항목 7-8에 계정 전환 테스트 고정 |
| `npm test`가 렌더 결과 기준이라 라우트 분해로 통째 깨진다 | 회귀 감지 상실 | §3 매핑표대로 테스트도 라우트별로 이관. 이 이관을 별도 M으로 계상한다(누락하면 W3가 조용히 커진다) |
| 현재 `/`가 **무인증으로 열린다** | 라우트 전환 시 인증 게이트를 넣으면 데모 경로가 막힌다 | W3-A에서 `/` 착지 규칙과 함께 처리(APP_SPEC 0-4). 데모 계정 시드 필요 |
| Plan 4렌즈가 각자 fetch를 하려는 유혹 | 탭 전환마다 로딩·깜빡임 | `plan/layout.tsx`에서 1회 로드 후 props로 내린다. 렌즈에서 `fetch` 금지를 리뷰 체크리스트로 |
| localStorage 단일 blob(`trail-v3-state`)과 아웃박스 공존 | 오프라인 변경이 blob 덮어쓰기로 사라짐 | W3-B 전에 blob을 스냅샷/아웃박스로 분리. 마이그레이션 코드는 1회성(구 키 읽고 삭제) |
| `viewport.maximumScale: 1` | 확대 차단 = 접근성 위반 | W0a/7-1에서 제거 |
| `.phone`의 `aria-live="polite"` | 화면 전환마다 전체 낭독 | W3-A에서 폐기, 제목 포커스로 대체 |
| iOS PWA: Background Sync·웹푸시 제약 | 동기화가 안 도는 것처럼 보임 | 폴백을 정상 경로로 설계(§5.5). 푸시는 W7 범위 밖(6-4) |
| QR 생성 라이브러리 의존성 추가 | 승인 필요 | 대안: 자체 QR 인코더 작성(비권장·크기 M). **결정 요청** |

### 6.4 권장 순서 (이 트랙 한정)

```
지금 ─┬─ W3-A 셸·4탭·라우트 골격 (= 기존 W0a 흡수)
      ├─ W0b 타이포·SVG 아이콘        (병렬 · 토큰명만 먼저 합의)
      └─ W7-1/7-2/7-7 manifest·/offline·설치  (병렬)

W1 완료 ─→ W3-B 쇼핑·가방 이관 ─→ W7-4/7-5 아웃박스·동기화 칩
W3 완료 ─→ W7-3 서비스워커
W4 완료 ─→ W7-6 오프라인 QR 패스 ─→ W7-8 검수
```

### 6.5 결정 요청

1. **W0a를 W3-A에 흡수**하는 것 승인 — 승인되면 BUILD_PLAN의 "W3 선행 W0"과 순서도를 함께 고친다.
2. **W7-1/7-2/7-7을 지금 병렬로 여는 것** 승인.
3. 탭 하위 경로 기억 정책(§4.2)의 무효 경로 목록 — product-lead 확정 필요.
4. QR 생성 라이브러리 의존성 추가 여부(§6.3).
5. 데스크톱 ≥768px 레이아웃(2열 vs 단일 컬럼) — design-lead. W3-A의 셸이 이걸 담는다.
6. `app/layout.tsx` `<head>`의 figma capture 스크립트를 프로덕션에서 뺄지.
