import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCzjJDKMbzHjs7s7jMnfK64bbHEEmpyZxI",
  authDomain: "stock-62c76.firebaseapp.com",
  projectId: "stock-62c76",
  storageBucket: "stock-62c76.firebasestorage.app",
  messagingSenderId: "149071161310",
  appId: "1:149071161310:web:79ebd6",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const TRADE_URL = "https://asia-northeast3-stock-62c76.cloudfunctions.net/tradeStock";
const QUOTE_URL = "https://asia-northeast3-stock-62c76.cloudfunctions.net/quote";

const $ = (id) => document.getElementById(id);
const money = (v) => `$${Number(v || 0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;

let curPrice = 0, curSym = "", lastRefresh = 0;

function updateTimer() {
  const msgElem = $("expireMsg");
  if (!msgElem) return;
  const diff = Date.now() - lastRefresh;
  const isExp = lastRefresh === 0 || diff >= 3600000;
  if($("buyBtn")) $("buyBtn").disabled = isExp || !curSym;
  msgElem.textContent = isExp ? "시세 갱신 필요" : `거래 가능: ${Math.floor((3600000-diff)/60000)}분 ${Math.floor(((3600000-diff)%60000)/1000)}초`;
}
setInterval(updateTimer, 1000);

// [중요] 실시간 환율을 가져오고 화면 멘트 옆에 업데이트하는 함수
async function getExchangeRate() {
  try {
    const res = await fetch(`${QUOTE_URL}?symbol=USDKRW=X`);
    const data = await res.json();
    const rate = (data.ok && data.price) ? data.price : 1465; 
    // 화면 멘트 업데이트
    if($("currentRateText")) $("currentRateText").textContent = `(현재 환율: ${rate.toLocaleString()}원)`;
    return rate;
  } catch (e) { 
    return 1465; 
  }
}

// [수정] 주식 검색 시 한국 주식이면 즉시 달러로 변환
async function fetchQuote() {
  const sym = $("qSymbol").value.trim().toUpperCase();
  if (!sym) return;
  $("qBtn").disabled = true;
  try {
    const res = await fetch(`${QUOTE_URL}?symbol=${sym}`);
    const data = await res.json();
    if (data.ok) {
      const rate = await getExchangeRate();
      let p = data.price;
      
      // 한국 주식(.KS 또는 .KQ)이거나 통화가 KRW인 경우 환율 적용
      if (sym.includes(".KS") || sym.includes(".KQ") || data.currency === "KRW") {
        p = p / rate;
      }
      
      curSym = data.symbol; 
      curPrice = p; // 달러로 환산된 가격 저장

      if($("qOutBox")) $("qOutBox").style.display = "flex";
      if($("qSymbolText")) $("qSymbolText").textContent = curSym;
      if($("qPriceText")) $("qPriceText").textContent = money(curPrice);
      
      lastRefresh = Date.now();
      updateTimer();
    } else { alert("종목을 찾을 수 없습니다."); }
  } catch (e) { alert("시세 호출 실패"); } finally { $("qBtn").disabled = false; }
}

async function callTradeAPI(payload) {
  const user = auth.currentUser;
  const idToken = await user.getIdToken();
  const res = await fetch(TRADE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
    body: JSON.stringify({ data: payload })
  });
  return await res.json();
}

async function buyStock() {
  const user = auth.currentUser;
  if(!user || !curSym || curPrice <= 0) return;
  const qty = parseInt(prompt(`[${curSym}] 매수 수량:`, "1"));
  if(isNaN(qty) || qty <= 0) return;
  try {
    // 이미 달러로 환산된 curPrice를 보냄
    const result = await callTradeAPI({ type: "BUY", symbol: curSym, qty: qty, price: curPrice });
    if(result.data.success) { alert("매수 완료!"); refreshData(); }
  } catch(e) { alert("매수 실패"); }
}

async function sellStock(sym, currentPrice) {
  const qty = parseInt(prompt(`[${sym}] 매도 수량:`, "1"));
  if(isNaN(qty) || qty <= 0) return;
  try {
    const result = await callTradeAPI({ type: "SELL", symbol: sym, qty: qty, price: currentPrice });
    if(result.data.success) { alert("매도 완료!"); refreshData(); }
  } catch(e) { alert("매도 실패"); }
}

async function refreshData() {
  const user = auth.currentUser; if (!user) return;
  try {
    const uSnap = await getDoc(doc(db, "users", user.email));
    if (!uSnap.exists()) return;
    const userData = uSnap.data();

    // 환율 정보 가져오기 (화면 멘트 업데이트 포함)
    const rate = await getExchangeRate();

    if($("userNickname")) $("userNickname").textContent = `${user.email} (${userData.nickname || '사용자'})`;
    if($("cashText")) $("cashText").textContent = money(userData.cash);

    const pSnaps = await getDocs(collection(db, "users", user.email, "portfolio"));
    let pHtml = "", stockTotal = 0;

    for (const s of pSnaps.docs) {
      const d = s.data(); if (d.qty <= 0) continue;
      const res = await fetch(`${QUOTE_URL}?symbol=${s.id}`);
      const quote = await res.json();
      
      let price = quote.ok ? quote.price : 0;
      // [수정] 포트폴리오 출력 시에도 한국 주식이면 달러로 변환
      if (s.id.includes(".KS") || s.id.includes(".KQ") || quote.currency === "KRW") {
        price = price / rate;
      }

      const val = price * d.qty; stockTotal += val;
      const buyP = d.price || price; 
      const profitRate = ((price - buyP) / buyP) * 100;
      
      let color = "var(--zero)";
      let sign = "";
      if (profitRate > 0) { color = "var(--up)"; sign = "+"; }
      else if (profitRate < 0) { color = "var(--down)"; sign = ""; }

      pHtml += `
        <div class="item-flex">
          <div style="flex:1; overflow:hidden;">
            <div style="margin-bottom:2px;">
               <b style="font-size:14px;">${s.id}(${d.qty}주)</b> 
            </div>
            <div style="font-size:11.5px; white-space:nowrap;">
              <span style="color:#888;">매수 ${money(buyP)}</span> | 
              <span style="font-weight:bold;">현재 ${money(price)}</span> | 
              <span style="color:${color}; font-weight:bold;">${sign}${profitRate.toFixed(2)}%</span>
            </div>
          </div>
          <button onclick="window.sellStock('${s.id}', ${price})" class="btn btn-trade btn-sell" style="height:32px; font-size:12px;">매도</button>
        </div>`;
    }
    if($("portfolioList")) $("portfolioList").innerHTML = pHtml || "보유 없음";

    const total = (userData.cash || 0) + stockTotal;
    if($("totalAssetsText")) $("totalAssetsText").textContent = money(total);
    await setDoc(doc(db, "users", user.email), { totalAsset: total }, { merge: true });

    // 랭킹 업데이트
    const rSnaps = await getDocs(query(collection(db, "users"), orderBy("totalAsset", "desc"), limit(10)));
    let rHtml = ""; rSnaps.docs.forEach((d, i) => {
      const rd = d.data(); rHtml += `<div class="item-flex"><span>${i + 1}. ${rd.nickname || d.id.split('@')[0]}</span><b>${money(rd.totalAsset)}</b></div>`;
    });
    if($("rankingList")) $("rankingList").innerHTML = rHtml;

    // 내역 업데이트
    const hSnaps = await getDocs(query(collection(db, \"users\", user.email, \"history\"), orderBy(\"timestamp\", \"desc\"), limit(10)));
    let hHtml = ""; hSnaps.docs.forEach(doc => {
      const h = doc.data(); 
      hHtml += `<div class="item-flex" style="font-size:12px;"><span>${(h.type === 'BUY' || h.type === '매수') ? '🔴 매수' : '🔵 모도'} ${h.symbol}</span><span>${h.qty}주 (${money(h.price)})</span></div>`;
    });
    if($("transactionList")) $("transactionList").innerHTML = hHtml || "내역 없음";
  } catch (e) { console.error(e); }
}

const globalRefresh = () => { lastRefresh = Date.now(); refreshData(); updateTimer(); };

if($("loginBtn")) {
  $("loginBtn").onclick = async () => {
    const em = $("email").value.trim();
    const pw = $("pw").value.trim();
    try { await signInWithEmailAndPassword(auth, em, pw); } catch(e) { alert("로그인 실패"); }
  };
}
if($("logoutBtn")) $("logoutBtn").onclick = () => signOut(auth);
if($("qBtn")) $("qBtn").onclick = fetchQuote;
if($("buyBtn")) $("buyBtn").onclick = buyStock;
if($("globalRefreshBtn")) $("globalRefreshBtn").onclick = globalRefresh;
window.sellStock = sellStock;

onAuthStateChanged(auth, (u) => {
  if (u) {
    $("authView").classList.add("hidden"); 
    $("dashView").classList.remove("hidden");
    globalRefresh(); 
  } else { 
    $("authView").classList.remove("hidden"); 
    $("dashView").classList.add("hidden"); 
  }
});
