# 승인 게이트 결함 2건 — UI 감사(2026-08-19) 파생

감사에서 나온 항목 중 **에러 경계 6개 · 루트 `not-found` · `loading.tsx` 3개 · `SAME-DAY DELIVERY` 카피**는
그 자리에서 구현에 들어갔다. 아래 두 건은 **화면 추가가 아니라 승인 경로의 판단**이 걸려 있어 분리했다.
둘 다 이 문서로 명세가 확정됐고, 착수 전에 다시 논의할 항목은 없다.

| | 범위 | 마이그레이션 | 크기 |
| --- | --- | --- | --- |
| **A** `reserve_short` 승인 게이트 정리 | `bags/review` · `bags/pay` · `view.ts` · `eligibility.ts` | **없음** | **M** |
| **B** 플랜 외 가방 진입점 | `bags/select` · `bags` · 신규 `/bags/unplanned` · `app-state` | **없음** | **L** |

---

# A. `reserve_short` — 승인처럼 보이는 내비게이션

**왜 지금 안 하고 별도인가:** 감사가 지적한 건 "버튼이 없다"였는데 코드를 읽어보니 버튼은 `/bags/pay`에 있었고,
진짜 문제는 **버튼의 위치가 아니라 두 개의 flexible 인출 경로가 서로 다른 약속을 한다는 것**이었다 —
이건 카피 수정이 아니라 결정이라 이번 구현 묶음에서 뺐다.

## A-0. 감사 발언의 정정

감사에서 나는 "`bags/review:90`이 안내문만 있고 결정할 버튼이 없다"고 했다. 절반만 맞다.

- `judgeEligibility()`는 `feeCents > reserveCents`일 때 **실제로** `reserve_short`를 반환한다 (`lib/transfers/eligibility.ts`).
- 승인 게이트는 `/bags/pay`에 **이미 잘 만들어져 있다** — `Blocked`에 `flexibleRemedyLabel()` 라벨을 꽂고,
  flexible이 모자라면 버튼을 `blocked` 처리하고, `confirmTransfer(id, true)`가 두 번째 요청으로 나간다.
- `/bags/review`에 없는 건 게이트가 아니라 **게이트가 아니어야 한다는 표시**다.

그래서 A는 "게이트를 새로 만드는 일"이 아니라 **"게이트를 하나로 확정하고 나머지를 그 게이트로 가는 길로 강등하는 일"**이다.

## A-1. 가장 중요한 결정 — 배송비 flexible 인출은 `budget_changes`를 타지 않는다

이 저장소에는 flexible을 쓰는 경로가 이미 **두 개** 있고, 둘은 같은 것이 아니다.

| | 쇼핑 초과 | 배송비 초과 |
| --- | --- | --- |
| 어디서 | `trail/shop/[stopId]/record` | `bags/pay` |
| 무엇으로 | `POST /api/budget-changes` → `.../{id}/approve` | `POST /api/transfers/{id}/confirm` (`approveFlexible: true`) |
| 버킷 | **움직인다** (`planned +X`, `flexible −X`) | **움직이지 않는다** |
| 감사 흔적 | `budget_changes` 행 + Approvals 이력 | `plan_events` (`stage: approved`, `actor: approval`, `field: delivery_fee_from_flexible`) |
| 규칙 1 충족 방식 | `service_role` 전용 승인 함수 (`0013`) | `service_role` 클라이언트만 승인 단계를 쓸 수 있음 (`0013`) |

**결정: 배송비 경로는 `budget_changes`로 옮기지 않는다. 현재 구조가 옳다.** 근거 네 가지.

1. **버킷 크기를 바꾸는 건 재계획이고, 배송비는 1회성 지출이다.** `delivery_reserve`도 소비될 때
   줄어들지 않는다 — 잔액이 아니라 천장이다. flexible만 줄인다면 두 버킷이 서로 다른 의미가 된다.
2. **취소가 되돌려지지 않는다.** `confirm/route.ts`가 명시하듯 예약은 "transfer가 취소되면 그냥 풀린다".
   `budget_changes`로 flexible을 깎아두면 취소 시 자동 환원이 없고, 원장은 append-only(규칙 6)라
   조용히 되돌릴 수도 없다. 되돌리려면 **환원 제안을 또 승인**받아야 하는데, 그건 사용자가 승인한 적 없는 부담이다.
3. **동선이 끊긴다.** `budget_changes`는 `/trail/plan/approval`에서 승인된다. 배송비를 그리로 보내면
   여행자는 카운터 앞에서 계획 탭으로 튕겨나가고, transfer는 `draft`에 남으며, 돌아올 경로가 없다.
4. **규칙 1은 이미 충족돼 있다.** `0013`이 강제하는 건 "브라우저가 승인 단계 plan_event를 못 쓴다"이지
   "모든 승인이 `budget_changes`를 타야 한다"가 아니다. confirm 라우트는 admin 클라이언트로 그 행을 쓴다.

## A-2. 그 결정에서 따라나오는 카피 결함 — `flexibleRemedyLabel()`은 이 경로에 쓰면 안 된다

`app/(app)/view.ts:39`가 만드는 라벨:

    Take $12.00 from flexible ($38.00 left)

이 라벨은 **버킷이 실제로 움직이는** 쇼핑 경로를 위해 쓰였다. 배송 경로에서는 버킷이 안 움직이므로
승인 직후에도 지갑은 여전히 `$50.00 flexible`을 표시한다. 여행자는 **화면 어디에도 나타나지 않는 숫자를 승인**하고,
같은 flexible로 다음 배송을 또 승인할 수 있다. 규칙 5가 지키려던 것이 여기서 무너진다.

**결정: `/bags/pay`의 `reserve_short` 라벨에서 `flexibleRemedyLabel()`을 걷어내고 배송 전용 라벨을 쓴다.**
`flexibleRemedyLabel()` 자체는 그대로 둔다 — `record/page.tsx`에서는 정확하다.

`view.ts`에 추가 (구현자: `flexibleRemedyLabel` 바로 아래, 같은 주석 톤으로).
`deliveryFlexibleLabel(shortfallCents, flexibleCents, currency)` 두 갈래:

- 커버 가능 → `Approve {shortfall} from flexible for this delivery`
- 커버 불가 → `Flexible holds {flexible}. This delivery needs {shortfall} more.`

## A-3. 확정된 실패 지점 — review의 `approve_flexible`은 매니페스트를 저장하지 않고 이동한다

`app/(app)/bags/review/page.tsx:40`

    if (action === "approve_flexible") return router.push("/bags/pay");

`saveManifest()`는 `next()` 안에만 있다. 이 remedy로 나가면 선택한 가방이 서버에 없는 채로 `/bags/pay`에 도착하고,
`confirmTransfer` → `loadItems` → **`no_bags` 409** → 여행자는 가방을 골랐는데
`"Select at least one bag first."`(`view.ts:119`)를 읽는다.

**결정: review의 모든 이동은 `next()`와 같은 경로를 쓴다.** `approve_flexible`은
`await saveManifest(transfer.id)`가 성공한 뒤에만 `/bags/pay`로 간다. 실패하면 기존 `error` 문구를 그대로 쓰고
이동하지 않는다.

## A-4. flexible이 모자랄 때의 탈출구

현재는 버튼이 비활성으로 남고 끝이다. 헌법 4의 **이송 불가** 분기가 여기서 죽는다.

**결정: 탈출구는 `split_bags` 하나. 새 remedy 코드는 만들지 않는다.**

- `raise_reserve`(예산 재배분) 같은 코드를 새로 만들지 않는 이유: `app/(app)/trail/plan/budget/page.tsx`는
  읽기 전용이고 스스로 `"Editing it is not wired up yet."`이라고 적어 뒀다. **착지할 화면이 없는 능력을
  버튼으로 약속하지 않는다.** 예산 편집은 별도 백로그이고, 그게 생기면 그때 remedy를 추가한다.
- `split_bags`는 진짜로 작동한다 — 요금은 `includedBags` / `extraBags` 단계형이라 가방을 줄이면 요금이 내려간다.
- 세 번째 길은 버튼이 아니라 문장이다: **가방을 직접 들고 간다.** 그게 사실이고, 그 문장이 이 분기의 정답이다.

`lib/transfers/eligibility.ts`의 `reserve_short` remedies와 `view.ts`의 `fallbackRemedies.reserve_short`를
**둘 다** `["approve_flexible", "split_bags"]`로 맞춘다. 지금은 `["approve_flexible"]` 하나뿐이고, 두 곳이
같아야 오프라인에서 되읽은 화면이 온라인과 다른 선택지를 그리지 않는다.

## A-5. 화면 상태 — `/bags/review`

- **진입 조건**: 가방 1개 이상 선택. **주요 액션**: 카운터 선택 · 매니페스트 저장 후 결제로 이동.
  **이탈 조건**: `/bags/select`(뒤로) · `/bags/pay`(앞으로) · remedy가 지정한 화면.
  **유지되는 상태**: 가방 선택(거부돼도 유지된다 — `eligibility.ts` 상단 주석) · 선택한 카운터.
- **`reserve_short`일 때 이 화면이 하는 일**: 사실을 말하고 보낸다. **승인은 받지 않는다.**
  - `Blocked` 패널은 그대로 뜨되 `labels`로 `approve_flexible`을 `Decide this on the payment screen`으로 덮는다.
  - `bags/review/page.tsx:90`의 `reserve-note` 문단은 **삭제한다.** 같은 사실을 패널이 이미 말하고 있고,
    행동이 없는 문단이 승인처럼 읽히는 것이 이 결함의 출발점이었다.
  - `Review and pay` 버튼은 **비활성으로 만들지 않는다.** 결정이 다음 화면에 있으므로 막으면 갈 곳이 없다.
    서브라벨만 바꾼다.
- **상태 분기**
  - 로딩: 카운터 목록이 오기 전에는 패널을 그리지 않는다(`eligibility === null`). 없는 판정을 그리지 않는다.
  - 빈 상태: 가방 0개 → `reserve_short`는 애초에 안 뜬다(`judgeEligibility`가 먼저 `No bags selected.`).
  - 오류: `saveManifest` 실패 → 기존 문구, 이동 없음.
  - 오프라인: `transfer.ineligibleCode`로 되읽은 값 + `fallbackRemedies`. 요금이 없으면 금액을 쓰지 않는다.
  - 권한 거부: 해당 없음.
- **승인 게이트**: 없음. 이 화면은 게이트가 아니라는 것이 A의 결론이다.
- **실패 경로**: 헌법 4의 **이송 불가**. 복구 수단은 `split_bags`, 그리고 결제 화면의 flexible 승인.

## A-6. 화면 상태 — `/bags/pay` (`reserve_short` 분기)

- **승인 게이트**: 여기 하나. 한 번의 탭이 **배송 확정 + 카드 청구** 두 개를 동시에 한다는 사실은
  기존 서브라벨(`"Confirms the delivery, then charges the fee"`)이 이미 말하고 있다. 유지.
- flexible이 충분: 승인 버튼 활성 + `split_bags` 버튼 동시 노출.
- flexible이 부족: 승인 버튼 `blocked`(비활성, 이유를 라벨에 적은 채) + `split_bags` 활성 + 아래 문장.
- **오프라인**: 확정은 서버 판정이 필요하다. 큐에 넣지 말고 거절한다 —
  승인 대기 중인 예산 결정을 아웃박스에 넣는 것은 규칙 1 위반이다.

## A-7. 카피 전문 (영문 확정)

`/bags/review` — `Blocked` 패널

    Title:   The fee is more than your delivery reserve      (view.ts 기존 문구 유지)
    Body:    Moving the difference out of your flexible budget is your call, not ours.
    Button:  Decide this on the payment screen
    Button:  Send fewer bags
    Note:    Your reserve holds {reserve} and this delivery costs {fee}.

`/bags/review` — `Review and pay` 서브라벨 (`reserve_short`일 때만)

    The next screen asks whether flexible covers the difference

`/bags/pay` — `Blocked` 패널, flexible이 충분할 때

    Button:  Approve {shortfall} from flexible for this delivery
    Button:  Send fewer bags
    Note:    Your delivery reserve holds {reserve} and this fee is {fee}. Approving
             lets this one delivery draw the difference from flexible. Your buckets
             stay the size you set them.

`/bags/pay` — flexible이 모자랄 때

    Button:  Flexible holds {flexible}. This delivery needs {shortfall} more.  (disabled)
    Button:  Send fewer bags
    Note:    Fewer bags cost less. If that does not work, carry these bags yourself —
             nothing is charged, and your purchases stay recorded.

거절·취소 경로: 별도 버튼을 만들지 않는다. 헤더의 뒤로가기(`/bags/review`)가 취소이고,
아무것도 쓰지 않으므로 확인 시트도 필요 없다. **`transfer`는 `draft`로 남고 예약은 잡히지 않는다.**

## A-8. 크기 · 선행 의존성

**M.** 스키마 0줄, API 0줄. `view.ts`(라벨 1개 추가 + `fallbackRemedies` 1줄), `eligibility.ts`(remedies 1줄),
`bags/review/page.tsx`(remedy 핸들러 · 문단 삭제 · 서브라벨), `bags/pay/page.tsx`(라벨 교체 · note 교체).
선행 의존성 없음. 에러 경계 구현과 충돌하지 않는다.

---

# B. `/bags/select` — 플랜 외 가방 진입점

**왜 지금 안 하고 별도인가:** 새 화면 하나와 새 클라이언트 액션 하나가 필요해 에러 경계 묶음보다 크고,
착수 전에 "스키마를 건드리는가"부터 확정해야 했다.

## B-1. 가장 중요한 결정 — 마이그레이션은 필요 없다. 백엔드가 이미 전부 있다

감사에서 나는 이걸 "흐름 누락"이라고만 했는데, 실제로는 **UI만 없다.** 서버는 이미 준비돼 있었다.

| 이미 있는 것 | 어디 |
| --- | --- |
| `purchases.unplanned_label`, `stop_id` nullable, `stop_id`나 라벨 중 하나는 있어야 한다는 check | `0005_pricing_multiday_unplanned_bags.sql` |
| `purchases.client_key` + 여행자 단위 unique — 오프라인 재생 키 | `0009_unplanned_purchase_key.sql` |
| `PUT /api/purchases/unplanned/{key}` · `DELETE`(void, 삭제 아님) | `app/api/purchases/unplanned/[key]/route.ts` |
| 지갑 합산 | `lib/state/shape.ts:173` — `spentCents`에 이미 더해진다 |
| 가방 목록 편입 | `lib/state/selectors.ts:50` — `draftItems()`가 이미 섞는다 |
| 매니페스트 라벨 해석 | `app/api/transfers/[id]/items/route.ts:61` |
| 탭 라우팅 | `app/(app)/landing.ts:34` — 플랜 외 구매가 있으면 `/bags/select`로 보낸다 |
| `bag_transfer_items.purchase_id` nullable — 계획 밖 가방을 실을 수 있다 | `0005` |

**결정: `supabase/migrations/`에 파일을 만들지 않는다. `0027`~`0029`(G6 2단계 예약)는 그대로 비워 둔다.**
없는 건 화면, `app-state`의 액션 하나, 그리고 두 개의 빈 상태 조건이다. N3가 "SQL 0줄"이었던 것과 같은 상황이다.

## B-2. 두 번째 결정 — 가격은 **선택 입력**이다 (감사 발언 정정)

감사에서 나는 "개수·handling만 받고 가격은 받지 않는다, 지갑 `spent`에 영향 없음"이라고 했다. **철회한다.**

`0005`가 존재하는 이유가 그 반대이기 때문이다 — 라우트 주석이 직접 말한다:

> Until 0005 the spend had nowhere to go, so the wallet understated what had been spent
> and the over-budget approval screen — a constitutional branch — could not fire.

규칙 5의 **쇼핑 가능액 = `planned − spent`**에서 `spent`는 "Trail이 계획한 지출"이 아니라 "여행자가 쓴 돈"이다.
플랜 외 구매를 0원으로 기록하면 지갑이 거짓말을 하고, 헌법 4의 **실제가 예산 초과** 분기가 영영 안 뜬다.

**확정된 규칙**

- 가격 필드는 **선택 입력**이다. 카운터 앞에서 영수증을 뒤지느라 가방을 못 보내는 일은 없어야 한다.
- **비우면 `actualPriceCents: 0`으로 기록되고, 화면이 그 사실을 말한다.** 조용히 0을 넣지 않는다.
- 넣으면 계획된 구매와 **완전히 동일하게** `spentCents`에 들어간다.
- 넣은 값이 `planned`를 넘기면 `record/page.tsx`와 **같은 초과 승인 시트**를 띄우고,
  **같은 경로**(`proposeBudgetChange` → `decideBudgetChange`)로 flexible을 인출한다.
  이건 쇼핑 돈이므로 A와 달리 **버킷이 실제로 움직이는 게 맞다.** A와 B가 서로 다른 경로를 쓰는 것은
  의도된 것이고, 그 경계가 A-1의 표다.
- 나중에 금액을 채울 수 있다 — `PUT`은 같은 `client_key`로 전체 교체이므로 재입력이 곧 정정이다.

## B-3. 받는 필드 / 받지 않는 필드

**받는다**

| 필드 | 제약 | 왜 |
| --- | --- | --- |
| `label` | 필수, ≤120자 | `unplanned_label`. DB check가 요구한다. 카운터 직원과 여행자가 가방을 서로 가리킬 수 있는 유일한 문자열 |
| `bags` | 필수, 1–20, 기본 1 | 요금 단계와 태그 개수 대조의 입력 |
| `handling` | 필수, 4값, 기본 `Standard` | `handling_unsupported`와 chilled 창을 판정한다. 이게 틀리면 진짜 배송이 거절되거나 진짜 과적이 통과한다 |
| `actualPriceCents` | **선택**, 0–1,000,000 | B-2 |

**받지 않는다 — 각각 이유가 있다**

- **매장 / 수령인 / stop** — 플랜 외 가방은 `stop`이 없는 것이 정의다. 여기서 stop을 만들면 여행자가 계획한 적 없는
  정류장이 경로에 생기고, 배열 인덱스를 `stops` UUID로 옮긴 이유가 무너진다.
- **무게** — `view.ts:34`가 이미 판정했다. 지어낸 무게는 화면에 머무르지 않고 `saveManifest`를 타고
  `max_weight_grams` 판정에 들어간다. **`Weighed at the counter`가 정답이다.**
- **통화** — 서버가 여행의 통화를 넣는다(라우트 주석). 클라이언트가 보낸 통화는 자기 자신과 모순될 수 있다.
- **`quantity`** — 기본 1로 둔다. 가방 단위 화면에서 수량은 의미가 없다.
- **`user_id` / `trip_id`** — 규칙 6. 서버가 세션과 활성 여행에서 정한다.

## B-4. 원장과 커스터디에 어떻게 들어가는가 (규칙 6)

1. `PUT /api/purchases/unplanned/{clientKey}` → `purchases` 행. `client_key`가 unique이므로 **재생이 안전**하고,
   아웃박스는 같은 `path`의 `PUT`을 접어버리므로(`lib/state/outbox.ts:38`) 지하에서 세 번 눌러도 한 행이다.
2. `draftItems()`가 그 행을 `DraftItem`으로 올린다 — **코드 변경 없음.**
3. `saveManifest`가 `purchaseId`를 실어 `bag_transfer_items`를 쓴다 — **코드 변경 없음.**
4. 그 다음부터는 계획된 가방과 구별되지 않는다. `transfer_events`는 개수만 세고, 카운터의 QR 스캔과
   태그 ID 집합 대조가 커스터디를 옮긴다. 플랜 외 가방이라고 다르게 취급되는 지점은 **없어야 한다.**
5. 삭제는 `DELETE`이고 **void**다. 원장은 append-only이므로 행은 남고 `spentCents`에서만 빠진다.

## B-5. 화면/흐름 명세

### `/bags/unplanned` — 신규

- **진입 조건**: 활성 여행이 있고 로그인돼 있다. `/bags/select`의 버튼, `/bags`의 빈 상태 버튼 두 곳에서 들어온다.
  구매 0건이어도 들어올 수 있어야 한다 — **그게 이 화면의 존재 이유다.**
- **주요 액션**: 라벨 · 가방 수 · handling 입력, 금액은 선택, 저장.
- **이탈 조건**: 저장 성공 → `/bags/select`(새 행이 선택된 상태로) · 뒤로 → `/bags/select`.
- **유지되는 상태**: 초안을 `localStorage`의 `trail:draft:unplanned:<clientKey>`에 매 입력마다 쓴다.
  `record/page.tsx`와 같은 패턴이고, 같은 이유다(지하, 신호 없음, 앱 재시작).
  `clientKey`는 화면 진입 시 한 번 생성해 초안과 함께 보관한다 — **매 저장마다 새로 만들면 재생이 깨진다.**
- **상태 분기**
  - 로딩: 없다. 이 화면은 서버에서 읽는 것이 없다.
  - 빈 상태: 해당 없음(입력 화면).
  - 오류: 400 `invalid_field` → 해당 필드에 인라인 오류. 5xx → 아래 카피. 아무것도 지우지 않는다.
  - 오프라인: **정상 경로다.** 아웃박스에 넣고 `/bags/select`로 돌아간다. 그 행은 목록에
    `pending:<clientKey>` 키로 뜨고 **선택 불가**다 — 서버가 매칭할 수 없는 가방을 매니페스트에 올릴 수 없다는
    기존 규칙(`bags/select/page.tsx` 상단 주석)과 정확히 같다. 이 낙관적 행은 `app-state.tsx:104-121`의
    stop 오버레이와 나란히 새로 만들어야 한다. **지금은 없어서 오프라인 입력이 목록에서 사라진다.**
  - 권한 거부: 해당 없음(위치·카메라 안 씀).
- **승인 게이트**: 금액이 `planned − spent`를 넘길 때만. 그때는 `record/page.tsx`의 초과 시트를 그대로 쓴다.
  금액이 비었거나 예산 안이면 게이트 없음 — 이미 산 물건을 기록하는 일에 승인을 요구하지 않는다.
- **실패 경로**: 헌법 4의 **실제가 예산 초과**. 복구 수단은 flexible 인출 승인(버킷 이동) ·
  금액 수정 · `Record it and stay over plan`.

### `/bags/select` — 수정

- 목록 아래에 항상 보이는 버튼 하나. 목록이 비었을 때도, 찼을 때도 같은 자리.
- 빈 상태 문구를 바꾼다. 지금 문구(`"No purchases recorded yet. Save one in store and it appears here."`)는
  **손에 가방을 들고 있는 사람에게 틀린 말**이다.

### `/bags` — 빈 상태 조건 버그

`app/(app)/bags/page.tsx:44`의 조건은 `!bought.length && !transfer`라 **플랜 외 구매를 세지 않는다.**
플랜 외 가방만 가진 여행자가 뒤로가기로 이 화면에 오면 가방이 있는데 **"Nothing to send yet."**을 읽는다.
`bought.length` → `items.length`로 바꾼다(`items`는 `draftItems()` 결과라 이미 둘을 합쳐 놓았다).
빈 상태에는 두 번째 버튼을 더한다.

## B-6. 카피 전문 (영문 확정)

`/bags/select` — 진입 버튼 (목록 유무와 무관하게 같은 자리)

    Add a bag Trail didn’t plan
    Something you bought outside your route

`/bags/select` — 빈 상태 (교체)

    No bags recorded yet. Save one at a stop, or add a bag you bought on your own.

`/bags` — 빈 상태 (두 번째 버튼 추가, 기존 문구 유지)

    Add a bag Trail didn’t plan

`/bags/unplanned` — 화면

    Header:  Add a bag
    Eyebrow: BOUGHT OUTSIDE THE PLAN
    H1:      What did you buy?
    Lede:    Trail did not plan this one, and it can still go to your hotel. You paid
             the store directly; Trail only carries it.

    Field:   What’s in the bag         placeholder: Tea set from the market
    Field:   Bags                      hint: One tag goes on each bag at the counter
    Field:   Handling                  hint: Chilled bags can travel for four hours after you buy them
    Field:   What you paid (optional)  hint: Left blank, this bag does not count against your shopping budget

    Button:  Save this bag
             sub (금액 있음):  Counts {price} against your shopping budget
             sub (금액 없음):  Recorded with no amount. You can add it later.

    Note:    Weighed at the counter. Trail does not guess a weight — the partner
             checks it against what they can take.

`/bags/unplanned` — 오류

    5xx:      Trail could not save this bag. Nothing was recorded, and what you typed
              is still here.
    offline:  Saved on this phone. It appears in your bag list and can be sent once
              Trail has it.

`/bags/select` — 저장 대기 중인 행: 기존 `waiting to save` 패턴을 그대로 재사용한다. 새 문구 없음.

## B-7. 크기 · 선행 의존성

**L.** 마이그레이션 0건, API 라우트 0건.

- 신규 `app/(app)/bags/unplanned/page.tsx` (초안 + 폼 + 초과 시트 재사용)
- `app-state.tsx` — `saveUnplannedPurchase(clientKey, draft)`가 `PUT /api/purchases/unplanned/{key}`를 `commit`,
  그리고 `pending:<clientKey>` 낙관적 행 오버레이
- `bags/select/page.tsx` — 버튼 + 빈 상태 문구
- `bags/page.tsx` — 빈 상태 조건 + 버튼

선행 의존성: 없음. A와 독립이고 병렬로 가도 된다.
**단 A-3(매니페스트 저장 후 이동)이 먼저 들어가면 B의 회귀 확인이 쉬워진다** — 매니페스트를 안 거치고
결제로 가는 경로가 남아 있으면 "플랜 외 가방이 안 실렸다"와 "매니페스트를 저장 안 했다"가 구별되지 않는다.

---

# 구현 후 문서 갱신 (이번에는 하지 않는다)

## `docs/TRAIL_USER_FLOW_EN.md`

- **§8 "Send bags to the hotel"** — 두 줄 추가.
  - 플랜 외 가방을 목록에 더할 수 있다는 것, 금액은 선택이라는 것, 비우면 예산에 안 잡힌다는 것.
  - 배송비가 예약을 넘을 때 결정은 결제 화면 한 곳에서 일어나고, **버킷 크기는 바뀌지 않는다**는 것.
    §7의 rebalance와 다른 메커니즘이라는 점을 한 줄로 구분해 둔다 — 이 문서를 읽는 사람이
    가장 헷갈릴 지점이다.
- **"Permanent app navigation ▸ Bags"** — 현재 이미
  `"choosing bags (including bags bought outside the plan)"`라고 적혀 있다.
  **문서가 구현보다 앞서 있는 상태이고, B가 끝나야 이 문장이 참이 된다.**
  B를 하지 않기로 뒤집는다면 이 괄호를 지우는 것이 먼저다 — 문서와 구현이 갈라진 채로 두지 않는다.

## `docs/MIGRATION_PLAN.md`

- P7 백로그 표 아래에 **"A·B에 마이그레이션이 없는 이유"** 절을 N3·N2와 같은 형식으로 추가한다.
  - A: 승인 경로가 이미 `0013`의 `plan_events` 권한으로 구현돼 있다. 새 테이블도 새 GRANT도 없다.
  - B: `0005`가 컬럼을, `0009`가 재생 키를 이미 만들었다. **`0027`~`0029`는 그대로 비워 둔다.**
- P7 끝의 `"reserve_short와 /bags/pay는 손대지 않았다"`는 N3의 기록이므로 지우지 않는다.
  A가 그 파일을 건드린다는 사실만 새 절에 적어, 나중에 읽는 사람이 모순으로 읽지 않게 한다.
