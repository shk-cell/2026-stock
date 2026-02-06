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

async function getExchangeRate() {
  try {
    const res = await fetch(`${QUOTE_URL}?symbol=USDKRW=X`);
    const data = await res.json();
    return (data.ok && data.price) ? data.price : 1465; 
  } catch (e) { return 1465; }
}

async function fetchQuote() {
  const sym = $("qSymbol").value.trim().toUpperCase();
  if (!sym) return;
  $("qBtn").disabled = true;
  try {
    const res = await fetch(`${QUOTE_URL}?symbol=${sym}`);
    const data = await res.json();
    if (data.ok) {
      let p = data.price;
      if (data.currency === "KRW") {
        const rate = await getExchangeRate();
        p = p / rate;
      }
      curSym = data.symbol; curPrice = p;
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

    if($("userNickname")) {
      $("userNickname").textContent = `${user.email} (${userData.nickname || '사용자'})`;
    }
    
    if($("cashText")) $("cashText").textContent = money(userData.cash);

    const rate = await getExchangeRate();
    const pSnaps = await getDocs(collection(db, "users", user.email, "portfolio"));
    let pHtml = "", stockTotal = 0;

    for (const s of pSnaps.docs) {
      const d = s.data(); if (d.qty <= 0) continue;
      const res = await fetch(`${QUOTE_URL}?symbol=${s.id}`);
      const quote = await res.json();
      let price = quote.ok ? quote.price : 0;
      if (quote.currency === "KRW") price = price / rate;

      const val = price * d.qty; stockTotal += val;
      const buyP = d.price || price; 
      const profitRate = ((price - buyP) / buyP) * 100;
      
      // 수익률 색상 및 0% 회색 처리
      let color = "var(--zero)";
      let sign = "";
      if (profitRate > 0) { color = "var(--up)"; sign = "+"; }
      else if (profitRate < 0) { color = "var(--down)"; sign = ""; }

      // 포트폴리오 한 줄 표기 (구매 | 현재 | 수익률)
      pHtml += `
        <div class="item-flex">
          <div style="flex:1; overflow:hidden;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
               <b style="font-size:14px;">${s.id}</b> <small style="color:var(--muted);">${d.qty}주</small>
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

    // 랭킹 및 내역 업데이트 생략 (기존 로직 동일)
  } catch (e) { console.error(e); }
}

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

// 현재 시세 업데이트 함수
const globalRefresh = () => { lastRefresh = Date.now(); refreshData(); updateTimer(); };
if($("globalRefreshBtn")) $("globalRefreshBtn").onclick = globalRefresh;
window.sellStock = sellStock;

onAuthStateChanged(auth, (u) => {
  if (u) {
    $("authView").classList.add("hidden"); 
    $("dashView").classList.remove("hidden");
    // [추가] 로그인 시 자동으로 시세 업데이트 버튼 동작
    globalRefresh(); 
  } else { 
    $("authView").classList.remove("hidden"); 
    $("dashView").classList.add("hidden"); 
  }
});
