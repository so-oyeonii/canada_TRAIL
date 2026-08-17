# TRAIL 인수인계 — 2026-08-18

새 대화에서 이어갈 때 **이 문서 → `docs/BUILD_PLAN.md` → `CLAUDE.md`** 순으로 읽으면 된다.

## 지금 상태 한 줄

데모 최소 경로가 **끝에서 끝까지 이어진다.** 여행 등록 → 수령인 등록 → 예산 배분 → 초과 승인 → 매장 구매 기록 → 짐 이송 → 결제 → 추적까지 화면과 서버가 모두 있다.

- 테스트 **230개 통과** · `npm run lint` 경고 0 · `npx next build` 통과 (deprecated 경고도 0)
- API 라우트 18개 · 화면 라우트 20개 · Supabase 테이블 22개(전부 RLS `enable`+`force`) · 마이그레이션 **0001~0013**
- 배포: **아직 공개 배포 전.** 아래 "네가 해야 할 것" 1·2번만 하면 올라간다

## 이번에 끝난 것 (2026-08-18)

| 작업 | 결과 |
| --- | --- |
| **승인 게이트를 DB가 강제** | 마이그레이션 `0013`. `plans`·`budget_changes`의 UPDATE/DELETE를 `authenticated`에서 회수. 브라우저는 여행의 **첫 draft plan 하나만** INSERT할 수 있고, 예산 변경은 **제안만** 할 수 있다. `plan_events`에 `stage='approved'`·`actor='approval'` 행도 브라우저가 못 쓴다 |
| **승인은 한 트랜잭션** | `approve_budget_change` / `reject_budget_change` 함수. plan + allocations + 상태 확정 + 원장 기록이 한 번에. `service_role`만 실행 가능(`security invoker` — FORCE RLS 때문에 definer는 소유자 BYPASSRLS에 기대게 된다) |
| **온보딩이 서버로** | `POST /api/trips`. 브라우저는 이제 `trips`·`plans`를 직접 쓰지 않는다. 예비비는 도시별 `delivery_pricing` 견적, 3버킷 분할, 통화별 minor unit 변환 모두 서버가 결정 |
| **T4 화면** | `/trail/plan/people` (수령인 CRUD · 인당/그룹 기준 배분 · 10단위 스냅 없음 · equal-value 충돌 표시) · `/trail/plan/approval` (승인 게이트 화면, before→after 버킷 diff, 승인/거절 둘 다 기록) · 대기 중 제안은 plan 5개 렌즈 전부에 배너 |
| **T6 결제 정합** | `/api/payments/simulate`가 `payments` 행을 실제로 쓴다. **금액은 클라이언트가 못 보낸다** — 확정 시 transfer에 얼어붙은 `fee_cents`를 청구. 성공 시 `paid` 이벤트까지 넣어야 상태가 움직인다(0012). 실패도 행으로 남고, 취소하면 captured 결제가 `refunded`로 전이된다 |
| 잔재 정리 | 죽은 `time` 필드 제거 · `middleware.ts` → `proxy.ts` (Next 16 규약) |

### 클라이언트 상태에 추가된 것

`app/(app)/app-state.tsx`가 `recipients` · `budgetChanges` · `pendingBudgetChange` · `planId`를 노출하고, 액션 6개(`addRecipient` · `updateRecipient` · `archiveRecipient` · `saveAllocations` · `proposeBudgetChange` · `decideBudgetChange`)를 준다. **이 여섯은 outbox를 타지 않는다** — 지하에서 큐에 갇힌 제안은 승인 게이트가 조용히 실패하는 것과 같다.

## ⚠ 다음 세션에서 가장 먼저 확인할 것

**마이그레이션 0013이 실제 Supabase 프로젝트에 적용됐는지.** 적용 전에는 코드가 `service_role`로 승인을 시도하는데 함수가 없어 500이 난다. 적용 후 SQL 에디터에서 여행자 계정으로 아래 넷이 **전부 실패**해야 한다(파일 맨 아래에도 적어뒀다):

```sql
update plans set status = 'approved' where user_id = auth.uid();
update plans set planned_cents = planned_cents + 100000 where user_id = auth.uid();
update budget_changes set status = 'approved' where user_id = auth.uid();
insert into plan_events (plan_id, trip_id, user_id, actor, applied, stage) values (…, 'approval', true, 'approved');
```

## 남은 것

| 순서 | 작업 | 크기 | 비고 |
| --- | --- | --- | --- |
| 1 | **T7 웹앱** — manifest · 서비스워커 · **오프라인 QR 패스** · 설치 | M | 조각별로 선행이 다름 |
| 2 | **카탈로그** — 매장·상품 실데이터 | L | **너만 할 수 있다.** 이게 있어야 AI의 "매장명 금지"를 푼다 |
| 3 | 지도 탭 실구현 | L | 지도 벤더·약관 결정 선행 |
| 4 | 파트너 커스터디 쓰기 라우트(`/api/partner/custody`) | M | 지금은 시뮬레이터가 대신한다 |
| 5 | `trips.hotel_id` 연결 | S | 온보딩에서 호텔을 `hotels` 행으로 고르게 하면 `hotel_refuses` 판정이 확정된다 |

### 알려진 미해결

- **JPY·KRW 표시**: `app/(app)/view.ts`의 `money()`가 무조건 100으로 나눈다. 저장·배분은 `MINOR_UNITS`로 정확한데(30,000엔은 30,000으로 들어간다) **화면 숫자만** 엔·원에서 틀린다. 배분 화면도 앱 전체 관례(×100)를 따르므로 자기모순은 없다
- **결제 통화 vs 여행 통화**: `delivery_pricing`은 도시별 통화로 견적하고 FX 테이블이 없다. 지금은 단위 수로 옮긴다(`/api/trips` 주석 참고). 다통화 도시가 생기기 전에 정해야 한다
- `/workflow` 와이어프레임에 결제·로그인·온보딩·승인 프레임 없음
- 승인/거절·결제·이송 확정·커스터디는 **모두 서비스 키를 요구**한다. 키가 없으면 503이고, 절반만 승인되는 일은 없다

## 네가 해야 할 것 (내가 못 하는 것)

1. **마이그레이션 0013 적용** — Supabase SQL 에디터 또는 `supabase db push`. 위 검증 4줄까지
2. **환경변수** — `SUPABASE_SERVICE_ROLE_KEY`가 이제 **필수**다(`.env.example` 3번 항목 갱신해뒀다). 로컬 `.env.local`에는 이미 들어 있다. Vercel Project → Settings → Environment Variables에 같은 이름으로 넣고, `TRAIL_SIMULATOR`는 프로덕션에서 비워둘 것. Supabase → Authentication → URL Configuration에 배포 도메인 추가
3. **로그인해서 새 화면 두 개 눈으로 확인** — 매직링크가 필요해서 내가 못 본다. `/trail/plan/people`에서 사람 추가 → 금액 입력 → 저장, 그리고 일부러 예산보다 크게 넣어 `/trail/plan/approval`까지 가보는 경로
4. **OpenAI 프로젝트 월 예산 상한**
5. **매직링크 실수신 테스트** — Supabase 기본 메일은 시간당 2~4통 제한이라 실사용 전엔 커스텀 SMTP 필요
6. **T8 현장 조사 4개** — 매장 8곳 · 호텔 프런트 8곳 · 위탁 네트워크(Bounce·Stasher) 접촉 · 가격 인터셉트. 비용 0. **매장 방문 시 카탈로그 데이터를 같이 수집**하면 그게 남은 작업 2번이 된다

## 잊으면 안 되는 결정들

- **배송 요금 $15** (`delivery_pricing` 테이블, 코드 상수 아님)
- **재고 문의(`Request`) 기능 보류** — 수신자가 없다
- **쇼핑 가능액 = `planned − spent`.** flexible은 승인 없이 못 쓴다
- **원장은 append-only**, 여행자가 쓸 수 있는 이송 이벤트는 `dropped_off`·`delayed`·`seal_issue`·`cancelled` 넷뿐
- **배정액에 10 단위 스냅 금지** (58/68/39/45 → 60/70/40/50이 되어 총액이 11 어긋난다). 화면·라우트·테스트 세 군데에서 막고 있다
- **결제 금액은 서버가 정한다** — 확정 시 얼어붙은 `bag_transfers.fee_cents`
- 다크 테마는 토큰화 이후로, 카탈로그는 현장 작업(T8)과 함께

## 팀

`.claude/agents/` 에 7명. `trail-product-lead` · `trail-design-lead` · `trail-app-engineer` · `trail-platform-engineer` · `trail-ai-planner` · `trail-venture-strategist` · `trail-release-qa`.
전형적 순서: **product-lead(명세) → design-lead(시각) → app/platform(구현) → release-qa(검수)**.

## 참고 문서

`docs/BUILD_PLAN.md`(트랙과 확정 결정) · `docs/APP_SPEC.md`(화면 46개 명세) · `docs/VENTURE_BRIEF.md`(사업 검증·유닛 이코노믹스) · `docs/tracks/`(트랙별 상세) · `docs/figma/`(피그마 25장)
