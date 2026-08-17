# TRAIL 인수인계 — 2026-08-15

새 대화에서 이어갈 때 **이 문서 → `docs/BUILD_PLAN.md` → `CLAUDE.md`** 순으로 읽으면 된다.

## 지금 상태 한 줄

프로토타입이 아니라 **실제로 로그인하고 여행을 등록해서 쓰는 앱**이 됐다. 데모 최소 경로에서 마지막으로 빠진 큰 조각은 **다중 수령인 화면(T4)** 하나다.

- 커밋 `72f4ef2` 기준 · 테스트 **144개 통과** · `npm run lint` · `npx next build` 통과
- API 라우트 16개 · 화면 라우트 18개 · Supabase 테이블 22개(전부 RLS `enable`+`force`) · 마이그레이션 0001~0012 적용
- 배포: **아직 공개 배포 전.** Vercel 환경변수만 넣으면 올라간다(아래 "네가 해야 할 것")

## 끝난 것

| 트랙 | 결과 |
| --- | --- |
| 플랫폼 이식 | Cloudflare/vinext 걷어내고 **Vercel + Next 16**으로. Windows에서 `npm run dev`도 정상 |
| 인증 | Supabase 매직링크 · 세션 갱신 미들웨어 · `(app)` 전체 로그인 게이트 · `/api/*` 인증 |
| 온보딩 | 첫 여행 등록 4단계 → Supabase에 trip + draft plan 생성. 예비비는 서버 견적($15)에서 |
| Trail AI | 실제 모델(`gpt-5.6-luna`) · 구조화 출력 · 다중 수령인 계약 · 환각 가드 · 예비비 비노출 |
| T0 디자인 | 토큰화 완료. 10px 미만 텍스트 **0** · 44px 미달 타깃 **0** · 대비 미달 **0** · 다크 포커스링 9.76 |
| T1 서버 상태 | `lib/state/**` · `GET /api/state` · `POST /api/import` · 오프라인 outbox |
| T3-A 4탭 | `app/page.tsx` 210줄 → 7줄. 라우트 18개 · **액자 제거** · SVG 아이콘 26개 |
| T3-B 배선 | 화면이 서버 상태를 읽는다. **하드코딩 토론토 제거** · 요금 소스 일원화 |
| T5 이송 | 파트너 지점 · QR 패스 · 봉인 태그 · 커스터디 서버 소유 · 이송 불가 6코드 + remedies |
| 쓰기 라우트 | purchases · stops · transfers(생성/매니페스트/확정/이벤트/신고/패스/시뮬) |
| 결제 | **시뮬레이션**(실제 돈 없음). 성공·실패·재시도 경로 동작 |

**실제 계정으로 검증한 것**: 로그아웃 시 전 탭이 `/login`으로, 로그인 후 여행 없으면 `/onboarding`으로. 파리 여행을 등록하면 **파리로 나온다**(전엔 하드코딩 토론토). 지갑 `200 + 15 + 35 = 250`이고 쇼핑 가능액은 `200`(예비비·flexible 미포함).

## ⚠️ 다음 세션에서 **가장 먼저** 확인할 것

**T4 서버 절반이 백그라운드에서 돌던 중에 대화가 끝났다.** 결과 보고를 못 받았으므로:

```bash
git status --short          # 새 파일이 있으면 T4 서버 작업 산출물
npm run lint && npm test && npx next build
```

통과하면 커밋하고, 실패하면 그 지점부터 이어가면 된다. T4 서버가 만들려던 것:
`POST/PATCH/DELETE /api/recipients` · `PUT /api/plans/[id]/allocations` · `POST /api/budget-changes` (+`/approve` `/reject`) · `POST /api/recipients/apply` · `/api/state`에 `recipients`·`allocations` 추가.

## 남은 것

| 순서 | 작업 | 크기 | 비고 |
| --- | --- | --- | --- |
| 1 | **T4 화면** — 수령인별 계획 화면, AI 제안 탭해서 적용, **예산 초과 승인 화면** | L | 데모 경로의 마지막 큰 조각 |
| 2 | **T6 결제 정합** — `payments` 행 기록, 환불, 예비비 부족 승인 UI | M | 지금 시뮬레이션이 DB에 안 쓴다 |
| 3 | **T7 웹앱** — manifest · 서비스워커 · **오프라인 QR 패스** · 설치 | M | 조각별로 선행이 다름 |
| 4 | **카탈로그** — 매장·상품 실데이터 | L | **너만 할 수 있다.** 이게 있어야 AI의 "매장명 금지"를 푼다 |
| 5 | 지도 탭 실구현 | L | 지도 벤더·약관 결정 선행 |

### 알려진 미해결 (QA 보고서 기준)

- **호텔 인계 실패 화면이 없다** — 서버는 코드를 내지만 화면이 없다. 실패 분기 4개 중 이것 하나 남음
- 파트너 커스터디 쓰기 라우트(`/api/partner/custody`) 없음 — 지금은 시뮬레이터가 대신
- 취소 시 환불(`refundDue`)이 화면에 표시만 되고 payments 전이가 없음
- `trips.hotel_id` 미연결 — 온보딩에서 호텔을 `hotels` 행으로 고르게 하면 `hotel_refuses` 판정이 확정된다
- `/workflow` 와이어프레임에 결제·로그인·온보딩 프레임 없음
- `middleware` 파일 규약이 deprecated 경고(`proxy`로 이름 변경 권고)

## 네가 해야 할 것 (내가 못 하는 것)

1. **Vercel 환경변수** — `.env.example`의 이름 그대로. `TRAIL_SIMULATOR`는 **프로덕션에서 비워둘 것**. Supabase → Authentication → URL Configuration의 Redirect URLs에 배포 도메인 추가
2. **OpenAI 프로젝트 월 예산 상한** — 사고 대비. 현재 사용량은 턴당 0.07센트 수준
3. **T8 현장 조사 4개** — 매장 8곳 · 호텔 프런트 8곳 · 위탁 네트워크(Bounce·Stasher) 접촉 · 가격 인터셉트. 비용 0. **매장 방문 시 카탈로그 데이터를 같이 수집**하면 그게 4번 작업이 된다
4. **매직링크 실제 수신 테스트** — Supabase 기본 메일은 시간당 2~4통 제한이라 실사용 전엔 커스텀 SMTP 필요

## 잊으면 안 되는 결정들

- **배송 요금 $15** (`delivery_pricing` 테이블, 코드 상수 아님). $9는 완벽 배칭에서도 건당 33센트라 성립하지 않았다
- **재고 문의(`Request`) 기능 보류** — 수신자가 없다. 연락 경로 없이 "물어봐 드릴까요"는 만들면 안 되는 약속
- **쇼핑 가능액 = `planned − spent`.** flexible은 승인 없이 못 쓴다
- **원장은 append-only**, 여행자가 쓸 수 있는 이송 이벤트는 `dropped_off`·`delayed`·`seal_issue`·`cancelled` 넷뿐
- **배정액에 10 단위 스냅 금지** (58/68/39/45 → 60/70/40/50이 되어 총액이 11 어긋난다)
- 다크 테마는 토큰화 이후로, 카탈로그는 현장 작업(T8)과 함께

## 팀

`.claude/agents/` 에 7명. `trail-product-lead` · `trail-design-lead` · `trail-app-engineer` · `trail-platform-engineer` · `trail-ai-planner` · `trail-venture-strategist` · `trail-release-qa`.
전형적 순서: **product-lead(명세) → design-lead(시각) → app/platform(구현) → release-qa(검수)**.

## 참고 문서

`docs/BUILD_PLAN.md`(트랙과 확정 결정) · `docs/APP_SPEC.md`(화면 46개 명세) · `docs/VENTURE_BRIEF.md`(사업 검증·유닛 이코노믹스) · `docs/tracks/`(트랙별 상세) · `docs/figma/`(피그마 25장)
