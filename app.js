import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, runTransaction, serverTimestamp, collection, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
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

const START_CASH = 70000;
const QUOTE_ENDPOINT = "https://quote-ymhlxyctxq-uc.a.run.app"; 
const $ = (id) => document.getElementById(id);
const money = (v) => `$${Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

let currentStockPrice = 0;
let currentSymbol = "";
let lastRefreshTime = 0;

function updateTradeButtonStatus() {
  const now = Date.now();
  const diff = now - lastRefreshTime;
  const isFresh = diff < 3600000;
  const timeLeft = Math.ceil((3600000 - diff) / 60000);
  
  document.querySelectorAll('#buyBtn, .btn-sell').forEach(btn => btn.disabled = !isFresh);
  
  if (isFresh) {
    $("expireMsg").textContent = `(갱신 유효 시간 ${timeLeft}분 남음)`;
    $("expireMsg").style.color = "var(--muted)";
  } else {
    $("expireMsg").textContent = "⚠️ 시세 만료 (매수/매도를 위해 갱신 필요)";
    $("expireMsg").style.color = "var(--up)";
  }
}

async function fetchQuote() {
  const s = $("qSymbol").value.trim().toUpperCase();
  if (!s) return;
  $("qBtn").textContent = "...";
  try {
    const r = await fetch(`${QUOTE_ENDPOINT}?symbol=${encodeURIComponent(s)}`);
    const d = await r.json();
    if (d.ok) {
      currentSymbol = d.symbol; 
      currentStockPrice = d.price;
      $("qOutBox").style.display = "flex";
      $("qSymbolText").textContent = d.symbol;
      $("qPriceText").textContent = money(d.price);
    } else { 
      alert("종목을 찾을 수 없습니다.");
      $("qOutBox").style.display = "none";
    }
  } catch { alert("조회 중 오류 발생"); }
  finally { $("qBtn").textContent = "조회"; }
}

async function updateLeaderboard(totalAsset) {
  const user = auth.currentUser; if (!user) return;
  await setDoc(doc(db, "users", user.email), { totalAsset, lastActive: serverTimestamp() }, { merge: true });
  await fetchRanking();
}

async function fetchRanking() {
  const qSnap = await getDocs(collection(db, "users"));
  let data = [];
  qSnap.forEach(doc => { if (doc.data().totalAsset) data.push({ id: doc.id, ...doc.data() }); });
  data.sort((a, b) => b.totalAsset - a.totalAsset);
  $("rankingList").innerHTML = data.slice(0, 10).map((u, i) => `
    <div style="display:flex; justify-content:space-between; padding:8px 12px; border-bottom:1px solid var(--line); font-size:13px; ${u.id === auth.currentUser?.email ? 'background:rgba(43,124,255,0.1); border-radius:8px;' : ''}">
      <span>${i+1}. ${u.id.split('@')[0]}</span>
      <b>${money(u.totalAsset)}</b>
    </div>`).join('') || "데이터 없음";
}

async function fetchHistory() {
  const user = auth.currentUser; if (!user) return;
  const q = query(collection(db, "users", user.email, "history"), orderBy("date", "desc"), limit(10));
  const snap = await getDocs(q);
  $("historyList").innerHTML = snap.docs.map(d => {
    const h = d.data();
    return `<div style="padding:8px 12px; border-bottom:1px solid var(--line); font-size:12px;">
      <div style="display:flex; justify-content:space-between;">
        <span style="color:${h.type==='BUY'?'var(--up)':'var(--pri)'}; font-weight:bold;">${h.type==='BUY'?'매수':'매도'} ${h.symbol}</span>
        <span>${money(h.price)}</span>
      </div>
      <div style="display:flex; justify-content:space-between; color:var(--muted); font-size:10px;">
        <span>${h.qty}주</span><span>${h.date?.toDate().toLocaleTimeString() || ""}</span>
      </div>
    </div>`;
  }).join('') || "내역 없음";
}

async function refreshEverything() {
  const user = auth.currentUser; if (!user) return;
  $("globalRefreshBtn").textContent = "갱신 중...";
  try {
    const userSnap = await getDoc(doc(db, "users", user.email));
    const cash = userSnap.exists() ? userSnap.data().cash : START_CASH;
    if (!userSnap.exists()) await setDoc(doc(db, "users", user.email), { cash: START_CASH });
    $("cashText").textContent = money(cash);

    const portSnap = await getDocs(collection(db, "users", user.email, "portfolio"));
    let listHtml = ""; let totalStockValue = 0;
    for (const d of portSnap.docs) {
      const item = d.data(); let livePrice = 0;
      try {
        const r = await fetch(`${QUOTE_ENDPOINT}?symbol=${encodeURIComponent(item.symbol)}`);
        const res = await r.json(); if (res.ok) livePrice = res.price;
      } catch {}
      totalStockValue += (livePrice * item.qty);
      const avgPrice = item.avgPrice || livePrice;
      const profitRate = avgPrice > 0 ? (((livePrice - avgPrice) / avgPrice) * 100).toFixed(2) : "0.00";
      listHtml += `
        <div class="portfolio-item">
          <div class="stock-info">
            <b style="color:var(--pri); font-size:15px;">${item.symbol}</b>
            <div class="stock-price-info">매수 ${money(avgPrice)} | <span class="${profitRate>=0?'profit-up':'profit-down'}">${profitRate}%</span></div>
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="text-align:right;"><b style="color:#fff; font-size:14px;">${item.qty}주</b><br><small style="color:var(--warn);">${money(livePrice * item.qty)}</small></div>
            <button class="btn-sell" onclick="window.quickSell('${item.symbol}')">매도</button>
          </div>
        </div>`;
    }
    $("portfolioList").innerHTML = listHtml || '<div style="text-align:center; color:var(--muted); padding:20px;">보유 주식 없음</div>';
    const finalTotal = cash + totalStockValue;
    $("totalAssetsText").textContent = money(finalTotal);
    lastRefreshTime = Date.now(); updateTradeButtonStatus();
    await updateLeaderboard(finalTotal);
    await fetchHistory();
  } catch (e) { console.error(e); }
  $("globalRefreshBtn").textContent = "시세 갱신 ↻";
}

window.quickSell = async (symbol) => {
  updateTradeButtonStatus(); if (document.querySelector('.btn-sell').disabled) return alert("시세 갱신 필요");
  $("qSymbol").value = symbol; await fetchQuote();
  const q = prompt(`${symbol} 매도 수량`, "1");
  if (q && parseInt(q) > 0) {
    try {
      await runTransaction(db, async (t) => {
        const uRef = doc(db, "users", auth.currentUser.email);
        const sRef = doc(db, "users", auth.currentUser.email, "portfolio", symbol);
        const uS = await t.get(uRef); const sS = await t.get(sRef);
        if (sS.data().qty < q) throw "수량 부족";
        t.update(uRef, { cash: uS.data().cash + (currentStockPrice * q) });
        if (sS.data().qty == q) t.delete(sRef); else t.update(sRef, { qty: sS.data().qty - q });
        const hRef = doc(collection(db, "users", auth.currentUser.email, "history"));
        t.set(hRef, { type: "SELL", symbol, qty: parseInt(q), price: currentStockPrice, date: serverTimestamp() });
      });
      alert("매도 완료"); await refreshEverything();
    } catch(e) { alert(e); }
  }
};

onAuthStateChanged(auth, async (user) => {
  if (user) {
    $("authView").classList.add("hidden"); $("dashView").classList.remove("hidden");
    $("userEmail").textContent = user.email; await refreshEverything();
  } else {
    $("authView").classList.remove("hidden"); $("dashView").classList.add("hidden");
  }
});

document.addEventListener("DOMContentLoaded", () => {
  $("loginBtn").onclick = () => signInWithEmailAndPassword(auth, $("email").value, $("pw").value).catch(() => $("authMsg").textContent = "로그인 실패");
  $("logoutBtn").onclick = () => signOut(auth);
  $("qBtn").onclick = fetchQuote;
  $("globalRefreshBtn").onclick = refreshEverything;
  $("buyBtn").onclick = async () => {
    updateTradeButtonStatus(); if ($("buyBtn").disabled) return;
    const q = prompt(`${currentSymbol} 매수 수량`, "1");
    if (q && parseInt(q) > 0) {
      try {
        await runTransaction(db, async (t) => {
          const uRef = doc(db, "users", auth.currentUser.email);
          const sRef = doc(db, "users", auth.currentUser.email, "portfolio", currentSymbol);
          const uS = await t.get(uRef); const sS = await t.get(sRef);
          const total = currentStockPrice * q;
          if (uS.data().cash < total) throw "잔액 부족";
          t.update(uRef, { cash: uS.data().cash - total });
          if (sS.exists()) {
            const oldQty = sS.data().qty; const oldAvg = sS.data().avgPrice || currentStockPrice;
            const newQty = oldQty + parseInt(q);
            const newAvg = ((oldAvg * oldQty) + (total)) / newQty;
            t.update(sRef, { qty: newQty, avgPrice: newAvg });
          } else t.set(sRef, { symbol: currentSymbol, qty: parseInt(q), avgPrice: currentStockPrice });
          const hRef = doc(collection(db, "users", auth.currentUser.email, "history"));
          t.set(hRef, { type: "BUY", symbol: currentSymbol, qty: parseInt(q), price: currentStockPrice, date: serverTimestamp() });
        });
        alert("매수 완료"); await refreshEverything();
      } catch(e) { alert(e); }
    }
  };
  setInterval(updateTradeButtonStatus, 60000);
});
