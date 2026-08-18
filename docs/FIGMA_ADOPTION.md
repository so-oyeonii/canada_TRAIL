# 피그마 전면 반영 — 결정 기록

2026-08-18. TF 7인 합동 점검(`docs/figma/` 22프레임 + 사용자 재업로드 보드 13프레임 대조) 이후,
**사용자 지시로 범위를 넓힌다.** 이 문서가 모든 작업 그룹의 단일 기준이다.

## 0. 방향 전환

1차 회의는 비용·리스크를 근거로 발견 피드·탭 개명·`+ Invite` 세 가지를 기각했다.
사용자가 이를 뒤집었다 — **와이어프레임의 기능을 전부 넣고, 이름도 최대한 그대로 쓰고, 디자인도 반영한다.**
따라서 아래 결정이 1차 회의 결론을 대체한다. 기각 사유는 삭제하지 않고 "감수하는 비용"으로 남긴다.

| 항목 | 1차 결론 | **확정** | 감수하는 비용 |
| --- | --- | --- | --- |
| 하단 탭 이름 | 현재 유지 | **`Home / Trips / AI / Bags`** | `tabOf`·`staleForTab`·`bagsHref` 재작성, sessionStorage 무효화 |
| 홈 화면 | 내용만 교체 | **`Home` 탭 신설 + 대시보드** | 여행 없음일 때 Home과 Trips의 내용 중복 |
| 플랜 렌즈 | 4개 | **`Gifts / Map / Budget / Delivery`** | People 화면을 Gifts 하위로 이동 |
| 근처 추천 · 매장 피드 | 만들지 않음 | **만든다** | 카탈로그 큐레이션이 도시마다 반복. 전 카드 `Sample` |
| `+ Invite` | 읽기 전용 공유로 축소 | **만든다 (2단 구성)** | RLS·FK 재설계. 그래서 **마지막 그룹**이다 |
| 다크 테마 | 전면 전환 | **전면 전환** | — |
| 와이어프레임 카피 | 선별 | **최대한 그대로** | §3의 예외 6건만 제외 |

## 1. 협상 불가 — 어떤 그룹도 이걸 깨지 않는다

기능을 다 넣는 것과 거짓말을 하는 것은 다르다. 아래는 "빼는 것"이 아니라 **"정직하게 만드는 방법"**이다.

1. **실데이터가 아닌 것은 행 자체의 `source` 컬럼을 읽어 `Sample` / `Simulated`를 표시한다.**
   섹션 단위로 "이 영역은 샘플"이라 쓰지 않는다 — 나중에 일부만 `live`가 되면 라벨이 데이터와 갈라진다.
2. **실패 분기 네 개는 살아 있어야 한다.** 와이어프레임에 결제 실패 화면 하나뿐이라고 해서
   `app/(app)/blocked.tsx`의 이송 불가 6코드 · 호텔 인계 실패 4코드를 지우지 않는다.
3. **Apple Pay 로고를 그리지 않는다.** 실제 지원 시에만 쓸 수 있는 상표다. 텍스트 라벨 + `Simulated`.
   `Saved Visa •••• 4242`는 `Sample card · nothing is stored`로 쓴다 (4242는 Stripe 테스트 번호다).
4. **AI는 배송비 금액을 말하지 않는다.** 도시별 견적값이라 모델이 말하면 환각이다.
   요약 카드의 `Delivery — CAD $9 reserved` 행은 클라이언트가 `wallet.reserveCents`에서 그린다.
5. **이모지 아이콘 대신 `components/icons.tsx`의 SVG를 쓴다.** 스크린리더가 "amphora"로 읽는다.
   국기만 예외(`aria-hidden` + 옆에 도시명).
6. **`Delivery complete →`는 완료 화면으로 가는 링크다.** 완료 판정은 `transfer_events` 원장이 한다.
   사용자가 눌러 배송 단계를 올리는 구조로 되돌리지 않는다.

추가로 접근성 하한: 대비 4.5:1(본문)·3:1(비텍스트), 터치 타깃 44px, 포커스 링 가시.
와이어프레임의 미래 타임라인 스텝(2.22:1)과 OVER PLAN(4.41:1)은 **색을 올려서** 쓴다.

## 2. 이름 — 와이어프레임 문구를 정본으로 삼는다

구현 문구가 다르면 **와이어프레임 쪽으로 바꾼다.** 아래에 없는 화면은 각 그룹이 프레임에서 직접 옮긴다.

### 내비게이션
| 자리 | 이름 |
| --- | --- |
| 하단 탭 | `Home` · `Trips` · `AI` · `Bags` |
| 플랜 렌즈 | `Gifts` · `Map` · `Budget` · `Delivery` |
| 트립 컨텍스트 바 | `🇨🇦 Toronto ▾` + `◎ AI` |

### 화면 제목
`Good morning.` / `Ready to explore {city}?` · `My Trips` · `Trail AI` · `Trip Wallet` ·
`Hotel Delivery` · `Bag Tracking` · `Drop your bags` · `Pay for hotel delivery` ·
`Your bags are on the way` · `Made for {city}`

### 섹션 라벨 (대문자 + 트래킹)
`CURRENT` · `UPCOMING` · `PAST` · `RECOMMENDATIONS NEAR YOU` · `Nearby Stores` ·
`TRAIL RECOMMENDATIONS` · `HOW IT WORKS` · `HERE'S WHAT I'VE GOT` · `BUDGET SUMMARY` ·
`{CITY} TRIP WALLET` · `TRAIL REMEMBERS`

### 버튼
`Plan with AI` · `Continue with Trail AI →` · `Let's start →` · `Create my Trail plan →` ·
`Edit details` · `Continue {city} Trail →` · `Plan shopping` · `Open` · `View` ·
`View live plan →` · `Arrange delivery →` · `Pay {currency} ${amount}` ·
`Use another payment method` · `I've dropped off my bags` · `Delivery complete →` ·
`Start today's route →` · `Build my route →` · `Alternatives`

### 데이터 라벨
`Total budget` · `Spent` · `Planned shopping` · `Reserved for delivery` · `Flexible` ·
`Deliver to` · `Drop-off partner` · `Delivery cost` · `Destination` · `Bag count` ·
`Tracking ID` · `Payment` · `Estimated arrival` · `Day {n} of {m}`

### 상태
`Dropped off` · `Collected by Trail` · `On the way to hotel` · `Delivered` · `In progress` ·
`Shopping plan ready` · `Hotel verified` · `Reserved` · `Sample` · `Simulated`

### 카피 예외 — 와이어프레임을 따르지 않는 7곳
| 와이어프레임 | 쓸 문구 | 이유 |
| --- | --- | --- |
| `Current Location` (Home 카드) | `Shopping in` | 이 값의 출처는 센서가 아니라 온보딩에서 여행자가 입력한 `trips.city`다. 앱에 위치 권한 경로가 없다 |
| `CAD $250 shopping budget` | `CAD $250 trip budget` | $250은 total. 쇼핑 가능액은 `planned − spent` |
| `Saved Visa •••• 4242` | `Sample card · nothing is stored` | 저장된 적 없는 카드 |
| `Apple Pay` + 로고 | `Apple Pay (simulated)`, 로고 없음 | 상표 사용 조건 |
| `Confirm the number of bags` | `Staff count the bags with you` | 개수 대조의 주체는 직원. 커스터디 이전 시점이 흐려진다 |
| `I've dropped off my bags ✓` | `I handed the bags over` | 체크는 확정어. 이건 사용자의 주장이지 커스터디 이전이 아니다 |
| AI: `protect CAD $9 for hotel delivery` | `your delivery money stays protected` | §1-4 |

## 3. 작업 그룹

의존 순서: **G0 → G1 → (G2 · G3 · G4 · G5 병렬) → G6**

| 그룹 | 이름 | 범위 | 담당 |
| --- | --- | --- | --- |
| **G0** | 기반 수리 | 다통화 100배 오차 · 포커스 아웃라인 · `dev-signin` 가드 · `trips` 컬럼 권한 · `/workflow` · 로그인 프래그먼트 | platform · qa |
| **G1** | 디자인 시스템 | 다크 전면 · 앰버/틸 토큰 · 서체 3벌 · 라디우스 스케일 · 컴포넌트 22종 리스킨 · 신규 5종 | design · app |
| **G2** | 내비게이션 · 네이밍 | 탭 4개 개명 · 렌즈 4개 · 라우트 재배치 · 트립 컨텍스트 바 · §2 카피 전면 적용 | product · app |
| **G3** | 트립 · 발견 | 다중 트립 리팩터 · My Trips 3구획 · Home 대시보드 · 추천/매장 피드 · 카탈로그 시드 | platform · app |
| **G4** | Trail AI | `/ask` 배선 복구 · 칩 온보딩 · 요약 카드 인라인 · 선호 태그 · 카피 | ai · app |
| **G5** | 짐 · 배송 | QR 드롭오프 · 수직 타임라인 · Delivery 탭 · 결제 수단 · Delivery Complete | platform · app |
| **G6** | 공유 | `+ Invite` — 1단 읽기 전용 공유 링크, 2단 공동 편집 | platform · product |

각 그룹은 착수 전 자체 회의를 열어 파일 단위 실행 계획을 만들고, 그 계획을 이 문서 옆에
`docs/plans/G{n}-*.md`로 남긴다.

## 4. 그룹 간 계약

여러 그룹이 같은 파일을 만지므로 아래를 먼저 고정한다.

- **`app/globals.css`의 `:root` 토큰 블록은 G1만 수정한다.** 다른 그룹은 토큰을 쓰기만 한다.
- **`app/(app)/shell.tsx`와 `landing.ts`는 G2만 수정한다.** 다른 그룹은 라우트를 추가만 한다.
- **`lib/state/types.ts` · `queries.ts` · `shape.ts`는 마이그레이션을 여는 그룹이 수정한다.** 충돌 시 G3 우선.

### 마이그레이션 원장 — 번호는 여기서만 배정한다

> ⚠️ **`0014`~`0019`는 우리 것이 아니다.** 같은 저장소에서 **다른 세션이 설문 기능을 동시에
> 작업 중**이고 `0014_survey_responses.sql`을 이미 점유했다(`app/survey/`, `app/api/survey/`,
> `lib/survey/`, `docs/surveys/`, `public/survey/`, `survey` 브랜치). 그쪽이 더 쓸 여지를 남겨
> **우리 블록은 `0020`부터** 잡는다. 어떤 그룹도 `survey` 관련 파일을 건드리지 않는다.

| 번호 | 내용 | 소유 |
| --- | --- | --- |
| `0014`–`0019` | **예약 — 설문 세션(타 작업)** | — |
| `0020` | **`trips` 컬럼 GRANT 잠금** + DELETE revoke + 트리거 2개 | **G0** |
| `0021` | 트립 생애주기 전이 + `trips.timezone` + `archive_trip()` + `discard_provisional_trip()` | G3 |
| `0022` | 과거 여행 지출 집계 뷰 (`security_invoker` 필수) | G3 |
| `0023` | 카탈로그 시드 + 추천 조회 + **`preference_tag`·`route_tag` enum 정의** | G3 |
| `0024` | `stops.planned_date` | G2 |
| `0025` | `plans.preference_tags` · `plans.route_tag` · `update_plan_brief()` (**enum 정의는 `0023`**) | G4 |
| `0026` | `trip_shares` — 1단계 읽기 전용 공유 (철회 가능한 토큰) | G6 |
| `0027` | `trip_members` + `trip_invites` — 2단계 공동 편집 | G6 |
| `0028` | 기존 15개 테이블 정책 재작성 — 2단계 | G6 |
| `0029` | `actor_user_id` + `approve_budget_change` 재정의 — 2단계 | G6 |
| — | **N3 — 마이그레이션 없음.** `recipients.priority`·`is_optional`은 `0001`에 이미 있고 `recipients`에는 컬럼 GRANT가 없다 | N3 |
| — | **N2 — 마이그레이션 없음.** 창(window)은 세션 값이라 저장하면 5분 뒤 거짓인 행이 된다. 쿼리 확장 1건(`RECOMMENDATION_SELECT`에 `stores.timezone`, `store_hours` 조인)뿐이고 컬럼은 늘지 않는다 | N2 |

**기각된 것** — `payment_methods`와 사진 노출. 저장된 카드가 없으므로 테이블은 존재하지 않는
카드를 서술하는 행이 되고, 25프레임 어디에도 가방 사진이 없다. 번호를 배정하지 않는다.

**`0020`이 G0인 이유.** 권한 잠금은 `lib/state/*`를 건드리지 않아 §4 계약과 충돌하지 않고,
**G3이 `saveTrip({status})`를 만든 뒤에 잠그면 G3의 작업을 부순다.** 그래서 잠금이 먼저다.

번호를 새로 쓰려면 이 표에 먼저 추가한다. 각 마이그레이션은 적용 후 `get_advisors` 보안 린트까지가 한 세트다.

### G3 → G0 인수인계 (`0020` 설계에 반영할 것)

1. **`timezone`을 컬럼 GRANT 화이트리스트에 넣는다.** 빠지면 도시를 바꿔도 zone이 굳는다.
2. **`provisional_until`은 화이트리스트에서 뺀다.** 서버 전용이다.
3. **`POST /api/trips`의 "플랜 실패 시 트립 삭제" 보상 로직이 DELETE revoke에 걸린다.**
   `0020`에 임시 예외를 두지 말고, G3의 `0021`이 주는 `discard_provisional_trip(uuid)`
   definer 함수로 대체한다.
4. **통화 동결 조건은 "구매 존재"가 아니라 "플랜 존재"다.** 구매가 0건이어도 `plans.*_cents`는
   이미 `toMinorUnits`로 그 통화에 묶여 있어서, 구매 0건 트립의 통화를 바꾸면 지갑이 조용히
   100배 틀린다.

### G0 → G3 답신 (`0020` 작성 완료, 원격 미적용)

1. **`timezone`은 `0020`에 넣지 못했다.** 컬럼이 아직 없어 `grant update (timezone)`이
   `column "timezone" of relation "trips" does not exist`로 실패한다. **`0021`이 컬럼을 추가하는
   같은 파일에서 `grant update (timezone) on public.trips to authenticated;`를 반드시 함께 쓴다.**
   빠뜨리면 도시를 바꿔도 zone이 굳는다. `0020`의 GRANT 블록 주석에 이 문장을 남겨 뒀다.
2. **`provisional_until`은 화이트리스트에 없다.** 넣지 않았고, `tests/trail-trip-grants.test.ts`가
   이 컬럼이 GRANT·`TRIP_WRITABLE` 어느 쪽에도 들어오지 못하게 지킨다.
3. **`POST /api/trips`의 보상 삭제는 `0020` 적용 시점부터 실패한다.** 임시 예외는 두지 않았다.
   대신 삼켜지던 `await db.from("trips").delete()`의 에러를 읽어, 실패 시 `console.error` + 응답에
   `{ cleanup: "orphaned", tripId }`를 실어 보낸다. **`0021`이 `discard_provisional_trip(uuid)`를
   줄 때까지 플랜 쓰기가 실패한 트립은 지갑 없이 남고, `resolveTripId`가 그걸 집을 수 있다.**
   이 구간을 짧게 유지하는 것이 G3의 우선순위 1번이다.
4. **통화 동결은 "플랜 존재"로 구현했다.** `exists (select 1 from public.plans where trip_id = old.id)`.
   `POST /api/trips`가 트립과 플랜을 한 쌍으로 쓰므로 사실상 생성 시점부터 동결이다.
   `tests/trail-trip-grants.test.ts`가 이 트리거에 `public.purchases`가 다시 들어오는 것을 막는다.

**GRANT 목록과 `TRIP_WRITABLE`은 이제 테스트가 대조한다** (`tests/trail-trip-grants.test.ts`).
스캔 대상은 전 마이그레이션의 합집합이므로, `0021`이 `timezone`을 GRANT하면 그 테스트가
`app/(app)/app-state.tsx`의 `TRIP_WRITABLE`에도 넣으라고 알려 준다.

### G3 → 전 그룹 회신 (`0021`·`0022`·`0023` 작성 완료, 원격 미적용)

1. **`timezone`은 `0021`이 컬럼 추가와 같은 파일에서 GRANT한다.** `TRIP_WRITABLE`에도 들어갔다.
   폼은 이 필드를 보내지 않는다 — `PATCH /api/trips/[id]`가 도시에서 유도해 서버가 쓴다.
2. **`provisional_until`은 GRANT에 없다.** 서버 전용이고 `parseTripPatch`가 이름으로 거절한다.
3. **`POST /api/trips`의 보상 삭제는 `discard_provisional_trip(uuid)`로 대체됐다.** 그 함수가
   실패하면 응답은 여전히 `{ cleanup: "orphaned", tripId }`를 싣고, 그 트립은 `My Trips`에
   `Incomplete — no budget`으로 **보인다.** 숨기지 않는다.
4. **enum 정의는 `0023`으로 옮겼다.** `0025`는 `plans`만 담당한다. 정의가 두 곳이면
   마이그레이션이 중간에 실패하므로 `tests/trail-trip-status.test.ts`가 한 곳임을 강제한다.
5. **`0024`(`stops.planned_date`)는 `0021~0023` 뒤에 적용한다.** 0024 파일의 주석과 같다.
6. **캐시가 `trail-cache-v4:*` → `v5`로 갈렸다. §4의 "v4를 스윕하지 마라"는 그대로 지켰다** —
   `adoptLegacyOutbox()`가 v4 엔트리 안의 미전송 큐를 v5 키로 **먼저 옮긴 뒤에야** 엔트리를
   지운다(`opId` 기준 멱등). 구매 초안(`trail:draft:record:*`)은 접두사가 달라 애초에 대상이 아니다.
   **v5의 아웃박스는 유저당 하나**이므로 트립 전환이 미전송 쓰기를 지우지 않는다.

### 나머지 계약

- **신규 화면 CSS는 새 파일로 격리한다** (`app/home.css`, `app/trips.css`, …).
  기존 규칙 삭제는 G1이 마지막에 한 번에 한다.
- **저장 대기 배지(`sync-chip`, `pending:` 접두사 표시)를 새 카드에도 옮긴다.**
  이 앱에서 조용히 성공한 척하는 것이 가장 위험한 실패다.
- **localStorage `trail-cache-v4:*`는 어떤 그룹도 스윕하지 않는다.** 오프라인 아웃박스와
  구매 초안이 거기 있다. 무효화 대상은 sessionStorage(`trail:` → `trail:v2:`)뿐이다.
- **라우트 경로는 바꾸지 않는다.** 탭 키와 URL 세그먼트를 분리해 라벨·소속만 개명한다
  (G2 결정). `/trail/*`는 그대로 살아 있어 기존 딥링크가 깨지지 않는다.

## 5. 판정 — 확정됨 (2026-08-18, 사용자 승인: "모두 추천하는 대로")

| 건 | **확정** | 근거 |
| --- | --- | --- |
| `Rate Trail` (프레임 `-13`) | **이번 범위에서 제외.** 화면에 버튼을 그리지 않는다 | 저장 테이블이 없는 버튼은 "조용히 성공한 척"이다. 무엇에 대한 평점인지(Trail 전체 / 이번 배송 / 파트너 매장)가 사업 결정으로 선행돼야 한다. `0028`은 미배정으로 남긴다 |
| `+ Invite` → `Share` | **1단계는 `Share`, 2단계에서 `+ Invite` 복귀** | 라벨이 실제 노출 범위를 바꾼다. `Invite`는 "한 사람에게 보낸다"를, `Share`는 "이건 퍼진다"를 심는다. 1단계가 주는 것은 관전권뿐이다 |
| `Request` (프레임 `-17`) | **상태 칩만 유지.** 버튼을 그리지 않는다 | 재고 문의를 받을 매장이 없다. 수신자 없는 버튼은 주문·예약으로 읽혀 제품 규칙 2와 부딪힌다. `stop.inquiry` 상태 칩(`Waiting on the store` / `Store confirmed stock`)은 이미 구현돼 있다 |

이 셋은 §2의 이름 규칙보다 우선한다. 와이어프레임에 있는 요소를 화면에서 빼는 유일한 세 곳이며,
이유는 전부 §1(협상 불가)과 같다 — **없는 것을 있다고 말하지 않는다.**
