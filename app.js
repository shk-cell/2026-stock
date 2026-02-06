import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, query, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
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

// 서울 서버 주소
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
  if (isExp) {
    msgElem.textContent = "시세 갱신 필요";
  } else {
    const rem = 3600000 - diff;
    msgElem.textContent = `거래 가능: ${Math.floor(rem/60000)}분 ${Math.floor((rem%60000)/1000)}초`;
  }
}
setInterval(updateTimer, 1000);

// [완벽 복원] 실시간 환율 및 실패 시 기본값 1465원 설정
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
      // 한국 주식 실시간 환율 안내 및 계산
      if (data.currency === "KRW") {
        const rate = await getExchangeRate();
        p = p / rate;
        alert(`한국 주식은 실시간 환율(1$=${rate.toLocaleString()}원)이 적용된 달러 가격으로 표시됩니다.`);
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
  if (!user) throw new Error("로그인이 필요합니다.");
  const idToken = await user.getIdToken();
  const res = await fetch(TRADE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
    body: JSON.stringify({ data: payload })
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "서버 통신 실패");
  return result;
}

async function buyStock() {
  const user = auth.currentUser;
  if(!user || !curSym || curPrice <= 0) return;
  const qty = parseInt(prompt(`[${curSym}] 매수 수량:`, "1"));
  if(isNaN(qty) || qty <= 0) return;
  $("buyBtn").disabled = true;
  try {
    const result = await callTradeAPI({ type: "BUY", symbol: curSym, qty, price: curPrice });
    if(result.data.success) { alert(`[${curSym}] ${qty}주 매수 완료!`); refreshData(); }
  } catch(e) { alert("매수 실패: " + e.message); } finally { $("buyBtn").disabled = false; }
}

async function sellStock(sym, currentPrice) {
  const qty = parseInt(prompt(`[${sym}] 매도 수량:`, "1"));
  if(isNaN(qty) || qty <= 0) return;
  try {
    const result = await callTradeAPI({ type: "SELL", symbol: sym, qty, price: currentPrice });
    if(result.data.success) { alert(`[${sym}] ${qty}주 매도 완료!`); refreshData(); }
  } catch(e) { alert("매도 실패: " + e.message); }
}

async function refreshData() {
  const user = auth.currentUser; if (!user) return;
  try {
    const uSnap = await getDoc(doc(db, \"users\", user.email));
    if (!uSnap.exists()) return;
    const userData = uSnap.data();
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
      
      // [완벽 복원] 수익률 계산 및 +- 기호 표시 로직
      const buyP = d.price || price; 
      const profitRate = ((price - buyP) / buyP) * 100;
      const color = profitRate >= 0 ? "var(--warn)" : "var(--primary)";
      const sign = profitRate >= 0 ? "+" : "";

      pHtml += `
        <div class="item-flex">
          <div style="flex:1;">
            <b style="font-size:15px;">${s.id}</b> <small>${d.qty}주</small><br>
            <span style="font-size:12px; color:${color};">
              ${money(price)} (${sign}${profitRate.toFixed(2)}%)
            </span><br>
            <small style="color:#888;">구매가: ${money(buyP)}</small>
          </div>
          <button onclick="window.sellStock('${s.id}', ${price})" class="btn btn-trade btn-sell">매도</button>
        </div>`;
    }
    if($("portfolioList")) $("portfolioList").innerHTML = pHtml || "보유 없음";

    const total = (userData.cash || 0) + stockTotal;
    if($("totalAssetsText")) $("totalAssetsText").textContent = money(total);
    await setDoc(doc(db, "users", user.email), { totalAsset: total }, { merge: true });

    // 랭킹 및 히스토리 출력 (선생님 원본 스타일)
    const rSnaps = await getDocs(query(collection(db, "users"), orderBy("totalAsset", "desc"), limit(10)));
    let rHtml = ""; rSnaps.docs.forEach((d, i) => {
      const rd = d.data(); rHtml += `<div class="item-flex"><span>${i + 1}. ${rd.nickname || d.id.split('@')[0]}</span><b>${money(rd.totalAsset)}</b></div>`;
    });
    if($("rankingList")) $("rankingList").innerHTML = rHtml;

    const hSnaps = await getDocs(query(collection(db, "users", user.email, "history"), orderBy("timestamp", "desc"), limit(10)));
    let hHtml = ""; hSnaps.docs.forEach(doc => {
      const h = doc.data(); 
      const typeLabel = (h.type === 'BUY' || h.type === '매수') ? '🔴 매수' : '🔵 매도';
      hHtml += `<div class="item-flex" style="font-size:12px;"><span>${typeLabel} ${h.symbol}</span><span>${h.qty}주 (${money(h.price)})</span></div>`;
    });
    if($("transactionList")) $("transactionList").innerHTML = hHtml || "내역 없음";
  } catch (e) { console.error(e); }
}

// 이벤트 바인딩
if($("loginBtn")) { 
  $("loginBtn").onclick = () => { 
    const em = $("email").value; const pw = $("pw").value;
    if(!em || !pw) return alert("입력창을 확인하세요.");
    signInWithEmailAndPassword(auth, em, pw).catch(e => alert("실패: " + e.message)); 
  }; 
}
if($("logoutBtn")) $("logoutBtn").onclick = () => signOut(auth);
if($("qBtn")) $("qBtn").onclick = fetchQuote;
if($("buyBtn")) $("buyBtn").onclick = buyStock;
if($("globalRefreshBtn")) $("globalRefreshBtn").onclick = () => { lastRefresh = Date.now(); refreshData(); updateTimer(); };
window.sellStock = sellStock;

onAuthStateChanged(auth, async (u) => {
  if (u) {
    $("authView").classList.add("hidden"); $("dashView").classList.remove("hidden");
    refreshData();
  } else { 
    $("authView").classList.remove("hidden"); $("dashView").classList.add("hidden"); 
  }
});
