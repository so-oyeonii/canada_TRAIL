# N3 — 수령인 우선순위 실행 계획

2026-08-18. `docs/BACKLOG_NEXT.md` §N3의 착수 문서. **N3 → N2 → N1 중 첫 번째.**
`docs/FIGMA_ADOPTION.md` §1(협상 불가)·§2(이름)와 `CLAUDE.md` 제품 규칙 1·5 아래에서 만든다.

사용자의 말: *"각 어떤 사람이 더 중요한지 표시해 놓는다면 어떤거는 무조건 살수있도록 도와줄테니까
그 기능도 있으면 좋겠어"*

---

## 0. 한 줄 판정

**우선순위는 "무엇을 사 준다"가 아니라 "무엇이 마지막에 밀려나는가"의 답이다.**
Trail은 이 값으로 아무것도 사지 않고, 아무 돈도 옮기지 않으며, 아무것도 예약하지 않는다.
순서를 바꾸고, 모자랄 때 무엇을 줄일지 **이름을 대서 제안**하고, 놓치기 직전에 말한다.

**마이그레이션 0건. 새 승인 경로 0건. 새 API 라우트 0건.** 순수 모듈 하나와 화면 5곳, 프롬프트 1문단.

---

## 1. Q1 — "무조건 산다"의 정직한 정의

### 확정

| 후보 | 판정 | 이유 |
| --- | --- | --- |
| **(a) 경로에서 먼저 배치** | **채택 · 자동** | 목록의 순서를 바꾸는 것은 지출이 아니다. 승인 게이트가 필요 없는 유일한 동작이다 |
| **(b) 모자랄 때 무엇을 줄일지 제안·승인** | **채택 · 기존 경로 재사용** | 이것이 이 기능의 본체다. `exceeds_planned` → `budget_changes` → `/trail/plan/approval`을 그대로 탄다 |
| **(c) 예산 배분 시 우선 할당** | **부분 채택 — 자동 금지, "채워 넣기"만** | 자동 가중 배분은 여행자가 말한 적 없는 숫자를 플랜에 넣는다. `lib/budget/allocations.ts`가 세 번 거절하는 바로 그것이다. 입력칸을 **채워만 주고** 저장은 여행자가 누른다 |
| **(d) 놓쳤을 때 경고** | **채택 · 자동** | 경고는 아무것도 바꾸지 않는다. 승인이 필요 없다 |

### 근거

1. **자동 구매는 존재할 수 없다.** 제품 규칙 2 — 구매는 매장에서 여행자가 한다.
   `Request`조차 재고 문의이고, FIGMA_ADOPTION §5는 받을 매장이 없어 그 버튼도 그리지 않기로 했다.
2. **flexible을 자동으로 끌어오는 것도 존재할 수 없다.** 제품 규칙 5 + `0013`.
   브라우저는 `plans`에 UPDATE 권한이 없다. "우선순위 1번을 위해 자동으로 유연 예산을 쓴다"는
   코드로 쓸 수 없는 문장이다 — 서비스 키를 가진 `approve_budget_change` 안에서만 일어난다.
3. **그래서 남는 정직한 약속은 하나뿐이다** — *무엇이 마지막에 밀려나는지 당신이 정하고,
   밀려날 때가 오면 Trail이 이름을 대서 묻는다.*

### 절대 쓰지 않는 카피

> ~~`Trail will make sure you get Mom's gift.`~~ ~~`Protected`~~ ~~`Guaranteed`~~ ~~`Secured`~~

프롬프트의 금지어 목록(`reserved`, `secured`, `guaranteed`, `locked in`)이 이미 같은 이유로 있다.

### 쓰는 카피

- `Trail never buys for you. This sets what it suggests cutting first.`
- `Nothing here moves money. It changes the order things get cut in.`

---

## 2. Q2 — 척도와 `is_optional`

### 확정: **화면 3단계 · DB는 1–5 유지 · `is_optional`은 최하단의 파생 기록**

| 화면 라벨 | 쓰는 값 | 읽는 범위 |
| --- | --- | --- |
| `Must buy` | `priority = 1`, `is_optional = false` | `priority ≤ 2` |
| `Planned` (기본, 배지 없음) | `priority = 3`, `is_optional = false` | `priority 3–4` |
| `If there's money left` | `priority = 5`, `is_optional = true` | `priority ≥ 5` **또는** `is_optional = true` |

### 왜 2단계가 아닌가

`Must buy` / `Nice to have` 2단계는 여행자의 문장을 못 담는다. "무조건"은 위쪽 끝을 말하고,
"돈 남으면"은 **별개로 이미 컬럼이 있는** 개념이다(`is_optional`, 0001 주석 `"Optional personal purchase"`,
스키마 설명 `True for 'if there's money left'`). 2단계로 줄이면 중간에 있는 대부분의 사람이
"안 사도 되는 사람"으로 내려가거나 "무조건"으로 올라간다. 둘 다 거짓말이다.

### 왜 5단계가 아닌가

1~5를 소비하는 곳이 없다. 소비처는 **경로 정렬**과 **줄일 순서** 둘뿐이고, 둘 다 3구간 + `created_at`
동률처리로 충분하다. 5점 척도는 여행자에게 아래에서 아무 차이도 만들지 않는 구별을 요구한다 —
이 저장소의 규칙 *"필터할 컬럼이 없는 태그는 만들지 않는다"*(`trail-brief.ts` 선호 태그 주석)가
척도에도 그대로 적용된다.

### 왜 컬럼은 안 좁히는가

`check (priority between 1 and 5)`(0001), `minimum:1 maximum:5`(`TURN_SCHEMA`),
`docs/tracks/W6-ai.md`의 예시(`priority: 1 / 3 / 4`)가 이미 1–5다.
좁히는 마이그레이션은 얻는 것이 없고 AI 계약을 깬다.
**UI는 구간을 읽고, 저장은 정본 값(1/3/5)만 쓴다.** 모델이 2나 4를 쓴 행도 화면에서 사라지지 않는다.

### `is_optional` 통합 규칙 — 두 개를 따로 조작하는 UI는 만들지 않는다

- 세그먼트를 고르면 **한 번의 PATCH에 두 필드가 같이 나간다.**
  `Must buy → {priority:1, isOptional:false}` · `Planned → {priority:3, isOptional:false}` ·
  `If there's money left → {priority:5, isOptional:true}`
- **모순된 행(예: `priority:1` + `is_optional:true`)은 항상 약한 쪽으로 렌더한다** — `If there's money left`.
  근거: 이 앱에서 위험한 실패는 과대약속이다. "무조건"이라 써 놓고 빠져도 되는 행보다,
  "돈 남으면"으로 보이는 편이 덜 해롭다. 다음 쓰기가 정본 값으로 정규화한다.
- 컬럼은 남긴다 — `lib/share/projection.ts`, `TURN_SCHEMA`, `W6-ai.md`가 이미 이름을 부르고,
  읽는 사람에게 두 값의 의미가 다르다(`priority` = 순서, `is_optional` = 아예 빠져도 됨).

### `is_self`("Myself")와의 관계

특별 취급 없음. Myself도 1급 수령인이므로 같은 3단계를 갖는다.
W6 예시가 self에 `isOptional:true`를 기본으로 쓰는 것은 그대로 두되, 세그먼트로 바꿀 수 있다.

### 파생 타입은 `lib/state/types.ts`에 넣지 않는다

`PriorityTier`는 **저장되는 값이 아니라 두 컬럼에서 계산되는 값**이다.
`lib/state/types.ts`는 "GET /api/state가 돌려주는 모양"이므로 파생값이 들어갈 자리가 아니고,
FIGMA_ADOPTION §4의 "마이그레이션을 여는 그룹이 수정한다"에도 걸린다.
**`lib/budget/priority.ts`에 둔다.**

---

## 3. Q3 — 어느 화면에 붙는가

| 화면 | 역할 | 편집 가능 |
| --- | --- | --- |
| `/trail/plan/gifts/split` | **주인.** 3단계 세그먼트가 여기에만 있다 | 유일한 편집 지점 |
| `/trail/plan/gifts` | 배지 + 부족 경고 + `split` 행 부제 | 읽기 전용 |
| `/trail/shop` | REMAINING 정렬 + 배지 + 잔액 경고 | 읽기 전용 |
| `/trail/shop/[stopId]/record` (`Budget Update`) | 초과 시트에 한 줄 맥락 | 읽기 전용 |
| `/ask` | 요약 카드 1줄. **새 칩·새 질문 없음** | Q5 참조 |
| 온보딩 | **붙이지 않는다** | — |

**온보딩 제외 근거.** 첫 여행 등록 4단계는 예산도 정하기 전이다. 그 자리에서 가족 순위를 매기게
하는 것은 제품이 요구할 일이 아니고, 기본값 3(`Planned`)이 정직한 무응답이다.

**`/ask`에 칩을 안 만드는 근거.** G4의 칩 온보딩은 여행자가 **말하지 않은 것을 묻는** 자리다.
"누가 제일 중요해요?"를 Trail이 먼저 묻는 것은 이 제품이 할 질문이 아니다.
여행자가 말하면 받고(이미 스키마에 있다), 먼저 묻지는 않는다.

**승인 상태에서도 우선순위는 편집 가능하다** — 의도적 결정이다.
`split` 화면은 승인된 플랜에서 금액 입력을 잠근다(`editable = serverPlan?.status === "draft"`).
**우선순위는 잠그지 않는다.** 근거: (1) `plan_allocations`의 일부가 아니고 돈을 1원도 옮기지 않는다,
(2) 이 기능이 쓸모 있는 순간은 **승인 이후 매장에서 돈이 모자랄 때**다. 승인 후에 "역시 엄마 것이
제일 중요했다"를 못 쓰게 만들면 기능 자체가 죽는다.

---

## 4. Q4 — 예산 초과 시 실제 흐름

**새 승인 경로를 만들지 않는다.** 기존 두 곳의 **내용만** 늘린다.

### 4.1 `split` 화면 — `exceeds_planned` 패널에 remedy 하나 추가

지금 패널: `Raise it for approval`(flexible로 덮이는 경우) · `Change the split`.
추가: **`Suggest a split that keeps the must-buys`** — 이 버튼은 **아무것도 쓰지 않는다.**

1. `lib/budget/priority.ts`의 `trimToFit()`이 클라이언트에서 계산한다.
   최하단 티어부터 → `created_at` 늦은 순으로 줄이고, **`Must buy` 티어는 손대지 않는다.**
2. 결과를 **입력칸에 채워 넣고**(`rows` 상태), 사람별 차액을 각 카드 밑에 한 줄로 보여준다.
3. `Nothing is saved yet. Amounts changed for {n} people.`
4. 여행자가 기존 `Save this split`을 누르면 그때 `PUT /api/plans/{id}/allocations`로 나간다.
   **여전히 같은 라우트, 같은 409, 같은 proposal 경로다.**
5. must-buy만으로도 이미 버킷을 넘으면 `trimToFit()`은 `no_fit`을 돌려준다 → 버튼을 그리지 않고
   `Even the must-buy gifts come to {X}. Your shopping bucket holds {Y}.` 만 쓴다.
   남는 길은 기존의 `Raise it for approval`(flexible) 또는 금액 수정뿐이다. **여기서 새 길을 만들지 않는다.**

> 왜 서버가 아니라 클라이언트인가: `recipients`와 `wallet`은 이미 클라이언트에 있고, 오프라인에서도
> 계산돼야 하며, **무엇보다 눈에 보이게 "제안"이어야 한다.** 서버가 돌려준 숫자는 승인처럼 읽힌다.

### 4.2 `Budget Update` 시트(프레임 `-5`) — 버튼이 아니라 **한 줄**

`app/(app)/trail/shop/[stopId]/record/page.tsx`의 초과 시트는 이미 헌법 4의
"실제가 예산 초과" 분기를 지고 있고, 승인 탭 하나를 나르는 것이 존재 이유다.
**네 번째 버튼을 넣지 않는다.** 대신:

- `sheet-impact` 행 하나 추가: `Still unbought · must buy` → `{names} · {합계}`
- 이 구매를 기록하면 남는 쇼핑 가능액이 **미구매 must-buy 배분 합계보다 작아지는 경우**에만
  `.notice--warn` 한 줄: `After this, {X} left and {Y} in must-buy gifts still unbought.`
- 기존 버튼 3개(`flexibleRemedyLabel` / `Record it and stay over plan` / `Change the amount`)는 **그대로.**

### 4.3 `reserve_short` · `/bags/pay` — **건드리지 않는다**

우선순위는 **선물**에 대한 것이고 `reserve_short`는 **가방 배송비**다.
`delivery_reserve`는 제품 규칙 5에 의해 쇼핑 가능액이 아니다.
둘을 연결하는 코드를 쓰지 않는다. (이 문장을 남기는 이유: 나중에 누군가 연결하고 싶어진다.)

---

## 5. Q5 — AI

### 사실 정정: **`priority`·`is_optional`은 이미 `TURN_SCHEMA`에 있다**

`app/trail-brief.ts:254` `priority: { type:["integer","null"], minimum:1, maximum:5,
description: "1 = buy this first if money runs short." }`
`:256` `is_optional` · `:263` `clear_fields`에도 · `:289` brief 블록으로 모델에게 되돌아감 ·
`:378` `readOp`가 범위 검사 · `lib/recipients/input.ts:51`이 다시 검사 ·
`app/api/recipients/apply/route.ts:68`이 draft에 **바로 쓴다.**

그러므로 Q5는 "넣을 것인가"가 아니라 **"이미 있고 무방비인데 어떻게 할 것인가"**다.
지금 상태에서 모델이 "엄마니까 1순위죠"를 draft에 조용히 쓸 수 있다. 그 설명문
`"1 = buy this first if money runs short."`는 사실상 채우라는 초대장이다.

### 확정: 유지하되 **3중으로 막는다**

**(1) 프롬프트 1문단** — `PROMPT_HEAD`의 배분 문단 바로 뒤:

> `priority and is_optional record something the traveller said out loud — "that one I can't miss",
> "only if there's money left". A relationship is not a priority: never infer that a parent
> outranks a coworker, or that a gift for themselves matters less. If they did not say it, leave
> both null.`

**(2) 스키마 설명 교체** — `priority`의 description을
`"Only when the traveller said this one comes first, in their own words. 1 = first, 3 = default,
5 = only if money is left. Never inferred from who the person is."`

**(3) 진짜 방벽 — 모델의 우선순위는 `apply`가 아니라 `confirm`으로 간다**

`sanitizeRecipientOps`에서 op이 `priority`/`isOptional`을 실어 오면 **op을 둘로 쪼갠다**:
나머지 필드(이름·관계·메모·배분)는 `apply`로 가고, 우선순위만 담은 쌍둥이 op이 `confirm`으로 간다.

근거:
- `remove`가 이미 같은 이유로 `confirm`에 있다 — **사람에 대한 판단은 탭을 받는다.**
- 우선순위는 수령인 필드 중 **유일하게 사실이 아니라 판단**이다. 이름·관계·메모는 여행자가 말한
  사실이고, 우선순위는 사람 사이의 서열이다.
- 잘못 설정된 우선순위는 **돈이 모자라는 순간까지 보이지 않는다.** 내 동생이 optional로 찍혀
  있었다는 걸 매장에서 알게 되는 것이 최악의 발견 시점이다.
- 필드를 쪼개 남기는 전례가 이미 있다 — `enforceEqualValue`가 다투는 금액만 지우고 나머지는 남긴다.
- 비용: 여행당 한두 번의 탭.

**(4) 금지어 2개 추가** — `APPROVAL` 문단의 금지어 목록에 `marked`, `prioritised`.
`I've marked Mom as must-buy`는 이미 `I've added` 계열과 같은 거짓말이다.

**(5) brief 블록은 그대로 계속 보낸다.** 모델이 같은 걸 다시 묻지 않으려면 필요하고,
`maskLabel`이 실명을 이미 막고 있어 새로 새는 것이 없다.

### `/ask` 요약 카드

`app/(app)/ask/ready.ts`의 `Shopping for` 행 **값만** 확장:
`Mom, Ana, Bo, Cy +2 more` → `Mom, Ana, Bo, Cy +2 more · 1 must buy`
must-buy가 0명이면 접미를 붙이지 않는다. **행을 새로 만들지 않는다** — 6행 순서를 검사하는
`tests/trail-summary-card.test.ts:66`이 있고, 그 순서는 프레임의 것이다.

---

## 6. Q6 — 마이그레이션

### 확정: **필요 없다. SQL 0줄.**

**`0020`은 `trips` 전용이다.** 파일 이름 그대로 `0020_trip_columns_are_not_all_writable.sql`이고,
GRANT 화이트리스트는 `public.trips`의 컬럼 목록이다. `recipients`와는 무관하다.

**`recipients`에는 컬럼 GRANT가 애초에 없다.** 전 마이그레이션을 훑어도
`grant ... (columns) on public.recipients`는 존재하지 않고, `0002_rls.sql`이 15개 테이블
목록(`'trips','recipients','plans',…`)에 테이블 단위 DML을 `authenticated`에 준다.
따라서 `priority`·`is_optional`은 **RLS 아래에서 이미 브라우저가 쓸 수 있다.**

이미 배선된 곳 (전부 확인함):

| 층 | 파일 | 상태 |
| --- | --- | --- |
| 컬럼 + 제약 | `supabase/migrations/0001_schema.sql:104,106` | 있음 |
| 행 타입 | `lib/state/rows.ts:18` | 있음 |
| 조회 select | `lib/state/queries.ts:41` | 있음 |
| 매퍼 | `lib/state/shape.ts:53` | 있음 |
| 뷰 타입 | `lib/state/types.ts:86` | 있음 |
| 입력 파서 | `lib/recipients/input.ts:39,51,53` | 있음 |
| PATCH 라우트 | `app/api/recipients/[id]/route.ts` | 있음 |
| POST 라우트 | `app/api/recipients/route.ts` | 있음 |
| AI 적용 | `app/api/recipients/apply/route.ts:68` | 있음 |
| 클라이언트 쓰기 | `app/(app)/app-state.tsx:316 updateRecipient` | 있음 |
| AI 스키마 | `app/trail-brief.ts:254,256,263` | 있음 |

**지켜야 할 것 — G6의 영구 제외.** `docs/plans/G6-share.md:229–230`은 `priority`·`is_optional`을
공유 프로젝션에서 **영구 제외**로 확정했다("받는 사람이 자기가 4순위인 걸 보는 화면을 만들지 않는다").
N3는 그 결정을 약화하지 않는다. **오히려 UI가 생기는 지금이 회귀 위험이 가장 큰 시점이므로,
`tests/share-projection.test.ts`에 "티어가 공유 페이로드에 절대 나타나지 않는다" 케이스를 추가한다.**

번호가 필요하면 `0030`이겠지만, 내용이 될 만한 것은 `recipients (trip_id, priority)` 인덱스뿐이고
여행당 행이 24개 이하다. **배정하지 않는다.**

---

## 7. 화면 명세

### 7.1 `/trail/plan/gifts/split` — Priority 세그먼트 (주인)

- **진입 조건**: 트립 + 플랜 존재. 수령인 0명이어도 진입은 된다(기존 빈 상태 유지)
- **주요 액션**: 수령인 카드마다 3지 라디오 그룹에서 하나 선택 → 즉시 `PATCH /api/recipients/{id}`
- **이탈 조건**: 다른 렌즈로 이동, `/ask`로 이동. 저장 대기 개념 없음(즉시 전송)
- **유지되는 상태**: 서버 값만. 로컬 초안 없음 — 금액과 달리 한 번의 탭이므로 초안이 성립하지 않는다

**마크업 (G1 프리미티브 재사용)**

```
<fieldset class="priority-set">
  <legend class="section-label">IF MONEY RUNS SHORT</legend>
  <label class="choice choice--seg"><input type="radio" name="prio-{id}" …><span><b>Must buy</b></span><svg/></label>
  <label class="choice choice--seg"><input type="radio" …><span><b>Planned</b></span></label>
  <label class="choice choice--seg"><input type="radio" …><span><b>If there's money left</b></span></label>
</fieldset>
<small class="quiet-note">Trail never buys for you. This sets what it suggests cutting first.</small>
```

- `label.choice`는 이미 `min-height:var(--tap)`·24px 입력·G1 규칙 12(테두리 색만으로 선택 표시 금지 →
  체크 SVG 병기)를 만족한다. `.choice--seg`는 **3열 그리드 + 라벨 축약**만 더한다.
- 좁은 화면(<360px)에서는 세로 스택으로 떨어진다. 3열 강행 금지 — 44px가 깨진다.
- `fieldset`/`legend`가 스크린리더에 "이 3개는 한 질문"임을 준다. `role="radiogroup"` 수동 부여 불필요.
- 배치: `recipient-head` **아래**, `recipient-amount` **위**. 이유 — 사람에 대한 사실(이름/관계) 다음이고,
  금액보다 앞이어야 "얼마"보다 "얼마나 중요"가 먼저 읽힌다.

**상태 분기**

| 분기 | 화면 |
| --- | --- |
| 로딩 | 없음. 서버 상태에서 즉시 그려진다 |
| 빈 상태 (수령인 0) | 기존 `Nobody is on this trip yet.` 유지. 세그먼트 없음 |
| 빈 상태 (아무도 표시 안 함) | 메터 아래 한 줄: `Nothing is marked must buy. Trail treats every gift the same when money is short.` |
| 오류 (4xx/5xx) | 세그먼트를 이전 값으로 되돌리고 `.form-error`: `Trail could not save that mark.` |
| 오프라인 | **되돌리고** `.notice--offline`: `You are offline. That mark was not saved.` — `updateRecipient`는 아웃박스를 타지 않는다(`app-state.tsx:299` 주석). 성공한 척하지 않는다 |
| 권한 거부 | 해당 없음 |

- **승인 게이트**: 없음. 돈이 움직이지 않는다. 이것이 즉시 저장인 이유이고, 헬퍼 문구가 그렇게 말한다.
- **실패 경로**: 헌법 4의 어디에도 걸리지 않는다. 이 화면 자체는 실패 분기가 아니다.
- **크기**: **M** · 선행 의존: `lib/budget/priority.ts`

### 7.2 `/trail/plan/gifts/split` — 초과 패널의 `trim` remedy

- **진입 조건**: `Save this split`이 409 `exceeds_planned`를 받았고, must-buy 티어가 1명 이상 존재
- **주요 액션**: `Suggest a split that keeps the must-buys` → 입력칸을 채운다. **쓰기 없음**
- **이탈 조건**: `Change the split`(기존) 또는 실제 저장
- **유지되는 상태**: 채워진 `rows`. 새로고침하면 사라진다 — 저장되지 않았으므로 사라지는 게 맞다

**상태 분기**

| 분기 | 화면 |
| --- | --- |
| must-buy 0명 | 버튼을 그리지 않는다. 기존 패널 그대로 |
| `no_fit` (must-buy만으로 초과) | 버튼 대신 문장: `Even the must-buy gifts come to {X}. Your shopping bucket holds {Y}.` |
| 채운 뒤 | 각 카드 아래 `{name}: {before} → {after}` · 패널 자리에 `Nothing is saved yet. Amounts changed for {n} people.` |
| 오프라인 | 계산은 로컬이므로 동작한다. 이후 `Save this split`이 기존 오프라인 문구로 실패 |

- **승인 게이트**: 채우기에는 없음. 그 뒤 `Save this split`이 다시 409를 받으면 **기존**
  `Raise it for approval` → `POST /api/budget-changes` → `/trail/plan/approval`로 간다. 변경 없음
- **실패 경로**: 헌법 4 — **실제가 예산 초과**. 복구 수단 = 금액 수정 / flexible 이동 승인 / 초과 감수
- **크기**: **M** · 선행 의존: 7.1, `lib/budget/priority.ts`

### 7.3 `/trail/plan/gifts` — 배지와 경고 (읽기 전용)

- **진입 조건**: Gifts 렌즈 진입
- **주요 액션**: 없음. `Divide the budget by person` 행으로 이동
- **이탈 조건**: 다른 렌즈
- **유지되는 상태**: 없음

변경 3가지:
1. 스톱 카드의 수령인 라벨 옆 배지 — must-buy면 `.badge--accent` `MUST BUY`, 최하단이면 중립 `.badge`
   `IF MONEY'S LEFT`. `Planned`는 **배지 없음**(기본은 침묵한다)
2. `split` 행 부제: `{n} of {m} allocated` → `{n} of {m} allocated · {k} must buy` (k>0일 때만)
3. must-buy인데 **스톱이 없는** 사람이 있으면 `.notice--warn`:
   `{names} — marked must buy, no stop planned yet.` 액션은 `Tell Trail` → `/ask`

**상태 분기**: 로딩 없음 · 스톱 0개는 기존 빈 상태 유지(배지는 `split` 행 부제에만) ·
오프라인은 캐시본 + 기존 `.badge--pending` · 오류 없음(전부 파생값)

- **승인 게이트**: 없음
- **실패 경로**: 헌법 4 — **추천 불가**의 사전 경고. must-buy에 스톱이 없다는 것은 Trail이 아직
  그 사람 것을 못 찾았다는 뜻이다. 복구 = `/ask`에서 다시 요청
- **크기**: **S**

### 7.4 `/trail/shop` — 남은 경로 정렬 (읽기 전용)

- **진입 조건**: 매장 모드 진입
- **주요 액션**: 없음 (기존 액션 그대로)
- **이탈 조건**: 기존과 동일
- **유지되는 상태**: 없음

변경 2가지:
1. `REMAINING` 목록을 **티어 → 기존 `sequence`** 순으로 정렬. `PURCHASED`는 **정렬하지 않는다**
   (이미 일어난 일의 순서를 바꾸면 방금 산 것을 못 찾는다)
2. 잔액 경고 — 쇼핑 가능액 < 미구매 must-buy 배분 합계일 때 `.notice--warn`:
   `{X} left, and {Y} in must-buy gifts still unbought.` 액션 `Review budget` → `/trail/plan/budget`

**상태 분기**: 스톱 0개는 기존 `No stops planned yet.` · must-buy 0명이면 정렬도 경고도 없음(완전 무변화) ·
오프라인은 캐시본으로 정렬(파생값이라 문제없음)

- **승인 게이트**: 없음
- **실패 경로**: 헌법 4 — **실제가 예산 초과**의 사전 경고
- **크기**: **S**

### 7.5 `Budget Update` 시트 — 맥락 한 줄

§4.2 참조. 버튼 추가 없음.
- **승인 게이트**: 기존 그대로 — `flexibleRemedyLabel`이 금액·출처 버킷·잔액을 버튼에 싣는다
- **실패 경로**: 헌법 4 — **실제가 예산 초과**
- **크기**: **S**

### 7.6 빈 상태 · 실패 화면 모음 (이 앱이 가장 자주 빠뜨리는 것)

| 상황 | 어디 | 카피 |
| --- | --- | --- |
| 아무도 표시 안 함 | split 메터 아래 | `Nothing is marked must buy. Trail treats every gift the same when money is short.` |
| 전원이 must-buy | split 메터 아래 | `Everyone is marked must buy, so there is nothing for Trail to suggest cutting.` |
| must-buy인데 배분 없음 | 해당 카드 아래 | `Marked must buy with no amount set.` |
| must-buy인데 스톱 없음 | gifts 렌즈 | `{names} — marked must buy, no stop planned yet.` |
| must-buy 스톱이 `unavailable` | gifts 렌즈 | `{name}'s stop is marked not found. Trail will look for another in the same budget.` |
| must-buy만으로 버킷 초과 | split 초과 패널 | `Even the must-buy gifts come to {X}. Your shopping bucket holds {Y}.` |
| 우선순위 쓰기 실패 | 해당 카드 | `Trail could not save that mark.` |
| 오프라인 쓰기 | 해당 카드 | `You are offline. That mark was not saved.` |
| AI가 우선순위를 제안 | `/ask` confirm 카드 | `Trail suggests marking {label} as {tier}.` + `Apply` / `Leave it` |

---

## 8. 파일 단위 작업 목록

| # | 파일 | 작업 | 크기 |
| --- | --- | --- | --- |
| 1 | `lib/budget/priority.ts` **(신규)** | `PriorityTier` · `tierOf` · `tierWrite` · `TIER_LABEL` · `rankByTier` · `fitWithin` · `trimToFit` · `mustBuyShortfall`. **DB 없음, 순수 함수** | **M** |
| 2 | `app/(app)/trail/plan/gifts/split/page.tsx` | §7.1 세그먼트 + §7.2 trim remedy + 빈 상태 문구 | **M** |
| 3 | `app/(app)/trail/plan/gifts/page.tsx` | §7.3 배지 · 부제 · 경고 | **S** |
| 4 | `app/(app)/trail/shop/page.tsx` | §7.4 정렬 + 경고 | **S** |
| 5 | `app/(app)/trail/shop/[stopId]/record/page.tsx` | §7.5 시트 한 줄 + 경고 | **S** |
| 6 | `app/(app)/view.ts` | `tierBadge(person)` 헬퍼 (`sourceChip` 옆) | **S** |
| 7 | `app/components.css` | `.choice--seg` 3열 변형 + `.priority-set` (≤360px 스택) | **S** |
| 8 | `app/trail-brief.ts` | 프롬프트 1문단 · `priority` description 교체 · 금지어 2개 · `sanitizeRecipientOps` op 분할 | **M** |
| 9 | `app/(app)/ask/ready.ts` | `Shopping for` 값에 `· {k} must buy` 접미 | **S** |
| 10 | `docs/TRAIL_USER_FLOW_EN.md` | 우선순위 흐름 + 초과 시 trim 제안 반영 | **S** |
| 11 | `docs/MIGRATION_PLAN.md` | N3 항목 · **"마이그레이션 없음" 명시** | **S** |
| 12 | `docs/BACKLOG_NEXT.md` | §N3 → 이 문서로 링크, "없는 것" 절 갱신 | **S** |

**건드리지 않는 것 (명시)**: `supabase/migrations/*`(0줄) · `app/api/**`(0줄) ·
`lib/state/{types,rows,shape,queries}.ts`(이미 다 실려 있다) · `lib/share/projection.ts`(영구 제외 유지) ·
`app/(app)/bags/**`(배송비는 다른 버킷) · `lib/budget/{decide,changes,allocations}.ts`(승인 경로 무변경)

**순서**: 1 → (2·3·4·5·6·7 병렬) → 8 → 9 → 10·11·12
8이 뒤인 이유 — `confirm` 분할은 `/ask`의 confirm 카드가 우선순위 op을 렌더할 수 있어야 의미가 있고,
그 라벨(`TIER_LABEL`)이 1에서 나온다.

---

## 9. 테스트

### `tests/trail-priority.test.ts` (신규)

1. 구간 읽기: `1,2 → must` · `3,4 → planned` · `5 → spare`
2. **모순 행은 약한 쪽**: `{priority:1, is_optional:true} → spare`
3. 정본 쓰기: `must → {priority:1,isOptional:false}` · `planned → {3,false}` · `spare → {5,true}`
4. `rankByTier`: 동률은 `created_at` 오름차순. **입력 배열 순서에 의존하지 않는다**(인덱스 금지 원칙)
5. `trimToFit`: must 티어 금액이 **한 푼도** 바뀌지 않는다
6. `trimToFit`: 결과 합계 ≤ 버킷. **어떤 값도 10 단위로 반올림되지 않는다** (58/68/39/45 회귀)
7. `trimToFit`: must만으로 초과면 `no_fit`, 부분 결과를 돌려주지 않는다
8. `trimToFit`: `equalValueGroup` 멤버는 **같이 움직이거나 아예 안 움직인다**
9. `mustBuyShortfall`: 미구매 must-buy 배분 합계 − 쇼핑 가능액. **`reserveCents`를 절대 더하지 않는다**(제품 규칙 5)
10. `fitWithin`이 `{kind:"time"}`에서도 같은 순서를 낸다 (N2 접점, §10)

### 기존 테스트 확장

| 파일 | 추가 케이스 |
| --- | --- |
| `tests/trail-brief.test.ts` | `priority`를 실은 op이 `apply`가 아니라 `confirm`에 있다 · 이름+우선순위 op은 **쪼개진다**(이름은 apply, 우선순위는 confirm) · 프롬프트에 "never infer … outranks" 문장이 있다 · 금지어에 `marked`·`prioritised` |
| `tests/trail-recipient-routes.test.ts` | PATCH `{priority:5,isOptional:true}` 200 · `{priority:0}` 400 · `{priority:6}` 400 · **승인된 플랜에서도 우선순위 PATCH는 200** |
| `tests/share-projection.test.ts` | **티어·`priority`·`is_optional`이 공유 페이로드에 나타나지 않는다** (G6 영구 제외 회귀) |
| `tests/trail-approval-screens.test.ts` | split 화면에 수령인당 라디오 3개 · trim 버튼이 `saveAllocations`를 호출하지 않는다 · `Raise it for approval` 경로가 살아 있다 |
| `tests/trail-summary-card.test.ts` | 6행 순서 불변 · must-buy 0명이면 접미 없음 · 1명이면 `· 1 must buy` |
| `tests/trail-focus-visible.test.ts` | `.choice--seg`가 포커스 링을 가진다 |
| `tests/trail-recipients.test.ts` | `parseRecipientCreate` 기본값 `priority:3, is_optional:false` 불변 |

**추가하지 않는 테스트**: 마이그레이션 관련. SQL이 0줄이므로 `trail-trip-grants` 류의 대조 대상이 없다.

---

## 10. N2(자투리 시간 쇼핑)와의 접점 — 인터페이스를 남긴다

N2는 "1시간 남는데 뭐 살까"다. 시간이 모자랄 때 **무엇을 남길지 고르는 문제는 돈이 모자랄 때와 같은 문제**다.
그래서 `lib/budget/priority.ts`의 핵심 함수는 **제약의 종류를 모른다.**

```
type Limit =
  | { kind: "money"; remainingCents: number }
  | { kind: "time";  remainingMinutes: number };

// 스톱마다 "이 제약을 얼마나 쓰는가"는 호출자가 이미 계산해서 cost로 넣는다.
//   money → stop.snapshotPriceCents
//   time  → stop.walkMinutes + 매장당 체류 추정치 (N2가 정한다)
fitWithin(
  stops: { id: StopId; recipientId: string | null; cost: number }[],
  recipients: Recipient[],
  limit: Limit,
): { fits: StopId[]; falls: StopId[]; reason: "fits" | "trimmed" | "no_fit" }
```

**N2가 지켜야 할 계약 4개** (지금 문서에 못 박는다):

1. **`fitWithin`은 아무것도 쓰지 않는다.** 순수 함수다. 시간판도 마찬가지 —
   N2가 "이 3곳은 가고 저 2곳은 버려라"를 자동 저장하는 순간 제품 규칙 1을 깬다.
2. **must 티어는 시간 제약에서도 마지막에 밀린다.** 단 `no_fit`은 **거절**이지 부분 결과가 아니다.
   "1시간 안에 must-buy를 다 돌 수는 없다"를 말해야지, 조용히 하나를 빼면 안 된다.
3. **N2의 카피는 약속이 아니다.** BACKLOG_NEXT §N2의 결론대로
   `You'd have about 20 minutes at each stop` 같은 여지 있는 형태. `fitWithin`이 낸 `fits`도
   "이대로 하면 된다"가 아니라 "이 순서면 들어갈 것 같다"로 쓴다.
4. **`dropoff_cutoff`는 우선순위보다 세다.** 마감을 넘기면 must-buy든 아니든 그날 배송이 안 된다
   (`cutoff_passed`, 이송 불가 6코드). N2 화면은 `fitWithin` 결과 **위에** 그 사실을 먼저 쓴다.

N1(위치 알림)과의 접점: 알림 대상 선정에 티어를 쓰고 싶어질 것이다. **N1 착수 시 다시 결정한다.**
"우선순위 1번 수령인 매장 근처"라는 알림은 곧 "이 사람은 지금 여기 있다 + 이 사람은 엄마를 1순위로 뒀다"를
서버가 아는 것이므로, `VENTURE_BRIEF` §7.4가 경고한 민감도가 한 단계 더 오른다. 지금 배선하지 않는다.

---

## 11. 제품 규칙과 부딪히는 지점, 그리고 해결

| 부딪히는 지점 | 해결 |
| --- | --- |
| 사용자의 말 "무조건 살 수 있도록" ↔ **규칙 2**(구매는 매장에서 사용자가) | 우선순위는 **순서와 제안**이지 구매가 아니다. 헬퍼 카피가 매번 그렇게 말한다: `Trail never buys for you.` |
| "무조건" ↔ **규칙 5 + 0013**(flexible은 승인 없이 못 씀) | 자동 인출 없음. 부족은 `exceeds_planned` → proposal → `/trail/plan/approval`. **새 승인 경로 0건** |
| 자동 우선 배분 ↔ `allocations.ts`의 3대 거절(반올림 금지 / 등가 전부-아니면-전무 / 초과는 제안) | `trimToFit`은 **입력칸을 채울 뿐** 저장하지 않는다. 등가 그룹은 통째로 움직이거나 안 움직인다. 반올림 없음 |
| 배지가 "이건 확보됐다"로 읽힐 위험 ↔ **FIGMA_ADOPTION §1**(없는 것을 있다고 말하지 않는다) | 배지 문구가 `MUST BUY`(여행자의 표시)이지 `PROTECTED`/`RESERVED`(Trail의 약속)가 아니다. 금지어 목록에 이미 `reserved`·`secured` |
| AI가 서열을 추론 ↔ **환각 통제** | `confirm` 경로로 강등 + 프롬프트 + 스키마 설명. §5 |
| 우선순위 UI 생성 ↔ **G6 공유 영구 제외** | 프로젝션 무변경 + 회귀 테스트 추가. §6 |
| 승인 후 우선순위 편집 ↔ 승인된 플랜은 고정 | 우선순위는 `plan_allocations`가 아니고 돈이 아니다. §3 마지막 문단에 근거 명시 |
| 즉시 저장 ↔ "조용히 성공한 척하지 않는다" | `updateRecipient`는 아웃박스를 타지 않는다. 실패·오프라인은 **되돌리고 말한다**. §7.1 상태 분기 |

---

## 12. 총 규모

**M** — 신규 순수 모듈 1 · 화면 5곳 수정 · 프롬프트/스키마 1곳 · CSS 1 변형 · 테스트 1 신규 + 7 확장.
SQL 0줄, API 0줄, 새 라우트 0개, 새 승인 경로 0개.

가장 위험한 조각은 **8번(`sanitizeRecipientOps` op 분할)**이다. 화면 작업과 병렬로 두지 말고
`lib/budget/priority.ts`가 `TIER_LABEL`을 확정한 뒤에 손댄다.
