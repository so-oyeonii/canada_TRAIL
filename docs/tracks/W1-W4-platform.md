# W1 데이터 정합 · W4 이송 실물화 — 플랫폼 상세 설계

담당: platform-engineer · 2026-08-15
상위 문서: `docs/BUILD_PLAN.md`(트랙 분할) · `docs/APP_SPEC.md`(화면 46개) · `docs/MIGRATION_PLAN.md`(순서)
범위: 이 문서는 **서버·데이터·권한·커스터디**만 다룬다. 화면 배치는 W0/W3, 카피는 product-lead 소관이다.

## 이 문서가 전제하는 것

- Supabase 21테이블 + RLS `enable`+`force`가 **이미 적용돼 있다**. 다시 만들지 않는다.
- 신원은 서버에서 `getTraveler()`로만 정한다. `user_id`를 클라이언트에서 받는 경로를 새로 만들지 않는다.
- 금액은 정수 cents. enum 문자열은 프런트 유니온과 대소문자까지 일치.
- 원장(`transfer_events`·`plan_events`·`receipts`)은 append-only. 상태는 이벤트의 **결과**다.
- 스키마 변경은 `새 마이그레이션 파일 → apply_migration → get_advisors 확인`까지가 한 세트다.

---

# 1. W1 — 인덱스 키 제거 계획

## 1.1 지금 무엇이 깨져 있나

`app/page.tsx`의 4개 상태가 전부 **배열 위치**로 식별된다. 키는 `productTemplates`의 인덱스다.

| 상태 | 현재 타입 | 키의 실체 | 옮겨갈 곳 |
| --- | --- | --- | --- |
| `purchases` | `Record<number, Purchase>` | `productTemplates[i]`의 i | `purchases` 행 (`stop_id` 유니크) |
| `selectedBags` | `Record<number, boolean>` | 동일한 i | `bag_transfer_items` 행 |
| `replacementIds` | `Record<number, boolean>` | 동일한 i (토글) | `stops.replaced_stop_id` (새 행) |
| `savedStops` | `Record<number, boolean>` | 동일한 i | `stops.saved` 컬럼 |

`products`는 매 렌더마다 `productTemplates.map(...)`으로 다시 만들어지고, 가격은 `Math.max(18, round(activePlan.budget * [.48,.31,.21][i]))`로 **예산에서 파생**된다. 즉 예산을 내리면 이미 산 물건의 기준가가 소급으로 바뀐다. 수령인을 추가·삭제하면 i가 밀려서 **구매 기록이 다른 항목에 붙는다.** 이것은 UI 버그가 아니라 지출 기록 손실이다.

한 가지 더: `deliveryStep`(정수)과 `transferStatus`도 클라이언트 상태다. 사용자가 버튼으로 올린다. W4에서 통째로 폐기한다.

## 1.2 바뀐 뒤의 클라이언트 상태 구조

**규칙: 인덱스로 키하지 않는다. `sequence`로도 키하지 않는다**(순서 변경으로 바뀌는 값이다). 오직 `stops.id`(uuid)다.

```ts
type StopId = string; type PurchaseId = string; type ItemKey = string; // purchaseId | `local:${uuid}`

type TrailState = {
  serverTime: string; stateVersion: string;      // max(updated_at) — 아웃박스 충돌 판정용
  user: { id, email, homeCurrency, memoryEnabled, firstRunDoneAt };
  activeTripId: string | null;
  trips: TripSummary[];                           // TR-1 목록
  trip: Trip | null;                              // 활성 여행 전체
  plan: Plan | null;                              // 3버킷 + allocations
  wallet: Wallet;                                 // 서버 계산 (아래 1.5)
  recipients: Recipient[];
  stops: Stop[];                                  // stop.purchase / stop.inquiry 가 안에 들어 있다
  transfer: Transfer | null;                      // items / events / payment / receipt / issues 포함
  pastTransfers: TransferSummary[];
};
```

핵심은 **`purchases`라는 별도 맵이 사라진다는 것**이다. 구매는 stop 안에 들어 있고, stop은 uuid를 갖는다. 파생 인덱스가 존재할 자리가 없다.

| 화면이 필요로 하던 것 | 새 접근 |
| --- | --- |
| `purchases[i]` | `stops.find(s => s.id === stopId)?.purchase` — 또는 렌더 직전 `byId = new Map(stops.map(s => [s.id, s]))` |
| `savedStops[i]` | `stop.saved` |
| `replacementIds[i]` | 존재하지 않음. 교체는 **새 stop 행**이고 `replacedStopId`가 옛 행을 가리킨다. 토글(되돌리기)은 폐기 — TL-10에서 사용자가 후보를 고른다 |
| `selectedBags[i]` | `draftItems: Record<ItemKey, DraftItem>`. 플랜 구매는 `purchaseId`, 플랜 외 가방은 `local:${crypto.randomUUID()}` (서버 저장 후 실제 item id로 교체) |
| `deliveryStep` | `transfer.events`에서 유도. 클라이언트에 쓰기 없음 |

`replacementIds`가 boolean 토글이었다는 점이 중요하다. 서버에는 "이 stop을 대체안으로 볼지"라는 개념이 없다 — 대체는 상태가 아니라 **사건**이다. 그래서 이 상태는 이관이 아니라 소멸이다.

## 1.3 단계 (순서대로, 각 단계가 독립 배포 가능)

**W1-0. 레거시 상수 동결 (W0보다 먼저)**
`app/page.tsx`의 `productTemplates` / `alternativeTemplates` / 가격 계수 `[.48,.31,.21]`를 `lib/legacy/v3-templates.ts`로 복사하고 `as const`로 잠근다. **W0가 화면을 갈아엎으면서 이 상수를 지우면 localStorage 이관이 불가능해진다** (인덱스 i를 상품명으로 되돌릴 방법이 사라진다). 30분짜리 작업이고, 이걸 안 하면 기존 사용자 데이터가 영구 손실된다.

**W1-1. 마이그레이션 `0003_w1_identity_keys.sql`** (§3.1) → `apply_migration` → `get_advisors`.

**W1-2. 서버 응답 타입 고정** — `lib/state/types.ts`. DB enum과 문자열까지 일치하는 유니온을 여기 한 곳에만 둔다. `app/page.tsx`의 로컬 타입 선언은 여기로 흡수한다.

**W1-3. `GET /api/state` + `lib/state/load.ts`** (§2). 로더는 서버 컴포넌트에서도 직접 호출 가능하게 순수 함수로 분리한다(라우트는 얇은 껍데기).

**W1-4. `lib/supabase/admin.ts`** — service_role 클라이언트. 첫 줄에 `import "server-only";`. W4의 파트너·결제 경로가 이걸 쓴다. RLS가 꺼지므로 **모든 쿼리에 `.eq("user_id", traveler.id)`를 손으로 붙인다**는 주석을 파일 상단에 박는다.

**W1-5. 클라이언트 배선** — `useTrailState()` 훅. 4개 `Record<number,…>` 삭제, `TrailState` 하나로 교체. localStorage는 캐시로 강등:
- 키: `trail-cache-v4:{userId}` (사용자별 네임스페이스 — 공용 기기에서 다른 사람 데이터가 보이던 구조를 끊는다)
- 내용: `GET /api/state` 응답 스냅샷 + `outbox`
- 부팅: 캐시로 즉시 그리고 → `/api/state`로 덮어쓴다. **캐시가 진실원본이 아니다**

**W1-6. `POST /api/import`** (§1.4) + 부팅 시 1회 체크.

**W1-7. 아웃박스 골격** — IndexedDB `{opId, method, path, body, createdAt, tries}`. W1에서는 `PUT /api/purchases/{stopId}` 하나만 태워 409 규칙을 검증한다. 전면 확장은 W3(3-1).

> **주의**: W1-5는 `app/page.tsx`를 건드린다. W3가 이 파일을 9화면 → 라우트로 쪼갠다. **W1-5는 상태 구조만 바꾸고 화면 배치는 손대지 않는다.** 훅을 `lib/state/`에 두면 W3는 훅을 옮겨 심기만 하면 된다. 이 경계를 안 지키면 같은 코드를 두 번 쓴다(§6-1).

## 1.4 기존 localStorage 사용자 처리

`localStorage["trail-v3-state"]`에는 `{trip, plan, approvedPlan, purchases, shoppingStarted, transferStatus, deliveryStep, replacementIds, savedStops, memoryEnabled}`가 들어 있다. 계정 개념이 없던 시절의 데이터라 **소유자가 없다.** 로그인한 사용자에게 귀속시키는 순간 되돌릴 수 없으므로 규칙을 명시한다.

### 임포트하는 것 / 안 하는 것

| 로컬 필드 | 처리 | 이유 |
| --- | --- | --- |
| `trip` | `trips` 1행 (`status='planning'`) | 사용자가 직접 입력한 사실 |
| `plan`/`approvedPlan.budget` | `plans` 1행, `splitBudget()`으로 3버킷 분할 | 달러 → cents 변환 |
| `purchases[i]` (status='bought') | `stops` + `purchases` 행 | **돈이다. 최우선 보존** |
| `savedStops[i]` | `stops.saved = true` | 무해 |
| `replacementIds[i]` | 해당 i는 `alternativeTemplates[i]`로 stop 생성 | 원본 stop은 만들지 않는다(교체 전 상태는 기록이 없다) |
| `approvedPlan !== null` | `plans.status='approved'` + `approved_at` + `plan_events{actor:'approval', stage:'approved'}` | 승인은 실제로 있었다 |
| `deliveryStep`, `transferStatus`, `paymentRef` | **버린다** | 사용자가 버튼으로 올린 값이다. 커스터디 사실이 아니다. 이걸 `transfer_events`로 만들면 원장이 첫 행부터 거짓이 된다 |
| `memoryEnabled` (기본 `true`) | **버린다** | DB는 opt-in(`default false`). 로컬 기본값을 옮기면 **동의를 위조**하는 것이다 |
| `messages` | 저장 안 됨 (원래 로컬에도 없음) | — |

가격 복원: `snapshot_price_cents = max(18, round(budget * [.48,.31,.21][i])) * 100`. 예산 파생값이지만 **당시 사용자가 본 숫자**이므로 그대로 동결한다. 이후로는 절대 재계산하지 않는다 — 이게 MIGRATION_PLAN 결함 #2의 해소다.

### 멱등성과 분기 4가지

서버가 판정한다. 클라이언트 플래그는 믿지 않는다(기기·시크릿창마다 중복된다).

```
POST /api/import  { payload: <blob 원문 문자열> }
서버: hash = sha256(payload)
      insert into migration_imports (user_id, source_key, payload_hash, trip_id) ...
      -- PK (user_id, source_key) 가 재실행을 막는다
```

| 상황 | 응답 | 클라이언트 |
| --- | --- | --- |
| 서버 trip 0건 + 로컬 blob 있음 | `201 {tripId, imported:{stops,purchases}}` | blob을 `trail-v3-state.imported`로 **리네임 보관**(삭제 금지) + `Your saved trip moved to your account.` |
| 서버 trip 있음 + 로컬 blob 있음 | 호출하지 않음 | 리네임만. 서버가 이미 진실원본이다 |
| 이미 임포트됨(다른 기기) | `409 {error:"already_imported", tripId}` | 리네임 + `This device's saved trip was already added from another device.` **조용히 넘기지 않는다** |
| blob 파싱 실패 / 스키마 불일치 | `422 {error:"unreadable"}` | `trail-v3-state.broken`으로 리네임 + `We couldn't read the trip saved on this device.` |

`migration_imports`의 PK가 `(user_id, source_key)`라 **내용이 다른 두 번째 blob도 거부된다**. 이는 의도된 설계지만 조용히 데이터가 사라지는 것과 구분되지 않으므로, 409 카피에서 사실을 말한다.

## 1.5 지갑 계산은 서버가 한다

클라이언트가 `spent`를 더하면 오프라인 큐가 반영된 값과 서버 값이 갈라진다. `GET /api/state`가 계산해서 내려준다.

```
spentCents      = Σ purchases.actual_price_cents  where voided_at is null
spendableCents  = plans.planned_cents − spentCents          -- 헌법 5. 절대 reserve를 더하지 않는다
reserveCents    = plans.delivery_reserve_cents               -- 표시만. 쇼핑 가능액에 합산 금지
unallocatedCents= plans.planned_cents − Σ plan_allocations.amount_cents(bucket='planned')
overPlan        = spentCents > plans.planned_cents
```

클라이언트는 낙관적 반영을 위해 같은 식을 **로컬 델타로만** 적용한다(아웃박스 대기 건). 플러시 후 `/api/state` 재동기화가 정본이다.

---

# 2. `GET /api/state` 설계

## 2.1 계약

- `app/api/state/route.ts` · `export const dynamic = "force-dynamic"` · `Cache-Control: no-store`
- 신원: `getTraveler()`. 쿼리 파라미터로 `userId`를 받지 않는다. `?tripId=`만 선택적으로 받고, 없으면 `trips.status='active'`를 쓴다.
- 미로그인 `401 {error:"unauthenticated"}` · 여행 0건 `200` (trips 빈 배열, trip/plan/transfer는 null) — **빈 상태도 200이다.** 404로 내리면 화면이 오류로 오해한다.
- 세션 클라이언트(`lib/supabase/server.ts`)로 읽는다. RLS가 그대로 걸리므로 이 라우트가 뚫려도 남의 데이터는 안 나온다. admin 클라이언트를 쓰지 않는다.

## 2.2 응답 (실제 형태)

```json
{
  "serverTime": "2026-08-15T18:22:04.113Z",
  "stateVersion": "2026-08-15T18:19:55.402Z",
  "user": { "id": "9c1f…", "email": "ksyk9434@gmail.com", "homeCurrency": "CAD", "memoryEnabled": false, "firstRunDoneAt": null },
  "activeTripId": "8f2c1d3e-…",
  "trips": [
    { "id": "8f2c1d3e-…", "status": "active",   "city": "Toronto", "country": "Canada", "startDate": "2026-08-12", "endDate": "2026-08-16", "currency": "CAD", "planStatus": "approved", "purchaseCount": 3, "openTransferId": "b71a…" },
    { "id": "44a0…",      "status": "planning", "city": "Seoul",   "country": "South Korea", "startDate": "2026-09-02", "endDate": "2026-09-08", "currency": "KRW", "planStatus": null, "purchaseCount": 0, "openTransferId": null }
  ],
  "trip": {
    "id": "8f2c1d3e-…", "status": "active", "country": "Canada", "city": "Toronto",
    "areas": ["The Annex", "Kensington Market"], "startDate": "2026-08-12", "endDate": "2026-08-16",
    "hotelId": null, "hotelName": "The Annex Hotel", "hotelAddress": "296 Brunswick Ave",
    "hotelVerifiedAt": null, "companions": "Solo trip", "freeTime": "3 hours", "currency": "CAD"
  },
  "plan": {
    "id": "0d55…", "status": "approved", "version": 2,
    "totalCents": 25000, "plannedCents": 21000, "deliveryReserveCents": 900, "flexibleCents": 3100,
    "category": "Home & design", "preference": "Thoughtful and useful",
    "localOnly": true, "easyPack": true, "hotelDelivery": true,
    "approvedAt": "2026-08-14T09:02:11.000Z",
    "allocations": [ { "recipientId": "aa11…", "amountCents": 8000, "bucket": "planned" },
                     { "recipientId": "bb22…", "amountCents": 6000, "bucket": "planned" } ]
  },
  "wallet": { "totalCents": 25000, "plannedCents": 21000, "reserveCents": 900, "flexibleCents": 3100,
              "spentCents": 17600, "spendableCents": 3400, "unallocatedCents": 7000, "overPlan": false },
  "recipients": [
    { "id": "aa11…", "name": "Mom", "relationship": "Mother", "groupSize": 1, "priority": 1, "isSelf": false, "isOptional": false, "preferenceNote": "", "equalValueGroup": null },
    { "id": "bb22…", "name": "Myself", "relationship": "", "groupSize": 1, "priority": 4, "isSelf": true, "isOptional": true, "preferenceNote": "", "equalValueGroup": null }
  ],
  "stops": [
    { "id": "s-1111…", "planId": "0d55…", "sequence": 0, "plannedDay": 1, "status": "bought",
      "recipientId": "aa11…", "productName": "Ontario-made home accessory", "storeName": "Spacing Store",
      "storeAddress": "401 Richmond St W", "area": "The Annex", "snapshotPriceCents": 5800,
      "handling": "Standard", "walkMinutes": 7, "rationale": "Intentionally avoids ceramics", "saved": true,
      "replacedStopId": null, "source": "sample",
      "purchase": { "id": "p-9999…", "actualPriceCents": 7500, "quantity": 1, "bags": 1, "handling": "Standard",
                    "currency": "CAD", "note": null, "recordedAt": "2026-08-15T15:41:02.000Z", "voidedAt": null },
      "inquiry": { "id": "i-33…", "status": "no_answer", "askedAt": "2026-08-15T14:02:00.000Z", "answeredAt": null, "expiresAt": "2026-08-16T14:02:00.000Z", "answerNote": null } },
    { "id": "s-2222…", "planId": "0d55…", "sequence": 1, "plannedDay": 1, "status": "planned",
      "recipientId": "bb22…", "productName": "Small-batch chocolate", "storeName": "Blue Banana Market",
      "storeAddress": "250 Augusta Ave", "area": "Kensington Market", "snapshotPriceCents": 3100,
      "handling": "Chilled", "walkMinutes": 11, "rationale": "", "saved": false,
      "replacedStopId": "s-0000…", "source": "sample", "purchase": null, "inquiry": null }
  ],
  "transfer": {
    "id": "b71a…", "status": "paid", "referenceCode": "TRL-48173",
    "hotelName": "The Annex Hotel", "hotelAddress": "296 Brunswick Ave",
    "bagCount": 3, "weightGrams": 2400, "feeCents": 900, "currency": "CAD",
    "etaStart": "2026-08-15T22:30:00.000Z", "etaEnd": "2026-08-15T23:00:00.000Z",
    "dropoffCutoffAt": "2026-08-15T22:00:00.000Z", "confirmedAt": "2026-08-15T20:11:00.000Z",
    "deliveredAt": null, "ineligibleCode": null, "ineligibleReason": null,
    "handoffFailureCode": null, "passExpiresAt": "2026-08-16T02:00:00.000Z", "source": "simulated",
    "dropoffStore": { "id": "st-77…", "name": "Blue Banana Market", "address": "250 Augusta Ave", "area": "Kensington Market", "dropoffCutoff": "18:00:00", "lat": 43.654, "lng": -79.400 },
    "items": [
      { "id": "it-1…", "purchaseId": "p-9999…", "label": "", "bags": 1, "handling": "Standard", "weightGrams": 800, "sealId": null, "sealedAt": null, "scannedAt": null },
      { "id": "it-2…", "purchaseId": null, "label": "Bookshop tote", "bags": 1, "handling": "Standard", "weightGrams": 600, "sealId": null, "sealedAt": null, "scannedAt": null }
    ],
    "events": [
      { "id": "e-1…", "seq": 0, "eventType": "created",       "actor": "system",   "itemId": null, "occurredAt": "2026-08-15T20:02:00.000Z", "createdAt": "2026-08-15T20:02:00.100Z", "location": null, "note": null, "payload": {}, "source": "simulated" },
      { "id": "e-2…", "seq": 1, "eventType": "bags_selected", "actor": "traveler", "itemId": null, "occurredAt": "2026-08-15T20:10:40.000Z", "createdAt": "2026-08-15T20:10:41.900Z", "location": null, "note": null, "payload": { "bagCount": 3 }, "source": "simulated" },
      { "id": "e-3…", "seq": 2, "eventType": "paid",          "actor": "system",   "itemId": null, "occurredAt": "2026-08-15T20:12:03.000Z", "createdAt": "2026-08-15T20:12:03.200Z", "location": null, "note": null, "payload": { "paymentId": "pay-55…" }, "source": "simulated" }
    ],
    "payment": { "id": "pay-55…", "status": "captured", "amountCents": 900, "currency": "CAD", "methodBrand": "visa", "methodLast4": "4242", "failureCode": null, "capturedAt": "2026-08-15T20:12:03.000Z", "refundedAt": null },
    "receipt": null,
    "issues": []
  },
  "pastTransfers": [],
  "labels": { "stops": "sample", "transfer": "simulated", "payment": "simulated" }
}
```

응답에 **인덱스가 한 개도 없다.** 이게 W1의 합격 기준이다. `labels`는 GL-2(Sample/Simulated 칩)가 하드코딩된 카피 대신 읽을 근거이고, 값은 각 행의 `source` 컬럼에서 온다.

## 2.3 PostgREST 임베디드 셀렉트

자식 테이블마다 복합 FK가 걸려 있어 관계 경로가 여러 개다(`stops`는 `plans`로도 `trips`로도 이어진다). **제약 이름 힌트를 반드시 붙인다.** 붙이지 않으면 PostgREST가 `PGRST201 ambiguous relationship`으로 거부한다.

```ts
// app/api/state/route.ts — 클라이언트 왕복 1회, DB 쿼리 3개 병렬
const db = await createClient();               // 세션 클라이언트. RLS 유효
const uid = traveler.id;

const [me, tripRes, listRes] = await Promise.all([
  db.from("app_users")
    .select("id, email, display_name, home_currency, locale, memory_enabled, first_run_done_at")
    .eq("id", uid).single(),

  db.from("trips").select(`
      id, status, country, city, areas, start_date, end_date,
      hotel_id, hotel_name, hotel_address, hotel_verified_at, companions, free_time, currency, updated_at,
      plans!plans_trip_id_user_id_fkey (
        id, status, version, total_cents, planned_cents, delivery_reserve_cents, flexible_cents,
        category, preference, local_only, easy_pack, hotel_delivery, approved_at,
        plan_allocations!plan_allocations_plan_id_user_id_fkey ( recipient_id, amount_cents, bucket )
      ),
      recipients!recipients_trip_id_user_id_fkey (
        id, name, relationship, group_size, priority, is_self, is_optional, preference_note, equal_value_group
      ),
      stops!stops_trip_id_user_id_fkey (
        id, plan_id, sequence, planned_day, status, recipient_id, product_name, store_name, store_address,
        area, snapshot_price_cents, handling, walk_minutes, rationale, saved, replaced_stop_id, source,
        purchases!purchases_stop_id_user_id_fkey (
          id, actual_price_cents, quantity, bags, handling, currency, note, recorded_at, voided_at, void_reason
        ),
        store_inquiries!store_inquiries_stop_id_user_id_fkey (
          id, status, question, answer_note, asked_at, answered_at, expires_at
        )
      ),
      bag_transfers!bag_transfers_trip_id_user_id_fkey (
        id, status, reference_code, hotel_name, hotel_address, bag_count, weight_grams, fee_cents, currency,
        eta_start, eta_end, dropoff_cutoff_at, confirmed_at, delivered_at,
        ineligible_code, ineligible_reason, handoff_failure_code, pass_expires_at, source, created_at,
        dropoff_store:stores!bag_transfers_dropoff_store_id_fkey ( id, name, address, area, lat, lng, dropoff_cutoff ),
        bag_transfer_items!bag_transfer_items_transfer_id_user_id_fkey (
          id, purchase_id, label, bags, handling, weight_grams, seal_id, sealed_at, scanned_at
        ),
        transfer_events!transfer_events_transfer_id_user_id_fkey (
          id, seq, event_type, actor, item_id, occurred_at, created_at, location, note, payload, source
        ),
        payments!payments_transfer_id_user_id_fkey (
          id, status, amount_cents, currency, method_brand, method_last4, failure_code, authorized_at, captured_at, refunded_at
        ),
        receipts!receipts_transfer_id_user_id_fkey (
          id, received_by, received_at, bag_count, seal_ids, purchases_cents, transfer_fee_cents
        ),
        transfer_issues!transfer_issues_transfer_id_user_id_fkey (
          id, kind, status, description, reported_at, resolved_at
        )
      )
    `)
    .eq("user_id", uid)
    .eq("status", "active")
    .is("recipients.archived_at", null)
    .neq("plans.status", "superseded")
    .order("sequence",   { referencedTable: "stops", ascending: true })
    .order("created_at", { referencedTable: "bag_transfers", ascending: false })
    .order("seq",        { referencedTable: "bag_transfers.transfer_events", ascending: true })
    .limit(5, { referencedTable: "bag_transfers" })
    .maybeSingle(),                                  // trips_one_active 인덱스가 단일성을 보장한다

  db.from("trips").select(`
      id, status, city, country, start_date, end_date, currency, updated_at,
      plans!plans_trip_id_user_id_fkey ( status ),
      purchases!purchases_trip_id_user_id_fkey ( id ),
      bag_transfers!bag_transfers_trip_id_user_id_fkey ( id, status )
    `)
    .eq("user_id", uid)
    .neq("status", "archived")
    .order("start_date", { ascending: false })
    .limit(30),
]);
```

주의점 넷:
1. **`referencedTable`** — supabase-js v2 최신은 `foreignTable`을 deprecate했다. 구버전이면 `foreignTable`로 바꾼다.
2. **중첩 임베드 정렬**은 `"bag_transfers.transfer_events"`처럼 경로로 지정한다. 이벤트는 반드시 `seq` 오름차순으로 내려야 BG-6 타임라인이 원장 순서와 같다.
3. **`.eq("user_id", uid)`는 RLS와 중복이지만 인덱스(`trips_user_idx`)를 태우기 위해 붙인다.** 보안이 아니라 성능 목적이다.
4. **복합 FK 임베드는 배포 전 실제로 확인한다.** PostgREST는 `pg_constraint.conkey` 기반으로 다중 컬럼 FK를 인식하지만, 이 스키마는 전 테이블이 `(id, user_id)` 복합 참조라 관계 그래프가 촘촘하다. 힌트를 붙여도 거부되면 §2.4의 RPC로 즉시 전환한다(§6-6).

취소·실패한 이송도 제외하지 않고 최근 5건을 그대로 내린다 — BG-10의 "커스터디 표시는 절대 사라지지 않는다"가 데이터 레벨에서 성립해야 한다. `transfer`(활성)는 `status not in ('delivered','cancelled')`인 첫 행, 나머지는 `pastTransfers`로 **서버가** 나눈다. 클라이언트가 판단하지 않는다.

## 2.4 대안 — 단일 RPC

DB 왕복 3회가 문제가 되거나 임베드가 막히면:

```sql
create or replace function public.api_state(p_trip_id uuid default null)
returns jsonb
language sql
security invoker            -- 반드시 invoker. definer로 만들면 RLS가 무력화된다
stable
set search_path = public
as $$ select jsonb_build_object( 'user', …, 'trip', …, 'stops', …, 'transfer', … ) $$;
```

`security invoker` + `stable`이 조건이다. `definer`로 만드는 순간 이 함수가 RLS 우회 통로가 되고, 21테이블에 걸어 둔 `force row level security`가 의미를 잃는다. RPC로 가면 `get_advisors`가 함수 `search_path` 경고를 낼 수 있으므로 `set search_path = public`을 반드시 붙인다.

**W1 기본안은 임베디드 셀렉트다.** 유지할 SQL이 늘지 않고, RLS가 자동으로 걸리고, 필드 추가가 타입 변경만으로 끝난다.

---

# 3. 스키마 추가분 (DDL)

APP_SPEC §5.2의 12개를 **트랙별로 4개 파일로 쪼갠다.** 하나의 거대 마이그레이션으로 묶으면 W1이 W4의 파트너 데이터 결정을 기다리게 된다.

| # (§5.2) | 항목 | 파일 | 트랙 |
| --- | --- | --- | --- |
| 3 | `app_users.first_run_done_at` | `0003` | W1 |
| 10 | `stops`/`store_inquiries`/`budget_changes` 멱등키 | `0003` | W1 |
| 11 | `trips.status='active'` 유일성 | `0003` | W1 |
| 12 | 표시 통화 규칙 | DDL 없음 (APP_SPEC §7-9 결정 대기) | — |
| — | 원장 잠금 구멍 2건 (§6-3) | `0003` | W1 |
| — | `transfer_event`에 `sealed` 추가 | `0004` | W4 |
| 4 | 파트너 취급 능력 | `0005` | W4 |
| 5 | 매장 영업시간 | `0005` | W4 |
| 6 | 호텔 수령 정책 | `0005` | W4 |
| 7 | 드라이버 | `0005`에 자리만 (`transfer_events.payload`) | W4 |
| 1 | `transfer_issues` | `0006` | W4 |
| — | 커스터디 서버 소유(트리거·컬럼 권한) | `0006` | W4 |
| 2 | `payment_methods` | `0007` (미작성) | W5 |
| 8 | `transfer_ratings` | 보류 (APP_SPEC §7-10 결정) | — |
| 9 | `push_subscriptions` | `0008` (미작성) | W7 |

## 3.1 `supabase/migrations/0003_w1_identity_keys.sql`

```sql
-- W1. 인덱스 키 제거의 전제조건들.
-- 적용 후 반드시 get_advisors(security) 확인.

-- ── §5.2 #3 · 첫 실행 플래그 (ON-0) ──────────────────────────
alter table public.app_users add column if not exists first_run_done_at timestamptz;

-- ── §5.2 #10 · 오프라인 멱등키 ───────────────────────────────
-- purchases / payments / transfer_events / chat_messages 에는 이미 있다.
-- 없던 셋: stops(순서·saved 토글), store_inquiries(Request), budget_changes(승인).
alter table public.stops           add column if not exists client_op_id text;
alter table public.store_inquiries add column if not exists client_op_id text;
alter table public.budget_changes  add column if not exists client_op_id text;

create unique index if not exists stops_client_op_uidx
  on public.stops (user_id, client_op_id) where client_op_id is not null;
create unique index if not exists store_inquiries_client_op_uidx
  on public.store_inquiries (user_id, client_op_id) where client_op_id is not null;
create unique index if not exists budget_changes_client_op_uidx
  on public.budget_changes (user_id, client_op_id) where client_op_id is not null;

-- ── §5.2 #11 · 활성 여행은 사용자당 하나 ─────────────────────
-- 먼저 기존 중복을 정리한다. 인덱스만 만들면 적용 자체가 실패한다.
with ranked as (
  select id, row_number() over (partition by user_id order by updated_at desc, created_at desc) as rn
  from public.trips where status = 'active'
)
update public.trips t set status = 'planning'
from ranked r where t.id = r.id and r.rn > 1;

create unique index if not exists trips_one_active
  on public.trips (user_id) where status = 'active';

-- ── 승인 후 스냅샷 가격 동결 ─────────────────────────────────
-- RLS는 stops 에 전체 UPDATE 를 허용한다. 승인된 계획의 가격이 사후에 바뀌면
-- "표시 금액 = 청구 금액"이 무너진다.
create or replace function public.freeze_stop_snapshot()
returns trigger language plpgsql as $$
begin
  if new.snapshot_price_cents is distinct from old.snapshot_price_cents
     and exists (select 1 from public.plans p where p.id = old.plan_id and p.status = 'approved') then
    raise exception 'snapshot_price_cents is frozen once the plan is approved (stop %)', old.id
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger stops_freeze_snapshot before update on public.stops
  for each row execute function public.freeze_stop_snapshot();

-- ── 원장 잠금 구멍 메우기 (§6-3) ─────────────────────────────
-- receipts 에는 UPDATE 트리거만 있었다. service_role 은 BYPASSRLS 이므로
-- DELETE 는 아무것도 막지 않고 있었다.
create trigger receipts_no_delete before delete on public.receipts
  for each row execute function public.block_mutation();
```

## 3.2 `supabase/migrations/0004_transfer_event_sealed.sql`

```sql
-- 이 파일에는 이 문장 하나만 둔다.
-- Supabase apply_migration 은 마이그레이션을 트랜잭션으로 감싼다.
-- ALTER TYPE ... ADD VALUE 로 추가한 값은 같은 트랜잭션 안에서 사용할 수 없다.
-- 0005/0006 이 'sealed' 를 참조하므로 파일을 반드시 분리한다.
alter type public.transfer_event add value if not exists 'sealed' after 'dropped_off';
```

## 3.3 `supabase/migrations/0005_w4_partner_ops.sql`

```sql
-- ── §5.2 #4 · 파트너 지점 취급 능력 (BG-3f 판정 근거) ────────
alter table public.stores
  add column if not exists accepted_handling public.handling_type[] not null default '{Standard}',
  add column if not exists max_weight_grams  integer,
  add column if not exists daily_capacity    smallint,
  add column if not exists dropoff_opens     time,
  add column if not exists partner_note      text not null default '';

alter table public.stores
  add constraint stores_partner_needs_window
  check (not is_partner_point or dropoff_cutoff is not null);

-- ── §5.2 #5 · 구조화된 영업시간 (TL-3 폐점 경고 / BG-3 카운트다운) ──
create table public.store_hours (
  store_id uuid not null references public.stores(id) on delete cascade,
  weekday  smallint not null check (weekday between 0 and 6),   -- 0 = 일요일
  opens    time not null,
  closes   time not null,
  source   public.data_source not null default 'sample',
  primary key (store_id, weekday),
  constraint store_hours_order check (closes > opens)
);

-- ── §5.2 #6 · 호텔 수령 정책 ─────────────────────────────────
create table public.hotels (
  id                uuid primary key default gen_random_uuid(),
  city              text not null,
  name              text not null,
  address           text not null default '',
  accepts_delivery  boolean not null default false,
  front_desk_opens  time,
  front_desk_closes time,
  note              text not null default '',
  source            public.data_source not null default 'sample',
  created_at        timestamptz not null default now()
);
create index hotels_city_idx on public.hotels (city);
alter table public.trips add column if not exists hotel_id uuid references public.hotels(id) on delete set null;

-- ── 봉인 태그 재고 (§4.3) ────────────────────────────────────
-- bag_transfer_items.seal_id 는 전역 유니크지만 "이 태그가 실재하는가"를
-- 검증할 데이터가 없었다. 파트너가 아무 문자열이나 적으면 그대로 통과한다.
create table public.seal_tags (
  seal_id     text primary key,                    -- TRL-A19
  store_id    uuid references public.stores(id) on delete set null,
  state       text not null default 'stock' check (state in ('stock','attached','void')),
  item_id     uuid references public.bag_transfer_items(id) on delete set null,
  attached_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint seal_tags_attached_has_item check (state <> 'attached' or item_id is not null)
);
create index seal_tags_store_idx on public.seal_tags (store_id) where state = 'stock';

-- ── 이송 불가 사유를 기계 코드로 (BG-3f 6종) ─────────────────
create type public.transfer_ineligible as enum (
  'no_partner_nearby', 'cutoff_passed', 'chilled_window_closed',
  'hotel_refuses', 'handling_unsupported', 'reserve_short'
);
alter table public.bag_transfers
  add column if not exists ineligible_code public.transfer_ineligible,
  add column if not exists handoff_failure_code text
    check (handoff_failure_code is null or handoff_failure_code in
      ('front_desk_refused','tag_mismatch','guest_not_found','front_desk_closed')),
  add column if not exists pass_issued_at  timestamptz,
  add column if not exists pass_expires_at timestamptz,
  add column if not exists pass_version    smallint not null default 0;

-- ── 요금을 코드 상수에서 데이터로 (§6-2) ─────────────────────
-- $9 → $15 결정이 코드 3곳(DELIVERY_RESERVE, 결제 화면, 지갑 예시)을 동시에
-- 바꾸는 구조를 끊는다. 확정 시점의 fee_cents 는 그대로 bag_transfers 에 동결한다.
create table public.delivery_pricing (
  city           text not null,
  currency       char(3) not null default 'CAD',
  fee_cents      integer not null check (fee_cents >= 0),
  reserve_cents  integer not null check (reserve_cents >= 0),
  effective_from timestamptz not null default now(),
  source         public.data_source not null default 'simulated',
  primary key (city, effective_from)
);
insert into public.delivery_pricing (city, currency, fee_cents, reserve_cents)
values ('Toronto', 'CAD', 900, 900);

-- ── RLS ──────────────────────────────────────────────────────
do $$ declare t text; begin
  foreach t in array array['store_hours','hotels','seal_tags','delivery_pricing'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force  row level security', t);
  end loop;
end $$;

-- 카탈로그성 데이터는 로그인 사용자에게 읽기만. 쓰기는 서버(관리) 전용.
grant select on public.store_hours, public.hotels, public.delivery_pricing to authenticated;
create policy store_hours_read      on public.store_hours      for select to authenticated using (true);
create policy hotels_read           on public.hotels           for select to authenticated using (true);
create policy delivery_pricing_read on public.delivery_pricing for select to authenticated using (true);
-- seal_tags 에는 grant 를 주지 않는다. 여행자는 자기 가방에 붙은 태그만
-- bag_transfer_items.seal_id / receipts.seal_ids 로 본다. 재고 전체는 볼 이유가 없다.
```

## 3.4 `supabase/migrations/0006_w4_custody_server.sql`

```sql
-- ── §5.2 #1 · 이상 신고 (BG-9) ───────────────────────────────
create table public.transfer_issues (
  id          uuid primary key default gen_random_uuid(),
  transfer_id uuid not null,
  user_id     uuid not null,
  kind        text not null check (kind in ('delay','broken_seal','missing_bag','damaged_contents','wrong_hotel','other')),
  description text not null default '',
  photo_paths text[] not null default '{}',
  status      text not null default 'open' check (status in ('open','investigating','resolved')),
  event_id    uuid references public.transfer_events(id) on delete set null,
  client_op_id text,
  reported_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_note text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (transfer_id, user_id) references public.bag_transfers(id, user_id) on delete cascade
);
create index transfer_issues_transfer_idx on public.transfer_issues (transfer_id, reported_at desc);
create unique index transfer_issues_client_op_uidx
  on public.transfer_issues (user_id, client_op_id) where client_op_id is not null;
create trigger transfer_issues_touch before update on public.transfer_issues
  for each row execute function public.touch_updated_at();

alter table public.transfer_issues enable row level security;
alter table public.transfer_issues force  row level security;
-- 여행자는 신고를 만들고 읽는다. 처리 상태(status/resolved_at)는 운영이 쓴다 → UPDATE 미부여.
grant select, insert on public.transfer_issues to authenticated;
create policy transfer_issues_select on public.transfer_issues
  for select to authenticated using (user_id = auth.uid());
create policy transfer_issues_insert on public.transfer_issues
  for insert to authenticated with check (
    user_id = auth.uid()
    and status = 'open'
    and exists (select 1 from public.bag_transfers t where t.id = transfer_id and t.user_id = auth.uid())
  );

-- ── seq · created_at · source 는 서버 사실이다 ───────────────
-- 기존 RLS 는 actor 와 event_type 만 제한한다. seq 는 클라이언트가 정할 수 있어
-- 원장 순서를 위조할 수 있었고, source 는 'live' 로 찍어 Simulated 라벨을 뗄 수 있었다.
create or replace function public.stamp_transfer_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select coalesce(max(seq), -1) + 1 into new.seq
    from public.transfer_events where transfer_id = new.transfer_id;
  new.created_at := now();
  select t.source into new.source from public.bag_transfers t where t.id = new.transfer_id;
  if new.occurred_at > now() + interval '1 minute' then new.occurred_at := now(); end if;
  return new;
end $$;
create trigger transfer_events_stamp before insert on public.transfer_events
  for each row execute function public.stamp_transfer_event();

-- ── 상태는 이벤트의 결과다 ───────────────────────────────────
-- delivery_step 을 직접 갱신하는 경로를 DB 차원에서 없앤다.
-- 파트너 거부(BG-5f)와 호텔 인계 실패(BG-10)는 다르다: 전자는 아무것도 수거되지
-- 않았으므로 되돌릴 수 있고, 후자만 failed 다.
create or replace function public.apply_transfer_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare next_status public.transfer_status;
begin
  select (case new.event_type
    when 'paid'        then 'paid'
    when 'dropped_off' then 'dropped_off'
    when 'sealed'      then 'dropped_off'
    when 'collected'   then 'in_transit'
    when 'in_transit'  then 'in_transit'
    when 'arrived'     then 'in_transit'
    when 'handed_off'  then 'delivered'
    when 'cancelled'   then 'cancelled'
    when 'declined'    then (case when new.actor = 'hotel' then 'failed' else null end)
    else null end)::public.transfer_status into next_status;

  if next_status is null then return null; end if;

  update public.bag_transfers t
     set status       = next_status,
         delivered_at = case when new.event_type = 'handed_off'
                             then coalesce(t.delivered_at, now()) else t.delivered_at end
   where t.id = new.transfer_id
     and t.status not in ('delivered', 'cancelled');      -- 종료 상태는 동결
  return null;
end $$;
create trigger transfer_events_apply_status after insert on public.transfer_events
  for each row execute function public.apply_transfer_status();

-- ── 여행자가 bag_transfers 에서 쓸 수 있는 컬럼을 좁힌다 ─────
-- 기존 정책(transfers_update)은 delivered 만 아니면 전 컬럼 UPDATE 를 허용했다.
-- 즉 클라이언트가 status='paid', fee_cents=0, pass_token_hash=… 를 직접 쓸 수 있었다.
revoke update on public.bag_transfers from authenticated;
grant  update (dropoff_store_id, weight_grams) on public.bag_transfers to authenticated;
-- bag_count · fee_cents · hotel_* · eta_* · confirmed_at · pass_* · status ·
-- ineligible_* 는 전부 서버(admin 클라이언트) 전용이다.
```

적용 순서: `0003 → 0004 → 0005 → 0006`. 각 파일마다 `apply_migration` 직후 `get_advisors(type: security)`를 돌리고, `security definer` 함수 3개(`handle_new_user`, `stamp_transfer_event`, `apply_transfer_status`)에 `set search_path`가 붙어 있는지 확인한다(advisor의 `function_search_path_mutable` 경고 대상).

## 3.5 프런트 타입과 어긋나는 지점

| 변경 | 프런트에서 깨지는 곳 |
| --- | --- |
| `transfer_event`에 `sealed` 추가 | `TransferEventType` 유니온에 `"sealed"` 추가. BG-6 단계 매핑(4단계)은 `sealed`를 `Dropped off`에 흡수 |
| `transfer_ineligible` 신설 | BG-3f가 문자열 비교 대신 6개 유니온으로. 복구 액션 표가 코드에서 이 유니온을 exhaustive switch로 다룬다 |
| `stores.accepted_handling handling_type[]` | 배열이다. `Handling[]`으로 받고 `includes()`로 판정 |
| `delivery_pricing` | `app/onboarding/budget.ts`의 `DELIVERY_RESERVE = 9` 상수 제거. `splitBudget(total, reserveCents)`로 시그니처 변경 → 온보딩 폼이 서버 가격을 먼저 읽어야 한다 |
| `bag_transfers` 컬럼 권한 축소 | 클라이언트가 직접 `.from("bag_transfers").update(...)`를 호출하던 코드는 전부 라우트 경유로 |

---

# 4. W4 — 이송 실물화

## 4.1 파트너 지점 데이터

`stores.is_partner_point`는 이미 있고, 여기에 **판정 가능한 조건**을 붙이는 것이 0005의 목적이다. BG-3f의 6가지 사유는 각각 데이터 한 줄에 대응해야 한다. 그렇지 않으면 "이송 불가"가 하드코딩 카피가 된다.

| BG-3f 사유 | `ineligible_code` | 판정 근거 | 복구 액션이 읽는 것 |
| --- | --- | --- | --- |
| 파트너 지점 없음 | `no_partner_nearby` | `stores where city=? and is_partner_point` 반경 내 0건 | 다른 도시/내일 |
| 마감 지남 | `cutoff_passed` | `now() > dropoff_cutoff_at` | 다른 파트너의 `dropoff_cutoff` |
| 냉장 시간 초과 | `chilled_window_closed` | 항목에 `handling='Chilled'` + `now() > chilled_deadline` | 초콜릿 제외 후 재판정 |
| 호텔 배송 거부 | `hotel_refuses` | `hotels.accepts_delivery = false` 또는 `trips.hotel_verified_at is null` + 사용자가 확인 거부 | 대체 주소 |
| 취급 불가 | `handling_unsupported` | `not (item.handling = any(store.accepted_handling))` 또는 `Σweight > store.max_weight_grams` | 가방 분리 |
| 예비비 부족 | `reserve_short` | `plans.delivery_reserve_cents < fee_cents` | flexible 인출 승인(W5) |

판정은 서버 순수 함수 `lib/transfers/eligibility.ts`에 둔다. 입력 `{transfer, items, store, storeHours, hotel, plan, now}`, 출력 `{eligible, code, detail, remedies: string[]}`. **화면은 판정하지 않는다.** 부적격이어도 `bag_transfers`는 `draft`로 남는다 — 선택한 가방 목록이 보존돼야 한다(BG-3f 불변 규칙).

시딩: `source='sample'`로 토론토 파트너 3곳 + `store_hours` + `hotels` 2곳. 시뮬레이션이라는 사실은 `source` 컬럼이 말하고, GL-2 칩이 그걸 읽는다. 카피에 `Simulated`를 손으로 적지 않는다.

## 4.2 QR 패스 — 서명·검증

**원칙: DB에는 해시만. 토큰 원문은 응답 1회에만 존재한다.**

```
토큰 = "TRLP1." + b64url(payload) + "." + b64url(HMAC-SHA256(KEY, "TRLP1." + b64url(payload)))
payload = { "v":1, "t":"<transferId>", "j":"<jti uuid>", "iat":1755290400, "exp":1755376800, "n":3 }
```

- payload에 **PII를 넣지 않는다.** 호텔명·이메일·이름·금액 없음. 매장에서 남이 QR을 찍어도 얻는 것은 이송 uuid뿐이다.
- 키: `TRAIL_PASS_SIGNING_KEY`(32바이트 이상, 서버 전용 env). Web Crypto `crypto.subtle.importKey('raw', …, {name:'HMAC', hash:'SHA-256'})` — Vercel Edge/Node 양쪽에서 동작한다.
- DB: `pass_token_hash = sha256(토큰 전체)` hex, `pass_version += 1`, `pass_issued_at`, `pass_expires_at`.

검증 3단계 (`POST /api/partner/scan`):
1. **HMAC 재계산.** 서명이 틀리면 즉시 거부 — DB 조회를 하지 않는다. 무차별 대입이 DB를 때리지 못한다.
2. **`exp`/`iat` 확인.** 만료면 `410 pass_expired`.
3. `sha256(토큰)`을 `bag_transfers.pass_token_hash`와 **상수시간 비교.** 재발급된 패스는 해시가 갈렸으므로 자동 무효 — `pass_version`이 폐기 목록 역할을 한다.

만료 시각: `min(dropoff_cutoff_at + 3h, iat + 24h)`. **오프라인이 정상 경로**이므로(매장 안에서 QR이 떠야 한다) 결제 성공 시점에 발급해 IndexedDB에 캐시한다. 여기서 exp를 짧게 잡으면 지하상가에서 패스가 죽고, 무기한이면 도난 QR이 영구히 산다. 24h 상한이 그 절충이다.

## 4.3 봉인 태그 부여 흐름

```
1. 여행자가 BG-5에서 QR 제시                     (오프라인 가능)
2. 파트너 단말 → POST /api/partner/scan {token}
   ← 200 { transferId, bagCount: 3, items: [{id, label, handling}], hotelName, scanSession(15분) }
3. 직원이 가방마다 물리 태그 부착 후 태그 코드 스캔
   → POST /api/partner/transfers/{id}/seals { sealIds: ["TRL-A19","TRL-A20","TRL-A21"] }
   서버: seal_tags 에서 state='stock' 인지 확인 → item 에 배정(sealed_at) → state='attached'
        → transfer_events{sealed, actor:'partner', item_id: …}  (가방당 1행)
4. 개수 확인 → POST /api/partner/transfers/{id}/collect
   서버: 모든 item.seal_id is not null 확인 → transfer_events{collected, actor:'partner'}
        → 트리거가 status='in_transit'
5. 개수 불일치·거부 → POST /api/partner/transfers/{id}/decline {code, counted}
   서버: transfer_events{declined, actor:'partner', payload:{counted:2, expected:3}}
        status 는 그대로(paid/dropped_off). BG-5f 로 사용자에게 정정 요청
```

`bag_transfer_items`의 RLS는 `transfer.status='draft'`일 때만 클라이언트 쓰기를 허용한다. 결제 후 매니페스트는 물리적 사실이므로 이 경로는 **admin 클라이언트로만** 쓴다. `seal_tags` 재고 확인이 없으면 직원이 아무 문자열이나 적어도 통과하고, "태그 ID 집합 대조"라는 인계 증빙 전체가 무의미해진다.

**인계 증빙은 개수가 아니라 집합 대조다:**
```
handoff(scannedSealIds):
  expected = set(items.seal_id where seal_id is not null)
  scanned  = set(scannedSealIds)
  if expected == scanned  → transfer_events{handed_off, actor:'hotel'}
                            + receipts(seal_ids = sorted(expected))
  else                    → transfer_events{declined, actor:'hotel', payload:{missing, extra}}
                            + bag_transfers.handoff_failure_code='tag_mismatch'  → status='failed'
                            + receipts 생성 안 함  → BG-10
```
`|expected| == |scanned|`로 비교하는 구현은 만들지 않는다. 개수만 맞고 가방이 바뀐 경우를 통과시킨다.

## 4.4 커스터디 이벤트를 서버 소유로

| 이벤트 | actor | 누가 쓰나 | 경로 | 결과 status |
| --- | --- | --- | --- | --- |
| `created` | system | 서버 | `POST /api/transfers` | draft |
| `bags_selected` | traveler | 서버 | `POST /api/transfers/{id}/confirm` | awaiting_payment |
| `paid` | system | 서버(결제 확정 후) | `POST /api/transfers/{id}/pay` | paid |
| `dropped_off` | traveler | 클라이언트 직접 삽입 가능 | `POST /api/transfers/{id}/events` | dropped_off |
| `sealed` | partner | 서버(admin) | `/api/partner/…/seals` | dropped_off |
| `collected` | partner | 서버(admin) | `/api/partner/…/collect` | in_transit |
| `in_transit`·`arrived` | driver | 서버(admin) | 시뮬레이터 | in_transit |
| `handed_off` | hotel | 서버(admin) | `/api/partner/…/handoff` | delivered |
| `declined` | partner \| hotel | 서버(admin) | `/api/partner/…/decline` | partner→변화 없음, hotel→failed |
| `delayed`·`seal_issue` | traveler | 클라이언트 | `POST /api/transfers/{id}/issues` | 변화 없음 |
| `cancelled` | traveler | 서버(환불 동반) | `POST /api/transfers/{id}/cancel` | cancelled |

여행자가 직접 삽입할 수 있는 넷(`dropped_off`·`delayed`·`seal_issue`·`cancelled`)은 이미 RLS가 제한하고 있다. 0006의 트리거가 `seq`·`created_at`·`source`를 서버 값으로 덮어써서 **원장의 순서와 라벨까지 서버 소유**가 된다.

`occurred_at`(여행자 주장)과 `created_at`(서버 시각)은 둘 다 남기고, BG-6 타임라인은 `occurred_at`을 보여주되 두 값이 5분 이상 벌어지면 `Reported 4:42 PM · received 5:05 PM`으로 병기한다 — 오프라인 큐가 늦게 도착한 사실을 숨기지 않는다.

`seq` 채번은 `max(seq)+1`이라 동시 삽입이 유니크 제약에 걸린다. 라우트는 `23505`를 잡아 1회 재시도한다(파트너 단말과 여행자 앱이 동시에 쓰는 경우가 실제로 있다).

## 4.5 `Preview next status` → 개발용 시뮬레이터

버튼은 폐기한다(APP_SPEC §2.K). 대체는 라우트 하나다.

```ts
// app/api/dev/transfers/[id]/advance/route.ts
export async function POST(req, { params }) {
  if (process.env.TRAIL_SIMULATOR !== "on") return new Response(null, { status: 404 });
  //  403 이 아니라 404 — 프로덕션에서 이 경로의 존재 자체를 알리지 않는다
  const traveler = await getTraveler(); if (!traveler) return json({ error: "unauthenticated" }, 401);
  const t = await admin.from("bag_transfers").select("*")
              .eq("id", params.id).eq("user_id", traveler.id).single();   // RLS 없음 → 소유권 수동 확인
  if (t.source !== "simulated") return json({ error: "live_transfer" }, 409);
  //  실데이터 이송은 시뮬레이터가 절대 건드리지 않는다
  const next = NEXT_EVENT[t.status];       // paid→collected→in_transit→arrived→handed_off
  … insert transfer_events(actor: next.actor, source:'simulated') …
}
```

- 기본값 off. 데모용으로 켜면 화면 상단에 `SIMULATOR ON` 배지를 강제로 띄운다(꺼진 상태와 구분되지 않으면 시연에서 사고가 난다).
- 이 라우트는 **파트너 API의 대역**이기도 하다. 실제 파트너 단말이 붙을 때 `/api/partner/*`의 인증(파트너 키)만 갈아끼우면 되고, 이벤트 생성 로직은 그대로다.
- `npm test` 회귀 케이스: `TRAIL_SIMULATOR` 미설정 시 `POST /api/dev/...`가 404를 반환할 것.

## 4.6 실패 분기 3종의 서버측 표현

| 분기 | 화면 | 상태 | 이벤트 | 컬럼 | 원장 흔적 |
| --- | --- | --- | --- | --- | --- |
| **이송 불가** (헌법 ③) | BG-3f | `draft` 유지 | `declined` (actor `system`) | `ineligible_code` + `ineligible_reason` | 판정 시각과 사유가 남는다. 가방 선택은 그대로 |
| **파트너 거부** | BG-5f | `paid`/`dropped_off` 유지 | `declined` (actor `partner`, payload `{counted, expected}`) | — | 커스터디는 시작되지 않았다. 취소 시 `payments.refunded` |
| **호텔 인계 실패** (헌법 ④) | BG-10 | `failed` | `declined` (actor `hotel`) | `handoff_failure_code` 4종 | `receipts` 미생성. `transfer_events` 전체 보존 |
| **지연·봉인 이상** | BG-9 | 변화 없음 | `delayed` / `seal_issue` (actor `traveler`) | `transfer_issues` 행 | 이벤트와 신고가 `event_id`로 연결 |

세 분기 모두 **행을 지우지 않는다.** `bag_transfers`에는 DELETE 권한 자체가 없다(0002). `failed`는 `transfers_one_open_per_trip` 유니크 인덱스에서 제외돼 있으므로, 인계 실패 후 대체 주소로 새 이송을 만드는 BG-10의 복구 경로는 막히지 않는다.

취소 시 지갑 규칙(W5와의 경계):
```
cancel(transferId):
  payments: captured → refunded  |  reserved/authorized → released     (행 삭제 금지)
  transfer_events{cancelled, actor:'traveler'}
  plans.delivery_reserve_cents: 변화 없음 (예비비는 애초에 지갑에 남아 있었다)
  단, 확정 시 fee > reserve 라서 flexible 에서 인출했던 차액이 있으면
    → budget_changes{proposed_by:'system_clamp', reason:'transfer cancelled', status:'approved'} 역전 행
    → plan_events 로 기록                                    ← 헌법 1의 감사 근거
```

---

# 5. API 라우트 목록

전 라우트 공통: `export const dynamic = "force-dynamic"`, 신원은 `getTraveler()`, 동일 출처 검사, 페이로드 상한. **`user_id`를 body로 받는 라우트는 하나도 없다.**
`(a)` = admin 클라이언트(service_role) 필요 · `(s)` = 세션 클라이언트(RLS 유효)

## 5.1 W1

| 메서드 · 경로 | 요청 | 응답 | 화면 액션 |
| --- | --- | --- | --- |
| `GET /api/state?tripId=` (s) | — | §2.2 전체 | 부팅 · 탭 전환 · 아웃박스 플러시 후 재동기화 |
| `POST /api/import` (a) | `{payload:string}` | `201 {tripId, imported}` / `409 already_imported` / `422 unreadable` | 부팅 시 1회 (§1.4) |
| `POST /api/trips` (s) | `{country,city,areas,startDate,endDate,hotelName,hotelAddress,companions,freeTime,currency,totalCents}` | `201 {tripId, planId}` | ON-4 `Create my trip` — **현재 브라우저가 직접 insert 하는 것을 라우트로 옮긴다** |
| `PATCH /api/trips/{tripId}` (s) | 부분 필드 | `200 {trip}` | TR-2 여행 상세 저장 |
| `POST /api/trips/{tripId}/activate` (s) | `{}` | `200 {activeTripId}` / `409 transfer_in_flight` | TR-1 카드 탭 · TR-4 확인 시트 |
| `PATCH /api/plans/{planId}` (s) | `{category?,preference?,localOnly?,…}` + `clientOpId` | `200 {plan}` | AI-2 brief 저장 |
| `POST /api/plans/{planId}/approve` (s) | `{}` | `200 {plan, stops}` | TL-2 `Build my route →` — 여기서 `snapshot_price_cents` 동결 + `plan_events{approval}` |
| `PUT /api/stops/{stopId}` (s) | `{saved?, plannedDay?, status?}` + `clientOpId` | `200 {stop}` | TL-2 저장 토글 · TL-7 `Skip` |
| `PUT /api/stops/order` (s) | `{planId, order:[stopId,…], clientOpId}` | `200 {stops}` | TL-3 `Save order` |
| `POST /api/stops/{stopId}/replace` (s) | `{candidateProductId}` | `201 {stop}` (새 행 + `replacedStopId`) | TL-10 후보 선택 |
| `POST /api/stops/{stopId}/inquiry` (s) | `{clientOpId}` | `201 {inquiry}` | TL-2 / TL-2b `Request` |
| `PUT /api/purchases/{stopId}` (s) | `{clientOpId, occurredAt, status, actualPriceCents, quantity, bags, handling, note?}` | `200 {stop, wallet}` / `409 stale_planned_overwrite` | TL-8 `Confirm purchase` (전체 치환 · 재생 안전) |
| `DELETE /api/purchases/{stopId}` (s) | `{clientOpId, reason?}` | `200 {stop, wallet}` | TL-8 `Remove purchase` — **행 삭제가 아니라 `voided_at` 세팅** |
| `POST /api/sync` (s) | `{ops:[{opId,method,path,body}]}` | `200 {results:[{opId,status}], state}` | GL-1 아웃박스 배치 플러시 |

409 규칙 상세 (`PUT /api/purchases/{stopId}`):
```
서버 stop.status='bought' && purchase.voided_at is null
  && body.status='planned'
  && body.occurredAt < purchase.recorded_at        ← 늦게 도착한 오프라인 재생
→ 409 { error:'stale_planned_overwrite', server:{ …현재 purchase… } }
클라이언트: 아웃박스에서 해당 op 제거(재시도 금지) + GL-1 `1 change couldn't be saved`
```
4xx는 재시도하지 않는다. 지출 기록이 사라지는 것이 최악의 실패이므로, 조용히 성공한 척하지 않고 사용자에게 보인다.

## 5.2 W4

| 메서드 · 경로 | 요청 | 응답 | 화면 액션 |
| --- | --- | --- | --- |
| `POST /api/transfers` (s) | `{tripId, items:[{purchaseId?|label, bags, handling, weightGrams?}]}` | `201 {transfer}` (`draft`, `created` 이벤트) | BG-1 `Check delivery options →` |
| `PUT /api/transfers/{id}/items` (s) | `{items:[…]}` (전체 치환) | `200 {transfer}` | BG-1 체크 변경 · 플랜 외 가방 추가 |
| `GET /api/transfers/{id}/eligibility` (s) | — | `200 {eligible, code, detail, remedies[], candidateStores[]}` | BG-3 진입 판정 · BG-3f |
| `POST /api/transfers/{id}/confirm` (a) | `{dropoffStoreId, bagCount, hotelConfirmed:boolean}` | `200 {transfer}` — `fee_cents`·`hotel_*`·`eta_*`·`dropoff_cutoff_at` **동결**, `confirmed_at`, `bags_selected` 이벤트 | BG-3 `Continue to payment →` |
| `POST /api/transfers/{id}/pay` (a) | `{clientOpId, methodId}` | `200 {payment, transfer, pass}` / `402 {failureCode}` | BG-4 `Pay CAD $9.00` — 내부에서 `/api/payments/simulate` 호출. **교체 지점은 그 파일 하나** |
| `POST /api/transfers/{id}/pass` (a) | `{}` | `200 {token, expiresAt}` (토큰은 이 응답에만 존재) | BG-5 진입 · 패스 재발급 |
| `POST /api/transfers/{id}/events` (s) | `{clientEventId, eventType:'dropped_off'\|'delayed'\|'seal_issue'\|'cancelled', occurredAt, note?}` | `201 {event, transfer}` | BG-5 `I've dropped off my bags ✓` |
| `POST /api/transfers/{id}/cancel` (a) | `{reason}` | `200 {transfer, payment}` | BG-4f `Cancel delivery` · BG-5f |
| `POST /api/transfers/{id}/issues` (s) | `{clientOpId, kind, description, photoPaths?}` | `201 {issue, event}` | BG-9 `Send report` |
| `GET /api/transfers/{id}` (s) | — | `200 {transfer}` (이벤트 포함) | BG-6 폴링(30초) |
| `GET /api/receipts/{transferId}` (s) | — | `200 {receipt, events, items, payment}` / `404 not_yet` | BG-7 `View receipt` · BG-8 |
| `POST /api/partner/scan` (a) | `{token}` | `200 {transferId, bagCount, items, hotelName, scanSession}` / `401 bad_signature` / `410 pass_expired` | 파트너 단말 (프로토타입에선 시뮬레이터) |
| `POST /api/partner/transfers/{id}/seals` (a) | `{sealIds[]}` | `200 {items}` + `sealed` 이벤트 ×N | 직원 태그 부착 |
| `POST /api/partner/transfers/{id}/collect` (a) | `{}` | `200 {transfer}` + `collected` | 수거 확정 |
| `POST /api/partner/transfers/{id}/handoff` (a) | `{scannedSealIds[], receivedBy}` | `200 {receipt}` / `409 {code:'tag_mismatch', missing, extra}` | 호텔 인계 (집합 대조) |
| `POST /api/partner/transfers/{id}/decline` (a) | `{actor:'partner'\|'hotel', code, counted?}` | `200 {transfer}` | BG-5f · BG-10 |
| `POST /api/dev/transfers/{id}/advance` (a) | `{}` | `200 {event}` / `404` (플래그 off) | 개발·시연 전용. 사용자 화면에 버튼 없음 |

만들지 않는 라우트: **`PATCH /api/transfers/{id}/status`**. 상태는 이벤트의 결과이고, 이 라우트가 존재하는 순간 원장과 현재 상태가 갈라진다.

---

# 6. 위험과 이견

## 6-1. W1을 "W0와 병렬"로 두면 클라이언트 절반을 두 번 만든다 — BUILD_PLAN 반박

BUILD_PLAN은 W0·W1·W6·W8을 "서로 안 막는다"고 했다. 서버 쪽은 맞다. 하지만 W1의 4개 `Record<number,…>` 제거는 `app/page.tsx` **한 파일 안**에서 일어나고, W3(4탭 IA)는 그 파일을 9화면 라우트로 해체한다. 순진하게 진행하면 같은 상태 배선을 두 번 쓴다.

수정 제안 — W1의 산출물 경계를 못 박는다.
- W1이 만드는 것: `supabase/migrations/0003`, `lib/state/types.ts`, `lib/state/load.ts`, `app/api/state`, `lib/supabase/admin.ts`, `lib/legacy/v3-templates.ts`, `useTrailState()` 훅, 아웃박스 골격.
- W1이 **안 하는 것**: 화면 배치 변경, 컴포넌트 분해, CSS.
- `app/page.tsx`는 훅을 호출해 기존 렌더 트리에 값을 꽂는 **어댑터**만 받는다.

이러면 W3는 훅을 라우트로 옮겨 심기만 하면 된다.

## 6-2. W4가 "요금 결정"에 막힌다는 전제는 틀렸다 — BUILD_PLAN 반박

BUILD_PLAN은 W5를 "$9→$15 결정 대기"로 묶고 W4의 선행은 W1뿐이라 했다. 그런데 W4의 BG-3(확정)과 BG-4(결제)가 `fee_cents`를 동결한다 — 즉 **요금이 W4 코드 안으로 들어온다.** 지금 요금은 `app/onboarding/budget.ts`의 `DELIVERY_RESERVE = 9` 상수이고, 이걸 바꾸면 온보딩·지갑·결제가 동시에 흔들린다.

해법은 결정을 기다리는 게 아니라 **결정을 데이터로 옮기는 것**이다(0005의 `delivery_pricing`). `splitBudget()`이 서버 가격을 인자로 받게 하면 $9→$15는 `insert into delivery_pricing` 한 줄이 된다. 이미 확정된 이송의 `fee_cents`는 동결돼 있어 소급되지 않는다. **W4는 요금 결정을 기다릴 필요가 없다.** 대신 온보딩 폼이 서버 가격을 읽도록 바꾸는 작은 작업이 W1에 추가된다.

## 6-3. 지금 RLS에 구멍이 셋 있다 — W4의 전제가 성립하지 않는다

`0002_rls.sql`을 다시 읽고 찾은 것들이다. 셋 다 "상태는 이벤트의 결과"를 무효화한다.

1. **`transfers_update` 정책이 전 컬럼 UPDATE를 허용한다.** `delivered`만 아니면 클라이언트가 `status='delivered'`, `fee_cents=0`, `pass_token_hash='…'`를 직접 쓸 수 있다. → 0006에서 컬럼 단위 grant로 좁힌다.
2. **`transfer_events_insert` 정책이 `seq`와 `source`를 제한하지 않는다.** 여행자가 `seq=0`으로 이벤트를 끼워 넣어 원장 순서를 위조하거나, `source='live'`로 찍어 `Simulated` 라벨을 뗄 수 있다. → 0006의 `stamp_transfer_event()`.
3. **`receipts`에 DELETE 트리거가 없다.** `receipts_no_update`만 있다. 0002의 주석은 "트리거가 service_role까지 막는다"고 하지만 삭제는 막지 않는다. → 0003의 `receipts_no_delete`.

W4를 이 상태로 시작하면 "커스터디는 서버 소유"가 카피일 뿐 데이터 계약이 아니다. **0003·0006을 W4 착수의 선행으로 둔다.**

## 6-4. `transfers_one_open_per_trip`이 다일 여행의 2회 배송을 막는다

```sql
create unique index transfers_one_open_per_trip on public.bag_transfers (trip_id)
  where status not in ('delivered', 'cancelled', 'failed');
```
4박 여행에서 2일차에 가방을 보내고 3일차에 또 보내는 것이 이 제품의 정상 사용이다. 그런데 첫 이송이 `in_transit`인 동안 두 번째 이송을 만들 수 없다. 배달이 완료돼야(6:47 PM) 다음 이송을 시작할 수 있다는 뜻인데, 실제로는 오후에 산 가방을 저녁에 또 보낸다.

제안: 유일성을 **미결제 초안에만** 건다.
```sql
drop index public.transfers_one_open_per_trip;
create unique index transfers_one_draft_per_trip on public.bag_transfers (trip_id)
  where status in ('draft', 'awaiting_payment');
```
결제된 이송은 동시 진행이 가능해지고, APP_SPEC §1.2의 "이송 진행 중이면 Bags ▸ Tracking"과 BG-1의 "진행 중 이송 있으면 추적으로 착지"는 **단수 전제**라 함께 고쳐야 한다(목록 + 최근 1건 착지). 스키마 결정이므로 0005에 넣기 전에 product-lead 답을 받는다.

## 6-5. `purchases.stop_id`가 유니크라 플랜 외 구매를 기록할 수 없다

`bag_transfer_items.purchase_id`는 NULL 허용이라 **플랜 외 가방은 보낼 수 있다.** 그런데 그 가방을 산 **돈**은 어디에도 기록되지 않는다. `purchases`는 `stop_id not null unique`라 stop 없는 구매가 불가능하다.

결과: 지갑의 `spent`가 실제 지출보다 작게 나온다. TL-9(예산 초과 승인)가 헌법 ② 화면인데 계획 밖 지출은 초과를 유발하지 못한다. W2/W5의 문제지만 **W1의 지갑 계산식이 그 위에 세워지므로** 지금 기록한다. 해법 후보 둘: (a) `purchases.stop_id`를 nullable로 완화 + `trip_id` 필수, (b) 플랜 외 구매용 `stops` 행을 자동 생성(`source='live'`, `sequence`를 999+). (b)가 스키마 변경 없이 경로 화면에서 숨기기만 하면 되므로 유리하다.

## 6-6. PostgREST 복합 FK 임베드는 배포 전 실증이 필요하다

이 스키마는 **모든** 자식 테이블이 `(parent_id, user_id)` 복합 FK를 쓴다. RLS 성능과 교차 삽입 방지에는 최적이지만 PostgREST의 관계 탐색에는 흔치 않은 형태다. §2.3의 힌트 문법이 통하지 않으면 `GET /api/state` 전체가 §2.4의 RPC로 바뀐다 — 작업량은 반나절이지만 **W1-3 착수 첫날에 15분짜리 스파이크로 확인**해야 한다. 나중에 발견하면 타입까지 다시 만든다.

## 6-7. 활성 여행 전환은 두 문장, 순서가 정해져 있다

`trips_one_active`는 부분 유니크 인덱스라 지연(deferrable)될 수 없다. 한 문장 `update … set status = case …`로 교체하면 문장 내부에서 순간적으로 두 행이 `active`가 되어 실패할 수 있다. 트랜잭션 안에서 **강등 먼저, 승격 나중**:
```sql
begin;
  update public.trips set status = 'planning' where user_id = $1 and status = 'active' and id <> $2;
  update public.trips set status = 'active'   where user_id = $1 and id = $2;
commit;
```
강등된 여행의 목적지 상태는 `past`가 아니라 `planning`이다(끝나지 않았다). 이송이 진행 중인 여행을 강등해도 이송은 계속 추적된다 — TR-4의 승인 게이트 카피가 그 사실을 말한다.

## 6-8. localStorage 이관은 W0보다 먼저 못 박아야 한다

W0가 `app/page.tsx`의 목업 상수를 지우는 순간 인덱스 `i`를 상품명으로 되돌릴 방법이 사라진다. `lib/legacy/v3-templates.ts` 동결(§1.3의 W1-0)이 **W0 착수 전에** 들어가야 한다. 순서가 뒤집히면 기존 사용자의 구매 기록(=돈)이 복원 불가능해진다.

부수적으로: `memoryEnabled`를 임포트하지 않는 결정은 되돌리지 않는다. 로컬 기본값이 `true`(opt-out)였고 DB는 `false`(opt-in)다. 옮기면 사용자가 준 적 없는 동의를 만들어 낸다.

## 6-9. `plans`의 전체 UPDATE 권한이 `budget_changes`를 우회한다

`0002_rls.sql`의 루프가 `plans`에 `for all` + 전 컬럼 grant를 준다. 클라이언트가 `planned_cents`를 직접 올릴 수 있고 `plans_buckets_sum` 체크만 맞으면 통과한다. 즉 **헌법 5(flexible은 승인 없이 못 쓴다)가 DB에서 강제되지 않는다.** W2의 범위지만 W4의 `reserve_short` 판정이 `delivery_reserve_cents`를 신뢰하므로 여기서 언급한다. 해법은 W4와 같은 형태다 — 금액 4컬럼의 UPDATE grant를 회수하고, 서버 라우트가 `budget_changes{status:'approved'}` 행과 함께 admin 클라이언트로 쓴다.

## 6-10. 시뮬레이터 플래그는 시연에서 반드시 켜진다

`TRAIL_SIMULATOR=on`이 데모데이에 켜질 것이라는 전제로 설계했다(BUILD_PLAN의 최소 경로에 드롭오프→추적→영수증이 있다). 그래서 "프로덕션에서 차단"이 아니라 **`source='simulated'` 행에만 동작 + 화면 배지 강제**로 안전장치를 옮겼다. 플래그를 끄는 것만으로 방어하면 시연 때 켠 뒤 다시 끄는 것을 잊는 경로가 남는다.

---

## 착수 순서 요약

```
W1-0 레거시 상수 동결        ← W0보다 먼저. 30분
W1-1 0003 적용 + advisors
   └ 스파이크: PostgREST 복합 FK 임베드 15분 확인 (§6-6)
W1-2 타입 → W1-3 /api/state → W1-4 admin 클라 → W1-5 클라 배선 → W1-6 import → W1-7 아웃박스

W4-0 §6-4(다일 2회 배송) 결정 확인
W4-1 0004 → 0005 적용 + 파트너·호텔 시딩
W4-2 0006 적용 (RLS 구멍 3건 봉합 + 커스터디 트리거)
W4-3 eligibility 순수 함수 → BG-3 / BG-3f
W4-4 pass 서명·검증 → BG-5
W4-5 partner 라우트 4종 + dev 시뮬레이터 → BG-6 / BG-5f / BG-10
W4-6 handoff 집합 대조 → receipts → BG-7 / BG-8
W4-7 transfer_issues → BG-9
```

## 답을 받아야 진행되는 것

1. **§6-4** 한 여행에서 이송을 동시에 여러 건 진행할 수 있나 (유니크 인덱스 범위 변경 여부) — W4-1 착수 조건
2. **§6-5** 플랜 외 구매의 금액을 지갑에 넣을 것인가 (넣는다면 (a)/(b) 중 어느 쪽) — W1 지갑 계산식에 영향
3. **§6-2** `delivery_pricing` 도입에 동의하는가 (동의하면 요금 결정은 W4/W5를 더 이상 막지 않는다)
4. `TRAIL_PASS_SIGNING_KEY` 발급·보관 위치 (Vercel env) — W4-4 착수 조건
