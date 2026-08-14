# TRAIL

여행자용 오프라인 쇼핑 플래너 + 호텔 짐 배송 앱. 현재는 목업 데이터로 도는 모바일 프로토타입이다.

> **진행 중인 전환**: 배포 대상을 **Vercel**로, 데이터를 **Supabase**로 옮기는 중이다.
> 아래 스택 표는 전환 전 현재 상태다. 계획과 단계는 [docs/MIGRATION_PLAN.md](docs/MIGRATION_PLAN.md)를 먼저 읽을 것.
> `.claude/agents/trail-data-engineer.md`는 아직 Cloudflare/D1 전제로 쓰여 있다 — P1 완료 시 갱신.

## 스택
- `vinext` 0.0.50 (Cloudflare Workers 위의 Next.js 16 App Router) · React 19 · Tailwind 4 + 수기 CSS
- 선택적 Cloudflare D1 + Drizzle (현재 스키마 비어 있음, `.openai/hosting.json`의 `d1`은 `null`)
- `wrangler.jsonc`를 쓰지 않는다. 바인딩은 `.openai/hosting.json`에 선언하고 `vite.config.ts`가 로컬에서 시뮬레이션한다.
- Node `>=22.13.0`

## 명령
```bash
npm install
npm run dev          # 로컬 개발
npm run build        # vinext 빌드 검증
npm test             # build + 렌더 결과 테스트
npm run lint
npm run db:generate  # 스키마 변경 후 Drizzle 마이그레이션
```

## 파일 지도
| 경로 | 역할 |
| --- | --- |
| `app/page.tsx` | `"use client"` 단일 화면 상태머신 (home/chat/review/picks/shop/drop/tracking/profile) |
| `app/workflow/page.tsx` | 12프레임 제품 워크플로 와이어프레임 (서버 컴포넌트, Next 네비게이션 미사용) |
| `app/mock-data.ts` | 데모 데이터 |
| `app/chatgpt-auth.ts` | SIWC 로그인 헬퍼 |
| `app/*.css` | 압축 표기 디자인 시스템 (토큰은 `globals.css`의 `:root`) |
| `db/`, `drizzle/`, `examples/d1/` | D1 + Drizzle (opt-in) |
| `worker/index.ts` | Workers 엔트리 — 이미지 최적화 분기 + vinext 핸들러 |
| `docs/TRAIL_USER_FLOW_EN.md` | 제품 흐름 단일 진실원본 |

## 제품 규칙
1. Trail은 추천·계산만 한다. **예산 변경·구매·대체품·배송은 항상 사용자가 승인**한다.
2. 구매는 사용자가 매장에서 직접 한다. TRAIL은 경로 추천과 구매한 짐의 호텔 이송까지다.
3. 실데이터가 아닌 재고·지도·이송 정보는 화면에 `Sample` / `Simulated`로 표기한다.
4. 실패 분기 네 개는 항상 살아 있어야 한다: 추천 불가 / 실제가 예산 초과 / 이송 불가 / 호텔 인계 실패.
5. `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`은 플랫폼 예약 경로 — 앱 라우트를 만들지 않는다. 식별 헤더에 의존하는 페이지는 `export const dynamic = "force-dynamic"`.

## 코드 스타일
이 저장소는 **극도로 압축된 한 줄 스타일**을 쓴다 (TSX 컴포넌트·타입·핸들러 한 줄, CSS 규칙 한 줄). 새 코드도 같은 밀도로 쓰고, 예쁘게 풀어쓰지 않는다. 주석은 비자명한 이유가 있을 때만.

## 팀 (`.claude/agents/`)
| 에이전트 | 언제 부르나 |
| --- | --- |
| `trail-product-lead` | 새 기능의 화면 흐름·상태 분기·승인 게이트·영문 카피를 먼저 정할 때 |
| `trail-frontend-engineer` | 화면 동작·상태머신·컴포넌트 구현 (기본 담당) |
| `trail-ui-stylist` | 디자인 토큰·CSS·정보 밀도·접근 가능한 시각 위계 |
| `trail-data-engineer` | D1/Drizzle 스키마, API 라우트, worker, 목업→영속 전환 |
| `trail-ai-planner` | Trail AI 대화 정책, 자연어→plan 추론, LLM 연동·프롬프트 |
| `trail-release-qa` | 배포 전 검수 (빌드/린트/테스트 + 제품 규칙 + 접근성), 수정은 하지 않음 |

전형적인 순서: **product-lead(명세) → frontend/data/ai(구현) → ui-stylist(시각 정리) → release-qa(검수)**.
