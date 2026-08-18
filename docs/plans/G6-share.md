# G6 · 공유 — 실행 계획

`docs/FIGMA_ADOPTION.md` §0/§3의 `+ Invite`를 2단으로 나눠 착지시킨다.
1단계는 **읽기 전용 공유 링크**(이번 스프린트), 2단계는 **공동 편집**(별도 스프린트).

이 문서는 계획이다. 코드는 아직 한 줄도 고치지 않았다.

---

## 0. 이 기능이 실제로 유통하는 것

트립 한 행에 `hotel_name` + `hotel_address` + `start_date/end_date` + `bag_transfers.eta_start/eta_end`
+ `dropoff_cutoff_at` + `stops.planned_day/sequence` + `recipients.name`이 함께 있다.

공유 링크 하나를 그대로 뿌리면 전달되는 문장은 이렇다:

> "이 사람은 8월 15–19일 The Annex Hotel에 묵고, 오늘 17:00에는 드롭오프 카운터에,
> 18:30–19:00에는 호텔에 없다. 그리고 Mom과 Coworkers에게 줄 선물을 산다."

**선물 목록 공유가 아니라 부재 시간표 공유다.** 이 문서의 모든 기본값은 그 사실에서 나온다.
기본은 "필요한 것만 켠다"이고, 위치·시각·금액·연락처는 전부 기본 off다.

가장 위험한 필드 조합 하나만 꼽으면 **`bag_transfers.eta_start/eta_end` + `hotel_name`**이다.
이 둘은 1단계에서 토글로도 함께 열리지 않는다(§3 참조).

---

## 1. 착지 방식 요약

| | 1단계 (이번) | 2단계 (다음) |
| --- | --- | --- |
| 무엇 | 서명 토큰 공유 링크, 서버 투영 읽기 전용 | `trip_members` 기반 공동 편집 |
| 게스트 계정 | **불필요** (로그인 없이 열람) | 필요 (TRAIL 계정) |
| 기존 RLS 정책 | **0줄 변경** | 15개 테이블 재작성 |
| 복합 FK | 손대지 않음 | `user_id` 의미 전환(소유자 고정) |
| 마이그레이션 | `00NN_trip_shares.sql` (신규 테이블만 — **번호 요청 중, §1.1**) | `0027_trip_members.sql` (+ 정책·actor 파일 2개) |
| 승인 게이트 | 영향 없음 | `approve_budget_change`에 `p_actor_user_id` 추가, **owner만** |
| UI 라벨 | **`Share`** | `Share` 시트 안에 `+ Invite` 복귀 |

### 1.1 마이그레이션 번호 — 미해결, 조율 필요

확정된 원장: `0020`·`0021`·`0022` G3 / `0023` G2 / `0024`·`0019` G5 / `0025` G4 /
**`0026` = G6 2단계 (`trip_members` + `trip_invites`)**.

**1단계는 마이그레이션 없이 가는 것이 목표였지만, 그대로는 성립하지 않는다.**
이유 하나: **철회할 수 없는 링크는 배포할 수 없다.**

완전 무상태 서명 토큰이면 스키마 변경이 0이다. 대신 잘못 보낸 링크를 끊는 방법이
**전역 서명키 교체 = 발급된 모든 링크 동시 사망**뿐이다. 부재 시간표를 유통할 수 있는 링크에
"취소 버튼 없음"은 선택지가 아니다. 무상태로 갈 수 있는 다른 길도 다 막혀 있다:
`trips`에 여유 jsonb 컬럼이 없고, Auth `user_metadata`는 **사용자 본인이 쓸 수 있어서**
클라이언트가 만료를 늘릴 수 있으며, `updated_at` 파생 키는 아무 편집이나 링크를 죽인다.

필요한 것은 **신규 테이블 하나(`trip_shares`)뿐**이다. 기존 26개 테이블의 정책·grant·FK는
한 줄도 건드리지 않는다. 지시대로 이것을 `0026`에 합치지 않고 **별도 번호를 요청한다.**

| 안 | 배치 | 판정 |
| --- | --- | --- |
| **A (권장)** | 1단계 = `0026_trip_shares.sql`, 2단계 = `0027_trip_members.sql`로 한 칸 밀기 | 배포 순서와 번호 순서가 일치한다. **G6 안에서만 끝나는 조정**이라 다른 그룹에 영향 0 |
| B | 1단계 = `0026_trip_shares.sql` (2단계 `0026`은 그대로) | 두 파일은 서로 의존이 없어 신규 DB 재생(0026→0027)도 정상. 다만 프로덕션에는 `0027`가 `0026`보다 **먼저** 적용되어 `supabase db push`가 순서 경고를 낸다 |
| C | 1단계에 테이블 없음 (철회 = 전역 키 교체) | **비권장.** 링크 하나를 끊으려면 전원의 링크가 죽는다 |

**요청**: A. 코디네이터가 B를 택하면 그대로 따르고 경고를 문서화한다. C는 받지 않는다.
아래 본문은 A 기준으로 `0026_trip_shares.sql` / `0027_trip_members.sql`로 적었다 —
B로 확정되면 파일명 두 개만 맞바꾸면 되고 내용은 그대로다.

---

## 2. 1단계 — 읽기 전용 공유

### 2.1 파일 · 라우트 목록

| 경로 | 종류 | 역할 |
| --- | --- | --- |
| `supabase/migrations/0026_trip_shares.sql` | 신규 | `trip_shares` 테이블 + RLS(신규 정책만). **번호는 §1.1 확정 대기** |
| `lib/share/link.ts` | 신규 | `TRLS1.<payload>.<HMAC>` 발급/검증. `lib/transfers/pass.ts` 패턴 복제 |
| `lib/share/scope.ts` | 신규 | `ShareScope` 타입 + 기본값 + 직렬화 |
| `lib/share/projection.ts` | 신규 | **화이트리스트 투영 단일 지점.** §3 표가 여기 한 파일에만 산다 |
| `lib/share/server.ts` | 신규 | 토큰 → 트립 로드(service role) + 조회수 기록 |
| `app/api/trips/[tripId]/share/route.ts` | 신규 | `GET` 목록 · `POST` 발급/재발급 |
| `app/api/trips/[tripId]/share/[shareId]/route.ts` | 신규 | `DELETE` 철회 · `PATCH` 스코프 변경(=재발급) |
| `app/s/[token]/page.tsx` | 신규 | **공개** 서버 컴포넌트. `(app)` 밖이라 인증·온보딩 리다이렉트 없음 |
| `app/s/[token]/expired.tsx` | 신규 | 만료·철회·위조를 **한 화면**으로 (구분해서 알려주지 않는다) |
| `app/s/share.css` | 신규 | §4 계약대로 신규 화면 CSS는 새 파일 격리 |
| `app/(app)/trips/share-sheet.tsx` | 신규 | 소유자용 시트: 토글 4개 · 활성 링크 목록 · 조회수 · 철회 |
| `app/(app)/trips/page.tsx` | 수정 | `Share` 버튼 부착 (G2가 라우트를 옮긴 뒤) |
| `lib/state/types.ts` | 수정 | `TripShare` · `ShareScope` 타입 추가 |
| `public/robots.txt` | 수정 | `Disallow: /s/` |
| `tests/share-projection.test.ts` | 신규 | **거부 목록 회귀 테스트** (§2.5) |
| `.env.example` | 수정 | `TRAIL_SHARE_SIGNING_KEY` 추가 |

`proxy.ts`는 수정하지 않는다. 세션 갱신은 `/s/*`에서도 무해하고, 라우트가 `(app)` 밖이라
`app/(app)/layout.tsx`의 `redirect("/login")`·`redirect("/onboarding")`을 통과하지 않는다.

### 2.2 `trip_shares` 마이그레이션 (번호는 §1.1)

```
create table public.trip_shares (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null,
  user_id       uuid not null,                      -- 소유자. 기존 복합 FK 관례 그대로
  label         text not null default '',           -- "Family", "Coworkers"
  token_hash    text not null unique,               -- sha256(token). 토큰 자체는 저장하지 않는다
  scope_recipients boolean not null default true,
  scope_prices     boolean not null default false,
  scope_dates      boolean not null default false,
  scope_delivery   boolean not null default false,
  issued_at     timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  view_count    integer not null default 0,
  last_viewed_at timestamptz,
  created_at    timestamptz not null default now(),
  foreign key (trip_id, user_id) references public.trips(id, user_id) on delete cascade
);
create index trip_shares_trip_idx on public.trip_shares (trip_id) where revoked_at is null;
alter table public.trip_shares enable row level security;
alter table public.trip_shares force row level security;

-- 브라우저는 자기 링크를 "볼" 수만 있다. 발급·철회는 서버 라우트가 한다.
grant select on public.trip_shares to authenticated;
create policy trip_shares_select on public.trip_shares
  for select to authenticated using (user_id = auth.uid());
```

- **INSERT/UPDATE/DELETE grant 없음.** 발급·철회는 service role 라우트만. 브라우저가 직접
  `expires_at`을 늘리거나 `revoked_at`을 지우는 경로를 아예 만들지 않는다.
- `token_hash`만 select 가능한 것이 마음에 걸리면 select 컬럼 grant를 좁힐 수 있지만,
  해시는 토큰이 아니고 서명키 없이는 토큰을 만들 수 없으므로 실익이 없다. 그대로 둔다.
- 계정 삭제: `trips(id, user_id)` 복합 FK cascade → `auth.users` 삭제 시 자동으로 사라진다.
  0007의 캐스케이드 체인에 **자동으로 걸린다** (append-only 트리거가 없는 테이블이므로 안전).
- `advisors` 확인 필수: `enable` + `force` 둘 다, 그리고 정책 없는 grant가 없는지.

### 2.3 토큰 설계

`lib/share/link.ts`는 `lib/transfers/pass.ts`를 **복제하되 별도 키를 쓴다.**

| 항목 | 값 | 이유 |
| --- | --- | --- |
| 형식 | `TRLS1.<b64url(payload)>.<b64url(HMAC-SHA256)>` | 패스와 동일 패턴, 접두어로 구분 |
| 서명키 | `TRAIL_SHARE_SIGNING_KEY` (`TRAIL_PASS_SIGNING_KEY`와 **분리**) | 도메인 분리 + 독립 로테이션. 공유 링크가 유출돼 키를 갈아도 드롭오프 패스가 죽으면 안 된다 |
| payload | `{ v:1, k:"share", t:tripId, s:shareId, iat, exp }` | 이름·호텔·도시·금액 없음. 어깨너머로 봐도 uuid 두 개 |
| 만료 | `min(iat + 72h, trip.end_date + 24h)`, 상한 7일 | 여행이 끝난 링크는 목적이 없다. 소유자는 재발급 가능 |
| 1회용? | **아니다** | 카톡·iMessage가 링크 언펄링을 위해 URL을 먼저 GET한다. 1회용이면 **받는 사람이 열기 전에 미리보기가 토큰을 태운다.** 가족 단톡방에 하나 던지는 사용 사례도 1회용과 맞지 않는다 |
| 저장 | `sha256(token)` 만, unique | 재발급이 곧 이전 링크 무효화. 철회 목록 없이 철회가 성립 |
| 철회 | `revoked_at` 세팅 → 모든 열람이 즉시 만료 화면 | 소유자가 언제든 끌 수 있어야 한다 |
| 개수 상한 | 트립당 활성 3개 | 폭발 반경 제한. 4개째 발급은 409 |
| 조회 기록 | `view_count`, `last_viewed_at` | **안전 기능이다.** "3번 보냈는데 41번 열렸다"가 유출 신호 |

검증 순서는 패스와 같다: **서명 → 만료(payload) → DB 조회 → `revoked_at` → `expires_at` →
저장 해시 상수시간 비교.** 위조 토큰은 DB에 닿기 전에 거절된다.

만료·철회·위조·트립 삭제는 **같은 화면, 같은 상태 코드(404)**로 답한다.
"이 링크는 철회됐습니다"는 "이 트립은 존재한다"를 알려주는 문장이다.

**토큰이 URL 경로에 있다는 것의 대가**: Vercel 액세스 로그와 중계 서버 로그에 토큰이 남는다.
완화는 (1) 72시간 만료 (2) 즉시 철회 가능 (3) `Referrer-Policy: no-referrer` (4) 우리 로그에는
토큰을 절대 찍지 않는다(`share_id`만 찍는다). 더 강한 대안은 `/s/{shareId}#{secret}`
(프래그먼트는 서버에 도달하지 않는다)이지만 JS 필수 + 2단 렌더가 되므로 1단계에서는 채택하지 않고
**로그가 문제가 되면 올라갈 계단으로 기록만 해둔다.**

### 2.4 공개 페이지가 지켜야 하는 헤더

```
Cache-Control: no-store, private
X-Robots-Tag: noindex, nofollow, noarchive
Referrer-Policy: no-referrer
```
+ `export const metadata = { robots: { index: false, follow: false } }`
+ **OG/트위터 메타에 트립 내용을 넣지 않는다.** 언펄링 미리보기 카드에 "Toronto · Aug 15–19"가
찍히면 단톡방 전체가 링크를 열지 않고도 날짜를 본다. OG는 고정 문구
`"A Trail gift list"` + 로고 한 장으로 못박는다.
+ `app/s/[token]/page.tsx`는 `export const dynamic = "force-dynamic"`.

### 2.5 회귀 테스트 (이 기능의 핵심 안전장치)

`tests/share-projection.test.ts`는 두 가지를 강제한다.

1. **키 집합 동등성**: 모든 토글을 켠 상태의 투영 결과에서 재귀적으로 모은 키 집합이
   테스트에 하드코딩된 리터럴 집합과 **정확히 같아야** 한다. 스키마에 컬럼이 하나 늘고
   누군가 `select *`를 쓰면 이 테스트가 깨진다.
2. **거부 문자열 스캔**: `JSON.stringify(투영)`에 대해
   `/hotel_address|reference_code|pass_|seal|eta_|@|client_op|provider_|last4|token/i`가
   한 번도 매치되지 않아야 한다. 픽스처에는 실제로 그 값들이 들어 있는 전체 행을 넣는다.

`npm test`에 얹는다. `projection.ts`는 **`select *`를 쓰지 않고** 컬럼을 명시해서 읽는다
(두 겹 방어: 쿼리에서 한 번, 투영에서 한 번).

---

## 3. 노출 필드 화이트리스트

`lib/share/projection.ts`의 계약이다. 여기 없는 컬럼은 존재하지 않는 것으로 취급한다.

토글 4개: **`recipients`(기본 ON) · `prices`(기본 OFF) · `dates`(기본 OFF) · `delivery`(기본 OFF)**

### 3.1 `app_users`

| 컬럼 | 판정 | 이유 |
| --- | --- | --- |
| `display_name` | **포함** | "Sooyun's Toronto list". 소유자 본인의 이름이고 공유를 선택한 주체다 |
| `email` | **제외 (영구)** | 링크 하나로 이메일이 유통되면 그 자체가 스팸·피싱 표적이다. 토글 없음 |
| `id` · `locale` · `memory_enabled` · `home_currency` | 제외 | `home_currency`는 `prices` ON일 때 **통화 코드만** 포맷용으로 통과 |

### 3.2 `trips`

| 컬럼 | 판정 | 이유 |
| --- | --- | --- |
| `city` · `country` | **포함** | 목적지. 주소가 아니다 |
| `status` | **포함** | Planning / Active / Past. 위험 없음 |
| `start_date` · `end_date` | **`dates` 토글** (기본 OFF) | 이것이 부재 구간이다. 켤지는 소유자가 매번 결정 |
| `hotel_name` | **제외 (토글 없음)** | 이름 + 도시면 주소다. 지시문의 기본 제외는 `hotel_address`뿐이었지만 **`hotel_name`도 같은 폭로**다. 이름을 빼면 주소를 뺀 의미가 산다 |
| `hotel_address` | **제외 (영구)** | — |
| `hotel_verified_at` · `hotel_id` | 제외 | 운영 정보 |
| `areas` | **제외** | 도시 안에서 어느 동네를 도는지 = 이동 패턴 |
| `free_time` | **제외** | `"weekday evenings"` — 문자 그대로 부재 시간표 |
| `companions` | **제외** | 자유 텍스트에 제3자 이름이 들어간다. 그 사람은 공유에 동의한 적이 없다 |
| `currency` | `prices` ON일 때만 | 포맷용 |
| `id` · `user_id` · `created_at`/`updated_at` | 제외 | uuid를 밖으로 내보낼 이유가 없다 |

### 3.3 `recipients` — `recipients` 토글 ON일 때만

| 컬럼 | 판정 | 이유 |
| --- | --- | --- |
| `name` | **포함** | 목록의 요점. 소유자가 직접 쓴 라벨 |
| `group_size` | **포함** | "Coworkers ×12"를 설명하려면 필요 |
| `is_self` | **포함** ("For me" 태그로만) | 무해하고 목록이 읽힌다 |
| `relationship` | **제외** | 관계 그래프. 이름 라벨과 달리 사회적 정보다 |
| `priority` | **제외 (영구)** | **사람 순위표다.** 받는 사람이 자기가 4순위인 걸 보는 화면을 만들지 않는다 |
| `is_optional` | **제외 (영구)** | "이 선물은 안 사도 됨"을 당사자가 읽는다 |
| `preference_note` | **제외** | "꽃무늬 싫어함" 같은 사적 메모 |
| `equal_value_group` | 제외 | 내부 제약 |
| `archived_at` · `id` | 제외 | — |

> 공유 시트는 이 문장을 반드시 띄운다: **"Anyone with this link sees the whole gift list —
> including the gift meant for them."** 서프라이즈를 망치는 건 우리 책임이 아니지만,
> 망칠 수 있다는 걸 안 알려주는 건 우리 책임이다.

### 3.4 `plans` · `plan_allocations`

| 컬럼 | 판정 | 이유 |
| --- | --- | --- |
| `plans.category` · `preference` | **포함** | `"Thoughtful and useful"`. 취향 문구, 무해 |
| `plans.total_cents` · `planned_cents` | **`prices` 토글** | 켜면 총 예산과 계획액까지. 라벨은 §2 예외표대로 `trip budget` |
| `plans.delivery_reserve_cents` · `flexible_cents` | **제외 (토글에도)** | 예비비·유연자금 구조는 내부 지갑 설계다. 밖에서 볼 이유가 없고, 배송비 협상 재료가 된다 |
| `plans.approved_snapshot` | **제외 (영구)** | 승인 시점 전체 상태 덤프. 화이트리스트를 우회하는 통로 |
| `plans.approved_at` · `status` · `version` · 3개 불리언 | 제외 | 내부 상태 |
| `plan_allocations.*` | **제외 (영구, 토글 없음)** | **1인당 예산 = 사람 순위표의 금액판.** `prices`를 켜도 열리지 않는다 |

### 3.5 `stops`

| 컬럼 | 판정 | 이유 |
| --- | --- | --- |
| `product_name` | **포함** | 목록의 요점 |
| `store_name` | **포함** | 상점 이름은 공개 정보 |
| `area` | **포함** | 동네 단위. `trips.areas`(전체 경로)와 달리 항목 하나의 위치 |
| `status` | **포함** | `planned` / `bought` / `unavailable` / `skipped` |
| `handling` | **포함** | Fragile 등, 무해 |
| `snapshot_price_cents` | **`prices` 토글** | — |
| **`source`** | **포함 (필수)** | 제품 규칙 3. `Sample` 배지가 투영을 넘어 살아남아야 한다. **공유 화면에서도 행 단위로 표시** |
| `store_address` | **제외** | 특정 시각에 그가 서 있을 좌표 |
| `planned_day` · `sequence` | **제외 (영구)** | **일자별 순서 = 이동 타임테이블.** 목록은 정렬해서 보여주되 "Day 2, 3번째"는 내보내지 않는다 |
| `walk_minutes` | 제외 | 경로 정보 |
| `rationale` | **제외** | AI가 수령인 성향을 근거로 쓴 문장 ("어머니가 도자기를 좋아하셔서") |
| `saved` · `replaced_stop_id` · `recipient_id`* | 제외 | *수령인 연결은 이름 기준으로 그룹핑만, uuid는 안 나간다 |
| `store_id`/`product_id`/`plan_id`/`trip_id`/`id` | 제외 | — |

### 3.6 `purchases`

| 컬럼 | 판정 | 이유 |
| --- | --- | --- |
| 전체 | **제외 (영구)** | 실제 지출 기록 |
| 유일한 통과 | **집계 하나**: `"12개 중 7개 구매 완료"` | 개수만. `actual_price_cents` · `note` · `client_op_id` · `voided_at` · `void_reason` 전부 제외 |

`prices` 토글을 켜도 **실제 지출액은 안 나간다.** 계획가(`snapshot_price_cents`)와
실지출(`actual_price_cents`)의 차이는 그 사람이 예산을 지켰는지의 기록이다.

### 3.7 `bag_transfers` 및 하위 — `delivery` 토글 ON일 때만

| 컬럼 | 판정 | 이유 |
| --- | --- | --- |
| `status` | **포함** (§2 4개 라벨로 매핑) | `Dropped off` / `Collected by Trail` / `On the way to hotel` / `Delivered` |
| `bag_count` | **포함** | "3 bags" |
| **`source`** | **포함 (필수)** | `Simulated` 배지 |
| `reference_code` | **제외 (영구)** | `TRL-48173`은 파트너 카운터에서 통하는 식별자다 |
| **`eta_start` · `eta_end`** | **제외 (영구, 토글 없음)** | **이 문서의 핵심.** 호텔 + ETA = "18:30–19:00에 호텔에 없다" |
| `dropoff_cutoff_at` | **제외 (영구)** | "17:00 이전에 그 카운터에 있다" |
| `hotel_name` · `hotel_address` | **제외 (영구)** | §3.2와 동일 |
| `dropoff_store`(embed 전체) | **제외 (영구)** | 이름·주소·좌표. 물리적 접선 지점 |
| `fee_cents` · `currency` | 제외 | 금액 |
| `pass_token_hash` · `pass_issued_at` · `pass_expires_at` · `pass_version` | **제외 (영구)** | 커스터디 자격증명 계열 |
| `weight_grams` · `ineligible_reason` · `ineligible_code` · `handoff_failure_code` | 제외 | 운영 정보 |
| `bag_transfer_items.*` | **제외 (영구)** | `label`은 구매 내역이고 `seal_id`는 **봉인 태그 ID**다. 인계 증빙이 태그 ID 집합 대조이므로 이건 위조 재료다 |
| `transfer_events.*` | **제외 (영구)** | 시각 + 장소 + 행위자 로그. 원장 전체가 이동 기록이다 |
| `transfer_issues.*` | 제외 | 문제 서술에 위치·시각이 섞인다 |
| `payments.*` | **제외 (영구, 토글 없음)** | `method_brand`·`method_last4`·`provider_intent_id` 전부. 결제는 공유의 대상이 아니다 |
| `receipts.*` | **제외 (영구, 토글 없음)** | `seal_ids` 배열 + `received_by`(호텔 직원 실명) + 금액 |

### 3.8 아예 도달 불가로 둘 것

`chat_messages` · `memory_constraints` · `trip_insights` · `plan_events` · `budget_changes` ·
`store_inquiries` · `migration_imports` · `seal_tags` · `hotels` · `delivery_pricing` ·
`store_hours` — **투영 쿼리가 이 테이블들을 조회하지 않는다.** 토글도 없다.

특히 `memory_constraints`는 사용자가 **항목 단위로 동의한** 기억이다. 그 동의는 Trail에게 준 것이지
링크를 받은 사람에게 준 것이 아니다.

---

## 4. UI 라벨 — `+ Invite`가 아니라 `Share`

### 결론
**1단계 버튼 라벨은 `Share`.** 2단계가 배포되는 순간 같은 버튼이 시트를 열고,
그 시트 안에 와이어프레임 문구 그대로 `+ Invite`가 **한 줄로 복귀**한다.

### 근거

1. **`Invite`는 "이 사람이 합류한다"는 뜻이다.** 모든 앱에서 그렇다. 1단계가 주는 건 관전권이다.
   할 수 있는 것보다 많은 것을 약속하는 라벨이다.
2. **FIGMA_ADOPTION §1의 원칙과 §3 예외표의 선례가 그대로 적용된다.**
   `I've dropped off my bags ✓` → `I handed the bags over`로 고친 이유가 정확히 이거다.
   체크 표시가 커스터디 이전을 확정어로 약속했기 때문. `+ Invite`도 같은 종류의 과약속이다.
   → **§3 카피 예외표에 7번째 행을 추가할 것을 제안한다:**

   | 와이어프레임 | 쓸 문구 | 이유 |
   | --- | --- | --- |
   | `+ Invite` | `Share` (1단계) → 2단계에서 `+ Invite` 복귀 | 1단계는 읽기 전용. `Invite`는 합류를 약속한다 |

3. **라벨이 곧 프라이버시 제어다.** 이게 결정적이다.
   `Invite`라고 쓰면 사람들은 "특정한 한 사람에게" 보낸다고 생각하고 링크를 만든다.
   `Share view-only link`라고 쓰면 "이건 퍼진다"를 전제로 만든다.
   부재 시간표를 담을 수 있는 링크에서 **어느 쪽 심성 모형을 심느냐가 실제 노출 범위를 바꾼다.**
   문구가 사용자 행동을 통해 보안 결과에 영향을 준다.
4. 되돌리는 비용이 비대칭이다. `Share` → `+ Invite`(기능이 커짐)는 반가운 변화다.
   `Invite` → 실은 못 한다는 걸 알게 되는 것은 신뢰 손실이다.

### 화면 문구 (1단계)

- 버튼: `Share` (아이콘 + 44px 타깃)
- 시트 제목: `Share this trip`
- 부제: `View-only. People with the link can read the list — they can't change anything.`
- 토글 4개: `Gift list` / `Prices` / `Trip dates` / `Delivery status`
- 경고: `Anyone with this link sees the whole gift list, including the gift meant for them.`
- 만료 표시: `Link expires in 3 days · 41 opens` + `Revoke`
- 2단계 대비 자리: 시트 하단에 `Invite someone to edit — coming soon`을 **쓰지 않는다.**
  없는 걸 광고하지 않는다.

---

## 5. 2단계 — 공동 편집

### 5.1 왜 정책 한 줄이 아닌가

0002는 **조인 없는 단일 컬럼 비교**를 의도적으로 골랐다(`user_id = auth.uid()`).
그리고 0001은 `trips`에 `unique (id, user_id)`를 두고 모든 자식을 `(parent_id, user_id)`
복합 FK로 매달았다. 이 둘이 맞물려서 다음을 **구조적으로** 보장한다:

> 자기 `user_id`를 가진 행은 자기 trip에만 매달릴 수 있다.

게스트가 자기 `user_id`로 남의 trip에 행을 매달면 FK가 거부한다. 정책을 아무리 열어도
그 INSERT는 실패한다. 즉 **정책 수정만으로는 공동 편집이 절대 동작하지 않는다.**

### 5.2 선택지 3개와 결론

| 안 | 내용 | 판정 |
| --- | --- | --- |
| **A** | `user_id`의 **의미를 "소유자"로 고정**하고, 멤버가 쓴 행도 소유자의 id를 담는다. 누가 했는지는 새 컬럼 `actor_user_id`가 기록한다. 복합 FK는 손대지 않는다 | **채택** |
| B | 복합 FK를 단일 FK로 낮추고 트리거로 소속 검사 | 기각. FK가 주던 구조적 보장을 트리거 정확성으로 바꾼다 |
| C | 행마다 실제 작성자를 `user_id`로 | 기각. 26개 테이블의 FK 전면 재작성 |

**A의 대가를 명시한다**: `user_id`는 "누가 만들었나"에서 "누구 여행인가"로 뜻이 바뀐다.
`lib/supabase/admin.ts` 주석 2번("모든 쿼리에 `.eq("user_id", traveler.id)`")과
`lib/transfers/server.ts` 헤더 주석이 **틀린 문장이 된다** — service role 경로가
`traveler.id`를 그대로 넣으면 멤버가 호출했을 때 0행이 나오거나(읽기) 잘못된 소유자로 쓴다(쓰기).
2단계는 **`ownerIdFor(tripId)` 헬퍼를 만들고 admin 경로를 전수 치환**하는 작업을 포함한다.

컬럼명을 `owner_id`로 바꾸면 호출 지점이 컴파일 에러로 다 잡히지만, 0007의
`block_mutation()`이 `to_jsonb(old) ->> 'user_id'`를 읽고 있고 PostgREST embed 힌트
(`plans!plans_trip_id_user_id_fkey` 등, `lib/state/queries.ts` 전체)가 제약 이름에 묶여 있다.
→ **이름은 유지, 의미만 전환.** 대신 `comment on column`으로 DB에 못박고, 위 두 주석을 고친다.

### 5.3 신규 테이블 (`0027_trip_members.sql` — §1.1 A안 기준. B안이면 `0026`)

```
create table public.trip_members (
  trip_id     uuid not null references public.trips(id) on delete cascade,
  user_id     uuid not null references public.app_users(id) on delete cascade,
  role        text not null check (role in ('owner','editor','viewer')),
  invited_by  uuid references public.app_users(id) on delete set null,
  joined_at   timestamptz not null default now(),
  revoked_at  timestamptz,
  primary key (trip_id, user_id)
);
create index trip_members_user_idx on public.trip_members (user_id) where revoked_at is null;

create table public.trip_invites (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips(id) on delete cascade,
  created_by  uuid not null references public.app_users(id) on delete cascade,
  role        text not null check (role in ('editor','viewer')),
  email_hash  text,                     -- sha256(pepper || lower(trim(email))). 원문 저장 금지
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  max_uses    smallint not null default 1,
  used_count  smallint not null default 0,
  accepted_by uuid, accepted_at timestamptz, revoked_at timestamptz,
  created_at  timestamptz not null default now()
);
```

- `trip_members.trip_id`는 **복합 FK를 쓸 수 없다** (멤버의 `user_id`는 소유자의 것이 아니다).
  `trips(id)` 단일 참조. 이 테이블만 예외이고, 그래서 여기가 가장 위험한 테이블이다.
- **두 테이블 모두 `authenticated`에 INSERT/UPDATE/DELETE grant를 주지 않는다.**
  `trip_members`에 `with check (user_id = auth.uid())` INSERT 정책을 다는 것은
  문자 그대로 **"아무 trip에나 나를 추가한다"**이다. 이 유혹을 정책 파일에 주석으로 박아둔다.
- 소유자 행(`role='owner'`)은 `trips` INSERT 트리거가 자동 생성한다.

### 5.4 헬퍼 함수

```
create function public.is_trip_member(p_trip uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.trip_members m
                    where m.trip_id = p_trip and m.user_id = auth.uid() and m.revoked_at is null) $$;
create function public.is_trip_owner(p_trip uuid) returns boolean ...  -- role='owner'
create function public.can_edit_trip(p_trip uuid) returns boolean ...  -- role in ('owner','editor')
create function public.can_access_transfer(p_transfer uuid) returns boolean ...  -- 원장용
```

- `security definer` 필수: `trip_members` 자신도 RLS라 정책 안에서 자기 자신을 조회하면 재귀한다.
- `set search_path = ''` 필수 (0008이 같은 이유로 만들어졌다).
- `revoke execute ... from public, anon` + `grant execute ... to authenticated`.
- **성능**: 단일 컬럼 비교가 행마다 도는 함수 호출로 바뀐다. 정책에서
  `(select public.is_trip_member(trip_id))` 형태로 감싸 InitPlan 캐싱을 유도하고,
  `trip_members(user_id, trip_id)` 인덱스를 둔다. 이건 선택이 아니라 필수다 —
  `stops`·`transfer_events`처럼 행이 많은 테이블에서 순차 함수 호출은 눈에 띄게 느리다.
- **원장 3종은 `can_access_transfer(transfer_id)` 헬퍼로 처리하고 스키마를 건드리지 않는다.**
  `transfer_events`에 `trip_id`를 비정규화하려면 백필 UPDATE가 필요한데 `block_mutation()`이
  service_role까지 막는다. 트리거를 잠시 떼고 백필하고 다시 붙이는 것은 **2단계에서 가장 위험한
  작업**이므로 아예 하지 않는다. 헬퍼 함수가 그 위험을 통째로 없앤다.

### 5.5 정책 재작성 전수 목록

RLS가 걸린 26개 테이블 전부를 나열한다. "변경 없음"도 결정이다.

| # | 테이블 | trip 도달 경로 | 2단계 정책 | 위험 |
| --- | --- | --- | --- | --- |
| 1 | `trips` | `id` | select: member / update: **컬럼 분리 필요** / delete: owner | **高** |
| 2 | `recipients` | `trip_id` | member 읽기, editor 쓰기 | 中 |
| 3 | `plans` | `trip_id` | select member / insert 현행 유지(첫 draft) / update 여전히 없음 | **高** |
| 4 | `plan_allocations` | `plan_id`→`plans` | select member, 쓰기는 RPC만 | **高** |
| 5 | `stops` | `trip_id` | member 읽기, editor 쓰기 | 低 |
| 6 | `store_inquiries` | `stop_id`→`stops` | member 읽기, editor 쓰기 | 低 |
| 7 | `purchases` | `trip_id` | member 읽기, editor 쓰기 | 中 |
| 8 | `budget_changes` | `plan_id`→`plans` | select member / **propose는 editor** / decide는 RPC(owner) | **高** |
| 9 | `chat_messages` | `trip_id` | **변경 없음 — owner만** | **高** |
| 10 | `memory_constraints` | 계정 스코프 | **변경 없음 — owner만** | **高** |
| 11 | `trip_insights` | `trip_id` (pk) | select member | 低 |
| 12 | `bag_transfers` | `trip_id` | select member / insert·update editor / **confirm은 owner** | **高** |
| 13 | `bag_transfer_items` | `transfer_id` | editor, draft 상태에서만 (현행 조건 유지) | 中 |
| 14 | `payments` | `transfer_id` | **변경 없음 — owner select만** | **高** |
| 15 | `transfer_events` | `transfer_id` | select member / insert editor + `actor_user_id` / **`cancelled`는 owner** | **高** |
| 16 | `receipts` | `transfer_id` | select member | 中 |
| 17 | `plan_events` | `trip_id` | select member / insert editor + `actor_user_id` | 中 |
| 18 | `transfer_issues` | `transfer_id` | member 읽기/쓰기 | 低 |
| 19 | `migration_imports` | 계정 스코프 | 변경 없음 (grant 자체가 없음) | 低 |
| 20 | `app_users` | — | **정책 변경 없음.** 멤버 이름은 서버 라우트로만 | **高** |
| 21 | `trip_shares` | `trip_id` | select member, 발급·철회는 owner(서버) | 中 |
| 22 | `trip_members` | 자기 자신 | select: 같은 trip 멤버 / 쓰기 grant 없음 | **高** |
| 23 | `trip_invites` | `trip_id` | select owner만 / 쓰기 grant 없음 | **高** |
| 24–26 | `stores` `products` `delivery_pricing` `store_hours` `hotels` `seal_tags` | — | 변경 없음 | 低 |

**실제로 정책이 바뀌는 테이블은 15개**(1–8, 11–13, 15–18, 21), 신규 3개(21–23),
의도적으로 안 여는 것 5개(9, 10, 14, 19, 20).

#### 高 위험 항목의 이유

- **1 `trips`**: `hotel_address`를 editor에게 열 것인가. 여기서 컬럼 단위 grant가 필요해진다
  (`grant update (city, areas, start_date, ...) on trips to authenticated`).
  G0가 "trips 컬럼 권한"을 이미 손보므로 그 결과 위에 쌓아야 한다. **G0 완료 전 착수 금지.**
- **3·4·8 예산**: 0013이 만든 게이트를 깨기 가장 쉬운 지점. editor가 **제안**할 수는 있어도
  **승인**할 수 없다는 것이 제품 규칙 1의 2인용 해석이다. "내 예산은 내가 승인한다."
- **9 `chat_messages` / 10 `memory_constraints`**: 열지 않는다. AI 대화에는 여행과 무관한 사적
  맥락이 섞이고, 기억은 **항목 단위로 동의한** 것이다. 그 동의는 동행자에게 준 게 아니다.
  → 2단계 UI에서 `AI` 탭은 멤버에게 **자기 대화만** 보인다. 이건 명세이지 버그가 아니다.
- **14 `payments`**: 열지 않는다. 결제는 소유자의 카드다.
- **15 `transfer_events`**: 아래 5.6.
- **20 `app_users`**: 멤버끼리 서로의 `display_name`이 보여야 하는데, `app_users`에
  "같은 trip 멤버면 select" 정책을 달면 **같은 정책이 `email` 컬럼도 연다.**
  PostgREST에서 정책은 행 단위라 컬럼별로 다른 정책을 걸 수 없다.
  → **정책을 만들지 않는다.** `GET /api/trips/{id}/members`가 service role로 멤버십을 확인한 뒤
  `{ id, displayName }`만 반환한다. `email`은 절대 나가지 않는다.
- **22 `trip_members`**: select 정책이 `is_trip_member(trip_id)`를 부르는데 그 함수가
  `trip_members`를 읽는다 → **security definer가 아니면 무한 재귀.** 반드시 definer.
- **23 `trip_invites`**: INSERT 정책을 만드는 순간 "아무 trip에나 초대장 발행"이 된다.

### 5.6 커스터디 — `actor_user_id`

- `transfer_events`·`plan_events`·`budget_changes`에 `actor_user_id uuid` **nullable** 추가.
  nullable 컬럼 추가는 DDL이라 `block_mutation()`(행 UPDATE/DELETE 트리거)에 걸리지 않는다.
  백필도 하지 않는다.
- **과거 행은 영원히 NULL이다.** UI는 NULL을 "누가 했는지 기록되기 전"으로 렌더해야 한다
  (`A traveller`). 이 상태를 "오류"로 취급하는 코드를 쓰지 않는다.
- **`actor_user_id`에는 FK를 걸지 않는다.** `references app_users(id) on delete set null`은
  계정 삭제 시 원장 행을 **UPDATE**하고, `block_mutation()`이 그 UPDATE를 막아
  **계정 삭제가 다시 통째로 실패한다** — 0007이 고쳤던 바로 그 버그가 되돌아온다.
  원장은 "그때 그 사람이 했다"를 기록하는 물건이고, 그 사람이 떠났다고 다시 쓰이면 안 된다.
  나간 사용자의 uuid는 `app_users`가 사라진 뒤에는 식별자가 아니다. 이 판단을 삭제 문서에 남긴다.
- `transfer_events` INSERT 정책:
  `actor='traveler'` + `event_type in ('dropped_off','delayed','seal_issue')` + `can_edit_trip`
  + `actor_user_id = auth.uid()`.
  **`cancelled`는 owner만** — 이송 취소는 환불이고 예비비 환원이다. **돈이 움직이면 owner다.**
- 같은 규칙으로 owner 전용: 이송 확정(`fee_cents` 동결), 결제, 예산 승인/거절, 트립 삭제,
  멤버 초대·해임, 공유 링크 발급·철회.

### 5.7 초대 수락 — service_role 전용 RPC

```
create function public.accept_trip_invite(p_token_hash text, p_user_id uuid, p_email_hash text)
  returns jsonb language plpgsql security invoker set search_path = '' as $fn$ ... $fn$;
revoke execute on function public.accept_trip_invite(text, uuid, text) from public, anon, authenticated;
grant execute on function public.accept_trip_invite(text, uuid, text) to service_role;
```

0013의 `approve_budget_change`와 **같은 패턴**이다: `security invoker` + service_role만 실행.
definer가 아닌 이유도 같다 — 모든 테이블이 `force row level security`라 definer는 소유자의
BYPASSRLS 비트에 의존하게 된다.

함수 안에서 한 트랜잭션으로: 토큰 해시 조회 → `revoked_at`/`expires_at`/`used_count` 검사 →
`email_hash` 대조(설정돼 있으면) → `trip_members` upsert → `used_count += 1` →
`accepted_by/accepted_at` 기록.

**이메일 열거 방지**:
- 초대장에 이메일 **원문을 저장하지 않는다.** `sha256(pepper || lower(trim(email)))`만.
  pepper는 서버 환경변수(`TRAIL_INVITE_PEPPER`)라 DB 유출만으로는 사전 공격이 안 된다.
- 초대 생성 라우트는 **그 이메일에 TRAIL 계정이 있는지 절대 답하지 않는다.** 항상 같은 200.
- 수락 실패는 만료·철회·소진·이메일 불일치·없는 토큰이 **전부 같은 코드**(`invite_unavailable`, 404).
- 초대 생성/수락 라우트에 레이트리밋(`app/api/chat/route.ts`의 `hits` 패턴, 키는 `traveler.id`).

### 5.8 계정 삭제와의 상호작용 (0007 확장)

| 상황 | 결과 | 근거 |
| --- | --- | --- |
| **소유자** 삭제 | `auth.users` → `app_users` → `trips` cascade → `trip_shares`·`trip_members`·`trip_invites` 전부 cascade | `trip_members.trip_id`, `trip_invites.trip_id`가 `trips(id) on delete cascade` |
| **멤버** 삭제 | `trip_members` 행만 사라진다. 트립 데이터는 소유자 것이라 그대로 | 모든 행의 `user_id`가 소유자 id (5.2 A안) |
| 멤버가 남긴 원장 행 | `actor_user_id`가 dangling uuid로 남는다 | FK 없음 (5.6). **의도된 동작** |
| `trip_invites.created_by` 삭제 | cascade — 미수락 초대장이 함께 사라진다 | 초대한 사람이 없으면 초대도 없다 |
| `trip_invites.accepted_by` 삭제 | `on delete set null` (append-only 아님, 안전) | — |
| `trip_members.invited_by` 삭제 | `on delete set null` | — |

**착수 전 확인**: 0007이 고친 두 결함(원장 cascade, 복합 FK `set null`)을 신규 테이블이
다시 만들지 않는지. 특히 `on delete set null`을 복합 FK에 걸면 `user_id`까지 NULL이 되어
NOT NULL 위반으로 캐스케이드 전체가 죽는다 — 0007이 정확히 그걸 고쳤다.

### 5.9 2단계 파일 목록

| 경로 | 종류 |
| --- | --- |
| `supabase/migrations/0027_trip_members.sql` | 신규 테이블 + 헬퍼 함수 + 신규 정책 (§1.1 A안 번호) |
| `supabase/migrations/0028_shared_policies.sql` | 기존 15개 테이블 정책 재작성 |
| `supabase/migrations/0029_actor_identity.sql` | `actor_user_id` 3개 + `approve_budget_change` 재정의 |
| `app/api/trips/[tripId]/invites/route.ts` | 초대 발행 (owner만) · 목록 |
| `app/api/trips/[tripId]/invites/[id]/route.ts` | 철회 |
| `app/api/invites/accept/route.ts` | 수락 → RPC 호출 (service role) |
| `app/api/trips/[tripId]/members/route.ts` | 멤버 목록(`display_name`만) · 역할 변경 · 해임 |
| `app/join/[token]/page.tsx` | 초대 수락 화면 (미로그인 시 `/login?next=`) |
| `app/(app)/trips/members-sheet.tsx` | 멤버 관리 UI + `+ Invite` |
| `lib/trips/membership.ts` | `ownerIdFor(tripId)` · 역할 판정 |
| `lib/supabase/admin.ts` · `lib/transfers/server.ts` | **주석 수정** (5.2의 의미 전환) |
| `lib/state/queries.ts` · `load.ts` | `.eq("user_id", …)` 전수 점검 |
| `docs/HANDOFF.md` | `user_id` = 소유자 규약 명문화 |

---

## 6. 1단계만으로 와이어프레임의 `+ Invite`가 성립하는가

**아니다.** 정직하게 쪼개면:

| 와이어프레임 `+ Invite`가 암시하는 것 | 1단계 | 2단계 |
| --- | --- | --- |
| 링크로 트립을 보여준다 | **된다** | 된다 |
| 받은 사람이 목록을 읽는다 | **된다** | 된다 |
| 여러 명에게 다르게 보여준다 (스코프별 링크) | **된다** (링크 3개, 토글 다름) | 된다 |
| 언제든 끊을 수 있다 | **된다** (철회) | 된다 |
| 받은 사람이 "이 트립의 멤버"가 된다 | 안 된다 | 된다 |
| 받은 사람이 선물을 추가/수정한다 | 안 된다 | 된다 |
| 받은 사람이 자기 앱에서 이 트립을 본다 | 안 된다 | 된다 |
| 받은 사람 이름이 트립에 뜬다 | 안 된다 | 된다 |
| 누가 무엇을 바꿨는지 보인다 | 해당 없음 | 된다 (`actor_user_id`) |

즉 **1단계는 `+ Invite`의 절반이고, 그 절반은 정확히 "공유"다.**
버튼이 열어주는 경험의 완결성은 있다(만들고 → 보내고 → 열리고 → 끊는다).
없는 것은 상대방의 존재다.

그래서 §4의 결론이 나온다: **1단계는 `Share`로 정직하게 배포하고, `+ Invite`라는 정확히 그 문구는
2단계에서 원래 뜻을 가지고 돌아온다.** 와이어프레임 문구를 버리는 게 아니라, 그 문구가
참이 되는 시점까지 보류하는 것이다.

---

## 7. 보안 체크리스트

### 착수 전 (1단계)

- [ ] G0의 `trips` 컬럼 권한 작업이 끝났는지 확인 (2단계 전제이기도 하다)
- [ ] `TRAIL_SHARE_SIGNING_KEY`가 `TRAIL_PASS_SIGNING_KEY`와 **다른 값**인지, 32바이트 랜덤인지
- [ ] `.env.example`에 추가 + Vercel Production/Preview에 Sensitive로 등록
- [ ] `lib/share/*`가 `lib/supabase/admin.ts`를 import하는 파일이 **서버 전용**인지
      (`"use client"` 경계 아래로 절대 못 내려간다)
- [ ] `app/s/[token]/page.tsx`가 `(app)` 밖에 있는지 — 안에 있으면 미로그인 접속이 `/login`으로 튄다
- [ ] `projection.ts`가 `select *`를 쓰지 않는지 (컬럼 명시)

### 배포 전 (1단계)

- [ ] `npm test` — 키 집합 동등성 + 거부 문자열 스캔 통과
- [ ] 미로그인 브라우저(시크릿 창)로 `/s/{token}` 열어서 실제 응답 본문 **눈으로 grep**:
      `hotel`, `eta`, `reference_code`, `@`, `seal`, `4242`, `TRL-`
- [ ] 토큰 마지막 글자 하나 바꿔서 → 401/404, **DB 쿼리 로그에 조회가 없어야** 함(서명 우선)
- [ ] 철회 → 즉시 만료 화면. 캐시된 페이지가 안 나오는지 (`no-store`)
- [ ] 만료 · 철회 · 위조 · 삭제된 트립 → **네 경우 모두 같은 화면, 같은 상태 코드**
- [ ] 카톡/iMessage/Slack에 링크 붙여넣고 **언펄링 카드에 도시·날짜가 안 뜨는지**
- [ ] `robots.txt`에 `/s/` disallow, 페이지 `X-Robots-Tag: noindex`
- [ ] 활성 링크 4개째 발급 → 409
- [ ] 토글 전부 OFF일 때 나가는 필드가 무엇인지 직접 확인 (도시 + 상품/상점 이름 + `source`)
- [ ] 애플리케이션 로그에 토큰 문자열이 찍히지 않는지 (`share_id`만)
- [ ] `get_advisors` — `trip_shares`가 `enable` + `force`, 정책 없는 grant 없음
- [ ] 다른 사람의 `tripId`로 `POST /api/trips/{tripId}/share` → 404 (403 아님)
- [ ] `readBody`의 `carriesIdentity` 가드가 공유 라우트에도 걸려 있는지

### 착수 전 (2단계)

- [ ] `is_trip_member`가 `security definer` + `set search_path = ''` + `stable`인지 (재귀·0008)
- [ ] 정책 안에서 `(select public.is_trip_member(...))` 래핑 — InitPlan 캐싱
- [ ] `trip_members`·`trip_invites`에 `authenticated` INSERT/UPDATE/DELETE grant가 **없는지**
- [ ] `actor_user_id`에 **FK가 없는지** (있으면 계정 삭제가 다시 깨진다, 5.6)
- [ ] `approve_budget_change` 재정의가 `is_trip_owner`를 **함수 안에서** 검사하는지 (라우트 말고)
- [ ] 원장 3종에 `trip_id` 백필을 시도하지 않았는지 (`can_access_transfer` 헬퍼 사용)
- [ ] 신규 복합 FK에 `on delete set null`을 걸지 않았는지 (0007 결함 2)

### 배포 전 (2단계)

- [ ] editor 계정으로 SQL 에디터에서 직접 시도해 전부 실패:
      `insert into trip_members ...` / `update plans set planned_cents = ...` /
      `update budget_changes set status='approved'` / `insert transfer_events (event_type='cancelled')` /
      `select email from app_users` (남의 행)
- [ ] owner 삭제 → 트립·멤버십·초대장 전부 사라지고 **에러 없이 완료**되는지 (0007 회귀)
- [ ] 멤버 삭제 → 트립 데이터가 **남아 있는지**, 그리고 삭제가 성공하는지 (원장 FK 없음 확인)
- [ ] 초대 수락 실패 5종이 **같은 응답**인지 (열거 방지)
- [ ] 존재하지 않는 이메일 초대 vs 존재하는 이메일 초대의 응답·응답시간이 구별되지 않는지
- [ ] 해임된 멤버의 세션이 **다음 요청부터** 막히는지 (`revoked_at` 즉시 반영)
- [ ] `stops` 2000행 트립에서 `GET /api/state` 응답 시간 회귀 측정 (정책 함수 비용)
- [ ] `get_advisors` 전체 — 26+3 테이블 `enable`+`force`, `for all` 정책에 `with check` 짝
- [ ] `lib/supabase/admin.ts`·`lib/transfers/server.ts` 주석이 새 의미로 고쳐졌는지

---

## 8. 실행 기록 — 1단계 구현 완료 (마이그레이션 원격 미적용)

### 8.1 §1.1 번호 — **A안 확정**

`FIGMA_ADOPTION.md` §4 원장과 일치한다: **`0026` = `trip_shares`(1단계)**,
`0027`/`0028`/`0029` = 2단계. 배포 순서와 번호 순서가 같으므로 §1.1 B안의 순서 경고는 없다.
`supabase/migrations/0026_trip_shares.sql`은 **작성만** 했고 원격에는 적용하지 않았다 —
적용 후 `get_advisors`까지가 한 세트이고, 그 실행은 별도 승인 사항이다.

### 8.2 2단계는 착수하지 않았다

`0027`~`0029`, `trip_members`, `trip_invites`, `actor_user_id`, 15개 테이블 정책 재작성,
`ownerIdFor(tripId)` 전수 치환 — **코드는 한 줄도 쓰지 않았다.** §5는 설계 문서로만 남는다.
`+ Invite` 라벨도 그때 돌아온다.

### 8.3 계획과 달라진 여섯 가지

| # | 계획 | 실제 | 이유 |
| --- | --- | --- | --- |
| 1 | `PATCH …/share/{id}` = 스코프 변경(재발급) | **라우트를 만들지 않았다.** 스코프 변경 = `DELETE`(철회) 후 `POST`(신규) | "재발급"을 라우트 하나로 표현한 것과 같다. 제자리 수정은 이미 남의 대화방에 있는 URL의 노출 범위를 조용히 넓힌다 |
| 2 | 토글 라벨 `Gift list` | **`Who each gift is for`** | §3.5는 stops를 무조건 포함으로, §7 체크리스트는 "전부 OFF일 때도 상품·상점 이름이 나간다"고 못박았다. 목록을 끄지 않는 스위치를 `Gift list`라 부르는 것은 `+ Invite`와 같은 종류의 과약속이다(§4-2) |
| 3 | (없음) | **공개 화면에 만료 시각을 표시하지 않는다** | 만료는 `min(iat+72h, end_date+…)`라, 날짜를 찍으면 `Trip dates` OFF를 우회해 종료일이 역산된다. 만료는 소유자 시트에만 있다 |
| 4 | `lib/state/types.ts`에 `TripShare`·`ShareScope` 추가 | **`lib/share/scope.ts`에 둔다** | 공유 링크는 `TrailState`의 일부가 아니고, §4 계약상 그 파일은 충돌 지점이다 |
| 5 | `app/(app)/trips/page.tsx`에 `Share` 부착 | **트립 컨텍스트 바의 `status` 슬롯**(`/trail`) | G2가 만든 빈 슬롯이 이미 있었고, 공유는 트립 하나에 대한 행위다. `useShareSheet()`는 `useTripSwitcher()`와 같은 모양이라 다른 화면에도 한 줄로 붙는다 |
| 6 | (없음) | **`record_share_view(uuid)` RPC 추가** | 조회수를 라우트에서 읽고 쓰면 단톡방 동시 열람에서 카운트가 유실된다. 과소집계는 이 컬럼이 존재하는 이유(유출 신호)를 정확히 망가뜨린다 |

### 8.4 배포 전 남은 것

`docs/plans/G6-share.md` §7의 "배포 전 (1단계)" 체크리스트 중 **자동화된 것은
`tests/share-projection.test.ts` 23건뿐**이다. 시크릿 창 열람, 카톡 언펄링 카드, 4번째
발급 409, 철회 즉시 반영, `get_advisors`는 **`0026` 적용 후 손으로** 확인해야 한다.
`TRAIL_SHARE_SIGNING_KEY`는 `.env.example`에 있고, Vercel Production/Preview에는 아직 없다.
