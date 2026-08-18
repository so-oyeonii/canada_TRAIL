# N2 · 자투리 시간 쇼핑 — 파일 단위 실행 계획

기준 문서: `docs/BACKLOG_NEXT.md` §N2 · `docs/plans/G4-trail-ai.md` · `docs/FIGMA_ADOPTION.md` §1(협상 불가).
담당: `trail-ai-planner`(대화 정책·프롬프트 계약·환각 가드) + `trail-app-engineer`(화면) + `trail-platform-engineer`(카탈로그 쿼리 1건).
의존: G3(카탈로그·`lib/discovery/*`) · G4(`wiring.ts`·`ready.ts`·`ask-chips.ts`·`preference_tags`) **완료 후**. N1은 기다리지 않는다.

회의 결론 한 줄: **이 화면은 모델을 부르지 않고 완성된다.** 남은 시간·위치·마감은 전부 폼이 소유하고,
카탈로그·거리·컷오프는 전부 이미 있는 데이터다. 모델은 그 위에 얹는 **선택적 2층**이고, 그때조차
분(minute)과 시각을 한 개도 받지 못한다.

---

## 0. 착수 전 사실 확인 — BACKLOG가 "없다"고 적은 것 중 이미 생긴 것

`BACKLOG_NEXT`는 G0~G6 착수 전에 쓰였다. 그 사이 G3가 절반을 만들어 놓았다.

| BACKLOG의 서술 | 지금의 사실 |
| --- | --- |
| "위치 권한을 받는 경로가 통째로 없다" (N1) | **`lib/discovery/nearby.ts`의 `useNearby()`가 있다.** 명시적 탭에서만 호출, 좌표는 React state 밖으로 나가지 않는다 |
| "왕복 시간 계산이 없다" | `walkMinutesBetween()` + `WALK_METRES_PER_MINUTE=80` + **올림만 하고 내림하지 않는 규칙**이 `lib/discovery/distance.ts`에 있다 |
| "지역명으로 받으면 절반이 된다" | `trips.areas` + `stores.area` + 카탈로그 16행이 있다. 절반이 아니라 **8할** |
| "`dropoff_cutoff`가 서버 쪽 짝" | `GET /api/dropoff-points`가 이미 `cutoffAt` · `minutesToCutoff` · `open`(`store_hours`) · `serverTime`을 계산해 준다. **새로 계산할 것이 없다** |

따라서 N2의 실제 신규 작업은 **① 창(window)을 받는 입력 ② 왕복 차감과 그 정직한 표기 ③ 컷오프 배너
④ 모델이 시간을 약속하지 못하게 하는 가드** 넷뿐이다. 나머지는 배선이다.

---

## 1. 입력을 대화로 받는가, 폼으로 받는가 — **전부 폼(칩)**

G4가 온보딩에서 쓴 판단 기준을 그대로 적용한다: **검증이 필요한 값, 임계값으로 쓰이는 값,
모델에 보낼 수 없는 값은 폼이 소유한다.** 세 입력 모두 그 셋 중 하나 이상에 걸린다.

| 입력 | 소유 | 근거 |
| --- | --- | --- |
| **남은 시간** | 칩 4종 (`30 min` `1 hour` `90 min` `2 hours`) + `Until…`(시간 선택기) | 이 값은 곧바로 **필터 임계값**이 된다(왕복 차감의 피감수). 임계값을 모델 추출에 맡기면 카탈로그 필터가 추측 위에 선다. 게다가 오차가 **비대칭**이다 — 90을 60으로 읽으면 살 수 있는 것을 못 보고, 60을 90으로 읽으면 마감을 놓친다. 후자는 되돌릴 수 없다 |
| **지금 위치** | 지역 칩(`trips.areas` ∪ 카탈로그 `stores.area`) + `Use my location`(1탭, `useNearby`) | 지명 자유서술은 **지오코딩이 있어야** 좌표가 된다. 지오코딩은 없다. 모델이 "Queen West 근처군요"라고 매칭하면 그건 존재하지 않는 지역명을 만들 두 번째 통로이고, `replyAllowList`가 `trip.areas`를 통과시키므로 **`scrubReply`에도 안 걸린다** |
| **마감 시각 + 목적지** | 시각은 선택기/상대 칩(`+1h` `+2h`), 목적지는 **닫힌 3지선다** `My hotel` / `A drop-off point` / `Somewhere else` | 목적지를 자유 서술로 받으면 **호텔명이 그대로 프롬프트에 들어간다.** G4가 온보딩 6문답을 대화로 바꾸지 않은 이유와 정확히 같다 — `tests/trail-brief.test.ts:95`가 지키던 선이 옆문으로 뚫린다 |

### 그러면 대화는 무엇을 소유하는가
**아무것도 새로 소유하지 않는다.** N2는 `ASKED_FIELDS` 12종에 질문을 한 개도 더하지 않는다.
"무엇을 살까"는 이미 브리프가 답하고, "어디서·언제"는 이 화면의 폼이 답한다.

### 자유 서술은 버리지 않는다 — 칩 prefill로만 쓴다
사용자의 말 그대로("한 시간쯤 남았고 6시까지 호텔 가야 해")를 타이핑하는 경로는 살린다.
다만 **정규식이 뽑은 결과는 칩을 선택 상태로 미리 켤 뿐, 제출하지 않는다.** 사용자가 확인 탭을
해야 창이 열린다 — `app/trail-brief.ts`의 `suggested`(탭해서 수락) 규약과 같은 등급이다.

- 뽑는 것: 분/시간(`1시간` `an hour` `90분` `half an hour`), 상대·절대 시각(`6시까지` `till 6` `by 18:00`),
  지역(**`areas` 집합에 대한 정확 일치만.** 유사·부분 일치 금지 — 그게 지오코딩을 흉내내는 지점이다),
  목적지 3-enum(`호텔`/`hotel` → `hotel`, 그 외 미매칭은 `null`).
- 뽑히지 않으면 아무것도 켜지 않는다. 기본값을 추측하지 않는다.
- 파일은 `app/(app)/trail/spare/spare-input.ts`. **`inferPlanPatch`와 같은 파일에 두지 않는다** —
  저건 모델 실패 시 폴백이고 이건 항상 도는 입력 보조라 성격도 테스트 조건도 다르다.
- 부정문 규칙은 상속한다: `NEGATION`이 걸리면 그 조각은 추론하지 않는다("호텔은 안 가고" → `endsAt` null).

---

## 2. `TURN_SCHEMA`에 무엇을 더하는가 — **아무것도 더하지 않는다**

### 2-1 모델이 쓰는 필드는 만들지 않는다
근거 셋.

1. **폼이 소유하므로 모델이 채울 것이 없다.** 채우게 하면 같은 값에 진실이 둘 생긴다.
2. **`TURN_SCHEMA`는 브리프를 영구히 바꾸는 계약이다.** "지금부터 60분"은 5분 뒤에 거짓이 된다.
   영구 상태에 넣을 값이 아니다 — `trips.free_time`("2 hours")이 이미 그 실수를 하고 있고
   (시각이 아니라 문자열, 게다가 여행 전체 속성), N2는 그 실수를 반복하지 않는다.
3. strict `json_schema`는 필드 하나가 `required` 전수 + `ASK_CHIPS` 키 + `CLEAR_MAP` + `missingFields`를
   전부 끌고 온다(`tests/trail-brief.test.ts:144`가 그걸 강제한다). 이득 없이 계약만 커진다.

**`ASKED_FIELDS`는 12개 그대로.** 13번째가 생기면 `ASK_CHIPS` 13키와 `REQUIRED` 재정의가 따라오는데,
시간·위치·마감 중 어느 것도 `readyToPlan`의 조건이 아니다. 창 없이도 계획은 완성된다.

### 2-2 대신 모델이 **읽기만** 하는 컨텍스트를 더한다 (닫힌 형태)

`app/trail-brief.ts`:
```
export const SPARE_SIZES   = ["under_an_hour","about_an_hour","a_couple_of_hours","half_a_day"] as const;
export const SPARE_ENDS    = ["hotel","dropoff","elsewhere"] as const;
export const CUTOFF_STATES = ["open","closing_soon","passed","unknown"] as const;
export type SpareWindow = { size: SpareSize; area: string | null; endsAt: SpareEnd | null; cutoffState: CutoffState };
// TurnContext 에 window?: SpareWindow 추가 → briefContext 의 <brief> 블록에 window 절로 실린다
```

**분(minute)도 시각도 보내지 않는다.** `60`이 아니라 `about_an_hour`다. 이유는 §1-4의 뿌리와 같다 —
모델은 자기가 받지 못한 숫자를 인용할 수 없다. 예비비가 프롬프트에 없어서 예비비를 못 말하는 것과
같은 방식으로, 분이 프롬프트에 없어서 "20분이면 됩니다"를 못 말한다. 프롬프트를 믿는 대신 **입력을
비운다.** (`tests/trail-wallet.test.ts:40`의 형태를 그대로 복제한 가드가 §7-3.)

`area`만 문자열인데 이것도 자유롭지 않다 — 값의 출처는 `trips.areas` 또는 카탈로그의 `stores.area`이고
둘 다 `replyAllowList`가 이미 통과시키는 값이다. 새 어휘가 늘지 않는다.

`minutes → size` 매핑과 `trips.free_time` 대응(첫 칩 기본값으로만 읽는다):

| minutes | size | `free_time` |
| --- | --- | --- |
| < 45 | `under_an_hour` | — |
| 45–75 | `about_an_hour` | `1 hour` |
| 76–210 | `a_couple_of_hours` | `2 hours` · `3 hours` |
| > 210 | `half_a_day` | `Half day` · `Full day` |

---

## 3. 왕복 시간을 어떻게 계산하는가 — 숫자는 하나만 말한다

### 3-1 무엇을 알고 무엇을 모르는가
아는 것: 직선거리(haversine) · 80 m/min · **올림만**(`distance.ts`의 주석: "낙관적인 1분은 컷오프를 놓친
여행자다") · `stops.walk_minutes` · `ROUTE_TAG_MAX_MINUTES` = 8/20.
모르는 것: 실제 경로 · 신호 · 계단 · 지하철 · 줄 · **매장 안에서 보내는 시간**.

### 3-2 규칙
- **화면이 계산한다. 모델은 계산하지 않는다.** 이미 프롬프트에 있다("Walking times in the app are
  estimates; do not quote one"). N2는 그 줄을 강화만 한다(§6).
- 인쇄하는 숫자는 **도보 분 하나뿐**이고, 그건 앱이 이미 도처에서 쓰는 값이다(`8 min walk`).
  거리에서 나왔으므로 근거가 있다.
- **"거기서 몇 분"은 숫자로 말하지 않는다.** `browse = minutesLeft − (walkTo + walkBack) − BUFFER_MINUTES`를
  계산하지만, 그 결과는 **밴드 라벨로만** 나간다. 이유: 오차 원인이 넷(도보 추정 + 체류 + 줄 + 신호)
  겹쳐 있어 `20 minutes`는 물론 `20–30 minutes`도 근거가 없다. `about`을 붙여도 없는 정확도는 그대로다.

  | `browse` | 밴드 라벨 | 위치 |
  | --- | --- | --- |
  | ≥ 25 | `Time to browse` | 상단 |
  | 10 – 24 | `In and out` | 중간 |
  | < 10 | `Beyond this window` | **하단. 숨기지 않는다** |

  라벨 셋 다 숫자가 없고 성공을 단언하지 않는다. `Beyond this window`도 "못 간다"가 아니라
  "이 창 밖이다"이고, 사용자가 창을 늘리면 순서가 바뀐다.
- `BUFFER_MINUTES`는 상수(초안 **10**)이고 파일에 이유를 적는다: 계산에 없는 것(줄·결제·길 찾기)을
  대신하는 자리이지 여유가 아니다. **0이 되면 테스트가 깨진다**(§7-1).
- **좌표가 없으면 분을 인쇄하지 않는다.** `walkMinutesBetween`이 이미 null in / null out이다.
  이때 밴드도 계산하지 않고 두 등급만 그린다: `In this area` / `Another area`.
- 왕복은 **매장→마감 지점**이 아니라 **출발점→매장→출발점**으로 잡는다. 마감 지점(호텔)의 좌표는
  이 화면이 가질 수 없다 — 호텔 주소는 이 경로로 서버 밖에 나오지 않는다. 왕복을 원점 기준으로
  두는 것이 정직하고, 그 사실을 화면이 한 줄로 말한다: `Round trip from where you are now.`

### 3-3 한 번만 나가는 고지
결과 리스트 머리에 한 줄(카드마다 반복하지 않는다):
`Walking times are straight-line estimates. Queues, lights and the time inside a shop are not in them.`

---

## 4. 위치 없이 첫 버전이 되는가 — **된다. N1은 전혀 기다리지 않는다**

### 4-1 위치 없이 되는 것
지역 칩 선택 → 그 지역의 카탈로그 필터(`products.city` + `stores.area` + `preference_tags`) ·
영업 중 여부(`store_hours`) · 컷오프 상태(`/api/dropoff-points`) · 수령인 우선순위 정렬(N3) ·
`planned − spent` 대조. **이것만으로 화면 한 장이 완성된다.**

### 4-2 위치가 있으면 더해지는 것
도보 분 · 가까운 순 정렬 · 왕복 차감과 밴드. 전경에서 **탭 한 번**으로 얻는 fix이고,
`useNearby`가 이미 그 경로를 열어 두었다(마운트 시 자동 호출 없음, state 밖 저장 없음, 요청 바디에 없음).

### 4-3 N1과의 경계선 — N2가 **하지 않는** 세 가지
1. 좌표를 서버로 보내지 않는다. `GET /api/recommendations`는 도시명만 받는다(그 라우트의 주석이 계약이다).
2. 위치 이력을 저장하지 않는다. 저장하면 마이그레이션 `0007`(계정 삭제)에 새 테이블을 얹어야 하고,
   그건 `VENTURE_BRIEF` §7.4가 경고한 데이터셋을 한 단계 민감하게 만든다.
3. 백그라운드 fix·지오펜스·푸시를 만들지 않는다. **이 셋이 N1이다.** N2가 쓰는 것은 전경 1회 fix뿐이다.

### 4-4 §2 예외표는 건드리지 않는다
`Current Location → Shopping in`은 **그대로 둔다.** 홈 카드의 그 값은 여전히 온보딩에서 타이핑된
`trips.city`이고, N2의 1회 fix는 다른 화면의 다른 값이다. 한쪽에 센서가 생겼다고 센서에서 오지 않은
값의 이름을 바꾸면 라벨이 데이터와 갈라진다(§1-1과 같은 실수).

---

## 5. 마감 시각과 `dropoff_cutoff` — 배너 하나, 리스트는 막지 않는다

### 5-1 판정은 서버가 이미 한다
`GET /api/dropoff-points`가 `cutoffAt` · `minutesToCutoff` · `open` · `serverTime`을 준다. 벽시계 `time`을
매장 타임존으로 해석하는 산수는 `lib/transfers/clock.ts`에 있고 **두 번째 구현을 만들지 않는다.**

```
cutoffState = minutesToCutoff <= 0            → "passed"
              0 < m <= CLOSING_SOON_MINUTES   → "closing_soon"   // 초안 45
              partnerCount === 0              → "unknown"        // = no_partner_nearby
              그 외                            → "open"
```

### 5-2 어디에 그리는가 — 리스트 **위** 배너 한 줄
카드마다 붙이지 않는다. §1-1이 `source`를 행 단위로 붙이라고 한 것은 그것이 **행의 속성**이기 때문이고,
컷오프는 행이 아니라 **도시와 시각의 속성**이다. 카드에 붙이면 여섯 장이 같은 문장을 여섯 번 말한다.

### 5-3 문구 — 기존 상수를 그대로 재사용한다
| 상태 | 제목 | 본문 |
| --- | --- | --- |
| `passed` | `app/(app)/view.ts`의 `ineligibleCopy.cutoff_passed.title` **그대로** (`Today's drop-off has closed`) | `You can still buy. The bags go tomorrow, or you carry them.` |
| `closing_soon` | `Drop-off closes soon` | `Buying now leaves the handover to you.` |
| `unknown` | `ineligibleCopy.no_partner_nearby.title` 그대로 | 리스트는 그대로 그린다 |
| `open` | 배너 없음 | — |

문구를 새로 쓰지 않고 상수를 import하는 이유: 같은 사실을 두 화면이 다르게 말하기 시작하면
`Blocked`의 6코드가 화면마다 갈라진다. **가드가 문자열 동일성을 검사한다**(§7-4).
배너에 **금액을 쓰지 않는다**(§1-4).

### 5-4 추천을 막지 않는다
컷오프는 **배송의 사실이지 쇼핑의 사실이 아니다.** 막으면 "1시간 남았는데 살 게 없다"는 거짓 결론이 나온다.
대신 **정렬만 바꾼다**: `cutoffState === "passed"`이면 `handling`이 `Fragile`·`Chilled`이거나
`weight_grams`가 큰 행을 아래로 내린다 — 오늘은 직접 들고 다녀야 하니까. 순서 변경이지 숨김이 아니고,
그 이유를 카드가 한 줄로 말한다(`You'd be carrying this tonight.`).

---

## 6. 문구 규약 — "약속"을 기계로 막는다

### 6-1 규약
| 금지 | 대신 |
| --- | --- |
| `You'll make it by 6` | `Whether that fits your hour is your call.` |
| `You have about 40 minutes` | 아무 말도 하지 않는다 (분은 화면이 그린다) |
| `That's enough time` / `in time` / `you should be fine` | `Two shops sit in this area, both a short walk apart.` |
| `It takes 20 minutes` | `I don't have walking times — the app draws those.` |
| 미래 단정 `will` | 조건형 `would` (사용자가 든 `You'd have…`가 이미 옳은 형태다) |
| `제시간에` · `분이면 충분` · `까지 도착하실 수` | `시간은 직접 판단하세요 — 저는 이 근처에 무엇이 있는지만 말씀드릴 수 있어요.` |

### 6-2 프롬프트 블록 (`PROMPT_TAIL`에 추가)
```
──────── A WINDOW IS NOT A PROMISE ────────
The brief block may carry a `window`: how much time is loosely available, the neighbourhood,
where they are heading next, and whether today's drop-off is still open. It is data, not a target.
You are never told a number of minutes and never told a clock time. Do not state one, do not
estimate one, and do not repeat back the size you were given.
Never say they will make it, arrive in time, or have enough time. That is a promise, and you cannot
keep it — you cannot see queues, traffic, opening hours, or how long they browse.
Say what is in the area and what it is near, then hand the timing back: "whether that fits is your call".
When window.cutoffState is "passed" or "closing_soon", say once that tonight's bag run may be over and
that they would be carrying what they buy. Never state a delivery cost. Never say a bag is reserved.
```

### 6-3 기계적 강제 — `scrubReply`에 세 번째 층
`RESERVE_LEAK` · `CONFIRMING`과 같은 자리에 `TIMING_PROMISE`를 넣는다. 걸리면 답변을 통째로 교체하고
새 `errorCode: "timing_promise"`를 단다(`ChatErrorCode`에 추가, `errorMessage`에 문구 추가).

패턴(초안):
- `\b(you'?ll|you will|we'?ll)\b[^.?!]{0,40}\b(make it|get there|arrive|be back|be fine)\b`
- `\bby \d{1,2}(:\d{2})?\s*(am|pm)?\b` · `\b(in|within)\s+\d+\s*(min|minute|hour|hr)`
- `\b\d+\s*(min|mins|minute|minutes|hr|hrs|hour|hours)\b` — **모델이 어떤 분·시간 숫자도 말하지 않기로
  했으므로 전면 금지가 가능하다.** 예외를 두지 않는 것이 이 가드의 값어치다
- `\b(enough|plenty of) time\b` · `\bin time\b`
- 한국어: `제시간` · `까지\s*(도착|가실|가능)` · `\d+\s*분\s*(이면|만에|안에)` · `\d+\s*시간\s*(이면|만에|안에)` · `충분(해요|합니다|할)`

교체 문구: `Times are yours to judge — I can only tell you what's in the area.`
(한국어 답변에는 `KO_SHOP` 대체와 같은 방식으로 한국어 문구를 쓴다.)

**과잉 차단 회귀도 함께 테스트한다** — 정직한 문장이 살아남아야 한다(§7-2).

---

## 7. 가드와 테스트 — 없는 정확도를 말하지 않는지

전부 `node --test` · 순수 함수 · 모델 호출 0회.

### (1) `tests/trail-spare-window.test.ts` — 산수와 밴드
```
BUFFER_MINUTES > 0                                        // 0이 되면 실패. 낙관 방지가 이 상수의 존재 이유다
spareBand({ minutesLeft: 60, walk: 8 })  === "Time to browse"
spareBand({ minutesLeft: 30, walk: 12 }) === "Beyond this window"
spareBand(...) 의 모든 반환값에 /\d/ 가 없다              // 밴드는 라벨이지 숫자가 아니다
walkMinutesBetween(null, store) === null → reachLabel(null) 에 /\d/ 없음
왕복은 편도의 2배로 들어간다: fit({ walk: 9, minutesLeft: 30 }).browse === 30 - 18 - BUFFER_MINUTES
"Beyond this window" 행이 결과에서 제거되지 않는다 (하단 배치일 뿐)
```

### (2) `tests/trail-spare-copy.test.ts` — **핵심 가드**
```
// (a) 소스 스캔: 이 기능의 카피에 약속어가 없다
const src = ["app/(app)/trail/spare/page.tsx", "lib/discovery/window.ts"].map(read).join("\n");
assert.equal(/\byou'?ll\b|\bmake it\b|\barrive\b|\bin time\b|\benough time\b/i.test(src), false);

// (b) TIMING_PROMISE 가 대표 문장을 전부 잡는다 (영/한)
for (const line of ["You'll make it by 6.", "You have about 40 minutes.", "That's enough time.",
                    "It takes 20 minutes each way.", "You'll be back in time.",
                    "6시까지 도착하실 수 있어요.", "20분이면 충분해요.", "1시간 안에 가능합니다."])
  assert.equal(scrubReply(line, allow).errorCode, "timing_promise");

// (c) 역방향 — 정직한 문장은 통과한다 (과잉 차단 회귀)
for (const line of ["Two shops sit in this area, both a short walk apart. Whether that fits your hour is your call.",
                    "이 근처에 두 곳이 있어요. 시간이 될지는 직접 판단하세요.",
                    "I can't check opening hours — that has to be confirmed at the store."])
  assert.equal(scrubReply(line, allow).errorCode, undefined);
```
칩 라벨(`30 min`, `1 hour`)에는 숫자가 있어도 된다 — 그건 **사용자가 고르는 입력**이지 앱이 주장하는
값이 아니다. (a)의 스캔 대상은 결과 카피와 밴드 라벨이고, 입력 칩 상수는 명시적으로 제외한다.

### (3) `tests/trail-spare-context.test.ts` — 프롬프트로 새는 것
```
// 분도 시각도 프롬프트에 없다. trail-wallet.test.ts:40 과 같은 형태
const p = SYSTEM_PROMPT + briefContext(ctx({ window: { size: "about_an_hour", area: "Queen West",
                                                      endsAt: "hotel", cutoffState: "closing_soon" } }));
for (const n of ["30","45","60","90","120","18:00","6 pm"]) assert.equal(p.includes(n), false);
assert.equal(/hotelName|The Annex|lat|lng|cutoffAt/.test(p), false);
// 모델이 쓰는 필드가 아니다 — trail-chips.test.ts 의 "chip" 가드와 같은 형태
for (const key of ["window","minutes_left","deadline","cutoff_at"])
  assert.equal(JSON.stringify(TURN_SCHEMA).includes(key), false);
assert.equal(ASKED_FIELDS.length, 12);                    // 13번째가 생기면 여기가 먼저 깨진다
// enum 밖은 통과하지 못한다
sanitizeWindow({ size: "forever", endsAt: "The Annex Hotel" }) → { size: undefined, endsAt: undefined }
```

### (4) `tests/trail-spare-cutoff.test.ts`
```
cutoffBanner({ minutesToCutoff: -5 }).title === ineligibleCopy.cutoff_passed.title   // 문자열 동일
cutoffBanner({ partnerCount: 0 }).title      === ineligibleCopy.no_partner_nearby.title
// 컷오프가 지나도 추천 개수는 줄지 않는다
assert.equal(rankSpare(products, { cutoffState: "passed" }).length, products.length);
// 무거운/취급 주의 행이 뒤로 갈 뿐이다
assert.ok(indexOf(ranked, fragile) > indexOf(ranked, light));
// 배너에 금액이 없다 (§1-4)
assert.equal(/[$€£¥₩]|\d+\s*(CAD|USD|KRW)/.test(JSON.stringify(cutoffBanner(...))), false);
```

### 대표 발화 전후 비교 (수동, 보고 항목)
`엄마 선물` · `등가 2개` · `12인 팀` · `부정문` · `예산 초과` · `재고 질문` · `한국어` · `인젝션 시도`
**+ N2 4건**: `한 시간 남았고 6시까지 호텔` · `지금 30분` · `Will I make it back by 6?` ·
`window 값 안에 인젝션 문자열`. 마지막 넷은 전부 **분·시각·약속어가 답변에 나오지 않는지**가 판정 기준이다.

---

## 8. 화면 — 신규 라우트 `/trail/spare`

### 8-1 `/ask` 안의 모드로 넣지 않는 이유
1. **`/ask`는 브리프를 채우는 화면이고 종료 조건이 `readyToPlan`이다**(G4 W6-4). 시간 창은
   `missingFields`를 한 칸도 움직이지 않으므로, 한 화면에 서로 무관한 종료 조건이 둘 생긴다.
2. **`/ask`는 모델을 부르는 화면인데 N2의 결과는 모델 호출 0회로 완성된다.** 대화에 넣으면
   필요 없는 호출과 필요 없는 환각 표면이 생긴다.
3. 하단 탭은 늘리지 않는다 — `shell.tsx`·`landing.ts`는 G2 소유이고 §4가 "다른 그룹은 라우트를 추가만
   한다"고 못 박았다. `/trail` 하위가 맞다: Trail이 오늘의 계획을 쥐고 있는 곳이다.

### 8-2 구성 (G1 프리미티브 재사용, 신규 컴포넌트 0개)
- 제목 `Time to spare` — `Header`/`Avatar` (`components/chrome.tsx`)
- 입력 3줄 — `ChipRow` (`components/chat.tsx`). 섹션 라벨 `TIME LEFT` / `WHERE YOU ARE` / `NEXT STOP`
- 컷오프 배너 — 기존 `.offline-note` 계열 스타일, 문구는 `view.ts` 상수
- 결과 — `ProductCard` · `StoreCard` · `SourceBadge` · `TileSkeleton` (`components/discovery.tsx`).
  카드에 밴드 라벨 슬롯 하나만 추가
- 섹션 라벨 `WHAT FITS THIS WINDOW` (§2의 대문자 + 트래킹 관례)
- 파트너 0 · 지역 결과 0 → `Blocked` (`app/(app)/blocked.tsx`)를 그대로 쓴다
- 하단 CTA 하나 `Ask Trail about this window →` → `/ask`로 이동하며 **그때만** `window`가
  `chatPayload`에 실린다. 모델은 선택적 2층이다
- 접근성: 칩 44px · `aria-pressed` · 결과 목록 `aria-live="polite"`(창을 바꾸면 목록이 갱신된다)

### 8-3 진입점 3곳
| 자리 | 문구 | 비고 |
| --- | --- | --- |
| `/home` `Shopping in` 카드 아래 | `I have some time →` | G2/G3 소유 파일이라 **한 줄만** 추가 |
| `/trail/plan/map` 상단 | `I have some time →` | 경로 화면에서 가장 자연스럽다 |
| `/ask` starter 한 개 | `I've got an hour spare` | 탭하면 **대화가 아니라 `/trail/spare`로 라우팅**. 모델을 부르지 않는다 |

---

## 9. 스키마 변경 — **마이그레이션 없음**

창(window)은 세션 값이다. 저장하면 5분 뒤 거짓이 되는 행이 생기고, "좌표는 기기를 떠나지 않는다"는
G3의 결정과 정면으로 부딪친다. `trips.free_time`도 건드리지 않는다 — **첫 칩의 기본값으로만 읽는다.**

### `docs/FIGMA_ADOPTION.md` §4 원장에 요청할 것
| 번호 | 내용 | 소유 |
| --- | --- | --- |
| — | **N2는 마이그레이션을 열지 않는다.** 원장에 `N2 — no migration` 한 줄로 기록만 | N2 |
| `0030` | **예약 요청** — N3(수령인 우선순위)가 컬럼을 열 경우. `0026`~`0029`는 G6 예약이므로 N 블록은 `0030`부터 | N3 |

### 마이그레이션 아닌 스키마성 변경 1건 (쿼리만)
`GET /api/recommendations`가 지금 매장 영업시간을 주지 않는다. `stores.timezone`은 `0011`에 이미 있으므로
**컬럼 추가 없이 select만 넓힌다**:
- `lib/state/queries.ts` `RECOMMENDATION_SELECT`의 store 조인에 `timezone` 추가
- 라우트에서 `store_hours`를 한 번 더 읽어 `isOpenNow`를 붙인다(`/api/dropoff-points`가 하는 것과 동일)
- `Recommendation.store`에 `openNow: boolean | null` 추가. **null은 "모른다"이고 화면은 그때 아무 말도
  하지 않는다** — `isOpenNow`가 "행이 없으면 닫힘"으로 판정하는 것과 이 null은 다른 값이다
- 쿼리 파라미터 `?area=`(지역 칩) · `?open=1`(영업 중만) 추가. `Cache-Control: private, max-age=300`은
  유지 — 좌표가 안 들어가므로 여전히 사용자 간에 새지 않는다

---

## 10. N3(수령인 우선순위)에 요구하는 인터페이스

N3가 먼저 착수하므로 N2가 **소비할 형태**를 미리 못 박는다.

```
// lib/recipients/priority.ts — N3 소유
export function rankRecipients(recipients: Recipient[]): Recipient[]              // priority asc, is_optional 최후, 안정 정렬
export function unmetRecipients(recipients: Recipient[], stops: Stop[], purchases: Purchase[]): Recipient[]
export const PRIORITY_LABEL: Record<1|2|3|4|5, string>                            // 닫힌 맵. 자유 문자열 금지
```

조건 넷:
1. **순수 함수 + fetch 없음.** N2 화면이 렌더 중에 호출한다. DB 접근이 섞이면 이 화면이 두 번째
   로딩 상태를 갖게 된다.
2. **정렬은 클라이언트에서.** `priority`는 이미 `KnownRecipient`로 `/api/chat`에 실려 있고, N2가
   **추가로 보내는 것은 없다.** G6가 공유 화이트리스트에서 `priority`·`is_optional`을 영구 제외로
   정한 결정은 그대로 간다(사람 순위표다).
3. **"무조건"은 예약이 아니다.** N2의 결과는 **순서**일 뿐 예산을 잡지 않는다. flexible을 쓰려면
   여전히 승인이 필요하다(제품 규칙 5 · `0013`).
4. `unmetRecipients(...)`가 비면 N2는 **우선순위 줄을 아예 그리지 않는다.** 다 산 사람 목록을
   순위대로 다시 보여주는 것은 정보가 아니다.

N3가 늦어지면 N2는 `[...recipients].sort((a, b) => a.priority - b.priority)` 한 줄로 임시 대체하고
그 줄에 `// N3: lib/recipients/priority.ts 로 교체` 주석을 단다. 기능은 막히지 않는다.

---

## 11. 파일 단위 작업 목록

| # | 파일 | 신규/수정 | 규모 |
| --- | --- | --- | --- |
| 1 | `lib/discovery/window.ts` — `SPARE_SIZES`·`BUFFER_MINUTES`·`CLOSING_SOON_MINUTES`·`sizeOf()`·`fit()`·`spareBand()`·`reachLabel()`·`rankSpare()`·`cutoffBanner()` **전부 순수** | 신규 | **M** |
| 2 | `app/(app)/trail/spare/page.tsx` — 칩 3줄 + 배너 + 결과 리스트 | 신규 | **M** |
| 3 | `app/(app)/trail/spare/spare-input.ts` — 자유 서술 → 칩 prefill(정규식, 탭 수락) | 신규 | S |
| 4 | `app/(app)/trail/spare/spare.css` | 신규 | S |
| 5 | `app/trail-brief.ts` — `SPARE_SIZES`/`SPARE_ENDS`/`CUTOFF_STATES` enum · `SpareWindow` · `TurnContext.window` · `briefContext`의 `window` 절 · `sanitizeWindow()` · `PROMPT_TAIL`의 `A WINDOW IS NOT A PROMISE` · `TIMING_PROMISE` · `timing_promise` errorCode · `errorMessage` | 수정 | **M** |
| 6 | `app/api/chat/route.ts` — `buildContext`가 `payload.window`를 `sanitizeWindow`로만 통과 | 수정 | S |
| 7 | `app/(app)/ask/wiring.ts` — `ChatPayload`에 `window?`, `chatPayload(app, msg, history, window?)` | 수정 | S |
| 8 | `app/api/recommendations/route.ts` — `?area=`·`?open=`, `store_hours` 조인, `openNow` | 수정 | S |
| 9 | `lib/state/queries.ts` `RECOMMENDATION_SELECT` + `lib/state/shape.ts` `shapeRecommendation` + `lib/state/types.ts` `RecommendedStore` | 수정 | S |
| 10 | `lib/discovery/use-recommendations.ts` — `area`/`open` 파라미터 통과 | 수정 | S |
| 11 | `components/discovery.tsx` — `ProductCard`에 밴드 라벨 슬롯(옵션 prop 하나) | 수정 | S |
| 12 | `app/(app)/home/page.tsx` · `app/(app)/trail/plan/map/page.tsx` · `app/(app)/app-state.tsx`(starter 1개) — 진입점 | 수정 | S |
| 13 | `tests/trail-spare-window.test.ts` · `trail-spare-copy.test.ts` · `trail-spare-context.test.ts` · `trail-spare-cutoff.test.ts` | 신규 | **M** |

권장 순서: **1 → 5 → 13 → 8·9·10 → 2 → 3·4 → 11·12.**
(`window.ts`와 `trail-brief.ts`의 계약, 그리고 그 계약을 지키는 가드가 화면보다 먼저다. G4가
"배선이 페이지 안에 인라인이어서 테스트가 닿지 못했다"로 배운 것과 같은 순서다.)

---

## 12. 기존 테스트 중 손대는 것 / 손대면 안 되는 것

**손댄다** — `tests/trail-brief.test.ts`(`TurnContext`에 `window` 추가로 ctx 리터럴 타입 갱신, 그리고
"브리프 블록에 창이 실려도 숫자가 없다" 케이스로 승격) · `tests/trail-discovery.test.ts`
(`RecommendedStore`에 `openNow` 추가분).

**손대면 안 된다** — 빨개지면 우리 변경이 틀린 것:
`trail-wallet.test.ts:40,49`(예비비가 프롬프트 토큰을 못 바꾼다 — `window`도 같은 규칙 아래 들어간다) ·
`trail-brief.test.ts:23,95,103,110,117` · `trail-reply.test.ts` 전체 · `trail-chips.test.ts`
(`ASK_CHIPS` 키 12개) · `trail-ask-gate.test.ts` · `trail-approval-gate.test.ts` · `trail-transfers.test.ts`.

---

## 13. N1 없이 가는 범위 / N1이 오면 좋아지는 것

| | N2 단독 (지금) | N1 이후 |
| --- | --- | --- |
| 창을 여는 주체 | **사용자가 화면에 들어와 칩 3개를 탭한다** | 앱이 먼저 말을 걸 수 있다 — 다만 "지금 한가한가"를 아는 근거는 여전히 없다. 캘린더가 없으면 N1이 있어도 이 부분은 안 된다 |
| 위치 | 지역 칩, 또는 탭 1회 전경 fix | 지오펜스 — 매장 앞을 지날 때 |
| 도보 분 | fix가 있을 때만 인쇄, 없으면 `In this area` / `Another area` | 항상 |
| 컷오프 | 이미 완전하다 (`/api/dropoff-points`) | 그대로 |
| 저장되는 개인정보 | **없음** | 새 범주가 열린다 → `0007` 개정 + `VENTURE_BRIEF` §7.4 재심 |

**결론: N2는 N1의 어떤 산출물도 필요로 하지 않는다.** BACKLOG의 착수 순서 `N3 → N2 → N1`은 그대로
유효하고, N2가 N3에 요구하는 것은 §10의 순수 함수 두 개뿐이며 그마저 임시 대체가 가능하다.

---

## 남긴 TODO (이번 범위 아님)

- `trips.free_time`(문자열)의 은퇴. 시각이 아니라 문자열이고 여행 전체 속성이라 이 기능에는 쓰이지
  못한다. 다만 지금 컬럼을 바꾸면 `0020`의 GRANT 목록·온보딩·편집 화면이 함께 움직인다. **N2는 읽기만
  한다.**
- 카탈로그가 `live`로 바뀌면 `NAMING_NO_CATALOG` → `NAMING_CATALOG` 스왑. 그때 이 화면의 결과 카드가
  `{p3}` 형태 id를 통해 모델의 문장에 등장할 수 있게 되지만, **그때도 분과 시각은 계속 프롬프트에
  넣지 않는다.** §2-2의 근거는 카탈로그와 무관하다.
- "자투리 시간에 실제로 무엇을 샀나"의 학습. `plan_events`에 `actor:'spare_window'`로 남기고 싶어지는
  자리인데, 그건 시각·위치 로그의 첫 걸음이라 **N1의 프라이버시 심사를 통과한 뒤에만** 연다.
