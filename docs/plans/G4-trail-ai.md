# G4 · Trail AI — 파일 단위 실행 계획

기준 문서: `docs/FIGMA_ADOPTION.md`. 특히 §1-4(AI는 배송비 금액을 말하지 않는다) · §2 이름표 · §2 말미 카피 예외 6건.
담당: `trail-ai-planner`(대화 정책·프롬프트·스키마) + `trail-app-engineer`(화면 배선).
의존: G1(토큰) 이후 착수 가능. G2(`shell.tsx`·`landing.ts`)와 G3(`lib/state/*`)는 **읽기만** 한다.

회의 결론 한 줄: **W1(배선 복구)이 끝나기 전에는 W2~W6의 어떤 코드도 시작하지 않는다.** 지금 화면은
모델이 정확히 답해도 그 답을 버린다. 나머지는 전부 그 위에 얹는 것이다.

---

## 0. 지금 무엇이 깨져 있는가 (착수 근거)

| 위치 | 증상 | 결과 |
| --- | --- | --- |
| `app/(app)/ask/page.tsx:25` | 페이로드가 `{ message, plan, trip, history }` 뿐 | `recipients`가 없으므로 `app/api/chat/route.ts:52-53`이 `plan.recipient` 한 명짜리 레거시 경로로 떨어진다. 모델은 `r1` 하나만 본다 |
| `app/(app)/ask/page.tsx:27` | `applyPatch(data.patch)` + `clearFields(data.clear)` 만 읽는다 | `brief` · `wallet` · `recipientOps` · `confirm` · `askedField` 전부 폐기. 다중 수령인이 화면에 절대 렌더되지 않는다 |
| `app/(app)/ask/page.tsx:17` | `hotel: trip.hotelName`을 서버로 보낸다 | `briefContext`가 버리므로 모델에는 안 가지만, 프라이버시 규칙상 애초에 보내지 않는 것이 맞다 |
| `app/trail-brief.ts:57` | `askedField`가 매 턴 계산된다 | 클라이언트가 한 번도 읽지 않는다. `ASKED_FIELDS` 12종이 죽은 코드 |
| `app/trail-brief.ts:150` | "at most one question — the single most useful missing detail" | **대화 종료 조건이 없다.** 다 채워져도 계속 묻는다 |
| `app/trail-brief.ts:40` | `BriefPatch`에 `localOnly`/`easyPack` 불리언 | `Local · Not touristy · Moderate walk`을 표현할 수 없다 |
| `app/(app)/ask/brief/page.tsx` | 요약이 별도 라우트 | 프레임 `-14.png`는 대화 안의 카드다 |

`tests/trail-recipients.test.ts:26`("the whole figma set lands in one turn")이 초록인 것은
`composeTurn`이 옳기 때문이지 화면이 옳기 때문이 아니다. 그 사이의 30줄이 통째로 비어 있다.

---

## W1 · `/ask` 배선 복구 [최우선]

배선이 페이지 안에 인라인으로 있어서 테스트가 닿지 못한 것이 이 버그의 원인이다.
**순수 함수 두 개로 뽑아내고, 그 두 함수에만 테스트를 건다.**

### W1-1 신규 `app/(app)/ask/wiring.ts`

```
export type AskActions = { addRecipient; updateRecipient; archiveRecipient; saveAllocations;
                           proposeBudgetChange; applyPatch; clearFields; notify }
export function chatPayload(app): ChatPayload          // 보내는 쪽
export function refMap(recipients: Recipient[]): Map<string, string>   // r1..r8 → uuid
export async function applyReply(reply: ChatReply, refs, actions): Promise<AppliedTurn>
export type AppliedTurn = { applied: RecipientOp[]; awaiting: Confirm; askedField: AskedField | null }
```

- `chatPayload`가 채우는 것 (서버 `buildContext`, `app/api/chat/route.ts:49-67`와 1:1):
  - `recipients`: `app.recipients`를 **`createdAt` 오름차순 고정 순서**로 `KnownRecipient[]`에 매핑.
    `label: person.name`, `relationship`, `groupSize`, `priority`, `isSelf`, `isOptional`,
    `equalValueGroup`, `allocation: person.allocationCents == null ? undefined : allocationCents / MINOR_UNITS[currency]`,
    `allocationBasis: "group_total"`(`Recipient.allocationCents`는 이미 그룹 총액이다 — `lib/state/types.ts:57` 주석),
    `note: person.preferenceNote`.
    **ref는 클라이언트가 붙이지 않는다.** 서버가 `route.ts:52`에서 인덱스로 민팅하므로, 클라이언트는
    같은 순서로 `refMap`을 만들어 응답을 되돌린다. 순서가 두 곳에서 다르면 돈이 엉뚱한 사람에게 붙는다 —
    그래서 정렬 기준을 `wiring.ts` 상단 주석에 못 박는다.
  - `plannedUnits: wallet.plannedCents / MINOR_UNITS[currency]`
  - `unallocatedUnits: wallet.unallocatedCents / MINOR_UNITS[currency]`
  - `planApproved: serverPlan?.status === "approved"`
  - `hasPurchases: bought.length > 0 || state.unplannedPurchases.length > 0`
  - `trip`: `{ city, country, areas, freeTime, companions, currency, dayCount, hotelTransfer }`.
    **`hotel`을 넣지 않는다.** `dayCount`는 `trip.startDate/endDate`에서 클라이언트가 계산,
    `hotelTransfer`는 `trip.hotelVerifiedAt ? "verified" : "unverified"`.

- `applyReply`가 처리하는 것:
  | 응답 필드 | 처리 |
  | --- | --- |
  | `reply` | 말풍선 (기존과 동일) |
  | `patch` | `applyPatch` (레거시 평면 브리프, 유지) |
  | `brief` | `applyPatch(brief)` — `BriefPatch` 키는 `Plan` 키의 부분집합이라 그대로 통과 |
  | `clear` | `clearFields` |
  | `recipientOps` (`op:"add"`) | `addRecipient({ name: label, relationship, groupSize, priority, isSelf, isOptional, preferenceNote: note, equalValueGroup })` |
  | `recipientOps` (`op:"update"`) | `refs.get(op.ref)` → `updateRecipient(id, patch)`; ref가 없으면 **조용히 버린다**(서버가 이미 `unknown_recipient`로 거른 뒤라 여기 도달하면 클라 순서 버그다 → `notify` 없이 `console.warn`) |
  | `recipientOps[].allocationAmount` | 즉시 쓰지 않고 모아서 `saveAllocations(entries)` **한 번**. `entries[i] = { recipientId, amountCents: units * MINOR_UNITS[currency], basis: op.fields.allocationBasis ?? "group_total" }`. 409 `exceeds_planned`는 실패가 아니라 승인 카드다 (`app-state.tsx:257-264` 주석) |
  | `wallet` | `proposeBudgetChange({ kind: "total_change", proposedBy: "ai_patch", … })`. **직접 쓰지 않는다** — 0013 이후 브라우저는 제안만 한다 |
  | `confirm.recipientOps` | 화면에 탭 카드로. `remove`는 `archiveRecipient`를 **탭한 뒤에만** |
  | `confirm.wallet` | 통화 변경 탭 카드 |
  | `confirm.budget` | 초과분 승인 카드 → `/trail/plan/approval` |
  | `askedField` | 칩 렌더 (W3) |
  | `rejected` | 기존 `rejectionMessage` 유지 |
  | `suggested` | 기존 탭 수락 유지 (`page.tsx:38`) |

### W1-2 `app/(app)/ask/page.tsx` 수정
- `:17` `context` 객체 → `chatPayload(app).trip` 로 대체, `hotel` 제거.
- `:25` body → `chatPayload(app)` + `{ message: clean, history }`.
- `:27` → `const turn = await applyReply(data, refMap(app.recipients), actions)`.
- `:14` 구조분해에 `recipients, wallet, saveAllocations, addRecipient, updateRecipient, archiveRecipient, proposeBudgetChange, serverPlan, bought, state` 추가.
- 새 로컬 상태 `const [awaiting, setAwaiting] = useState<Confirm|null>(null)`, `const [asked, setAsked] = useState<AskedField|null>(null)`.

### W1-3 `app/trail-brief.ts` 소소한 계약 정리
- `:51` `TripContext`에서 `hotel?: string` **삭제**. 타입에 없으면 실수로 보낼 수 없다.
- `app/api/chat/route.ts:53` 레거시 폴백(`plan.recipient` 한 명)은 **유지**한다. `/ask`가 고쳐져도
  `app/page.tsx`(단일 화면 상태머신)는 아직 살아 있다.

---

## W2 · 칩 온보딩 — 모델 호출 0회로 프레임 재현

프레임 `Mobile app with accessibility-16.png`. 결론은 **리스킨**이다. 근거:
6문답 중 도시·기간·숙소·예산 4개가 `trips` 행을 만드는 필드이고(`lib/trips/input.ts:18` `TripCreate`),
그중 **호텔명은 프라이버시 규칙상 모델에 보낼 수 없다.** 대화로 바꾸면 모델이 묻고 받아 적어야 한다 —
호텔명이 모델 컨텍스트에 들어가는 순간 `tests/trail-brief.test.ts:95`("no hotel in the brief block")가
지키던 선이 온보딩 쪽으로 우회되어 뚫린다. 또 이 6문답은 예산 검증(`TOTAL_MIN/MAX`)·날짜 순서·통화 enum을
전부 통과해야 하는데, 그걸 모델에 맡기면 검증이 두 벌이 된다.

### W2-1 신규 `app/onboarding/trip-draft.ts`
`new-trip-form.tsx`에서 상태와 검증만 뽑아낸 훅. **UI 없음.**
- `useTripDraft()` → `{ value: TripDraft, set(field, v), buckets, reserve, quoted, canAnswer(stepId), body(), submit() }`
- `new-trip-form.tsx:37-50`의 `/api/dropoff-points` 견적 effect, `:52` `splitBudget`, `:53-54` 검증을 그대로 이동.
- `:72-79` `POST /api/trips` 호출도 여기로. 폼과 칩 화면이 **같은 한 개의 제출 경로**를 쓴다.

### W2-2 신규 `app/onboarding/script.ts` — 대본은 데이터다
```
export type Answer = { chips?: Chip[]; kind: "chips"|"text"|"dates"|"money"|"currency" }
export type Step = { id: TripField; ask: string; answer: Answer; echo: (v)=>string; required: boolean }
export const TRIP_SCRIPT: Step[]   // 6스텝, 프레임 순서 그대로
```
| # | `ask` (프레임 문구 그대로) | 입력 | 저장 필드 |
| --- | --- | --- | --- |
| 1 | `Hello! Where are you visiting?` | text (city, country) | `city`, `country` |
| 2 | `When are you there?` | dates | `startDate`, `endDate` |
| 3 | `Who are you shopping for?` | chips `Family` `Friends` `Coworkers` `A mix` `Just me` | `companions` |
| 4 | `What's your total budget?` | currency + money | `currency`, `total` |
| 5 | `Where are you staying?` | text | `hotelName` (**모델에 절대 안 감**) |
| 6 | `Any preferences? I'll tailor my picks around these.` | chips = `PREFERENCE_TAGS` 라벨 (W5) | `preferenceTags` |

- 마지막 AI 말풍선은 상수: `Perfect — I have everything I need. Ready to build your shopping plan?`
- CTA: `Create my Trail plan →` (§2 버튼 목록).
- **`fetch("/api/chat")`가 이 파일 트리 어디에도 없다.** W7-(f) 가드가 이걸 소스 스캔으로 지킨다.

### W2-3 신규 `app/onboarding/chip-chat.tsx`
- `TRIP_SCRIPT`를 인덱스로 진행하는 상태머신. 답한 스텝은 `echo(v)`로 **호박색 유저 말풍선**이 되고,
  다음 스텝의 `ask`가 AI 말풍선으로 붙는다. 이전 말풍선을 탭하면 그 스텝으로 되돌아간다(= `Back`).
- 헤더: `trail AI` 워드마크 + 우측 `Ready` 필. `Ready`는 `TRIP_SCRIPT.every(required → answered)`일 때만 켠다.
- 컨텍스트 서브라인: 아직 도시조차 모르는 첫 스텝에서는 **렌더하지 않는다**. 도시가 들어온 뒤부터
  `{city} · {dates} · {currency} · {hotel}`을 채워진 만큼만 `·`로 잇는다. 빈 자리에 자리표시자를 넣지 않는다.
- 접근성: 말풍선 목록은 `role="log" aria-live="polite"`, 칩은 `<button>` 44px, 되돌리기 가능한 답은
  `aria-pressed`. 진행률은 `progressbar` + `aria-valuenow` (기존 `.onboarding-progress` 점 4개를 대체).

### W2-4 `app/onboarding/page.tsx` · `new-trip-form.tsx`
- `page.tsx`: `<ChipChat />` 렌더로 교체.
- `new-trip-form.tsx`: **삭제하지 않는다.** `useTripDraft`를 쓰도록 얇게 고치고 `/onboarding/form`으로
  남긴다. 칩 대화에서 `Edit details`를 누르면 여기로 온다 — 6개를 다시 대화로 훑는 것보다 폼이 빠르다.
- CSS는 `app/onboarding/onboarding.css`(이미 G4 소유)에만 추가. `app/globals.css`는 건드리지 않는다(§4).
- 말풍선 프리미티브는 `components/chat.tsx` 신설(`<Bubble role>`, `<ChipRow>`)로 뽑아 `/ask`와 공유.

---

## W3 · 칩 시스템

**`chips`를 `TURN_SCHEMA`에 넣지 않는다.** 근거를 파일에 적어둔다: 칩은 `scrubReply`
(`app/trail-brief.ts:412`)를 우회하는 두 번째 통로다. `reply`는 전수 스캔을 통과하지만 `chips[]`는
구조화 출력이라 스캔 대상이 아니고, 사용자가 탭하는 순간 모델의 환각이 **사용자 확인을 받은 사실**로
승격된다("블루바나나 마켓" 칩을 탭 → 유저 발화로 기록 → 다음 턴 브리프에 정당한 입력으로 재진입).

### W3-1 신규 `app/ask-chips.ts`
```
export type Chip = { label: string; send: string }
export const ASK_CHIPS: Record<AskedField, Chip[]>            // 12키 전부, 하드코딩
export function chipsFor(field: AskedField|null, ctx: { recipients; currency }): Chip[]
```
- 라벨의 출처는 **셋 뿐**이고 그 외는 없다:
  1. `CATEGORIES` / `PREFERENCES` / `PREFERENCE_TAGS` / `ROUTE_TAGS` / `CURRENCIES` (`app/trail-brief.ts`에서 import)
  2. `CHIP_LITERALS` — 이 파일 안의 동결된 문자열 배열 (`Yes` `No` `Just me` `Each` `For the group` `The whole trip` `Gifts only` …)
  3. `ctx.recipients[].label` — 서버가 `maskLabel`로 만든 라벨을 그대로 되쓴다. 환각 여지 0
- `send`는 칩마다 고정된 한 문장. 예: `{ label: "Gifts only", send: "That budget is for the gifts alone." }`
- 필드별 매핑(요지): `recipients`→수령인 라벨 + `Someone else`; `budget_scope`→`Gifts only`/`The whole trip`;
  `allocation`→수령인 라벨; `category`→`CATEGORIES`; `preference`→`PREFERENCES`;
  `equal_value`→`Yes, the same` / `They can differ`; `group_size`→`2` `3` `5` `12`;
  `local_only`/`easy_pack`→`PREFERENCE_TAGS` 부분집합; `hotel_delivery`→`Yes` `I'll carry them`;
  `areas`→`ctx.trip.areas` (브리프 블록에 이미 있는 값); `budget_total`→칩 없음(숫자 입력).
- `chipsFor(null, …)`는 **빈 배열**. 물음이 없으면 칩도 없다.

### W3-2 `/ask` 렌더
- `page.tsx:48` 기존 `.quick-replies` 3개 하드코딩 버튼을 `chipsFor(asked, …)` 결과로 교체.
  `Budget {currency} ${money(wallet.plannedCents)}` 버튼은 **삭제**한다 — 지갑 금액을 프롬프트로
  되쏘는 자기참조 루프이고, §1-4 정신에도 어긋난다.
- 칩 탭 = `sendMessage(chip.send)`. 별도 경로를 만들지 않는다(검증 통로는 하나).

---

## W4 · 요약 카드 인라인화

프레임 `-14.png`. `HERE'S WHAT I'VE GOT` 6행 + `Edit details` / `Create my Trail plan →`.

### W4-1 신규 `components/ask-summary.tsx`
**`ChatReply`를 import하지 않는다.** props는 `TrailState` 파생값만 받는다.
```
export type SummaryInput = { trip: Trip; wallet: Wallet; recipients: Recipient[];
                             preferenceTags: PreferenceTag[]; routeTag: RouteTag|null; currency: string }
export function summaryRows(input: SummaryInput): { label: string; value: string }[]   // 순수, 테스트 대상
export function AskSummary(props: SummaryInput & { onEdit; onCreate })
```
| 행 | 값의 출처 | 모델을 읽는가 |
| --- | --- | --- |
| `Trip` | `trip.city` + `dateRange(trip.startDate, trip.endDate)` (`app/(app)/view.ts:27`) | **아니오** |
| `Hotel` | `trip.hotelName` | **아니오** (호텔명은 모델에 간 적이 없다) |
| `Total budget` | `price(wallet.totalCents, currency)` — 라벨은 §2 카피 예외대로 `Total budget` | **아니오** |
| `Shopping for` | `recipients.map(name)` 결합, 4명 초과는 `+n more` | 아니오 (수령인 행은 모델이 만들 수 있지만 **값은 DB 행에서 읽는다**) |
| `Preferences` | `preferenceTags.map(PREFERENCE_TAG_LABEL)` + `routeTag` — **닫힌 enum → 라벨 맵** | 아니오 |
| `Delivery` | `` `${currency} $${money(wallet.reserveCents)} reserved` `` | **아니오 — §1-4** |

- `summaryRows`의 시그니처에 `ChatReply`가 들어갈 자리가 없다는 것이 곧 (c) 가드다.
- 카드 안에서 `wallet.overPlan`이면 `OVER PLAN` 배지(§1 접근성: 대비 4.41:1을 올려서 쓴다 → G1 토큰 사용).
- 저장 대기 중이면 `sync-chip`을 카드 머리에 붙인다(§4 마지막 줄).

### W4-2 게이트 — 신규 `app/(app)/ask/ready.ts`
```
export const REQUIRED = ["city","hotel","budget","recipients","preferences"] as const
export function missingFields(input: SummaryInput): Required[]     // 순수
export const readyToPlan = (i) => missingFields(i).length === 0
```
- `/ask/page.tsx`는 `readyToPlan(...)`일 때만 `<AskSummary/>`를 대화 끝에 붙인다.
  **`askedField === null`은 조건이 아니다.** 모델이 물을 게 없다고 판단한 것과 필수 항목이 다 찬 것은
  다른 사실이고, 전자를 후자로 읽는 순간 빈 요약 카드가 나간다 → W7-(e).
- `Edit details` → `/onboarding/form`(신규 트립) 또는 `/ask/brief`(기존 트립).
- `Create my Trail plan →` → `approvePlan()` 후 `/trail/plan/gifts` (`ask/brief/page.tsx:25`의 동작을 이관).

### W4-3 `app/(app)/ask/brief/page.tsx`
- 삭제하지 않는다. `Edit details`의 착지점으로 남긴다.
- `:25` 버튼 문구 `Find stores along my route` → **`Create my Trail plan →`** (§2 CTA 통일).
- `:21` `Delivery reserve of {currency} ${money(wallet.reserveCents)} is held back` — 이건 클라이언트가
  지갑에서 그리는 문장이라 §1-4 위반이 아니다. 유지하되 문구를 `Reserved for delivery`(§2 데이터 라벨)로 맞춘다.
- `app/(app)/trail/plan/layout.tsx:19`, `trail/plan/budget/page.tsx:22`의 `/ask/brief` 링크는 그대로 산다.

---

## W5 · `preference_tags` 신설

### W5-1 왜 지금 스키마로 안 되는가
`Local · Not touristy · Moderate walk`가 현재는 `plans.local_only`(bool) + `plans.easy_pack`(bool) +
`PREFERENCES` 4-enum + `recipients.preference_note`(자유텍스트)로 흩어져 있다(`0001_schema.sql:136-138`,
`:107`). "Not touristy"는 어느 칸에도 없고 `preference_note`에 자유문자열로 들어간다 — 그 문자열이
요약 카드에 그대로 렌더되면 **모델이 지어낸 카피가 인쇄된다.**

### W5-2 두 개의 닫힌 enum (`app/trail-brief.ts`에 추가)
G3와의 합의 원칙: **필터하는 컬럼이 없는 태그는 만들지 않는다.**

```
export const PREFERENCE_TAGS = ["local","handmade","not_touristy","easy_to_pack",
                                "edible","useful","keepsake","budget_friendly"] as const
export const ROUTE_TAGS = ["short_walk","moderate_walk","any_walk"] as const
export const PREFERENCE_TAG_LABEL: Record<PreferenceTag,string> =
  { local:"Local", handmade:"Handmade", not_touristy:"Not touristy", easy_to_pack:"Easy to pack",
    edible:"Edible", useful:"Useful", keepsake:"Keepsake", budget_friendly:"Budget friendly" }
export const ROUTE_TAG_LABEL: Record<RouteTag,string> =
  { short_walk:"Short walk", moderate_walk:"Moderate walk", any_walk:"Any walk" }
```

| 태그 | 무엇을 거르는가 | 대응 컬럼 |
| --- | --- | --- |
| `PREFERENCE_TAGS` 8종 | 상품 | **`products.preference_tags`** (신설) |
| `ROUTE_TAGS` 3종 | 경로 | `stops.walk_minutes` 임계 (≤8 / ≤20 / 무제한) |

`Moderate walk`를 상품 태그에 섞지 않는 이유: 상품 행에 걸 수 없는 값이라 `products` 쪽에 대응 컬럼이
생기지 않고, 그러면 정확히 "아무것도 필터하지 않는 장식"이 된다.

### W5-3 마이그레이션 — **번호 협의 필요**
`FIGMA_ADOPTION §4`가 배정한 번호는 G3(0020·0021·0022) · G2(0023) · G5(0024·0019)뿐이고 **G4에는 없다.**
→ G4는 **`0025_preference_tags.sql`을 새로 소유**하고, `products` 쪽 컬럼만 G3의 `0022`에 얹는다(협의 1건).

`supabase/migrations/0025_preference_tags.sql`:
```sql
create type public.preference_tag as enum ('local','handmade','not_touristy','easy_to_pack',
                                           'edible','useful','keepsake','budget_friendly');
create type public.route_tag as enum ('short_walk','moderate_walk','any_walk');
alter table public.plans add column preference_tags public.preference_tag[] not null default '{}',
                          add column route_tag public.route_tag;
-- 기존 불리언을 태그로 옮긴다. 두 표현이 공존하는 기간은 이 파일 하나뿐이다.
update public.plans set preference_tags =
  array_remove(array[ case when local_only then 'local'::public.preference_tag end,
                      case when easy_pack  then 'easy_to_pack'::public.preference_tag end ], null);
```
- `plans.local_only` / `easy_pack` **drop은 이 마이그레이션에서 하지 않는다.** `app/page.tsx`(레거시 화면)과
  `lib/state/shape.ts:34`가 아직 읽는다. 별도 후속 `0026`에서 한 번에 떨어뜨린다 — 계획서에 TODO로 남긴다.
- `plans`는 0013 이후 브라우저가 UPDATE할 수 없다(`0013_...sql:23`). 따라서 태그를 저장할 경로가 필요하다:
  **신규 `app/api/plans/[planId]/brief/route.ts` (PATCH)** — `service_role`로 `category`·`preference`·
  `preference_tags`·`route_tag`·`hotel_delivery`만 갱신하고 `plan_events`에 `actor:'user_edit'`로 남긴다.
  금액 컬럼은 이 라우트가 절대 만지지 않는다(승인 게이트는 `budget_changes`가 유일한 통로다).
- G3 `0022`에 부탁할 것: `alter table public.products add column preference_tags public.preference_tag[] not null default '{}';`
  + 시드가 이 컬럼을 채울 것. **0020이 enum을 만들므로 0016은 0025 뒤여야 한다** — 순서가 어긋나면
  enum 타입을 `0022`에서 만들고 `0025`은 `plans`만 담당하도록 뒤집는다(어느 쪽이든 정의는 한 곳).

### W5-4 계약 변경 (`app/trail-brief.ts`)
- `BriefPatch`(`:40`): `localOnly`/`easyPack` → `preferenceTags?: PreferenceTag[]; routeTag?: RouteTag`.
- `TURN_SCHEMA.brief_patch`(`:174-185`): `local_only`/`easy_pack` 제거,
  `preference_tags: { type:["array","null"], maxItems: 6, items: { type:"string", enum: PREFERENCE_TAGS } }`,
  `route_tag: nullableEnum(ROUTE_TAGS)` 추가. `required` 목록 동시 갱신(strict 모드 —
  `tests/trail-brief.test.ts:144`가 지킨다).
- `sanitizeBriefPatch`(`:268`): 배열을 순회하며 enum 밖 값은 `{ field:"preference_tags", reason:"unknown_value" }`로
  거절. **문자열 그대로 통과시키는 분기를 만들지 않는다.** 중복 제거·최대 6개.
  전환기 호환: `local_only:true`가 오면 `local` 태그로, `easy_pack:true`는 `easy_to_pack`으로 매핑하고
  불리언 자체는 버린다(브리프에 두 표현이 남지 않게).
- `BRIEF_FIELDS`(`:24`) / `CLEAR_MAP`(`:445`) / `clear` enum(`:223`): `local_only`,`easy_pack` →
  `preference_tags`,`route_tag`.
- `replyAllowList`(`:438`): `...PREFERENCE_TAGS.map(t=>PREFERENCE_TAG_LABEL[t])`, `...ROUTE_TAG_LABEL` 추가.
  안 하면 `Not touristy`가 `CAPS_RUN`에 걸려 "a local shop"으로 치환된다.
- `lib/state/types.ts:50` `Plan`에 `preferenceTags: PreferenceTag[]; routeTag: RouteTag|null` 추가,
  `lib/state/shape.ts:34` 매핑 추가 (§4: 마이그레이션을 여는 그룹이 수정 → 이 두 줄은 G4가 연다. G3와 충돌 시 G3 우선).

---

## W6 · 카피 · 컨텍스트 서브라인 · 대화 종료

### W6-1 상단 두 줄 → 한 줄
- `app/(app)/ask/page.tsx:43` `.chat-status`(`Trail AI · prototype`)와 `:44` `.memory-strip` **삭제**.
- 대체: `<Header title="Trail AI" … />` 아래 `.ask-context` 한 줄 —
  `` {trip.city} · Day {n} of {m} · {currency} · {trip.hotelName} ``
  (§2 데이터 라벨 `Day {n} of {m}`. 프레임의 `Day 2`보다 §2가 우선.)
  `n` = 오늘 − `startDate` + 1(클램프), `m` = `dayCount`. 날짜가 없으면 그 조각만 빠진다.
- 메모리 고지는 **꺼져 있을 때만** 한 줄 인라인으로 남긴다(`Recommendations use this trip only ·` + `Why?` → `/account/memory`).
  켜져 있을 때 상시 노출은 두 줄을 영구히 잡아먹는데, 프레임에는 그 자리가 없다. `TRAIL REMEMBERS` 섹션은
  §2대로 Home 대시보드(G3)로 간다.
- 우측 `Ready` 필: `readyToPlan(...)`일 때만. 아니면 남은 개수 `2 to go`.

### W6-2 인트로 도시 보간
- `app/(app)/app-state.tsx:49` `const greeting: Message = {…}` (상수) →
  `export const greeting = (city: string): Message => ({ role: "ai", text: \`Let's build your ${city} shopping day. I'll help you find meaningful local gifts, stay within your budget, optimize your route, and get your bags back to your hotel.\` })`
  프레임 `-14.png`의 문장 그대로. `:104` `useState<Message[]>([greeting])` → `[greeting(trip?.city ?? "your")]`.
  **클라이언트가 만든다 — 모델 턴이 아니다.**
- `starters`(`:43-47`)는 유지하되 `Two equal gifts` 스타터 문구는 그대로 둔다(회귀 케이스와 짝이다).

### W6-3 CTA 통일 → `Create my Trail plan →`
`components/ask-summary.tsx`(신규) · `app/(app)/ask/brief/page.tsx:25` · `app/onboarding/chip-chat.tsx` 세 곳.

### W6-4 **대화 종료 조건** (핵심)
지금 `PROMPT_TAIL`(`app/trail-brief.ts:150`)은 "at most one question — the single most useful missing
detail"만 말한다. 다 채워졌을 때 무엇을 하라는 말이 **없어서** 모델은 매 턴 새 질문을 만들어낸다.

프롬프트는 요청이므로 **양쪽에서 막는다.**

(1) `briefContext`(`:240`)에 서버가 계산한 목록을 넣는다:
```
brief.needs = { missing: string[], done: boolean }   // REQUIRED 중 아직 비어 있는 것
```
`TurnContext`에 `missingFields?: string[]` 추가, `app/api/chat/route.ts:56-66` `buildContext`에서 채운다.
**금액은 넣지 않는다** — 필드 이름만. (`tests/trail-wallet.test.ts:40` 유지)

(2) `PROMPT_TAIL`에 블록 추가:
```
──────── WHEN TO STOP ASKING ────────
The brief block's needs.missing lists what is still unknown. Ask about exactly one of those, and
nothing else. Never ask about the city, the dates, the hotel, or the currency — the app owns those
and you will not be told them.
When needs.missing is empty, ask nothing at all. Say in one sentence that you have what you need and
that they can build the plan, and set asked_field to null. Do not invent a further detail to ask about.
Never ask the same asked_field twice in a row; if they did not answer, move to the next missing item.
```

(3) 서버 강제 — `composeTurn`(`:449`):
```
const asked = inEnum(ASKED_FIELDS, raw.asked_field) ? raw.asked_field : null;
const askedField = (ctx.missingFields?.length ?? 0) === 0 ? null : asked;
```
필수가 다 찼으면 `askedField`는 무조건 `null`이고, 칩도 안 뜬다. 프롬프트가 실패해도 화면은 끝난다.

(4) 클라이언트 — `readyToPlan`이 참이 되는 순간 요약 카드가 뜨고, 입력창은 살아 있다(더 말하고 싶으면 계속).
종료는 **버튼이 나타나는 것**이지 입력을 막는 것이 아니다.

### W6-5 §2 이름표 반영 (G4 소관 화면)
`Trail AI` (화면 제목) · `HERE'S WHAT I'VE GOT` (섹션 라벨) · `Edit details` · `Create my Trail plan →` ·
`Total budget`(§2 카피 예외 1) · `Reserved for delivery`.
프롬프트 안의 탭 이름(`:146-147`)은 G2의 개명(`Ask AI`→`AI`)에 맞춰 **G4가 고친다** —
`tests/trail-reply.test.ts:93`이 그 목록을 검사하므로 두 그룹이 같은 줄을 만지지 않게 소유를 G4로 못 박는다.

---

## W7 · 새 가드 5종

전부 `node --test` · 순수 함수 대상. 모델을 호출하지 않는다.

### (a) `tests/trail-preference-tags.test.ts` — 모르는 태그는 요약 카드에 닿지 못한다
```
sanitizeBriefPatch({ preference_tags: ["local","artisanal vibes","not_touristy"] })
  → patch.preferenceTags = ["local","not_touristy"], rejected[0].reason === "unknown_value"
composeTurn({ brief_patch:{ preference_tags:["<script>"] } }, ctx).brief.preferenceTags → undefined
summaryRows({ …, preferenceTags: ["local"] }) 의 Preferences 행 → "Local"
// 자유 문자열이 라벨 맵에 없으면 렌더 자체가 불가능하다는 것을 타입이 아니라 값으로 확인:
PREFERENCE_TAGS.every(t => typeof PREFERENCE_TAG_LABEL[t] === "string")
Object.keys(PREFERENCE_TAG_LABEL).length === PREFERENCE_TAGS.length
```

### (b) `tests/trail-chips.test.ts` — 모든 칩 라벨은 enum이거나 브리프 라벨이다
```
const allowed = new Set([...CATEGORIES, ...PREFERENCES, ...CURRENCIES,
                         ...PREFERENCE_TAGS.map(l), ...ROUTE_TAGS.map(l), ...CHIP_LITERALS]);
for (const field of ASKED_FIELDS)
  for (const chip of ASK_CHIPS[field])
    assert.ok(allowed.has(chip.label), `${field}/${chip.label}`);
// 수령인 칩만 브리프에서 온다
chipsFor("recipients", { recipients: [{ label:"Mom" }, { label:"두 친구" }] })
  .every(c => allowed.has(c.label) || ["Mom","두 친구"].includes(c.label));
// TURN_SCHEMA에 chips가 없다 — 두 번째 통로를 막는 가드
assert.equal(JSON.stringify(TURN_SCHEMA).includes("chip"), false);
// 물음이 없으면 칩도 없다
assert.deepEqual(chipsFor(null, ctx), []);
// ASKED_FIELDS 12개 전부 키가 있다 (필드가 늘면 이 테스트가 먼저 깨진다)
assert.deepEqual(Object.keys(ASK_CHIPS).sort(), [...ASKED_FIELDS].sort());
```

### (c) `tests/trail-summary-card.test.ts` — 요약 카드는 `ChatReply`를 읽지 않는다
```
const src = readFileSync("components/ask-summary.tsx", "utf8");
assert.equal(/ChatReply|askedField|recipientOps|from "\.\.\/app\/trail-brief"/.test(src), false);
assert.equal(src.includes("/api/chat"), false);
// Hotel 행은 trip에서만 온다
const rows = summaryRows({ trip:{ city:"Toronto", hotelName:"The Annex Hotel", … }, wallet, … });
assert.equal(rows.find(r=>r.label==="Hotel").value, "The Annex Hotel");
assert.equal(rows.find(r=>r.label==="Delivery").value, "CAD $9 reserved");
```

### (d) `tests/trail-summary-card.test.ts` (같은 파일) — `reserveCents`가 바뀌어도 프롬프트는 안 움직인다
```
const a = summaryRows({ …, wallet: { …, reserveCents: 900 } });
const b = summaryRows({ …, wallet: { …, reserveCents: 1500 } });
assert.notDeepEqual(a, b);                                   // 화면은 바뀐다
const prompt = SYSTEM_PROMPT + briefContext(ctx({ plannedUnits: 250, missingFields: [] }));
for (const n of [900, 1500, 9, 15]) assert.equal(prompt.includes(String(n)), false);
assert.equal(/reserve|held back|hold-?back|delivery fee/i.test(briefContext(ctx())), false);
// needs.missing이 들어와도 금액은 안 샌다
assert.equal(briefContext(ctx({ missingFields:["budget"] })).includes("reserve"), false);
```
(기존 `tests/trail-wallet.test.ts:40`는 프롬프트 쪽만 본다. 이건 **양쪽을 한 번에** 보는 케이스라 별개다.)

### (e) `tests/trail-ask-gate.test.ts` — 필수가 비면 `asked_field:null`이어도 카드를 내지 않는다
```
const bare = { trip:{ city:"Toronto", hotelName:"" }, wallet: EMPTY_WALLET, recipients: [],
               preferenceTags: [], routeTag: null, currency:"CAD" };
assert.deepEqual(missingFields(bare).sort(), ["budget","hotel","preferences","recipients"]);
assert.equal(readyToPlan(bare), false);
// 모델이 "다 됐다"고 말해도 게이트는 클라이언트 상태만 본다
const turn = composeTurn({ reply:"Perfect — I have everything I need.", asked_field: null }, ctx());
assert.equal(turn.askedField, null);
assert.equal(readyToPlan(bare), false);
// 반대로 필수가 다 차면 모델이 계속 물어도 askedField는 강제로 null
assert.equal(composeTurn({ reply:"Anything else?", asked_field:"category" },
                          ctx({ missingFields: [] })).askedField, null);
```

### 추가(가드 아님, 배선 회귀) `tests/trail-ask-wiring.test.ts`
W1이 다시 조용히 끊기는 것을 막는 최소 케이스. 5종에 포함시키지 않되 **W1과 같은 커밋에** 넣는다.
```
chatPayload(app) 의 키에 recipients/plannedUnits/unallocatedUnits/planApproved/hasPurchases가 있다
chatPayload(app) 에 hotel/hotelAddress/email이 없다      // 프라이버시
refMap(recipients) 의 r1..rN 순서가 chatPayload().recipients 순서와 같다
applyReply(피그마 5인 턴, refs, spyActions) →
   saveAllocations 가 한 번, 5개 엔트리, 합 278*100 cents, remove는 archiveRecipient를 부르지 않는다
applyReply({ wallet: {…} }) → proposeBudgetChange 호출, 직접 쓰기 없음
```

### 대표 발화 전후 비교 (수동, 보고 항목)
엄마 선물 · 등가 2개 · 12인 팀 · 부정문(`not chocolate`) · 예산 초과 · 재고 질문 · 한국어 · 인젝션 시도.
전(=현재 `/ask`)은 8건 모두 화면에 다중 수령인이 안 뜬다. 후는 8건 전부 브리프 반영/거절 문구/무반응이
의도대로인지 표로 기록한다.

---

## W8 · 기존 230개 중 깨지는 것과 고치면 안 되는 것

### 깨진다 — 이번 작업의 일부로 **고쳐야 하는** 케이스
| 파일:줄 | 왜 | 어떻게 |
| --- | --- | --- |
| `tests/trail-brief.test.ts:138` | `sanitizeBriefPatch`가 `local_only`/`easy_pack` → `localOnly`/`easyPack`을 기대 | 기대값을 `preferenceTags:["local","easy_to_pack"]`로. 전환 매핑을 검사하는 케이스로 승격 |
| `tests/trail-brief.test.ts:93` | ctx 리터럴에 `hotel: "The Drake Hotel"` — `TripContext.hotel` 삭제로 타입 오류 | 키 삭제. `:95` 테스트는 "TripContext에 hotel 필드가 없다"로 강화 |
| `tests/trail-brief.test.ts:144` | strict 스키마 walk — `preference_tags`가 `required`에 빠지면 실패 | **고치지 말고** 스키마를 맞춘다. 이게 이 변경의 안전장치다 |
| `tests/trail-reply.test.ts:93` | 프롬프트의 탭 이름 목록. G2가 `Ask AI`→`AI`로 개명 | 프롬프트(`:146`)와 이 목록을 **G4가 함께** 고친다 |
| `tests/trail-state.test.ts` (plan 매핑 부분) | `Plan`에 `preferenceTags`/`routeTag` 추가 | 기대 객체에 두 키 추가 |
| `tests/legacy-import.test.ts` | `plans` 컬럼을 읽으면 영향 | 확인 후 컬럼 추가분만 반영. 불리언은 아직 살아 있으므로 대부분 무해 |

### 고치면 안 된다 — 빨개지면 **우리 변경이 틀린 것**
| 파일:줄 | 지키는 규칙 |
| --- | --- |
| `tests/trail-wallet.test.ts:40` | 예비비 크기가 프롬프트 토큰을 한 개도 못 바꾼다 (§1-4의 뿌리) |
| `tests/trail-wallet.test.ts:49` | 예비비를 말한 답변은 통째로 교체된다 |
| `tests/trail-wallet.test.ts:12,21` | 스코프 없는 총액은 아무것도 쓰지 않고 질문이 된다 |
| `tests/trail-wallet.test.ts:64` | 10달러 스냅이 타이핑된 금액(58/68/39/45)에 닿지 않는다 |
| `tests/trail-wallet.test.ts:84` | 엔화 100배 오차 |
| `tests/trail-brief.test.ts:95,103` | 브리프 블록에 호텔·주소·실명·버킷 금액이 없다 |
| `tests/trail-brief.test.ts:110,117` | 인젝션은 라벨로만 착지한다 |
| `tests/trail-brief.test.ts:23` | 부정문은 아무것도 추론하지 않는다 |
| `tests/trail-reply.test.ts` 전체 | `scrubReply` 전수 — 칩을 스키마에 넣지 않는 이유 그 자체 |
| `tests/trail-recipients.test.ts:26,38,44,57` | 피그마 5인 1턴 · 미지 ref 거절 · remove는 제안일 뿐 |
| `tests/trail-approval-gate.test.ts` 전체 | 승인은 DB가 강제한다. `applyReply`가 직접 쓰기를 하면 여기가 깨진다 |
| `tests/trail-allocations.test.ts` · `trail-budget-changes.test.ts` | 배분·초과 승인 경로 |

---

## 순서와 산출 파일

| 단계 | 파일 | 신규/수정 |
| --- | --- | --- |
| W1 | `app/(app)/ask/wiring.ts` · `tests/trail-ask-wiring.test.ts` | 신규 |
| W1 | `app/(app)/ask/page.tsx` · `app/trail-brief.ts:51` | 수정 |
| W5 | `app/trail-brief.ts` (enum·스키마·sanitizer·allowList) | 수정 |
| W5 | `supabase/migrations/0025_preference_tags.sql` · `app/api/plans/[planId]/brief/route.ts` | 신규 |
| W5 | `lib/state/types.ts:50` · `lib/state/shape.ts:34` | 수정 (G3와 충돌 시 G3 우선) |
| W4 | `components/ask-summary.tsx` · `app/(app)/ask/ready.ts` | 신규 |
| W3 | `app/ask-chips.ts` · `components/chat.tsx` | 신규 |
| W6 | `app/trail-brief.ts` (WHEN TO STOP ASKING · composeTurn) · `app/api/chat/route.ts:56` · `app/(app)/app-state.tsx:49,104` · `app/(app)/ask/brief/page.tsx:21,25` | 수정 |
| W2 | `app/onboarding/trip-draft.ts` · `script.ts` · `chip-chat.tsx` | 신규 |
| W2 | `app/onboarding/page.tsx` · `new-trip-form.tsx` · `onboarding.css` | 수정 |
| W7 | `tests/trail-preference-tags.test.ts` · `trail-chips.test.ts` · `trail-summary-card.test.ts` · `trail-ask-gate.test.ts` | 신규 |

## 다른 그룹에 거는 요청

1. **G3** — `0022`에 `products.preference_tags public.preference_tag[]` 추가 + 시드가 채울 것.
   enum 타입 정의를 `0022`과 `0025` 중 어디에 둘지 한 번만 정한다(둘 다에 두지 않는다).
2. **G2** — 하단 탭 개명 시 프롬프트(`app/trail-brief.ts:146-147`)와 `tests/trail-reply.test.ts:93`은
   **G4가 고친다.** G2는 그 두 줄을 만지지 않는다.
3. **G1** — 칩(선택/비선택), 말풍선(ai/user), 요약 카드 행 구분선, `Ready` 필 토큰이 필요하다.
   `OVER PLAN`은 §1의 4.41:1을 올린 값으로.
4. **G0** — `dev-signin` 가드가 열려 있는 동안 `/api/chat`의 레이트리밋 키(`traveler.id`)가
   무의미해진다. G0 완료 전에는 `/ask` 실사용 테스트를 로컬로 한정한다.

## 남긴 TODO (이번 범위 아님)

- `0026`: `plans.local_only` · `easy_pack` 컬럼 제거 (`app/page.tsx` 은퇴와 같은 커밋).
- `recipients.preference_note` 자유텍스트는 유지한다 — 요약 카드에는 **렌더하지 않는다**(모델 카피 인쇄 방지).
  수령인 상세 화면에서만 보이고, 그 화면은 사용자가 직접 타이핑한 값임을 표시한다.
- 카탈로그가 채워지면 `NAMING_NO_CATALOG` → `NAMING_CATALOG` 스왑 (인자 하나, `buildSystemPrompt`).
  그 시점에 칩에 `{p3}` 형태의 상품 id 칩을 추가할지 재논의 — 지금은 하지 않는다.
