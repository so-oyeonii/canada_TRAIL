# 다음 차례 — 피그마 반영(G0~G6) 이후

2026-08-18 사용자 제안 3건. **G0~G6이 끝난 뒤에 착수한다.** 지금은 명세만 남긴다.
셋 다 기존 스키마와 겹치는 부분이 있어, 착수 전에 아래 "이미 있는 것"을 먼저 확인해야
없는 걸 새로 만드는 낭비를 피한다.

---

## N1. 위치 기반 알림 — "여기 근처에 뭐 있어"

**하고 싶은 것**
앱을 쓰는 동안 GPS를 켜 두고, 미리 등록해 둔 수령인·특징·내가 좋아하는 것과 맞는 매장이
근처에 오면 알린다.

**이미 있는 것**
- `recipients` — `name` · `relationship` · `preference_note` · `priority` · `is_optional`
- `stores` — `lat` · `lng` · `area` · `hours_note` · `source`
- `products` — `category` · `tags[]` · `handling` · `price_cents` · `source`
- `store_hours` (마이그레이션 0011) — 영업시간 판정
- `memory_constraints` — "엄마에게 도쿄에서 다기 세트를 샀다" 같은 기억

**없는 것**
- 위치 권한을 받는 경로가 통째로 없다. 지오코딩도 없다.
- 알림 채널이 없다 — 웹 푸시(Service Worker + `PushManager`)든 인앱이든 아직 아무것도.
- "내가 좋아하는 것" 자체 등록 UI가 없다 (수령인 취향은 있는데 **본인** 취향은 `is_self`
  수령인으로만 표현된다).
- 지오펜스 판정과 그 빈도·배터리 정책.

**먼저 풀어야 하는 것**
1. **피그마 반영에서 내린 결정을 다시 연다.** `docs/FIGMA_ADOPTION.md` §2 예외표의
   `Current Location → Shopping in`은 "앱에 위치 권한 경로가 없다"가 근거였다. N1을 하면
   그 근거가 사라지므로 문구를 되돌릴지 함께 정한다.
2. **좌표의 보관·삭제 정책.** 마이그레이션 0007의 계정 삭제는 `auth.users` 캐스케이드
   기반이라 **새 테이블은 자동으로 걸리지 않는다.** 위치 이력을 저장한다면 0007에 함께 넣어야
   한다. 저장하지 않는 설계(브라우저에서만 판정)가 가능한지 먼저 본다 — G3가 추천 피드에서
   이미 그 길을 택했다(도시명만 서버로, 거리는 브라우저에서).
3. **알림이 곧 위치 추적이라는 사실.** "이 사람은 지금 여기 있다"를 서버가 알게 되는 순간
   `VENTURE_BRIEF` §7.4가 경고한 데이터셋이 한 단계 더 민감해진다.
4. **환각 통제.** 알림 문구가 매장 이름을 말하려면 카탈로그가 실데이터여야 한다.
   `products`가 `source='sample'`인 동안에는 알림에도 `Sample`이 붙어야 한다(제품 규칙 3).

**실행 기록 (N1-0 · N1-1a · N1-1b · N1-2 완료 · 마이그레이션 0건 · API 라우트 0건)**

계획서는 `docs/plans/N1-location-alerts.md`. 웹 플랫폼 판정(§1)에 따라 **"앱이 열려 있을 때만"**으로
착지했고, 사용자가 그 제약을 듣고 승인했다. **N1-3(웹 푸시)는 만들지 않았다** — §Q4의 재개 조건
다섯 개 중 하나도 충족되지 않았고, `0030`은 원장에 **잡아 두지 않았다.**

| 단계 | 무엇이 생겼나 |
| --- | --- |
| N1-0 | `useNearby`가 단발 `getCurrentPosition` → **모듈 싱글턴 `watchPosition`**. `visibilitychange`로 끊고 잇고, 20분 정지하면 스스로 `ready`로 내려앉는다. `Using your location · Turn off` 칩 |
| N1-1a | 진입 250 m / 이탈 400 m 히스테리시스 · 75 m·60초 스로틀 · 하루 3건(샘플이면 2건) · 20분 쿨다운 · **매장당 여행 1회** · 여행지 시간대 21–08시 무음. 인앱 배너 + `/account/nearby` |
| N1-1b | 1순위 신호 배선. `stops` select에 `store_id` + `stores(lat,lng)` embed(플래그 뒤), `Stop.storeId`·`Stop.storePoint`. **컬럼은 0001에 이미 있어 마이그레이션 0건** |
| N1-2 | `registration.showNotification()` + `sw.js`의 `notificationclick`. 캐시 규칙 5개는 한 줄도 안 건드렸다. iOS 제약을 설정 화면이 문장으로 말한다 |

**위 4번(환각 통제)의 답**: 알림 경로에 모델이 없다. `lib/discovery/alert-copy.ts`는 템플릿뿐이고
`tests/trail-nearby-alerts.test.ts`가 그 파일들에 `fetch(`·`/api/`·`lib/supabase`가 없는지 스캔한다.
`source !== 'live'`면 제목에 `Sample`, 본문 끝에 `Sample data — stock isn't confirmed.`, 하루 상한 2건.

**위 1번의 답**: `Shopping in`은 되돌리지 않았다. `FIGMA_ADOPTION.md` §2 예외표 1행의 이유를
개정하고 8행(`NEAR YOU` · `Using your location`)을 추가했다.

**위 2·3번의 답**: 좌표는 저장하지 않는다 — 그래서 0007에 엮을 테이블이 없다. 기기에 남는 것은
`trail:nearby:v1:{userId}:{tripId}` 하나이고 값은 `{매장id: 시각}`뿐이다. `alert-memory.ts`의 어떤
함수 시그니처에도 좌표 타입이 없어 **컴파일러가 막는다.**

---

## N2. 자투리 시간 쇼핑 — "1시간 남는데 뭐 살까"

**하고 싶은 것**
"지금 1시간 남고, 여기 있고, 몇 시까지 어디로 가야 한다"를 AI에 말하면 그 틈에 살 수 있는
것을 추천받는다.

**이미 있는 것**
- `trips.free_time` — 자유 시간이 이미 트립 속성으로 있다
- `stops.walk_minutes` — 도보 시간
- `stops.planned_day` / `planned_date`(G2의 `0024`)
- `delivery_pricing`의 `dropoff_cutoff` — "몇 시까지"의 서버 쪽 짝
- Trail AI 한 턴 구조(`app/trail-brief.ts`의 `TURN_SCHEMA`, 레이트리밋, 동일 출처)

**없는 것**
- **시간 예산을 받는 대화 필드.** `TURN_SCHEMA`에 "지금부터 N분" 개념이 없다.
  G4가 만드는 `preference_tags`의 경로 태그 3종(`short_walk`/`moderate_walk`/…)이 가장 가까운
  기존 자리다.
- 출발지·마감시각·목적지를 받는 입력. `free_time`은 문자열("2 hours")이지 시각이 아니다.
- 왕복 시간 계산. 지도·경로 벤더가 없어 지금은 도보 시간이 카탈로그에 박힌 값이다.

**설계 메모**
- 이건 **N1의 위치 없이도 절반이 된다.** "어디 있는지"를 지역명으로 받으면(온보딩의 `areas`
  재사용) 위치 권한 없이 첫 버전이 나온다. N1보다 먼저 할 수 있다.
- AI가 "몇 시까지 도착"을 계산해 말하는 순간 그건 약속이 된다. 제품 규칙상 **Trail은 추천만
  하고 판단은 사용자가 한다** — 문구를 `You'd have about 20 minutes at each stop`처럼
  여지를 남기는 형태로 정해야 한다.
- 마감시각이 `dropoff_cutoff`를 넘으면 그날 배송이 안 된다. 이 화면은 이송 불가 6코드 중
  `cutoff_passed`와 직접 연결된다 — 추천에 그 사실이 함께 나와야 한다.

---

## N3. 수령인 우선순위 — "이 사람 건 무조건"

> **상태: 구현됨.** 실행 계획과 결정 근거는 `docs/plans/N3-recipient-priority.md`.
> 아래 "없는 것" 절은 작업 전 기록이다. 지금은 다음이 있다 —
> `lib/budget/priority.ts`(순수 모듈), `Gifts ▸ Split`의 3단계 마크,
> `Gifts`·`매장 모드`의 배지·정렬·경고, 초과 시 "must-buy를 지키는 분배 제안"(계산만,
> 저장은 기존 버튼), 그리고 AI가 매긴 순위를 `confirm`으로 내리는 방벽.
> **"무조건"은 자동 구매가 아니다** — 무엇이 마지막에 밀려나는가의 답이다.
> 마이그레이션 0건 · 새 승인 경로 0건 · 새 API 라우트 0개.

**하고 싶은 것**
누가 더 중요한지 표시해 두면 그 사람 선물은 무조건 살 수 있게 돕는다.

**이미 있는 것 — 이게 셋 중 가장 많이 만들어져 있다**
- `recipients.priority smallint not null default 3 check (priority between 1 and 5)`
  (마이그레이션 0001)
- `recipients.is_optional boolean not null default false`
- `lib/state/types.ts`의 `Recipient`에 `priority`·`isOptional`이 **이미 실려 있다**
- `plan_allocations` — 수령인별 배분
- 예산 초과 승인 게이트(`0013`, `decideAllocations`의 `exceeds_planned` → proposal)

**없는 것**
- **우선순위를 보여주거나 바꾸는 UI가 하나도 없다.** 값은 있는데 화면이 없다.
- 예산이 모자랄 때 우선순위를 실제로 쓰는 로직. 지금 `decideAllocations`는 총액만 본다.
- "무조건 산다"의 정의 — 예약(reserve)인가, 경로 우선 배치인가, 초과 시 다른 사람 것을
  줄이자는 제안인가.

**설계 메모**
- **가장 싸고 효과가 큰 항목이다.** 스키마도 타입도 이미 있어서 UI와 규칙만 얹으면 된다.
- 다만 "무조건"은 예산 규칙과 정면으로 만난다. 우선순위 1번을 채우려고 flexible을 쓰는 것은
  **승인 없이는 불가능하다**(제품 규칙 5, `0013`). 그러므로 이 기능의 정직한 형태는
  "자동으로 산다"가 아니라 **"모자랄 때 무엇을 줄일지 제안하고 사용자가 승인한다"**이다.
- G6가 공유 화이트리스트에서 `recipients.priority`·`is_optional`을 **영구 제외**로 정했다
  (사람 순위표라서). N3의 UI가 생겨도 그 결정은 그대로 간다.
- G4의 요약 카드 `Shopping for — Mom, 2 Friends, Coworkers, Soo`에 우선순위 표시를 얹을
  자리가 이미 있다.

---

## 착수 순서 제안

`N3 → N2 → N1`. 만들어진 정도의 역순이고, 위험의 오름차순이다.
N3는 스키마가 이미 있고, N2는 위치 없이 첫 버전이 나오며, N1만 새 개인정보 범주를 연다.

**셋 다 끝났다.** 그리고 N1은 결국 새 개인정보 범주를 **열지 않았다** — 좌표를 서버로 보내는 경로를
만들지 않았으므로 저장할 것도, 삭제할 것도, 유출될 것도 없다. 남은 것은 N1-3(웹 푸시)뿐이고,
그것은 정확히 그 성질을 포기해야 열리기 때문에 보류다.
