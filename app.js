import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, runTransaction, serverTimestamp, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
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
let lastRefreshTime = 0; // 시세 갱신 시간 저장

// 버튼 상태 및 유효시간 체크 함수
function updateTradeButtonStatus() {
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;
  const isFresh = (now - lastRefreshTime) < ONE_HOUR;

  const btns = document.querySelectorAll('#buyBtn, .btn-sell');
  btns.forEach(btn => btn.disabled = !isFresh);

  if (!isFresh) {
    $("expireMsg").textContent = "⚠️ 시세가 만료되었습니다. 다시 갱신해주세요.";
    $("expireMsg").style.color = "var(--warn)";
  } else {
    const minLeft = Math.ceil((ONE_HOUR - (now - lastRefreshTime)) / 60000);
    $("expireMsg").textContent = `시세 유효함 (남은 시간: 약 ${minLeft}분)`;
    $("expireMsg").style.color = "var(--muted)";
  }
}

async function fetchQuote() {
  const s = $("qSymbol").value.trim().toUpperCase();
  if (!s) return;
  $("qOut").textContent = "조회중...";
  try {
    const r = await fetch(`${QUOTE_ENDPOINT}?symbol=${encodeURIComponent(s)}`);
    const d = await r.json();
    if (d.ok) {
      currentSymbol = d.symbol;
      currentStockPrice = d.price;
      $("qOut").innerHTML = `<b style="color:var(--pri);">${d.symbol}</b>: ${money(d.price)}`;
    } else { $("qOut").textContent = "없는 종목입니다."; }
  } catch { $("qOut").textContent = "조회 실패"; }
}

async function refreshEverything() {
  const user = auth.currentUser;
  if (!user) return;
  
  $("globalRefreshBtn").textContent = "갱신 중...";
  try {
    const userRef = doc(db, "users", user.email);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, { cash: START_CASH });
      $("cashText").textContent = money(START_CASH);
    } else {
      $("cashText").textContent = money(snap.data().cash);
    }

    const portSnap = await getDocs(collection(db, "users", user.email, "portfolio"));
    let listHtml = "";
    let totalValue = 0;

    for (const d of portSnap.docs) {
      const item = d.data();
      let price = 0;
      try {
        const r = await fetch(`${QUOTE_ENDPOINT}?symbol=${encodeURIComponent(item.symbol)}`);
        const res = await r.json();
        if (res.ok) price = res.price;
      } catch {}
      totalValue += (price * item.qty);
      listHtml += `
        <div class="portfolio-item">
          <div><b style="color:var(--pri);">${item.symbol}</b><br><small>현재가: ${money(price)}</small></div>
          <div style="display:flex; align-items:center; gap:15px;">
            <div style="text-align:right;"><b style="color:#fff;">${item.qty}주</b><br><small style="color:var(--warn);">${money(price * item.qty)}</small></div>
            <button class="btn btn-sell" onclick="window.quickSell('${item.symbol}')">매도</button>
          </div>
        </div>`;
    }
    $("portfolioList").innerHTML = listHtml || '<div style="text-align:center;color:var(--muted);">보유 주식 없음</div>';
    $("totalAssetsText").textContent = money((snap.data()?.cash || START_CASH) + totalValue);
    
    // 성공 시 시간 업데이트 및 버튼 활성화
    lastRefreshTime = Date.now();
    updateTradeButtonStatus();
  } catch (e) { console.error(e); }
  $("globalRefreshBtn").textContent = "시세 갱신 ↻";
}

window.quickSell = async (symbol) => {
  // 매도 전 시간 체크
  updateTradeButtonStatus();
  if (document.querySelector('.btn-sell').disabled) {
    alert("시세가 만료되었습니다. 시세 갱신을 먼저 눌러주세요.");
    return;
  }

  $("qSymbol").value = symbol;
  await fetchQuote();
  const q = prompt(`${symbol}을 몇 주 매도하시겠습니까?`, "1");
  if (q && parseInt(q) > 0) {
    try {
      await runTransaction(db, async (t) => {
        const uRef = doc(db, "users", auth.currentUser.email);
        const sRef = doc(db, "users", auth.currentUser.email, "portfolio", symbol);
        const uS = await t.get(uRef); const sS = await t.get(sRef);
        if (sS.data().qty < q) throw "수량 부족";
        t.update(uRef, { cash: uS.data().cash + (currentStockPrice * q) });
        if (sS.data().qty == q) t.delete(sRef); else t.update(sRef, { qty: sS.data().qty - q });
      });
      alert("매도 완료"); await refreshEverything();
    } catch(e) { alert(e); }
  }
};

onAuthStateChanged(auth, async (user) => {
  if (user) {
    $("authView").classList.add("hidden"); $("dashView").classList.remove("hidden");
    $("userEmail").textContent = user.email;
    // 첫 접속(로그인) 시 무조건 한 번 시세 갱신
    await refreshEverything();
  } else {
    $("authView").classList.remove("hidden"); $("dashView").classList.add("hidden");
  }
});

document.addEventListener("DOMContentLoaded", () => {
  $("loginBtn").onclick = () => {
    signInWithEmailAndPassword(auth, $("email").value, $("pw").value).catch(() => $("authMsg").textContent = "로그인 실패");
  };
  $("logoutBtn").onclick = () => signOut(auth);
  $("qBtn").onclick = fetchQuote;
  $("globalRefreshBtn").onclick = refreshEverything;
  
  $("buyBtn").onclick = async () => {
    updateTradeButtonStatus();
    if ($("buyBtn").disabled) { alert("시세 갱신을 먼저 해주세요."); return; }
    
    const q = prompt(`${currentSymbol} 매수 수량`, "1");
    if (q && parseInt(q) > 0) {
      const total = currentStockPrice * q;
      try {
        await runTransaction(db, async (t) => {
          const uRef = doc(db, "users", auth.currentUser.email);
          const sRef = doc(db, "users", auth.currentUser.email, "portfolio", currentSymbol);
          const uS = await t.get(uRef); const sS = await t.get(sRef);
          if (uS.data().cash < total) throw "잔고 부족";
          t.update(uRef, { cash: uS.data().cash - total });
          if (sS.exists()) t.update(sRef, { qty: sS.data().qty + parseInt(q) });
          else t.set(sRef, { symbol: currentSymbol, qty: parseInt(q) });
        });
        alert("매수 완료"); await refreshEverything();
      } catch(e) { alert(e); }
    }
  };
  
  // 1분마다 유효시간 체크하여 버튼 상태 업데이트
  setInterval(updateTradeButtonStatus, 60000);
});
