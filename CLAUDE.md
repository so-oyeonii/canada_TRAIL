# TRAIL

여행자용 오프라인 쇼핑 플래너 + 호텔 짐 배송 앱.

## 스택
- Next.js 16 App Router · React 19 · Tailwind 4 + 수기 CSS · **Vercel 배포**
- **Supabase** — Postgres 28테이블 (`0001`이 만든 `trip_insights`는 `0022`가 드롭), 전 테이블 RLS `enable` + `force`. 매직링크 로그인
- OpenAI `gpt-5.6-luna` (Trail AI 대화)
- Node `>=22.13.0`

## 명령
```bash
npm install
npm run dev      # 로컬 개발
npm run build    # Vercel이 돌리는 것과 같은 빌드
npm test         # brief 가드 회귀 테스트
npm run lint
```

## 파일 지도
| 경로 | 역할 |
| --- | --- |
| `app/(app)/` | 로그인 후 화면 전부. 라우트 그룹이고 탭은 `shell.tsx`, 공유 상태는 `app-state.tsx` |
| `app/(app)/trail/`, `app/(app)/bags/`, `app/(app)/ask/` | 계획·경로·쇼핑 / 짐 이송·결제·추적 / Trail AI 대화 |
| `app/page.tsx` | 랜딩 규칙. Home 탭으로 리다이렉트하고, `/auth/callback`을 놓친 매직링크를 넘겨받는다. **화면 상태머신은 여기 없다** — `(app)`으로 옮겼다 |
| `app/onboarding/` | 첫 여행 등록 4단계 + 예산 3버킷 분할 |
| `app/login/`, `app/auth/callback/` | Supabase 매직링크 로그인 |
| `app/s/[token]/` | 취소 가능한 읽기 전용 공유 링크 (`0026`). 호텔과 ETA는 어떤 토글로도 나가지 않는다 |
| `app/workflow/` | 제품 흐름 참조 화면 (내부용) |
| `app/api/chat/` | Trail AI 한 턴 (구조화 출력, 레이트리밋, 동일 출처) |
| `app/api/trips/` | 첫 여행 + 지갑 생성 (브라우저는 plans를 직접 쓰지 않는다) |
| `app/api/plans/`, `app/api/recipients/`, `app/api/budget-changes/` | 수령인 · 배분 · 예산 변경 제안/승인 |
| `app/api/payments/simulate/` | 결제 시뮬레이션 (실제 돈 없음, `payments` 행은 진짜로 쓴다) |
| `app/api/partner/scan/`, `app/api/survey/export/` | `getTraveler()`를 쓰지 않는 두 라우트. 각각 파트너 공유키와 export 토큰으로 인증하고, 키가 없으면 403이 아니라 404 |
| `app/trail-brief.ts` | 프롬프트 · 출력 스키마 · brief 가드 |
| `lib/api/http.ts` | 모든 쓰기 라우트의 공통 관문 (`sameOrigin` · `carriesIdentity` · 필드 리더) |
| `lib/api/rate-limit.ts` | `/api/chat` 쿼터 2단 (인스턴스 버스트 + `record_chat_hit` 내구 카운터) |
| `lib/supabase/` | 브라우저 · 서버 클라이언트 (`getTraveler()`), 그리고 `admin.ts` (service key — 규칙은 파일 상단에) |
| `proxy.ts` | 세션 갱신 (Next 16에서 `middleware.ts`를 대체) |
| `supabase/migrations/` | 스키마와 RLS 정책. `0027`~`0029`는 G6 2단계 예약 번호 |
| `docs/MIGRATION_PLAN.md` | 단계별 계획 (P0~P5) |
| `docs/figma/` | 피그마 참조 프레임 25장 |
| `docs/TRAIL_USER_FLOW_EN.md` | 제품 흐름 |

## 제품 규칙
1. Trail은 추천·계산만 한다. **예산 변경·구매·대체품·배송은 항상 사용자가 승인**한다. 마이그레이션 `0013` 이후 이건 관례가 아니라 DB 권한이다 — 브라우저는 예산 변경을 **제안**만 할 수 있고, 승인은 `service_role`만 실행하는 함수 안에서 일어난다.
2. 구매는 사용자가 매장에서 직접 한다. TRAIL은 경로 추천과 구매한 짐의 호텔 이송까지다. `Request`는 **재고 문의**이지 주문·예약이 아니다.
3. 실데이터가 아닌 재고·지도·이송·결제 정보는 화면에 `Sample` / `Simulated`로 표기한다.
4. 실패 분기 네 개는 항상 살아 있어야 한다: 추천 불가 / 실제가 예산 초과 / 이송 불가 / 호텔 인계 실패.
5. 금액은 정수 cents. 지갑은 `total = planned + delivery_reserve + flexible`이고 DB 제약이 강제한다. **쇼핑 가능액은 `planned − spent`** — flexible은 승인 없이 쓸 수 없다.
6. 원장(`transfer_events`, `plan_events`, `receipts`)은 append-only. 서버에서만 신원을 읽고, 클라이언트가 보낸 `user_id`는 믿지 않는다.
7. 돈이 나가는 라우트는 `/api/chat` 하나뿐이고, 그 쿼터는 인스턴스가 아니라 DB 행이 센다 (`0030`). 카운터를 못 읽으면 **닫는 쪽으로** 실패한다 — 여행자는 이미 그려진 `rate_limited` 분기를 본다.

## 코드 스타일
이 저장소는 **극도로 압축된 한 줄 스타일**을 쓴다 (TSX 컴포넌트·타입·핸들러 한 줄, CSS 규칙 한 줄). 새 코드도 같은 밀도로 쓰고, 예쁘게 풀어쓰지 않는다. 주석은 비자명한 이유가 있을 때만.

## 팀 (`.claude/agents/`) — TF 7명

| 에이전트 | 겸하는 역할 |
| --- | --- |
| `trail-product-lead` | 기획 · IA · 흐름/승인 게이트 · 격차 분석 · 이송 도메인 규칙 · 영문 카피 |
| `trail-design-lead` | 비주얼 · 디자인 시스템 · UI 치수/비례 · 반응형 · 접근성 |
| `trail-app-engineer` | 프런트 구현 · 상태머신 · 반응형 레이아웃 · PWA 전환 |
| `trail-platform-engineer` | Supabase/RLS · 인증 · API · 결제 · 커스터디 원장 · 오프라인 동기화 |
| `trail-ai-planner` | 대화 정책 · 프롬프트 · 출력 스키마 · 근거 카탈로그(환각 통제) |
| `trail-venture-strategist` | 사업 검증 · 유닛 이코노믹스 · 경쟁 · 리스크 · 부트캠프 피치 |
| `trail-release-qa` | 배포 전 검수 (빌드 · 제품 규칙 · 접근성 · 보안), 수정하지 않음 |

전형적인 순서: **product-lead(명세) → design-lead(시각) → app/platform(구현) → release-qa(검수)**.
`trail-venture-strategist`는 제품 결정이 사업 모델에 영향을 줄 때 함께 부른다.
