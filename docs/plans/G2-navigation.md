# G2 — 내비게이션 · 네이밍 · 실행 계획

담당: product · app · 2026-08-18
기준 문서: `docs/FIGMA_ADOPTION.md` (§1 협상 불가 · §2 이름 정본 · §4 그룹 계약)
전제: **`app/(app)/shell.tsx`와 `app/(app)/landing.ts`는 G2만 수정한다.** 다른 그룹은 라우트를 추가만 한다.

---

## 0. 회의 결론 — 이 계획이 확정하는 9가지

| # | 결정 | 근거 |
| --- | --- | --- |
| D1 | 하단 탭 = `Home` · `Trips` · `AI` · `Bags`. 프레임에 섞여 있던 `Trail`·`Ask AI`는 폐기 | FIGMA_ADOPTION §2, 프레임 -15, 손그림 |
| D2 | **탭 키 ≠ URL 세그먼트.** URL은 하나도 바꾸지 않는다 (`/trail/*`, `/ask/*` 유지). 개명은 라벨과 탭 소속에만 적용 | 라우트 리네임은 딥링크·북마크·`(app)` 전체를 흔든다. 비용 대비 이득 없음 |
| D3 | `/trail/*` **전체가 Trips 탭**이다. `/trail`(대시보드) · `/trail/plan/*` · `/trail/shop/*` 모두 | 손그림 "Toronto Plan-Gift" 프레임과 좌하단 Delivery 프레임에서 `Trips`가 동그라미 |
| D4 | `/account/*`는 **Home 탭** 소속이되 **탭 기억에서 제외**한다 | 아바타는 프레임 -15 Home 헤더 우상단. 설정이 Home 탭의 착지점이 되면 안 된다 |
| D5 | 플랜 렌즈 5개(`Route·People·Map·Budget·Delivery`) → **4개(`Gifts·Map·Budget·Delivery`)** | 프레임 -17~-20 |
| D6 | `people/page.tsx`는 **지우지 않고** `/trail/plan/gifts/split`로 이동. 시트가 아니라 라우트 | 409 승인 분기(`exceeds_planned`·`equal_value_conflict`)를 가진 화면은 URL과 뒤로가기가 필요하다 |
| D7 | 트립 컨텍스트 바는 `components/trip-context-bar.tsx` 신규 컴포넌트. **G2가 트리거를, G3가 시트를 소유**한다 | 아래 §6 계약 |
| D8 | sessionStorage 키를 `trail:v2:` 네임스페이스로 옮기고, 구버전 `trail:` 키를 1회 청소한다 | v1 값이 `/trail/plan/people` 같은 사라진 경로를 들고 있다 |
| D9 | `staleForTab(app): string[]` → `isStale(app, path): boolean`로 시그니처 변경 | 동적 세그먼트(`/trail/shop/<uuid>/record`)는 문자열 배열로 걸러지지 않는다 |

### 정본과 프레임이 어긋난 곳 (§2가 이긴다)

| 프레임 | 프레임 문구 | 채택 | 이유 |
| --- | --- | --- | --- |
| `Home.png` | 하단 탭 3번째 `Trail` | `AI` | §2 표가 정본 |
| `-1`, `-12`, `-14` | 하단 탭 `Trips·Trail·Ask AI·Bags` | `Home·Trips·AI·Bags` | 같음 |
| `-2` | 하단 탭 3개 (`Trips·Trail·Bags`) | 4개 | 프레임 잘림 |
| `-18` | `Start shopping →` | `Start today's route →` | §2 버튼 표에 있는 쪽. 같은 목적지에 두 라벨을 두지 않는다 |
| `-2` | 컨텍스트 바 `Toronto · Day 2 ▾` | `🇨🇦 Toronto ▾` (+ 날짜를 알 때만 `· Day n of m`) | §2 + 헌법: 모르는 값을 그리지 않는다 |

### D10 — 카피 예외 7번째: `Current Location` (G3 요청 판정)

**쟁점**: 프레임 -15 / `Home.png`의 `Current Location` + `Toronto, Ontario` 카드.

**판정: 문구를 바꾼다. 위치 권한은 받지 않는다.**

| 항목 | 결정 |
| --- | --- |
| 와이어프레임 | `Current Location` / `Toronto, Ontario` / 버튼 `Open Trail` |
| **쓸 문구** | **`Shopping in`** / `{city}, {region}` / 버튼은 아래 3분기 |
| 이유 (예외표에 남길 한 줄) | 이 값의 출처는 센서가 아니라 온보딩에서 여행자가 입력한 `trips.city`다 |

**왜 위치 권한을 받지 않는가 — 세 가지**

1. **§1-1과 같은 종류의 거짓이다.** "이 영역은 샘플"이라 쓰지 않고 행의 `source`를 읽으라고 정한 것과 같은 이유로,
   사용자가 타이핑한 도시를 `Current Location`이라 부를 수 없다. "94% 이해" 하드코딩과 같은 계열의 결함이다.
2. **새 개인정보 범주가 생긴다.** `0007_account_erasure`의 삭제는 `auth.users` 캐스케이드 기반이라
   좌표를 담는 새 테이블은 **자동으로 걸리지 않는다.** 위치를 도입하려면 0007 개정이 선행 조건이지,
   Home 카드 하나의 곁다리 작업이 아니다.
3. **물어보는 시점이 최악이다.** 브라우저 권한 프롬프트가 Home 첫 로드에 아무 맥락 없이 뜬다.
   위치를 언젠가 쓴다면 그것은 카드가 아니라 **사용자가 누른 액션에 붙어야 한다**(예: `Show stores near me`).

**나중에 진짜 위치를 도입할 때의 조건 (G6 이후, 이번 범위 아님)**
① 명시적 액션에 붙일 것 ② `navigator.geolocation` 1회 조회, 서버 저장 금지 ③ 0007 개정이 선행
④ 거부 시 도시 기준 폴백 + 라벨을 `Near {city}`로 바꿀 것(§5의 권한 거부 분기와 동일 규칙).

**버튼 문구 — `Open Trail` / `Plan trip` 둘 다 쓰지 않는다.** §2에 없는 말이고,
`Continue {city} Trail →`와 목적지(`/trail`)가 같은데 라벨만 다르면 `Start shopping →` 때와 같은 결함이 된다.
My Trips 카드의 규칙을 **그대로** 재사용한다 — 새 단어 0개:

| 활성 여행 상태 | 버튼 | §2 출처 |
| --- | --- | --- |
| 플랜 없음 | `Plan shopping` | §2 버튼 |
| 플랜 있음 · 쇼핑 전 | `Open` | §2 버튼 |
| 쇼핑 시작됨 | `Continue {city} Trail →` | §2 버튼 |

**검토했으나 기각한 대안**

| 후보 | 기각 사유 |
| --- | --- |
| `Trip city` | 값이 이미 `Toronto, Ontario`라 라벨과 값이 같은 말을 두 번 한다 |
| `Where you're shopping` | 데이터 라벨에 2인칭 축약형. `Deliver to` / `Drop-off partner`의 어법과 어긋난다 |
| `Your trip` | 장소 카드인데 장소를 가리키지 않는다 |
| `Destination` | §2에서 이미 Bag Tracking의 **호텔**을 가리킨다. 의미 충돌 |

`Shopping in`을 고른 이유: §2가 이미 쓰는 `Deliver to → The Annex Hotel`과 정확히 같은 문법
(전치사구 라벨 + 값)이고, 앱이 실제로 아는 사실만 주장한다.

**구현 조건 (G3)**
- 카드는 **만든다** (Home → 활성 여행의 진입점이다). 다만 `trip.city`가 비면 카드를 렌더하지 않는다 — `Shopping in —`을 그리지 않는다.
- 프레임 -15에는 하단에 `Toronto is active / Day 2 of 4 · The Annex Hotel ›` 행이 또 있다.
  같은 여행을 두 번 말한다 → **두 카드를 하나로 합칠 것.** 어느 쪽 레이아웃을 남길지는 G3 결정,
  문구는 `Shopping in` + `{city}, {region}` + `Day {n} of {m}` + `{hotel}`로 고정한다(`Day` 행은 `day !== null`일 때만).

---

## 1. 라우트 → 탭 매핑표 (전수, 예외 없음)

`app/`의 모든 UI 라우트 22개. API 라우트는 탭과 무관.

| 라우트 | 파일 | 탭 | 탭바 | 탭 기억 | 근거 |
| --- | --- | --- | --- | --- | --- |
| `/` | `app/page.tsx` | — | 없음 | — | 리다이렉트 규칙. **`/trail` → `/home`으로 변경** |
| `/login` | `app/login/page.tsx` | — | 없음 | — | 셸 밖 |
| `/auth/callback`, `/auth/dev-signin` | `app/auth/*` | — | 없음 | — | 셸 밖 |
| `/onboarding` | `app/onboarding/page.tsx` | — | **없음** | — | 셸 밖(`(app)` 그룹 아님). 첫 여행 등록 중에 탭바는 탈출구가 아니라 함정 |
| `/workflow` | `app/workflow/page.tsx` | — | 없음 | — | 제품 표면 아님 (APP_SPEC §1.4) |
| **`/home`** | **신규** `app/(app)/home/page.tsx` | `home` | 있음 | 예 | 프레임 -15 |
| `/account/memory` | `app/(app)/account/memory/page.tsx` | `home` | 있음 | **아니오** | D4 |
| `/trips` | `app/(app)/trips/page.tsx` | `trips` | 있음 | 예 | 프레임 `Mobile app with accessibility.png` |
| `/trips/past` | `app/(app)/trips/past/page.tsx` | `trips` | 있음 | 예 | `PAST` 구획의 상세 |
| `/trail` | `app/(app)/trail/page.tsx` | `trips` | 있음 | 예 | D3, 프레임 -2 |
| `/trail/plan` | `app/(app)/trail/plan/page.tsx` | `trips` | 있음 | — | `→ /trail/plan/gifts` 리다이렉트 |
| `/trail/plan/gifts` | `.../gifts/page.tsx` | `trips` | 있음 | 예 | 프레임 -17 |
| **`/trail/plan/gifts/split`** | **이동** `.../gifts/split/page.tsx` | `trips` | 있음 | 예 | D6 |
| `/trail/plan/map` | `.../map/page.tsx` | `trips` | 있음 | 예 | 프레임 -18 |
| `/trail/plan/budget` | `.../budget/page.tsx` | `trips` | 있음 | 예 | 프레임 -19 |
| `/trail/plan/delivery` | `.../delivery/page.tsx` | `trips` | 있음 | 예 | 프레임 -20 |
| `/trail/plan/approval` | `.../approval/page.tsx` | `trips` | **숨김** | **아니오** | 돈이 움직이는 결정 화면. 결정 후 되돌아오면 죽은 화면 |
| `/trail/plan/people` | **삭제 → 리다이렉트 stub** | `trips` | — | — | `→ /trail/plan/gifts/split` (308) |
| `/trail/shop` | `app/(app)/trail/shop/page.tsx` | `trips` | 있음 | 예 | 프레임 -6 |
| `/trail/shop/[stopId]/record` | `.../record/page.tsx` | `trips` | **숨김** | **아니오** | 프레임 -4. 되돌릴 수 없는 쓰기 직전 |
| `/ask` | `app/(app)/ask/page.tsx` | `ai` | 있음 | 예 | 프레임 -14 |
| `/ask/brief` | `app/(app)/ask/brief/page.tsx` | `ai` | 있음 | 예 | 프레임 -14 요약 카드의 `Edit details` 목적지 |
| `/bags` | `app/(app)/bags/page.tsx` | `bags` | 있음 | — | `→ bagsHref(app)` 리다이렉트 |
| `/bags/select` | `.../select/page.tsx` | `bags` | 있음 | 조건부 | 되돌릴 수 있는 목록. §2 `staleForTab` 규칙 유지 |
| `/bags/review` | `.../review/page.tsx` | `bags` | **숨김** | 조건부 | 프레임 -8. 결제 직전 |
| `/bags/pay` | `.../pay/page.tsx` | `bags` | **숨김** | **아니오** | 프레임 -9/-10. 이중 청구 위험 |
| `/bags/track` | `.../track/page.tsx` | `bags` | 있음 | 예 | 프레임 -12 |

**G5가 추가할 라우트의 사전 배정** (G5는 landing.ts를 만지지 않는다):
`/bags/dropoff` → `bags` · 탭바 숨김 · 기억 안 함 (프레임 -11).
`/bags/delivered` → `bags` · 탭바 있음 · 기억 안 함 (프레임 -13).
`/bags/receipt/[transferId]` → `bags` · 탭바 있음 · 기억 안 함.
**G3가 추가할 라우트의 사전 배정**: `/trips/new` → `trips` · 탭바 숨김. `/trips/[tripId]` → `trips` · 탭바 있음 · 기억함.

### 탭바를 숨기는 규칙 (신규)

숨김 조건은 하나뿐이다: **되돌릴 수 없는 쓰기 직전이거나, 그 쓰기의 결과 화면.** 그 외에는 항상 보인다.
숨기는 화면은 **반드시 back 어포던스를 갖는다** — `Header back`이 없는 화면은 숨김 집합에 넣지 않는다. 접근성 검수 항목이다.

---

## 2. `app/(app)/landing.ts` — 함수별 before / after

```ts
// ── before ────────────────────────────────────────────────
export type TabKey = "trips" | "trail" | "ask" | "bags";
export const inMotion = (app: Pick<Bags, "transfer">) => boolean
export function bagsHref(app: Bags): string
export function continueHref(app: Bags & { shoppingStarted; stops; routeDirty }): string
export function tabOf(pathname: string): TabKey | null
export function staleForTab(app: Pick<AppValue, "transfer" | "bought">): string[]
export function needsOnboarding(trips): boolean
```

```ts
// ── after ─────────────────────────────────────────────────
export type TabKey = "home" | "trips" | "ai" | "bags";

/** sessionStorage 네임스페이스. 값을 바꾸면 전 사용자의 탭 기억이 1회 초기화된다. */
export const SESSION_NS = "trail:v2";

type Bags = { transfer: { status: TransferStatus } | null; bought: unknown[]; unplannedPurchases: unknown[] };

export const inMotion = (app: Pick<Bags, "transfer">) => boolean               // 변경 없음

/** 변경: `bought`가 0이어도 플랜 외 가방이 있으면 Select로 간다.
 *  손그림 주석("We need Bags because they might have other shopping bags")이
 *  요구하는 경로가 지금은 열려 있지 않다. */
export function bagsHref(app: Bags): string

/** 변경: 시그니처에 `todayStopCount?: number` 추가 (0024 이후 채워진다).
 *  오늘 살 것이 0이고 이미 산 것이 있으면 `/trail/shop`이 아니라 `/bags/select`. */
export function continueHref(app: Bags & { shoppingStarted: boolean; stops: unknown[]; routeDirty: boolean; todayStopCount?: number }): string

/** 변경: 4탭 + 세그먼트 단위 비교(`/tripsomething`이 `/trips`에 걸리지 않게). */
export function tabOf(pathname: string): TabKey | null

/** 신규: 탭 루트. shell.tsx가 라우트 문자열을 알지 않게 여기로 옮긴다.
 *  기존 `destination()`의 `` `/${tab === "trail" ? "trail" : tab}` `` 가정이 D2로 깨진다. */
export function tabRoot(tab: TabKey, app: Bags): string

/** 신규: 탭바를 숨기는 화면. 동적 세그먼트를 다루므로 배열이 아니라 술어. */
export function hidesTabBar(pathname: string): boolean

/** 시그니처 변경 (D9): 배열 → 술어.
 *  기억에서 되살리면 안 되는 경로 전부를 한 곳에서 판정한다. */
export function isStale(app: Pick<AppValue, "transfer" | "bought" | "pendingBudgetChange">, path: string): boolean

export function needsOnboarding(trips): boolean                                 // 변경 없음
```

### 각 함수의 판정 규칙 (구현자가 그대로 옮길 것)

**`tabOf`** — 세그먼트 매칭 헬퍼 `under(path, base)` = `path === base || path.startsWith(base + "/")`.

| 조건 | 반환 |
| --- | --- |
| `under("/home")` 또는 `under("/account")` | `"home"` |
| `under("/trips")` 또는 `under("/trail")` | `"trips"` |
| `under("/ask")` | `"ai"` |
| `under("/bags")` | `"bags"` |
| 그 외 | `null` |

**`tabRoot`** — `home → "/home"` · `trips → "/trips"` · `ai → "/ask"` · `bags → bagsHref(app)`.
`trips`의 기본 착지가 `/trail`이 아니라 `/trips`인 이유: 와이어프레임의 Trips는 **여행 목록**이고, 개별 여행 작업대(`/trail`)로는 `Continue {city} Trail →` 카드를 통해 들어간다. 탭 기억이 있으면 마지막 위치로 복귀하므로 실사용에서 한 번만 목록을 본다.

**`bagsHref`**

| 조건 | 반환 |
| --- | --- |
| `inMotion(app)` | `/bags/track` |
| `bought.length > 0 \|\| unplannedPurchases.length > 0` | `/bags/select` |
| 그 외 | `/bags/track` (빈 상태 화면이 여기 있다) |

**`continueHref`**

| 조건 | 반환 |
| --- | --- |
| `inMotion(app)` | `/bags/track` |
| `shoppingStarted && todayStopCount !== 0` | `/trail/shop` |
| `shoppingStarted && todayStopCount === 0` | `/bags/select` |
| `stops.length && !routeDirty` | `/trail/plan/gifts` |
| 그 외 | `/ask` |

**`hidesTabBar`** — `/trail/plan/approval` · `/bags/review` · `/bags/pay` · `/bags/dropoff` · `/trail/shop/*/record` · `/trips/new`.

**`isStale`** — 다음 중 하나라도 참이면 `true`:

| 규칙 | 사유 |
| --- | --- |
| `path`가 `/bags/pay` | 결제 폼 복귀는 이중 청구 제안 (기존 규칙) |
| `inMotion(app)`이고 `path ∈ {/bags/select, /bags/review}` | 이미 넘어간 단계 (기존 규칙) |
| `bought.length === 0 && unplannedPurchases.length === 0`이고 `path ∈ {/bags/select, /bags/review}` | 보낼 가방이 없다 (기존 규칙 + 플랜 외 가방 보정) |
| `under(path, "/account")` | D4 |
| `path === "/trail/plan/approval"`이고 `!pendingBudgetChange` | 결정이 끝난 승인 화면 |
| `path`가 `/trail/plan/people`로 시작 | 사라진 라우트 (리다이렉트가 있어도 이중 안전장치) |
| `/trail/shop/…/record` 패턴 | 존재하지 않는 stop이면 404. 기억으로 되살리지 않는다 |
| `hidesTabBar(path)` | 탭바가 없는 화면은 탭 착지점이 될 수 없다 (상위 규칙) |

> 마지막 규칙 하나로 위의 절반이 자동 처리되지만, 이유가 다르므로 둘 다 남긴다.
> `hidesTabBar`는 UI 규칙, `isStale`은 복귀 규칙이다.

---

## 3. `app/(app)/shell.tsx` — before / after

```tsx
// ── before ────────────────────────────────────────────────
const tabs = [
  { key: "trips", label: "Trips", Icon: IconTrips },
  { key: "trail", label: "Trail", Icon: IconRoute },
  { key: "ask",   label: "Ask AI", Icon: IconAsk },
  { key: "bags",  label: "Bags",  Icon: IconBag },
];
const scrollKey = (path: string) => `trail:scroll:${path}`;
const tabKey    = (tab: TabKey)  => `trail:tab:${tab}`;
const RESTORE = "trail:restore";

const openTab = (tab: TabKey, fallback: string) => { …; const stale = staleForTab(app); const target = remembered && remembered !== pathname && !stale.includes(remembered) ? remembered : fallback; … }
const destination = (tab: TabKey) => (tab === "bags" ? bagsHref(app) : `/${tab === "trail" ? "trail" : tab}`);
const dark = pathname === "/bags/track";
```

```tsx
// ── after ─────────────────────────────────────────────────
const tabs = [
  { key: "home",  label: "Home",  Icon: IconHome },   // components/icons.tsx 에 없으면 G1이 추가 (§5)
  { key: "trips", label: "Trips", Icon: IconTrips },
  { key: "ai",    label: "AI",    Icon: IconAsk },
  { key: "bags",  label: "Bags",  Icon: IconBag },
];
const scrollKey = (path: string) => `${SESSION_NS}:scroll:${path}`;
const tabKey    = (tab: TabKey)  => `${SESSION_NS}:tab:${tab}`;
const RESTORE   = `${SESSION_NS}:restore`;

// 신규: 최초 마운트 1회. sessionStorage 안의 구버전 `trail:` 키만 지운다.
// localStorage(`trail-cache-v4:*` — 오프라인 아웃박스, 구매 초안)는 절대 건드리지 않는다.
function sweepLegacySession() { /* key가 "trail:"로 시작하고 SESSION_NS로 시작하지 않으면 removeItem */ }

const openTab = (tab: TabKey, fallback: string) => { …; const target = remembered && remembered !== pathname && !isStale(app, remembered) ? remembered : fallback; … }
const destination = (tab: TabKey) => tabRoot(tab, app);
const dark = undefined;   // G1의 다크 전면 전환 후 이 분기는 사라진다. G2는 값만 남기고 G1이 제거.
```

추가 변경 3건:

1. **탭바 렌더 조건** — `{!hidesTabBar(pathname) && <nav className="tab-bar" …>}`.
   숨길 때는 `.app-main`의 하단 패딩도 빠져야 한다 → `<div className="app-shell" data-tabbar={hidesTabBar(pathname) ? "off" : "on"}>`. CSS는 G1.
2. **Bags 탭 배지** — `inMotion(app)`이면 점 배지, `transfer.handoffFailureCode`가 있으면 경고 배지 (APP_SPEC §1.2).
   마크업만 G2: `<Icon /><span>{label}</span>{badge && <em className="tab-badge" data-kind={badge} />}`.
   스크린리더 문구는 시각 배지에 의존하지 않게 `aria-label`에 붙인다: `Bags, delivery in progress` / `Bags, needs attention`.
3. **탭 저장 조건** — `if (current && !isStale(app, pathname)) store.setItem(tabKey(current), pathname)`.
   지금은 저장할 때 걸러내지 않고 읽을 때만 걸러서, 결제 화면 경로가 계속 저장된다.

---

## 4. 플랜 렌즈 4개 — `app/(app)/trail/plan/layout.tsx`

```tsx
// before
const lenses = [
  { href: "/trail/plan/gifts",    label: "Route" },
  { href: "/trail/plan/people",   label: "People" },
  { href: "/trail/plan/map",      label: "Map" },
  { href: "/trail/plan/budget",   label: "Budget" },
  { href: "/trail/plan/delivery", label: "Delivery" },
];
<Header title="Route & stores" back={…} action={<button>Edit</button>} />
aria-current={pathname === lens.href ? "page" : undefined}
```

```tsx
// after
const lenses = [
  { href: "/trail/plan/gifts",    label: "Gifts" },
  { href: "/trail/plan/map",      label: "Map" },
  { href: "/trail/plan/budget",   label: "Budget" },
  { href: "/trail/plan/delivery", label: "Delivery" },
];
<Header action={<AvatarButton />} />          // 좌측은 Brand(trail 워드마크), 우측은 아바타 — 프레임 -17
<TripContextBar … />                          // §6
aria-current={under(pathname, lens.href) ? "page" : undefined}   // /gifts/split 에서 Gifts가 현재
```

### 렌즈 레이아웃의 상태 분기

- **승인 배너**: `pendingBudgetChange && pathname !== "/trail/plan/approval"`. **4렌즈 전부 + `/gifts/split`에서 그대로 뜬다.** 렌즈를 5→4로 줄이면서 배너 조건을 건드리지 않는다.
- **`routeDirty` 배너**: 문구 교체(§7). 4렌즈 전부.
- **이송 중 잠금**: `inMotion(app)`이면 Gifts/Map/split이 읽기 전용 + `Editing is locked while bags are in transit` (APP_SPEC §1.3). 지금 어느 렌즈에도 없다 → G2가 배너 슬롯을 만들고, 개별 입력 비활성화는 각 화면 담당.
- **`/trail/plan/approval`**: 렌즈 내비를 숨기고 back 화살표를 띄운다. 탭바도 숨김(§1).
- **로딩**: 렌즈 내비와 컨텍스트 바는 즉시 렌더, 본문만 스켈레톤. 내비가 늦게 뜨면 탭을 두 번 누르게 된다.
- **오프라인**: 렌즈 이동은 클라이언트 라우팅이므로 그대로 동작. 셸의 `sync-chip`이 이미 알린다.

### People → Split 이동 (D6)

```
app/(app)/trail/plan/people/page.tsx  →  app/(app)/trail/plan/gifts/split/page.tsx
app/(app)/trail/plan/people/page.tsx  ←  redirect("/trail/plan/gifts/split") 만 남는 stub
```

**본문 코드는 한 줄도 바꾸지 않는다.** 이 141줄이 세 규칙의 유일한 구현이다:
반올림 금지 · `basis`(per_person / group_total) · 초과 시 쓰기가 아니라 proposal.
바뀌는 것은 import 경로 깊이(`../../../app-state` → `../../../../app-state`)와 아래 두 카피뿐(§7).

진입점 2곳:
- **Gifts 렌즈 하단** — 목록 뒤 행: `Divide the budget by person` + `{n} of {m} allocated`
- **Budget 렌즈** — 지갑 표 아래 행: 같은 목적지. `planned` 버킷을 나누는 화면이므로 예산에서도 도달해야 한다

```
화면/흐름 이름: Plan ▸ Gifts ▸ Split (`/trail/plan/gifts/split`)
- 진입: 활성 여행 + 플랜 존재. Gifts 또는 Budget의 행 / 주요 액션: 인원별 금액 입력·저장, 사람 추가·제외
  / 이탈: 저장 성공 후 머무름(토스트), 초과 시 `/trail/plan/approval`
  / 유지: 렌즈 내비(Gifts 활성) · 승인 배너 · 컨텍스트 바
- 상태 분기
  · 로딩 — 지갑 수치는 서버값이므로 도착 전에는 금액 자리를 비운다. 0을 그리지 않는다
  · 빈 상태 — `Nobody is on this trip yet.` (기존 유지)
  · 오류 — `Trail could not save that split.` (기존 유지)
  · 오프라인 — `You are offline. The split was not saved.` (기존 유지) + 셸 sync-chip
  · 권한 거부 — `plan_not_editable`(승인된 플랜) → `This plan is approved. Changing the split is a budget change.` (기존 유지)
- 승인 게이트: `planned` 초과분은 저장이 아니라 proposal. 사용자가 `/trail/plan/approval`에서 누른다
- 실패 경로: 헌법 4 "실제가 예산 초과". 복구 = 금액 낮추기 / flexible 이동을 승인 요청
- UI 카피: 변경 없음 (§7의 2건 제외)
- 크기: S. 선행 의존: 없음 (파일 이동 + 링크 2개)
```

---

## 5. `/home` 라우트 신설 — G2가 여는 것과 G3가 채우는 것

G2는 **라우트·탭·빈 상태·실패 화면**까지만 만든다. 대시보드 내용(추천 피드, 매장 피드, 여행 카드)은 G3.

```
화면/흐름 이름: Home (`/home`)
- 진입: 로그인 + 여행 ≥1 (0건이면 `(app)/layout.tsx`가 `/onboarding`으로 보낸다)
  / 주요 액션: `Plan with AI` · `Open Trail` · 추천 카드(G3)
  / 이탈: 탭 이동, 활성 여행 열기 / 유지: 없음(탭 루트)
- 상태 분기
  · 로딩 — 인사말과 도시명만 먼저. `Good morning.`은 서버 시각이 아니라 기기 시각으로 판정하고,
    도시명은 서버가 오기 전까지 `Ready to explore?`로 축약한다. 없는 도시를 그리지 않는다
  · 빈 상태 — 여행이 앱 사용 중 사라진 경우에만 도달: `No trip on this account.` +
    `Start a trip` → `/onboarding`. §0이 감수한 "Home과 Trips의 중복"은 이 한 화면으로 한정된다
  · 오류 — 상태 조회 실패: `Trail could not load this account.` + `Try again`
  · 오프라인 — 캐시된 여행으로 렌더 + 셸 sync-chip. 추천 피드는 `Sample` 라벨 유지(G3)
  · 권한 거부 — 위치 권한 거부 시 `RECOMMENDATIONS NEAR YOU`는 도시 기준으로 폴백하고
    `Near {city}`로 라벨을 바꾼다. 위치를 못 얻었는데 "near you"라고 쓰지 않는다
- 승인 게이트: 없음 (읽기 화면)
- 실패 경로: 헌법 4에 걸리지 않는다. 다만 `pendingBudgetChange`가 있으면 승인 배너를 여기에도 띄운다
- UI 카피: `Good morning.` / `Ready to explore {city}?` · `Plan with AI` · `RECOMMENDATIONS NEAR YOU` · `Nearby Stores`
- 크기: S (G2 골격) + L (G3 내용). 선행 의존: 없음
```

`app/page.tsx`의 마지막 줄 `redirect("/trail")` → `redirect("/home")`.

---

## 6. 트립 컨텍스트 바 — 신규 컴포넌트와 그룹 간 계약

파일: **`components/trip-context-bar.tsx` (G2 소유)**. 4렌즈 공통 헤더이자 여행 전환의 진입점.

```tsx
export type TripContextTrip = { id: string; city: string; country: string; flagEmoji: string | null };
export type TripContextBarProps = {
  trip: TripContextTrip | null;
  day: { n: number; of: number } | null;   // 모르면 null — `· Day n of m`을 렌더하지 않는다
  onOpenSwitcher?: () => void;             // G3. 없으면 pill은 `/trips` 링크로 폴백한다
  switcherOpen?: boolean;                  // aria-expanded
  status?: React.ReactNode;                // G3의 `Active` 배지 슬롯 (프레임 -2)
  aiHref?: string;                         // 기본 "/ask"
};
```

**DOM 계약 — 클래스명은 G2가 고정하고 G1이 스타일만 채운다. 이름을 바꾸지 않는다.**

```
.trip-bar
 ├ button.trip-bar-trip [aria-haspopup="dialog"] [aria-expanded] [aria-label="Switch trip. Current: Toronto"]
 │   ├ span.flag [aria-hidden="true"]      ← 국기 이모지만 예외 (§1-5)
 │   ├ b            "Toronto"              ← 도시명이 접근 가능한 이름을 담당
 │   ├ small        "· Day 2 of 4"         ← day !== null 일 때만
 │   └ i.caret [aria-hidden]
 ├ .trip-bar-slot                          ← status 슬롯 (G3)
 └ Link.trip-bar-ai  href={aiHref}         ← "◎ AI", <IconSpark /> + <span>AI</span>
```

### G3와의 인터페이스 계약

| 항목 | G2 | G3 |
| --- | --- | --- |
| pill 버튼 마크업·라벨·포커스 관리 | 소유 | 손대지 않음 |
| 여행 전환 시트/다이얼로그 | 렌더하지 않음. `onOpenSwitcher`만 호출 | `<TripSwitcherSheet>` 신규. 형제 노드로 렌더 |
| 활성 여행 판정 (`activeTripId`) | 읽기만 | 소유 (`lib/state/*`) |
| 전환 쓰기 | 없음 | 소유. **전환은 승인 게이트가 아니다** — 읽는 대상만 바뀐다 |
| 시트 닫힘 후 포커스 | `onOpenSwitcher` 호출자에게 `pillRef`를 노출한다 | 닫을 때 `pillRef.current?.focus()` |
| `day` 계산 | 계산식 소유 (§9) | `trips.start_date`/`end_date` 제공 |
| G3 미착륙 시 동작 | `onOpenSwitcher`가 없으면 pill = `/trips`로 가는 링크 | — |

**전환 시 라우팅 규칙(G2 결정, G3 구현)**: 여행을 바꾸면 현재 경로를 유지하지 않고 **`/trail`(그 여행의 대시보드)로 보낸다.**
`/trail/plan/budget`에 머무르면 다른 여행의 지갑 수치가 같은 화면에 갈아끼워져, 사용자가 어떤 여행을 보고 있는지 알 수 없다.
전환 후 `SESSION_NS:tab:*` 기억을 전부 비운다 — 기억은 여행이 아니라 탭에 걸려 있어서 이전 여행의 경로를 되살린다.

### G1과의 인터페이스 계약

- CSS는 **신규 파일 `app/nav.css`** (§4 "신규 화면 CSS는 새 파일로 격리"). `app/globals.css`의 `:root`는 건드리지 않는다.
- G2가 넣는 클래스: `.trip-bar` 계열, `.tab-bar[data-tabbar]`, `.tab-badge[data-kind]`, `.lens-nav`(기존 재사용).
- 최소 요건(§1 접근성 하한): pill·AI 칩 터치 타깃 44px, 포커스 링 가시, 활성 렌즈 밑줄은 색만으로 구분하지 않는다(밑줄 + 굵기).
- 프레임 -17~-20의 렌즈 밑줄은 앰버. 비활성 라벨 대비가 3:1 미만이면 G1이 색을 올린다.

---

## 7. 카피 교체표 — 파일 → 현재 → 새 문구 → 근거

`적용` 열: **G2**는 이번에 직접 고친다. **G{n}**은 G2가 문구를 확정하고 해당 그룹이 화면을 다시 만들 때 적용한다.

### 7.1 내비게이션

| 파일 | 현재 | 새 문구 | 프레임 | 적용 |
| --- | --- | --- | --- | --- |
| `shell.tsx` | 탭 `Trips` | `Trips` | -15 | G2 |
| `shell.tsx` | 탭 `Trail` | **탭 삭제** (`/trail/*`는 Trips 소속) | 손그림 | G2 |
| `shell.tsx` | 탭 `Ask AI` | `AI` | -15 | G2 |
| `shell.tsx` | 탭 `Bags` | `Bags` | -15 | G2 |
| `shell.tsx` | — | 탭 신설 `Home` | -15 | G2 |
| `trail/plan/layout.tsx` | 렌즈 `Route` | `Gifts` | -17 | G2 |
| `trail/plan/layout.tsx` | 렌즈 `People` | **제거** (→ Gifts ▸ Split) | -17 | G2 |
| `trail/plan/layout.tsx` | 렌즈 `Map` / `Budget` / `Delivery` | 그대로 | -18/-19/-20 | — |
| `trail/plan/layout.tsx` | `<Header title="Route & stores">` | 제거 → `trail` 워드마크 + 아바타 + 컨텍스트 바 | -17 | G2 |
| `trail/plan/layout.tsx` | 헤더 액션 `Edit` | 제거. 편집 진입점은 `◎ AI` → `/ask` | -17 | G2 |
| `trail/plan/layout.tsx` | `Your brief changed after you approved this route. Refresh the route in your brief before shopping.` | **`Plan changed — rebuild the route`** (제목) + 기존 문장(본문) | APP_SPEC §1.3 | G2 |
| `trail/plan/layout.tsx` | `NEEDS YOUR APPROVAL` | 그대로 | §2 대문자 라벨 규칙 | — |

### 7.2 Home · Trips

| 파일 | 현재 | 새 문구 | 프레임 | 적용 |
| --- | --- | --- | --- | --- |
| `app/(app)/home/page.tsx` (신규) | — | `Good morning.` / `Ready to explore {city}?` | -15, Home.png | G2 골격 |
| 〃 | — | `Plan with AI` · `RECOMMENDATIONS NEAR YOU` · `Nearby Stores` | -15 | G3 |
| 〃 | 프레임 `Current Location` | **`Shopping in`** — D10. 값의 출처는 센서가 아니라 `trips.city` | -15 | G3 |
| 〃 | 프레임 버튼 `Open Trail` | `Plan shopping` / `Open` / `Continue {city} Trail →` 3분기 — D10 | -15, §2 | G3 |
| `trips/page.tsx` | `<Header title="Trips">` | **`My Trips`** | `Mobile app with accessibility.png` | G2 |
| `trips/page.tsx` | `THIS TRIP` | `CURRENT` | 〃 | G2 |
| `trips/page.tsx` | `CURRENT TRIP` (trip-card) | `CURRENT` 구획 안이므로 중복 라벨 제거 | 〃 | G2 |
| `trips/page.tsx` | — | 구획 `UPCOMING` · `PAST` 신설 | 〃 | G3 |
| `trips/page.tsx` | — | 버튼 `Continue {city} Trail →` · `Plan shopping` · `Open` · `View` | 〃 | G3 |
| `trips/page.tsx` | `Save trip` | 그대로 (프레임에 없음) | — | — |
| `trips/page.tsx` | `{trips.length} TRIPS` 배지 | 그대로 | — | — |
| `trips/past/page.tsx` | `<Header title="Past trips">` | `PAST` 구획으로 흡수 여부는 G3 결정. 라우트는 유지 | 〃 | G3 |
| `account/memory/page.tsx` | `<Header title="Memory & privacy">` | 그대로 | — | — |
| `account/memory/page.tsx` | `PATTERNS IN USE` | `TRAIL REMEMBERS` | §2, -3 | G2 |
| `account/memory/page.tsx` | back → `/trips` | back → `/home` (D4) | — | G2 |

### 7.3 Trail 대시보드 (`/trail`)

| 현재 | 새 문구 | 프레임 | 적용 |
| --- | --- | --- | --- |
| `HANDS-FREE SOUVENIR TRAVEL` / `Shop local.\nKeep your hands free.` | `Good morning.` / `Ready to explore {city}?` | -2 | G3 (문구는 G2 확정) |
| 헤더 아바타 `aria-label="Open trips and account"` | `Open account` (Trips는 이제 탭이다) | — | G2 |
| — | 컨텍스트 바 `🇨🇦 Toronto ▾` (+ `Active` 배지) | -2 | G2 |
| — | 카드 라벨 `{CITY} TRAIL`, 통계 `Gifts` · `Stores` · `Walking` | -2 | G3 |
| journey-card `PLAN TODAY'S HANDS-FREE ROUTE` 외 4종 | 버튼 라벨을 `Start today's route →` / `Continue {city} Trail →` / `Arrange delivery →`로 통일 | -2, §2 | G3 |
| `TO YOUR HOTEL` / `Standard · fragile · chilled` | 지갑 표로 대체: `Total budget` · `Spent` · `Planned shopping` · `Reserved for delivery` · `Flexible` | -2, §2 | G3 |
| — | 행 `Made for {city}` · `Ask Trail AI` | -2 | G3 |

### 7.4 플랜 렌즈

| 파일 | 현재 | 새 문구 | 프레임 | 적용 |
| --- | --- | --- | --- | --- |
| `gifts/page.tsx` | `TRAIL'S HANDS-FREE ROUTE · {CITY}` + `Find it locally.\nSend it ahead.` | 목록 화면에서는 제거(프레임은 카드부터 시작). `<h1 className="visually-hidden">Gifts</h1>`만 남긴다 | -17 | G2 |
| `gifts/page.tsx` | `ROUTE READY` 배너 | `Shopping plan ready` | §2 상태 | G2 |
| `gifts/page.tsx` | `STOP 0{n} · {AREA} · {walk}` | 수령인 라벨 우선: `MOM` / `TWO FRIENDS` / `COWORKERS` — `recipient.name.toUpperCase()`, 없으면 기존 유지 | -17 | G2 |
| `gifts/page.tsx` | `Look for: {product}` | `{product}` (제품명이 카드 제목) | -17 | G2 |
| `gifts/page.tsx` | 카드 액션 `Save stop` / `Directions` / `Call info` | **유지.** 프레임의 `Request`는 `store_inquiries` 쓰기가 있어야 쓸 수 있는 말이다 — 지금 앱에는 재고 문의 액션이 없다. 토스트를 `Request`라고 부르면 헌법 2 위반 | -17 | 보류 → G4 |
| `gifts/page.tsx` | `Start my hands-free shopping route` | **`Start today's route →`** | §2 | G2 |
| `gifts/page.tsx` | — | 하단 행 `Divide the budget by person` → `/trail/plan/gifts/split` | — | G2 |
| `gifts/page.tsx` | — | 구획 `OTHER RECOMMENDATIONS` (자리만 확보) | -17 | G3 |
| `gifts/page.tsx` 빈 상태 | `No stops yet.` | 그대로. 버튼 `Talk to Trail` → **`Plan with AI`** | §2 | G2 |
| `map/page.tsx` | `ROUTE ORDER · {CITY}` + `Walk it in order.` | `TODAY'S ROUTE` + `<h1>Today's route</h1>` | -18 | G2 |
| `map/page.tsx` | — | 하단 버튼 `Start today's route →` (프레임 `Start shopping →`을 §2로 통일) | -18 / §2 | G2 |
| `budget/page.tsx` | `GIFT BUDGET` + `What is left to spend.` | `{CITY} TRIP WALLET` + `<h1>Trip Wallet</h1>` | -19, §2 | G2 |
| `budget/page.tsx` | `Planned for gifts` | `Planned shopping` | §2 | G2 |
| `budget/page.tsx` | `Protected for delivery` | `Reserved for delivery` | §2 | G2 |
| `budget/page.tsx` | `Flexible` | 그대로 | §2 | — |
| `budget/page.tsx` | `STILL AVAILABLE` / `OVER THE GIFT BUDGET` | `Spent` 행 추가 + `Total budget` 행 추가 (프레임 5행 표) | -19 | G2 |
| `budget/page.tsx` | `{currency} ${total} trip total` 문장 | `CAD $250 trip budget` 어법 유지 — `shopping budget`이라 쓰지 않는다 | §3 예외 1 | G2 |
| `budget/page.tsx` | `Talk to Trail about the budget` | `View live plan →` → `/trail/plan/gifts` | -19, §2 | G2 |
| `budget/page.tsx` | — | 행 `Divide the budget by person` → split | — | G2 |
| `delivery/page.tsx` | `HOTEL BAG TRANSFER` + `What can be sent ahead.` | `<h1>Hotel Delivery</h1>` | -20, §2 | G2 |
| `delivery/page.tsx` | `TRANSFER CHECK` / `Handling on this route` | 데이터 표로 교체: `Deliver to` · `Drop-off partner` · `Estimated arrival` · `Delivery cost` | -20, §2 | G2 |
| `delivery/page.tsx` | `DELIVERY FEE` / `Quoted at the counter` | `Delivery cost` / `{currency} ${fee} (reserved)` | -20 | G2 |
| `delivery/page.tsx` | `Choose bags and send them` | `Arrange delivery →` | -20, §2 | G2 |
| `delivery/page.tsx` | `Record a purchase first` (빈 상태) | 그대로 — 프레임에 빈 상태가 없다. 없는 값을 `Arrange`라고 부르지 않는다 | — | — |
| `gifts/split/page.tsx` | `WHO THIS TRIP IS FOR` + `Divide the\nshopping budget.` | 그대로 (§3 예외 1은 total을 가리킬 때만 적용. 여기는 실제로 `planned`를 나눈다) | — | — |
| `gifts/split/page.tsx` | `Talk to Trail who they are instead` 버튼 | `Tell Trail instead →` | — | G2 |
| `approval/page.tsx` | `APPROVALS` / `NEEDS YOUR APPROVAL` | 그대로 | §2 | — |

### 7.5 쇼핑 · 구매 기록

| 파일 | 현재 | 새 문구 | 프레임 | 적용 |
| --- | --- | --- | --- | --- |
| `trail/shop/page.tsx` | `<Header title="Shop in store">` | 제목 `Today` + 부제 `{city} · Day {n}` (day가 null이면 부제 생략) | -6 | G2 |
| `trail/shop/page.tsx` | `TODAY'S ROUTE` / `{n}/{m} stops bought` | `<h1>{n} of {m} gifts purchased</h1>` + `{p}% complete` | -6 | G2 |
| `trail/shop/page.tsx` | — | 구획 `PURCHASED` · `REMAINING` | -6 | G2 |
| `trail/shop/page.tsx` | `{n} left` 예산 pill | 하단 표 `Available for shopping` / `Protected for delivery` | -6 | G2 |
| `trail/shop/page.tsx` | `Send purchased bags to {hotel}` | `Go hands-free →` | -6 | G2 |
| `trail/shop/page.tsx` | `Bought in store` / `Not found` / `Skip` | 그대로 (프레임에 없음) | — | — |
| `.../record/page.tsx` | `<Header title="Record a purchase">` | `Record Purchase` | -4 | G2 |
| `.../record/page.tsx` | (질문 문구 없음) | `<h1>How much did you actually pay?</h1>` · `Planned amount` · `Actual price paid` · `Quick amounts` · `Confirm purchase` | -4 | G2 |
| 예산 초과 시트 | — | `Budget Update` / `OVER PLAN` / `You're {cur} ${n} above the amount planned for {name}.` / `Adjust my plan` · `Find cheaper options` · `Increase budget` · `Continue anyway` | -5 | G2 문구 확정, 화면은 미존재 → §11 |

### 7.6 AI

| 파일 | 현재 | 새 문구 | 프레임 | 적용 |
| --- | --- | --- | --- | --- |
| `ask/page.tsx` | `<Header title="Ask Trail">` | **`Trail AI`** + 부제 `{city} · Day {n} · {currency} · {hotel}` | -14, §2 | G2 |
| `ask/page.tsx` | back → `/trail` | back 제거 (탭 루트다). 아바타를 우상단에 | -14 | G2 |
| `ask/page.tsx` | `Trail AI · prototype` | `Trail AI` + `Ready` 배지 | -16 | G2 |
| `ask/page.tsx` | `TRAIL REMEMBERS` | 그대로 | §2 | — |
| `ask/page.tsx` | `I UNDERSTOOD` 제안 칩 | `HERE'S WHAT I'VE GOT` 요약 카드로 통합 | -14, §2 | G4 |
| `ask/page.tsx` | `View brief` | `Edit details` | -14, §2 | G2 |
| `ask/brief/page.tsx` | `<Header title="Shopping brief">` | `Edit details` | §2 | G2 |
| `ask/brief/page.tsx` | `{n} details understood` | 그대로 (하드코딩 94%는 이미 제거됨) | — | — |
| `ask/brief/page.tsx` | `Find stores along my route` | **`Create my Trail plan →`** | -14/-16, §2 | G2 |
| `ask/brief/page.tsx` | `Refresh stores along my route` | `Rebuild my Trail plan →` | 파생 | G2 |
| `ask/brief/page.tsx` | `GIFT BUDGET` | `Total budget` | §2 | G2 |
| AI 응답 | `protect CAD $9 for hotel delivery` | `your delivery money stays protected` | §3 예외 6 | G4 |

### 7.7 가방 · 배송

| 파일 | 현재 | 새 문구 | 프레임 | 적용 |
| --- | --- | --- | --- | --- |
| `bags/select/page.tsx` | `<Header title="Hotel bag transfer">` | `Hands-Free Delivery` | -7 | G5 |
| `bags/select/page.tsx` | `Choose the bags.\nKeep exploring.` | `Ready to go hands-free?` + `Bags` · `Est. weight` · `Time left` | -7 | G5 |
| `bags/select/page.tsx` | (버튼) | `Review delivery →` | -7 | G5 |
| `bags/review/page.tsx` | `<Header title="Review transfer">` | `Review your delivery` | -8 | G5 |
| `bags/review/page.tsx` | `Choose a counter.` | 라벨 `DELIVER TO` · `DROP OFF AT` · `DETAILS`, 데이터 라벨 `Deliver to` · `Drop-off partner` · `Bag count` · `Delivery cost` | -8, §2 | G5 |
| `bags/review/page.tsx` | — | `{cur} $9 is reserved in your Trail wallet but has not been charged yet.` | -8 | G5 |
| `bags/review/page.tsx` | (버튼) | `Continue to payment →` | -8 | G5 |
| `bags/pay/page.tsx` | `<Header title="Pay for delivery">` | **`Pay for hotel delivery`** | -9, §2 | G5 |
| `bags/pay/page.tsx` | `<Header title="Payment failed">` | `Payment` + 패널 `Payment didn't go through` | -10 | G5 |
| `bags/pay/page.tsx` | (결제 버튼) | `Pay {currency} ${amount}` | §2 | G5 |
| `bags/pay/page.tsx` | — | `Apple Pay (simulated)` (로고 없음) · `Sample card · nothing is stored` · `Use another payment method` | §3 예외 2·3 | G5 |
| `bags/pay/page.tsx` | — | 실패 액션 `Try again` · `Use another payment method` · `Cancel delivery` | -10 | G5 |
| (신규) 드롭오프 | — | `Drop your bags` · `HOW IT WORKS` · `Staff count the bags with you` · `I handed the bags over` | -11, §3 예외 4·5 | G5 |
| `bags/track/page.tsx` | `PURCHASED BAGS` / `Your hands are free.` | `Bag Tracking` + `<h1>Your bags are on the way</h1>` | -12, §2 | G5 |
| `bags/track/page.tsx` | `STATUS_COPY.awaiting_payment = "Confirmed · waiting for payment"` | **`Waiting for payment`** — `Confirmed`는 확정어다 | 헌법 · §2 | **G2** |
| `bags/track/page.tsx` | `dropped_off: "With the partner"` | `Dropped off` | §2 상태 | G2 |
| `bags/track/page.tsx` | `in_transit: "On the way to your hotel"` | `On the way to hotel` | §2 상태 | G2 |
| `bags/track/page.tsx` | `delivered: "Delivered to your hotel"` | `Delivered` | §2 상태 | G2 |
| `bags/track/page.tsx` | `paid: "Paid · take the bags to the counter"` | `Collected by Trail`은 커스터디 이전 후의 상태다. `paid`는 `Paid · take the bags to the counter` 유지 | 원장 | — |
| `bags/track/page.tsx` | 데이터 행 | `Destination` · `Bag count` · `Tracking ID` · `Payment` | -12, §2 | G5 |
| `bags/track/page.tsx` | — | `Delivery complete →` (완료 화면으로 가는 **링크**, 단계 상승 버튼 아님) | -13, §1-6 | G5 |
| `lib/state/selectors.ts` `DELIVERY_STEPS` | (확인 필요) | `Dropped off` · `Collected by Trail` · `On the way to hotel` · `Delivered` | -12, §2 | **G2** |
| (신규) 완료 | — | `Delivery Complete` / `Delivered.` / `Keep exploring.` / `View receipt` · `Rate Trail` · `Continue exploring {city} →` | -13 | G5 |

### 7.8 온보딩 · 실패 화면

| 파일 | 현재 | 새 문구 | 프레임 | 적용 |
| --- | --- | --- | --- | --- |
| `app/onboarding/*` | (확인 후 적용) | 첫 진입 CTA는 `Let's start →`, 완료 CTA는 `Create my Trail plan →` | §2 | G2 |
| `app/(app)/blocked.tsx` | 이송 불가 6코드 · 인계 실패 4코드 | **문구를 건드리지 않는다.** 프레임에 없다고 지우지 않는다 | §1-2 | — |

---

## 8. 배포 시 기존 사용자에게 일어나는 일과 완화책

| # | 일어나는 일 | 원인 | 완화 |
| --- | --- | --- | --- |
| 1 | 탭 기억이 1회 초기화된다. 각 탭이 기본 착지점으로 감 | `SESSION_NS` = `trail:v2` | 감수. sessionStorage는 탭 세션 범위라 영향은 1회. **localStorage(`trail-cache-v4:*`)는 손대지 않는다 — 여기에 오프라인 아웃박스와 구매 초안이 있다** |
| 2 | `trail:tab:trail = "/trail/plan/people"`이 죽은 경로를 가리킴 | 렌즈 재편 | ① v2 네임스페이스로 애초에 읽지 않음 ② `/trail/plan/people` 308 리다이렉트 stub 유지 ③ `isStale`에 people 규칙 |
| 3 | `trail:tab:ask`가 고아가 됨 (`ask` 키가 사라짐) | TabKey 개명 | `sweepLegacySession()`으로 `trail:`(v2 아님) 키 일괄 삭제 |
| 4 | 북마크·공유된 `/trail`이 Trail 탭 하이라이트를 잃음 | 탭 삭제 | `/trail`은 그대로 열리고 **Trips**가 활성. 라우트는 살아 있다(D2) |
| 5 | `/`로 들어오던 사용자가 `/trail` 대신 `/home`에 착지 | `app/page.tsx` 변경 | 의도된 변경. `/home`이 비면 §5의 빈 상태가 받는다 |
| 6 | 이송 진행 중인 사용자 | — | `bagsHref` 로직 불변. `inMotion` → `/bags/track` 그대로. **배포 전 회귀 테스트 1순위** |
| 7 | 결제 대기 중(`awaiting_payment`)인 사용자 | `/bags/pay` 탭바 숨김 | back 화살표가 이미 있음(`/bags/review`). 탭바가 없어도 탈출 가능 |
| 8 | 스크롤 위치 1회 유실 | `RESTORE` 키 개명 | 감수 |
| 9 | 승인 대기(`pendingBudgetChange`) 중인 사용자 | 렌즈 재편 | 승인 배너를 4렌즈 + split 전부에 유지. `/trail/plan/approval` 라우트 불변 |
| 10 | People 화면을 쓰던 사용자 | 파일 이동 | 라우트 리다이렉트 + Gifts·Budget 두 곳에 진입점. **본문 코드 무변경** |

**배포 순서**: 리다이렉트 stub과 `sweepLegacySession()`을 **탭 개명과 같은 커밋**에 넣는다. 나누면 그 사이 배포에서 6·2번이 실제로 터진다.

**릴리스 게이트 (release-qa 확인 항목)**
1. 4탭 각각 탭 → 착지 → 다른 탭 → 되돌아오기: 마지막 위치 복원
2. `/bags/pay`에서 Bags 탭 → `/bags/track`(또는 select)로 가고 결제 폼으로 돌아가지 않음
3. `inMotion` 상태에서 Bags 탭 → `/bags/track`
4. `/trail/plan/people` 직접 입력 → `/trail/plan/gifts/split`
5. `pendingBudgetChange` 있을 때 4렌즈 + split 전부에 배너
6. 탭바 숨김 화면 5곳 전부에 back 어포던스 존재
7. 스크린리더: 탭 4개 이름이 `Home / Trips / AI / Bags`로 읽힘, `aria-current="page"` 1개

---

## 9. 마이그레이션 `0024_stop_planned_date.sql` — 왜 G2 소관이고 G3 다음인가

### 왜 G2인가

`stops.planned_day`는 **앵커 없는 서수**다. 1일차가 언제인지 테이블 어디에도 없다.
그런데 §2가 요구하는 내비게이션 문구와 라우팅 판정이 전부 "오늘"에 의존한다:

- `Day {n} of {m}` — 컨텍스트 바(프레임 -2)와 AI 헤더 부제(프레임 -14)
- `Start today's route →` — Gifts·Map 렌즈의 주요 액션(§2)
- `Today` / `{city} · Day 2` — 쇼핑 화면 헤더(프레임 -6)
- `continueHref`의 `todayStopCount` 분기 — 오늘 살 것이 없는데 `/trail/shop`으로 보내면 빈 화면

여행자가 하루 늦게 도착하면 `planned_day = 2`인 정거장이 "오늘"인지 아무도 모른다.
그러면 `Day 2 of 4`는 거짓말이고, `Start today's route →`는 어제의 경로를 연다.
**이것은 데이터 결함이 아니라 내비게이션 결함이다** — 화면을 잘못 고르는 문제이므로 G2가 연다.

### 내용

```sql
-- 0024_stop_planned_date.sql
alter table public.stops add column planned_date date;

update public.stops s set planned_date = t.start_date + (s.planned_day - 1)
  from public.trips t where t.id = s.trip_id and t.start_date is not null;

create index stops_trip_date_idx on public.stops (trip_id, planned_date, sequence);
```

- **`planned_day`를 지우지 않는다.** 날짜가 없는 플랜(`trips.start_date is null`)은 여전히 서수만 갖는다.
  `planned_date`는 nullable이고, null이면 `Day n of m`을 **렌더하지 않는다**(모르면 안 쓴다).
- **`trips`에 타임존 컬럼을 추가하지 않는다.** "오늘" 판정은 클라이언트의 기기 날짜와 여행 날짜 범위로만 한다.
  서버가 "오늘"을 주장하지 않는다. 시차를 넘는 여행자의 경계 사례는 **G3의 후속**으로 남긴다(여행 단위 타임존은 `trips` 소유).
- 파생 규칙(G2 소유): `day = { n, of }`는 `trip.startDate`와 `trip.endDate`가 **둘 다** 있고 오늘이 그 범위 안일 때만.
  범위 밖이거나 날짜가 없으면 `day = null`.
- `lib/state/types.ts`에 `Stop.plannedDate: string | null` 추가, `shape.ts`/`queries.ts` 매핑 1줄씩.

### 순서 — 반드시 G3 다음

§4: `types.ts` · `queries.ts` · `shape.ts`는 마이그레이션을 여는 그룹이 수정하되 **충돌 시 G3 우선**.
0018의 backfill이 `trips.start_date`를 읽으므로 **G3의 0021~0023(다중 트립 리팩터)이 먼저 머지되어야 한다.**
G3가 `trips`의 활성 판정이나 날짜 컬럼을 손대면 0018의 backfill이 잘못된 여행을 기준으로 채워진다.

```
G3: 0021 · 0022 · 0023  ─┐
                          ├→ G2: 0024 (planned_date)
G2: 탭/렌즈/카피 (DB 무관) ─┘   ※ DB 무관 작업은 0020 이전에 시작해도 된다
```

**G2는 0024 없이도 §1~§8을 끝낼 수 있다.** 그동안 `day = null`, `todayStopCount = undefined`로 동작하고,
`Day n of m`과 오늘 분기만 비활성이다 — 없는 값을 그리지 않는 쪽이 기본값이다.

---

## 10. 작업 단위 · 크기 · 순서

| # | 작업 | 파일 | 크기 | 선행 |
| --- | --- | --- | --- | --- |
| T1 | `landing.ts` 재작성 (TabKey · tabOf · tabRoot · hidesTabBar · isStale · bagsHref 보정) | `app/(app)/landing.ts` | M | — |
| T2 | `shell.tsx` 탭 4개 · v2 네임스페이스 · 스윕 · 탭바 숨김 · Bags 배지 | `app/(app)/shell.tsx` | M | T1 |
| T3 | `/home` 라우트 골격 + 빈/오류 상태 + `app/page.tsx` 리다이렉트 변경 | `app/(app)/home/page.tsx`, `app/page.tsx` | S | T1 |
| T4 | People → `gifts/split` 이동 + stub + 진입점 2곳 | `trail/plan/{people,gifts/split,gifts,budget}` | S | — |
| T5 | 컨텍스트 바 컴포넌트 + `app/nav.css` 골격 | `components/trip-context-bar.tsx`, `app/nav.css` | M | — |
| T6 | 플랜 레이아웃 렌즈 4개 · 헤더 교체 · `aria-current` 접두 판정 · 잠금 배너 슬롯 | `trail/plan/layout.tsx` | M | T5 |
| T7 | 카피 적용 — 렌즈 4개 + shop + record + ask + trips + memory | §7.2~7.6의 G2 행 | L | T6 |
| T8 | 상태 문구 정리 (`STATUS_COPY`, `DELIVERY_STEPS`) — 확정어 제거 | `bags/track/page.tsx`, `lib/state/selectors.ts` | S | — |
| T9 | 마이그레이션 0024 + `types/shape/queries` 3줄 + `day` 파생 | `supabase/migrations/0024_*.sql`, `lib/state/*` | S | G3 0023 |
| T10 | 문서 3종 동기화 | §12 | S | T1~T8 |

---

## 11. G2가 발견했지만 G2가 만들지 않는 화면 (인계 목록)

빈 상태와 실패 화면을 함께 내지 않는 것이 이 앱의 상습 결함이므로, 여기서 명시하고 그룹에 넘긴다.

| 화면 | 상태 | 인계 |
| --- | --- | --- |
| `Budget Update` / `OVER PLAN` (프레임 -5) | **화면 없음.** 지금은 shop의 인라인 경고뿐 | G4/G5 아님 — **G2가 문구 확정(§7.5), 화면은 `/trail/plan/approval`의 변형으로 G3가 구현**. 헌법 4 "실제가 예산 초과" |
| 이송 불가 (`blocked.tsx` 6코드) | 컴포넌트는 있으나 **전용 화면 없음** | G5. §1-2로 문구 보존 확정 |
| 호텔 인계 실패 (4코드) | 같음 | G5 |
| 지연·봉인 이상 신고 | 없음 | G5 |
| 영수증 상세 | 없음 | G5 (`/bags/receipt/[transferId]`, 탭 배정 완료 §1) |
| 계정·설정 | `/account/memory` 하나뿐 | G6 이후. 탭 배정은 `home`으로 확정(D4) |
| Delivery 탭 빈 상태 (구매 0건) | `delivery/page.tsx`에 있음 | 유지. `Arrange delivery →`로 바꾸지 않는다(§7.4) |
| 여행 0건 | `(app)/layout.tsx`가 `/onboarding`으로 보냄 | 유지 |
| 플랜 없음 | Gifts 빈 상태 | 유지, 버튼 문구만 `Plan with AI` |

---

## 12. 문서 동기화 — 무엇을 어떻게 고치는가

지금 내비게이션이 **세 문서에서 서로 다르다.** 이것 자체가 최대 결함이다.

| 문서 | 현재 | 고칠 내용 |
| --- | --- | --- |
| `docs/TRAIL_USER_FLOW_EN.md` §"Permanent app navigation" | `Home` · `Ask AI` · `Shop` · `Bags` | **4항목을 `Home` · `Trips` · `AI` · `Bags`로 교체**하고 각 한 줄 정의를 아래처럼 다시 쓴다. `Shop`은 탭이 아니라 Trips 안의 모드임을 명시 |
| `docs/APP_SPEC.md` §1.1 | `Trips · Trail · Ask AI · Bags`로 확정 + "Home을 별도 탭으로 두지 않는 이유" 단락 | **확정을 `Home · Trips · AI · Bags`로 뒤집는다.** 기존 단락은 삭제하지 않고 "1차 결론 — `FIGMA_ADOPTION.md` §0에서 뒤집힘"으로 표시하고, 감수하는 비용(여행 0건일 때 Home/Trips 중복)을 §5의 빈 상태로 한정한다고 적는다 |
| `docs/APP_SPEC.md` §1.2 (탭 선택 규칙) | `Trail`·`Trips` 기준 | 표의 착지 열을 새 탭 이름으로. `여행 0건 → Trips`는 실제로는 `/onboarding` 리다이렉트이므로 그렇게 정정 |
| `docs/APP_SPEC.md` §1.3 | 렌즈 4개 + People 언급 없음 | `Gifts ▸ Split` 하위 라우트 추가, `Plan changed — rebuild the route` 배너 문구 유지 확인 |
| `docs/APP_SPEC.md` §1.5 (라우팅) | `/` → 활성 탭, `/trail/plan/...` | `/` → `/home`, `/home` 신설, `/trail/plan/gifts/split` 추가, `/trail/plan/people` 리다이렉트 명시 |
| `docs/MIGRATION_PLAN.md` | P0~P5. 0013까지 | **P6 섹션 신설** — 피그마 전면 반영(G0~G6)과 마이그레이션 배정(G0 0020 · G3 0021-0023 · G2 0024 · G4 0025 · G6 0026-0027), 그리고 §9의 순서 그래프 |
| `docs/FIGMA_ADOPTION.md` §3 예외표 | 예외 6곳 | **7곳으로 늘리고 `Current Location` 행을 추가한다** (D10). 예외는 정본에 있어야 한다 — 계획 문서에만 두면 문서가 갈라진다. 그 외 §2 표는 손대지 않는다 |

**`TRAIL_USER_FLOW_EN.md`에 넣을 새 문단 (영문 확정본)**

```
## Permanent app navigation

- **Home** — Morning view. Trip wallet, what the trip is waiting on, and local
  recommendations. Every card that is not live inventory is labelled Sample.
- **Trips** — Every trip on the account, and the workbench for the active one:
  the plan (Gifts, Map, Budget, Delivery), the in-store shopping mode, and the
  purchase record.
- **AI** — Trail AI. Conversation, the brief it builds, and plan changes. Trail
  recommends and calculates; it never approves.
- **Bags** — Everything after a purchase: choosing bags (including bags bought
  outside the plan), drop-off, payment, tracking, receipts, and reporting a
  problem.

Shop is not a tab. It is a mode inside Trips, entered from the plan and left
when the traveler goes hands-free.
```
