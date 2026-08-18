# G0 · 기반 수리 — 파일 단위 실행 계획

`docs/FIGMA_ADOPTION.md` §3의 첫 그룹. **와이어프레임과 무관하고, 나머지 여섯 그룹보다 먼저 나간다.**
G1이 색을 바꾸기 전에, G2가 라우트를 옮기기 전에, G3이 트립을 다중화하기 전에
"금액이 맞고 · 포커스가 보이고 · 배포본에 뒷문이 없고 · 브라우저가 서버의 사실을 못 쓰는" 상태를 만든다.

기준선: `npm test` **230 passing / 16 suites**. 이 계획이 끝나면 **260 내외 / 19 suites**가 된다.

## G0가 지키는 그룹 간 계약 (§4)

| 계약 | G0의 준수 |
| --- | --- |
| `app/globals.css`의 `:root` 토큰 블록은 G1만 | **건드리지 않는다.** 이미 있는 `--focus` / `--focus-on-dark`를 쓰기만 한다. 수정 대상은 L8·L9·L13의 컴포넌트 규칙뿐 |
| `app/(app)/shell.tsx` · `landing.ts`는 G2만 | **건드리지 않는다.** 라우트를 추가하지도 않는다 |
| `lib/state/types.ts` · `queries.ts` · `shape.ts`는 마이그레이션을 여는 그룹이 | **건드리지 않는다.** 0020은 권한만 바꾸므로 행 모양이 변하지 않는다 |
| 신규 화면 CSS는 새 파일로 | 신규 화면 없음 |
| 저장 대기 배지 유지 | 건드리지 않는다 |

**G0가 여는 마이그레이션은 `0020` 하나다. G3은 `0021`부터 시작한다** (§6 참조).

---

## 실행 순서

독립적인 것부터. A~D는 서로 겹치는 파일이 없어 하루에 다 나간다. E가 긴 다리다.

```
A 자산 정리        (파일 5개 삭제, 1개 축소)          — 다른 어떤 항목과도 무관
B 포커스 아웃라인  (globals.css 3곳 + login.css 1곳)   — A와 무관
C 로그인 프래그먼트(login/page.tsx + 새 lib 1개)       — B와 파일이 겹치지 않음
D 배포 가드        (dev-signin + /workflow + 새 lib 1개)
──────────── 여기까지가 반나절 ────────────
E 다통화 100배     (신규 lib 1 + 수정 19파일)          — G0의 본체
F 마이그레이션 0020(SQL 1 + app-state + trips/page)     — E와 병렬 가능, 파일이 겹치지 않음
```

E와 F는 병렬로 갈 수 있지만 **F를 E보다 먼저 커밋하지 마라.** F가 `trips.currency`를 얼리는 근거는
E가 "cents는 통화별로 해석된다"를 사실로 만들었다는 것이다. 순서가 뒤집히면
통화를 못 바꾸게 만들어 놓고 금액은 여전히 100으로 나누는 중간 상태가 된다.

---

## A. 자산 정리 [Low]

### A-1. 참조가 하나도 없는 파일 (전량 삭제)

전 저장소 grep(`node_modules` 제외) 결과 아래 5개는 코드·CSS·메타데이터 어디에서도 참조되지 않는다.

| 파일 | 크기 | 정체 |
| --- | --- | --- |
| `public/logo-source.png` | 431 KB | 로고 마스터. 배포 번들에 들어갈 이유가 없다 |
| `public/window.svg` | 385 B | `create-next-app` 기본값 |
| `public/globe.svg` | 1.0 KB | 〃 |
| `public/file.svg` | 391 B | 〃 |
| `public/favicon.svg` | 718 B | App Router는 `app/icon.png`를 쓴다. 이 파일은 아무도 안 부른다 |

- `logo-source.png`는 **삭제가 아니라 이동**한다: `docs/brand/logo-source.png`.
  마스터를 지우면 다시 만들 수 없다. `public/` 밖이면 배포 번들에 안 들어간다.
- 나머지 4개는 삭제.
- 절감: 배포 번들 −433 KB.

### A-2. `public/logo-mark.png` 208 KB → 44·46 px 렌더

참조 2곳:
- `app/login/page.tsx:51` — `<Image src="/logo-mark.png" alt="" width={44} height={44} priority />`
- `app/workflow/page.tsx:24` — `width={46} height={46}`

`next/image`가 Vercel에서 리사이즈해 주므로 런타임 비용은 첫 요청뿐이지만, **208 KB 원본은 배포에 그대로 실린다.**
`docs/brand/logo-source.png`에서 **132 px 정사각(3× of 44)** PNG를 다시 뽑아 교체한다. 기대치 8~12 KB.
파일명·경로·`<Image>` 코드는 그대로 둔다 — 이 항목은 파일 내용 교체이지 코드 수정이 아니다.

### A-3. 범위 밖이지만 기록해 둔다

`public/og.png` **1.33 MB**. `app/layout.tsx:19`가 OG/Twitter 카드로 실제로 참조하므로 삭제 불가이고,
1200×630은 규격이라 줄일 수 없다. 다만 1.33 MB는 소셜 카드로 과하다 — 무손실 재압축으로 300 KB대가 가능하다.
**G0는 손대지 않는다.** G1이 다크 테마로 OG 이미지를 다시 그릴 때 같이 처리한다.

---

## B. 포커스 아웃라인 소실 [High]

### 왜 지금 깨져 있나

`app/globals.css:4` (베이스):

```css
button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible,[tabindex]:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
```

`input:focus-visible`의 특정도는 **(0,1,1)**. 그런데 아래 네 규칙도 전부 **(0,1,1)**이고, **파일에서 더 뒤에 온다.**
같은 특정도면 뒤가 이긴다. 그래서 이 네 곳은 **키보드 포커스 링이 아예 안 그려진다.**

| 파일:줄 | 현재 선택자 | 특정도 |
| --- | --- | --- |
| `app/globals.css:8` | `.chat-input input` | (0,1,1) |
| `app/globals.css:9` | `.settings-card input,.settings-card select` | (0,1,1) |
| `app/globals.css:13` | `.profile-form input,.profile-form select` | (0,1,1) |
| `app/login/login.css:11` | `.login-form input` | (0,1,1) — **과제 목록에 없던 4번째** |

`login.css`는 `app/login/page.tsx`가 import하므로 `globals.css` 뒤에 로드된다. 결과는 같다.
Trail AI 입력창 · 여행 폼 · 프로필 폼 · **로그인 폼** — 키보드만 쓰는 사용자가 처음 만나는 네 화면 전부다.

### 고칠 코드

`outline:0`을 지우기만 하면 브라우저 기본 링이 마우스 클릭에도 뜬다(Safari의 텍스트 필드는 `:focus`에 링을 그린다).
원래 의도(마우스 클릭에는 링 없음)를 유지하면서 `:focus-visible`만 살리려면 **`:not(:focus-visible)`로 좁힌다.**

**`app/globals.css:8`** — `outline:0;` 제거

```css
/* 현재 */ .chat-input input{border:0;outline:0;padding:0 var(--sp-2);font-size:var(--fs-body);min-width:0}
/* 변경 */ .chat-input input{border:0;padding:0 var(--sp-2);font-size:var(--fs-body);min-width:0}
```

**`app/globals.css:9`** — `outline:0;` 제거

```css
/* 현재 */ .settings-card input,.settings-card select{width:100%;border:0;background:transparent;color:var(--ink);font-size:var(--fs-body);font-weight:700;outline:0;padding:0}
/* 변경 */ .settings-card input,.settings-card select{width:100%;border:0;background:transparent;color:var(--ink);font-size:var(--fs-body);font-weight:700;padding:0}
```

**`app/globals.css:13`** — `outline:0;` 제거

```css
/* 현재 */ .profile-form input,.profile-form select{width:100%;min-height:24px;border:0;background:transparent;color:var(--ink);font-size:var(--fs-body);font-weight:700;outline:0;padding:0}
/* 변경 */ .profile-form input,.profile-form select{width:100%;min-height:24px;border:0;background:transparent;color:var(--ink);font-size:var(--fs-body);font-weight:700;padding:0}
```

**`app/globals.css:4`** — 베이스 포커스 규칙 **바로 뒤에** 한 줄 추가 (`:root` 블록 아님. §4 위반 아님)

```css
/* 마우스 클릭에는 링을 안 그린다는 원래 의도만 남긴다. :focus-visible일 때는 이 규칙이 매칭되지 않으므로 위의 베이스 규칙이 이긴다. */
.chat-input input:not(:focus-visible),.settings-card :is(input,select):not(:focus-visible),.profile-form :is(input,select):not(:focus-visible){outline:0}
```

**`app/login/login.css:11`** — `outline:0;` 제거 + 같은 파일 끝에 한 줄 추가

```css
/* 현재 */ .login-form input{border:0;outline:0;background:transparent;min-height:24px;font-size:var(--fs-body);width:100%}
/* 변경 */ .login-form input{border:0;background:transparent;min-height:24px;font-size:var(--fs-body);width:100%}
/* 추가 */ .login-form input:not(:focus-visible){outline:0}
```

### G1에게 넘기는 것

`--focus` / `--focus-on-dark`의 **실제 대비비는 G1이 다크 전면 전환에서 확인한다.**
G0는 "링이 그려지는가"만 책임진다. `.chat-input`은 흰 카드 위이므로 다크 전환 후 `--focus-on-dark`가 필요해질 수 있고,
그 판단은 §4에 따라 G1의 것이다. G0는 `globals.css:4`의 다크 오버라이드 목록에 `.chat-input`을 **추가하지 않는다.**

---

## C. 로그인 프래그먼트 `error_description` 렌더 [Medium]

### 현재

`app/login/page.tsx:20-23`

```ts
const readLinkFailure = () => {
  const query = new URLSearchParams(window.location.search), hash = new URLSearchParams(window.location.hash.slice(1));
  const code = query.get("error") ?? hash.get("error_code") ?? hash.get("error");
  return code ? LINK_FAILURES[code] ?? hash.get("error_description") ?? "That sign-in link did not work. Request a new one below." : "";
};
```

React가 이스케이프하므로 XSS는 아니다. 문제는 **프래그먼트는 누구나 붙일 수 있고, 그 문장이 우리 UI의 목소리로 나간다**는 것이다.

```
https://trail.app/login#error=access_denied&error_description=Your+account+is+locked.+Call+1-800-555-0100+to+restore+access.
```

이게 `role="alert"`가 달린 우리 에러 박스에 그대로 뜬다. 로그인 화면 · 자격 증명 문맥 · 서버가 못 보는 프래그먼트.
피싱 문안을 우리 도메인에 실어 주는 링크가 된다.

### 고칠 코드

**신규 `lib/auth/link-failure.ts`** — `lib/`에 두는 이유는 `node --test`가 `@/` 별칭을 못 풀기 때문이다(저장소의 `lib/**`는 별칭을 한 번도 쓰지 않는다).

```ts
/** 매직링크가 실패해 돌아오는 두 경로: 우리 콜백의 `?error=`, Supabase의 `#error_code=`.
 *  코드는 표에서만 문장이 된다 — 링크에 실려 온 `error_description`을 우리 UI가 대신 말하지 않는다.
 *  프래그먼트는 서버가 볼 수 없고, 누구든 붙일 수 있고, 이 화면은 자격 증명을 묻는 화면이다. */
export const LINK_FAILURES: Record<string, string> = {
  missing_code: "That link arrived without a sign-in code. Mail scanners sometimes open links first — request a new one.",
  exchange_failed: "That link could not be turned into a session. Open it in the same browser you requested it from.",
  otp_expired: "That sign-in link has expired. Each link works once, within an hour.",
  access_denied: "That sign-in link is no longer valid. Request a new one below.",
  dev_no_email: "That sign-in link needs an email address.",
  dev_link_failed: "That sign-in link could not be minted.",
};
export const FALLBACK_LINK_FAILURE = "That sign-in link did not work. Request a new one below.";

export function linkFailureMessage(search: string, fragment: string) {
  const query = new URLSearchParams(search.replace(/^\?/, "")), hash = new URLSearchParams(fragment.replace(/^#/, ""));
  const code = query.get("error") ?? hash.get("error_code") ?? hash.get("error");
  return code ? LINK_FAILURES[code] ?? FALLBACK_LINK_FAILURE : "";
}
```

**`app/login/page.tsx`** — L13-24의 `LINK_FAILURES` 상수와 `readLinkFailure`를 지우고 import로 대체

```ts
import { linkFailureMessage } from "../../lib/auth/link-failure";
// 알 수 없는 코드의 원문은 콘솔에만 남긴다. 화면에는 우리 문장만 나간다.
const readLinkFailure = () => { const message = linkFailureMessage(window.location.search, window.location.hash); if (message === FALLBACK_LINK_FAILURE) console.debug("[login] unmapped link failure", window.location.hash); return message; };
```

`dev_no_email` · `dev_link_failed`는 `app/auth/dev-signin/route.ts:29,39`가 실제로 리다이렉트하는 코드인데
지금 표에 없어서 폴백 문장이 나가고 있었다. 같이 넣는다.

**잃는 것**: Supabase가 보낸 진단 원문이 화면에서 사라진다. 그건 개발자용 정보이지 여행자용이 아니고, `console.debug`에 남는다.

---

## D. 배포본 뒷문 두 개 [High / Medium]

두 항목이 같은 판정을 쓰므로 헬퍼를 먼저 만든다.

**신규 `lib/env/deployment.ts`**

```ts
/** "지금 이건 배포본인가"를 한 곳에서만 판정한다.
 *
 *  `NODE_ENV`만으로는 부족하다 — `next build && next start`를 로컬에서 돌려도 production이고,
 *  Vercel 프리뷰는 인증 없이 공개 URL을 갖는다. Vercel에서 도는 모든 환경(production·preview·development)은
 *  `VERCEL_ENV`에 값이 있으므로, 그 값이 존재하기만 하면 닫는다. */
export type DeployEnv = { NODE_ENV?: string; VERCEL?: string; VERCEL_ENV?: string; TRAIL_DEV_LOGIN?: string; TRAIL_DEV_LOGIN_EMAIL?: string };
export const isDeployed = (env: DeployEnv = process.env) => env.NODE_ENV === "production" || Boolean(env.VERCEL_ENV) || env.VERCEL === "1";

/** 개발 로그인의 세 자물쇠. 셋 다 열려야 열린다. 네 번째(배포 제외)는 `.vercelignore`가 건다. */
export function devLoginAllowed(asked: string, env: DeployEnv = process.env) {
  if (isDeployed(env)) return false;                                   // 1. 배포본이 아닐 것
  if (env.TRAIL_DEV_LOGIN !== "on") return false;                      // 2. 명시적으로 켜져 있을 것
  const allowed = (env.TRAIL_DEV_LOGIN_EMAIL ?? "").trim().toLowerCase();
  return allowed !== "" && asked.trim().toLowerCase() === allowed;     // 3. 그 계정 하나와 정확히 일치할 것
}
```

### D-1. `app/auth/dev-signin/route.ts` [High]

**현재 L22** — 자물쇠가 사실상 `NODE_ENV` 하나. `?email=`은 **아무 주소나** 받고, 없는 계정이면 `signup`으로 **만들어 준다**.
즉 `TRAIL_DEV_LOGIN`이 실수로 켜진 배포본에서는 임의 이메일로 임의 계정에 세션이 발급된다.

```ts
/* 현재 */ const devSignInOn = () => process.env.NODE_ENV !== "production" && process.env.TRAIL_DEV_LOGIN === "on";
```

**변경 L22 · L25-29**

```ts
/* 변경 */ import { devLoginAllowed } from "@/lib/env/deployment";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const email = (searchParams.get("email") ?? process.env.TRAIL_DEV_LOGIN_EMAIL ?? "").trim();
  // 404 하나로 답한다. 어떤 자물쇠가 걸렸는지 알려주는 것도 정보다.
  if (!devLoginAllowed(email) || !hasAdminClient()) return new NextResponse("Not found", { status: 404 });
  const next = searchParams.get("next") ?? "/";
  …
}
```

- `?email=`이 없으면 `TRAIL_DEV_LOGIN_EMAIL`이 들어가 자기 자신과 일치하므로 기존 사용감은 그대로다.
- `?email=someone.else@x.com`은 이제 404다. **generateLink가 호출되기 전에** 막히므로 계정도 안 생긴다.
- 파일 상단 주석의 "Two locks"를 "Three locks, plus one deploy exclusion"으로 고친다.

**네 번째 자물쇠 — `.vercelignore` 신설**

```
app/auth/dev-signin
```

라우트 파일은 어디에서도 import되지 않으므로(엔트리 포인트다) 제외해도 빌드가 깨지지 않는다.
**Vercel 프리뷰 배포로 실제 확인이 필요하다** — 검증 절차 참조.

`.env.example` §5의 설명도 고친다: "개발 빌드일 때만" → "로컬 개발 빌드이고, `TRAIL_DEV_LOGIN=on`이고, 요청 이메일이 `TRAIL_DEV_LOGIN_EMAIL`과 정확히 같을 때만. Vercel에는 어느 환경에도 넣지 말 것 — 넣어도 열리지 않는다."

### D-2. `/workflow` 무인증 고아 라우트 [Medium]

`docs/APP_SPEC.md:112`가 이미 결론을 냈다: **"제품 표면 아님 · 내부 문서로 유지"**.
그런데 지금은 로그인 없이 공개 URL로 열리고, 색인되고, 12프레임짜리 제품 로드맵과 옛 이름(`Ask`·`Today`)을 그대로 보여 준다.
G2가 탭을 `Home / Trips / AI / Bags`로 개명하는 순간, 이 페이지는 공개된 채로 틀린 이름을 말한다.

**삭제하지 않는다** (`.claude/agents/trail-product-lead.md:43`·`trail-release-qa.md:23`이 참조하는 내부 자료이고, 작업 트리에서 방금 수정됐다).
**배포본에서만 없앤다.**

`app/workflow/page.tsx:22` 앞에 추가:

```ts
import { notFound } from "next/navigation";
import { isDeployed } from "@/lib/env/deployment";

/** 내부 와이어프레임 보드. 제품 표면이 아니다(APP_SPEC §라우트). 배포본에는 존재하지 않는다. */
export const metadata = { robots: { index: false, follow: false } };

export default function WorkflowPage() {
  if (isDeployed()) notFound();
  …
}
```

**따라오는 문서 수정**: `docs/MIGRATION_PLAN.md:88`의 검증 절차가
"Vercel 프리뷰 배포 → `/`, `/workflow`, `/api/chat` 3개 경로 확인"이라고 쓰여 있다.
프리뷰도 `VERCEL_ENV`가 있으므로 `/workflow`는 404가 된다. **그 줄에서 `/workflow`를 빼고 `/login`으로 바꾼다.**

---

## E. 다통화 100배 오차 [Blocker] — G0의 본체

### 지금 무슨 일이 일어나는가

진실은 한 곳에 있다: `app/trail-brief.ts:18`

```ts
export const MINOR_UNITS: Record<string, number> = { CAD: 100, USD: 100, EUR: 100, GBP: 100, JPY: 1, KRW: 1 };
```

트립 생성(`app/api/trips/route.ts:40`, `lib/trips/input.ts:28`)과 AI 지갑 제안(`app/trail-brief.ts:293`)은 이 표를 따른다.
`tests/trail-wallet.test.ts`에 **"a yen total is not multiplied by a hundred"** 테스트까지 있다.
그런데 **표시와 입력은 이 표를 모른다.** 30,000엔 여행에서:

| 지점 | 동작 | 결과 |
| --- | --- | --- |
| 저장 | `30000 × MINOR_UNITS.JPY(1)` | `total_cents = 30000` ✅ |
| 표시 `view.ts:16` | `30000 / 100` | **"300"** ❌ 1/100 |
| 입력 `record/page.tsx:74` | 사용자가 `1200` 입력 → `× 100` | **`120000` 저장** ❌ 100× |
| 배분 `people/page.tsx:31` | `× 100` | 100× ❌ |
| 배분(AI) `lib/recipients/input.ts:102` | `× 100` | 100× ❌ **서버에 영구 기록된다** |

세 번째·네 번째가 진짜 무서운 쪽이다. **표시 오류는 새로고침하면 되지만, 잘못 저장된 cents는 남는다.**
그리고 `wallet.spendableCents = planned − spent`가 100배 틀린 `spent`를 받으므로
**제품 규칙 4의 "실제가 예산 초과" 실패 분기가 거짓으로 발화한다** — 1,200엔을 쓴 여행자에게 예산 초과라고 말한다.

`price()`의 `$` 하드코딩은 같은 뿌리다: `¥`를 `$`로 부르는 것도 통화를 모른다는 뜻이다.

### E-1. 신규 `lib/money/format.ts` — 통화 지식의 단일 출처

`lib/`에 둔다(테스트가 별칭 없이 import한다). 이 파일은 아무것도 import하지 않는다.

```ts
/** 통화 하나에 최소 단위 하나. 이 표가 유일본이다 — `app/trail-brief.ts`는 여기서 다시 내보낸다.
 *
 *  분기 두 개가 여기 걸려 있다: 화면의 금액과 실패 분기 "실제가 예산 초과". 100으로 나누는 코드가
 *  하나라도 남으면 엔화 여행자는 자기 예산의 1/100을 보고, 자기가 쓴 돈의 100배를 저장한다. */
export const CURRENCIES = ["CAD", "USD", "EUR", "GBP", "JPY", "KRW"] as const;
export const MINOR_UNITS: Record<string, number> = { CAD: 100, USD: 100, EUR: 100, GBP: 100, JPY: 1, KRW: 1 };
const SYMBOL: Record<string, string> = { CAD: "$", USD: "$", EUR: "€", GBP: "£", JPY: "¥", KRW: "₩" };

export const minorUnits = (currency: string | null | undefined) => MINOR_UNITS[currency ?? ""] ?? 100;
export const toMinor = (units: number, currency: string) => Math.round(units * minorUnits(currency));
export const fromMinor = (cents: number, currency: string) => cents / minorUnits(currency);
export const currencySymbol = (currency: string) => SYMBOL[currency] ?? "";
/** 소수 자릿수를 통화에서 읽는다. 엔·원은 소수점이 없고, 천 단위 구분은 `toLocaleString`에 맡기지 않는다(테스트가 ICU에 걸리면 안 된다). */
const group = (whole: string) => whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
export function amount(cents: number, currency: string) {
  const units = minorUnits(currency), sign = cents < 0 ? "−" : "", n = Math.abs(Math.round(cents));
  if (units === 1) return sign + group(String(n));
  const rest = n % units;
  return sign + group(String(Math.floor(n / units))) + (rest === 0 ? "" : `.${String(rest).padStart(2, "0")}`);
}
/** 와이어프레임 정본 형식: `CAD $250` · `JPY ¥30,000` (§2 데이터 라벨). */
export const priceLabel = (cents: number, currency: string) => `${currency} ${currencySymbol(currency)}${amount(cents, currency)}`;
```

`amount()`는 현재 `money()`의 관습을 그대로 지킨다: 나머지가 0이면 소수점 없이(`250`), 아니면 두 자리(`250.50`).
**센트를 반올림해 없애지 않는다.**

### E-2. 상수 이사 — 사이클 없이

| 파일:줄 | 현재 | 변경 |
| --- | --- | --- |
| `app/trail-brief.ts:16,18` | `export const CURRENCIES = […]` / `export const MINOR_UNITS = {…}` | 두 줄 삭제 → 상단에 `export { CURRENCIES, MINOR_UNITS } from "../lib/money/format.ts";` 한 줄 |
| `lib/trips/input.ts:13` | `import { CURRENCIES, MINOR_UNITS, … } from "../../app/trail-brief.ts"` | `CURRENCIES`·`MINOR_UNITS`는 `../money/format.ts`에서, `TOTAL_MAX`·`TOTAL_MIN`은 그대로 |
| `lib/trips/input.ts:27-28` | `MINOR_UNITS_BY_CURRENCY` / `toMinorUnits` 자체 정의 | `export const MINOR_UNITS_BY_CURRENCY = minorUnits;` `export const toMinorUnits = toMinor;` — **이름을 유지한다.** `tests/trail-trips.test.ts:4`와 `app/onboarding/new-trip-form.tsx:46`이 이 이름으로 import한다 |

`app/trail-brief.ts`는 import가 하나도 없는 파일이고, `lib/money/format.ts`도 import가 없다. 사이클 없음.
`app/trail-brief.ts:293`·`:470`의 `MINOR_UNITS` 사용은 재수출 덕에 그대로 동작한다.

### E-3. `app/(app)/view.ts:16-17` — 통화를 **필수 인자**로

```ts
/* 현재 */
export const money = (cents: number) => (Math.abs(cents) % 100 === 0 ? String(Math.round(cents / 100)) : (cents / 100).toFixed(2));
export const price = (cents: number, currency = "CAD") => `${currency} $${money(cents)}`;

/* 변경 */
export { amount as money, priceLabel as price } from "@/lib/money/format";
```

**기본값 `= "CAD"`를 없애는 것이 이 항목의 실행 계획 그 자체다.**
`money`가 인자 2개를 요구하는 순간 `next build`의 타입 체크가 **모든 호출 지점을 나열해 준다.**
사람이 만든 목록이 아니라 컴파일러가 만든 목록을 따라가면 빠뜨릴 수 없다.

### E-4. 호출 지점 (컴파일러가 잡아 줄 곳)

`money(` 호출은 15개 파일 · 40여 곳. 그중 **`$`를 문자로 박아 둔 곳이 24곳**이다.
기계적 규칙 두 개로 전부 처리된다:

- `{currency} ${money(x)}` → `{price(x, currency)}`
- `{money(x)} {currency}` → `{price(x, currency)}` (`bags/track/page.tsx:57`, `trail/plan/gifts/page.tsx:22`의 순서 뒤집힌 형태)
- 통화 없이 숫자만 쓰는 자리(`<strong>${money(...)}</strong>`) → `{price(x, currency)}`. 기호만 빼고 싶으면 `amount(x, currency)`

| 파일 | 줄 | 비고 |
| --- | --- | --- |
| `app/(app)/ask/brief/page.tsx` | 21 | 슬라이더 눈금 `$40`/`$300`은 **cents가 아니라 whole units**다. E-7 참조 |
| `app/(app)/ask/page.tsx` | 48 | 퀵리플라이 칩 라벨 + AI에게 보내는 문장 |
| `app/(app)/bags/pay/page.tsx` | 84, 85, 89 | 이미 `price()`를 쓴다. 인자 필수화만 반영. §2 버튼 카피 `Pay {currency} ${amount}`와 형식이 일치하는지 확인 |
| `app/(app)/bags/review/page.tsx` | 69 | |
| `app/(app)/bags/track/page.tsx` | 47, 57 | 57은 `{money} {currency}` 역순 |
| `app/(app)/trail/page.tsx` | 22, 23, 24 | 22는 템플릿 문자열 안 |
| `app/(app)/trail/plan/approval/page.tsx` | 74, 76, 80 | **승인 화면. 표시 금액과 청구 금액이 같아야 하는 자리다** |
| `app/(app)/trail/plan/budget/page.tsx` | 17, 18, 19, 20, 21 | 지갑 3버킷 |
| `app/(app)/trail/plan/delivery/page.tsx` | 28 | |
| `app/(app)/trail/plan/gifts/page.tsx` | 22, 24 | |
| `app/(app)/trail/plan/people/page.tsx` | 30, 102, 113, 116, 118, 119 | 30은 **입력값 시드**다. E-6 참조 |
| `app/(app)/trail/shop/page.tsx` | 17, 19, 20, 24 | 예산 알약 · 초과 경고 |
| `app/(app)/trail/shop/[stopId]/record/page.tsx` | 74, 77 | E-5 |
| `app/(app)/trips/page.tsx` | 55 | |
| `app/(app)/trips/past/page.tsx` | 25 | `entry.currency` — 트립별 통화가 다를 수 있는 유일한 화면 |

`currency`는 전 지점에서 이미 손에 있다: `useApp().currency`(= `app-state.tsx:120`, `trip?.currency ?? "CAD"`)이거나 행 자신의 `entry.currency` / `quote.currency` / `transfer.currency`.
**새 prop을 뚫을 필요가 없다.**

### E-5. `record/page.tsx:74` — 100× 쓰기

```tsx
/* 현재 */
<label>Total paid, tax included<input type="number" min="0.01" step="0.01" inputMode="decimal" value={draft.actualPriceCents / 100} onChange={(e) => edit({ actualPriceCents: Math.round(Number(e.target.value) * 100) })} /></label>

/* 변경 — 파일 상단에 `import { fromMinor, minorUnits, toMinor } from "@/lib/money/format";` */
const units = minorUnits(currency), step = units === 1 ? "1" : "0.01";
…
<label>Total paid, tax included<input type="number" min={step} step={step} inputMode={units === 1 ? "numeric" : "decimal"} value={fromMinor(draft.actualPriceCents, currency)} onChange={(e) => edit({ actualPriceCents: toMinor(Number(e.target.value), currency) })} /></label>
```

`L77`의 `{currency} {money(after)}` → `{price(after, currency)}`.

**주의 — 초안(draft) 호환성.** `localStorage`의 `trail:draft:record:{stopId}`에는 이미 100× 로 쓰인 초안이 남아 있을 수 있다.
초안은 `actualPriceCents`를 그대로 담으므로 통화가 바뀌지 않는 한 값의 의미는 동일하다(잘못 쓰였다면 잘못된 채로 복원된다).
**초안 키를 마이그레이션하지 않는다** — 지하상가에서 타이핑 중인 숫자를 코드가 조용히 바꾸는 것이 더 나쁘다.
대신 잘못 저장된 **기존 행**의 처리는 E-8을 본다.

### E-6. `people/page.tsx:30-31` — 배분 입력

```ts
/* 현재 */
const seedRow = (person: Recipient): Row => ({ amount: person.allocationCents === null ? "" : money(person.allocationCents), basis: "group_total" });
const toCents = (amount: string) => Math.round(Number(amount) * 100);

/* 변경 — seedRow·toCents가 currency를 받아야 하므로 컴포넌트 안으로 들이거나 인자로 넘긴다 */
const seedRow = (person: Recipient, currency: string): Row => ({ amount: person.allocationCents === null ? "" : amount(person.allocationCents, currency), basis: "group_total" });
const toCents = (value: string, currency: string) => toMinor(Number(value), currency);
```

`seedRow`는 **입력 필드의 초기값**이므로 `price()`가 아니라 `amount()`를 써야 한다(`"CAD $250"`을 `<input>`에 넣을 수는 없다).
호출 지점: `L46`(`row()`), `L49`(`entries` useMemo). `useMemo` 의존성 배열에 `currency` 추가.

### E-7. `app-state.tsx:140` — 브리프 예산의 역변환

```ts
/* 현재 */ budget: Math.round(serverPlan.plannedCents / 100)
/* 변경 */ budget: Math.round(fromMinor(serverPlan.plannedCents, trip?.currency ?? "CAD"))
```

`app/trail-brief.ts:470`은 이미 `MINOR_UNITS`로 나눈다. 이 줄만 100을 박고 있어 **같은 값의 왕복이 통화별로 어긋난다.**

**범위 밖으로 밀어내는 것**: `BUDGET_MIN=40` / `BUDGET_MAX=300`(`trail-brief.ts:19-20`)과
`ask/brief/page.tsx:21`의 슬라이더 `min="40" max="300" step="10"`은 **통화와 무관한 상수**다.
엔화 여행에서 40~300엔짜리 선물 예산 슬라이더는 무의미하다. 이건 단위 변환 버그가 아니라 **제품 결정**이고,
G4(Trail AI · 칩 온보딩)가 슬라이더를 다시 그릴 때 통화별 범위를 정해야 한다.
**G0는 고치지 않고, `docs/plans/G4-*.md`에 넘긴다.**

### E-8. 서버 쪽 두 곳 — 여기가 진짜 데이터 오염 지점

**`lib/recipients/input.ts:101-102`**

```ts
/* 현재 */
const unit = fields.allocationAmount;
const allocationCents = typeof unit === "number" && Number.isInteger(unit) && unit >= 0 ? unit * 100 : clear.has("allocationAmount") ? 0 : null;

/* 변경 — 시그니처에 통화를 추가한다 */
export function planRecipientOps(raw: unknown, resolve: (ref: string) => string | null, known: { id: string; isSelf: boolean }[], currency: string): { ops: AppliedOp[]; rejected: OpRejection[] } {
…
const allocationCents = typeof unit === "number" && Number.isInteger(unit) && unit >= 0 ? toMinor(unit, currency) : clear.has("allocationAmount") ? 0 : null;
```

**`app/api/recipients/apply/route.ts:45`** — 유일한 호출자. `tripId`는 있고 통화는 없으므로 한 줄 읽어 온다.

```ts
/* 현재 */ const planned = planRecipientOps(body.body.ops, resolve, people.map((p) => ({ id: p.id, isSelf: p.is_self })));
/* 변경 */
const tripRow = await loadTrip(db, tripId);          // lib/transfers/context.ts:34, `currency` 포함
const planned = planRecipientOps(body.body.ops, resolve, people.map((p) => ({ id: p.id, isSelf: p.is_self })), tripRow?.currency ?? "CAD");
```

같은 파일 L17-19의 주석 **"multiplied by 100 here"**를 "multiplied by the trip's minor units here"로 고친다.
주석이 틀린 사실을 말한 채로 남으면 다음 사람이 그걸 근거로 삼는다.

**추가 경화(권장) — `app/api/purchases/[stopId]/route.ts:55`**
`purchases.currency`가 **클라이언트 바디에서** 온다(`lib/purchases/input.ts:58`, 없으면 `"CAD"` 기본값).
클라이언트가 보낸 cents를 클라이언트가 보낸 통화로 해석하면 둘이 어긋나도 서버는 모른다.
**통화는 트립 행에서 읽어 덮어쓴다** — 신원과 같은 원칙이다.

```ts
/* 변경 */ const row = { …, currency: tripRow.currency, … };   // input.currency 무시
```

`lib/purchases/input.ts`의 `currency` 파싱은 하위 호환을 위해 남기되, 라우트가 결과를 쓰지 않는다.
`app/api/purchases/unplanned/[key]/route.ts:63`도 동일.

### E-9. 손대지 않는 100

| 파일:줄 | 왜 그냥 두는가 |
| --- | --- |
| `lib/state/legacy-import.ts:77,96` | V3 프로토타입 임포트. 그 프로토타입은 CAD 전용이었고 과거 데이터의 사실이다 |
| `app/onboarding/budget.ts:15` | `DELIVERY_RESERVE`는 가격표 폴백 행(CAD)의 whole-unit 환산. 실제 경로(`api/trips:40`, `new-trip-form:46`)는 이미 `MINOR_UNITS`를 쓰고 이 상수를 넘겨받지 않는다 |
| `lib/transfers/pass.ts`, `clock.ts` | 밀리초/초 변환. 돈이 아니다 |
| `lib/transfers/eligibility.ts:39` | 그램→킬로그램 |

---

## F. `trips` 컬럼 권한 [Medium] — G3와의 경계선

### 판단: **G0가 0020으로 먼저 한다. G3은 0021부터.**

`docs/FIGMA_ADOPTION.md` §4는 `0020·0021·0022`을 G3에 배정했다. 그 배정을 **한 칸 미룬다.** 근거 셋:

1. **이건 스키마가 아니라 권한이다.** 컬럼도 타입도 안 바뀌므로 `lib/state/types.ts`·`queries.ts`·`shape.ts`를 건드리지 않는다.
   §4가 저 세 파일을 마이그레이션 여는 그룹에 묶은 이유(행 모양 충돌)가 여기엔 적용되지 않는다.
2. **나중에 하면 G3이 자기가 만든 코드를 되돌려야 한다.** G3은 다중 트립·`My Trips` 3구획(`CURRENT`/`UPCOMING`/`PAST`)을 만든다.
   `status`가 브라우저에서 쓰기 가능한 상태로 그 화면을 만들면, 트립 전환은 십중팔구 `saveTrip({status})`가 된다.
   그 코드가 생긴 뒤에 잠그면 G3의 작업을 부수는 일이 된다. 잠근 뒤에 만들면 처음부터 서버 라우트로 간다.
3. **`currency` 동결은 E의 나머지 반쪽이다.** E가 "cents는 통화별로 해석된다"를 사실로 만드는데,
   브라우저가 그 통화를 아무 때나 바꿀 수 있으면 **저장된 모든 금액의 의미가 사후에 바뀐다.**
   `sanitizeWalletPatch`는 이미 `currency_locked`로 이걸 거절한다(`tests/trail-wallet.test.ts:75`) — AI 경로는 막혀 있고 테이블 GRANT만 열려 있다.
   같은 규칙이 한 경로에서만 지켜지는 상태를 G0 밖으로 넘기지 않는다.

### F-1. `supabase/migrations/0020_trip_columns_are_not_all_writable.sql`

```sql
-- TRAIL — 여행자가 쓸 수 있는 trips 컬럼은 여행자가 폼에 입력한 것뿐이다.
--
-- 0002는 `grant select, insert, update, delete on public.trips to authenticated`를 줬고,
-- RLS 정책은 "이 행이 당신 것인가"만 본다. "이 컬럼을 당신이 정하는가"는 아무도 안 봤다.
-- 그래서 브라우저는 자기 여행의 status·currency·hotel_verified_at을 직접 UPDATE할 수 있었다.
--
--   status            여행의 생애주기. 서버가 정한다 (다중 트립 전환은 G3의 라우트가 쓴다)
--   currency          저장된 cents의 해석. 바뀌면 모든 금액의 의미가 소급해서 바뀐다
--   hotel_verified_at 호텔이 확인해 준 사실이지 여행자의 주장이 아니다. 이송 자격 판정에 들어간다
--                     (lib/transfers/context.ts:92 `verified: Boolean(trip.hotel_verified_at)`)
--   hotel_id          파트너 카탈로그 FK
--   user_id / id      소유권 그 자체
--
-- INSERT는 건드리지 않는다: POST /api/trips 와 POST /api/import 가 사용자 클라이언트로
-- status·currency 를 포함해 행을 만든다. 그 경로를 서버 소유로 옮기는 것은 G3의 일이다.

revoke update on public.trips from authenticated;
grant update (country, city, areas, start_date, end_date, hotel_name, hotel_address, companions, free_time)
  on public.trips to authenticated;

-- 호텔이 바뀌면 확인 사실은 더 이상 그 호텔의 것이 아니다. 브라우저가 그 컬럼을 못 쓰게 된 이상
-- 되돌리는 일은 DB가 한다 — service_role 로 들어와도 똑같이 걸린다.
create or replace function public.clear_hotel_verification() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.hotel_name is distinct from old.hotel_name or new.hotel_address is distinct from old.hotel_address then
    new.hotel_verified_at := null;
  end if;
  return new;
end $$;
create trigger trips_hotel_change_unverifies before update on public.trips
  for each row execute function public.clear_hotel_verification();

-- 제품 규칙을 데이터 계약으로: 구매가 하나라도 기록된 뒤에는 통화가 바뀌지 않는다.
-- AI 경로는 이미 이걸 `currency_locked`로 거절한다 (app/trail-brief.ts). 규칙이 한 경로에만
-- 있으면 규칙이 아니다.
create or replace function public.freeze_trip_currency() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.currency is distinct from old.currency
     and exists (select 1 from public.purchases p where p.trip_id = old.id and p.voided_at is null) then
    raise exception 'currency_locked: this trip already has recorded purchases' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger trips_currency_is_frozen before update on public.trips
  for each row execute function public.freeze_trip_currency();
```

`security invoker` + `set search_path = ''`는 `0008_pin_reference_function_search_path.sql`이 세운 관례다. 새 함수도 따른다.

적용 절차(CLAUDE.md 규칙): 파일 작성 → Supabase MCP `apply_migration` → **`get_advisors(type: security)`**.
기대치: 신규 지적 0건. 새 테이블·뷰가 없고 함수 두 개는 `search_path`가 고정돼 있다.

### F-2. TypeScript 쪽 — DB가 거절하기 전에 컴파일러가 거절하게

**`app/(app)/app-state.tsx:329-335`**

```ts
/* 현재 */ const saveTrip = useCallback(async (patch: Record<string, unknown>) => {

/* 변경 — 파일 상단 근처에 */
/** 브라우저가 trips에 쓸 수 있는 전부. 0020이 같은 목록을 컬럼 GRANT로 강제한다.
 *  두 목록이 갈라지면 DB가 42501로 답하고 여행자는 저장 실패를 본다 — 그러니 같이 고친다. */
export const TRIP_WRITABLE = ["country", "city", "areas", "start_date", "end_date", "hotel_name", "hotel_address", "companions", "free_time"] as const;
export type TripPatch = Partial<Record<(typeof TRIP_WRITABLE)[number], unknown>>;

const saveTrip = useCallback(async (patch: TripPatch) => {
  if (!tripId) return { ok: false, message: "No trip open." };
  const { error: failed } = await supabaseClient().from("trips").update(patch).eq("id", tripId);
  // 42501 = permission denied for column. 포스트그레스 문장을 여행자에게 그대로 보여주지 않는다.
  if (failed) return { ok: false, message: failed.code === "42501" ? "Trail cannot change that on this trip." : failed.message };
  await refresh();
  return { ok: true, message: "" };
}, [refresh, tripId]);
```

**`app/(app)/trips/page.tsx:21`** — `TripForm`의 prop 타입

```ts
/* 현재 */ function TripForm({ trip, save }: { trip: Trip; save: (patch: Record<string, unknown>) => Promise<{ ok: boolean; message: string }> })
/* 변경 */ function TripForm({ trip, save }: { trip: Trip; save: (patch: TripPatch) => Promise<{ ok: boolean; message: string }> })
```

L34가 실제로 보내는 필드는 이미 허용 목록과 정확히 일치한다. **현재 동작은 하나도 안 바뀐다.**
바뀌는 것은 "다음 사람이 `status`를 끼워 넣으면 빌드가 깨진다"는 사실이다.

### F-3. G3에게 넘기는 것 (이 절을 `docs/plans/G3-*.md`에 그대로 옮겨라)

0020 이후 **브라우저는 아래를 할 수 없다.** G3이 다중 트립을 만들려면 대체 경로가 필요하다.

| 못 하게 된 것 | G3이 만들어야 할 것 | 왜 서버여야 하나 |
| --- | --- | --- |
| `trips.status` 변경 | `POST /api/trips/{id}/status` — `planning → active → archived` 전이만 허용 | "현재 여행"은 하나여야 한다. 두 행이 동시에 `active`가 되는 것을 클라이언트가 막을 수 없다 |
| `trips.currency` 변경 | 통화 변경 라우트 (구매 0건일 때만). `sanitizeWalletPatch`의 `confirm.currency` 제안을 받는 자리 | 저장된 cents의 해석을 바꾸는 일. 승인 게이트가 필요하다 |
| `trips.hotel_verified_at` 쓰기 | **G5**의 호텔 확인 경로 | 이송 자격 판정 입력값 |
| — (아직 열려 있음) | `trips` **INSERT**를 서버 소유로. 지금은 브라우저가 `plans` 없는 트립을 직접 INSERT할 수 있고, 그건 지갑 없는 여행이다 | `POST /api/trips`가 트립+플랜을 한 쌍으로 쓰는 이유와 같다 |

**마이그레이션 번호: G3은 `0021`부터.** §4의 `G3(0020·0021·0022)`은 `G3(0021·0022·0023)`로 읽는다.
`docs/FIGMA_ADOPTION.md` §4의 그 줄을 G0가 수정한다(그 문서에서 G0가 고치는 유일한 줄이다).
G2(`0023`)·G5(`0024·0019`)도 각각 한 칸씩 밀린다 — **G0가 §4의 해당 줄을 `G3(0021·0022·0023) · G5(0019·0025) · G2(0024)`로 갱신한다.**

---

## 회귀 위험 — 230개 테스트 중 무엇이 움직이는가

`npm test` 기준선: **230 passing, 16 suites, 0 fail** (측정 완료).

| 수정 | 건드리는 기존 스위트 | 위험 | 대응 |
| --- | --- | --- | --- |
| A 자산 | 없음 | 없음. 어떤 테스트도 `public/`을 읽지 않는다 | `next build`가 `<Image>` 경로를 확인 |
| B 포커스 | 없음 (CSS 테스트 없음) | **조용한 회귀 위험 최상.** G1이 이 CSS를 전면 재작성하면서 `outline:0`을 되살릴 수 있고, 아무도 모른다 | **신규 소스 스캔 테스트**로 고정 (아래 T3) |
| C 로그인 | 없음 | `LINK_FAILURES` 문자열이 파일 밖으로 나간다. 아무도 import하지 않으므로 안전 | **신규 T2** |
| D 가드 | 없음 | `.vercelignore` 오타 시 배포에서 파일이 사라져도 빌드는 통과한다(엔트리 포인트라 import가 없다). **로컬 빌드로는 검증 불가** | **신규 T4** + 프리뷰 배포 수동 확인 |
| E-2 상수 이사 | `trail-brief.test.ts`(23) · `trail-wallet.test.ts`(13) · `trail-trips.test.ts`(15) | `MINOR_UNITS`·`CURRENCIES`를 재수출로 유지하면 **셋 다 무수정 통과.** `lib/trips/input.ts`의 `MINOR_UNITS_BY_CURRENCY`·`toMinorUnits` 이름을 반드시 유지 | 이사 직후 `npm test` 단독 실행 |
| E-3/E-4 표시 | 없음 | **어떤 테스트도 `app/(app)/view.ts`를 import하지 않는다.** 40개 호출 지점이 전부 테스트 사각지대다 | 타입 체크가 유일한 그물. `next build` 필수. + **T1**의 소스 스캔 |
| E-5 record 입력 | 없음 | 초안 `localStorage` 호환 (E-5 주석 참조) | 수동 확인 |
| E-6 people 입력 | `trail-allocations.test.ts`(15) · `trail-recipients.test.ts`(17) | 이 둘은 `lib/budget/allocations.ts`·`app/trail-brief.ts`를 보므로 **영향 없음.** 화면 쪽 변환은 테스트가 없다 | **T1**에 왕복 케이스 |
| E-8 서버 배분 | **`trail-recipient-routes.test.ts`(18) — 깨진다** | `planRecipientOps`가 4번째 인자를 받는다. `L14`의 헬퍼가 3개만 넘긴다. **`node --test`는 타입을 지우므로 런타임에서는 `undefined` → `minorUnits(undefined)=100` → 지금과 같은 값이라 테스트는 초록불로 남는다.** 하지만 `next build`의 tsc는 `tests/**/*.ts`를 include하므로 **빌드가 깨진다** | `L14`를 `planRecipientOps(ops, resolve, known, currency)`로 고치고 **JPY 케이스를 추가**(아래) |
| E-8 purchases 통화 | `trail-payments.test.ts`(15) · `trail-transfers.test.ts`(52) | 둘 다 라우트 핸들러가 아니라 `lib/transfers/*`를 본다. 영향 없음 | — |
| E-7 브리프 예산 | `trail-brief.test.ts`(23) | `app-state.tsx`는 테스트가 없다. `trail-brief.ts:470`은 안 건드린다 | — |
| F-1 마이그레이션 | 없음 (DB 테스트 없음) | **위험 최상.** 컬럼 GRANT가 틀리면 여행 저장이 런타임에 실패한다. 트리거가 틀리면 이송 자격 판정이 바뀐다 | `get_advisors` + 수동 확인(아래) |
| F-2 타입 | `trail-state.test.ts`(21) | `lib/state/*`만 본다. `app-state.tsx`는 테스트가 없다 | 타입 체크 |

### 새로 필요한 테스트

기존 관례를 따른다: 순수 함수는 `lib/`에 두고 `node --test`로 상대경로 import,
소스 스캔은 `readFileSync`(이미 `trail-trips.test.ts:3`·`legacy-import.test.ts`가 쓴다).

**T1 · `tests/trail-money.test.ts` (신규, ~14 케이스)**
- `amount`: `(30000,"JPY") === "30,000"` · `(25000,"CAD") === "250"` · `(25050,"CAD") === "250.50"` · `(1250,"EUR") === "12.50"` · `(12000,"KRW") === "12,000"`
- `priceLabel`: `CAD $250` · `JPY ¥30,000` · `KRW ₩12,000` · `GBP £12.50` — **§2 `Pay {currency} ${amount}` 형식과 일치**
- 왕복: 6개 통화 각각 `toMinor(fromMinor(c, cur), cur) === c` (`c`는 소수 나머지가 있는 값 포함)
- **센트를 잃지 않는다**: `amount(1, "CAD") === "0.01"` · `amount(-2550,"CAD")`가 부호를 유지
- 모르는 통화(`"XYZ"`)는 던지지 않고 100으로 떨어진다
- **소스 스캔**: `app/**/*.tsx`에서 `/\$\s*\{?\s*money\(/` 매치 0건.
  *G1~G6이 이 화면들을 전부 다시 그린다. `$`를 다시 박는 것을 막는 유일한 장치다.*

**T2 · `tests/trail-auth-link.test.ts` (신규, ~5 케이스)**
- 알려진 코드 4개가 각자의 문장으로
- `#error=access_denied&error_description=Call+1-800-555-0100` → 결과가 `access_denied` 문장과 정확히 같고 **`"1-800"`을 포함하지 않는다**
- 모르는 코드 → `FALLBACK_LINK_FAILURE`와 정확히 같다
- 코드가 없으면 빈 문자열

**T3 · `tests/trail-focus-visible.test.ts` (신규, 2 케이스)**
- `app/globals.css` + `app/login/login.css` + `app/handsfree.css` + `app/profile.css` + `app/onboarding/onboarding.css`를 읽어
  `outline:0` / `outline:none`이 나오는 모든 선택자가 `:not(:focus-visible)`을 포함하는지 검사. 위반 0건.
- 베이스 `:focus-visible` 규칙이 `globals.css`에 존재하는지

**T4 · `tests/trail-deploy-guard.test.ts` (신규, ~7 케이스)** — `lib/env/deployment.ts`의 순수 함수에 env 픽스처 주입
- `{NODE_ENV:"development", TRAIL_DEV_LOGIN:"on", TRAIL_DEV_LOGIN_EMAIL:"me@x.com"}` + 같은 이메일 → `true`
- 같은 env + **다른 이메일** → `false`
- 같은 env + `TRAIL_DEV_LOGIN_EMAIL` 미설정 → `false` (빈 문자열 일치로 열리지 않는다)
- `VERCEL_ENV:"preview"` → `false` · `VERCEL_ENV:"production"` → `false` · `NODE_ENV:"production"` → `false`
- 대소문자·공백 차이는 일치로 본다 (`" Me@X.com "`)
- 소스 스캔: `.vercelignore`가 `app/auth/dev-signin`을 포함하는지

**기존 테스트 수정 1건 · `tests/trail-recipient-routes.test.ts:14`**

```ts
/* 현재 */ const plan = (ops: unknown[], known = KNOWN) => planRecipientOps(ops, resolve, known);
/* 변경 */ const plan = (ops: unknown[], known = KNOWN, currency = "CAD") => planRecipientOps(ops, resolve, known, currency);
```
+ 케이스 추가: `allocationAmount: 3000`이 CAD에서 `300000` cents, **JPY에서 `3000` cents**가 되는지.
*지금 이 스위트에 통화 케이스가 하나도 없다는 것이 이 버그가 서버까지 살아 있는 이유다.*

---

## 검증 방법

### 자동

```bash
npm run lint          # A~F 전부
npm test              # 기준선 230 → 목표 260 내외, fail 0
npm run build         # ★ E의 진짜 검증. money/price 인자 필수화로 남은 호출 지점이 여기서 전부 드러난다
```

`npm run build`를 **E의 각 단계마다** 돌린다. E-3(시그니처 변경) 직후의 에러 목록이 곧 E-4의 작업 목록이다.

### Supabase (F 전용)

1. `apply_migration("0020_trip_columns_are_not_all_writable", …)`
2. `get_advisors({ type: "security" })` → **신규 지적 0건 확인.** 함수 2개의 `search_path` 경고가 뜨면 `set search_path = ''` 누락이다
3. `get_advisors({ type: "performance" })` → 트리거 2개는 인덱스에 영향 없음. 참고용

### 수동 — 자동으로 잡히지 않는 것

| # | 확인 | 방법 | 합격 기준 |
| --- | --- | --- | --- |
| M1 | **엔화 여행 전 구간** | 온보딩에서 `JPY` · 총액 `30000`으로 여행 생성 → 지갑 → 구매 기록 → 배분 → 배송 결제 | 지갑이 `JPY ¥30,000`, `¥300`이 아니다. 구매에 `1200` 입력 → 목록에 `¥1,200`, `¥120,000` 아님. 예산 초과 경고가 안 뜬다 |
| M2 | **원화 · 유로 표기** | 같은 절차를 `KRW` `EUR`로 | `KRW ₩30,000` (소수점 없음) · `EUR €250.50` |
| M3 | **승인 화면 금액 일치** | `/trail/plan/approval`의 diff 3버킷과 실제 청구액 | 표시 금액 = 청구 금액 (결제 규칙) |
| M4 | **컬럼 잠금이 실제로 걸렸는지** | 브라우저 콘솔에서 `supabaseClient().from('trips').update({status:'active'}).eq('id', …)` | `42501 permission denied for column status`. `{city:'Osaka'}`는 성공 |
| M5 | **호텔 변경 → 확인 해제** | SQL로 `hotel_verified_at`을 채운 뒤 앱에서 호텔명 변경 | `hotel_verified_at`이 `null`로 돌아온다 |
| M6 | **통화 동결** | 구매 1건이 있는 여행에 service_role로 `update trips set currency='USD'` | `currency_locked` 예외 |
| M7 | **프로덕션 빌드의 두 라우트** | `NODE_ENV=production npm run build && npm start` → `/auth/dev-signin` · `/workflow` | 둘 다 404 |
| M8 | **Vercel 프리뷰** | 프리뷰 배포 후 두 URL + `TRAIL_DEV_LOGIN=on`을 프리뷰 env에 일부러 넣어 재확인 | 여전히 404 (`VERCEL_ENV` 자물쇠). `.vercelignore`가 먹었다면 배포 파일 목록에 `dev-signin` 없음 |
| M9 | **포커스 링 4곳** | Tab만으로 `/ask`(chat-input) · `/trips`(profile-form) · 설정 카드 · `/login` | 네 곳 모두 3px 링. **Safari(macOS/iOS)에서도** — `:focus-visible` 판정이 Chrome과 다르다 |
| M10 | **마우스 클릭에는 링 없음** | 같은 네 곳을 클릭 | 링 없음 (원래 의도 보존) |
| M11 | **프래그먼트 주입** | `/login#error=access_denied&error_description=Your+account+is+locked.+Call+1-800-555-0100` | 우리 문장만. 전화번호가 DOM에 없다 |
| M12 | **로고 무게** | 네트워크 탭에서 `/login` 로고 응답 | 원본 200 KB대가 아니라 10 KB 내외 |

---

## G0가 남기는 인계 메모

| 받는 그룹 | 내용 |
| --- | --- |
| **G1** | `--focus`/`--focus-on-dark`의 대비를 다크 전환에서 재확인. `outline:0`을 되살리면 T3가 깨진다 — 그건 실수라는 신호다. `public/og.png` 1.33 MB 재압축 |
| **G2** | `docs/MIGRATION_PLAN.md:88`의 `/workflow` 검증 항목은 G0가 제거했다. `/workflow`는 배포본에 없다 |
| **G3** | §F-3 표 전체. 마이그레이션은 `0021`부터. `trips` INSERT는 아직 브라우저에 열려 있고 그건 지갑 없는 여행을 만들 수 있다는 뜻이다 |
| **G4** | `BUDGET_MIN=40`/`BUDGET_MAX=300`과 `ask/brief`의 슬라이더 범위는 통화 무관 상수다. 엔화에서 무의미하다. 단위 변환은 G0가 고쳤고 **범위는 안 고쳤다** |
| **G5** | `hotel_verified_at`은 이제 브라우저가 못 쓴다. 호텔 확인 경로는 서버 라우트여야 한다. 0020의 트리거가 호텔 변경 시 자동으로 해제한다 |
| **G6** | 공유는 `trips` 소유권을 건드린다. 0020의 컬럼 GRANT는 `authenticated` 전체에 걸린 것이지 소유자 한정이 아니다 — 초대받은 사람도 같은 컬럼 집합을 쓴다는 뜻이고, RLS 정책이 그 위에서 행을 거른다 |


---

## 실행 결과 (2026-08-18)

`npm run build` ✅ · `npm run lint` ✅ · `npm test` **289 passing / 0 fail** (기준선 259 — 이 작업 트리에는
설문 세션의 `survey.test.ts`가 이미 들어와 있어 계획서의 230이 아니다).

### 계획과 달라진 점

| # | 계획 | 실제 | 이유 |
| --- | --- | --- | --- |
| A-2 | `docs/brand/logo-source.png`에서 132px를 뽑는다, 8~12 KB | `public/logo-mark.png`(512²)를 132²로 축소, **19 KB** | `logo-source.png`는 2016×672 워드마크라 정사각 마크의 원본이 아니다. 208 KB → 19 KB(−91%) |
| B | `outline:0` 4곳 | **6곳** (`onboarding.css` L14·L16 추가) | 계획서의 T3가 `onboarding.css`까지 스캔한다. 두 곳을 안 고치면 T3가 실패한다 — 같은 결함이고 온보딩은 키보드 사용자가 가장 먼저 만나는 폼이다 |
| E-4 | 목록 15파일 | + `app/onboarding/new-trip-form.tsx` | `{currency} ${total}` 4곳. `money()`를 안 써서 컴파일러가 못 잡지만 JPY 여행에서 `JPY $30000`을 출력한다. 통화를 **고르는** 화면이라 가장 눈에 띈다 |
| E-7 | 슬라이더 눈금 `$40`/`$300`은 G4로 | **기호만** `currencySymbol(currency)`로 교체, 범위 40~300은 그대로 | 기호는 단위 버그, 범위는 제품 결정. 후자만 G4에 넘긴다 |
| — | 기존 테스트 수정 1건 | **2건** (`trail-recipient-routes.test.ts` + `trail-approval-screens.test.ts`) | 후자의 `assert.match(people, /Math\.round\(Number\(amount\) \* 100\)/)`은 "타이핑한 숫자를 그대로 저장한다"를 CAD 리터럴로 표현한 것이었다. 의도를 `toMinor(Number(value), currency)`로 옮기고 `* 100` 금지 단언을 **추가**했다 |
| 새 테스트 | T1~T4 4벌 | **5벌** (+ `tests/trail-trip-grants.test.ts`) | 마이그레이션의 컬럼 GRANT와 `TRIP_WRITABLE`이 갈라지면 런타임 42501이 유일한 신호였다. G3이 `0021`에서 `timezone`을 GRANT하는 순간 이 테스트가 클라이언트 목록도 고치라고 말한다 |
| F | `apply_migration`까지 | **SQL 파일까지.** 원격 미적용 | 사용자 지시. `get_advisors` 확인도 적용과 함께 남아 있다 |

### 남은 일 — G0 범위인데 못 한 것

- **`0020` 원격 적용 + `get_advisors`.** 지시대로 보류. 적용 전까지 M4·M5·M6은 확인할 수 없다.
- **M8 (Vercel 프리뷰).** `.vercelignore`가 실제로 `app/auth/dev-signin`을 뺐는지는 로컬 빌드로
  확인이 불가능하다 — 라우트가 엔트리 포인트라 import가 없고, 파일이 사라져도 빌드는 통과한다.
  `tests/trail-deploy-guard.test.ts`가 오타만 잡는다. 프리뷰 배포에서 눈으로 봐야 한다.
- **M1·M2·M9~M12 수동 확인.** 브라우저에서만 가능하다.
