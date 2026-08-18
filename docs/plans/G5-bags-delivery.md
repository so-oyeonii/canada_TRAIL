# G5 · 짐 · 배송 — 실행 계획

기준 문서: `docs/FIGMA_ADOPTION.md`. §1 협상 불가 6개 중 5개가 이 그룹에 걸린다(1 Sample/Simulated · 2 실패 분기 · 3 Apple Pay 로고 금지 · 5 SVG 아이콘 · 6 `Delivery complete →`는 링크). §4 계약 준수.

대상 프레임: `-7` `-8` `-9` `-10` `-11` `-12` `-13` `-20`, 참조 `-5` `-6`.

---

## 0. 이 그룹의 전제 — 백엔드가 화면보다 앞서 있다

착수 전 코드를 전부 읽고 확인한 사실:

| 이미 서버가 주는 것 | 어디서 |
| --- | --- |
| `TRLP1.<payload>.<HMAC>` 드롭오프 패스, 만료 `min(cutoff+3h, issued+24h)`, `sha256(token)`만 저장 | `POST /api/transfers/[id]/pass` · `lib/transfers/pass.ts` |
| 파트너 스캔 검증(서명 → 만료 → 저장 해시 상수시간 비교) + 15분 스캔 세션 | `POST /api/partner/scan` |
| 커스터디 원장 `transfer_events(seq, occurred_at, event_type, actor, note, payload, source)` | `queries.ts` → `shapeTransfer` (seq 오름차순 정렬 완료) |
| 이송 불가 6코드 + remedy 코드 | `lib/transfers/eligibility.ts`, `bag_transfers.ineligible_code` |
| 호텔 인계 실패 4코드 | `bag_transfers.handoff_failure_code` |
| 태그 집합 대조 `compareSeals()` + `receipts.seal_ids[]` 기록 | `lib/transfers/custody.ts`, `handoffTransfer()` |
| 수수료 견적 · 파트너 카운터 · 컷오프 instant · `minutesToCutoff` · `open` · 행별 `source` | `GET /api/dropoff-points` |
| 결제 시뮬레이션 + `payments` 행 + `paid` 이벤트 | `POST /api/payments/simulate` |
| 호텔 검증 시각 `trips.hotel_verified_at` → `Trip.hotelVerifiedAt` | `queries.ts` |
| 무게 합산 `weightOf()` · `bag_transfer_items.weight_grams` 저장/검증 경로 | `lib/transfers/manifest.ts` |

**즉, 이 그룹의 일 대부분은 신규 API가 아니라 이미 있는 값을 화면으로 꺼내는 것이다.** 신규 서버 작업은 아래 §6의 4줄뿐이다.

---

## 1. `/bags/drop` — QR 드롭오프 (프레임 `-11`) 【신규】

### 1.1 QR 인코더 선택 — 근거

현재 런타임 의존성은 next·react·react-dom·supabase 4종뿐이다. 여기에 하나를 더할지, 손으로 쓸지의 판단.

**토큰 길이 실측**: payload JSON ≈ 144 B(`v,k,t(uuid 36),j(uuid 36),iat,exp,n`) → b64url 192자, 서명 32 B → 43자, 프리픽스·점 7자. **합계 약 242자**.
바이트 모드 용량: ECC M v10=213 B(부족) / **v11=251 B(가능, 61×61)**, ECC L v10=271 B. 스캐너 신뢰성을 위해 **ECC M, version 11** 을 목표로 한다.

즉 인코더는 (a) 바이트 모드 v11 이상, (b) **다중 블록 Reed–Solomon**(v11-M은 4블록), (c) 마스크 8종 평가를 전부 구현해야 한다. GF(256) 산술 300여 줄이고, **버그가 나도 QR은 멀쩡해 보이고 매장 카운터에서만 실패한다** — 이 저장소의 테스트로 검증할 수 없는 종류의 오류다. 손으로 쓰지 않는다.

**채택: `uqr`** (zero-dependency, MIT, ~11 kB, 프레임워크 비의존, `encode(text,{ecc:'M'}) → { size, data: boolean[][] }`).
- **오프라인 근거**: 정적 import이므로 라우트 JS 청크에 들어간다. 런타임 네트워크 요청 0. 서비스워커가 청크만 캐시하면 지하 매장에서 그대로 렌더된다. 반면 `qrcode` 계열의 canvas/서버 렌더 경로는 셸 캐시와 엮이면 깨진다.
- **매트릭스만 받고 SVG는 우리가 그린다** → 명도, quiet zone(4모듈), `role="img" aria-label`, 다크테마 무시(항상 흰 배경·검은 모듈)를 우리가 통제한다. 이 통제권 때문에 `qrcode.react`(React 결합, 마크업 통제 약함)보다 낫다.
- 설치 시 API가 다르면 대체안: `qrcode.react@4`(zero-dep). 둘 다 불가하면 그때 손으로 쓰되 별도 티켓.

### 1.2 QR 페이로드 — **건드리지 않는다**

`lib/transfers/pass.ts`를 읽고 확인했다. 페이로드에 담기는 것은 `{v,k,t(transferId),j(jti),iat,exp,n(bagCount)}` **뿐**이다. 이름·호텔·금액·이메일 없음. 어깨 너머로 QR을 찍은 사람이 얻는 것은 uuid 하나다. `k`가 여행자 패스와 파트너 단말 세션을 분리해 훔친 패스로 카운터 측 호출을 못 하게 한다.
**QR에는 토큰 문자열 전체(`TRLP1.…`)만 넣는다.** 참조코드·호텔명·가방수를 QR에 추가로 넣자는 제안은 거절한다 — 스캔 라우트가 그것을 읽지 않고, 페이로드 최소성이 이 설계의 핵심이다.

### 1.3 패스 발급·캐시 타이밍 (오프라인이 정상 경로)

`POST /pass`는 네트워크가 필요하다. 카운터는 지하다. 따라서:

1. **결제 성공 직후** `/bags/pay`에서 곧바로 발급 → localStorage 캐시.
2. `/bags/drop` 마운트 시, **온라인이고** (캐시 없음 ‖ 만료 2시간 이내)면 재발급. 재발급은 `pass_version`을 올려 이전 QR을 즉시 무효화한다(분실 폰 대응) — 화면에 "이전 QR은 더 이상 동작하지 않습니다" 고지.
3. **오프라인 + 캐시 있음** → 캐시된 토큰을 그대로 렌더. 상단에 `Offline · pass issued 18:42 · valid until 21:30`.
4. **오프라인 + 캐시 없음** → QR 자리에 대체 안내. **여기서 거짓말하지 않는다**: `/api/partner/scan`에는 참조코드 조회 경로가 없으므로 "직원에게 TRL-48173을 말하세요"라고 쓰면 안 된다. 실제 문구: *"Trail could not issue your pass. The counter can only take bags with a scanned pass — connect once before you go."* + 재시도 버튼.
5. 만료된 캐시 토큰은 **렌더하지 않는다**(스캔 시 410). 만료 화면 + 재발급 버튼.

캐시는 상태 캐시(`trail-cache-v4:<userId>`)와 **섞지 않는다**. 별도 키 `trail-pass-v1:<transferId>` — 패스는 서버 상태의 사본이 아니라 베어러 자격증명이고, 캐시 버전 범프로 사라지면 안 된다. 서비스워커는 `/api/**`를 절대 캐시하지 않는다(§7).

### 1.4 화면 구성

| 프레임 요소 | 데이터 출처 | 비고 |
| --- | --- | --- |
| `Drop your bags` / `Blue Banana Market` | `transfer.dropoffStore.name` | §2 정본 제목 |
| 칩 4개 `✓ Delivery paid` `3 bags` `The Annex Hotel` `6:30–7:00 PM` | `transfer.status==='paid'` · `bagCount` · `hotelName` · `etaLabel()` | 결제 칩은 `payment.status==='captured'` 확인. 미결제면 칩 대신 `Not paid yet` |
| 대형 QR + `TRL-48173` | 캐시 토큰 · `transfer.referenceCode` | 흰 카드, 4모듈 quiet zone, 288px+ |
| `HOW IT WORKS` 5스텝 | 정적 | 4번 문구는 §2 예외 → **`Staff count the bags with you`** |
| CTA | `reportEvent(id,'dropped_off')` | §2 예외 → **`I handed the bags over`** (✓ 없음) |
| — | `sourceChip(transfer.source)` | `SIMULATED TRANSFER` 배지 |

부가: `navigator.wakeLock`을 화면 표시 중 요청(줄 서 있는 동안 화면이 꺼지지 않게), `visibilitychange`에서 해제, try/catch. 실패해도 무시.

**파일**
- `app/(app)/bags/drop/page.tsx` 【신규 ~60줄】 — 의존 API: `POST /api/transfers/[id]/pass`, `POST /api/transfers/[id]/events`
- `components/qr.tsx` 【신규 ~20줄】 — `<QrCode value size label />`, SVG rect path, `role="img"`
- `lib/transfers/pass-cache.ts` 【신규 ~28줄】 — read/write/만료판정, storage 주입 가능(테스트용)
- `app/(app)/app-state.tsx` 【수정 ~14줄】 — `issuePass(transferId)` 액션 + `pass` 상태. 발급은 **큐에 넣지 않는다**(오프라인에서 발급 자체가 불가능하므로 outbox에 넣으면 "저장 대기"라는 거짓말이 된다)
- `package.json` 【수정 1줄】 — `uqr`

---

## 2. `/bags/track` 수직 타임라인 (프레임 `-12`) 【리라이트】

현재 가로 4스텝(`DELIVERY_STEPS` + `deliveryStep`)을 세로 타임라인으로. **정렬은 `seq`, 표시 시각은 `occurredAt`.**

### 2.1 5번째(실패) 자리 — 반드시 남긴다

와이어프레임은 성공 4단계만 그린다. 스키마에는 실패 4종이 있다: 이벤트 `declined` · `delayed` · `seal_issue` · `cancelled`, 그리고 컬럼 `handoff_failure_code`(4코드). 규칙:

```
steps = [Dropped off, Collected by Trail, On the way to hotel, Delivered]   // §2 정본 상태명
failure = 마지막 declined|delayed|seal_issue|cancelled 이벤트 ?? handoffFailureCode
failure가 있으면 → 해당 이벤트의 seq 위치 바로 뒤에 5번째 행 삽입
```
- `delayed` / `seal_issue`는 **진행 중 삽입**(이후 단계가 계속 진행됨) — 앞 단계 done, 자기 자신 경고 톤, 뒤 단계 미래.
- `declined`(hotel) / `cancelled`는 **말단** — 뒤 단계 전부 취소 톤, `Delivered` 행은 렌더하지 않는다.
- 상태 계산은 클라이언트가 하지 않는다. `statusAfter`/`projectStatus`는 서버 트리거의 사본이며 화면은 `transfer.status`와 이벤트 목록만 읽는다.
- 대비: FIGMA §1 추가 하한대로 미래 스텝은 2.22:1 → **4.5:1로 올린다.** G1 토큰 사용.
- 마크업: `<ol>` + 각 행 `<li>`, 현재 단계에 `aria-current="step"`, 완료/미래는 시각 표시 외에 `<span class="visually-hidden">Done / Not yet</span>`. 점만으로 상태를 전달하지 않는다.

### 2.2 나머지 화면

정보 스택 `Destination / Bag count / Tracking ID / Payment`(§2 데이터 라벨 정본), 그 아래 `Delivery complete →`.
**§1-6 준수**: 이 버튼은 `delivered`일 때만 나타나는 **`/bags/done` 링크**다. 눌러서 단계를 올리지 않는다. `delivered`가 아니면 렌더하지 않는다.
`I handed the bags over` / `Cancel this delivery` / 시뮬레이터 버튼은 유지(실패 분기 시연 경로). `HandoffFailed`·`Blocked` 패널 유지.

**파일**
- `app/(app)/bags/track/page.tsx` 【리라이트 ~90줄】 — 의존 API: 없음(전부 `GET /api/state`)
- `lib/state/selectors.ts` 【수정 ~14줄】 — `timelineRows(events, transfer)` 추가. `DELIVERY_STEPS`/`deliveryStep`은 `landing.ts`가 쓰므로 유지
- `components/timeline.tsx` 【G1 요청, 없으면 G5가 ~22줄】

---

## 3. Delivery 탭 재작성 (프레임 `-20`) 【리라이트】

`app/(app)/trail/plan/delivery/page.tsx`.

### 3.1 지금 있는 버그 — 반드시 고친다

이 파일은 **`sourceChip`을 임포트하지 않는다.** 결과: `points`/`quote`가 전부 `sample`인데 파트너 이름과 요금이 라벨 없이 나간다. §1-1 위반. 수정:
- 각 행에 그 **행 자신의** `source`로 칩을 붙인다. 섹션 단위 "이 영역은 샘플" 금지.
- **연관 결함**: `DropoffStore`(transfer에 embed된 카운터)에는 `source` 필드가 없다. `queries.ts`의 store embed가 `source`를 select하지 않고 `shapeStore`도 매핑하지 않는다. → `queries.ts`·`rows.ts`·`shape.ts`·`types.ts` 4곳에 `source` 추가(§4상 G5가 만질 수 있는 파일).

### 3.2 정보 스택

| 라벨(정본) | 값 | 출처 | 라벨 필요 |
| --- | --- | --- | --- |
| `Deliver to` | `trip.hotelName` | 여행자 입력 | — |
| `Drop-off partner` | 선택된 카운터 ‖ `points[0]` | `dropoff_points` | 행 `source` 칩 |
| `Estimated arrival` | `etaLabel(etaStart,etaEnd)` | 확정 전엔 `Quoted at the counter` | 확정 후 `SIMULATED` |
| `Delivery cost` | `quote.feeCents` | 가격표 | `pricingSource==='fallback'`이면 칩 |

`(reserved)` 접미는 **`wallet.reserveCents >= feeCents`일 때만** 붙인다. 요금과 예약금은 다른 숫자다 — 부족하면 그대로 부족하다고 쓴다(그리고 그건 `reserve_short` 경로다). §1-4대로 이 숫자는 클라이언트가 `wallet`에서 그린다.

프레임의 🏨📍⏰💳 이모지는 §1-5에 따라 `IconHotel`/`IconPin`/`IconClock`/신규 `IconCard` SVG로 교체.

### 3.3 "가방 썸네일"에 대한 정정

**프레임 `-20`에 가방 썸네일은 없다.** 정보 스택 4행 + CTA뿐이다(직접 열어 확인). 상품 사진은 이 앱 어디에도 없고(§5 마이그레이션 0019 판정 참조) 없는 이미지를 만들 수 없다. 대신 **가방 요약 행**을 넣는다: `transfer.items`/`draftItems`에서 개수·핸들링을 뽑아 `IconBag`/`IconFragile`/`IconChilled` 칩 나열. 사진이 아니라 사실이다.

CTA `Arrange delivery →`(§2 정본) → `bagsHref(app)`.

**파일**
- `app/(app)/trail/plan/delivery/page.tsx` 【리라이트 ~38줄】
- `lib/state/{queries,rows,shape,types}.ts` 【수정 각 1~2줄】 store `source`

---

## 4. 결제 화면 (프레임 `-9`, 실패 `-10`) 【수정】

### 4.1 마이그레이션 0024 `payment_methods` — **열지 않는다**

근거 넷:
1. **저장된 수단이 없다.** PSP도, 토큰화도, 볼트도 없다. `payment_methods` 행은 존재하지 않는 카드를 서술하는 행이 된다. 그러면 전 행에 `Sample`을 붙여야 하고, 그 순간 테이블이 주는 진실은 0이면서 스키마·RLS·GRANT 표면만 늘어난다.
2. **선택 사실은 이미 기록된다.** `payments.method_brand`가 결제 시점에 무엇을 골랐는지 남긴다. 그게 유일하게 내구성 있는 사실이다.
3. **`method_last4`는 NULL인 게 맞다.** PAN을 본 적이 없다. `4242`를 채우면 안 된다 — Stripe 테스트 번호이고, 영수증이 제시된 적 없는 카드를 주장하게 된다. `last4`를 읽는 코드가 없는 것은 결함이 아니라 정합이다.
4. 실제 PSP가 붙으면 수단 목록은 PSP가 준다(`setup_intent` → `payment_method` id). 그때 필요한 컬럼은 `provider`·`provider_pm_id`·`fingerprint`이고 지금 정직하게 설계할 수 없다. 지금 0018을 열면 0018b가 확정된다.

**결론**: 저장된 수단 목록을 흉내내지 않는다. **고정 3항목**을 렌더한다.
| 표시 | 근거 |
| --- | --- |
| `Apple Pay (simulated)` — **로고 없음, 텍스트 라벨만** | §1-3, §2 예외 |
| `Sample card · nothing is stored` | §2 예외(`Saved Visa •••• 4242` 대체) |
| `Another card · add at the partner point` | 기존 `payMethods.other` |

`payMethods`의 `detail: "Saved card ending 4242"`는 **즉시 고친다**(`app-state.tsx:42`). §1-3 직접 위반이다.
`Use another payment method`(§2 정본 버튼)는 **실패 화면 `-10`에만** 둔다 — 거기서는 "다른 수단 고르기"가 실제로 동작한다. 결제 화면에서는 아무것도 추가할 수 없으므로 그 버튼을 두면 거짓 어포던스가 된다. 현재 실패 화면의 `Use a different payment method`를 정본 문구로 개명.

### 4.2 라디오 기본 선택 — **와이어프레임이 맞다. 기본 선택 없음 + CTA 비활성.**

현재 구현은 `useState("apple")`. 바꾼다. 근거:
- 이 화면은 **승인 게이트**다(제품 규칙 1). 미리 선택된 수단은 여행자가 고른 적 없는 수단을 탭 한 번으로 승인하게 만든다.
- Apple Pay가 없는 기기에서 기본값이 Apple Pay인 함정도 사라진다.
- 비용은 탭 한 번. 접근성: `role="radiogroup"` + `aria-labelledby`, 선택 없음은 유효한 상태. CTA는 기존 패턴대로 `disabled` + 버튼 안 `<small>Choose a payment method first</small>`로 **이유를 보이게** 쓴다(무언의 disabled 금지).

### 4.3 나머지

- 대형 금액 타이포: `CAD $9.00`. 소수점 두 자리는 프레임 표기 — 단 `money()`는 정수일 때 `9`를 준다. 결제 화면에서만 `.00`을 강제하는 별도 포매터(`priceExact`)를 `view.ts`에 추가. 원장 표기(`money`)는 건드리지 않는다.
- 상단 2줄 `Same-day delivery · 3 bags` / `Blue Banana Market → The Annex Hotel` — 전부 실데이터.
- `SIMULATED` 배지 유지, "No money moves" 고지 유지.
- `reserve_short` → `Blocked` 패널 유지. **단 remedy 버튼에 금액과 출처를 넣는다** — §7 참조.
- `?outcome=fail` 데모 경로 유지.

**파일**
- `app/(app)/bags/pay/page.tsx` 【수정 ~35줄 변경】 — 의존 API: `POST /api/transfers/[id]/confirm`, `POST /api/payments/simulate`, (신규) `POST /api/transfers/[id]/pass`
- `app/(app)/app-state.tsx` 【수정 1줄】 `payMethods` 문구
- `app/(app)/view.ts` 【수정 ~2줄】 `priceExact`

---

## 5. `-7` 핸즈프리 진입 · `-8` 배송 검토 【신규 1 + 수정 1】

### 5.1 라우트 매핑

와이어프레임에는 "어떤 가방을 보낼지 고르는" 화면이 없다(가방 3개가 암묵 전제). 우리 흐름에는 그 승인이 필수다. 매핑:

```
-6 Go hands-free →  →  /bags      (-7 신규)  → Review delivery → 
                       /bags/select  (가방 승인, 프레임 없음, 유지)  →
                       /bags/review  (-8 로 재구성)  → Continue to payment →
                       /bags/pay     (-9)
```
`/bags`는 현재 `/bags/select`로 리다이렉트만 한다. 이걸 실제 화면으로 만든다.
*(더 싼 대안: `-7`을 `/bags/select` 상단 블록으로 흡수. 라우트·G2 변경·탭 한 번을 아낀다. 제품이 고르면 그대로 간다. 권고는 별도 라우트 — 문서 §0 "와이어프레임의 화면은 만든다".)*

### 5.2 `-7` 칩 3개 — 무게 문제

`3 Bags` / `~2.4 kg Est. weight` / `~4 hrs Time left`.

- `Bags` — 실데이터(`selectedBagCount`).
- `Time left` — 실데이터. `dropoff_points`의 `minutesToCutoff`가 이미 타임존까지 해결해서 온다.
- **`Est. weight` — 현재 어떤 무게도 존재하지 않는다.** `bag_transfer_items.weight_grams` 컬럼과 `weightOf()` 합산은 있지만, `draftItems()`가 구매 건에 `weightGrams: null`을 하드코딩하고 `purchases`에 무게 컬럼이 없다. 즉 값이 없다.
  - 가방당 800 g 같은 **추정치는 금지**한다. 그 숫자는 화면에만 머무르지 않는다 — `saveManifest`로 서버에 올라가 `max_weight_grams` 판정(`handling_unsupported`)에 쓰인다. 지어낸 무게가 진짜 배송을 거절시키거나 한도 초과를 통과시킨다.
  - **판정**: 신고된 무게가 있을 때만 `weightOf()`를 렌더, 없으면 `Weighed at the counter`. 마이그레이션 불필요 — 나중에 여행자 입력을 받기로 하면 `bag_transfer_items.weight_grams`와 `ManifestInput.weightGrams`가 이미 있으므로 **화면 변경만으로 끝난다.**

### 5.3 `-8` 세 블록

| 블록 | 값 | 출처 | 판정 |
| --- | --- | --- | --- |
| `DELIVER TO` + `✓ Hotel verified` | `trip.hotelName/hotelAddress`, `trip.hotelVerifiedAt` | 이미 있음 | 검증 시각이 있을 때만 초록 체크 칩. 없으면 `Not verified yet`(중립 톤) |
| `DROP OFF AT` + `Trail Partner Point · 2 minutes away` | `point.name/address/area` | — | **`2 minutes away`는 못 쓴다.** 여행자 위치가 앱 어디에도 없고(geolocation 미사용), 지하 매장에서 가장 못 믿을 값이다. `stops.walkMinutes`는 경로 상대값이지 카운터까지의 거리가 아니다. 대신 이미 있는 진짜를 쓴다: `point.area` · `Open now` / `last drop-off 18:00`. 거리 칩을 꼭 원하면 위치 소스가 선행 과제 |
| `DETAILS` 2×2 `Bags/Est. weight/Delivery/Price` | `selectedBagCount` · §5.2 · `etaLabel` · `price` | 이미 있음 | — |

하단 예약금 고지 `CAD $9 is reserved in your Trail wallet but has not been charged yet` — `wallet.reserveCents`에서 그린다(§1-4).
기존 `/bags/review`의 **카운터 선택 라디오·핸들링 체크·`Blocked` 패널은 전부 유지**한다. `-8`은 그 위에 얹는 정보 블록이지 대체가 아니다.

**파일**
- `app/(app)/bags/page.tsx` 【리라이트 ~40줄】 — 리다이렉트 → `-7` 화면
- `app/(app)/bags/review/page.tsx` 【수정 ~30줄 추가】 — `-8` 정보 블록 3개
- `app/(app)/view.ts` 【수정 ~2줄】 — `weightLabel(grams)`

---

## 6. `Delivery Complete` (프레임 `-13`) 【신규】 `/bags/done`

태그 집합 대조가 인계 완료의 정의인데(§`compareSeals()`) 화면이 없었다. 있는 데이터로 전부 그려진다:

| 프레임 요소 | 출처 |
| --- | --- |
| `Delivered.` / `Keep exploring.` | `transfer.status==='delivered'` |
| `Your 3 bags were delivered to The Annex Hotel front desk at 6:47 PM` | `receipt.bagCount` · `hotelName` · `clockTime(receipt.receivedAt)` |
| `✓ Hotel handoff confirmed` | `receipt` 존재 = `handoffTransfer()` 성공 |
| `✓ 3 Trail tags scanned` | **`receipt.sealIds.length`** |
| `TRL-PAY-48173 · CAD $9.00` | `payment.reference`(신규, §8) · `payment.amountCents` |
| `View receipt` | `/bags/track`의 영수증 블록으로 |
| `Rate Trail` | **평점 저장 테이블이 없다.** 아래 판정 |
| `Continue exploring Toronto →` | `/trail` |

### `Rate Trail` 판정

평점을 받는 테이블이 없다. 두 선택지: (a) 마이그레이션으로 `delivery_ratings` 추가, (b) 버튼을 만들되 저장하지 않음 — **(b)는 금지다**(조용히 성공한 척하는 것이 이 앱에서 가장 위험한 실패). 
**판정: 이번 그룹에서는 렌더하지 않는다.** 배송 평점은 마켓플레이스 신뢰 지표라 사업 결정이 선행한다(무엇에 대한 평점인가 — Trail인가 파트너인가 호텔인가). `trail-venture-strategist` + `product-lead` 결정 후 별도 마이그레이션. 프레임과의 차이는 이 문서에 기록으로 남긴다.

**가드**: `status !== 'delivered'`면 이 라우트는 `/bags/track`으로 리다이렉트한다. `failed`(호텔 거부)일 때 "Delivered."를 그리는 것이 §1-2가 막으려는 바로 그것이다. `receipt`가 없는 `delivered`(이론상)면 태그 줄을 빼고 그 사실을 쓴다.

**파일**
- `app/(app)/bags/done/page.tsx` 【신규 ~42줄】 — 의존 API: 없음(`GET /api/state`)

---

## 7. `Budget Update` 전체 화면 (프레임 `-5`) — **G5 아님, G3 소관**

### 판정 근거

이 화면의 데이터는 `plan_allocations` · `purchases` · `budget_changes` · `wallet.overPlan`이다. `bag_transfers`는 한 글자도 안 나온다. G5가 소유한 테이블이 아니다. 이미 `/trail/plan/approval`이라는 승인 화면이 존재하고(마이그레이션 0013, `service_role`만 승인 실행), `-5`는 그 화면의 **구매 시점 진입판**이다. 따라서 **`-5`는 G3(또는 예산 소유 그룹)** 이 만든다. 배너(`budget-warning`) → 전용 화면 승격도 거기서.

### G5가 넘기는 계약 (G3가 지켜야 할 것)

`Continue anyway`는 초과분이 어디서 나오는지 말하지 않는다. **flexible은 승인 없이 못 쓴다**(제품 규칙 5). 따라서:
- 버튼 문구는 **금액 + 출처 버킷 + 잔액**을 명시한다: `Take CAD $17 from flexible (CAD $31 left)`.
- flexible이 부족하면 그 버튼은 비활성이고 이유를 쓴다: `Flexible has CAD $4. Not enough for CAD $17.`
- 누르면 `budget_changes` **제안**이 생기고 승인은 서버 함수가 한다. 클라이언트가 지갑을 고치지 않는다.
- `Increase budget` = `total_change`, `Adjust my plan` = 배분 편집, `Find cheaper options` = 대체 스톱. 각각 다른 `BudgetChangeKind`다.

### G5가 소유하는 쌍둥이 분기

배송 쪽 초과는 `reserve_short`(수수료 > 배송 예약금)이고 이미 `/bags/pay`에 `Blocked` 패널로 있다. 여기에 **같은 규칙을 적용한다**:
- 현재 remedy 버튼은 `Use my flexible budget` — 금액도 잔액도 없다. 승인으로 성립하지 않는다.
- `Blocked`에 `labels?: Partial<Record<Remedy,string>>`를 추가하고 `/bags/pay`가 `approve_flexible: "Take CAD $6 from flexible (CAD $25 left)"`를 넘긴다. `remedyCopy`는 기본값으로 유지.

**파일**
- `app/(app)/blocked.tsx` 【수정 ~4줄】
- `app/(app)/bags/pay/page.tsx` 【§4에 포함】
- `app/(app)/view.ts` 【수정 ~2줄】 `flexibleRemedyLabel(shortfallCents, flexibleCents, currency)`

---

## 8. 서버가 이미 주는 것 vs 새로 필요한 것

### 이미 준다 — 화면만 만들면 됨
패스 발급/검증 · 원장 이벤트(seq/occurredAt/actor/note) · 이송 불가 6코드 + remedy · 인계 실패 4코드 · `receipts.seal_ids[]` · 태그 대조 · 카운터 목록/컷오프/`minutesToCutoff`/`open`/행별 `source` · 견적 · 결제 시뮬 + `payments` · `hotel_verified_at` · `wallet.reserveCents` · 무게 저장·검증 경로.

### 새로 필요 — 딱 4줄
| # | 무엇 | 파일 | 왜 |
| --- | --- | --- | --- |
| 1 | store embed에 `source` select + 매핑 | `queries.ts`·`rows.ts`·`shape.ts`·`types.ts` | §1-1. 지금 `transfer.dropoffStore`에 행의 `source`가 없어 라벨을 붙일 수 없다 |
| 2 | payments embed에 `provider_charge_id` → `Payment.reference` | 위 4파일 | `TRL-PAY-…`가 클라이언트 `paymentRef` state에만 있어 **새로고침하면 사라진다.** `/bags/done`은 새로고침 후에도 떠야 한다 |
| 3 | `pass_issued_at` 노출 | `shape.ts`·`types.ts` | 오프라인에서 "언제 발급됐는지"를 표시(§1.3-3) |
| 4 | (선택) `GET /api/transfers/[id]/pass` | 신규 라우트 | 지금은 POST만 있어 조회할 때마다 재발급되고 `pass_version`이 올라간다. 화면 이동만으로 이전 QR이 무효화되는 것을 막으려면 조회 전용이 필요. **대안**: 클라이언트 캐시로 회피(§1.3) → **캐시로 간다. 라우트는 만들지 않는다.** |

**마이그레이션은 하나도 열지 않는다** (`0024` 판정 §4.1, `0019` 판정 §5.2 + 아래). 위 4개는 전부 이미 존재하는 컬럼을 select에 추가하는 일이다. → §4 계약상 G5가 `types.ts`/`queries.ts`/`shape.ts`를 만지지만, **마이그레이션을 열지 않으므로 G3(0020–0022)와의 충돌 표면이 최소**다. 충돌 시 G3 우선 원칙대로 rebase.

### 마이그레이션 0019 (사진) 판정 — **열지 않는다**
1. 보드 25프레임 어디에도 사진이 없다(전부 확인). `-8`이 요구하는 것은 무게·거리·호텔 검증이지 이미지가 아니다.
2. `/bags/review`의 "Store packing and a seal photo at the counter" 문구는 **파트너가 카운터에서 하는 일**을 설명한다. 여행자 폰 업로드로 바꾸면 커스터디 서사가 달라진다("당신이 증거를 제출한다" vs "직원이 봉인한다").
3. 비용: Storage 버킷 + RLS + 서명 URL + **오프라인 업로드 큐**. 현 outbox는 JSON 전용이라 바이너리 재시도 경로가 없다. 그리고 실패 지점이 하필 커스터디 이전 순간이다.
4. 나중에 필요해지면 그것은 파트너 단말 측(`/api/partner/scan` 계열) 자산이고 `bag_transfer_items.seal_id`에 매달린다. `bag_transfers`가 아니다.
→ 지연 항목으로 기록.

---

## 9. 다른 그룹에 요청

### G2 (`shell.tsx` · `landing.ts` 단독 소유)

```ts
// bagsHref — 결제 후 카운터로 가는 길과 완료 화면이 없다
export function bagsHref(app: Bags) {
  const t = app.transfer;
  if (!t) return app.bought.length ? "/bags" : "/bags/track";
  if (t.status === "delivered") return "/bags/done";
  if ((t.status === "paid" || t.status === "dropped_off") && deliveryStep(t.events) < 1) return "/bags/drop"; // 아직 미수거 → QR을 다시 보여야 한다
  if (inMotion(app)) return "/bags/track";
  return app.bought.length ? "/bags" : "/bags/track";
}

// staleForTab — 기억된 서브페이지가 지나간 경우
stale = ["/bags/pay"]
if (deliveryStep >= 1 || TERMINAL.includes(status)) stale.push("/bags/drop")   // 수거 끝난 패스로 돌아가지 않는다
if (status !== "delivered") stale.push("/bags/done")                          // 완료 안 된 완료 화면 금지
if (inMotion) stale.push("/bags", "/bags/select", "/bags/review")
if (!bought.length) stale.push("/bags", "/bags/select", "/bags/review")
```
- `landing.ts`가 `deliveryStep`을 임포트하면 `selectors.ts` 의존이 생긴다. 타입 전용 파일 규칙(서버 컴포넌트가 `needsOnboarding`을 import)을 깨지 않는지 G2가 확인해 달라. 안 되면 `events` 대신 `status==='paid'`만으로 축약해도 G5는 수용한다.
- `shell.tsx`의 `const dark = pathname === "/bags/track"` → `pathname.startsWith("/bags")`. (G1의 전면 다크가 먼저 들어오면 불필요.)
- 탭 개명(`Bags`)·§2 카피 적용은 G2 진행분을 그대로 따른다.

### G1 (디자인 시스템 · `components/*` · `:root` 토큰)
1. `<Timeline items>` — done / current / future / **failure** 4상태. 미래 스텝 대비 4.5:1 이상.
2. `<InfoStack rows>` — 아이콘 + 라벨 + 값 + 헤어라인. `-20`·`-7`·`-8`·`-12` 공통.
3. `<StatTiles>` — 3분할 통계 타일 (`-7`).
4. `<RadioList>` — 큰 라디오 행 + 우측 원형 표시, 터치 타깃 44px, 포커스 링 유지 (`-9`).
5. `<Chip variant>` — `verified`(teal ✓) / `progress`(amber) / `sample` / `simulated`. **`sample`·`simulated`는 상태 칩과 시각적으로 구별되어야 한다.** 같아 보이면 `Sample`이 상태로 읽힌다.
6. `components/icons.tsx` 신규 SVG: `IconQr` · `IconCard` · `IconReceipt`. (프레임의 🏨📍⏰💳 대체, §1-5)
7. `components/chrome.tsx` `Header`에 `subtitle` 지원 (`-11` `Drop your bags / Blue Banana Market`, `-12` `Bag Tracking / TRL-48173`).
8. QR 카드는 다크테마에서도 **흰 배경·검은 모듈 고정**. 토큰 반전 대상에서 제외해 달라.

### G0/공통
- `.env`에 `TRAIL_PASS_SECRET`·`SUPABASE_SERVICE_ROLE_KEY`가 없으면 `/pass`가 503이다. `/bags/drop`은 그 503을 "패스를 발급할 수 없다"로 정직히 렌더하지만, 데모 환경 변수 확인은 G0 체크리스트에 넣어 달라.

---

## 10. 실패 분기 도달 경로표

| 분기 | 판정 주체 | 데이터 | 도달 화면 | 어떻게 도달 | 재현 |
| --- | --- | --- | --- | --- | --- |
| **추천 불가** | AI/plan | — | (G4) | — | — |
| **실제가 예산 초과** | `budget_changes` | `wallet.overPlan`, 배분 초과 | `-5` 전체 화면 **(G3)** · `/trail/plan/approval` | 구매 기록 시 제안 생성 → 배너/화면 | 배분보다 비싼 구매 기록 |
| ↳ 배송 쪽 쌍둥이 | `judgeEligibility` | `reserve_short` | `/bags/pay` `Blocked` | `confirm` 409 `reserve_short` | 예약금 < 수수료인 여행 |
| **이송 불가 (6)** | `judgeEligibility` (서버) | `ineligible_code` + `remedies` | `/bags/review`(주) · `/bags/pay`(reserve_short) · `/bags/track`(오프라인 재독) · `/bags`(진입 시 사전 경고) | 카운터 선택/매니페스트 저장/확정 응답 | `no_partner_nearby`: 파트너 없는 도시 · `cutoff_passed`: 컷오프 이후 · `chilled_window_closed`: 4시간 경과 Chilled · `hotel_refuses`: `accepts_delivery=false` · `handling_unsupported`: 한도 초과 · `reserve_short`: 위 |
| **호텔 인계 실패 (4)** | 서버 (`handoffTransfer`/`compareSeals`) | `handoff_failure_code`, `declined` 이벤트 | `/bags/track` `HandoffFailed` + **타임라인 5번째 행** | 원장에 `declined` 기록 → 상태 `failed` | `/bags/track` "Simulate a refused handoff", `tag_mismatch`는 `simulate({fail:'tag_mismatch'})` |
| **결제 실패** | `/api/payments/simulate` | `payments.failure_code` | `/bags/pay` (`-10`) | 응답 `status!=='captured'` | `?outcome=fail` |
| **진행 중 사고** | 여행자 신고 | `delayed` · `seal_issue` 이벤트 | `/bags/track` 타임라인 5번째 행(경고 톤, 이후 단계 계속) | `reportEvent` | 트래킹에서 신고 |
| **취소** | 여행자 | `cancelled` 이벤트 | `/bags/track` 말단 행 | `travelerEventVerdict` 허용 상태에서만 | draft/awaiting/paid에서 취소 |
| **패스 없음 (오프라인)** | 클라이언트 | 캐시 미스 | `/bags/drop` | QR 자리 대체 안내 + 재시도 | 오프라인에서 신규 결제 |
| **패스 만료/교체** | 서버 | 410 / 401 `pass_replaced` | `/bags/drop` | 만료 시각 경과 | 캐시 토큰 `exp` 조작 |
| **완료 화면 오진입** | 클라이언트 가드 | `status!=='delivered'` | `/bags/done` → `/bags/track` 리다이렉트 | — | `failed` 상태로 `/bags/done` 직접 열기 |

---

## 11. PWA / 오프라인 (이 그룹에 하드 요구가 있으므로 G5가 먼저 쓴다)

`/bags/drop`이 지하에서 떠야 한다는 것이 이 저장소에서 유일하게 **오프라인이 필수인** 요구다. 공유 파일이므로 G5가 먼저 쓰고 다른 그룹이 확장한다.

- `public/manifest.webmanifest` 【신규 ~15줄】 — `display: standalone`, `theme_color` 다크, 아이콘은 기존 `app/icon.png`·`apple-icon.png`·`public/logo-mark.png` 재사용
- `public/sw.js` 【신규 ~45줄】 — navigation은 network-first + 캐시 폴백, 정적 청크는 stale-while-revalidate.
  **금지 규칙(하드)**: `/api/**`, `/auth/**`, `/login` 은 **절대 캐시하지 않는다.** `request.method !== "GET"` 이면 즉시 통과. 쿠키/`sb-*` 세션이 캐시에 섞이면 다른 계정의 지갑이 보인다. 캐시 이름에 빌드 ID를 넣어 배포마다 갈아치운다.
- `app/sw-register.tsx` 【신규 ~10줄】 — 클라이언트 등록, `hydrated` 게이트 뒤
- `100dvh` + `env(safe-area-inset-*)`, 설치 프롬프트(`beforeinstallprompt`)는 G1 셸 작업과 합류
- 프리캐시 대상에 `/bags/drop` 라우트 청크 + `uqr` 청크를 포함한다. QR이 오프라인에 못 뜨면 이 그룹 전체가 실패한다.

---

## 12. 파일 요약

| 파일 | 종류 | 대략 줄 | 의존 API |
| --- | --- | --- | --- |
| `app/(app)/bags/drop/page.tsx` | 신규 | ~60 | `POST /transfers/[id]/pass`, `POST /transfers/[id]/events` |
| `components/qr.tsx` | 신규 | ~20 | — |
| `lib/transfers/pass-cache.ts` | 신규 | ~28 | — |
| `app/(app)/bags/done/page.tsx` | 신규 | ~42 | — |
| `app/(app)/bags/page.tsx` | 리라이트 | ~40 | `GET /dropoff-points` |
| `app/(app)/bags/track/page.tsx` | 리라이트 | ~90 | `POST /transfers/[id]/{events,issues,simulate}` |
| `app/(app)/trail/plan/delivery/page.tsx` | 리라이트 | ~38 | `GET /dropoff-points` |
| `app/(app)/bags/review/page.tsx` | 수정 | +30 | 기존 |
| `app/(app)/bags/pay/page.tsx` | 수정 | ~35 변경 | `POST /transfers/[id]/confirm`, `POST /payments/simulate`, `POST /transfers/[id]/pass` |
| `app/(app)/blocked.tsx` | 수정 | +4 | — |
| `app/(app)/view.ts` | 수정 | +6 | — |
| `app/(app)/app-state.tsx` | 수정 | +15 | — |
| `lib/state/selectors.ts` | 수정 | +14 | — |
| `lib/state/{queries,rows,shape,types}.ts` | 수정 | 각 1~2 | — |
| `app/bags.css` | 신규 | ~55 | — (§4: 신규 화면 CSS는 새 파일) |
| `app/layout.tsx` | 수정 | +1 | `import "./bags.css"` |
| `public/manifest.webmanifest`·`public/sw.js`·`app/sw-register.tsx` | 신규 | ~70 | — |
| `tests/trail-bags-screens.test.ts` | 신규 | ~70 | — |
| `package.json` | 수정 | +1 | `uqr` |

**테스트 대상** (`npm test`, node:test)
1. 타임라인 투영 — 성공 4단계 · `delayed`/`seal_issue` 중간 삽입 · `declined`/`cancelled` 말단 · `seq` 정렬 · `occurredAt` 표시
2. 패스 캐시 — 만료 판정, 다른 transferId 격리, 손상된 JSON 무시
3. `sourceChip` — store `source` 매핑 후 행 단위 라벨
4. flexible remedy 라벨 — 금액·출처·잔액 문자열, 부족 시 비활성 사유
5. `/bags/done` 가드 — `failed`/`in_transit`에서 렌더 거부

---

## 13. 착수 순서

G1(컴포넌트 5종 + 아이콘 3종) → **①** `queries/rows/shape/types` 4줄(다른 화면의 선행 조건) → **②** `/bags/drop` + QR + 캐시 + SW → **③** 타임라인 · `/bags/done` → **④** Delivery 탭 · `-7`/`-8` → **⑤** 결제 화면.
①~②를 먼저 하는 이유: QR이 오프라인에서 뜨지 않으면 나머지를 다 만들어도 이 그룹은 실패한 것이고, 그 사실을 늦게 알수록 비싸다.

마무리마다 `npm run lint` · `npm test` · `npm run build`. QR은 **실제 폰 화면을 실제 스캐너로 한 번 읽는다** — 빌드가 통과해도 그건 검증이 아니다.
