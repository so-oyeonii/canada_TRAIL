# TRAIL — 전체 앱 구성 명세서

작성: trail-product-lead · 2026-08-15
대상 독자: design-lead, app-engineer, platform-engineer, ai-planner, release-qa

이 문서는 **구현 전 단일 진실원본**이다. 화면이 여기에 없으면 만들지 않는다.
흐름이 바뀌면 이 문서 → `docs/TRAIL_USER_FLOW_EN.md` → `docs/MIGRATION_PLAN.md` 순으로 함께 고친다.

## 전제 (확정 — 재논의 금지)

| 항목 | 확정 내용 |
| --- | --- |
| 배포 | Vercel |
| 데이터 | Supabase Postgres 21테이블 + RLS `enable`+`force` (`supabase/migrations/0001_schema.sql`, `0002_rls.sql`) |
| 로그인 | Supabase 매직링크 (`/login` → `/auth/callback`) |
| 결제 | 도입 확정. 현재 `/api/payments/simulate`로 시뮬레이션 (실제 돈 없음) |
| Request | **재고 문의**. 주문·예약·결제가 아니다 (`store_inquiries`) |
| 탭 | 4개 |
| 폼팩터 | **웹 우선 → 웹앱(PWA)**. 설치 가능한 모바일 웹앱이 목표 |
| 금액 | 정수 cents. `total = planned + delivery_reserve + flexible` |
| 이송 모델 | 사용자가 파트너 매장까지 직접 걸어감 → 직원 QR 확인 → 가방마다 Trail 태그 → 호텔은 태그 ID 집합 대조로 인계 완료 |

## 제품 헌법 (모든 화면이 지켜야 함)

1. Trail은 추천·계산만 한다. **예산 변경·구매·대체품·배송은 항상 사용자가 승인**한다.
2. 구매는 사용자가 매장에서 직접 한다. `Request`는 재고 문의다.
3. 실데이터가 아닌 재고·지도·이송·결제는 `Sample` / `Simulated`로 표기한다 (`data_source` 컬럼이 근거).
4. 실패 분기 넷은 항상 살아 있다: **추천 불가 / 실제가 예산 초과 / 이송 불가 / 호텔 인계 실패**.
5. 쇼핑 가능액 = `planned − spent`. flexible은 승인 없이 못 쓴다.
6. 확정어(confirmed / booked / done / guaranteed) 금지. 우리가 통제하지 않는 사실은 `estimated` / `sample` / `to confirm`.

---

# 1. 전체 IA

## 1.1 탭 4개 — 확정

피그마에 3가지 탭 구성이 섞여 있었다.
`Home·Trips·AI·Bags`(Home.png, -15, 손그림) / `Trips·Trail·Ask AI·Bags`(기본 프레임, -12, -14) / `Trips·Trail·Bags`(-2, 잘림).

**확정: `Trips · Trail · Ask AI · Bags`**

`Home`을 별도 탭으로 두지 않는 이유: 피그마 -15의 Home("Good morning", Plan with AI, 근처 추천)과 -2의 Trail 대시보드("Good morning", Toronto Trail 카드, 지갑)는 **같은 화면의 두 버전**이다. 여행이 하나라도 활성이면 Home은 곧 그 여행의 대시보드다. 별도 탭으로 두면 "여행 없음"일 때 Home과 Trips가 같은 내용을 보여주는 중복이 생긴다.

| 탭 | 아이콘 | 한 줄 정의 | 담는 것 |
| --- | --- | --- | --- |
| **Trips** | ✈ | 내 여행 전부 | 여행 목록(현재/예정/과거), 여행 생성, 여행 상세·설정, 과거 여행 기록·인사이트, 계정 진입 |
| **Trail** | ◎ | 활성 여행 작업대 | 대시보드(지갑·진행률·다음 액션), 계획 4탭(Gifts·Map·Budget·Delivery), 매장 내 쇼핑 모드, 구매 기록, 예산 초과 승인 |
| **Ask AI** | ◈ | Trail AI 대화 | 대화, brief 요약 카드, brief 편집, 계획 생성 트리거 |
| **Bags** | ▣ | 구매 이후 전부 | 가방 선택(플랜 외 가방 포함), 적격성, 이송 검토, 결제, 드롭오프, 추적, 영수증, 이상 신고 |

**계정·설정은 탭이 아니다.** 피그마 전 프레임의 우상단 원형 아바타가 진입점이다 (`Trips` 헤더 + `Trail` 헤더).

## 1.2 탭 선택 규칙 (활성 상태)

| 조건 | 앱 부팅 시 착지 |
| --- | --- |
| 미로그인 | `/login` |
| 로그인 · 여행 0건 | `Trips` (빈 상태 → 첫 여행 등록) |
| 로그인 · 활성 여행 있음 · 계획 없음 | `Trail` 대시보드 (빈 상태 → Ask AI 유도) |
| 로그인 · 계획 승인됨 · 쇼핑 전 | `Trail` ▸ Plan ▸ Gifts |
| 쇼핑 중 | `Trail` ▸ Shopping |
| 이송 진행 중(`bag_transfers.status ∈ paid..in_transit`) | `Bags` ▸ Tracking |
| 이송 완료 후 24h 이내 | `Bags` ▸ Delivered/Receipt |

탭 아이콘 배지: `Bags`에 이송 진행 중이면 점 배지, 이상 신고 대기면 경고 배지.

## 1.3 계획 화면의 인페이지 탭 — 선형 3화면을 대체하는 방식

현재 구현은 `picks → shop → drop` **선형**이다. 계획을 세운 순간부터 이송까지 한 방향으로만 흐르고, 되돌아가면 진행이 어긋난다.
피그마는 `Gifts | Map | Budget | Delivery` **인페이지 탭**이다. 같은 계획을 네 각도에서 본다.

통합 원칙: **인페이지 탭은 "계획을 보는 렌즈"이고, 선형 흐름은 "여행의 단계"다. 둘은 다른 축이므로 겹치지 않게 나눈다.**

```
Trail 탭
├─ Dashboard            (단계와 무관한 진입점 · 지갑 · 다음 액션)
├─ Plan                 (인페이지 탭 4개 — 언제나 자유 이동)
│   ├─ Gifts     ← 기존 picks의 "무엇을 살 것인가"
│   ├─ Map       ← 기존 picks의 "어디로 갈 것인가" (경로·순서·도보시간)
│   ├─ Budget    ← 신규. Trip Wallet (기존 review의 예산 슬라이더가 여기로)
│   └─ Delivery  ← 기존 drop의 "요약 카드"만. 실제 실행은 Bags 탭
└─ Shopping             (매장 내 모드 — 계획이 승인된 뒤에만 진입 가능)
```

| 기존 선형 화면 | 새 위치 | 비고 |
| --- | --- | --- |
| `picks` 상품 카드 목록 | Trail ▸ Plan ▸ **Gifts** | 카드마다 `Request`(재고 문의) 버튼 추가 |
| `picks` 경로 라인 | Trail ▸ Plan ▸ **Map** | 순서 변경·건너뛰기 |
| `review` 예산 슬라이더 | Trail ▸ Plan ▸ **Budget** | 3버킷 지갑으로 승격 |
| `drop` 적격성 요약 | Trail ▸ Plan ▸ **Delivery** (읽기 요약) + Bags ▸ 실행 | 읽기와 실행 분리 |
| `shop` 매장 내 체크리스트 | Trail ▸ **Shopping** | Plan의 탭이 아님 — 별도 모드 |
| `drop` 가방 선택 | **Bags** ▸ Select | 플랜 외 가방 추가 가능 |

**왜 Delivery가 두 곳에 있는가**: Plan ▸ Delivery는 "계획대로면 배송은 이렇게 된다"는 **예상**이고(구매 0건에도 보인다), Bags 탭은 "실제 산 가방을 지금 보낸다"는 **실행**이다. 전자는 계획의 일부라 승인 게이트가 없고, 후자는 돈이 움직이므로 게이트가 있다.

**되돌아가기**: 인페이지 탭은 항상 자유 이동. 단, 계획을 편집하면(`plans.status='approved'`인데 draft가 갈라지면) Gifts/Map 상단에 `Plan changed — rebuild the route` 배너가 뜨고, 이송 진행 중이면 계획 편집이 잠긴다(읽기 전용 + `Editing is locked while bags are in transit`).

## 1.4 현재 9화면 → 새 IA 매핑 (전수)

| 현재 `Screen` | 파일 위치 | 새 위치 | 처리 |
| --- | --- | --- | --- |
| `home` | `app/page.tsx` | **Trail ▸ Dashboard** | 재구성. hands-free 히어로 유지, 지갑 3버킷·진행률·다음 액션 추가. `starters`는 Ask AI로 이동 |
| `chat` | 동 | **Ask AI** | 유지 + 서버 저장(`chat_messages`), 메모리 스트립을 항목별 동의로 교체 |
| `review` | 동 | **Ask AI ▸ Brief 요약 카드**(피그마 -14) + **Ask AI ▸ Edit brief**(전체 화면) + 예산은 **Trail ▸ Plan ▸ Budget** | 3분할. `94%` 하드코딩 제거 |
| `picks` | 동 | **Trail ▸ Plan ▸ Gifts / Map** | 2분할 |
| `shop` | 동 | **Trail ▸ Shopping** + **Trail ▸ Record purchase**(피그마 -4) | 구매 시트를 전체 화면으로 승격 |
| `drop` | 동 | **Bags ▸ Select** + **Bags ▸ Review delivery**(피그마 -8) | 2분할. 적격성 판정 분리 |
| `pay` | 동 | **Bags ▸ Payment**(-9) + **Bags ▸ Payment failed**(-10) | 유지 |
| `tracking` | 동 | **Bags ▸ Drop-off**(-11) + **Bags ▸ Tracking**(-12) + **Bags ▸ Delivered**(-13) | 3분할. 사용자 `Preview next status` 버튼 제거 |
| `profile` | 동 | **Trips ▸ Trip detail**(여행 필드·지역) + **Trips ▸ Past trips** + **Account ▸ Memory & privacy** | 3분할. 한 화면에 여행 편집·메모리·과거여행이 섞여 있던 것을 해체 |
| `/workflow` | `app/workflow/page.tsx` | **제품 표면 아님** | 내부 문서로 유지. 탭·네비게이션에서 링크 제거 (현재 profile에 있는 링크 삭제) |

## 1.5 라우팅

현재는 `app/page.tsx` 하나에 9화면 `useState` 상태머신이다. 4탭 IA에서는 **URL이 있어야 한다** (탭 전환·뒤로가기·PWA 딥링크·공유).

```
/                         → 활성 탭으로 리다이렉트 (1.2 규칙)
/login                    · /auth/callback
/onboarding               (첫 여행 등록 4단계 — 이미 구현)
/trips                    · /trips/new · /trips/[tripId] · /trips/[tripId]/past
/trail                    (활성 여행 대시보드)
/trail/plan               → /trail/plan/gifts | /map | /budget | /delivery
/trail/shop               · /trail/shop/[stopId]/record
/ask                      (Ask AI) · /ask/brief
/bags                     → /bags/select | /review | /pay | /dropoff | /track | /receipt/[transferId]
/account                  → /account/memory | /notifications | /payment | /data
```

`/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`은 만들지 않는다 (플랫폼 예약 경로).
식별 헤더·세션에 의존하는 서버 컴포넌트는 `export const dynamic = "force-dynamic"`.

## 1.6 폼팩터 전환 — 390px 목업 프레임 폐기

현재 `app/globals.css`의 `.stage`(회색 배경 + 가운데 정렬) + `.phone`(390×844 테두리 + 노치 상태바)는 **데모용 액자**다. 실제 웹앱에서는 액자가 브라우저 크롬과 이중으로 겹친다.

| 항목 | 현재 | 전환 후 |
| --- | --- | --- |
| 컨테이너 | `.phone` 390×844 고정 + 7px 테두리 | `max-width: 480px` 중앙 정렬, 높이는 `100dvh` |
| 가짜 상태바 | `.status-bar` (9:41, 배터리 아이콘) | **삭제**. 실제 OS 상태바가 그 자리 |
| 홈 인디케이터 | `.home-indicator` | **삭제**. `env(safe-area-inset-bottom)`로 대체 |
| 데스크톱 | 액자 안에 표시 | ≥768px에서 2열(좌: 내비+지갑, 우: 본문) 또는 중앙 단일 컬럼 — design-lead 결정 |
| 폰트 크기 | 5–15px (액자 축소 전제) | 최소 본문 14px, 라벨 11px로 재조정 필요 (**접근성 차단 항목**) |

현재 CSS는 5.5px 탭 라벨, 6px 캡션을 쓴다. 액자 밖으로 나가면 그대로 읽을 수 없다. **뷰포트 전환은 타이포 재조정과 한 묶음이다.**

PWA 요구 (현재 전무):
- `public/manifest.webmanifest` — `display: standalone`, `theme_color: #12333c`, 192/512 아이콘, `start_url: /`
- 서비스워커 — 앱 셸 캐시 + 오프라인 폴백 화면 (`/offline`)
- 설치 프롬프트 — `beforeinstallprompt` 후킹, Account에 `Install Trail` 항목
- iOS: `apple-touch-icon`, `appleWebApp`은 `layout.tsx`에 이미 있음. **iOS PWA는 웹푸시 제약이 있다** (결정 필요 항목 7번)

---

# 2. 화면 목록 전수

표기: **[기존]** 이미 구현됨 · **[재구성]** 있지만 재배치·재설계 필요 · **[신규]** 아무것도 없음 · **[폐기]** 없앤다
크기: S(≤0.5일) / M(1–2일) / L(3일+)

각 화면은 역할 정의의 산출 형식을 따른다: 진입 · 액션 · 이탈 · 유지 상태 · 상태분기 · 승인게이트 · 실패경로 · 카피 · 크기.

---

## 2.A 인증

### AU-1 · Sign in (매직링크) — [기존] · S
- **진입** 미로그인 상태의 모든 경로 / `/login?next=…`
- **액션** 이메일 입력 → `Email me a sign-in link`
- **이탈** 메일 발송 → AU-2
- **유지** 입력한 이메일, `next` 파라미터
- **상태분기** 로딩(`Sending link…`) · 오류(레이트리밋/잘못된 주소) · 오프라인(`You're offline. The link needs a connection.`)
- **승인게이트** 없음
- **실패경로** 해당 없음
- **카피** `Your trips, saved and synced.` / `No password to remember`
- **비고** 현재 구현됨. 오프라인 분기와 레이트리밋 카피만 추가

### AU-2 · Check your inbox — [기존] · S
- **진입** AU-1 발송 성공
- **액션** `Use a different email` / (수동) 메일 앱 이동
- **이탈** 링크 클릭 → `/auth/callback` → 원래 목적지
- **상태분기** 재발송 쿨다운(60초) 표시 — **현재 없음, 추가 필요**
- **카피** `Check your inbox` / `We sent a sign-in link to {email}. Open it on this device to continue.` / `Resend in 0:47`

### AU-3 · Link expired / invalid — [신규] · S
- **진입** `/auth/callback` 실패 (`?error=missing_code|exchange_failed`) 또는 다른 기기에서 링크를 연 경우
- **액션** `Send a new link` → AU-1
- **상태분기** 만료 · 이미 사용됨 · 다른 기기
- **카피** `That link has expired.` / `Sign-in links work once, on the device that asked for them. We can send a fresh one.`
- **비고** 현재는 `/login?error=…`로 리다이렉트만 하고 **화면에 아무 설명도 없다.** 사용자는 왜 실패했는지 모른다

### AU-4 · Sign out — [신규] · S
- **진입** Account ▸ `Sign out`
- **액션** 확인 시트: `Sign out` / `Cancel`
- **이탈** 세션 종료 → AU-1
- **승인게이트** ✔ 확인 필요 (오프라인 대기 건이 있으면 경고)
- **실패경로** 아웃박스에 미전송 건이 있으면: `3 changes haven't been saved yet. Sign out anyway?` + `Wait and retry`
- **카피** `Sign out of Trail?` / `Your trips stay on your account.`

---

## 2.B 첫 실행 · 여행 등록

### ON-0 · First run — 가치 소개 + 권한 프라이밍 — [신규] · M
- **진입** 로그인 직후 `app_users.first_run_done_at is null`
- **액션** 3장 스와이프 → `Get started`. 중간에 권한 프라이밍 2개
- **이탈** ON-1 (첫 여행 등록)
- **유지** `app_users.first_run_done_at`
- **상태분기** 건너뛰기 가능 · 재방문 시 표시 안 함
- **승인게이트** ✔ 권한 프라이밍은 **OS 다이얼로그 전에 앱 안에서 먼저 설명**한다 (거부 후 복구가 불가능하므로)
- **카피**
  - 1장 `Find local gifts along the route you're already walking.`
  - 2장 `Buy in store yourself. Trail carries the bags to your hotel.`
  - 3장 (위치) `Trail uses your location only to order today's stops. It works without it — stops just won't reorder as you walk.` → `Allow location` / `Not now`
  - 3장 (알림) `We'll tell you when your bags are collected and when the hotel has them. Nothing else.` → `Turn on updates` / `Not now`
- **비고** `Not now`를 선택해도 앱은 전부 동작해야 한다. 위치 없으면 Map 탭이 "출발지 직접 선택" 모드로 떨어진다

### ON-1~4 · New trip (Where / When / Base / Budget) — [기존] · S (마감만)
- **진입** ON-0 완료 · Trips 빈 상태 · Trips ▸ `+`
- **액션** 4단계 폼. 4단계에서 총예산 슬라이더 → 3버킷 자동 분할 미리보기
- **이탈** `Create my trip` → `trips` + `plans(draft)` 삽입 → TR-1 또는 TL-1
- **유지** 단계별 입력값 (새로고침 시 유실 — **로컬 초안 저장 필요**)
- **상태분기** 저장 중 · 세션 만료(`Your session expired. Sign in again.`) · 저장 실패 · **오프라인(현재 미처리)**
- **승인게이트** ✔ 예산 3버킷 분할을 사용자가 보고 넘어간다 (`Only the planned amount is spendable while you shop.`)
- **실패경로** 삽입 실패 시 입력값 유지한 채 재시도. 현재는 오류 문구만 뜨고 재시도 버튼이 없다
- **카피** 구현된 것 유지
- **남은 일** 오프라인 분기, 단계 로컬 초안, 성공 후 착지 화면(ON-5)

### ON-5 · Trip created — [신규] · S
- **진입** ON-4 저장 성공
- **액션** `Plan with Trail AI` (주) / `I'll do it later` (부)
- **이탈** Ask AI 또는 Trail 대시보드(빈 상태)
- **카피** `Toronto is ready.` / `Aug 12–16 · The Annex Hotel · CAD $250` / `Tell Trail who you're shopping for and it will build the route.`
- **비고** 현재는 `router.push("/")`로 던져버려서 방금 만든 여행이 어떻게 됐는지 확인이 없다

### ON-alt · 대화형 여행 등록 — [신규 · 선택] · M
- **근거** 피그마 -16: `Where are you visiting? → When? → Who for? → Budget? → Where staying?` → `Create my Trail plan`
- **판단** ON-1~4 폼이 이미 동작하므로 **P2 이후로 미룬다.** 도입하면 두 경로가 같은 `trips`+`plans` 행을 만들어야 하고, 대화 중 이탈 시 부분 저장 규칙이 필요하다
- **결정 필요** 아래 §7-3

---

## 2.C Trips 탭

### TR-1 · My Trips — [신규] · M
- **근거 프레임** `Mobile app with accessibility.png`
- **진입** 탭 `Trips` · 앱 부팅(여행 0건일 때) · 로고 탭
- **액션** 여행 카드 탭 → 활성 전환 + Trail 이동 · `+` → ON-1 · 과거 여행 `View` → TR-3
- **이탈** Trail / TR-2 / TR-3 / ON-1
- **유지** 활성 `trip_id` (서버: `trips.status='active'`, 사용자당 최대 1)
- **상태분기**
  - 로딩: 카드 3개 스켈레톤
  - **빈 상태(여행 0건)**: 아래 §3.9
  - 오프라인: 캐시된 목록 + 상단 동기화 칩
  - 오류: `We couldn't load your trips.` + `Try again`
- **승인게이트** ✔ 활성 여행 전환 — 진행 중 이송이 있으면 확인: `Your Toronto bags are still in transit. Switch to Seoul anyway?` (이송은 계속 추적됨)
- **실패경로** 없음
- **카피**
  - 섹션 `CURRENT` / `UPCOMING` / `PAST`
  - 현재 카드 `Day 2 of 4` · `The Annex Hotel` · `CAD $250 shopping budget` · 주버튼 `Continue Toronto Trail →`
  - 예정 카드 (계획 없음) 배지 `Shopping plan not created` + 버튼 `Plan shopping`
  - 예정 카드 (계획 있음) 배지 `Shopping plan ready` + 버튼 `Open`
  - 과거 카드 `6 purchases · ¥41,800 spent` + `View`

### TR-2 · Trip detail & settings — [재구성] · M
- **출처** 현재 `profile` 화면의 여행 폼 + 지역 칩
- **진입** TR-1 카드 롱프레스/`⋯` · Trail 헤더의 도시명 탭
- **액션** 국가·도시·날짜·호텔·주소·동행·쇼핑시간·통화 편집 · 지역 추가/삭제 · `Verify hotel accepts delivery` · `Archive trip`
- **이탈** 저장 후 뒤로
- **유지** `trips` 행 전체
- **상태분기** 저장 중 · 오프라인(낙관적) · 이송 진행 중이면 호텔 필드 잠금
- **승인게이트** ✔ **호텔 변경**: 승인된 계획이 있으면 `Changing the hotel affects your delivery. Bags already in transit keep the old address.` ✔ **통화 변경**: 지출 기록이 있으면 잠금(`Currency is locked once you record a purchase.`) ✔ **여행 보관**: 확인
- **실패경로** 헌법 ④ 관련 — 호텔이 배송을 받지 않는 곳이면 `hotel_verified_at`을 비우고 Bags에서 이송 불가 사유로 연결
- **카피** `Where bags go` / `Areas I'll visit` / `Trail places stores along these areas.`

### TR-3 · Past trip — [신규] · M
- **진입** TR-1 ▸ 과거 여행 `View`
- **액션** 구매 목록·영수증 열람 · `Use this taste now`(메모리 제약으로 승격) · 영수증 상세 → BG-8
- **이탈** 뒤로 / Ask AI
- **상태분기** 로딩 · **빈 상태(과거 여행 없음 — TR-1에서 섹션 자체를 숨김)** · 인사이트 미생성(`trip_insights` 없음) → `We're still summarising this trip.`
- **승인게이트** ✔ `Use this taste now`는 **메모리 제약 생성 동의**다 (`memory_constraints` insert). 단발 토글이 아니라 항목별 동의
- **카피** `Tokyo · May 2–8` / `6 purchases · ¥41,800 spent` / `You chose small, useful objects from independent makers.` / `Use this taste in Toronto` / `Keep it out`

### TR-4 · Switch active trip — [신규] · S
- 시트. TR-1 카드 탭의 부수효과이므로 별도 화면이 아니라 확인 시트
- **카피** `Make Seoul your active trip?` / `Toronto stays saved. You can switch back any time.`

---

## 2.D Trail 탭 — 대시보드

### TL-1 · Dashboard — [재구성] · L
- **근거 프레임** `-2`(지갑·Trail 카드), `-15`/`Home.png`(추천·현재 위치), 현재 `home`(hands-free 히어로)
- **진입** 탭 `Trail` · TR-1 ▸ `Continue Toronto Trail` · 부팅 착지
- **액션** `Start today's route` → TL-2/TL-7 · `Made for {city}` → TL-6 · `Ask Trail AI` → Ask AI · 지갑 탭 → TL-4
- **이탈** Plan / Shopping / Ask AI / Bags
- **유지** 활성 trip, 계획 상태, 지갑 스냅샷
- **상태분기**
  | 상태 | 히어로 | 주버튼 |
  | --- | --- | --- |
  | 계획 없음 | `Ready to explore {city}?` | `Plan with Trail AI →` |
  | 계획 draft | `Your plan is still a draft.` | `Review the draft →` |
  | 계획 approved · 쇼핑 전 | `4 gifts · 4 stores · 25 min walking` | `Start today's route →` |
  | 쇼핑 중 | `3 of 4 gifts purchased` | `Continue shopping →` |
  | 가방 이송 중 | `Your bags are on the way` | `Track bags →` |
  | 이송 완료 | `Your bags are at the hotel` | `View receipt →` |
  | 여행 종료(오늘 > end_date) | `Toronto is wrapped up.` | `See what you brought home →` |
  - 로딩: 지갑·진행률 스켈레톤 · 오프라인: 동기화 칩 · 위치 거부: `Recommendations near you`를 `Recommendations in {city}`로 대체
- **승인게이트** 없음 (진입점만)
- **실패경로** 없음
- **카피** `Good morning.` (시간대별 morning/afternoon/evening) · 지갑 행 `Total budget` `Spent` `Planned shopping` `Reserved for delivery` `Flexible` · 진행바 캡션 `84% allocated · CAD $31 flexible`

### TL-6 · Made for {city} — [신규] · M
- **근거 프레임** `-3`
- **진입** TL-1 ▸ `Made for Toronto`
- **액션** 카테고리 탐색 · 메모리 프롬프트 응답(`Yes — something different` / `Keep`)
- **이탈** Ask AI(해당 카테고리 프롬프트 주입) / 뒤로
- **상태분기** 로딩 · 큐레이션 데이터 없는 도시(**중요**: `stores`/`products`가 비어 있는 도시가 대부분이다) → §3.10
- **승인게이트** ✔ **메모리 제약 동의**: `You bought Mom a ceramic tea set in Tokyo. Would you like something different from Toronto this time?` → `Yes — something different`(=`memory_constraints{kind:'avoid'}` 생성) / `Keep`(=아무것도 저장 안 함)
- **실패경로** 헌법 ① — 도시 큐레이션이 없으면 추천 불가 빈 상태
- **카피** `Curated local gifts — not the same items you'd find at any airport gift shop.` / `3 stores within 12 min` / `Recommended stores are a short walk from your existing route.` / 라벨 `Sample`

---

## 2.E Trail 탭 — Plan (인페이지 4탭)

공통 셸: 상단 `trail` 로고 + 도시 셀렉터(`Toronto ▾`) + `AI` 칩 → Ask AI. 그 아래 `Gifts | Map | Budget | Delivery`.

### TL-2 · Plan ▸ Gifts — [재구성] · L
- **근거 프레임** `-17`, `-1`
- **진입** TL-1 · Ask AI ▸ `Create my Trail plan` · 탭 전환
- **액션** 항목 탭 → 상세 · `Request`(재고 문의) · `Alternatives`(대체안) · 항목 삭제 · 수령인별 재배분 → TL-4 · `Build my route →` (=계획 승인)
- **이탈** TL-3 Map / TL-7 Shopping / Ask AI
- **유지** `stops` 목록, `plans.status`, 승인 스냅샷
- **상태분기**
  - 로딩: 카드 4개 스켈레톤
  - **빈 상태(계획 없음)**: §3.9
  - draft: 상단 `AI DRAFT` 배지 + 하단 `Build my route →`
  - approved: 배지 없음 + 하단 `Start shopping →`
  - approved인데 편집됨: 배너 `Your plan changed. Rebuild the route before shopping.`
  - 이송 중: 읽기 전용
  - 오프라인: 편집 낙관적 반영 + 동기화 칩
- **승인게이트**
  - ✔ **계획 승인** (`draft → approved`): `Build my route →`. 이 시점에 `stops.snapshot_price_cents`가 고정된다. 이후 예산을 바꿔도 이미 승인된 가격은 소급 변경되지 않는다
  - ✔ **항목 삭제/추가** — AI가 임의로 못 한다
  - ✔ **Request 전송** — 재고 문의를 매장에 보내는 것이므로 사용자 탭이 필요
- **실패경로** 헌법 ① 추천 불가 → §3.11
- **카피**
  - 카드 `MOM` / `Ontario-made home accessory` / `Spacing Store` / `CAD $58` / `📍 7 min` / 버튼 `Request`
  - 이유 줄 `Intentionally avoids ceramics — different from Tokyo gift`
  - 등가 선물 `Both gifts are similar in value`
  - 본인용 `Optional personal purchase`
  - 예산 요약 `BUDGET SUMMARY` / `Total` / `Planned shopping` / `Delivery reserve` / `Flexible`
  - 하단 `Alternatives` · `Build my route →`
  - 라벨 `Sample availability · confirm with the store`

### TL-2b · Gift detail — [신규] · M
- **진입** TL-2 카드 탭
- **액션** `Request`(재고 문의) · `Find alternatives` · `Change recipient` · `Remove from plan` · `Directions`
- **상태분기** 재고 문의 상태 5종 (`open` `in_stock` `out_of_stock` `no_answer` `expired`)
- **승인게이트** ✔ 대체품 교체 — 1:1 고정이 아니라 **후보 목록에서 사용자가 고른다**
- **카피** `We asked the store if this is in stock.` / `Asked 12 min ago · no answer yet` / `Answers usually take under an hour. You can still walk over — this is just a heads-up.` / **금지**: `Reserved`, `Held for you`

### TL-3 · Plan ▸ Map — [재구성] · L
- **근거 프레임** `-18`
- **진입** 탭 전환
- **액션** 순서 드래그 · 스톱 건너뛰기 · `Directions`(외부 지도) · `Start shopping →`
- **유지** `stops.sequence`, `planned_day`
- **상태분기** 로딩 · 위치 권한 거부(출발지 수동 선택) · 좌표 없는 매장(리스트만) · 오프라인(캐시된 경로, `Live walking times unavailable offline`)
- **승인게이트** ✔ 순서 변경은 경로 재계산을 유발 → 사용자가 명시적으로 `Save order`
- **실패경로** 매장 폐점 시간 지남 → `Blue Banana Market closed 20 min ago. Move it to tomorrow?`
- **카피** `TODAY'S ROUTE` / `Start · You` → `1 Spacing / Mom` → … / `7-min walk` / `Start shopping →` / 라벨 `Walking times are estimates`

### TL-4 · Plan ▸ Budget (Trip Wallet) — [신규] · M
- **근거 프레임** `-19`
- **진입** 탭 전환 · TL-1 지갑 탭
- **액션** 총예산 조정 · 수령인별 배분 조정 · flexible → planned 이동 요청 · `View live plan →`
- **유지** `plans` 4개 금액, `plan_allocations`
- **상태분기** 로딩 · 예산 초과(빨강) · 배분 합계 불일치(`CAD $12 unallocated`)
- **승인게이트**
  - ✔ **총예산 변경** — 승인된 계획이 있으면 `This changes what you can spend, not what you already bought.`
  - ✔ **flexible → planned 이동** — 헌법 5. `budget_changes` 행 생성 후 승인
  - ✔ **delivery_reserve 축소** — `Lowering the reserve may leave you unable to send your bags.` 경고 + 확인
- **실패경로** 헌법 ② 예산 초과 → TL-9
- **카피** `Trip Wallet` / `Total budget` `Spent` `Planned shopping` `Reserved for delivery` `Flexible` / `Move CAD $20 from flexible into planned?` / `Flexible money needs your approval before it can be spent.`

### TL-5 · Plan ▸ Delivery (요약) — [신규] · S
- **근거 프레임** `-20`
- **진입** 탭 전환
- **액션** `Arrange delivery →` → Bags 탭
- **상태분기**
  - 구매 0건: `Nothing to send yet.` + `You'll be able to arrange delivery once you've bought something.` (버튼 비활성) — **§3.9의 핵심 빈 상태**
  - 이송 draft 존재: `Continue your delivery →`
  - 이송 진행 중: 상태 요약 + `Track bags →`
  - 호텔 미검증: `We haven't confirmed this hotel accepts deliveries.` + `Check with hotel`
- **승인게이트** 없음 (읽기 요약)
- **카피** `Hotel Delivery` / `Deliver to` `Drop-off partner` `Estimated arrival` `Delivery cost` / `CAD $9 (reserved)` / `Arrange delivery →` / 라벨 `Simulated`

---

## 2.F Trail 탭 — Shopping

### TL-7 · Shopping (매장 내 진행) — [재구성] · L
- **근거 프레임** `-6`, 현재 `shop`
- **진입** TL-2/TL-3 `Start shopping` · TL-1 `Continue shopping`
- **액션** stop별 `Bought` → TL-8 · `Not found` → TL-10 · `Skip` · `Go hands-free →` → Bags
- **이탈** 전 stop 처리 또는 탭 이동 (진행은 유지)
- **유지** `stops.status`, `purchases`, 아웃박스 대기 건수
- **상태분기**
  - 로딩 · 오프라인: **정상 경로다.** 낙관적 반영 + `3 changes waiting to sync`
  - 위치 거부: 다음 스톱 자동 정렬 없이 수동
  - 계획 없음: 진입 차단
  - 전부 완료: 히어로가 `All 4 gifts purchased` + 주버튼 `Go hands-free →`
- **승인게이트** 없음 (기록만). 단 예산을 넘기면 TL-9가 자동으로 뜬다
- **실패경로** 헌법 ① → TL-10 / 헌법 ② → TL-9
- **카피** `3 of 4 gifts purchased` / `75% complete` / 섹션 `PURCHASED` `REMAINING` / `Available for shopping CAD $34` / `Protected for delivery CAD $9` / `Go hands-free →`
- **핵심 규칙** `Available for shopping`은 `planned − spent`다. `Protected for delivery`는 절대 여기에 합산하지 않는다

### TL-8 · Record purchase — [재구성] · M
- **근거 프레임** `-4` (전체 화면), 현재는 모달 시트
- **진입** TL-7 ▸ `Bought`
- **액션** 실제 지불액 입력 (빠른 금액 칩) · 수량 · 가방 수 · 취급구분 · `Confirm purchase`
- **이탈** 저장 → TL-7 (또는 예산 초과면 TL-9)
- **유지** `purchases` 행, `stops.status='bought'`, `client_op_id`(오프라인 재생용)
- **상태분기** 신규 기록 / 수정 / 환불(void) · 저장 중 · 오프라인 낙관적 · 검증 실패
- **승인게이트** ✔ **구매 기록은 사용자만 만든다.** Trail은 절대 생성하지 않는다 ✔ **환불/삭제**: `Remove this purchase? Your budget goes back to CAD $92.`
- **실패경로** 저장 후 `spent > planned` → TL-9 자동 진입
- **카피** `How much did you actually pay?` / `Planned amount ~~CAD $58~~` / `Actual price paid` / 빠른 칩 `$58 $65 $70 $75 $80` / `Confirm purchase` / 검증 오류 `Enter a positive total, quantity and bag count.`
- **비고** 현재 모달은 390px 액자 안에서만 성립한다. 실제 뷰포트에서는 키보드가 올라오면 금액 입력칸이 가려진다 → 전체 화면으로 승격

### TL-9 · Budget update (예산 초과 승인) — [신규] · M — **헌법 ② 화면**
- **근거 프레임** `-5`
- **진입** TL-8 저장 결과 `actual > snapshot_price` 또는 `spent > planned`
- **액션** 4택
  1. `Adjust my plan` — Trail이 남은 항목 예산을 재배분한 제안을 보여줌 → 사용자 승인
  2. `Find cheaper options` — 남은 stop의 대체안 검색
  3. `Increase budget` — flexible에서 끌어오기(승인) 또는 총예산 증액
  4. `Continue anyway` — 초과를 그대로 기록 (경고 유지)
- **이탈** 선택 후 TL-7
- **유지** `budget_changes` 행 (proposed → approved/rejected)
- **상태분기** 항목 단위 초과 / 전체 예산 초과 / flexible로 흡수 가능 / 흡수 불가
- **승인게이트** ✔ **모든 분기가 승인 게이트다.** Trail은 제안만 하고 `budget_changes.status`를 스스로 `approved`로 못 바꾼다 (`plan_events.ai_cannot_approve` 제약이 근거)
- **실패경로** `Continue anyway` 선택 후 `delivery_reserve`까지 잠식하면: `You're now CAD $4 into the money reserved for delivery. Sending your bags may not be possible.`
- **카피** `OVER PLAN` / `You're CAD $17 above the amount planned for Mom.` / `Planned CAD $58 · Paid CAD $75` / `Adjust my plan` `Find cheaper options` `Increase budget` `Continue anyway`
- **금지 카피** `Trail adjusted your budget` (Trail은 조정하지 않는다. 제안한다)

### TL-10 · Not found → alternatives — [재구성] · M — **헌법 ① 화면**
- **근거** workflow 프레임 07, 현재 `replaceStop`
- **진입** TL-7 ▸ `Not found`
- **액션** 대체 후보 목록에서 선택 · `Keep looking` · `Skip this gift` · `Ask Trail for something else`
- **이탈** 교체 시 `stops` 새 행(`replaced_stop_id` 연결) → TL-7
- **상태분기**
  - 후보 있음: 목록
  - **후보 없음(추천 불가)**: §3.11
  - 검색 중: `Looking for something nearby…`
  - 오프라인: `We need a connection to find alternatives. Skip for now and we'll look later.`
- **승인게이트** ✔ 사용자가 후보를 고른다. 현재 구현의 1:1 자동 교체는 폐기
- **카피** `Not found at this store` / `Nearby · same area · same budget` / `+3 min from your route` / `Replace this stop` / 라벨 `Sample availability`
- **불변 규칙** 교체해도 **수령인과 배정 예산은 유지된다**

---

## 2.G Ask AI 탭

### AI-1 · Trail AI conversation — [기존 · 보강] · L
- **근거 프레임** `-14`, `-16`, 현재 `chat`
- **진입** 탭 `Ask AI` · TL-1 ▸ `Ask Trail AI` · 스타터 프롬프트
- **액션** 자유 발화 · 빠른 응답 칩 · 참조 사진 첨부 · 제안 칩 `Add to brief` · `Create my Trail plan →`
- **이탈** 계획 생성 → TL-2 · brief 편집 → AI-2
- **유지** `chat_messages`(서버), `plans`(draft) 갱신, `plan_events` 원장
- **상태분기**
  - 로딩(타이핑 인디케이터) · 오류 코드별 분기(`no_key` `upstream_5xx` `429` `timeout` `truncated` `refused` `parse_failed`) — **현재는 전부 같은 토스트로 뭉개진다**
  - 오프라인: 입력 비활성 + `Trail AI needs a connection. Your brief is unchanged.`
  - **빈 상태(첫 진입)**: 인사 + 스타터 3개
  - 여행 없음: `Which trip is this for?` → 여행 선택 또는 생성
- **승인게이트**
  - ✔ **정규식/폴백 patch는 자동 적용 금지.** 제안 칩으로 띄우고 `Add to brief` 탭으로만 반영 (P0-2)
  - ✔ **모델 patch가 클램프됐으면 시스템이 말한다**: `I kept the budget at CAD $300 — that's the highest this trip allows.` (모델 문구가 아니라 `rejected` 배열 기반)
  - ✔ **계획 승인은 여기서 하지 않는다.** `Create my Trail plan`은 draft를 만들 뿐이고 승인은 TL-2의 `Build my route`
  - ✔ **메모리 주입 동의** — 항목별 (`memory_constraints`)
- **실패경로** 헌법 ① — 요구를 만족하는 추천이 없으면 계획 생성 대신 `I couldn't find anything in Toronto that fits "under CAD $20, local, fragile-free". Want to raise the budget or widen the area?`
- **카피**
  - 헤더 `Trail AI` / 서브 `Toronto · Day 2 · CAD · The Annex Hotel`
  - 오프너 `Let's build your Toronto shopping day. I'll help you find meaningful local gifts, stay within your budget, optimize your route, and get your bags back to your hotel.`
  - 요약 카드 `HERE'S WHAT I'VE GOT` — `Trip` `Hotel` `Total budget` `Shopping for` `Preferences` `Delivery` / `Edit details` · `Create my Trail plan →`
  - 메모리 스트립 `Trail remembers: local makers · useful gifts` / `Why?`
- **폐기** `7 details understood · 94%` 하드코딩. 대신 `Trip · Budget · 4 recipients · Hotel` 처럼 **채워진 필드를 나열**한다
- **보안** brief는 system 역할 문자열 보간이 아니라 **JSON 데이터 블록**으로 분리 (`recipient`/`city`/`hotel`이 자유 텍스트라 인젝션 표면)

### AI-2 · Edit brief — [재구성] · M
- **출처** 현재 `review` 화면의 폼 부분
- **진입** AI-1 ▸ `Edit details`
- **액션** 수령인 목록 편집(추가·삭제·관계·우선순위·`Myself`) · 카테고리 · 취향 · 토글 3종 · 등가 선물 그룹 지정
- **이탈** 저장 → AI-1 또는 TL-2
- **상태분기** draft / approved 후 편집(재빌드 배너) · 저장 중 · 오프라인
- **승인게이트** ✔ 수령인 삭제 시 그에 걸린 stop·구매가 있으면: `Removing Coworkers also removes 1 planned gift. Your recorded purchase stays.`
- **카피** `Shopping for` / `Add someone` / `Myself` / `Both gifts should cost about the same` / `Optional personal purchase`
- **주의** 수령인은 `recipients` 행이다. 배열 인덱스로 식별하던 구조는 폐기 (수령인 추가/삭제 시 구매 기록이 어긋나던 원인)

---

## 2.H Bags 탭

### BG-1 · Bags home / Select bags — [재구성] · M
- **근거** 현재 `drop`, 손그림 주석 `We need Bags because they might have other shopping bags`
- **진입** 탭 `Bags` · TL-7 ▸ `Go hands-free` · TL-5 ▸ `Arrange delivery`
- **액션** 구매한 가방 체크 · **`+ Add a bag I bought elsewhere`(플랜 외 가방)** · 취급구분 지정 · `Check delivery options →`
- **이탈** BG-2/BG-3
- **유지** `bag_transfers(draft)` + `bag_transfer_items`
- **상태분기**
  - **빈 상태(구매 0건 + 플랜 외 가방 0개)**: §3.9
  - 진행 중 이송 있음: 선택 화면 대신 BG-6 추적으로 착지
  - 완료된 이송 있음: `Past deliveries` 섹션
  - 오프라인: 선택은 로컬 유지, 이송 생성은 온라인 필요 (`Selecting works offline. Creating the delivery needs a connection.`)
- **승인게이트** ✔ 어떤 가방을 보낼지는 전적으로 사용자가 고른다. 기본 전체 선택 금지 — **명시적 체크**
- **실패경로** 헌법 ③ → BG-3f
- **카피** `Choose the bags to send` / `You paid the stores directly. Trail only carries the sealed bags you select.` / `Add a bag I bought elsewhere` / `3 bags selected · ~2.4 kg`
- **플랜 외 가방 입력** `What's in it?`(라벨) · `How many bags?` · `Handling` — `purchase_id`는 null, `label`이 필수 (스키마 제약 `transfer_items_labelled`가 이미 강제)

### BG-2 · Ready to go hands-free? — [신규] · S
- **근거 프레임** `-7`
- **진입** BG-1 선택 완료
- **액션** `Review delivery →`
- **카피** `Ready to go hands-free?` / `3 Bags · ~2.4 kg · ~4 hrs Time left` / `You already protected CAD $9 for delivery when Trail created your shopping budget.`
- **비고** 이 화면의 존재 이유는 **예비비가 이미 확보돼 있다는 사실을 결제 직전에 상기시키는 것**이다. 지갑 규칙(헌법 5)이 실제로 지켜졌음을 보여주는 유일한 지점

### BG-3 · Review delivery — [신규] · M
- **근거 프레임** `-8`
- **진입** BG-2
- **액션** 호텔 확인 · 드롭오프 파트너 선택/변경 · 가방 수 확인 · `Continue to payment →`
- **이탈** BG-4 결제 · 또는 BG-3f 이송 불가
- **유지** `bag_transfers`(호텔명·주소 동결, `dropoff_store_id`, `bag_count`, `fee_cents`, `eta_*`, `dropoff_cutoff_at`)
- **상태분기**
  - 적격(eligible) / **부적격(§3.1 BG-3f)** / 판정 중
  - 호텔 미검증: `Hotel verified` 배지 대신 `We haven't confirmed this hotel accepts deliveries` + `I've checked with the hotel`(사용자 확인 → `hotel_verified_at`)
  - 마감 임박: `Blue Banana Market stops accepting bags in 35 min.`
- **승인게이트** ✔ **호텔·가방 수·취급·요금을 사용자가 확인한다.** 이 확인이 `bag_transfers.confirmed_at`
- **실패경로** 헌법 ③ 이송 불가 → BG-3f
- **카피** `Review your delivery` / `DELIVER TO` `The Annex Hotel` `✓ Hotel verified` / `DROP OFF AT` `Blue Banana Market · Trail Partner Point · 2 minutes away` / `DETAILS` `Bags 3` `Est. weight 2.4 kg` `Delivery 6:30–7:00 PM` `Price CAD $9.00` / `CAD $9 is reserved in your Trail wallet but has not been charged yet.` / `Continue to payment →` / 라벨 `Simulated`

### BG-3f · Delivery not available — [신규] · M — **헌법 ③ 화면 (현재 완전 부재)**
- **진입** BG-3 적격성 판정 실패
- **부적격 사유와 각각의 복구 수단**
  | 사유 | 카피 | 복구 |
  | --- | --- | --- |
  | 파트너 지점 없음 | `No Trail partner point near you today.` | `Show me stores near a partner` / `Carry today, send tomorrow` |
  | 드롭오프 마감 지남 | `Blue Banana Market stopped accepting bags at 6:00 PM.` | `Find another partner` / `Send tomorrow morning` |
  | 냉장 시간 초과 | `The ice-pack window for the chocolate closed at 7:30 PM.` | `Send everything except the chocolate` / `Carry it yourself` |
  | 호텔이 배송 거부 | `The Annex Hotel doesn't hold deliveries for guests.` | `Deliver to a different address` / `Store at the partner point` |
  | 취급 불가(파손/중량) | `This bag is heavier than partners accept (max 8 kg).` | `Split into two bags` / `Carry it` |
  | 예비비 부족 | `Your delivery reserve is CAD $4 short.` | `Move CAD $4 from flexible` (승인) / `Cancel delivery` |
- **승인게이트** ✔ 복구안 선택은 전부 사용자 승인
- **유지** `bag_transfers.ineligible_reason`, `transfer_events(declined)`
- **불변 규칙** 부적격이어도 **선택한 가방 목록은 사라지지 않는다.** 다시 오면 그대로 있어야 한다
- **금지 카피** `Delivery failed` (실패가 아니라 조건 미충족이다)

### BG-4 · Payment — [기존 · 보강] · M
- **근거 프레임** `-9`, 현재 `pay`
- **진입** BG-3 확인
- **액션** 결제수단 선택 · `Pay CAD $9.00`
- **이탈** 성공 → BG-5 드롭오프 / 실패 → BG-4f
- **유지** `payments`(reserved → authorized → captured), `client_op_id`
- **상태분기** 처리 중(버튼 비활성 + `Contacting your bank…`) · 타임아웃 · 중복 탭 방지 · 오프라인(결제 차단: `Payment needs a connection.`)
- **승인게이트** ✔ **청구는 사용자 탭에서만.** 예약(reserve)과 청구(charge)는 분리된다 — 예약은 예산 생성 시 이미 됐고 여기서 실제 청구가 일어난다
- **실패경로** BG-4f
- **카피** `Same-day delivery · 3 bags` / `Blue Banana Market → The Annex Hotel` / `CAD $9.00` / `Choose payment method` / `Apple Pay · Touch ID or Face ID` / `Saved Visa •••• 4242` / `Use another payment method` / 배지 `SIMULATED` / `No money moves. Trail is simulating the card charge so the delivery flow can be tested end to end.`
- **비고** 현재의 `Test a failed payment` 체크박스는 **개발 전용**이다. 프로덕션 빌드에서는 숨긴다 (§7-5)

### BG-4f · Payment failed — [기존] · S
- **근거 프레임** `-10`, 현재 구현됨
- **액션** `Try again` / `Use another payment method` / `Cancel delivery`
- **상태분기** 실패 코드 4종 (`card_declined` `insufficient_funds` `expired_card` `processing_error`)
- **승인게이트** ✔ `Cancel delivery`는 확인 필요 (`Your bags stay with you. The CAD $9 reserve goes back to your wallet.`)
- **카피** `Payment didn't go through` / `Your card wasn't charged. Your CAD $9 delivery reserve is still protected.`
- **핵심 규칙** 실패해도 **예비비는 보호된 상태로 유지**된다. 이 문장이 이 화면의 존재 이유다

### BG-5 · Drop off your bags (QR 패스) — [신규] · M
- **근거 프레임** `-11`
- **진입** BG-4 결제 성공
- **액션** QR 제시 · `I've dropped off my bags ✓`
- **이탈** BG-6 추적
- **유지** `bag_transfers.pass_token_hash`, `transfer_events(paid → dropped_off)`
- **상태분기**
  - **오프라인(중요)**: 매장 안에서 QR이 떠야 한다. 결제 후 패스는 **로컬 캐시 필수**. `This pass works offline.`
  - 화면 밝기 자동 최대
  - 마감 임박 카운트다운
  - 드롭오프 후 재진입: 읽기 전용 + `Dropped off at 4:42 PM`
- **승인게이트** ✔ `I've dropped off my bags`는 **사용자 자기신고**다. 실제 커스터디 시작은 파트너 스캔 이벤트(`collected`)여야 한다. 두 이벤트를 구분해서 기록한다 (`actor: traveler` vs `actor: partner`)
- **실패경로** BG-5f
- **카피**
  - `Drop your bags` / `Blue Banana Market`
  - 칩 `✓ Delivery paid` `3 bags` `The Annex Hotel` `6:30–7:00 PM`
  - `HOW IT WORKS` 1 `Bring the three shopping bags to the partner point.` 2 `Show the Trail QR code to staff.` 3 `Staff attach a unique Trail tag to each bag.` 4 `Confirm the number of bags.` 5 `Trail transports them to The Annex Hotel.`
  - `I've dropped off my bags ✓`

### BG-5f · Partner couldn't accept — [신규] · M — **커스터디 시작 실패 (부재)**
- **진입** BG-5에서 사용자가 `Something went wrong at the store` 또는 파트너 이벤트 `declined`
- **사유** 개수 불일치 · 파트너 지점이 문 닫음 · 태그 소진 · 취급 거부 · QR 인식 실패
- **액션** `Find another partner point` / `Change the bag count` / `Cancel and get a refund`
- **승인게이트** ✔ **가방 개수 불일치는 반드시 사용자 확인.** `Staff counted 2 bags, your delivery says 3. Which is right?` → 사용자가 정정하면 `bag_count` 변경 + `transfer_events` 기록
- **유지** `transfer_events(declined|seal_issue)`, `payments`(환불 시 `refunded`)
- **카피** `The partner couldn't take your bags` / `Nothing has been collected, and your CAD $9 will go back to your wallet if you cancel.`

### BG-6 · Bag tracking — [재구성] · M
- **근거 프레임** `-12`, 현재 `tracking`
- **진입** BG-5 드롭오프 후 · 탭 `Bags` · TL-1 `Track bags`
- **액션** 상태 열람 · `Report a delay` / `Report a seal issue` → BG-9 · `Delivery complete →`(완료 상태에서만)
- **유지** `transfer_events` 원장 (읽기 전용)
- **상태분기** 4단계 (`Dropped off` → `Collected by Trail` → `On the way to hotel` → `Delivered`) · 각 단계 시각 · 지연 · 냉장 상태 · 오프라인(마지막 알려진 상태 + `Last updated 12 min ago`)
- **승인게이트** 없음 — **여기서 사용자는 상태를 바꿀 수 없다**
- **실패경로** 지연 → BG-9 · 인계 실패 → BG-10
- **카피** `Your bags are on the way` / `Estimated arrival: 6:30–7:00 PM` / 단계 `Dropped off 4:42 PM` `Collected by Trail 5:16 PM` `On the way to hotel [in progress]` `Delivered` / `Destination` `Bag count` `Tracking ID` `Payment` / `Keep exploring Toronto — your bags will be waiting at the hotel.` / 배지 `Simulated transfer`
- **폐기** 현재의 `Preview next status →` 버튼. 사용자가 커스터디 단계를 올리면 원장의 신뢰성이 0이다. 개발용 시뮬레이터 API(`POST /api/dev/transfers/:id/advance`)로 분리하고 프로덕션에서 차단

### BG-7 · Delivered — [신규] · S
- **근거 프레임** `-13`
- **진입** `transfer_events(handed_off)` + `receipts` 생성
- **액션** `View receipt` → BG-8 · `Rate Trail`(§7-10 결정 필요) · `Continue exploring Toronto →`
- **상태분기** 태그 개수 일치 / **불일치(→BG-10)** · 냉장 유지 여부
- **승인게이트** 없음
- **카피** `Delivered.` / `Keep exploring.` / `Your 3 bags were delivered to The Annex Hotel front desk at 6:47 PM.` / `✓ Hotel handoff confirmed` `✓ 3 Trail tags scanned` `TRL-PAY-48173 · CAD $9.00`
- **주의** `Delivered`는 우리가 통제하는 사실(태그 대조 완료)이므로 확정어로 써도 된다. 예상 시각·재고 같은 미통제 사실에만 확정어를 금지한다

### BG-8 · Receipt detail — [신규] · M — **현재 토스트만 뜨고 실체 없음**
- **진입** BG-7 ▸ `View receipt` · TR-3 과거 여행 · Bags ▸ `Past deliveries`
- **내용** 인계 받은 사람·시각 · 가방 수 · **태그 ID 전체 목록** · 취급구분별 상태 · 구매 합계 · 이송 요금 · 결제 참조 · 커스터디 타임라인(전체 이벤트)
- **액션** `Share`(텍스트/PDF) · `Report a problem` → BG-9
- **유지** `receipts` (append-only, 수정 불가)
- **상태분기** 로딩 · 원장 일부 누락(`Some events are still syncing`)
- **승인게이트** 없음
- **카피** `Hotel receipt` / `Received by Front desk · 6:47 PM` / `Trail tags` `TRL-A19 · TRL-A20 · TRL-A21` / `Purchases CAD $176` `Delivery CAD $9` / `This record can't be edited.`

### BG-9 · Report an issue — [신규] · M — **부재**
- **진입** BG-6 `Report a delay` / `Report a seal issue` · BG-8 `Report a problem`
- **유형** 지연 · 봉인 훼손 · 가방 누락 · 내용물 파손 · 잘못된 호텔 · 기타
- **액션** 유형 선택 → 설명 입력 → (선택) 사진 첨부 → `Send report`
- **이탈** 접수 확인 화면
- **유지** `transfer_events(delayed|seal_issue)` + **신규 테이블 `transfer_issues`**(§5.2)
- **상태분기** 전송 중 · 오프라인(큐에 적재, `We'll send this the moment you're back online.`) · 접수됨 · 처리 중 · 해결됨
- **승인게이트** ✔ 사진 첨부는 명시적 선택 (`Photos help us check the seal. They're only used for this report.`)
- **카피** `What went wrong?` / `A delay` `A broken seal` `A missing bag` `Damaged contents` `Wrong hotel` / `Send report` / `We've logged this at 7:12 PM. Your bags stay tracked while we look into it.`
- **금지 카피** `We'll fix it` (약속하지 않는다)

### BG-10 · Hotel handoff failed — [신규] · M — **헌법 ④ 화면 (완전 부재)**
- **진입** `transfer_events(declined)` from `actor: hotel` · 태그 개수 불일치 · 프런트 인계 거부 · 도착했으나 수령인 확인 불가
- **표시** 무엇이 어긋났는지 · **가방이 지금 어디 있는지(커스터디는 계속 보인다)** · 다음에 무슨 일이 일어나는지
- **액션** `Call the hotel` · `Send to a different address`(승인) · `Hold at the partner point` · `Talk to Trail support`
- **유지** `bag_transfers.status='failed'`, `transfer_events` 전체 보존, `receipts` 생성 안 함
- **상태분기**
  | 사유 | 카피 |
  | --- | --- |
  | 프런트 인계 거부 | `The Annex Hotel front desk didn't accept the bags.` |
  | 태그 개수 불일치 | `2 of 3 Trail tags were scanned at the hotel. One bag is unaccounted for.` |
  | 투숙 확인 불가 | `The hotel couldn't find a booking under your name.` |
  | 시간 초과 | `The front desk closed before the bags arrived.` |
- **승인게이트** ✔ 대체 주소 배송은 사용자 승인 ✔ 파트너 지점 보관 연장도 승인 (추가 요금 발생 시 명시)
- **핵심 규칙** **커스터디 표시가 절대 사라지지 않는다.** 실패해도 가방의 마지막 위치와 담당이 화면에 남아 있어야 한다
- **카피** `Your bags didn't get handed over.` / `They're still with the Trail driver at the hotel entrance.` / `Nothing is lost — we know where every tagged bag is.`

---

## 2.I Account (탭 아님 — 헤더 아바타)

### AC-1 · Account — [신규] · M
- **진입** Trips/Trail 헤더 우상단 아바타
- **내용** 이메일 · 표시 이름 · 홈 통화 · 언어 · 항목 목록:
  `Memory & privacy` `Notifications` `Location` `Payment methods` `Install Trail` `Data & privacy` `Sign out`
- **상태분기** 로딩 · 오프라인(읽기만)
- **카피** `Signed in as ksyk9434@gmail.com`

### AC-2 · Memory & privacy — [재구성] · M
- **출처** 현재 `profile`의 메모리 카드 (껍데기 — 추천에 영향 없음)
- **내용** 저장된 메모리 제약을 **항목별로** 나열: `Avoid ceramics for Mom (from Tokyo 2025)` · 각 항목에 `Forget`
- **액션** 항목 삭제(=`revoked_at`) · 전체 끄기 · `What Trail never remembers` 설명
- **승인게이트** ✔ 메모리는 **opt-in**이다 (`app_users.memory_enabled default false`). 새 제약은 항목별 동의로만 생성된다
- **카피** `Trail remembers 3 things` / `Only what you approved, one item at a time.` / `Forget this` / `Trail never stores your hotel, your card, or the photos you attach.`
- **폐기** `MEMORY ON` 전역 토글 하나로 "기억한다"고 표시하면서 실제로는 아무 영향 없던 구조

### AC-3 · Notifications & location — [신규] · M
- **내용** 이송 상태 알림 · 드롭오프 마감 알림 · 예산 경고 · 위치 사용
- **상태분기**
  - 권한 미요청: 설명 + `Turn on`
  - **권한 거부됨**: `Updates are blocked in your browser settings.` + `How to turn them back on`(OS별 안내) — **앱 안에서 되돌릴 수 없다는 사실을 명시**
  - iOS PWA 미설치: `Add Trail to your Home Screen to get delivery updates.`
  - 지원 안 함: 대체 안내(`We'll show updates in the app instead.`)
- **승인게이트** ✔ 권한 요청 전 앱 내 프라이밍 (ON-0과 같은 문구)
- **카피** `We'll only message you about your bags.` / `Never marketing.`

### AC-4 · Payment methods — [신규] · S
- **내용** 저장된 결제수단 목록 (피그마 `Saved Visa •••• 4242`)
- **상태** 현재 스키마에 **저장 결제수단 테이블이 없다** (§5.2)
- **금지** 이 화면에서 카드 번호를 직접 입력받지 않는다. 프로바이더 위젯만 띄운다
- **카피** `Trail never sees your card number.` / 배지 `Simulated — no real card is stored`

### AC-5 · Data & privacy — [신규] · M
- **내용** 데이터 내보내기 · 계정 삭제 · 저장되는 것 목록
- **승인게이트** ✔ 계정 삭제는 2단계 확인 + 이메일 재인증
- **충돌 주의** `transfer_events` `plan_events` `receipts`는 append-only이고 트리거로 UPDATE/DELETE가 막혀 있다. 계정 삭제 시 이 원장을 어떻게 할지 **정책 결정 필요**(§7-11). CASCADE로 지워지긴 하나, "감사 원장"의 목적과 충돌한다
- **카피** `Delete your Trail account` / `Your trips, purchases and delivery records go with it. This can't be undone.`

---

## 2.J 전역 요소

### GL-1 · Sync status chip — [신규] · S — **오프라인 정직성의 핵심**
- **위치** 화면 상단 고정 (스크롤과 무관)
- **상태** `Synced`(평소 숨김) · `3 changes waiting` · `Syncing…` · `Couldn't save 1 change` + `Retry`
- **원칙** 오프라인에서 **조용히 성공한 척하는 것이 이 앱에서 가장 위험하다.** 4xx는 재시도 없이 즉시 노출, 5xx·네트워크만 재시도
- **카피** `3 changes waiting to sync` / `Saved on this device. We'll upload when you're back online.` / `1 change couldn't be saved.`

### GL-2 · Sample / Simulated 라벨 — [기존 · 규칙화] · S
- **규칙** `data_source` 컬럼이 근거다. `sample`/`simulated` 행에서 나온 값은 **화면에 라벨이 붙는다**
- 라벨이 필요한 것: 재고 상태 · 가격 예상 · 도보 시간 · 영업 시간 · 이송 ETA · 이송 이벤트 · 결제
- 라벨이 필요 없는 것: 사용자가 입력한 실지출 · 사용자 여행 정보 · 태그 ID
- **카피** 칩 `Sample` `Simulated` / 툴팁 `Prototype data. Confirm with the store.`

### GL-3 · Offline shell — [신규] · S
- **진입** 서비스워커가 네트워크 실패를 잡았을 때
- **내용** 오프라인에서도 되는 것 목록 (계획 보기 · 구매 기록 · 드롭오프 QR)
- **카피** `You're offline.` / `Your plan, your purchases and your drop-off pass all work without a connection.`

### GL-4 · Error boundary / 404 — [신규] · S
- **카피** `Something went wrong on our side.` / `Your trip data is safe.` / `Try again`

---

## 2.K 폐기 목록

| 대상 | 이유 |
| --- | --- |
| `.stage` / `.phone` / `.status-bar` / `.home-indicator` (390px 액자) | 웹앱 전환. §1.6 |
| `Preview next status →` (tracking) | 사용자가 커스터디를 올리면 원장 신뢰성 0 |
| `7 details understood · 94%` | 하드코딩. 아무 말 안 해도 94% 주장 |
| 전역 `MEMORY ON` 토글 단독 | 추천에 영향 없는 껍데기. 항목별 동의로 대체 |
| `replaceStop` 1:1 자동 교체 | 승인 게이트 없음. 후보 선택으로 대체 |
| 영수증 토스트 (`Hotel receipt saved…`) | 실체 없음. BG-8로 대체 |
| `pastTrips` 하드코딩 상수 | `trip_insights`로 대체 |
| `localStorage["trail-v3-state"]` 진실원본 | Supabase가 진실원본. localStorage는 캐시로 강등 |
| `app/chatgpt-auth.ts` | Supabase Auth로 대체 (이미 미사용) |
| profile ▸ `Open product workflow` 링크 | `/workflow`는 내부 문서 |
| `Test a failed payment` 체크박스 | 개발 전용. 프로덕션 숨김 |
| `app/layout.tsx`의 Figma capture 스크립트 | 프로덕션 잔존 여부 결정 필요 (§7-13) |

---

# 3. 빈 공간 채우기

아무도 만들지 않은 것들. 각각이 **화면 명세**로 존재해야 구현자가 만든다.

## 3.1 이송 불가 (헌법 ③)

→ **BG-3f**. 6가지 사유 × 각각의 복구 수단을 §2.H에 표로 명시했다.
핵심 원칙 3개:
1. `Delivery failed`가 아니라 `Delivery isn't available` — 실패가 아니라 조건 미충족이다.
2. 사유마다 **최소 2개의 복구 경로**가 있어야 한다. 하나뿐이면 그건 막다른 길이다.
3. 선택했던 가방 목록은 보존된다.

## 3.2 호텔 인계 실패 (헌법 ④)

→ **BG-10**. 4가지 사유 × 4개의 복구 액션.
핵심 원칙: **커스터디 표시가 사라지지 않는다.** 실패했다고 화면에서 가방이 없어지면, 사용자는 짐을 잃은 것과 구분할 수 없다.

## 3.3 지연 · 봉인 이상 신고

→ **BG-9**. 6가지 유형 + 사진 첨부 + 오프라인 큐.
스키마 부족: `transfer_events`에 `delayed`/`seal_issue` 이벤트 타입은 있지만 **신고 본문·사진·처리 상태를 담을 곳이 없다.** §5.2에서 `transfer_issues` 테이블 추가를 요청한다.

## 3.4 계정 · 설정 화면

→ **AC-1 ~ AC-5**. 현재 계정 개념이 UI에 전혀 없다. 로그인은 되는데 "내가 누구로 로그인했는지" 보이는 곳이 없다.
최소 구성: 이메일 표시 · 메모리 관리 · 알림/위치 권한 · 결제수단 · 데이터/삭제 · 로그아웃.

## 3.5 로그아웃

→ **AU-4**. 현재 **로그아웃 경로가 아예 없다.** 매직링크로 들어온 세션을 끝낼 방법이 UI에 없다.
필수: 미동기화 건이 있으면 경고. 공용 기기 시나리오 고려(`Sign out everywhere`는 §7-12 관련 결정).

## 3.6 위치 · 알림 권한 프라이밍

→ **ON-0** (첫 실행) + **AC-3** (설정).
원칙:
- OS 다이얼로그를 **아무 설명 없이 띄우지 않는다.** 브라우저 권한은 한 번 거부되면 앱 안에서 되돌릴 수 없다.
- 거부해도 앱 전체가 동작해야 한다. 위치 거부 → Map 탭이 "출발지 수동 선택" 모드. 알림 거부 → 인앱 상태 배지로 대체.
- 요청 시점: 위치는 **Map 탭 첫 진입 시**(맥락 안에서), 알림은 **결제 성공 직후**(`We'll tell you when your bags are collected`). 첫 실행에서 둘 다 요구하지 않는다.

## 3.7 첫 실행 온보딩

→ **ON-0**. 3장 + 권한 프라이밍 2개. `app_users.first_run_done_at`으로 재표시 방지 (스키마 추가 필요 §5.2).

## 3.8 오프라인 · 동기화 상태 표시

→ **GL-1** (칩) + **GL-3** (오프라인 셸).
화면별 오프라인 정책:

| 화면 | 오프라인 동작 |
| --- | --- |
| TR-1 여행 목록 | 캐시 표시 |
| TL-1 대시보드 | 캐시 표시 |
| TL-2/3/4 계획 | 읽기 O · 편집 낙관적 |
| TL-7 쇼핑 | **완전 동작.** 매장 안 오프라인은 정상 경로다 |
| TL-8 구매 기록 | **완전 동작.** 절대 블로킹 금지. `client_op_id`로 멱등 재생 |
| AI-1 대화 | 차단 (`Trail AI needs a connection`) |
| TL-10 대체품 | 차단 (서버가 대체 데이터를 만든다) |
| BG-1 가방 선택 | 선택은 로컬 · 이송 생성은 온라인 |
| BG-4 결제 | 차단 |
| BG-5 드롭오프 QR | **완전 동작. 캐시 필수.** 매장에서 못 띄우면 이송 자체가 불가 |
| BG-6 추적 | 마지막 알려진 상태 + `Last updated 12 min ago` |
| BG-9 이상 신고 | 큐 적재 |

충돌 규칙: 행 단위 LWW. 단 **이미 `bought`인 건에 대한 늦은 `planned` 덮어쓰기는 409로 거부.** 지출 기록이 사라지는 것이 최악의 실패다.

## 3.9 빈 상태 전수

| # | 상황 | 화면 | 카피 | 액션 |
| --- | --- | --- | --- | --- |
| 1 | 여행 0건 | TR-1 | `No trips yet.` / `Add where you're going and Trail will build a shopping day around it.` | `Add a trip` |
| 2 | 예정 여행만 있고 활성 없음 | TR-1 / TL-1 | `Seoul starts in 12 days.` / `You can plan your shopping now.` | `Plan shopping` |
| 3 | 활성 여행 · 계획 없음 | TL-1 | `Ready to explore Toronto?` / `Tell Trail who you're shopping for and it will build the route.` | `Plan with Trail AI →` |
| 4 | 활성 여행 · 계획 없음 | TL-2 Gifts | `No gifts planned yet.` | `Ask Trail AI →` |
| 5 | 계획 없음 | TL-3 Map | `Your route appears once you have a plan.` | `Ask Trail AI →` |
| 6 | 계획 없음 | TL-4 Budget | 지갑은 보인다 (예산은 여행 생성 시 만들어짐). `Nothing allocated yet.` | `Plan gifts →` |
| 7 | 구매 0건 | TL-5 Delivery | `Nothing to send yet.` / `You'll be able to arrange delivery once you've bought something.` | 버튼 비활성 |
| 8 | 구매 0건 | TL-7 Shopping | `4 stops planned. None visited yet.` | `Start at Spacing Store →` |
| 9 | **구매 0건 + 플랜 외 가방 0개** | **BG-1** | `Nothing to send yet.` / `Trail carries bags you've already bought. Record a purchase, or add a bag you picked up somewhere else.` | `Go to my route →` · `Add a bag I bought elsewhere` |
| 10 | 이송 이력 0건 | BG-1 하단 | `Past deliveries` 섹션 자체를 숨김 | — |
| 11 | 과거 여행 없음 | TR-1 | `PAST` 섹션 자체를 숨김 | — |
| 12 | 과거 여행 없음 | AC-2 메모리 | `Trail doesn't remember anything yet.` / `After your first trip, you can approve what carries over.` | — |
| 13 | 대화 이력 없음 | AI-1 | 인사 + 스타터 3개 (현재 구현됨) | 스타터 탭 |
| 14 | 도시 큐레이션 없음 | TL-6 | §3.10 | — |
| 15 | 추천 결과 없음 | TL-2 / TL-10 | §3.11 | — |
| 16 | 재고 문의 응답 없음 | TL-2b | `No answer yet.` / `Stores usually reply within an hour. You can still walk over.` | `Ask again` |
| 17 | 이상 신고 없음 | BG-9 이력 | 섹션 숨김 | — |
| 18 | 검색 결과 0 | 지역/매장 검색 | `Nothing matched "{query}".` | `Clear search` |

**규칙**: 빈 상태는 항상 (1) 무엇이 없는지 (2) 왜 없는지 (3) 무엇을 하면 채워지는지 세 가지를 말한다. 셋 중 하나라도 빠지면 반려한다.

## 3.10 큐레이션 없는 도시

현재 `stores`/`products`는 큐레이션 테이블이고, 토론토 외 도시는 비어 있다. 사용자는 서울·파리 여행을 만들 수 있다.

- **카피** `Trail doesn't have curated stores in Seoul yet.` / `You can still plan a budget, record purchases and send bags — recommendations just won't be Trail-picked.`
- **동작** 계획 생성은 가능하되 `stops`는 사용자가 직접 추가. AI는 상호명을 지어내지 않는다 (동네·매장 유형까지만 제안)
- **금지** 없는 도시에서 그럴듯한 상호명을 만들어내는 것. 현재 프롬프트가 매장 데이터 없이 "where를 추천하라"고 지시해서 **상호명·주소·영업시간이 100% 환각**이다

## 3.11 추천 불가 (헌법 ①)

- **진입** 계획 생성 시 조건을 만족하는 조합이 없음 · TL-10에서 대체 후보 없음
- **카피** `We couldn't find anything in Kensington Market under CAD $20 that isn't fragile.`
- **복구 3개** `Raise the budget for this gift` / `Widen the area` / `Drop the fragile-free requirement`
- **원칙** 조건을 **하나씩 나열하고 어느 것을 풀지 사용자가 고른다.** Trail이 임의로 조건을 완화하지 않는다

## 3.12 그 밖에 아무도 만들지 않은 것

| 항목 | 어디로 |
| --- | --- |
| 매직링크 만료·오류 화면 | AU-3 |
| 여행 생성 성공 착지 | ON-5 |
| 활성 여행 전환 | TR-4 |
| 영수증 실체 | BG-8 |
| 계정 삭제 / 데이터 내보내기 | AC-5 |
| 재발송 쿨다운 | AU-2 |
| 계획 편집 잠금(이송 중) | TL-2 상태분기 |
| 통화 잠금(지출 발생 후) | TR-2 승인게이트 |
| 드롭오프 마감 카운트다운 | BG-5 |
| 플랜 외 가방 입력 | BG-1 |
| PWA 설치 안내 | AC-1 `Install Trail` |
| 오프라인 셸 | GL-3 |

---

# 4. 승인 게이트 전수 목록

**정의**: 값이 바뀌거나 · 돈이 움직이거나 · 외부에 무언가 전달되는 모든 지점.
**원칙**: Trail(AI·정규식·시스템)은 어떤 게이트도 스스로 통과할 수 없다. DB 제약이 이를 강제한다 (`plan_events.ai_cannot_approve`, `only_approval_writes_approved`).

## 4.1 계획 · 예산

| # | 게이트 | 화면 | 승인자 | 기록 |
| --- | --- | --- | --- | --- |
| 1 | AI 제안 patch를 brief에 반영 | AI-1 제안 칩 `Add to brief` | 사용자 | `plan_events{actor:ai_patch, applied:true, stage:draft}` |
| 2 | 정규식 폴백 patch 반영 | AI-1 제안 칩 | 사용자 | `plan_events{actor:regex_suggestion}` |
| 3 | 클램프된 값의 고지 | AI-1 시스템 문구 | (고지만) | `plan_events.raw_value` |
| 4 | 필드 삭제(`clear`) | AI-1 | 사용자(모델 제안 시 확인) | `plan_events` |
| 5 | brief 수동 편집 | AI-2 | 사용자 | `plan_events{actor:user_edit}` |
| 6 | 수령인 추가/삭제 | AI-2 | 사용자 | `recipients` |
| 7 | **계획 승인 (draft → approved)** | TL-2 `Build my route →` | 사용자 | `plans.approved_at` + `approved_snapshot` + `plan_events{actor:approval, stage:approved}` |
| 8 | 승인 후 계획 편집 → 경로 재생성 | TL-2 배너 `Rebuild the route` | 사용자 | 새 `plans` 버전 |
| 9 | 항목(stop) 삭제/추가 | TL-2 / TL-2b | 사용자 | `stops` |
| 10 | 대체품 교체 | TL-10 후보 선택 | 사용자 | `stops.replaced_stop_id` |
| 11 | 경로 순서 변경 | TL-3 `Save order` | 사용자 | `stops.sequence` |
| 12 | 총예산 변경 | TL-4 | 사용자 | `budget_changes{status:approved}` |
| 13 | 수령인별 배분 변경 | TL-4 | 사용자 | `plan_allocations` |
| 14 | **flexible → planned 이동** | TL-4 / TL-9 | 사용자 | `budget_changes` (헌법 5) |
| 15 | delivery_reserve 축소 | TL-4 + 경고 | 사용자 | `budget_changes` |
| 16 | **예산 초과 처리 4택** | TL-9 | 사용자 | `budget_changes` |
| 17 | 초과를 그대로 수용(`Continue anyway`) | TL-9 | 사용자 | `budget_changes` |

## 4.2 구매

| # | 게이트 | 화면 | 승인자 |
| --- | --- | --- | --- |
| 18 | **구매 기록 생성** | TL-8 `Confirm purchase` | 사용자 (Trail은 절대 생성 안 함) |
| 19 | 구매 수정 | TL-8 | 사용자 |
| 20 | 구매 취소/환불 | TL-8 `Remove purchase` | 사용자 + 확인 |
| 21 | 재고 문의(`Request`) 전송 | TL-2 / TL-2b | 사용자 (매장에 나가는 요청) |
| 22 | stop 건너뛰기 | TL-7 `Skip` | 사용자 (되돌리기 가능) |

## 4.3 이송 · 결제

| # | 게이트 | 화면 | 승인자 | 기록 |
| --- | --- | --- | --- | --- |
| 23 | **보낼 가방 선택** | BG-1 (기본 전체선택 금지) | 사용자 | `bag_transfer_items` |
| 24 | 플랜 외 가방 추가 | BG-1 | 사용자 | `bag_transfer_items{purchase_id:null}` |
| 25 | **이송 확정** (호텔·개수·요금 확인) | BG-3 `Continue to payment` | 사용자 | `bag_transfers.confirmed_at` |
| 26 | 호텔이 배송을 받는지 사용자 확인 | BG-3 `I've checked with the hotel` | 사용자 | `trips.hotel_verified_at` |
| 27 | 드롭오프 파트너 변경 | BG-3 / BG-3f | 사용자 | `bag_transfers.dropoff_store_id` |
| 28 | **결제 청구** | BG-4 `Pay CAD $9.00` | 사용자 | `payments{captured}` |
| 29 | 결제 취소 / 이송 취소 | BG-4f `Cancel delivery` | 사용자 + 확인 | `payments{released}` + `transfer_events{cancelled}` |
| 30 | 드롭오프 자기신고 | BG-5 `I've dropped off my bags` | 사용자 | `transfer_events{actor:traveler, dropped_off}` |
| 31 | 가방 개수 불일치 정정 | BG-5f | 사용자 | `bag_transfers.bag_count` + 이벤트 |
| 32 | 이송 불가 시 복구안 선택 | BG-3f | 사용자 | `bag_transfers.ineligible_reason` |
| 33 | 인계 실패 시 대체 주소 배송 | BG-10 | 사용자 | 새 `bag_transfers` |
| 34 | 파트너 지점 보관 연장(추가요금) | BG-10 | 사용자 + 금액 명시 | `payments` |
| 35 | 이상 신고 제출 | BG-9 `Send report` | 사용자 | `transfer_issues`(신규) |
| 36 | 신고 사진 첨부 | BG-9 | 사용자 | — |

## 4.4 계정 · 프라이버시

| # | 게이트 | 화면 | 승인자 |
| --- | --- | --- | --- |
| 37 | **메모리 제약 생성 (항목별)** | TL-6 / TR-3 `Yes — something different` | 사용자 |
| 38 | 메모리 제약 철회 | AC-2 `Forget this` | 사용자 |
| 39 | 메모리 전역 활성화 | AC-2 (기본 off) | 사용자 |
| 40 | 위치 권한 | ON-0 / TL-3 첫 진입 | 사용자 (OS 다이얼로그 전 앱 내 설명) |
| 41 | 알림 권한 | 결제 성공 직후 / AC-3 | 사용자 |
| 42 | 참조 사진 첨부 | AI-1 | 사용자 + **업로드 여부 정직 고지** |
| 43 | 로그아웃 | AU-4 | 사용자 + 미동기화 경고 |
| 44 | 계정 삭제 | AC-5 | 사용자 + 2단계 + 재인증 |
| 45 | 결제수단 등록/삭제 | AC-4 | 사용자 (프로바이더 위젯) |

## 4.5 여행

| # | 게이트 | 화면 | 승인자 |
| --- | --- | --- | --- |
| 46 | 활성 여행 전환 (이송 진행 중일 때) | TR-4 | 사용자 + 확인 |
| 47 | 호텔 변경 (승인된 계획 존재) | TR-2 | 사용자 + 영향 고지 |
| 48 | 통화 변경 (지출 발생 후) | TR-2 | **잠금** — 변경 불가 |
| 49 | 여행 보관/삭제 | TR-2 | 사용자 + 확인 |
| 50 | localStorage 1회 이관 | 부팅 시 | 서버 멱등 (`migration_imports`) — 사용자 고지 |

## 4.6 절대 게이트가 아닌 것 (Trail이 자유롭게 하는 것)

- 추천 후보 계산 · 경로 시간 추정 · 예산 초과 **감지**(처리는 게이트) · 대체 후보 **검색**(선택은 게이트) · 커스터디 이벤트 **표시** · 재고 문의 응답 표시 · 여행 인사이트 생성(사용은 게이트)

---

# 5. 데이터 매핑

## 5.1 화면 → 테이블

R = 읽기, W = 쓰기

| 화면 | 테이블 |
| --- | --- |
| AU-1~4 로그인/로그아웃 | `auth.users`(Supabase), `app_users` R/W |
| ON-0 첫 실행 | `app_users` W (`first_run_done_at` ← **신규 컬럼**) |
| ON-1~5 여행 등록 | `trips` W, `plans` W(draft, 3버킷) |
| TR-1 여행 목록 | `trips` R, `plans` R, `trip_insights` R, `bag_transfers` R(배지) |
| TR-2 여행 상세 | `trips` R/W |
| TR-3 과거 여행 | `trips` R, `trip_insights` R, `purchases` R, `receipts` R, `memory_constraints` W |
| TR-4 여행 전환 | `trips` W(`status`) |
| TL-1 대시보드 | `trips` R, `plans` R, `stops` R, `purchases` R, `bag_transfers` R |
| TL-2 Gifts | `plans` R/W, `stops` R/W, `recipients` R, `plan_allocations` R, `store_inquiries` W, `plan_events` W |
| TL-2b 선물 상세 | `stops` R/W, `products` R, `stores` R, `store_inquiries` R/W |
| TL-3 Map | `stops` R/W(`sequence`), `stores` R |
| TL-4 Budget | `plans` R/W, `plan_allocations` R/W, `budget_changes` W, `purchases` R |
| TL-5 Delivery 요약 | `bag_transfers` R, `purchases` R, `stores` R(파트너), `trips` R |
| TL-6 Made for {city} | `products` R, `stores` R, `memory_constraints` R/W |
| TL-7 Shopping | `stops` R/W, `purchases` R |
| TL-8 구매 기록 | `purchases` W(`client_op_id`), `stops` W(`status`) |
| TL-9 예산 초과 | `budget_changes` R/W, `plans` R/W, `plan_allocations` W, `plan_events` W |
| TL-10 대체품 | `stops` W(`replaced_stop_id`), `products` R, `stores` R |
| AI-1 대화 | `chat_messages` R/W, `plans` R/W(draft), `plan_events` W, `memory_constraints` R, `trips` R |
| AI-2 brief 편집 | `plans` R/W, `recipients` R/W, `plan_allocations` R/W, `plan_events` W |
| BG-1 가방 선택 | `purchases` R, `bag_transfers` R/W(draft), `bag_transfer_items` R/W |
| BG-2 요약 | `bag_transfers` R, `plans` R(예비비) |
| BG-3 이송 검토 | `bag_transfers` W(호텔 동결·요금·ETA), `stores` R(파트너), `trips` R/W(`hotel_verified_at`) |
| BG-3f 이송 불가 | `bag_transfers` W(`ineligible_reason`), `transfer_events` W(`declined`) |
| BG-4 결제 | `payments` W, `bag_transfers` W(`status`), `transfer_events` W(`paid`) |
| BG-4f 결제 실패 | `payments` W(`failure_code`) |
| BG-5 드롭오프 | `bag_transfers` R(`pass_token_hash`), `transfer_events` W(`dropped_off`), `bag_transfer_items` R |
| BG-5f 파트너 거부 | `transfer_events` W, `bag_transfers` W(`bag_count`), `payments` W(환불) |
| BG-6 추적 | `transfer_events` R, `bag_transfers` R, `bag_transfer_items` R |
| BG-7 완료 | `receipts` R, `transfer_events` R |
| BG-8 영수증 상세 | `receipts` R, `transfer_events` R, `bag_transfer_items` R, `payments` R, `purchases` R |
| BG-9 이상 신고 | `transfer_events` W, **`transfer_issues` W (신규)** |
| BG-10 인계 실패 | `transfer_events` R/W, `bag_transfers` R/W |
| AC-1 계정 | `app_users` R/W |
| AC-2 메모리 | `memory_constraints` R/W, `app_users` W(`memory_enabled`) |
| AC-3 알림/위치 | **`push_subscriptions` (신규)** 또는 클라이언트 전용 |
| AC-4 결제수단 | **`payment_methods` (신규)** |
| AC-5 데이터 | 전 테이블 (내보내기), `migration_imports` R |
| GL-1 동기화 칩 | 클라이언트 IndexedDB `outbox` (서버 테이블 없음) |

## 5.2 스키마에 없어서 추가가 필요한 것

| # | 필요한 것 | 왜 | 제안 |
| --- | --- | --- | --- |
| 1 | **이상 신고 본문** | BG-9. `transfer_events`에 `delayed`/`seal_issue` 타입은 있으나 설명·사진·처리상태를 담을 곳이 없다. `transfer_events`는 append-only라 `resolved`로 갱신도 못 한다 | `transfer_issues(id, transfer_id, user_id, kind, description, photo_paths text[], status open/investigating/resolved, reported_at, resolved_at, event_id)` |
| 2 | **저장 결제수단** | AC-4, BG-4의 `Saved Visa •••• 4242`. `payments`에 건별 `method_brand/last4`만 있어서 결제 전에 목록을 보여줄 수 없다 | `payment_methods(id, user_id, provider, provider_method_id, brand, last4, is_default, created_at)` + `app_users.provider_customer_id` |
| 3 | **첫 실행 완료 플래그** | ON-0. 클라이언트에만 두면 기기마다 다시 뜬다 | `app_users.first_run_done_at timestamptz` |
| 4 | **파트너 지점 취급 능력** | BG-3f의 "취급 불가" 판정 근거가 없다. `stores.is_partner_point`와 `dropoff_cutoff`만 있고 어떤 취급을 받는지·최대 중량·하루 수용량이 없다 | `stores.accepted_handling handling_type[]`, `stores.max_weight_grams`, `stores.daily_capacity` |
| 5 | **매장 영업시간(구조화)** | TL-3의 "20분 전 폐점" 경고, BG-3의 마감 카운트다운. 현재 `hours_note text` 뿐이라 계산할 수 없다 | `store_hours(store_id, weekday, opens, closes)` 또는 `stores.hours jsonb` |
| 6 | **호텔 수령 정책** | BG-3f의 "호텔이 배송 거부", BG-10의 "프런트 마감". `trips.hotel_name/address/verified_at`은 자유 텍스트라 정책을 못 담는다 | `hotels(id, city, name, address, accepts_delivery, front_desk_hours, note, source)` + `trips.hotel_id nullable` |
| 7 | **드라이버/기사** | 피그마 -12에 기사 개념이 있고 user flow 9단계에도 있다. `transfer_actor` enum에 `driver`는 있으나 실체 테이블이 없다 | 프로토타입 동안은 `transfer_events.payload`에 이름만. 실서비스 시 `couriers` |
| 8 | **평가(Rate Trail)** | 피그마 -13의 `Rate Trail` 버튼에 대응하는 테이블 없음 | §7-10에서 기능 유지 여부부터 결정. 유지 시 `transfer_ratings(transfer_id, user_id, score, comment)` |
| 9 | **웹푸시 구독** | AC-3 알림. PWA 푸시를 하려면 엔드포인트 저장 필요 | `push_subscriptions(id, user_id, endpoint, keys jsonb, created_at, revoked_at)` — §7-7 결정 후 |
| 10 | **오프라인 멱등키 누락** | `purchases.client_op_id` ✔, `payments.client_op_id` ✔, `transfer_events.client_event_id` ✔, `chat_messages.client_msg_id` ✔ — 그러나 `stops`(saved 토글·순서), `store_inquiries`, `budget_changes`에는 없다. 오프라인 재생 시 중복이 생긴다 | 세 테이블에 `client_op_id` + 유니크 인덱스 |
| 11 | **활성 여행이 하나임을 보장** | §1.2의 착지 규칙이 `trips.status='active'` 유일성에 의존한다. 현재 제약 없음 | `create unique index trips_one_active on trips(user_id) where status='active'` |
| 12 | **표시 통화 규칙** | `trips.currency` ✔ 있음. 사용자 홈 통화(`app_users.home_currency`)와 다를 때 환산 표시 규칙이 없다 | 스키마 변경 불필요. 표시 규칙만 정하면 됨 (§7-9) |

## 5.3 이미 있어서 추가가 필요 없는 것 (재확인)

- 다중 수령인 → `recipients` (`is_self`, `equal_value_group`, `priority`, `is_optional`) ✔
- 수령인별 예산 → `plan_allocations` ✔
- 3버킷 지갑 + 합계 제약 → `plans.plans_buckets_sum` ✔
- 승인 시점 가격 동결 → `stops.snapshot_price_cents` ✔
- **플랜 외 가방** → `bag_transfer_items.purchase_id nullable` + `transfer_items_labelled` 제약 ✔ (손그림 주석이 이미 반영돼 있다)
- 가방 개별 봉인 → `bag_transfer_items.seal_id` + 전역 유니크 ✔
- 재고 문의 → `store_inquiries` (`inquiry_status` 5종) ✔
- 커스터디 원장 → `transfer_events` append-only + 트리거 이중잠금 ✔
- 영수증 → `receipts` (수정 불가) ✔
- 예산 변경 승인 → `budget_changes` (proposed/approved/rejected) ✔
- AI 승인 불가 강제 → `plan_events.ai_cannot_approve`, `only_approval_writes_approved` ✔
- 항목별 메모리 동의 → `memory_constraints` (`kind: avoid|prefer`, `revoked_at`) ✔
- 과거 여행 인사이트 → `trip_insights` ✔
- 샘플/시뮬 라벨 근거 → `data_source` enum ✔
- 이송 부적격 사유 → `bag_transfers.ineligible_reason` ✔

**스키마가 제품 규칙을 이미 상당히 앞서 있다.** 남은 격차는 대부분 (a) 외부 파트너·호텔·매장의 실제 조건 데이터와 (b) 신고·결제수단·푸시 같은 운영 표면이다.

---

# 6. 구현 순서

의존관계 기준. **선행이 끝나기 전에 후행을 시작하면 두 번 만들게 되는 것**만 화살표로 묶었다.

## Phase 0 — 기반 (다른 모든 것의 선행)

| # | 작업 | 크기 | 선행 | 왜 먼저인가 |
| --- | --- | --- | --- | --- |
| 0-1 | **뷰포트 전환**: `.stage`/`.phone`/`.status-bar`/`.home-indicator` 제거, `max-width` 컨테이너 + `dvh` + safe-area | M | — | 화면을 만든 뒤에 하면 전부 다시 잰다 |
| 0-2 | **타이포 스케일 재조정** (본문 ≥14px, 라벨 ≥11px) | M | 0-1 | 접근성 차단 항목. 현재 5.5px 라벨은 액자 밖에서 읽을 수 없다 |
| 0-3 | **라우팅 전환**: 단일 상태머신 → `/trips` `/trail` `/ask` `/bags` `/account` | L | 0-1 | 탭 IA·뒤로가기·PWA 딥링크의 전제 |
| 0-4 | **인증 게이트**: 미로그인 → `/login`, 여행 0건 → `/trips` 빈 상태 | S | 0-3 | 현재 `/`가 무인증으로 열린다 |
| 0-5 | **`GET /api/state`**: 활성 여행 + 계획 + stops + 구매 + 이송을 왕복 1회에 | M | 0-4 | 모든 데이터 화면의 공통 진입. 화면마다 개별 쿼리를 짜면 나중에 통합 못 한다 |
| 0-6 | 스키마 보강 §5.2의 #3 #10 #11 (플래그·멱등키·활성 유일성) | S | — | 뒤에서 마이그레이션이 커지는 것을 막는다 |

## Phase 1 — 여행과 지갑 (읽기)

| # | 작업 | 크기 | 선행 |
| --- | --- | --- | --- |
| 1-1 | TR-1 여행 목록 + 빈 상태 + 활성 전환(TR-4) | M | 0-5 |
| 1-2 | ON-5 여행 생성 착지 · ON-1~4 오프라인/재시도 마감 | S | 1-1 |
| 1-3 | TL-1 대시보드 (7가지 상태분기 + 지갑 3버킷 읽기) | M | 0-5 |
| 1-4 | TR-2 여행 상세·설정 (기존 profile 폼 이관) | M | 1-1 |
| 1-5 | AC-1 계정 + **AU-4 로그아웃** | M | 0-4 |
| 1-6 | GL-1 동기화 칩 · GL-4 오류 경계 | S | 0-3 |

## Phase 2 — 계획 (이 앱의 심장)

| # | 작업 | 크기 | 선행 |
| --- | --- | --- | --- |
| 2-1 | AI-1 대화 서버 저장 (`chat_messages`) + brief를 **서버가 DB에서 읽기** | M | 0-5 |
| 2-2 | AI-1 오류 코드별 분기 + 클램프 고지 + 제안 칩 승인 경로 (P0-2 마감) | M | 2-1 |
| 2-3 | AI-2 brief 편집 + **`recipients` 다중 수령인** | L | 2-1 |
| 2-4 | **계획 생성·승인**: `plans` draft→approved, `stops` 생성, `snapshot_price_cents` 동결, `plan_events` 원장 | L | 2-3 |
| 2-5 | TL-2 Plan ▸ Gifts (+ `Request` 재고 문의) | L | 2-4 |
| 2-6 | TL-3 Plan ▸ Map | L | 2-4 |
| 2-7 | TL-4 Plan ▸ Budget (지갑 편집 + `budget_changes`) | M | 2-4 |
| 2-8 | TL-5 Plan ▸ Delivery 요약 | S | 2-4 |
| 2-9 | TL-2b 선물 상세 + TL-6 Made for {city} + §3.10 큐레이션 없는 도시 | M | 2-5 |

## Phase 3 — 쇼핑과 오프라인

| # | 작업 | 크기 | 선행 |
| --- | --- | --- | --- |
| 3-1 | **IndexedDB 아웃박스 + 멱등 재생 + 충돌 규칙(409)** | L | 0-5 |
| 3-2 | TL-7 Shopping (진행률·가능액·보호액) | M | 2-4, 3-1 |
| 3-3 | TL-8 구매 기록 전체화면 + 환불(void) | M | 3-2 |
| 3-4 | **TL-9 예산 초과 승인 4택** (헌법 ②) | M | 3-3, 2-7 |
| 3-5 | **TL-10 대체품 선택** (헌법 ①) + §3.11 추천 불가 | M | 3-2 |

## Phase 4 — 가방과 결제

| # | 작업 | 크기 | 선행 |
| --- | --- | --- | --- |
| 4-1 | 스키마 보강 §5.2의 #4 #5 #6 (파트너 취급능력·영업시간·호텔 정책) | M | — |
| 4-2 | BG-1 가방 선택 + **플랜 외 가방** + 빈 상태 | M | 3-3 |
| 4-3 | BG-2 요약 · BG-3 이송 검토 (호텔 동결·파트너 선택) | M | 4-1, 4-2 |
| 4-4 | **BG-3f 이송 불가 6사유** (헌법 ③) | M | 4-3 |
| 4-5 | BG-4 결제 + `payments` 원장 + BG-4f 실패 | M | 4-3 |
| 4-6 | §5.2의 #2 저장 결제수단 + AC-4 | S | 4-5 |

## Phase 5 — 커스터디와 완료

| # | 작업 | 크기 | 선행 |
| --- | --- | --- | --- |
| 5-1 | BG-5 드롭오프 QR (**오프라인 캐시 필수**) + `pass_token_hash` | M | 4-5 |
| 5-2 | **커스터디 시뮬레이터**: `transfer_events`를 시스템 액터로만 생성. 사용자 버튼은 `/api/dev/*`로 분리하고 프로덕션 차단 | L | 5-1 |
| 5-3 | BG-6 추적 (원장 읽기 전용) | M | 5-2 |
| 5-4 | BG-5f 파트너 거부 · **BG-10 인계 실패** (헌법 ④) | M | 5-2 |
| 5-5 | BG-7 완료 + `receipts` 생성 + **BG-8 영수증 상세** | M | 5-3 |
| 5-6 | §5.2의 #1 `transfer_issues` + **BG-9 이상 신고** | M | 5-3 |
| 5-7 | 여행 종료 → `trip_insights` 승격 + TR-3 과거 여행 | M | 5-5 |

## Phase 6 — 메모리 · 권한 · PWA

| # | 작업 | 크기 | 선행 |
| --- | --- | --- | --- |
| 6-1 | AC-2 메모리 항목별 동의 + `memory_constraints` 실제 주입 | M | 2-2 |
| 6-2 | ON-0 첫 실행 + 권한 프라이밍 + AC-3 | M | 1-5 |
| 6-3 | **PWA**: manifest · 서비스워커 · 앱 셸 캐시 · GL-3 오프라인 셸 · 설치 프롬프트 | M | 0-3, 3-1 |
| 6-4 | 웹푸시 (§7-7 결정 후) | M | 6-2, 6-3 |
| 6-5 | 빈 상태 18종 전수 마감 (§3.9) | S | 각 화면 |
| 6-6 | AU-3 링크 오류 · AU-2 쿨다운 · AC-5 데이터/삭제 | M | 1-5 |

## 병렬 가능

- Phase 0-1/0-2(디자인)와 0-6(스키마)은 독립
- Phase 4-1(스키마)은 Phase 2·3과 병렬
- Phase 6-3(PWA)은 3-1 아웃박스 이후 언제든

## 절대 순서 (어기면 다시 만든다)

```
0-1 뷰포트 → 0-2 타이포 → (모든 화면)
0-3 라우팅 → 0-4 인증 → 0-5 /api/state → (모든 데이터 화면)
2-3 수령인 → 2-4 계획승인 → 2-5~2-8 Plan 4탭 → 3-2 쇼핑
3-1 아웃박스 → 3-2 쇼핑 · 5-1 QR   (둘 다 오프라인이 정상 경로)
3-3 구매기록 → 4-2 가방선택         (보낼 것이 있어야 한다)
4-5 결제 → 5-1 드롭오프 → 5-2 커스터디 → 5-5 영수증
```

---

# 7. 결정이 필요한 것

여기 있는 항목은 **사용자가 답해야** 다음이 진행된다. 내가 임의로 정하지 않았다.

1. **탭 이름 확정** — 나는 `Trips · Trail · Ask AI · Bags`로 정했다(§1.1). 피그마에 `Home`이 있는 안(Home.png, -15, 손그림)도 있는데, `Home`을 살리고 `Trail`을 없애는 쪽을 원하는가? 살린다면 여행이 0건일 때 Home에 무엇을 띄울지도 함께 정해야 한다.

2. **부팅 착지 규칙** — §1.2 표대로 좋은가? 특히 "여행 0건이면 Trips 빈 상태" vs "온보딩 강제 진입" 중 어느 쪽인가.

3. **여행 생성 방식** — 4단계 폼(이미 구현)만 유지할지, 피그마 -16의 **대화형 등록**도 만들지. 둘 다 만들면 진입점을 어떻게 나눌지(예: 첫 여행은 폼, 이후는 대화).

4. **다크 테마 전환 시점** — 현재 코드는 라이트(`--paper:#f5f6f1`), 피그마는 전부 다크다. 지금 전환할지, 화면을 다 만든 뒤 한 번에 할지. (뷰포트 전환 0-1과 같이 하면 한 번에 끝난다)

5. **결제 실연동 시점과 프로바이더** — `payments.provider`의 기본값이 `'stripe'`다. Stripe 확정인가? 그리고 `Test a failed payment` 체크박스를 프로덕션에서 숨기는 것이 맞나(데모 시연 때 실패 경로를 보여줄 필요가 있다면 유지할 수도 있다).

6. **파트너 지점·기사·호텔 데이터의 출처** — 언제까지 전부 `simulated`로 갈 것인가. 부트캠프 시연까지 시뮬레이션 유지라면 §5.2의 #4 #5 #6은 "가짜 데이터를 담을 그릇"으로만 만들면 된다.

7. **알림 — 웹푸시 도입 여부** — iOS Safari는 홈화면 설치 후에만 푸시가 된다. 도입하면 "설치 유도"가 온보딩의 필수 단계가 되고, 안 하면 이송 상태를 앱을 열어야만 알 수 있다. 어느 쪽인가.

8. **메모리를 언제 물을 것인가** — DB 기본값은 opt-in(`memory_enabled default false`)으로 이미 정해져 있다. 남은 질문은 **첫 제안 시점**이다. 첫 여행 완료 후? 두 번째 여행 계획 시작 시? (피그마 -3은 계획 중에 묻는다)

9. **통화 표시 규칙** — `trips.currency`(여행 통화)와 `app_users.home_currency`(홈 통화)가 다를 때. 여행 통화만 표시할지, `CAD $58 (약 ₩58,000)`처럼 병기할지. 병기하면 환율 출처가 필요하다.

10. **`Rate Trail` 유지 여부** — 피그마 -13에 버튼이 있으나 스키마에 자리가 없다. 프로토타입 범위에서 뺄지, §5.2의 #8을 추가할지.

11. **계정 삭제와 감사 원장의 충돌** — `transfer_events`/`plan_events`/`receipts`는 append-only이고 트리거로 수정·삭제가 막혀 있다. 계정 삭제 시 (a) CASCADE로 원장까지 지운다 (b) 익명화만 하고 원장은 남긴다 (c) 삭제 자체를 제공하지 않는다. 어느 쪽인가.

12. **여행 공유 / 동행자** — `trips.companions`가 자유 텍스트다. 동행자가 같은 계획을 보는 기능은 현재 범위 밖으로 두었는데 맞나. (맞다면 RLS는 지금 구조 그대로 두면 된다. 아니라면 공유 테이블이 필요하고 RLS 정책을 전부 다시 짜야 한다)

13. **`app/layout.tsx`의 Figma capture 스크립트** — `https://mcp.figma.com/mcp/html-to-design/capture.js`가 프로덕션 `<head>`에 남아 있다. 외부 스크립트라 CSP·프라이버시 문제가 있다. 개발에서만 로드할지, 완전히 뺄지.

14. **데스크톱 레이아웃** — 웹 우선이라면 ≥768px에서 무엇을 보여줄 것인가. (a) 480px 중앙 단일 컬럼 유지 (b) 2열(좌: 내비·지갑 고정, 우: 본문) (c) 데스크톱은 안내 화면. 시연 환경이 노트북이라면 (b)가 유리하다.

---

## 부록 — 카피 원칙

- 확정어 금지: `confirmed` `booked` `guaranteed` `reserved for you` `held` — **우리가 통제하지 않는 사실에 한해서.** 태그 대조로 확인된 `Delivered`는 써도 된다.
- 실패는 사용자 탓이 아니다: `You entered the wrong…` ✗ / `That didn't go through.` ○
- 돈 문장에는 항상 통화 코드: `CAD $9`, `¥41,800`
- 이송 문장에는 항상 주체가 있다: `Trail transports them` / `Staff attach a tag` / `The front desk signed for them` — 수동태로 주체를 지우지 않는다
- 빈 상태는 3요소: 무엇이 없는지 · 왜 없는지 · 무엇을 하면 채워지는지
- 라벨 대문자 트래킹(`DELIVER TO`, `BUDGET SUMMARY`)은 피그마 관례를 유지
