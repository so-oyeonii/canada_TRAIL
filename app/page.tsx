"use client";

import { useMemo, useState } from "react";

type Stage = "plan" | "picks" | "delivery" | "tracking";
type GiftTier = "light" | "balanced" | "special";

type Gift = {
  id: string;
  recipient: string;
  detail: string;
  product: string;
  store: string;
  area: string;
  price: number;
  reason: string;
  mark: string;
  tone: string;
};

const giftSets: Record<GiftTier, Gift[]> = {
  light: [
    { id: "mother-light", recipient: "엄마", detail: "한 분 · 오래 남는 선물", product: "토론토 세라믹 찻잔", store: "Spacing Store", area: "401 Richmond", price: 42, reason: "지역 작가 제품이고 작고 단단해 포장하기 쉬워요.", mark: "01", tone: "clay" },
    { id: "friends-light", recipient: "친구들", detail: "두 분 · 같은 가격대", product: "시티 핀 & 미니 토트 2개", store: "Kid Icarus", area: "Kensington", price: 56, reason: "각자 다른 디자인을 고를 수 있어도 가격은 같아요.", mark: "02", tone: "sky" },
    { id: "team-light", recipient: "연구실", detail: "여럿이 나눠 먹는 선물", product: "메이플 캔디 셰어팩", store: "Blue Banana", area: "Kensington", price: 38, reason: "낱개 포장 24개라 인원수를 따로 셀 필요가 없어요.", mark: "03", tone: "maple" },
  ],
  balanced: [
    { id: "mother-balanced", recipient: "엄마", detail: "한 분 · 오래 남는 선물", product: "온타리오 세라믹 티 세트", store: "Spacing Store", area: "401 Richmond", price: 58, reason: "지역 작가 제품이고 예산 안에서 가장 선물다운 선택이에요.", mark: "01", tone: "clay" },
    { id: "friends-balanced", recipient: "친구들", detail: "두 분 · 같은 가격대", product: "토론토 그래픽 토트 2개", store: "Kid Icarus", area: "Kensington", price: 72, reason: "색은 달라도 단가는 같아 친구 사이에 부담이 없어요.", mark: "02", tone: "sky" },
    { id: "team-balanced", recipient: "연구실", detail: "여럿이 나눠 먹는 선물", product: "메이플 & 초콜릿 박스", store: "Blue Banana", area: "Kensington", price: 54, reason: "개별 포장 30개, 실온 보관이라 귀국 후 바로 나눌 수 있어요.", mark: "03", tone: "maple" },
  ],
  special: [
    { id: "mother-special", recipient: "엄마", detail: "한 분 · 오래 남는 선물", product: "캐나다 울 블랭킷", store: "Spacing Store", area: "401 Richmond", price: 84, reason: "부피를 줄여 포장해 주고, 프리미엄 선물로 오래 쓸 수 있어요.", mark: "01", tone: "clay" },
    { id: "friends-special", recipient: "친구들", detail: "두 분 · 같은 가격대", product: "리미티드 아트 프린트 2점", store: "Kid Icarus", area: "Kensington", price: 96, reason: "같은 컬렉션의 다른 작품이라 의미와 형평성을 모두 챙겨요.", mark: "02", tone: "sky" },
    { id: "team-special", recipient: "연구실", detail: "여럿이 나눠 먹는 선물", product: "캐나다 스낵 큐레이션 박스", store: "Blue Banana", area: "Kensington", price: 68, reason: "짭짤한 맛과 단맛을 섞어 취향이 달라도 함께 즐길 수 있어요.", mark: "03", tone: "maple" },
  ],
};

const steps = [
  { id: "plan", label: "조건 정하기" },
  { id: "picks", label: "상품 고르기" },
  { id: "delivery", label: "배송 맡기기" },
  { id: "tracking", label: "도착 확인" },
] as const;

function Logo() {
  return <div className="logo" aria-label="TRAIL"><span>T</span><b>TRAIL</b><small>SHOP · DROP · GO</small></div>;
}

function Money({ amount }: { amount: number }) {
  return <>{new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(amount)}</>;
}

export default function Home() {
  const [stage, setStage] = useState<Stage>("plan");
  const [budget, setBudget] = useState(200);
  const [selectedIds, setSelectedIds] = useState<string[]>(giftSets.balanced.map((gift) => gift.id));
  const [destination, setDestination] = useState("The Annex Hotel · Front desk");
  const [trackingStep, setTrackingStep] = useState(1);
  const [notice, setNotice] = useState("");

  const tier: GiftTier = budget < 170 ? "light" : budget > 250 ? "special" : "balanced";
  const recommendations = giftSets[tier];
  const selected = recommendations.filter((gift) => selectedIds.includes(gift.id));
  const giftTotal = selected.reduce((sum, gift) => sum + gift.price, 0);
  const deliveryFee = selected.length ? 9 : 0;
  const total = giftTotal + deliveryFee;
  const remaining = budget - total;
  const overBudget = remaining < 0;

  const allocation = useMemo(() => {
    const available = Math.max(budget - 9, 0);
    return [
      { who: "엄마", amount: Math.round(available * .31), color: "var(--apricot)" },
      { who: "친구들", amount: Math.round(available * .38), color: "var(--blue)" },
      { who: "연구실", amount: Math.round(available * .31), color: "var(--yellow)" },
    ];
  }, [budget]);

  const changeBudget = (value: number) => {
    setBudget(value);
    const nextTier: GiftTier = value < 170 ? "light" : value > 250 ? "special" : "balanced";
    setSelectedIds(giftSets[nextTier].map((gift) => gift.id));
    setNotice("예산에 맞춰 추천을 다시 골랐어요.");
    window.setTimeout(() => setNotice(""), 1800);
  };

  const toggleGift = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const go = (next: Stage) => {
    setStage(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <main className="app-shell">
      <header className="global-header">
        <Logo />
        <div className="trip-context"><span className="pulse" />Toronto · 오늘 3시간 <button aria-label="여행 조건 수정" onClick={() => go("plan")}>수정</button></div>
      </header>

      <nav className="stepper" aria-label="쇼핑과 배송 진행 단계">
        {steps.map((step, index) => {
          const activeIndex = steps.findIndex((item) => item.id === stage);
          return <button key={step.id} className={index <= activeIndex ? "active" : ""} onClick={() => index <= activeIndex && go(step.id)} disabled={index > activeIndex}><i>{index < activeIndex ? "✓" : index + 1}</i><span>{step.label}</span></button>;
        })}
      </nav>

      {notice && <div className="toast" role="status">{notice}</div>}

      {stage === "plan" && (
        <section className="page plan-page">
          <div className="intro">
            <p className="eyebrow">TRAIL GIFT PLANNER</p>
            <h1>선물은 잘 고르고,<br /><em>짐은 남기고.</em></h1>
            <p className="lede">누구에게 무엇을 살지부터, 지금 갈 만한 매장과 호텔 배송까지 한 번에 정해드려요.</p>
            <div className="promise-row"><span><b>3</b>명·그룹별 추천</span><span><b>1</b>번만 가방 맡기기</span><span><b>3h</b>안에 끝나는 동선</span></div>
          </div>

          <div className="budget-ticket">
            <div className="ticket-head"><span>오늘의 선물 예산</span><b><Money amount={budget} /></b></div>
            <input className="budget-range" type="range" min="120" max="340" step="10" value={budget} onChange={(event) => changeBudget(Number(event.target.value))} aria-label="총 선물 예산" />
            <div className="range-labels"><span>CAD 120</span><span>CAD 340</span></div>
            <div className="perforation" />
            <div className="allocation-list">
              {allocation.map((item) => <div key={item.who}><span><i style={{ background: item.color }} />{item.who}</span><b>약 <Money amount={item.amount} /></b></div>)}
              <div className="fee-row"><span><i />배송 여유</span><b>CAD 9 포함</b></div>
            </div>
            <p className="ticket-note">관계, 인원수, 포장 난이도를 반영한 추천 배분이에요. 상품을 고르면서 자유롭게 바꿀 수 있어요.</p>
          </div>

          <div className="recipient-panel">
            <div className="section-heading"><span><b>선물할 사람</b><small>이번 여행에서 꼭 챙길 3그룹</small></span><button aria-label="선물할 사람 추가">＋ 추가</button></div>
            <div className="people-row">
              <div><i className="person-icon peach">엄</i><span><b>엄마</b><small>로컬 디자인</small></span><button aria-label="엄마 설정 수정">•••</button></div>
              <div><i className="person-icon blue">친</i><span><b>친구 2명</b><small>각자 하나씩</small></span><button aria-label="친구 설정 수정">•••</button></div>
              <div><i className="person-icon yellow">연</i><span><b>연구실</b><small>나눠 먹기</small></span><button aria-label="연구실 설정 수정">•••</button></div>
            </div>
          </div>

          <button className="primary-cta" onClick={() => go("picks")}><span>예산에 맞는 상품 보기<small>재고가 있고 배송 가능한 매장만 보여드려요</small></span><i>→</i></button>
        </section>
      )}

      {stage === "picks" && (
        <section className="page picks-page">
          <div className="page-title"><div><button className="back" onClick={() => go("plan")}>←</button><p className="eyebrow">예산 맞춤 추천</p><h1>세 곳이면<br /><em>모두 준비돼요.</em></h1></div><div className={`budget-gauge ${overBudget ? "over" : ""}`}><small>남은 예산</small><b><Money amount={remaining} /></b><span><Money amount={total} /> / <Money amount={budget} /></span></div></div>

          <div className="smart-route"><div className="route-line"><i>현재</i><span /><i>1</i><span /><i>2</i><span /><i>3</i><span /><i className="drop">DROP</i></div><div><b>총 1.2 km · 약 1시간 40분</b><small>401 Richmond → Kensington · 마지막 매장에서 가방 맡기기</small></div></div>

          <div className="gift-list">
            {recommendations.map((gift) => {
              const checked = selectedIds.includes(gift.id);
              return (
                <article className={`gift-card ${checked ? "selected" : ""}`} key={gift.id}>
                  <div className={`gift-mark ${gift.tone}`}><span>{gift.mark}</span><i>{gift.recipient.slice(0, 1)}</i></div>
                  <div className="gift-copy"><div className="gift-meta"><span>{gift.recipient}</span><small>{gift.detail}</small></div><h2>{gift.product}</h2><div className="store-line"><b>{gift.store}</b><span>{gift.area}</span><span>재고 있음</span></div><p><i>✦</i>{gift.reason}</p></div>
                  <div className="gift-action"><b><Money amount={gift.price} /></b><button className={checked ? "checked" : ""} onClick={() => toggleGift(gift.id)} aria-label={`${gift.product} ${checked ? "선택 해제" : "선택"}`}>{checked ? "✓ 담음" : "+ 담기"}</button></div>
                </article>
              );
            })}
          </div>

          <div className="why-panel"><span>추천 원칙</span><p>평점순이 아니라 <b>선물 적합도 × 예산 × 재고 × 배송 가능 여부 × 현재 동선</b>을 함께 계산했어요.</p></div>

          <div className="sticky-summary"><div><span>상품 {selected.length}개 · 배송 CAD 9</span><b>합계 <Money amount={total} /></b></div><button onClick={() => go("delivery")} disabled={!selected.length || overBudget}>이대로 쇼핑하기 <i>→</i></button></div>
        </section>
      )}

      {stage === "delivery" && (
        <section className="page delivery-page">
          <button className="back" onClick={() => go("picks")}>←</button>
          <div className="delivery-hero"><div className="bag-stack" aria-hidden="true"><i>TRAIL</i><i>LOCAL</i><span>✓</span></div><div><p className="eyebrow">구매를 마쳤나요?</p><h1>마지막 매장에 맡기면<br /><em>호텔에서 다시 만나요.</em></h1><p>세 매장에서 받은 쇼핑백을 Blue Banana 카운터에 한 번에 맡겨 주세요.</p></div></div>

          <div className="delivery-grid">
            <div className="handoff-card"><span className="card-kicker">BAG DROP PASS</span><b className="drop-code">TR–2718</b><div className="barcode" aria-hidden="true" /><p>직원에게 이 화면을 보여주세요</p></div>
            <div className="delivery-form"><label><span>배송 받을 곳</span><input value={destination} onChange={(event) => setDestination(event.target.value)} aria-label="배송 받을 곳" /></label><div><span>맡기는 곳</span><b>Blue Banana Market · Service desk</b></div><div><span>예상 도착</span><b>오늘 18:30–19:00</b></div><div><span>배송비</span><b>CAD 9 · 예산에 포함</b></div></div>
          </div>

          <div className="care-note"><i>◎</i><div><b>가방은 이렇게 이동해요</b><p>매장에서 봉인 → 기사 인수 시 코드 확인 → 호텔 프런트에 전달. 단계마다 알림을 보내드려요.</p></div></div>
          <button className="primary-cta dark" onClick={() => { setTrackingStep(1); go("tracking"); }}><span>가방 맡기기 완료<small>{destination}로 배송을 시작해요</small></span><i>→</i></button>
        </section>
      )}

      {stage === "tracking" && (
        <section className="page tracking-page">
          <div className="tracking-top"><Logo /><button onClick={() => go("plan")}>새 쇼핑 계획</button></div>
          <div className="tracking-hero"><div className="freehands"><span>✦</span><i /><i /></div><p className="eyebrow">가방은 TRAIL이 맡을게요</p><h1>{trackingStep === 3 ? "호텔에 도착했어요." : "이제 가볍게,\n여행을 계속하세요."}</h1><p>{trackingStep === 3 ? `${destination}에 안전하게 전달했습니다.` : "쇼핑백 3개가 호텔로 이동 중이에요. 도착 전까지 손은 자유롭습니다."}</p></div>

          <div className="tracking-card"><div className="tracking-head"><span>TR–2718 · 쇼핑백 3개</span><b>{trackingStep === 1 ? "기사 인수" : trackingStep === 2 ? "호텔로 이동 중" : "배송 완료"}</b></div><div className="tracking-rail">{["매장에 맡김", "기사 인수", "호텔 이동", "프런트 도착"].map((label, index) => <div className={index <= trackingStep ? "done" : ""} key={label}><i>{index < trackingStep ? "✓" : ""}</i><span>{label}</span></div>)}</div><div className="arrival"><span>도착 예정</span><b>{trackingStep === 3 ? "18:42 도착" : "18:30–19:00"}</b></div>{trackingStep < 3 && <button className="preview-button" onClick={() => setTrackingStep((current) => Math.min(3, current + 1))}>다음 배송 상태 보기 →</button>}</div>

          <div className="next-stop"><span><small>가방 없이 1시간 20분</small><b>Graffiti Alley까지 걸어볼까요?</b><em>도보 8분 · 호텔 방향 동선</em></span><button aria-label="추천 장소 자세히 보기">→</button></div>
        </section>
      )}
    </main>
  );
}
