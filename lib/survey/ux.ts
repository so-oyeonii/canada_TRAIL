import type { Survey } from "./types";

/** The wireframe usability instrument. Mirrors docs/surveys/UX_SURVEY.md; that
 *  file keeps the analysis notes and failure thresholds, this one keeps only
 *  what a respondent sees.
 *
 *  Two questions here are scored right/wrong rather than rated, and they are the
 *  reason the study exists:
 *    • `t4_remaining` — the wallet either communicates that flexible money is
 *      locked, or it does not. A Likert item cannot tell us which.
 *    • `e1`/`e2`/`e3` — the approval gate and "Request is an enquiry" are
 *      product rules. If they do not survive contact with a stranger's eyes,
 *      they are not rules, they are comments in a spec.
 *  Nothing in the respondent-facing text hints at a correct answer. */

const AGREE = { min: 1, max: 7, low: "전혀 아니다", high: "매우 그렇다" } as const;
const EASY = { min: 1, max: 7, low: "매우 어려웠다", high: "매우 쉬웠다" } as const;

/** The wallet numbers the T4 task is scored against. If the frame in
 *  /public/survey/f8.png shows different figures, change them here and the
 *  prompt, the placeholder and the export header all follow. */
export const WALLET = { planned: 210, spent: 176, flexible: 31, reserved: 9, answer: 34 };

const taskTail = (id: string) => [
  { id: `${id}_done`, kind: "single" as const, prompt: "이 과업을 끝냈습니까?", choices: [
    { value: "done", label: "끝냈다" },
    { value: "unsure", label: "끝냈다고 생각하지만 확신이 없다" },
    { value: "failed", label: "못 찾았다" },
  ] },
  { id: `${id}_seq`, kind: "scale" as const, prompt: "이 과업은 얼마나 쉬웠습니까?", ...EASY },
  { id: `${id}_note`, kind: "text" as const, long: true, optional: true, prompt: "헷갈리거나 예상과 달랐던 부분이 있었다면 적어 주세요.", placeholder: "선택 입력" },
];

export const uxSurvey: Survey = {
  key: "ux",
  title: "TRAIL 사용성 조사",
  lede: "여행 중 산 물건을 호텔로 보내주는 앱의 화면을 함께 봐 주세요.",
  minutes: "약 18분",
  anonymity: "익명입니다. 이름·이메일·IP를 저장하지 않습니다.",
  intro: [
    "출시 전 서비스의 화면을 보고, 화면만으로 무엇을 할 수 있는지 답해 주시는 조사입니다.",
    "정답을 맞히는 시험이 아닙니다. 화면이 헷갈리면 그건 화면의 문제이고, 저희가 찾으려는 게 정확히 그것입니다.",
    "중간에 언제든 창을 닫으셔도 되고, 다시 열면 답하던 곳부터 이어집니다.",
  ],
  closing: "끝까지 답해 주셔서 감사합니다. 남겨주신 내용은 화면을 고치는 데 그대로 쓰입니다. 베타 테스터로 참여하고 싶으시면 이 조사와는 별도로 연락처를 받고 있으니, 조사를 안내받은 경로로 알려 주세요.",
  screenedOutMessage: "이번 조사는 최근 해외에서 숙박하며 쇼핑한 분들을 대상으로 합니다. 시간 내주셔서 감사합니다.",

  sections: [
    {
      id: "consent",
      title: "조사 참여 동의",
      note: "응답은 익명으로 처리되며, 통계 목적으로만 사용됩니다. 언제든 중단할 수 있고 중단해도 불이익이 없습니다.",
      questions: [
        { id: "consent", kind: "consent", prompt: "위 내용을 확인했습니다.", label: "조사 참여에 동의합니다" },
      ],
    },

    {
      id: "screener",
      title: "몇 가지 확인",
      questions: [
        { id: "s1", kind: "single", prompt: "최근 3년 이내에 해외로 1박 이상 여행한 적이 있습니까?", choices: [
          { value: "yes", label: "있다" }, { value: "no", label: "없다", terminate: true } ] },
        { id: "s2", kind: "single", prompt: "그 여행 중 현지 매장에서 물건을 산 적이 있습니까? (면세점 제외)", choices: [
          { value: "yes", label: "있다" }, { value: "no", label: "없다", terminate: true } ] },
        { id: "s3", kind: "multi", prompt: "다음 중 경험한 것을 모두 골라 주세요.", choices: [
          { value: "carried", label: "산 물건을 들고 다니느라 남은 일정이 불편했다" },
          { value: "gaveup", label: "무겁거나 깨질 것 같아서 사려던 걸 포기했다" },
          { value: "backtohotel", label: "짐을 맡기려고 숙소에 갔다가 다시 나왔다" },
          { value: "luggage", label: "유료 짐보관 서비스(Bounce, Stasher 등)를 써 봤다" },
          { value: "none", label: "위 어느 것도 해당하지 않는다", exclusive: true } ] },
        { id: "s4", kind: "single", prompt: "여행 중 하루 쇼핑 예산은 보통 어느 정도입니까?", choices: [
          { value: "u5", label: "5만원 미만" }, { value: "5-15", label: "5–15만원" }, { value: "15-30", label: "15–30만원" },
          { value: "30-50", label: "30–50만원" }, { value: "o50", label: "50만원 이상" } ] },
        { id: "s5", kind: "single", prompt: "여행 계획을 짤 때 AI 챗봇(ChatGPT 등)을 써 본 적이 있습니까?", choices: [
          { value: "often", label: "자주" }, { value: "sometimes", label: "가끔" }, { value: "rarely", label: "한두 번" }, { value: "never", label: "없다" } ] },
      ],
    },

    {
      id: "demo",
      title: "응답자 정보",
      note: "통계 처리에만 씁니다.",
      questions: [
        { id: "d1", kind: "single", prompt: "연령대", choices: ["10대", "20대", "30대", "40대", "50대", "60대 이상"].map((l) => ({ value: l, label: l })) },
        { id: "d2", kind: "single", prompt: "성별", choices: [
          { value: "f", label: "여성" }, { value: "m", label: "남성" }, { value: "other", label: "그 외" }, { value: "na", label: "답하지 않음" } ] },
        { id: "d3", kind: "single", prompt: "여행은 주로 누구와 갑니까?", choices: [
          { value: "solo", label: "혼자" }, { value: "couple", label: "연인·배우자" }, { value: "friends", label: "친구" }, { value: "family", label: "가족" }, { value: "group", label: "단체" } ] },
      ],
    },

    {
      id: "before",
      title: "여행 중 쇼핑, 지금은 어떻습니까",
      note: "화면을 보기 전에, 평소 경험을 먼저 여쭙니다.",
      questions: [
        { id: "b1", kind: "matrix", prompt: "아래 각 상황이 여행 중 얼마나 성가셨습니까?", ...AGREE, na: "해당 없음", rows: [
          { id: "carry", label: "산 물건을 들고 다니는 것" },
          { id: "choose", label: "선물 살 사람이 여럿일 때 뭘 살지 정하는 것" },
          { id: "budget", label: "쇼핑 예산이 얼마나 남았는지 파악하는 것" },
          { id: "route", label: "매장 위치와 영업시간을 확인하며 동선을 짜는 것" } ] },
        { id: "b2", kind: "text", long: true, optional: true, prompt: "지금은 이 문제들을 어떻게 해결하고 계십니까?", placeholder: "선택 입력" },
      ],
    },

    {
      id: "first",
      title: "첫인상",
      note: "아래 화면이 5초간 보였다가 사라집니다. 기억나는 대로 답해 주세요.",
      stimuli: [{ slot: "f1", caption: "홈 화면", timedSeconds: 5 }],
      questions: [
        { id: "c1", kind: "text", long: true, prompt: "방금 본 화면은 무엇을 하는 서비스로 보였습니까?" },
        { id: "c2", kind: "text", prompt: "가장 먼저 눈에 들어온 것은 무엇이었습니까?" },
        { id: "c3", kind: "scale", prompt: "이 서비스가 나에게 필요할 것 같습니까?", ...AGREE },
      ],
    },

    {
      id: "t1",
      title: "과업 1 — 여행과 예산 등록",
      note: "다음 주 토론토에 3일간 갑니다. 이 앱에 그 여행을 등록하고, 쇼핑에 쓸 돈의 상한을 정한다고 생각하고 아래 화면을 봐 주세요.",
      stimuli: [{ slot: "f2", caption: "시작 화면" }, { slot: "f3", caption: "질문에 답하는 화면" }],
      questions: [
        ...taskTail("t1"),
        { id: "t1_mode", kind: "single", prompt: "앱이 대화로 하나씩 물어보는 방식은, 입력칸에 직접 적는 방식과 비교해 어땠습니까?", choices: [
          { value: "chat2", label: "대화가 훨씬 낫다" }, { value: "chat1", label: "대화가 조금 낫다" }, { value: "same", label: "비슷하다" },
          { value: "form1", label: "폼이 조금 낫다" }, { value: "form2", label: "폼이 훨씬 낫다" } ] },
        { id: "t1_count", kind: "single", prompt: "질문 개수는 어땠습니까?", choices: [
          { value: "few", label: "너무 적다" }, { value: "ok", label: "적당하다" }, { value: "many", label: "너무 많다" } ] },
        { id: "t1_uncomfortable", kind: "multi", prompt: "대답하기 불편하거나 답하기 싫었던 질문이 있었습니까?", choices: [
          { value: "city", label: "어느 도시에 가는지" }, { value: "dates", label: "언제 가는지" }, { value: "who", label: "누구를 위해 사는지" },
          { value: "budget", label: "총 예산" }, { value: "hotel", label: "어느 숙소에 묵는지" }, { value: "taste", label: "취향" },
          { value: "none", label: "없다", exclusive: true } ] },
      ],
    },

    {
      id: "t2",
      title: "과업 2 — 계획 확인과 수정",
      note: "앱이 만들어 준 계획을 확인하고, 그중 한 사람에게 줄 선물을 다른 것으로 바꾼다고 생각해 주세요.",
      stimuli: [{ slot: "f5", caption: "대화와 계획 요약" }, { slot: "f6", caption: "선물 목록" }],
      questions: [
        ...taskTail("t2"),
        { id: "t2_accurate", kind: "scale", prompt: "계획 요약 카드의 내용이 내가 말한 것을 정확히 반영했다고 느꼈습니까?", ...AGREE },
        { id: "t2_instock", kind: "scale", prompt: "추천된 상품이 실제로 그 매장에 있을 것 같다고 느꼈습니까?", ...AGREE },
        { id: "t2_why", kind: "text", long: true, showIf: { q: "t2_instock", has: ["1", "2", "3", "4"] }, prompt: "그렇게 느끼지 않은 이유는 무엇입니까?" },
        { id: "t2_edit", kind: "single", prompt: "계획을 바꾸고 싶을 때 어느 쪽을 쓰시겠습니까?", choices: [
          { value: "edit", label: "직접 수정한다" }, { value: "ai", label: "AI에게 말한다" }, { value: "depends", label: "상황에 따라 다르다" } ] },
      ],
    },

    {
      id: "t3",
      title: "과업 3 — 동선 확인",
      note: "오늘 몇 군데를 들러야 하는지, 그리고 그 순서를 확인한다고 생각해 주세요.",
      stimuli: [{ slot: "f7", caption: "오늘의 경로" }],
      questions: [
        ...taskTail("t3"),
        { id: "t3_source", kind: "single", prompt: "어느 쪽에서 정보를 얻으셨습니까?", choices: [
          { value: "map", label: "지도" }, { value: "list", label: "아래 목록" }, { value: "both", label: "둘 다" }, { value: "neither", label: "둘 다 잘 읽히지 않았다" } ] },
        { id: "t3_follow", kind: "scale", prompt: "이 동선을 실제로 따라다닐 의향이 있습니까?", ...AGREE },
        { id: "t3_missing", kind: "text", long: true, optional: true, prompt: "동선을 보고 더 알고 싶었지만 화면에 없던 정보가 있습니까?", placeholder: "선택 입력" },
      ],
    },

    {
      id: "t4",
      title: "과업 4 — 예산 확인",
      note: "이 화면을 보고, 지금 이 여행에서 앞으로 쇼핑에 더 쓸 수 있는 금액이 얼마인지 답해 주세요.",
      stimuli: [{ slot: "f8", caption: "여행 지갑" }],
      questions: [
        { id: "t4_remaining", kind: "number", prompt: "앞으로 쇼핑에 더 쓸 수 있는 금액은 얼마입니까?", unit: "CAD $", min: 0, max: 100000 },
        { id: "t4_confidence", kind: "scale", prompt: "그 금액에 얼마나 확신이 있습니까?", min: 1, max: 7, low: "전혀 없다", high: "매우 확신한다" },
        { id: "t4_flexible", kind: "text", prompt: `화면의 'Flexible CAD $${WALLET.flexible}'은 어떤 돈이라고 이해하셨습니까?` },
        { id: "t4_reserved", kind: "text", prompt: `화면의 'Reserved for delivery CAD $${WALLET.reserved}'은 어떤 돈이라고 이해하셨습니까?` },
        { id: "t4_drop", kind: "multi", prompt: "이 화면의 항목 중 없어도 될 것 같은 항목이 있습니까?", choices: [
          { value: "total", label: "Total budget" }, { value: "planned", label: "Planned shopping" }, { value: "spent", label: "Spent" },
          { value: "reserved", label: "Reserved for delivery" }, { value: "flexible", label: "Flexible" },
          { value: "none", label: "없다", exclusive: true } ] },
        ...taskTail("t4"),
      ],
    },

    {
      id: "t5",
      title: "과업 5 — 짐 보내기",
      note: "쇼핑백 3개가 생겼습니다. 이걸 직접 들고 다니지 않고 숙소로 보낸다고 생각해 주세요.",
      stimuli: [{ slot: "f9", caption: "배송 화면" }, { slot: "f10", caption: "결제 화면" }, { slot: "f11", caption: "짐 맡기는 화면" }],
      questions: [
        ...taskTail("t5"),
        { id: "t5_partner", kind: "single", prompt: "화면에 나온 'Blue Banana Market'은 무엇이라고 이해하셨습니까?", choices: [
          { value: "dropoff", label: "짐을 맡기는 곳" }, { value: "shop", label: "선물을 사는 매장" }, { value: "carrier", label: "배송 회사" }, { value: "unsure", label: "잘 모르겠다" } ] },
        { id: "t5_when", kind: "single", prompt: "배송비 CAD $9는 언제 청구된다고 이해하셨습니까?", choices: [
          { value: "now", label: "지금" }, { value: "dropoff", label: "짐을 맡길 때" }, { value: "arrival", label: "호텔에 도착한 뒤" }, { value: "unsure", label: "모르겠다" } ] },
        { id: "t5_qr", kind: "scale", prompt: "QR 화면의 안내만 보고 매장에서 무엇을 해야 할지 알겠습니까?", min: 1, max: 7, low: "전혀 모르겠다", high: "매우 명확하다" },
        { id: "t5_worry", kind: "multi", prompt: "이 단계에서 불안하게 느껴진 것을 모두 골라 주세요.", choices: [
          { value: "lost", label: "짐이 분실될까 봐" }, { value: "staff", label: "매장 직원이 이 서비스를 모를까 봐" },
          { value: "hotel", label: "호텔이 받아주지 않을까 봐" }, { value: "pay", label: "결제가 잘못될까 봐" },
          { value: "late", label: "시간 안에 도착하지 않을까 봐" },
          { value: "none", label: "특별히 불안하지 않았다", exclusive: true } ] },
      ],
    },

    {
      id: "t6",
      title: "과업 6 — 배송 확인",
      note: "맡긴 짐이 지금 어디쯤 있는지 확인한다고 생각해 주세요.",
      stimuli: [{ slot: "f12", caption: "배송 추적" }],
      questions: [
        { id: "t6_where", kind: "single", prompt: "짐은 지금 어디에 있습니까?", choices: [
          { value: "store", label: "아직 매장에 있다" }, { value: "transit", label: "수거되어 이동 중이다" }, { value: "hotel", label: "호텔에 도착했다" }, { value: "unsure", label: "모르겠다" } ] },
        { id: "t6_calm", kind: "scale", prompt: "이 화면을 보고 얼마나 안심이 됩니까?", min: 1, max: 7, low: "전혀 안심되지 않는다", high: "매우 안심된다" },
        { id: "t6_more", kind: "multi", prompt: "여기에 추가로 있어야 한다고 생각하는 정보는?", choices: [
          { value: "driver", label: "기사 이름·연락처" }, { value: "live", label: "실시간 위치 지도" }, { value: "photo", label: "사진 인증" },
          { value: "desk", label: "호텔에서 받은 사람 이름" }, { value: "none", label: "없다", exclusive: true } ] },
        ...taskTail("t6"),
      ],
    },

    {
      id: "concepts",
      title: "화면을 보고 이해한 것",
      note: "정답을 맞히는 문항이 아닙니다. 화면만 보고 그렇게 이해되셨다면 그대로 골라 주세요.",
      questions: [
        { id: "e1", kind: "single", prompt: "상품 옆의 'Request' 버튼을 누르면 어떻게 된다고 이해하셨습니까?", choices: [
          { value: "order", label: "주문된다" }, { value: "reserve", label: "예약된다" },
          { value: "enquiry", label: "매장에 재고가 있는지 문의된다" }, { value: "unsure", label: "모르겠다" } ] },
        { id: "e2", kind: "single", prompt: "물건값은 누가 결제합니까?", choices: [
          { value: "app", label: "앱이 대신 결제한다" }, { value: "me", label: "내가 매장에서 직접 결제한다" },
          { value: "hotel", label: "호텔이 대신 낸다" }, { value: "unsure", label: "모르겠다" } ] },
        { id: "e3", kind: "single", prompt: "실제 가격이 계획보다 비싸서 예산을 넘겼습니다. 앱은 어떻게 한다고 이해하셨습니까?", choices: [
          { value: "auto", label: "알아서 다른 항목 예산을 줄인다" },
          { value: "propose", label: "새 배분을 제안하고 내 승인을 기다린다" },
          { value: "delete", label: "항목을 자동으로 지운다" }, { value: "unsure", label: "모르겠다" } ] },
        { id: "e4", kind: "single", prompt: "화면 어딘가에 'Sample' 또는 'Simulated'이라고 표시된 것을 보셨습니까?", choices: [
          { value: "yes", label: "봤다" }, { value: "no", label: "못 봤다" }, { value: "unsure", label: "기억나지 않는다" } ] },
        { id: "e4_where", kind: "text", showIf: { q: "e4", has: ["yes"] }, prompt: "어느 화면에서 보셨습니까?" },
        { id: "e5", kind: "multi", prompt: "이 앱이 내 승인 없이 스스로 해도 괜찮다고 생각하는 것을 모두 골라 주세요.", choices: [
          { value: "recommend", label: "상품 추천" }, { value: "route", label: "동선 다시 계산" }, { value: "rebalance", label: "예산 다시 배분" },
          { value: "remove", label: "항목 삭제" }, { value: "swap", label: "대체 상품으로 교체" }, { value: "delivery", label: "배송 신청" },
          { value: "pay", label: "결제" }, { value: "none", label: "아무것도 없다", exclusive: true } ] },
      ],
    },

    {
      id: "scales",
      title: "전체적으로",
      questions: [
        { id: "umux", kind: "matrix", prompt: "다음에 얼마나 동의하십니까?", ...AGREE, rows: [
          { id: "needs", label: "이 앱의 기능은 내 필요를 충족한다" },
          { id: "easy", label: "이 앱은 쓰기 쉽다" } ] },
        { id: "trust", kind: "matrix", prompt: "다음에 얼마나 동의하십니까?", ...AGREE, rows: [
          { id: "stock", label: "이 앱이 추천한 상품이 실제로 매장에 있을 것이다" },
          { id: "lost", label: "이 앱에 짐을 맡겨도 잃어버리지 않을 것이다" },
          { id: "money", label: "이 앱은 내 돈을 내 허락 없이 쓰지 않을 것이다" },
          { id: "eta", label: "이 앱이 보여주는 도착 예정 시각은 믿을 만하다" },
          { id: "honest", label: "이 앱은 못 하는 것을 할 수 있다고 말하지 않는다" } ] },
        { id: "ai", kind: "matrix", prompt: "AI와의 대화에 대해 답해 주세요.", ...AGREE, rows: [
          { id: "understood", label: "AI가 내 선물 취향을 이해했다고 느꼈다" },
          { id: "necessary", label: "AI가 물어본 질문들은 필요한 질문이었다" },
          { id: "madeup", label: "AI가 지어낸 것 같은 정보가 있었다" } ] },
      ],
    },

    {
      id: "failures",
      title: "이런 일이 생긴다면",
      note: "실제로 일어날 수 있는 상황입니다. 앱이 어떻게 해 주길 바라는지 적어 주세요.",
      questions: [
        { id: "f1", kind: "text", long: true, prompt: "\"조건에 맞는 상품을 찾지 못했습니다.\" — 앱이 어떻게 해 주길 바라십니까?" },
        { id: "f2", kind: "text", long: true, prompt: "\"매장에서 실제 가격이 계획보다 CAD $40 비쌌습니다.\" — 어떻게 해 주길 바라십니까?" },
        { id: "f3", kind: "single", prompt: "\"오늘 이 짐은 배송할 수 없습니다.\" — 이 사실을 언제 알아야 합니까?", choices: [
          { value: "before", label: "짐을 맡기기 전" }, { value: "after", label: "맡긴 직후" },
          { value: "eta", label: "배송 예정 시각 전까지만" }, { value: "any", label: "상관없다" } ] },
        { id: "f4", kind: "text", long: true, prompt: "\"호텔 프런트가 짐 수령을 거부했습니다.\" — 다음으로 무엇을 기대하십니까?" },
        { id: "f5", kind: "single", prompt: "위 네 상황 중, 실제로 겪는다면 이 서비스를 다시 안 쓸 것 같은 것은?", choices: [
          { value: "nomatch", label: "상품을 못 찾음" }, { value: "overbudget", label: "예산 초과" },
          { value: "nodelivery", label: "배송 불가" }, { value: "refused", label: "호텔 수령 거부" },
          { value: "none", label: "그래도 계속 쓸 것 같다" } ] },
      ],
    },

    {
      id: "price",
      title: "가격",
      note: "쇼핑백 3개(약 2.4kg)를 매장에서 숙소까지 그날 저녁에 배송해 주는 서비스입니다. 원 단위로 적어 주세요.",
      questions: [
        { id: "p_expensive", kind: "number", prompt: "너무 비싸서 쓰지 않을 가격은 얼마입니까?", unit: "원", min: 0, max: 1000000 },
        { id: "p_pricey", kind: "number", prompt: "비싸다고 느끼지만 고민은 해 볼 가격은?", unit: "원", min: 0, max: 1000000 },
        { id: "p_cheap", kind: "number", prompt: "싸다고 느껴 이득이라 생각할 가격은?", unit: "원", min: 0, max: 1000000 },
        { id: "p_toocheap", kind: "number", prompt: "너무 싸서 오히려 품질이 의심스러울 가격은?", unit: "원", min: 0, max: 1000000 },
        { id: "p_intent", kind: "scale", prompt: "이 서비스가 CAD $9(약 9,000원)라면 쓰시겠습니까?", min: 1, max: 7, low: "전혀 안 쓴다", high: "반드시 쓴다" },
        { id: "p_who", kind: "single", prompt: "이 비용은 누가 내는 게 자연스럽다고 생각하십니까?", choices: [
          { value: "me", label: "내가 전액" }, { value: "split", label: "내가 일부, 매장이 일부" },
          { value: "store", label: "매장이 전액" }, { value: "hotel", label: "호텔이 전액" }, { value: "unsure", label: "잘 모르겠다" } ] },
      ],
    },

    {
      id: "close",
      title: "마지막으로",
      questions: [
        { id: "nps", kind: "scale", prompt: "이 서비스를 여행 가는 친구에게 추천하시겠습니까?", min: 0, max: 10, low: "전혀 아니다", high: "매우 그렇다" },
        { id: "liked", kind: "text", long: true, prompt: "이 앱에서 가장 마음에 든 것 하나를 적어 주세요." },
        { id: "fix", kind: "text", long: true, prompt: "하나만 고칠 수 있다면 무엇을 고치시겠습니까?" },
        { id: "missing", kind: "text", long: true, optional: true, prompt: "있을 줄 알았는데 없었던 기능이 있습니까?", placeholder: "선택 입력" },
        // No contact field: the anonymity promise at the top of this survey is
        // only true if nothing here can identify a respondent. Intent is the
        // measure; recruiting happens through the address in `closing`.
        { id: "beta", kind: "single", prompt: "이 서비스가 출시되면 베타 테스터로 참여할 의향이 있습니까?", choices: [
          { value: "yes", label: "있다" }, { value: "maybe", label: "조건에 따라" }, { value: "no", label: "없다" } ] },
      ],
    },
  ],
};
