# 웹 설문 — 배포와 운영

브랜치 `survey`. 두 설문지([UX_SURVEY.md](UX_SURVEY.md) · [TEAM_BUILD_SURVEY.md](TEAM_BUILD_SURVEY.md))를 앱 안의 라우트로 옮긴 것이다.
종이 설문지는 **분석 계획과 실패선**을 갖고, 이 코드는 **응답자가 보는 것**만 갖는다. 문항을 고칠 때는 두 곳을 같이 고친다.

| URL | 무엇 |
| --- | --- |
| `/survey` | 목록. **응답 저장이 안 되고 있으면 여기에 빨간 경고가 뜬다** |
| `/survey/ux` | **Figma 프로토타입** 사용성 조사 (18화면, 약 20분) |
| `/survey/team` | 팀 내부 점검 (11화면, 약 13분) |

---

## 1. 배포 전에 반드시 할 두 가지

### ① 마이그레이션 `0014` 적용 — ✅ **완료 (2026-08-18)**

`fzvwfseupggtjwdxvfsc` (TRAIL) 프로젝트에 적용했다. 적용 후 실제로 확인한 것:

| 확인 | 결과 |
| --- | --- |
| 컬럼 11개, 응답자를 특정할 수 있는 컬럼 없음 | ✅ `id, survey_key, session_key, answers, timings, furthest, completed, screened_out, started_at, updated_at, submitted_at` |
| RLS `enable` + `force`, 정책 0개 | ✅ |
| `anon`·`authenticated` 권한 | ✅ 하나도 없음 |
| `authenticated` 롤로 SELECT / INSERT / UPDATE / DELETE | ✅ **네 개 전부 `permission denied`** |
| `anon` 롤로 SELECT / INSERT | ✅ 둘 다 `permission denied` |
| 트리거 | ✅ `survey_response_only_moves_forward` 1개 |

Supabase 어드바이저가 이 테이블을 `rls_enabled_no_policy`(INFO)로 표시하는데, **그게 의도한 상태다** — 정책이 없어야 `service_role` 외 모두가 막힌다. 같은 프로젝트의 `migration_imports`·`seal_tags`도 같은 이유로 같은 표시가 붙어 있다.

새 환경(프리뷰 브랜치 등)에 처음 올릴 때는 `supabase/migrations/0014_survey_responses.sql`을 그대로 실행하면 된다. 파일 아래쪽에 위 검증 SQL이 주석으로 들어 있다.

### ② `/survey`를 열어 경고가 없는지 확인

여기에 빨간 경고가 뜨면 링크를 뿌리지 않는다. 이 배너가 있는 이유는 §4에 적었다. **현재 로컬에서는 경고 없음.**

환경변수는 `SUPABASE_SERVICE_ROLE_KEY` 하나면 응답 수집이 된다.
`SURVEY_EXPORT_TOKEN`은 CSV를 내려받을 때만 필요하고, 비어 있으면 export 라우트는 404다(수집은 계속 된다).
로컬 `.env.local`에는 넣어뒀다. **Vercel 환경변수에도 같은 이름으로 넣어야 배포본에서 내려받을 수 있다.**

---

## 2. 자극물 이미지 — 프로토타입 캡처 7장

설문은 `public/survey/<슬롯>.png`에서 읽는다. 파일이 없으면 응답자 화면에 **어느 파일이 없는지 그대로 표시**된다.

**v2부터 자극물은 와이어프레임이 아니라 Figma 프로토타입(`https://reach-extra-11429501.figma.site/`) 캡처다.** 375×812 2×, 폰 프레임 포함.

| 슬롯 | 캡처 파일 | 화면 |
| --- | --- | --- |
| `p_home` | `p_home.png` | Home — `YOU'RE NEAR` 배너가 열린 상태 |
| `p_home_top` | `p_home_top.png` | Home — 배너 없는 최상단. `How much time do you have?` 칩 4개가 온전히 보인다 |
| `p_ai` | `p_ai.png` | Trail AI — 인사 + 칩 4개 |
| `p_gifts` | `p_gifts.png` | Gifts — `CAD $250` / `$39 spent` / `$211 left` + 수령인 4명 |
| `p_wishlist` | `p_wishlist.png` | Wishlist — 저장 항목 3개 |
| `p_bags` | `p_bags.png` | Bags — 구매 1 · 저장 3 · `HOTEL DELIVERY` |
| `p_dropoff` | `p_dropoff.png` | Drop your bags — QR `TRL-48173` |
| `p_tracking` | `p_tracking.png` | `You're hands-free.` + 타임라인 |

- **Home은 두 장 다 필요하다.** `p_home_top`은 T1의 first click(시간 칩이 가려지지 않고 눌려 있지도 않다), `p_home`은 5초 첫인상과 위치 알림 섹션. 서로 대체할 수 없다.
- `p_time_1h.png`는 쓰지 않는다 — `p_home.png`와 사실상 같은 프레임이다.
- v1의 `f1`~`f12`는 더 이상 참조되지 않는다.

> ⚠️ **`p_gifts`와 `p_bags`가 이 설문에서 제일 중요한 두 장이다.**
> T4는 세 값을 채점한다 — `mo_left`=**211**(=250−39, 인쇄돼 있음), `mo_free`=**20**(=250−230, 어디에도 없음), `mo_fee`=**`same`**($9는 $211에서 빠진 적이 없다).
> 프레임의 숫자가 다르면 [`lib/survey/ux.ts`](../../lib/survey/ux.ts)의 `WALLET` 상수 한 줄만 고치면 된다. 문항 텍스트·보기 라벨·테스트가 전부 거기서 따라간다 (`npm test`가 `left === budget − spent`와 `unallocated === budget − allocated`를 강제한다).

넣는 법: 캡처를 `public/survey/p_home.png` … `p_tracking.png`로 저장. 폭 660px 이하로 렌더되니 750px이면 충분하다.
`npm test`의 "every stimulus slot is one of the prototype captures, and resolves to a file"이 **오타난 슬롯과 빠진 파일을 둘 다** 잡는다 — 파일이 없으면 응답자가 그 사실을 대신 보게 되므로, 배포 전에 테스트가 먼저 본다.

---

## 3. 응답 내려받기

```bash
curl -H "x-survey-export-token: $SURVEY_EXPORT_TOKEN" "https://<배포주소>/api/survey/export?key=ux" -o ux.csv
```

- `key=ux` 또는 `key=team`
- `&complete=1`을 붙이면 완료 응답만
- 한 응답이 한 행. 복수응답은 보기별 0/1 열로, 매트릭스는 행별 열로, 리스크 그리드는 `__likelihood` / `__impact` 두 열로 갈라져 나온다. SPSS·R에 그대로 넣으면 된다.
- 섹션별 체류 시간이 `seconds__<섹션>` 열로 함께 나온다. **이탈 분석은 `completed=0` 행에 있다** — 중도 이탈도 저장되기 때문이다.
- Excel용 BOM이 붙어 있어 한글이 깨지지 않는다.

---

## 4. 설계상 감수한 것들

**응답자에게 저장 실패를 알리지 않는다.** 네트워크 오류로 사람을 멈춰 세우면 오류가 잃는 것보다 더 많은 응답을 잃는다. 답은 localStorage에 남고 다음 섹션에서 통째로 재전송한다.
그 대가로 **마이그레이션이 없는 상태가 정상 동작과 구분되지 않는다.** `/survey`의 경고 배너가 그 대가를 갚는 유일한 장치다. 링크를 뿌리기 전에 반드시 그 페이지를 연다.

**중도 이탈이 저장된다.** 섹션을 넘길 때마다 서버에 쓴다. 지갑 과업에서 그만둔 사람이 이 조사에서 가장 정보가 많은 응답자이고, 마지막 버튼에서만 저장하는 폼은 그 사람을 버린다.

**응답은 앞으로만 간다.** 섹션마다 저장하다 보니, 같은 설문을 두 탭에서 열어둔 사람의 **오래된 탭이 나중에 도착해 완료된 응답을 되돌릴 수 있다.** 실제로 적용 직후 이게 재현됐다 — 플래그는 안 되돌아갔는데 `answers`가 덮여서 마지막 섹션 답변이 사라졌다.
`furthest`가 그 payload를 식별한다(러너는 자기 상태의 `max(furthest, 섹션+1)`만 보내므로, 저장된 값보다 작으면 낡은 탭이다). 그런 요청은 트리거가 본문째 무시한다.
`answers`를 jsonb `||`로 **병합하지 않는** 이유는, 병합하면 응답자가 지운 답이 되살아나기 때문이다. 설문은 누가 지우기로 한 것을 기억하면 안 된다.

**5초 화면은 다시 못 본다.** 다시 열 수 있으면 첫인상 테스트가 아니라 독해 테스트가 된다.

**응답자를 특정할 수 있는 것을 저장하지 않는다.** `user_id`도, IP도, 이메일도 없다. IP는 레이트리밋 때문에 메모리에서만 잠깐 쓰고 행에는 쓰지 않는다.
- UX 설문에 **연락처 입력란이 없는** 이유가 이것이다. 첫 화면에서 "이메일을 저장하지 않는다"고 약속했으니 마지막에 이메일을 받으면 그 약속이 거짓이 된다. 베타 참여는 의향만 묻고, 연락처는 설문 밖에서 받는다.
- 팀 설문의 §팀(TM7 "아무도 말 안 하는데 문제인 것")은 익명이 아니면 아무도 솔직하게 답하지 않는다. 그래서 CSV에도 `session_key`를 내보내지 않는다 — 그건 응답자 브라우저에 남는 유일한 값이라, 7명짜리 팀에서는 노트북 한 대와 행 하나를 맞출 수 있다.

**그 대가:** 이 두 라우트는 앱의 다른 모든 라우트가 통과하는 신원 검사를 통과할 수 없다. 그래서 `tests/trail-transfers.test.ts`에 `OWNERLESS` 목록으로 **면제를 이름 붙여 적어**뒀고, 대신 `tests/survey.test.ts`가 그 면제의 범위를 좁게 고정한다 — 이 라우트들은 `survey_responses` 외 어떤 테이블도 건드릴 수 없고, `getTraveler()`를 부를 수 없고, 저장 행에 검토되지 않은 컬럼을 추가할 수 없다.

**세션 키를 아는 사람은 그 응답을 덮어쓸 수 있다.** 읽을 수는 없고, 누구 것인지 알 수도 없고, 다른 테이블에 닿을 수도 없다. 응답자를 식별하지 않기로 한 값이다.

---

## 5. 문항을 고칠 때

| 하려는 것 | 고칠 파일 |
| --- | --- |
| 문항 추가·수정·삭제 | `lib/survey/ux.ts` · `lib/survey/team.ts` (+ 종이 설문지 `.md`) |
| 새로운 문항 유형 | `lib/survey/types.ts` → `index.ts`의 `clean()` → `runner.tsx`의 `Input()` → export의 `columns()` **네 곳 모두** |
| 예산 과업 숫자 | `lib/survey/ux.ts`의 `WALLET` |
| 화면 스타일 | `app/survey/survey.css` |

`npm test`가 잡아주는 것: 중복 id, 존재하지 않거나 뒤에 나오는 `showIf` 참조, 중복 보기 값, `readBody`의 신원 키(`role`·`auth` 등)와 충돌하는 id — 마지막 것은 실제로 한 번 걸렸다. 팀 설문의 섹션 id가 `role`이었고, 그대로 뒀으면 `timings`에 `role` 키가 실려 **모든 응답자가 400을 받았을 것이다.**

이미 배포한 뒤 문항 id를 바꿔도 진행 중인 응답자는 잃지 않는다 — 서버가 모르는 id는 버리고 나머지는 저장한다. 대신 그 문항의 기존 응답은 그 시점부터 열이 갈린다.
