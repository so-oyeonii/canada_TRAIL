# G3 · 트립 · 발견 — 실행 계획

기준 문서: `docs/FIGMA_ADOPTION.md`. §1 협상 불가와 §4 계약이 이 문서보다 위에 있다.
담당: platform · app. 마이그레이션 **0021 · 0022 · 0023**을 G3가 연다 (§4에 따라 `lib/state/*`도 G3가 수정, 충돌 시 G3 우선).
**`0020`는 G0의 것이다** — `trips` 컬럼 GRANT 잠금 · DELETE revoke · 호텔/통화 트리거. 잠금이 먼저 가야 G3의 `saveTrip` 재배선이 부서지지 않는다. 경계와 인수인계 두 건은 §2·§9.

`docs/plans/G0-foundation.md`는 착수 시점에 존재하지 않았다. 번호 배정은 조정자 통보를 따른다 (§9 표).

> **⚠ 번호 충돌 — 조정자 확인 요망.** 작업 트리에 이미 미커밋 `supabase/migrations/0014_survey_responses.sql`이 있다 (설문 응답 테이블, 다른 작업의 산출물). 조정자가 G0에 배정한 `0020`와 파일명이 겹친다. **G0 잠금 = `0020`인지, 설문이 `0020`이고 G0가 `0021`로 밀려 G3가 `0022~0024`이 되는지 착수 전에 확정해야 한다.** 이 문서는 조정자 통보대로 G0=`0020` / G3=`0021~0023`로 쓰여 있고, 밀릴 경우 번호만 +1 하면 나머지 설계는 그대로다.

---

## 1. 왜 이게 진짜 리팩터인가 — "활성 트립은 하나"가 박힌 4곳

저장소를 훑어 확인한 사실만 적는다.

| # | 위치 | 지금 | 문제 |
| --- | --- | --- | --- |
| 1 | `app/(app)/app-state.tsx:97` | `useTrailState()` — 인자 없음 | `useTrailState(tripId?)`는 파라미터를 받는데 호출자가 아무도 안 준다. 트립 선택 주체가 없다 |
| 2 | `lib/state/store.ts:25` | `cacheKey(userId)` | 유저당 캐시 1개. 트립을 바꾸면 이전 트립 캐시를 덮어쓴다. **outbox가 그 캐시 안에 들어 있다** — 트립 A의 미전송 쓰기가 트립 B로 전환하는 순간 사라진다 |
| 3 | `app/(app)/app-state.tsx:370` | `if (noTrip) router.replace("/onboarding")` | Home 탭은 트립 없이도 떠야 한다 (§0 표가 그 중복을 감수한다고 명시). 지금은 `(app)` 아래 전 화면이 `AppReady`(trip non-null) 계약 |
| 4 | `POST /api/trips` + `TripStatus` | 항상 `status:'planning'` 삽입, 전이 코드 0줄 | `loadTrailState`가 `status='active'`를 먼저 찾고 없으면 "가장 최근 updated_at"으로 폴백한다 (`load.ts:70`). 즉 **`active`는 실제로 존재한 적이 없고 폴백이 제품을 지탱하고 있다.** 이 상태로 `CURRENT/UPCOMING/PAST` 3구획을 만들면 전부 UPCOMING이다 |

### 한 커밋에 묶어야 하는 이유

넷 중 하나만 먼저 넣으면 각각 이렇게 깨진다.

- 2번만 → 키가 될 트립 id의 주인이 없다 (1번이 없으면 `cacheKey(userId, ???)`)
- 3번만 → 종료된 여행에 대고 `Ready to explore Toronto?`를 띄운다 (4번이 없으면 status가 거짓말)
- 4번만 → `revoke update on trips` 순간 `saveTrip`의 supabase-js 직접 UPDATE가 프로덕션에서 403 (PATCH 라우트가 같은 PR에 없으면 저장 버튼이 죽는다)
- 1번만 → 선택은 되는데 캐시가 하나라 오프라인 재진입 시 남의 트립이 그려진다

### 1-A. 선택된 트립의 주인을 `TrailStore`로 옮긴다

**before** — `app-state.tsx`가 `useTrailState()`를 인자 없이 부르고, 서버(`load.ts`)가 "active 아니면 최근"으로 혼자 고른다. 클라이언트는 무엇이 열렸는지 바꿀 수단이 없다.

**after** — `TrailStore`가 `tripId`를 스냅샷 필드로 들고, `store.select(id)`가 그것을 바꾸고 `refresh(id)`를 부른다. `useTrailState()`는 인자를 **없앤다** (아무도 안 쓰던 파라미터를 지우는 쪽이 정직하다) 대신 `selectTrip`을 반환한다. 서버의 `activeTripId`는 여전히 **초기값의 출처**이고, 선택이 없을 때의 답이다.

```
// lib/state/use-trail-state.ts
export function useTrailState(store: TrailStore = trailStore()) { … return { ...snapshot, refresh, queue, flush, pending, selectTrip: store.select }; }
```

`/trips/[id]/…` 진입 시 `useEffect(() => selectTrip(id), [id])` — 멱등이므로 effect가 상태를 쓰는 것을 허용한다. G2의 트립 컨텍스트 바(`🇨🇦 Toronto ▾`)가 부를 인터페이스도 이것 하나다: **`selectTrip(tripId: string): void`**.

### 1-B. 캐시를 (유저, 트립)로 쪼개고 outbox를 캐시 밖으로 뺀다

**before**
```
trail-cache-v4:<userId>   → { state, outbox }      // 트립 1개 + 그 트립에 묶인 큐
trail-cache-v4:last       → <userId>
```

**after**
```
trail-cache-v5:<userId>:trip:<tripId>  → { v, userId, tripId, state, savedAt }
trail-cache-v5:<userId>:index          → { trips: TripSummary[], activeTripId, savedAt }   // My Trips를 오프라인에서 그리는 최소 셋
trail-cache-v5:<userId>:outbox         → OutboxOp[]                                        // 트립과 무관. 유저당 하나
trail-cache-v5:last                    → { userId, tripId }
```

- `CACHE_VERSION` 4 → 5. 구버전 엔트리는 **마이그레이션하지 않고 버린다** (`readCache`가 `v !== 5`면 null). 캐시는 캐시다.
- **outbox 분리가 이 항목의 핵심이다.** 지금 구조에서 트립 전환은 미전송 쓰기 유실이다. 오프라인이 정상 경로인 앱에서 이건 "조용히 성공한 척"의 최악 형태.
- `dropOtherCaches(storage, userId)`는 **다른 유저의** 키만 지운다. 같은 유저의 다른 트립 캐시는 남긴다 (지금은 `!== keep`이라 전부 지운다 — 같이 고친다).
- `flushOutbox` 후의 `refresh(this.snapshot.state?.activeTripId)`는 `refresh(this.snapshot.tripId)`로. 지금 코드는 서버가 고른 트립으로 되돌린다.
- 용량: `state`는 트립 하나당 수십 KB. 30트립 캐시는 quota를 친다 → **LRU 3개**만 유지하고 나머지는 `savedAt` 순으로 버린다. `writeCache`가 쓰기 직후 정리.

### 1-C. `(app)`을 "트립 필수"에서 "트립 스코프"로 나눈다

**before** — `AppProvider`가 `!trip`이면 부트 화면 또는 `/onboarding` replace. `useApp(): AppReady`(trip non-null)가 전 화면의 계약.

**after** — 게이트를 provider에서 **경계 컴포넌트**로 내린다.

- `useApp(): AppValue` — `trip`이 `Trip | null`. Home · My Trips만 쓴다.
- `useTrip(): AppReady` — 기존 계약 그대로. `trip`이 null이면 throw. 기존 9개 화면은 `useApp` → `useTrip` 개명 한 줄씩.
- `<TripGate>` — `/trail/*`, `/bags/*`, `/ask/*` 레이아웃이 감싼다. 트립이 없으면 부트 화면 + `/trips`로 보낸다. 지금의 `/onboarding` replace는 **트립이 0개일 때만** (계정 첫 진입).
- `app/(app)/layout.tsx`의 서버 게이트(`needsOnboarding`)는 그대로 둔다. 이건 "계정에 트립이 0개"라 여전히 참이다.

`AppValue`/`AppReady` 타입은 `landing.ts`가 import한다 (G2 소관 파일) → **`AppValue`의 export 이름과 `transfer`/`bought` 필드는 건드리지 않는다.** `staleForTab(app: Pick<AppValue,"transfer"|"bought">)`가 계속 컴파일되게 유지하는 것이 계약.

### 1-D. 상태 전이를 서버가 소유한다 (→ 0021)

**before** — `planning`으로 만들고 아무도 바꾸지 않는다. `active`/`past`는 타입에만 존재한다.

**after** — `trips.status`는 **`start_date` · `end_date` · `trips.timezone` · 서버 시각의 함수**다. 브라우저는 UPDATE 권한 자체가 없다. `archived`만 사람이 정한다.

```
start_date is null                       → planning
today(tz) <  start_date                  → planning
start_date <= today(tz) <= coalesce(end_date, start_date) → active
today(tz) >  end_date                    → past
status = 'archived'                      → 그대로 (파생하지 않는다)
```

두 경로로 적용한다:
1. `trips` BEFORE INSERT/UPDATE 트리거 — 날짜/타임존이 바뀔 때. **트리거가 `NEW.status`에 쓰는 것은 컬럼 GRANT의 적용을 받지 않는다.** 그래서 service key 없이 동작한다 (`POST /api/trips`가 service key 없이 살아야 한다는 0013의 원칙 유지).
2. `public.reconcile_trip_statuses()` — 아무 쓰기 없이 시간만 흐른 경우. `GET /api/state`가 매번 부른다. `security definer`, 인자 없음, 내부에서 `auth.uid()`로만 스코프.

---

## 2. 마이그레이션 0021 — `trips.timezone` · 트립 생애주기 전이

파일: `supabase/migrations/0021_trip_lifecycle.sql`

> **번호 재배정 (조정자 통보).** `0020`는 G0가 가져간다. 근거: 권한 잠금은 `lib/state/*`를 건드리지 않아 §4 계약과 충돌하지 않고, **G3가 `saveTrip({status})`를 만든 뒤에 잠그면 G3의 작업을 부순다.** 그래서 잠금이 먼저다.
> G3는 `0021`(생애주기) · `0022`(지출 뷰) · `0023`(카탈로그)를 연다.

### G0의 `0020`에 있는 것 — 이 파일에 다시 쓰지 않는다

| 항목 | 소유 |
| --- | --- |
| `trips` 컬럼 단위 GRANT 잠금 (`status`·`currency`·`hotel_verified_at`·`hotel_id`) | **G0 / 0020** |
| `DELETE` revoke (G3가 찾은 원장 cascade 구멍) | **G0 / 0020** |
| 호텔 변경 시 `hotel_verified_at` 해제 트리거 | **G0 / 0020** |
| 구매가 존재하면 통화 동결 트리거 | **G0 / 0020** |

G3는 이 넷을 **전제로 삼는다.** 0015는 0020 없이는 의미가 없다 (파일 상단에 `-- requires 0020` 주석).

`timezone` 컬럼의 UPDATE 권한이 필요하다는 것 하나만 G0에 요청한다 — 도시처럼 여행자가 정하는 사실이고, 아래 검증 트리거가 유효성을 본다. G0가 이것까지 잠그면 `PATCH /api/trips/[id]`가 도시 변경 시 zone을 못 고쳐 굳는다. **이 한 줄은 착수 전에 G0와 확정한다.**

**같은 PR에 프런트 변경이 함께 들어간다** — `PATCH /api/trips/[id]`, `saveTrip` 재배선, `lib/trips/input.ts`의 `parseTripPatch`. G0의 0014가 `revoke update on trips`를 먼저 넣으므로 **그 사이 저장 버튼이 죽는 창이 생긴다.** 0020 머지 → 0021 PR을 같은 스프린트 안에서 곧바로 이어 붙인다.

### SQL 개요

```sql
-- requires 0020 (G0): trips 컬럼 GRANT 잠금 · DELETE revoke · 호텔/통화 트리거

-- ── 타임존: "오늘"이 서버/클라/여행지에서 갈리지 않게 하는 유일한 방법
alter table public.trips add column if not exists timezone text not null default 'UTC';

-- 도시로 역채움. 추측하지 않는다 — 0011이 이미 아는 도시만 채운다.
update public.trips t set timezone = s.timezone
from (select city, min(timezone) as timezone from public.stores where timezone is not null group by city) s
where s.city = t.city and t.timezone = 'UTC';

-- 유효성은 check로 못 건다(불변 함수가 아니다). 트리거로 건다.
create or replace function public.validate_trip_timezone()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform now() at time zone new.timezone;   -- 잘못된 zone이면 여기서 22023
  return new;
exception when others then
  raise exception 'unknown timezone %', new.timezone using errcode = '22023';
end $$;

-- ── 상태를 계산하는 한 곳
create or replace function public.trip_status_for(p_start date, p_end date, p_zone text, p_current public.trip_status)
returns public.trip_status language plpgsql stable security definer set search_path = '' as $$
declare d date := (now() at time zone coalesce(p_zone,'UTC'))::date;
begin
  if p_current = 'archived' then return 'archived'; end if;
  if p_start is null then return 'planning'; end if;
  if d < p_start then return 'planning'; end if;
  if d <= coalesce(p_end, p_start) then return 'active'; end if;
  return 'past';
end $$;

create or replace function public.apply_trip_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.status := public.trip_status_for(new.start_date, new.end_date, new.timezone, coalesce(old.status, new.status));
  return new;
end $$;
-- 호텔 해제는 G0의 0020 트리거가 한다. 여기서 다시 쓰면 두 트리거가 같은 컬럼을 다툰다.

create trigger trips_validate_tz  before insert or update of timezone on public.trips for each row execute function public.validate_trip_timezone();
create trigger trips_apply_status before insert or update on public.trips for each row execute function public.apply_trip_status();

-- ── 쓰기 없이 시간만 흐른 경우
create or replace function public.reconcile_trip_statuses()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.trips set status = public.trip_status_for(start_date, end_date, timezone, status), updated_at = now()
  where user_id = (select auth.uid()) and status <> 'archived'
    and status is distinct from public.trip_status_for(start_date, end_date, timezone, status);
  get diagnostics n = row_count; return n;
end $$;

-- ── 아카이브는 삭제가 아니다 (0014가 DELETE를 막았으므로 이게 유일한 출구)
create or replace function public.archive_trip(p_trip_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.trips set status = 'archived', updated_at = now()
  where id = p_trip_id and user_id = (select auth.uid());
  if not found then raise exception 'trip not found' using errcode = '42501'; end if;
end $$;

revoke execute on function public.trip_status_for(date,date,text,public.trip_status) from public, anon, authenticated;
revoke execute on function public.apply_trip_status()      from public, anon, authenticated;
revoke execute on function public.validate_trip_timezone() from public, anon, authenticated;
grant  execute on function public.reconcile_trip_statuses() to authenticated;
grant  execute on function public.archive_trip(uuid)        to authenticated;
```

### 트리거가 G0의 GRANT 잠금을 통과하는 이유

0014가 `revoke update (status)`를 걸어도 **BEFORE 트리거가 `NEW.status`에 쓰는 것은 컬럼 권한 검사를 받지 않는다.** 권한은 문장의 대상 컬럼에만 걸린다. 덕분에 전이가 service key 없이 돌고, "onboarding은 service key를 요구하지 않는다"는 0013의 원칙이 유지된다. 쓰기 없이 시간만 흐른 경우만 `reconcile_trip_statuses()`가 맡는다.

### 인수인계 1 — `trips` INSERT는 열린 채로 넘어온다 (G3 소관)

G0가 UPDATE/DELETE는 잠그되 **INSERT는 열어 둔다** (`POST /api/trips`·`/api/import`가 사용자 클라이언트로 쓴다). 그래서 브라우저가 supabase-js로 `trips` 행을 직접 만들 수 있고, **지갑(플랜) 없는 여행이 생긴다.** 0013이 `plans_first_draft_insert`로 플랜 쪽은 막았지만 트립 쪽은 열려 있다.

지갑 없는 트립은 이 앱에서 조용한 고장이다 — `computeWallet(null, …)`이 `EMPTY_WALLET`을 돌려주므로 화면은 `CAD $0 budget`을 멀쩡히 그린다. **0으로 그려지는 것이 실패로 보이지 않는 것이 문제다.**

0015에서 두 겹으로 막는다.

```sql
-- 1) 서버 라우트가 플랜을 이어 쓰기 전까지 트립은 '임시'다.
alter table public.trips add column if not exists provisional_until timestamptz;

create or replace function public.mark_provisional_trip()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.provisional_until is null then new.provisional_until := now() + interval '15 minutes'; end if;
  return new;
end $$;
create trigger trips_mark_provisional before insert on public.trips
  for each row execute function public.mark_provisional_trip();

-- 2) plans 첫 행이 들어오면 임시 딱지를 뗀다.
create or replace function public.clear_provisional_trip()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.trips set provisional_until = null where id = new.trip_id and provisional_until is not null;
  return new;
end $$;
create trigger plans_clear_provisional after insert on public.plans
  for each row execute function public.clear_provisional_trip();
```

- `provisional_until > now()`인 행은 **열린 트립 후보에서 제외**한다 (`loadTrailState`의 폴백 · 컨텍스트 바 · Home). 15분은 `POST /api/trips`의 트립+플랜 두 INSERT 사이 창이다
- 만료됐는데도 플랜이 없으면 `My Trips`에 `Incomplete — no budget` 카드로 **보여 준다. 숨기지 않는다.** 지갑 없는 여행이 만들어졌다는 사실 자체가 사용자가 알아야 할 상태다
- 카드의 액션 둘: `Finish setting up` → `/onboarding?trip=<id>` (기존 플랜 삽입 경로 재사용), 그리고 `archive_trip()`
- `POST /api/trips`의 "플랜 실패 시 트립 삭제" 보상 로직은 0014의 DELETE revoke에 걸린다. **definer 함수 `discard_provisional_trip(uuid)`로 대체**하고, `provisional_until`이 살아 있는 행만 지우게 한다. 착수 시 G0와 확인할 두 번째 항목

### 인수인계 2 — `purchases.currency`와 통화 동결 트리거

`app/api/purchases/[stopId]/route.ts:55`가 클라이언트가 보낸 `currency`를 그대로 저장한다. G0가 다통화 작업(E)에서 **트립 행의 통화로 덮어쓰도록** 고친다. 상호작용 확인 항목 셋:

1. G0의 동결 트리거는 "구매가 존재하면 `trips.currency` 변경 거부"다. `PATCH /api/trips/[id]`는 그보다 앞서 **통화 필드 자체를 400 `currency_locked`로 거절**하므로 트리거에 도달하지 않는다. 트리거는 supabase-js 직접 호출에 대한 두 번째 방어선이다
2. **동결 조건은 "구매 존재"가 아니라 "플랜 존재"여야 한다 → G0에 보고.** 구매가 0건이어도 `plans.*_cents`는 이미 그 통화의 minor unit으로 쓰여 있다 (`POST /api/trips`가 `toMinorUnits`로 계산). 구매 0건인 트립의 통화를 바꾸면 지갑이 조용히 100배 틀린다. G3의 `currency_locked`는 이 차이와 무관하게 항상 거절하므로 **프런트 경로는 어느 쪽이든 안전하다**
3. `purchases.currency`가 트립 통화로 강제되어야 `computeWallet`이 참이 된다 — 지금 그 함수는 통화를 보지 않고 cents를 더한다. G0 수정 후 `tests/trail-wallet.test.ts`에 "혼합 통화 구매는 존재할 수 없다"를 회귀로 추가

### `PATCH /api/trips/[id]` (신규, ~55줄)

- `parseTripPatch(body)` — 전 필드 optional, `parseTripCreate`와 정규화 규칙 공유
- `currency` → **400 `currency_locked`**. 고치지 않고 거절한다. 통화 변경의 정직한 경로는 새 트립이다. FX는 G0의 것이고 G3는 경로만 닫는다
- `status` → 400 `status_is_derived`
- `hotel_verified_at`·`hotel_id` → 400 `server_owned_field`
- `city`가 바뀌면 서버가 `stores`에서 timezone을 다시 해석해 같이 쓴다 (예약금을 서버가 견적하는 것과 같은 이유)
- 세션 클라이언트로 UPDATE → RLS가 행을, 0014의 컬럼 GRANT가 컬럼을 증명한다. service key 불필요
- `DELETE /api/trips/[id]` → `rpc("archive_trip")`. 진짜 삭제는 없다
- outbox에 넣지 않는다 (현행 `saveTrip` 주석의 판단 유지: 지하에서 바꾼 호텔은 "저장된 척"보다 "실패"가 낫다). 실패는 `setFailure` → sync-chip

### `get_advisors` 확인 항목 (0021)

- `function_search_path_mutable` — 신규 함수 7개 전부 `set search_path = ''` + 스키마 한정. 0008이 같은 지적을 이미 받았다
- security definer 함수가 `anon`에 노출되지 않았는지 (`reconcile_trip_statuses`·`archive_trip`·`discard_provisional_trip`만 `authenticated`)
- `reconcile_trip_statuses`가 **인자로 user id를 받지 않는지** — 받는 순간 크로스테넌트 쓰기다
- `auth_rls_initplan` — 신규/수정 정책의 `auth.uid()`는 `(select auth.uid())`로
- **0014와의 트리거 충돌** — `trips`에 BEFORE UPDATE 트리거가 둘(G0 호텔/통화, G3 상태)이 된다. 실행 순서는 이름 알파벳순이고 서로 다른 컬럼을 만지므로 무해하지만 `pg_trigger`를 실제로 확인한다
- 0014의 컬럼 GRANT 목록에 `timezone`과 `provisional_until`이 어떻게 들어갔는지 대조 (`provisional_until`은 **서버 전용**이어야 한다)
- `trips_user_idx (user_id, status, start_date desc)`가 3구획 쿼리를 커버하는지 (커버한다. 새 인덱스 불필요)
- 0013 `plans_first_draft_insert`가 여전히 통과하는지 — `plans_clear_provisional` AFTER 트리거가 onboarding INSERT를 막지 않았는지 회귀 확인

---

## 3. 마이그레이션 0022 — 과거 여행 지출 집계

파일: `supabase/migrations/0022_trip_spend_summary.sql`

### `trip_insights` 판정: **되살리지 않고 드롭한다**

근거 셋.
1. 컬럼이 데이터가 아니라 **화면**이다 — `insight text`, `accent text default 'peach'`. 프레젠테이션을 DB에 저장한 화석이다.
2. 0002가 `authenticated`에 select/insert/update/delete를 전부 준다. 즉 **브라우저가 "¥41,800 썼다"를 purchases 없이 쓸 수 있다.** 파생값을 상태로 만들지 말라는 규칙의 정확한 위반이고, 지금은 아무도 안 쓰니 무해하지만 되살리면 그 순간 유해해진다.
3. 참조 0곳, 행 0개, FK 유입 없음. 드롭 비용이 0이다.

대체는 **뷰**. `security_invoker = true` 필수.

```sql
drop table if exists public.trip_insights;   -- 참조 0, 행 0. 정책은 함께 사라진다

create view public.trip_spend_summary with (security_invoker = true) as
select
  t.id                                                                          as trip_id,
  t.user_id,
  t.currency,
  coalesce(count(p.id) filter (where p.voided_at is null), 0)::integer           as purchase_count,
  coalesce(sum(p.actual_price_cents) filter (where p.voided_at is null), 0)::integer as spent_cents,
  coalesce(sum(p.bags)               filter (where p.voided_at is null), 0)::integer as bag_count,
  max(p.recorded_at) filter (where p.voided_at is null)                          as last_purchase_at,
  pl.total_cents                                                                 as budget_cents,
  pl.status                                                                      as plan_status
from public.trips t
left join public.purchases p on p.trip_id = t.id
left join lateral (
  select total_cents, status from public.plans
  where trip_id = t.id and status <> 'superseded'
  order by (status = 'approved') desc, version desc limit 1
) pl on true
group by t.id, t.user_id, t.currency, pl.total_cents, pl.status;

grant select on public.trip_spend_summary to authenticated;
```

### 왜 `security_invoker = true`가 협상 불가인가

뷰는 RLS를 갖지 않는다. 기반 테이블의 RLS가 **누구로 평가되느냐**만 있다. invoker가 아니면 뷰는 소유자(postgres, BYPASSRLS) 권한으로 돌고, `grant select ... to authenticated` 한 줄이 **전 여행자의 지출을 전원에게 여는 구멍**이 된다. `trips`/`purchases`가 `force row level security`인 것도 이때는 소용없다. 어드바이저의 `security_definer_view` 항목이 정확히 이걸 잡는다.

### 읽는 방식: 임베드하지 않고 별도 쿼리

PostgREST가 `trips`에서 뷰로 임베드하려면 관계 추론이 필요하고, 이 스키마는 이미 복합 FK 때문에 PGRST201을 피하려 제약명을 전부 명시하고 있다. 뷰를 그 안에 끌어들이면 힌트를 붙일 대상이 없다.

→ `loadTrailState`에 **4번째 병렬 쿼리**를 추가한다.
```
db.from("trip_spend_summary").select("trip_id, purchase_count, spent_cents, bag_count, budget_cents, plan_status").eq("user_id", userId)
```
`isMissingSchema(error)`면 `spentCents: null`로 진행한다 (기존 `hasT5Columns` 패턴 재사용). **null은 0이 아니다** — 카드는 `CAD $0 spent`가 아니라 `Purchases not counted yet`을 쓴다. `allocationCents`가 이미 쓰는 규칙과 같다.

또 하나: 기존 `TRIP_LIST_SELECT`의 `purchases(id)`는 **뺀다.** 30트립 × N구매 id를 세려고 끌어오던 것이 뷰의 스칼라 하나로 대체된다. 핫 패스가 오히려 가벼워진다.

`spent_cents`의 집계 규칙(`voided_at is null`)은 `shape.ts:computeWallet`의 `live()`와 **문자 단위로 같아야 한다.** 테스트로 못 박는다: `tests/trail-trips.test.ts`에 "`shapeTripSummary`는 서버가 준 숫자를 그대로 쓰고 스스로 합산하지 않는다"를 추가.

### `get_advisors` (0022)

- **`security_definer_view` — 결과가 비어 있어야 한다.** 이 마이그레이션의 유일한 통과 조건
- `rls_disabled_in_public` — 뷰가 뜨는 건 정상. 기반 테이블 RLS + invoker가 답이라는 것을 확인만
- 0002의 테이블 배열에서 `trip_insights` 제거 (드롭 후 0002를 새로 돌리면 실패한다). 0002는 수정하지 않고 **0022 상단 주석에 "0002의 배열은 역사다"**로 남긴다 — 마이그레이션은 append-only
- `unused_index` — `purchases_trip_idx`가 뷰에 쓰이는지 확인 (쓰인다)

---

## 4. 마이그레이션 0023 — 추천 / 매장 피드

파일: `supabase/migrations/0023_city_catalog.sql`

`products`는 존재하는데 **시드 0행 · 조회 코드 0줄 · 거리 계산 수단 없음.** 세 가지를 동시에 채운다.

### 스키마 보강

```sql
alter table public.products
  add column if not exists subtitle          text    not null default '',      -- "Toronto prints"
  add column if not exists sort_order        smallint not null default 100,
  add column if not exists active            boolean not null default true,
  add column if not exists price_is_estimate boolean not null default true,    -- §5 참조
  add column if not exists source_note       text    not null default '';      -- Sample 칩이 설명 가능해진다

create unique index if not exists products_city_name_uidx on public.products (city, name);  -- 재시드 멱등
create index if not exists products_store_idx on public.products (store_id);                -- 어드바이저: unindexed FK
create index if not exists products_feed_idx  on public.products (city, sort_order) where active;

-- 실제 상호에 파트너 표시를 다는 것을 데이터가 막는다 (§5-3)
alter table public.stores add column if not exists partner_agreement_ref text;
update public.stores set partner_agreement_ref = 'sample:no-agreement' where is_partner_point and partner_agreement_ref is null;
alter table public.stores add constraint stores_partner_needs_agreement
  check (not is_partner_point or partner_agreement_ref is not null);
```

권한은 0002 그대로: `grant select on public.stores, public.products to authenticated` + `for select using (true)`. **INSERT/UPDATE는 주지 않는다.** 카탈로그는 읽기 전용이다.

### 거리 계산 — PostGIS를 켜지 않는다

도시당 수십 행이다. 인덱스가 필요한 규모가 아니고, 확장 하나를 켜는 순간 어드바이저 · 백업 · 로컬 개발 셋업이 전부 무거워진다.

**위치는 서버로 보내지 않는다.** `GET /api/recommendations?city=Toronto`는 도시명만 받고, `stores.lat/lng`를 그대로 돌려준다. 브라우저가 haversine으로 거리를 내고 80 m/min으로 도보 분을 만든다.

> 좌표가 기기를 떠나지 않으면 저장할 것도, 지울 것도, 유출될 것도 없다.
> `memory_constraints`가 동의를 행 단위로 받는 것과 같은 원칙이다.

- `lib/discovery/distance.ts` — `haversineMeters`, `walkMinutes` (순수 함수, 테스트 가능)
- `lib/discovery/nearby.ts` — `useNearby()`. `navigator.geolocation`을 **명시적 탭 이후에만** 호출하고, 좌표는 메모리에만 두고, `localStorage`·outbox·네트워크 어디에도 쓰지 않는다. SSR에서는 null
- 위치 거부/미요청 시 정렬은 `sort_order`. **"12 min walk"를 만들어내지 않는다** — 분이 없으면 지역명을 쓴다

### `GET /api/recommendations` (신규, ~45줄)

```
?city=<string>&limit=<1..24>   → { city, source, products: [{ id, name, subtitle, category, priceCents, priceIsEstimate, currency, handling, weightGrams, source, sourceNote, store: { id, name, area, address, lat, lng } }] }
```
- 세션 필수 (`getTraveler()`), 동일 출처. `city`가 없으면 열린 트립의 도시를 서버가 읽는다 — 클라이언트가 임의 도시를 조회할 이유가 없다
- `Cache-Control: private, max-age=300`. 공개 카탈로그이므로 캐시가 안전한 유일한 라우트다
- **서비스워커 주의**: 이 응답만 별도 캐시 이름(`trail-catalog-v1`)에 넣고, 기본 fetch 핸들러가 `/api/*`를 통째로 캐시하지 않게 한다. 세션 오염 금지 (§PWA)
- `source`는 행의 `products.source`를 그대로 싣는다. 화면은 **카드마다** `sourceChip(row.source)`를 붙인다. 섹션 단위 "이 영역은 샘플"은 §1-1 위반

### `get_advisors` (0023)

- `unindexed_foreign_keys` — `products.store_id` (위에서 해결)
- `multiple_permissive_policies` — `products_read` / `stores_read` 각 1개 유지, 새 정책 추가하지 않았는지
- `authenticated`에 `products`/`stores` INSERT·UPDATE 권한이 새지 않았는지
- `unused_index` — `products_city_idx (city, category)`가 `products_feed_idx`와 겹치는지 확인. 겹치면 남기고 근거를 주석으로 (카테고리 필터가 `Made for {city}`에서 쓰인다)
- `rls_enabled_no_policy` — 없어야 정상

---

## 5. 카탈로그 시드의 출처를 어떻게 정직하게 할 것인가

**결정: 매장 신원은 실명 · 실주소 · 실좌표. 상품명은 일반화. 가격은 추정 표기. 파트너 표시는 실명에 붙이지 않는다.**

### 근거

기존 0011이 이미 실명을 쓰고 있다 — `Blue Banana Market / 250 Augusta Ave`, `Spacing Store / 401 Richmond St W`. 와이어프레임도 `Kid Icarus`를 쓴다. 여기서 방향을 뒤집으면 seal tag · delivery_pricing 테스트가 참조하는 행이 고아가 된다.

**실명을 쓰는 이유**: 이 기능의 본질이 "실제로 걸어갈 수 있는 7분"이다. 가공 상호는 검증 불가능하고, 여행자가 `Toronto Local Goods`를 찾아가면 아무것도 없다. **아무것도 없는 곳으로 보내는 것이 실명을 쓰는 것보다 큰 거짓말이다.** 상호·주소·좌표는 공개된 사실이다.

**그럼에도 실명에 붙이면 안 되는 것 셋**:

| 붙이지 않는 것 | 왜 | 어떻게 막는가 |
| --- | --- | --- |
| 특정 상품 · SKU | 재고 주장이다. 우리는 그 가게 재고를 모른다 | 상품명을 `Ontario-made ceramic mug` 수준으로 일반화. 프레임도 이미 그렇게 쓴다 (`Toronto-designed goods`) |
| 확정 가격 | 그 가게가 부르지 않은 값을 그 가게 이름 옆에 적는 것 | `price_is_estimate = true` → 카드는 `≈ CAD $58`. 컬럼이라 라벨이 데이터와 갈라지지 않는다 |
| `is_partner_point = true` | **제3자에 대한 주장이다.** "Sample"은 "샘플 데이터"로 읽히지 "이 업체는 아무것도 동의한 적 없다"로 읽히지 않는다 | `stores.partner_agreement_ref` + check 제약. 0011의 3행은 `'sample:no-agreement'`로 역채움 |

`source='sample'`은 전 행에 유지한다. 추가로 `source_note`에 출처와 한계를 적는다:
`'Public storefront listing, Aug 2026. Price estimated by Trail; not quoted by the store.'`
이 문장이 `Sample` 칩의 `aria-description`이 된다 — 칩이 장식이 아니라 **설명 가능한** 표시가 된다.

### 시드 규모

토론토 **16행 / 5매장**, 전부 `source='sample'`, 전부 일반화된 상품명, 전부 추정 가격. 매장은 실존 + 공개 주소 (Blue Banana Market · Spacing Store · Kid Icarus · Drake General Store · Bergo Designs). 카테고리는 `Made for {city}`의 4행(`POPULAR LOCAL GIFTS`)에 대응: 디자인 굿즈 / 도예 / 식품 / 아트·프린트.

`photo_url`은 **전부 null.** 우리에겐 라이선스된 사진이 없다. 프레임의 사진 자리는 `stopMark()`와 같은 이니셜 타일로 그린다. 스톡 사진을 실제 매장 이름 밑에 놓는 것은 그 매장에 대한 또 하나의 주장이다.

### G5에 넘기는 한 줄 계약

`partner_agreement_ref`가 `'sample:'`로 시작하면 드롭오프 화면의 파트너 카드는 `Sample partner · no agreement in place`를 표기한다. 표시는 G5, 컬럼과 역채움은 G3(0023).

---

## 6. `lib/state/*` 추가 필드 표

### `lib/state/types.ts`

| 타입 | 추가 필드 | 타입 | 출처 | 왜 |
| --- | --- | --- | --- | --- |
| `Trip` | `timezone` | `string` | 0021 `trips.timezone` | `Day n of m`과 인사말이 기기 시계로 갈리지 않게 |
| `TripSummary` | `hotelName` | `string` | `trips.hotel_name` | 카드의 `The Annex Hotel` |
| `TripSummary` | `timezone` | `string` | 0021 | 리스트 카드도 `Day 2 of 4`를 쓴다 |
| `TripSummary` | `budgetCents` | `number \| null` | 0022 뷰 `budget_cents` | null = 플랜 없음 ≠ 0 |
| `TripSummary` | `spentCents` | `number \| null` | 0022 뷰 | **null = 아직 집계 못 함 ≠ $0** |
| `TripSummary` | `bagCount` | `number \| null` | 0022 뷰 | |
| `TripSummary` | `purchaseCount` | `number \| null` (기존 `number`) | 0022 뷰 | 뷰 부재 시 null. 타입이 넓어진다 |
| `TripSummary` | `provisionalUntil` | `string \| null` | 0021 | 지갑 없는 트립을 **드러내는** 신호. null이면 정상 |
| `Trip` | `provisionalUntil` | `string \| null` | 0021 | 열린 트립이 임시면 화면이 그렇게 말한다 |
| `TrailState` | `spendByTrip` | — | — | **추가하지 않는다.** `TripSummary` 안에 이미 있다 (파생값을 두 번 두지 않는다) |
| 신규 | `Recommendation` | `{ id; name; subtitle; category; priceCents; priceIsEstimate; currency; handling; weightGrams: number\|null; source: DataSource; sourceNote: string; store: RecommendedStore \| null }` | 0023 | |
| 신규 | `RecommendedStore` | `{ id; name; area; address; lat: number\|null; lng: number\|null }` | 0023 | 좌표는 **응답에만** 있고 state에 저장하지 않는다 |
| 신규 | `MemoryConstraint` | `{ id; kind: "avoid"\|"prefer"; value: string; sourceTripId: string\|null; consentedAt: string }` | 기존 `memory_constraints` | `TRAIL REMEMBERS` |
| 신규 | `TripSection` | `"current" \| "upcoming" \| "past"` | 파생 | `status`의 표시명 매핑 |

### `lib/state/rows.ts`

| 타입 | 변경 |
| --- | --- |
| `TripRow` | `+ timezone: string`, `+ provisional_until: string \| null` |
| `TripListRow` | `+ hotel_name: string`, `+ timezone: string`, `+ provisional_until: string \| null`; `plans` → `{ status; total_cents }[]`; **`purchases` 제거** |
| 신규 `TripSpendRow` | `{ trip_id; purchase_count; spent_cents; bag_count; budget_cents: number\|null; plan_status: PlanStatus\|null }` |
| 신규 `ProductRow` | 0023 컬럼 + 임베드된 `stores` |

### `lib/state/queries.ts`

| 상수 | 변경 |
| --- | --- |
| `tripSelect(t5)` | `+ timezone,` (0021 미적용 대비 `t6` 플래그로 감싼다 — `hasT5Columns`와 같은 패턴, 이름은 `hasTripTimezone`) |
| `TRIP_LIST_SELECT` | `+ hotel_name, timezone, provisional_until`; `plans(status, total_cents)`; `purchases(id)` 삭제 |
| 신규 `TRIP_SPEND_SELECT` | `"trip_id, purchase_count, spent_cents, bag_count, budget_cents, plan_status"` |
| 신규 `RECOMMENDATION_SELECT` | `products` + `store:stores!products_store_id_fkey(...)` — FK 제약명 명시 (PGRST201 회피 규칙) |
| `TRIP_LIST_WINDOW` | 30 유지 |

### `lib/state/shape.ts`

| 함수 | 변경 |
| --- | --- |
| `shapeTrip` | `+ timezone: row.timezone ?? "UTC"`, `+ provisionalUntil` |
| `shapeTripSummary(row)` | → `shapeTripSummary(row, spend?: TripSpendRow)`. **합산하지 않는다** — 뷰의 값을 옮기기만 한다. 뷰가 없으면 전부 null |
| `shapeState` | `input.spend: TripSpendRow[]` 추가, `trip_id`로 매칭 |
| 신규 `shapeRecommendation(row)` | `source`를 그대로 옮긴다 (라벨을 여기서 만들지 않는다) |
| `computeWallet` | **변경 없음.** 열린 트립의 지갑은 계속 원본에서 계산한다 |

### `lib/state/load.ts`

`loadTrailState`의 "active 없으면 최근 updated_at" 폴백은 **`provisional_until > now()`인 행을 건너뛴다** — 반쪽 트립이 열린 트립이 되면 지갑이 0으로 그려진다.

`Promise.all`이 3 → 4. 네 번째는 `trip_spend_summary`, 실패해도 `isMissingSchema`면 빈 배열로 진행. 그리고 맨 앞에 `db.rpc("reconcile_trip_statuses")` — 실패는 무시한다(0021 미적용 환경). `loadTrailState`의 "active 없으면 최근 updated_at" 폴백은 **남긴다**: 0021 이후에도 날짜가 없는 트립은 영영 `planning`이다.

---

## 7. 화면별 파일 계획

### 신규

| 파일 | 내용 | ~줄 |
| --- | --- | --- |
| `app/(app)/home/page.tsx` | Home 대시보드 (§8) | 70 |
| `app/home.css` | Home 전용. 토큰만 사용, `:root` 미수정 | 40 |
| `app/(app)/trips/[id]/edit/page.tsx` | 현 `TripForm`을 옮기고 `PATCH`로 배선 | 50 |
| `app/(app)/trail/made-for/page.tsx` | `Made for {city}` + `TRAIL REMEMBERS` | 60 |
| `app/trips.css` · `app/discovery.css` | 신규 화면 CSS 격리 (§4 계약) | 30 · 35 |
| `components/trip-card.tsx` | 3구획 공용 카드. `Day n of m` · budget · spent | 28 |
| `components/product-card.tsx` | 행의 `source`를 읽어 `Sample` 칩. 이니셜 타일 | 22 |
| `app/api/recommendations/route.ts` | §4 | 45 |
| `app/api/trips/[id]/route.ts` | `PATCH` (+ `DELETE` → `archive_trip` rpc) | 55 |
| `app/api/memory/route.ts` | `TRAIL REMEMBERS`의 Yes/Keep 기록 | 35 |
| `lib/trips/status.ts` | `sectionOf(status)`, `dayOfTrip(start,end,tz,now)`, `todayIn(tz)` | 25 |
| `lib/discovery/distance.ts` | haversine · walkMinutes (순수) | 20 |
| `lib/discovery/nearby.ts` | `useNearby()` — 탭 이후에만, 메모리에만 | 32 |
| `tests/trail-trip-status.test.ts` | 전이 5케이스 + DST 경계 + archived 불변 | 60 |
| `tests/trail-discovery.test.ts` | haversine 기지값, `sourceChip` 카드별 적용 | 40 |

### 리라이트

| 파일 | before → after | ~줄 |
| --- | --- | --- |
| `app/(app)/trips/page.tsx` | 단일 트립 편집 화면(62줄) → `My Trips` 3구획 리스트 + `+` + `Incomplete — no budget` 카드 | 66 |
| `app/(app)/trips/past/page.tsx` | 28줄 화면 → `redirect("/trips")` 3줄. **sessionStorage에 `/trips/past`가 남아 있을 수 있다**(`staleForTab`) — 404 보험 | 4 |

### 수정

| 파일 | 변경 | ~증감 |
| --- | --- | --- |
| `app/(app)/app-state.tsx` | `selectTrip` 노출 · `saveTrip` → `PATCH` · `trip` nullable · `useApp`/`useTrip` 분리 · `AppProvider` 리다이렉트 완화 | +40 / −18 |
| `lib/state/store.ts` | 캐시 키 (user, trip) · outbox 분리 · `select()` · LRU 3 · `dropOtherCaches` 수정 · v5 | +45 |
| `lib/state/use-trail-state.ts` | `tripId` 인자 제거, `selectTrip` 반환 | +6 / −4 |
| `lib/state/{types,rows,queries,shape,load}.ts` | §6 표 | +55 |
| `lib/trips/input.ts` | `parseTripPatch` | +45 |
| `app/(app)/layout.tsx` | 게이트는 "트립 0개"에서만 | +2 |
| `app/(app)/trail/page.tsx` | `Made for {city}` 카드 링크 추가 (프레임 -2) | +3 |
| 기존 9개 화면 | `useApp()` → `useTrip()` 한 줄씩 | +0 |
| `supabase/migrations/0021·0022·0023` | §2·3·4. **`0020`는 G0** | ~360 |

**손대지 않는 파일**: `app/(app)/shell.tsx`, `app/(app)/landing.ts` (G2), `app/globals.css`의 `:root` (G1), `app/(app)/blocked.tsx` (§1-2).

---

## 8. Home 대시보드 — 프레임에서 옮긴 것과 바꾼 것

`docs/figma/Home.png` + `Mobile app with accessibility-15.png` · `-2.png` · `-3.png`를 직접 열어 대조했다.

| 프레임 요소 | 구현 | 데이터 출처 |
| --- | --- | --- |
| `Good morning.` | 그대로 | `trip.timezone`의 현지 시각. 트립이 없으면 기기 zone |
| `Ready to explore {city}?` | 그대로 | `trip.city`. 트립 없으면 `Ready to plan your first trip?` |
| `CURRENT` 라벨 + `Plan with AI` 카드 | 그대로. 칩 `Plan` / `What to buy` / `Where to buy` | 정적 카피 |
| `Continue with Trail AI →` | 그대로 | `/ask` |
| `TORONTO Recommendations` / `Popular Souvenirs in {city}!` | 그대로 (도시명 대문자 보간) | `GET /api/recommendations` |
| 가격 칩 `$58 $65 …` | `≈ CAD $58` + 카드별 `Sample` | `products.price_cents` + `price_is_estimate` |
| `Nearby Stores` | 그대로 | 같은 응답의 `store`. 도보 분은 위치 허용 시에만 |
| (-15) `Toronto is active / Day 2 of 4 · The Annex Hotel` | 그대로 → `/trail` | `status` + `dayOfTrip()` + `hotel_name` |
| (-15) `Current Location / Toronto, Ontario` | **`Trip city / Toronto, Ontario`로 바꾼다** | 지오코딩이 없다. 트립 도시를 현재 위치라고 말하는 건 거짓이다 |
| 사진 썸네일 | 이니셜 타일 | 라이선스된 사진 없음 (§5) |

> `Current Location` → `Trip city`는 §2 카피 예외 6건에 없는 **7번째 예외 제안**이다. G3가 단독으로 확정하지 않는다 — `trail-product-lead` 승인을 받아 `FIGMA_ADOPTION.md` §2 표에 추가한다. 승인 전까지 해당 카드는 구현하지 않는다.

### 하이드레이션

`(app)` 전체가 `AppProvider` 아래 클라이언트 렌더이고 `getServerSnapshot()`이 `IDLE`을 돌려주므로 서버 HTML은 항상 부트 화면이다. 그래도 "오늘"은 한 곳에서만 만든다: `useToday(trip?.timezone)`가 `hydrated`(=`status !== "idle" && !== "loading"`) 전에는 `null`을 반환하고, `Day n of m`·인사말·`CURRENT` 구획 판정이 전부 이 하나를 읽는다. 렌더 중 `new Date()`를 부르는 코드는 만들지 않는다.

### `Made for {city}` (프레임 -3)

- `POPULAR LOCAL GIFTS` — 도시의 `products.category` distinct 4행. **이모지 대신 `components/icons.tsx` SVG** (§1-5)
- `NEAR YOUR ITINERARY` — 위치를 허용했으면 `{n} stores within {m} min`, 아니면 `{n} stores in {areas}`. **분을 만들어내지 않는다**
- `Easy to bring home` — `handling='Standard'` + `weight_grams` 기준의 실제 필터. 카피가 아니다
- `TRAIL REMEMBERS` — `memory_constraints`에 행이 있을 때만 렌더. 와이어프레임의 "Tokyo 도자기" 문장은 **데이터이지 카피가 아니다**. 행이 없으면 카드 자체가 없다
  - `memoryEnabled = false`면: 카드는 "메모리가 꺼져 있어 이 추천은 이번 여행만 본다" + `/account/memory` 링크. 피드는 필터하지 않는다. **메모리 토글이 추천을 바꾼다는 걸 사용자가 볼 수 있는 유일한 지점**이 여기다
  - `Yes — something different` → `POST /api/memory` (`kind:'avoid'`). `consented_at`은 서버 시계. 브라우저가 동의 시각을 쓰지 않는다
  - 저장 대기 중이면 카드에 `sync-chip` 규칙 적용 (§4 마지막 항목)

---

## 9. G0 · G2와의 경계선

### G0 (기반 수리) — 번호 재배정 후 확정

FIGMA_ADOPTION §3이 `trips` 컬럼 권한을 G0 범위로 적었고 G3 브리프는 그것을 0014에 넣으라고 적었다. 조정자가 **G0에 0014를 배정**해 중복이 해소됐다.

**순서가 중요하다**: 권한 잠금은 `lib/state/*`를 건드리지 않아 §4 계약과 충돌하지 않고, G3가 `saveTrip({status})`를 만든 뒤에 잠그면 G3의 작업을 부순다. **잠금이 먼저다.**

| 번호 | 소유 | 내용 |
| --- | --- | --- |
| `0020` | **G0** | `trips` 컬럼 GRANT 잠금 (`status`·`currency`·`hotel_verified_at`·`hotel_id`) · `DELETE` revoke · 호텔 변경 시 검증 해제 트리거 · 통화 동결 트리거 |
| `0021` | **G3** | `trips.timezone` + 검증 트리거 · `trip_status_for` / `apply_trip_status` / `reconcile_trip_statuses` · `archive_trip()` · 임시 트립(`provisional_until`) |
| `0022` | **G3** | `trip_insights` 드롭 + `trip_spend_summary` 뷰 (`security_invoker = true`) |
| `0023` | **G3** | 카탈로그 컬럼 · 토론토 시드 · `partner_agreement_ref` |
| `0024+` | **G2 · G5** | 재조정 대상. 착수 시 `supabase/migrations/`의 최대 번호를 먼저 확인한다 |

착수 전 G0에 확정받을 것 **셋**:

1. **`timezone`을 컬럼 GRANT 화이트리스트에 넣어 달라.** 도시처럼 여행자가 정하는 사실이고 0015의 검증 트리거가 유효성을 본다. 빠지면 `PATCH /api/trips/[id]`가 도시 변경 시 zone을 못 고쳐 굳는다
2. **`provisional_until`은 화이트리스트에서 빼 달라.** 서버 전용이어야 한다
3. **`POST /api/trips`의 보상 삭제 경로.** 0014의 DELETE revoke가 "플랜 쓰기 실패 시 트립 삭제"를 막는다 → 0015가 `discard_provisional_trip(uuid)` definer 함수로 대체한다. G0가 0014에 임시 예외를 두지 않도록 합의

G0에서 넘어온 인수인계 둘은 §2에 반영했다:
- **`trips` INSERT는 열린 채로 온다** → "지갑 없는 여행" 구멍은 G3 소관. `provisional_until` + `My Trips`의 `Incomplete — no budget` 카드로 **숨기지 않고 보여 준다**
- **`purchases/[stopId]/route.ts:55`의 클라이언트 통화** → G0가 트립 통화로 덮어쓴다. G3의 회신: **동결 조건은 "구매 존재"가 아니라 "플랜 존재"여야 한다** (구매 0건이어도 `plans.*_cents`는 이미 그 통화에 묶여 있다)

그 밖에:
- **다통화 100배 오차는 G0의 것이다.** G3는 고치지 않고 `PATCH`에서 `currency_locked`로 **거절만** 한다. 통화 편집 경로를 닫아 G0의 수정 범위를 줄여 주는 것이 G3의 기여다
- `dev-signin` 가드 · `/workflow` · 로그인 프래그먼트 · 포커스 아웃라인: G3 무관

### G2 (내비게이션 · 네이밍)

`shell.tsx`와 `landing.ts`는 **G3가 한 글자도 고치지 않는다.** 라우트만 추가한다.

G3가 먼저 내놓는 것 (G2가 여기에 붙인다):
- `selectTrip(tripId: string): void` — `useApp()` 반환값. 트립 컨텍스트 바(`🇨🇦 Toronto ▾`) 드롭다운이 부른다
- `/home` 라우트 — 존재하되 G2가 탭을 바꾸기 전까지는 링크되지 않는다
- `/trips` — 트립 없이도 렌더된다 (`useApp`, `useTrip` 아님). Trips 탭의 착지점이 트립을 요구하지 않게 된다
- `TripSummary`의 `city`·`country`·`status`·`timezone` — 컨텍스트 바가 읽을 필드

G2가 해야 하는 것:
- `TabKey`에 `"home"` 추가, `tabOf("/home") → "home"`, `tabOf("/trips") → "trips"` 유지
- `staleForTab`에 `/trips/past` 추가 여부 판단 (G3는 리다이렉트로 이미 방어)
- sessionStorage 무효화 (§0 표) — G3의 `/trips/past` 삭제가 여기에 얹힌다
- `AppValue` 타입의 `transfer`·`bought` 필드명은 G3가 유지한다 (`landing.ts`가 `Pick`으로 의존)

### G1 · G4 · G5

- **G1**: `:root` 토큰은 G1 전용. G3의 신규 CSS 4파일은 토큰을 쓰기만 한다. 기존 규칙 삭제는 G1이 마지막에
- **G4**: `memory_constraints` 행을 프롬프트에서 소비하는 것은 G4. G3는 쓰기 라우트와 카드까지
- **G5**: `stores.partner_agreement_ref`가 `'sample:'`이면 파트너 카드에 `Sample partner · no agreement in place` — 컬럼은 G3(0023), 표시는 G5

---

## 10. 검수 전 자체 확인

1. `npm run lint` · `npm test` · `npm run build`
2. 0021 적용 **전** 코드가 뜨는지 (`hasTripTimezone` 폴백), 0022 뷰 부재 시 `spentCents: null`이 `$0`으로 그려지지 않는지
3. 트립 A에서 구매를 기록 → 오프라인 → 트립 B로 전환 → 트립 A로 복귀. **큐가 살아 있고 sync-chip이 개수를 말하는지**
4. 다른 계정으로 로그인 시 이전 유저의 트립 캐시가 전부 사라지는지 (`dropOtherCaches`)
5. **0014가 적용된 상태에서** 브라우저 콘솔의 `supabase.from('trips').update({status:'active'})` → 42501 (G0의 잠금 + G3의 트리거가 함께 성립하는지)
6. 브라우저에서 `delete()` → 42501, `rpc('archive_trip')` → 성공
6-b. 브라우저가 supabase-js로 `trips`만 INSERT → `My Trips`에 `Incomplete — no budget` 카드가 뜨는지. **`CAD $0 budget`으로 그려지면 실패다**
6-c. `POST /api/trips`의 플랜 쓰기를 강제 실패시켰을 때 `discard_provisional_trip`이 반쪽 트립을 치우는지
6-d. `trips`의 BEFORE UPDATE 트리거 두 개(G0 호텔/통화 · G3 상태)가 같은 UPDATE에서 서로를 덮어쓰지 않는지
7. 추천 카드 하나의 `source`만 `live`로 바꿨을 때 그 카드만 칩이 사라지는지 (§1-1)
8. 위치 권한 거부 상태에서 "12 min walk"가 어디에도 뜨지 않는지
9. `get_advisors(security)` — `security_definer_view` 0건
10. 실 뷰포트(360 / 390 / 430px)에서 3구획 리스트와 Home 가로 스크롤 확인, 터치 타깃 44px
