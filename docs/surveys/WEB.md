# 웹 설문 — 배포와 운영

브랜치 `survey`. 두 설문지([UX_SURVEY.md](UX_SURVEY.md) · [TEAM_BUILD_SURVEY.md](TEAM_BUILD_SURVEY.md))를 앱 안의 라우트로 옮긴 것이다.
종이 설문지는 **분석 계획과 실패선**을 갖고, 이 코드는 **응답자가 보는 것**만 갖는다. 문항을 고칠 때는 두 곳을 같이 고친다.

| URL | 무엇 |
| --- | --- |
| `/survey` | 목록. **응답 저장이 안 되고 있으면 여기에 빨간 경고가 뜬다** |
| `/survey/ux` | 와이어프레임 사용성 조사 (16화면, 약 18분) |
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

## 2. 자극물 이미지 — 5장이 비어 있다

와이어프레임은 `public/survey/f<N>.png`에서 읽는다. 파일이 없으면 응답자 화면에 **어느 파일이 없는지 그대로 표시**된다.

`docs/figma/`의 export 세트는 최종 와이어프레임보다 구버전이라, 확실히 일치하는 7장만 넣어뒀다.

| 슬롯 | 화면 | 상태 |
| --- | --- | --- |
| `f1` | 홈 (Plan with AI · 주변 추천) | ✅ `docs/figma/Mobile app with accessibility-15.png` |
| `f2` | Trail AI 시작 화면 (`Let's start`) | ❌ **직접 넣어야 함** |
| `f3` | Trail AI 온보딩 대화 (도시·날짜·예산 칩) | ✅ `-16` |
| `f5` | 대화 + `TRAIL'S PLAN` 요약 카드 | ✅ `-14` |
| `f6` | Gifts 탭 (`Request` 버튼이 보여야 함) | ✅ `-17` |
| `f7` | Map 탭 (오늘의 경로) | ✅ `-18` |
| `f8` | **Trip Wallet** | ❌ **직접 넣어야 함 — 아래 주의** |
| `f9` | Hotel Delivery (드롭오프 파트너 · 도착 예정 · CAD $9) | ❌ **직접 넣어야 함** |
| `f10` | Pay (CAD $9.00 · 결제수단) | ❌ **직접 넣어야 함** |
| `f11` | Drop your bags (QR `TRL-48173` · 5단계) | ❌ **직접 넣어야 함** |
| `f12` | Bag Tracking (4단계 진행) | ✅ `-12` |

> ⚠️ **`f8`이 이 설문에서 제일 중요한 한 장이다.**
> 과업 T4는 "앞으로 더 쓸 수 있는 금액"을 숫자로 받고 `Planned $210 − Spent $176 = CAD $34`로 채점한다.
> `docs/figma`에 있는 지갑 프레임은 **`Spent CAD $0`이고 수령인별 배분 행이 없어서** 이 과업이 성립하지 않는다.
> 네가 올린 최종 와이어프레임의 지갑 화면(Spent so far $176 + 수령인별 bar)을 내보내 넣어야 한다.
>
> 프레임의 숫자가 다르면 [`lib/survey/ux.ts`](../../lib/survey/ux.ts)의 `WALLET` 상수 한 줄만 고치면 된다.
> 문항 텍스트·채점·테스트가 전부 거기서 따라간다 (`npm test`가 `answer === planned − spent`를 강제한다).

넣는 법: 피그마에서 2× PNG로 내보내 `public/survey/f2.png` … `f11.png`로 저장. 폭 660px 이하로 렌더되니 1000px 정도면 충분하다.

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
| 지갑 과업 숫자 | `lib/survey/ux.ts`의 `WALLET` |
| 화면 스타일 | `app/survey/survey.css` |

`npm test`가 잡아주는 것: 중복 id, 존재하지 않거나 뒤에 나오는 `showIf` 참조, 중복 보기 값, `readBody`의 신원 키(`role`·`auth` 등)와 충돌하는 id — 마지막 것은 실제로 한 번 걸렸다. 팀 설문의 섹션 id가 `role`이었고, 그대로 뒀으면 `timings`에 `role` 키가 실려 **모든 응답자가 400을 받았을 것이다.**

이미 배포한 뒤 문항 id를 바꿔도 진행 중인 응답자는 잃지 않는다 — 서버가 모르는 id는 버리고 나머지는 저장한다. 대신 그 문항의 기존 응답은 그 시점부터 열이 갈린다.
