# TRAIL 수정 계획 — Vercel 이식 + Supabase 백엔드

결정사항: **배포 대상은 Vercel**, **데이터는 Supabase**(`fzvwfseupggtjwdxvfsc`).
근거: 화면별 기능 전수 조사, Supabase 연동 설계, GPT 연동 리뷰 3건.

---

## 0. 지금 상태

| 층 | 현재 |
|---|---|
| 프런트 | React 19 + Next 16 App Router. `app/page.tsx` 단일 클라이언트 컴포넌트에 8화면 상태머신 전체 |
| 백엔드 | **없음.** API 라우트는 최근 추가한 `/api/chat` 하나뿐이고 무상태 |
| 데이터 | `localStorage["trail-v3-state"]` 단일 blob. **대화 이력과 이송 가방 선택은 저장조차 안 됨** |
| 인증 | 없음. `app/chatgpt-auth.ts`는 완성돼 있으나 **어디서도 import되지 않음** |
| 런타임 | vinext(Cloudflare Workers) — Vercel과 비호환 |
| AI | `/api/chat` → OpenAI, 구조화 출력. 키 없으면 정규식 폴백 |

### 이관을 막는 구조적 결함 3가지

1. **모든 도메인 데이터가 배열 인덱스로 식별된다.** `purchases`, `selectedBags`, `replacementIds`, `savedStops`가 전부 `Record<number, …>`이고 키는 `productTemplates`의 위치다. 안정적 ID가 없어 서버 이관 시 가장 먼저 깨진다.
2. **가격이 파생값이다.** `price = activePlan.budget * [.48,.31,.21][i]` — 예산을 바꾸면 **이미 구매한 항목의 기준가가 소급 변경**된다.
3. **`routeDirty`를 boolean으로 저장한다.** 서버로 옮기면 승인 우회 통로가 된다. `draft ≠ approved` 비교로 유도해야 한다.

---

## P0 — 배포 전 차단 항목 (Vercel 이식보다 먼저)

### P0-1. `/api/chat`이 공개 OpenAI 프록시다 🔴

`app/api/chat/route.ts`에 인증·레이트리밋·페이로드 상한이 없다. 배포 즉시 누구나 `OPENAI_API_KEY`를 소진시킬 수 있다.

- 인증이 붙기 전(P2)까지의 임시 방어: 동일 출처(Origin/Referer) 검사, 페이로드 32KB 상한, `history[].text` 500자 상한, IP 단위 레이트리밋, 일일 토큰 예산 상한.
- P2에서 Supabase Auth 세션 검사로 대체한다.

### P0-2. 정규식 patch가 검증 없이 상태를 바꾼다 🔴

`app/page.tsx`가 `inferPlanPatch()` 결과를 `sanitizePatch()` 없이 바로 적용한다. 모델 경로와 검증이 갈린다.

| 발화 | 현재 결과 | 문제 |
|---|---|---|
| `not chocolate, she's allergic` | `category = "Food & treats"` | **의미의 정반대**가 brief에 박힘 |
| `something useful for my mom` | `category = "Home & design"` 강제 | 말한 적 없는 값이 확정 사실이 됨 |
| `$5000 was the flight` | `budget = 5000` | 상한 없음. 슬라이더는 300에 붙고 state는 5000 → 발산 |

게다가 이 값이 다음 프롬프트의 brief로 주입되고, 프롬프트는 "이미 아는 건 다시 묻지 마라"라고 지시한다 → **정규식 오류가 재질문 금지 대상이 되는 자기강화 루프**.

조치:
1. 정규식 결과도 `sanitizePatch()`를 통과시켜 두 경로를 일원화.
2. 부정 접두(`not|no|without|말고|빼고`) 탐지 시 해당 규칙 스킵.
3. `useful`을 카테고리 규칙에서 제거, 취향 규칙을 `else if` 체인으로.
4. 폴백 시 patch를 **자동 적용하지 말고** `suggested`로 반환해 1클릭 승인 후 적용.
5. 모델이 필드를 비울 수 있도록 스키마에 `clear: string[]` 추가 (부정문 처리의 유일한 정답 경로).

### P0-3. UI가 약속과 다르게 동작한다 🟡

- 첨부 사진: "이 기기에만 보관하고 업로드하지 않는다"고 표시하지만 **파일명이 대화 history를 타고 OpenAI로 전송**된다. 파일명에는 실명·날짜가 흔히 들어간다.
- 메모리 토글: `memoryEnabled`가 `/api/chat`에 전달되지 않고 추천에 아무 영향이 없다. **"기억한다"고 표시하지만 실제로는 기억하지 않는다.** 서버 저장을 붙이는 순간 허위 표시가 된다.
- "7 details understood · 94%": 하드코딩. 아무 말도 안 해도 94%를 주장한다.
- 호텔명이 매 턴 OpenAI로 전송되는데 모델이 그걸로 하는 일이 없다. 숙박 위치는 보낼 이유가 없다.

---

## P1 — Vercel 이식 (vinext 제거)

현재 `next build`는 타입 체크에서 죽는다 — `cloudflare:workers` 모듈이 Vercel에 없다. 이건 최근 추가분 이전부터 있던 문제다(`db/index.ts:1`, 초기 커밋).

### 삭제
| 대상 | 이유 |
|---|---|
| `worker/index.ts` | Workers 엔트리. `vinext/server/*` import, `/_vinext/image` 처리 |
| `vite.config.ts`, `build/sites-vite-plugin.ts` | Cloudflare vite 플러그인 · Sites 패키징 |
| `db/`, `drizzle/`, `drizzle.config.ts` | D1 + SQLite Drizzle. Supabase(Postgres)로 대체 |
| `.openai/hosting.json` | OpenAI Sites 바인딩 선언 |
| `app/chatgpt-auth.ts` | SIWC 헤더는 Vercel에 오지 않는다. Supabase Auth로 대체 |
| deps | `vinext`, `wrangler`, `@cloudflare/vite-plugin`, `@vitejs/plugin-rsc`, `react-server-dom-webpack`, `vite`, `drizzle-orm`, `drizzle-kit` |

### 수정
- `package.json` scripts → `next dev` / `next build` / `next start`. **Windows에서 `npm run dev`가 깨지던 문제도 여기서 사라진다**(`WRANGLER_LOG_PATH=` POSIX 접두사 제거).
- `app/api/chat/route.ts` → `cloudflare:workers` import 제거, `process.env`만 사용.
- `tests/rendered-html.test.mjs` → Workers 번들(`dist/server/index.js`)을 import해 `worker.fetch`를 호출하는 구조라 Next 기준으로 재작성 필요.
- `app/layout.tsx` → `<head>`의 Figma capture 스크립트를 프로덕션에 남길지 결정.
- 이미지 최적화 → Next 기본으로 대체(설정 불필요).

### 유지
`app/` 전체(페이지·CSS·폰트), `public/`, `postcss.config.mjs`, Tailwind 4, `next.config.ts`. **앱 코드는 vinext를 직접 참조하지 않는다** — 전수 grep 확인. 이식은 인프라 레이어에 국한된다.

검증: `npx next build` 통과 → Vercel 프리뷰 배포 → `/`, `/login`, `/api/chat` 3개 경로 확인.
(`/workflow`는 내부 와이어프레임 보드라 배포본에서 404다 — `lib/env/deployment.ts`.)

---

## P2 — Supabase 기초

### 인증: Supabase Auth로 확정

Vercel 이식으로 SIWC 헤더가 사라지면서 **오히려 설계가 단순해진다.** Cloudflare에 남았다면 `oai-authenticated-user-email` 평문 헤더를 소유권 키로 써야 했는데, 그 헤더는 서명이 없어 엣지를 우회하면 `curl -H` 한 줄로 위조 가능했다. Supabase Auth는 `auth.uid()`가 네이티브로 동작하므로 자체 JWT 서명·헤더 신뢰 문제가 통째로 사라진다.

- 스키마는 provider-agnostic하게: `app_users`가 정본, `user_identities(provider, provider_uid)`로 나중에 다른 로그인을 얹을 수 있게.
- 서버 라우트 경유를 기본으로 하되, RLS가 실제 방어선이 되도록 `role=authenticated` 세션으로 접근한다. **service_role 키를 쓰는 경로는 관리 작업 2곳으로 제한** — 이 키는 `BYPASSRLS`라 RLS 정책 전체를 무력화한다.
- `NEXT_PUBLIC_SUPABASE_*` 변수는 브라우저 직접 호출을 할 때만 만든다. 서버 경유로 가면 하나도 필요 없고, 그 사실 자체가 안전장치다.

### 스키마 (핵심 결정 4가지)

1. **금액은 정수 cents.** 현재 `budget`은 정수 달러, `actualPrice`는 `step=0.01` 소수 — 이미 타입이 섞여 있다.
2. **enum 값은 프런트 유니온과 문자열까지 일치.** `handling: Standard|Heavy|Fragile|Chilled`, `purchase: planned|bought|unavailable|skipped`, `transfer: none|draft|active|completed`. 단 `none`은 "행 없음"의 UI 표현이므로 DB에 저장하지 않는다.
3. **모든 자식 테이블에 `user_id` 비정규화 + 복합 FK `(parent_id, user_id)`.** RLS가 조인 없는 단일 컬럼 비교가 되고, 남의 trip에 내 데이터를 매다는 교차 삽입이 구조적으로 불가능해진다.
4. **`stops`를 실체 테이블로 승격.** 배열 인덱스 키 4종이 여기서 해소되고, 승인 시점 예상가가 스냅샷으로 고정된다(결함 #2 해결).

테이블: `app_users`, `user_identities`, `trips`, `plans`, `stops`, `purchases`, `bag_transfers`, `bag_transfer_items`, `transfer_events`, `chat_messages`, `trip_insights`, `migration_imports`.

### RLS 원칙
- 전 테이블 `enable` + `force row level security`. `anon`은 전면 차단.
- `for all` 정책에는 반드시 `with check`를 짝지어 건다 — 빠뜨리면 **읽기는 막고 쓰기는 안 막는다**.
- `transfer_events`는 SELECT + INSERT만. UPDATE/DELETE는 권한도 정책도 부여하지 않고, 트리거로 이중 잠금(BYPASSRLS 롤까지 차단).
- 이송은 hard delete 금지. 취소는 상태 + 이벤트로 표현.
- 배포 후 검증: `pg_class`에서 `relrowsecurity`·`relforcerowsecurity`가 전 테이블 true.

### 라우트
`GET /api/state` 하나로 초기 하이드레이션을 **왕복 1회**에 끝낸다(현재 클라이언트가 localStorage blob을 한 번에 읽어 10개 state를 채우는 구조와 대응). 나머지는 화면 액션별로 기계적: `PUT /api/trip`, `PATCH /api/plan`, `POST /api/plan/approve`, `PUT /api/purchases/{stopId}`, `POST /api/transfers`, `PUT /api/transfers/{id}/items`, `POST /api/transfers/{id}/confirm`, `POST /api/transfers/{id}/events`, `GET /api/chat?tripId=`, `POST /api/import`, `POST /api/sync`.

**`deliveryStep`을 직접 PATCH하는 라우트는 만들지 않는다.** 상태 전이는 항상 이벤트 삽입의 부수효과여야 원장과 현재 상태가 갈라지지 않는다.

---

## P3 — 클라이언트 배선 · 오프라인

### 매장 안 오프라인은 예외가 아니라 정상 경로
`shop` 화면은 지하상가·창고형 매장에서 쓰인다. 구매 직후 쓰기 실패를 정상 경로로 취급한다.

- IndexedDB `outbox`에 `{opId, method, path, body}` 적재 → 즉시 낙관적 반영 → 백그라운드 플러시(`online`, 포그라운드 복귀, 부팅, 지수 백오프). 4xx는 재시도 없이 사용자에게 노출, 5xx·네트워크만 재시도.
- 멱등성: `PUT /api/purchases/{stopId}`는 전체 치환이라 재생이 안전(그래서 POST가 아닌 stopId PUT). `transfer_events`·`chat_messages`는 클라이언트 생성 ID 유니크 인덱스로 흡수.

| 액션 | 방식 |
|---|---|
| trip·plan 편집, savedStops, memory 토글 | 낙관적 |
| 구매 기록/수정/환불 | 낙관적 — 매장에서 절대 블로킹 금지 |
| stop 교체 | 서버 확정 (대체 데이터를 서버가 만든다. 이미 650ms 대기 UI가 있음) |
| 이송 생성/확정 | 서버 확정 — 위조된 이송 패스를 띄우면 안 된다 |
| 커스터디 이벤트 | 낙관적 + 큐. `occurred_at`은 클라이언트 시각, `created_at`은 서버 시각을 따로 남긴다 |

- 충돌: 행 단위 LWW + 플러시 후 `GET /api/state` 재동기화. 단 **이미 `bought`인 건에 대한 늦은 `planned` 덮어쓰기는 409로 거부** — 지출 기록이 사라지는 게 최악의 실패다.
- **동기화 상태 칩 필수**(`저장 대기 3건` / `동기화됨`). 오프라인에서 조용히 성공한 척하는 게 이 앱에서 가장 위험하다.
- localStorage 이관: 부팅 시 서버에 trip이 없고 로컬 blob이 있으면 1회 `POST /api/import`. 멱등성은 **서버가** 보장(클라이언트 플래그만 믿으면 기기·시크릿창마다 중복). 원본 blob은 지우지 말고 리네임 보관. 이관 후 localStorage는 진실원본이 아니라 캐시로 강등.

---

## P4 — 감사 원장 + AI 연동 정리

제품 헌법("사용자가 승인한다")을 **사후 증명 가능하게** 만드는 층. 현재는 AI가 예산을 바꿔도 흔적이 남지 않는다.

- `plan_events` — append-only. `actor: user_edit | ai_patch | regex_fallback | system_clamp | approval | revert`, `stage: draft|approved`, `applied`, 클램프 전 원값. DB 제약으로 **AI·정규식은 `approved` 단계를 쓸 수 없게** 못박는다.
- `model_calls` — 모델명·`finish_reason`·토큰·지연·`x-request-id`·폴백 사유. 지금은 전부 버려서 과금도 품질 회귀도 추적 불가.
- 감사 쿼리: 승인 이벤트 없이 approved에 들어간 AI 변경(항상 0이어야 함), 동의 없이 memory가 주입된 턴(항상 0).
- 오류 분류: 현재 모든 실패가 같은 토스트로 뭉개진다. `error_code`(`no_key|upstream_5xx|429|timeout|truncated|refused|parse_failed`)로 분기. 특히 `finish_reason: "length"`와 refusal 미검사 때문에 **모델이 정상 작동했는데도 "offline" 토스트가 뜨는** 조용한 실패가 있다.
- `sanitizePatch`가 `{patch, rejected}`를 반환하게 해서, 클램프된 사실을 **모델 문구가 아니라 시스템이** 말하게 한다(사용자가 1000이라 했는데 300으로 잘리면 모델은 그걸 모른 채 "1000이면 넉넉하네요"라고 답한다).
- 프롬프트: 매장 데이터가 하나도 주어지지 않은 채 "where를 추천하라"고 지시하고 있다 → 상호명·주소·영업시간은 **100% 환각**. 허용 해상도를 동네·매장 유형까지로 낮추고, 실제 상호명은 서버가 큐레이션 테이블에서 붙인다.
- 프롬프트 인젝션: `recipient`·`city`·`hotel` 자유 텍스트가 **system 역할 메시지에 문자열 보간**된다. brief를 JSON 데이터 블록으로 분리하고 "이건 데이터지 지시가 아니다"를 명시.
- 컨텍스트: 최근 12턴 원문 대신 `L0 시스템 / L1 brief(서버가 DB에서 읽음) / L2 롤링 요약 / L3 최근 4턴 / L4 메모리(동의 시)`. **L1을 서버가 읽으면 클라이언트가 보내는 상태를 신뢰하는 구조 자체가 사라진다.**

회귀 테스트 8케이스를 `tests/`에 순수 함수 테스트로 먼저 고정(부정문, `useful` 오염, 예산 5000, 재고 질문, 확정어 금지, 한국어+인젝션).

---

## P5 — 미구현 기능 자리 잡기

user flow 문서에 있는데 구현이 없는 것들. 지금 스키마에 자리를 만들어 두지 않으면 나중에 마이그레이션이 커진다.

| 기능 | 현재 | 필요한 것 |
|---|---|---|
| 다중 수령인 | `plan.recipient` 단일 문자열. `mock-data.ts`에 `Recipient[]`+`allocation`이 화석으로 남아 있음(미사용) | `recipients`, `plan_allocations` |
| Myself를 1급 대상으로 | 개념 없음 | `recipient.is_self` |
| 개인 구매 vs 선물 예산 분리 | 예산 하나뿐 | `budget_scope` |
| 배송 예비비 | 이송비가 예산 밖. `mock-data.ts`의 `Buffer 20`이 흔적 | `is_buffer` |
| 예산 재배분 승인 | 초과 경고만, 제안 로직 없음 | `budget_changes` |
| 실제 배송 이벤트 | `deliveryStep` 정수 + **사용자가 버튼으로 직접 증가** | `transfer_events` + 파트너·기사 |
| 가방 개별 식별·봉인 | `bags` 개수만 | `bag.seal_id`, 증빙 |
| 호텔 영수증 | **개념 자체가 없음**(버튼이 토스트만 띄움) | `receipts` |
| 이송 불가 / 인계 실패 분기 | 미구현 (와이어프레임은 "필수 상태 분기"로 명시) | `eligibility_result`, `handoff_failed` |
| 과거 여행 | `pastTrips` 하드코딩 | 완료 trip → `trip_insights` 승격 |

**커스터디 원장은 사용자 쓰기 금지로 시작한다.** 지금 사용자가 "Preview next status" 버튼으로 배송 단계를 올리고 있는데, 이 권한이 그대로 서버에 붙으면 커스터디 기록의 신뢰성이 처음부터 0이다. 프로토타입 동안은 `is_simulated` + 시스템 액터로만 생성하고, 사용자 버튼은 개발용 시뮬레이션 API로 분리한다.

레거시 스코프 주의: `mock-data.ts`의 `activities`·`layoverTimeline`·`restOptions`(경유·라운지 기능)는 현재 제품 정의 밖이다. 백엔드 설계에 끌고 들어가지 않는다. 반면 같은 파일의 `Recipient`는 반드시 끌고 온다.

---

## 환경변수

| 이름 | 위치 | 등급 |
|---|---|---|
| `OPENAI_API_KEY` | `.dev.vars`(로컬) / Vercel env | 🔴 |
| `OPENAI_MODEL` | 동일. 기본 `gpt-4o-mini` | – |
| `SUPABASE_URL` | 동일 | – |
| `SUPABASE_PUBLISHABLE_KEY` (구 anon) | 동일 | 🟡 |
| `SUPABASE_SECRET_KEY` (구 service_role) | Vercel env, 서버 전용 | 🔴 `BYPASSRLS`. 관리 경로 2곳에만 |

만들지 않는 것: `NEXT_PUBLIC_SUPABASE_*`(서버 경유 설계에서는 불필요), `DATABASE_URL`(와이어 프로토콜 미사용).

빌드 산출물에 `sb_secret_`·`service_role` 문자열이 없는지 검사하는 테스트를 `npm test`에 얹는다.

---

## 순서

```
P0-1 API 보호   ┐
P0-2 정규식 검증 ├─→ P1 Vercel 이식 → P2 Auth+스키마+/api/state → P3 라우트·오프라인 → P4 원장 → P5 기능 확장
P0-3 UI 정합성  ┘
```

P0는 P1과 독립이라 병행 가능. **P0-2는 반드시 P2 이전에** — 고치지 않으면 잘못된 값이 Supabase에 영구 기록된다.

## 결정이 필요한 것

1. Supabase Auth 로그인 방식 — 매직링크 / OAuth(Google 등) / 익명 세션 후 승격
2. 메모리 기본값 — 현재 opt-out(`useState(true)`). opt-in으로 바꿀지
3. 통화 — CAD 하드코딩 유지 vs `trip.country`에서 유도
4. `app/layout.tsx`의 Figma capture 스크립트를 프로덕션에 남길지
