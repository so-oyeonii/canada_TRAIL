import type { Survey } from "./types";

/** The internal alignment instrument. Mirrors docs/surveys/TEAM_BUILD_SURVEY.md.
 *
 *  The headline measure is `status` — the same fifteen build items judged by
 *  everyone, from memory, without opening the docs. Agreement is the finding;
 *  the mean is meaningless. A team that cannot agree on what already works is
 *  not disagreeing about priorities, it is building two different products.
 *
 *  Which is why this survey stores nothing that identifies a respondent, not
 *  even the role→answer join that a small team makes re-identifying trivial:
 *  `role` is asked, but §9 exists only because the answers cannot be traced. */

const AGREE = { min: 1, max: 7, low: "전혀 아니다", high: "매우 그렇다" } as const;

const STATUS = [
  { value: "works", label: "동작한다 — 지금 써 볼 수 있다" },
  { value: "unwired", label: "코드는 있으나 화면에 안 붙었다" },
  { value: "designonly", label: "디자인·문서만 있다" },
  { value: "none", label: "아예 없다" },
  { value: "unknown", label: "모른다" },
];

const BUILD_ITEMS = [
  { id: "p01", label: "여행 등록 → 수령인 등록 → 예산 배분이 서버에 저장된다" },
  { id: "p02", label: "Trail AI 대화가 구조화된 brief로 바뀐다" },
  { id: "p03", label: "AI가 말하는 매장 이름이 실재하는 매장이다" },
  { id: "p04", label: "예산 초과 시 승인 게이트가 DB 권한으로 강제된다" },
  { id: "p05", label: "매장에서 구매를 기록하면 실제 지출에 반영된다" },
  { id: "p06", label: "지도 탭이 실제 지도·경로로 동작한다" },
  { id: "p07", label: "배송 결제가 실제 돈을 움직인다" },
  { id: "p08", label: "배송 상태가 시스템에 의해 자동으로 올라간다" },
  { id: "p09", label: "파트너 매장에서 QR·태그를 붙이는 절차가 코드로 존재한다" },
  { id: "p10", label: "오프라인(비행기 모드)에서 QR 패스를 쓸 수 있다" },
  { id: "p11", label: "로그인이 실제로 동작한다" },
  { id: "p12", label: "앱이 공개 URL로 배포되어 있다" },
  { id: "p13", label: "계약된 파트너 매장이 한 곳 이상 있다" },
  { id: "p14", label: "계약된 호텔이 한 곳 이상 있다" },
  { id: "p15", label: "실제로 완료된 배송이 한 건 이상 있다" },
];

const WORK_ITEMS = [
  { id: "deploy", label: "A. 공개 배포 — 지금 만든 게 URL로 열리게" },
  { id: "catalog", label: "B. 매장·상품 실데이터 카탈로그 (AI 환각 제거)" },
  { id: "map", label: "C. 지도 탭 실구현" },
  { id: "pwa", label: "D. 웹앱(PWA) + 오프라인 QR 패스" },
  { id: "custody", label: "E. 파트너 커스터디 쓰기 경로" },
  { id: "payment", label: "F. 실제 결제 연동" },
  { id: "partner", label: "G. 파트너 매장·호텔 1곳 계약" },
  { id: "delivery1", label: "H. 실제 배송 1건 실행" },
  { id: "polish", label: "I. UI 완성도·디자인 정리" },
  { id: "qa", label: "J. 테스트·안정화·버그" },
];

export const teamSurvey: Survey = {
  key: "team",
  title: "TRAIL 팀 내부 점검",
  lede: "와이어프레임을 돌아가는 제품으로 바꾸기 전에, 우리가 같은 것을 보고 있는지 확인합니다.",
  minutes: "약 13분",
  anonymity: "완전 익명입니다. 이름·이메일·IP 어느 것도 저장하지 않습니다.",
  intro: [
    "이 설문의 목적은 평가가 아니라 정렬입니다. 누가 뭘 못 했는지 찾으려는 게 아닙니다.",
    "가장 중요한 부분은 두 번째 화면입니다. 문서를 열지 말고 기억나는 대로 답해 주세요. 모르면 '모른다'가 정답입니다.",
    "결과는 요약하지 않고 숫자와 원문 그대로 팀에 공유합니다.",
  ],
  closing: "고맙습니다. 집계 결과는 마감 다음 날 팀에 그대로 공유됩니다.",
  screenedOutMessage: "응답해 주셔서 감사합니다.",

  sections: [
    {
      id: "consent",
      title: "시작하기 전에",
      note: "이 응답에는 응답자를 특정할 수 있는 정보가 저장되지 않습니다. 역할은 묻지만, 결과는 역할별 집계로만 공유하고 개별 응답과 역할을 함께 공개하지 않습니다.",
      questions: [
        { id: "consent", kind: "consent", prompt: "확인했습니다.", label: "익명 응답 방식에 동의하고 시작합니다" },
      ],
    },

    {
      id: "background",
      title: "응답자 배경",
      questions: [
        { id: "r1", kind: "multi", prompt: "이 프로젝트에서 주로 맡은 역할은?", choices: [
          { value: "product", label: "제품·기획" }, { value: "design", label: "디자인" }, { value: "frontend", label: "프런트 구현" },
          { value: "backend", label: "백엔드·플랫폼" }, { value: "ai", label: "AI·프롬프트" }, { value: "biz", label: "사업·피치" },
          { value: "qa", label: "QA·검수" }, { value: "other", label: "그 외" } ] },
        { id: "r2", kind: "single", prompt: "앞으로 4주간 이 프로젝트에 실제로 쓸 수 있는 시간은 주당 몇 시간입니까?", choices: [
          { value: "u5", label: "5시간 미만" }, { value: "5-10", label: "5–10시간" }, { value: "10-20", label: "10–20시간" },
          { value: "20-35", label: "20–35시간" }, { value: "o35", label: "35시간 이상" } ] },
        { id: "r3", kind: "scale", prompt: "위 시간은 얼마나 확실합니까?", min: 1, max: 7, low: "전혀 확실치 않다", high: "매우 확실하다" },
        { id: "r4", kind: "single", prompt: "최근 2주간 코드나 문서를 실제로 수정한 적이 있습니까?", choices: [
          { value: "yes", label: "있다" }, { value: "no", label: "없다" } ] },
      ],
    },

    {
      id: "what",
      title: "우리가 만드는 게 뭔지",
      questions: [
        { id: "w1", kind: "single", prompt: "TRAIL이 돈을 받는 지점은 어디입니까?", choices: [
          { value: "ai", label: "AI 쇼핑 계획" }, { value: "delivery", label: "매장 → 호텔 짐 이송" },
          { value: "storefee", label: "매장 수수료" }, { value: "hotel", label: "호텔 제휴" }, { value: "undecided", label: "아직 안 정해졌다" } ] },
        { id: "w2", kind: "text", long: true, prompt: "심사위원이 \"이거 결국 뭐 하는 회사예요?\"라고 물으면, 한 문장으로 뭐라고 답하시겠습니까?" },
      ],
    },

    {
      id: "status",
      title: "지금 뭐가 진짜로 되나",
      note: "문서를 열지 말고 기억나는 대로 판정해 주세요. 모르면 '모른다'가 정답입니다. 이 문항의 목적은 정답률이 아니라, 팀의 판정이 서로 갈리는 지점을 찾는 것입니다.",
      questions: [
        { id: "status", kind: "grid", prompt: "각 항목의 현재 상태를 골라 주세요.", rows: BUILD_ITEMS, choices: STATUS },
        { id: "status_verified", kind: "single", prompt: "위 15개 중 본인이 직접 확인해 본 것은 몇 개입니까?", choices: [
          { value: "0", label: "0개" }, { value: "1-3", label: "1–3개" }, { value: "4-7", label: "4–7개" },
          { value: "8-11", label: "8–11개" }, { value: "12+", label: "12개 이상" } ] },
      ],
    },

    {
      id: "priority",
      title: "다음 4주에 뭘 붙일까",
      note: "합이 정확히 100이 되어야 다음으로 넘어갑니다. 0점을 줘도 됩니다.",
      questions: [
        { id: "points", kind: "points", total: 100, prompt: "아래 항목에 100점을 나눠 주세요.", rows: WORK_ITEMS },
        { id: "must", kind: "multi", max: 3, prompt: "이 중 데모데이 전에 없으면 데모가 성립하지 않는 것을 최대 3개 고르세요.", choices: WORK_ITEMS.map((i) => ({ value: i.id, label: i.label })) },
        { id: "waste", kind: "multi", prompt: "이 중 지금 하면 낭비라고 생각하는 것이 있습니까?", choices: [
          ...WORK_ITEMS.map((i) => ({ value: i.id, label: i.label })), { value: "none", label: "없다", exclusive: true } ] },
        { id: "waste_why", kind: "text", long: true, showIf: { q: "waste", has: WORK_ITEMS.map((i) => i.id) }, prompt: "그렇게 생각하는 이유는?" },
      ],
    },

    {
      id: "confidence",
      title: "자신감과 막힌 곳",
      questions: [
        { id: "cf1", kind: "matrix", prompt: "각 항목이 데모데이까지 완성될 것이라는 자신감을 매겨 주세요.", min: 0, max: 10, low: "전혀 없다", high: "확신한다", na: "모름", rows: [
          { id: "deploy", label: "공개 배포" }, { id: "catalog", label: "실데이터 카탈로그" }, { id: "pwa", label: "오프라인 QR 패스" },
          { id: "map", label: "지도 탭" }, { id: "partner", label: "파트너 1곳 확보" }, { id: "delivery1", label: "실제 배송 1건" } ] },
        { id: "cf2", kind: "scale", prompt: "본인이 맡은 부분이 제때 끝날 자신감은?", min: 0, max: 10, low: "전혀 없다", high: "확신한다" },
        { id: "cf3", kind: "multi", showIf: { q: "cf2", has: ["0", "1", "2", "3", "4", "5", "6"] }, prompt: "그 이유는 무엇입니까?", choices: [
          { value: "time", label: "시간이 부족하다" }, { value: "hard", label: "기술적으로 어렵다" }, { value: "unclear", label: "요구사항이 불명확하다" },
          { value: "blocked", label: "다른 사람 작업을 기다리는 중이다" }, { value: "external", label: "외부(계약·API·심사)를 기다린다" },
          { value: "lost", label: "뭘 해야 할지 모르겠다" }, { value: "other", label: "그 외" } ] },
        { id: "cf4", kind: "text", long: true, optional: true, prompt: "지금 다른 사람을 기다리느라 못 하고 있는 일이 있습니까? 무엇을 기다립니까?", placeholder: "선택 입력" },
        { id: "cf5", kind: "text", long: true, optional: true, prompt: "반대로, 내가 늦어서 남을 막고 있는 것이 있습니까?", placeholder: "익명이니 편하게 적어 주세요 · 선택 입력" },
      ],
    },

    {
      id: "decisions",
      title: "아직 안 정해진 것들",
      note: "지금 정하고 넘어가려고 합니다. 각 항목에 본인 의견을 골라 주세요.",
      questions: [
        { id: "dc1", kind: "single", prompt: "로그인 방식", choices: [
          { value: "magic", label: "매직링크 유지" }, { value: "oauth", label: "OAuth(Google 등) 추가" },
          { value: "anon", label: "익명 세션 후 승격" }, { value: "any", label: "상관없다" } ] },
        { id: "dc2", kind: "single", prompt: "AI 메모리 기본값", choices: [
          { value: "on", label: "켜짐 (opt-out)" }, { value: "off", label: "꺼짐 (opt-in)" }, { value: "any", label: "상관없다" } ] },
        { id: "dc3", kind: "single", prompt: "통화 표기", choices: [
          { value: "cad", label: "CAD 고정" }, { value: "derive", label: "여행지에서 자동 유도" }, { value: "any", label: "상관없다" } ] },
        { id: "dc4", kind: "single", prompt: "데모에서 배송 상태는 어떻게 올라가야 합니까?", choices: [
          { value: "manual", label: "사람이 버튼으로 올린다 (현재)" }, { value: "sim", label: "시뮬레이터가 자동으로 올린다" },
          { value: "partner", label: "실제 파트너가 올린다" } ] },
        { id: "dc5", kind: "single", prompt: "매장·상품 실데이터가 없을 때 AI는 어떻게 해야 합니까?", choices: [
          { value: "silent", label: "매장 이름을 아예 말하지 않는다" }, { value: "labelled", label: "\"예시\"라고 표시하고 말한다" },
          { value: "asis", label: "지금처럼 말한다" } ] },
        { id: "dc6", kind: "multi", prompt: "위 다섯 개 중 본인이 결정권을 갖고 싶은 것은?", choices: [
          { value: "dc1", label: "로그인 방식" }, { value: "dc2", label: "AI 메모리" }, { value: "dc3", label: "통화" },
          { value: "dc4", label: "배송 상태" }, { value: "dc5", label: "AI의 매장 언급" }, { value: "none", label: "없다", exclusive: true } ] },
      ],
    },

    {
      id: "constitution",
      title: "제품 규칙이 실제로 지켜지고 있나",
      note: "CLAUDE.md의 제품 규칙 6개입니다. 코드에서 실제로 지켜지고 있다고 얼마나 확신하십니까?",
      questions: [
        { id: "gates", kind: "matrix", prompt: "각 규칙에 대한 확신 정도", ...AGREE, na: "모름", rows: [
          { id: "approval", label: "예산 변경·구매·대체·배송은 항상 사용자가 승인한다" },
          { id: "request", label: "Request는 재고 문의일 뿐 주문이 아니다 (화면 카피 포함)" },
          { id: "sample", label: "실데이터가 아닌 것에는 Sample·Simulated 표기가 붙어 있다" },
          { id: "failures", label: "실패 분기 4개가 전부 살아 있다" },
          { id: "cents", label: "금액은 정수 cents이고 지갑 항등식이 DB로 강제된다" },
          { id: "ledger", label: "원장은 append-only이고 신원은 서버에서만 읽는다" } ] },
        { id: "broken", kind: "text", long: true, optional: true, prompt: "위 중 지금 깨져 있다고 생각하는 것이 있습니까? 어디서 깨져 있습니까?", placeholder: "선택 입력" },
        { id: "first_to_go", kind: "single", prompt: "일정 압박이 심해지면 이 중 가장 먼저 타협될 것 같은 규칙은?", choices: [
          { value: "approval", label: "사용자 승인" }, { value: "request", label: "Request는 문의일 뿐" }, { value: "sample", label: "Sample·Simulated 표기" },
          { value: "failures", label: "실패 분기" }, { value: "cents", label: "금액·지갑 항등식" }, { value: "ledger", label: "원장 append-only" },
          { value: "none", label: "타협되지 않을 것이다" } ] },
      ],
    },

    {
      id: "demo",
      title: "데모 시나리오",
      questions: [
        { id: "dm1", kind: "multi", prompt: "심사위원 앞에서 막힘 없이 시연할 수 있다고 생각하는 구간을 모두 고르세요.", choices: [
          { value: "onboarding", label: "온보딩" }, { value: "chat", label: "AI 대화" }, { value: "review", label: "계획 리뷰" },
          { value: "people", label: "수령인·배분" }, { value: "approval", label: "예산 초과 승인" }, { value: "purchase", label: "매장 구매 기록" },
          { value: "arrange", label: "배송 요청" }, { value: "pay", label: "결제" }, { value: "drop", label: "QR 드롭" }, { value: "track", label: "배송 추적" } ] },
        { id: "dm2", kind: "single", prompt: "그중 시연 도중 깨질 확률이 가장 높은 구간은?", choices: [
          { value: "onboarding", label: "온보딩" }, { value: "chat", label: "AI 대화" }, { value: "review", label: "계획 리뷰" },
          { value: "people", label: "수령인·배분" }, { value: "approval", label: "예산 초과 승인" }, { value: "purchase", label: "매장 구매 기록" },
          { value: "arrange", label: "배송 요청" }, { value: "pay", label: "결제" }, { value: "drop", label: "QR 드롭" }, { value: "track", label: "배송 추적" } ] },
        { id: "dm3", kind: "multi", prompt: "데모에서 솔직하게 \"여기는 시뮬레이션입니다\"라고 말해야 한다고 생각하는 구간은?", choices: [
          { value: "chat", label: "AI 대화(매장·상품)" }, { value: "map", label: "지도·동선" }, { value: "pay", label: "결제" },
          { value: "drop", label: "QR 드롭·태그" }, { value: "track", label: "배송 추적" }, { value: "none", label: "없다", exclusive: true } ] },
        { id: "dm4", kind: "text", long: true, prompt: "심사위원이 물었을 때 우리가 가장 답하기 곤란한 질문 하나를 적어 주세요." },
      ],
    },

    {
      id: "risk",
      title: "리스크",
      note: "각 항목의 발생 가능성과, 터졌을 때의 타격을 각각 1–5로 매겨 주세요.",
      questions: [
        { id: "risks", kind: "dual", prompt: "가능성 × 타격", left: "가능성", right: "타격", min: 1, max: 5, rows: [
          { id: "nopartner", label: "파트너 매장을 한 곳도 못 구한다" },
          { id: "hotelrefuse", label: "호텔이 짐 수령을 거부한다" },
          { id: "hallucination", label: "실데이터가 없어 AI가 계속 매장을 지어낸다" },
          { id: "build", label: "배포 직전 빌드·마이그레이션이 깨진다" },
          { id: "people", label: "핵심 인원이 시간을 못 낸다" },
          { id: "liability", label: "짐 분실·파손 시 책임 주체가 없다" },
          { id: "privacy", label: "개인정보·결제 관련 문제" } ] },
        { id: "risk_other", kind: "text", long: true, optional: true, prompt: "위에 없는데 본인이 제일 무서워하는 것이 있습니까?", placeholder: "선택 입력" },
        { id: "risk_mitigation", kind: "text", long: true, prompt: "가장 위험하다고 본 항목에 대해, 다음 2주 안에 할 수 있는 완화책을 하나만 적어 주세요." },
      ],
    },

    {
      id: "team",
      title: "팀",
      questions: [
        { id: "tm", kind: "matrix", prompt: "다음에 얼마나 동의하십니까?", ...AGREE, rows: [
          { id: "clear", label: "내가 지금 뭘 해야 하는지 명확하다" },
          { id: "safe", label: "문제를 발견했을 때 말하기 편하다" },
          { id: "decided", label: "결정이 필요한 것들이 제때 결정된다" },
          { id: "feedback", label: "내가 만든 것에 대해 다른 사람이 피드백을 준다" },
          { id: "pace", label: "지금 속도라면 데모데이에 맞출 수 있다" },
          { id: "sustainable", label: "지금 투입 강도가 지속 가능하다" } ] },
        { id: "unsaid", kind: "text", long: true, prompt: "아무도 말하고 있지 않지만 문제라고 생각하는 것을 하나 적어 주세요.", placeholder: "이 문항 하나 때문에 이 설문이 익명입니다." },
        { id: "one_thing", kind: "text", long: true, prompt: "다음 2주에 팀이 딱 하나만 한다면 뭘 해야 합니까?" },
      ],
    },
  ],
};
