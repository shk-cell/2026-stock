import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, runTransaction, collection, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
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

const QUOTE_ENDPOINT = "https://quote-ymhlxyctxq-uc.a.run.app"; 
const $ = (id) => document.getElementById(id);
const money = (v) => `$${Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

let currentStockPrice = 0;
let currentSymbol = "";
let lastRefreshTime = 0;

// [상태 업데이트] 타이머 및 버튼 잠금/해제 로직
function updateTradeButtonStatus() {
  const now = Date.now();
  const limit = 3600000; // 60분
  const diff = now - lastRefreshTime;

  if (lastRefreshTime > 0 && diff < limit) {
    document.querySelectorAll('#buyBtn, .btn-sell').forEach(btn => btn.disabled = false);
    const remaining = limit - diff;
    const min = Math.floor(remaining / 60000);
    const sec = Math.floor((remaining % 60000) / 1000);
    $("expireMsg").textContent = `남은 시간: ${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    $("expireMsg").style.color = "var(--warn)";
  } else {
    document.querySelectorAll('#buyBtn, .btn-sell').forEach(btn => btn.disabled = true);
    $("expireMsg").textContent = lastRefreshTime === 0 ? "남은 시간: 60:00" : "⚠️ 시세 만료 (갱신 필요)";
    $("expireMsg").style.color = lastRefreshTime === 0 ? "var(--muted)" : "var(--up)";
  }
}

// [시세 조회] 실시간 환율 자동 적용
async function fetchQuote() {
  const s = $("qSymbol").value.trim().toUpperCase();
  if (!s) return;
  $("qBtn").textContent = "...";
  try {
    const r = await fetch(`${QUOTE_ENDPOINT}?symbol=${encodeURIComponent(s)}`);
    const d = await r.json();
    if (d.ok) {
      let price = d.price;
      if (s.endsWith(".KS") || s.endsWith(".KQ")) {
        const exR = await fetch(`${QUOTE_ENDPOINT}?symbol=USDKRW=X`);
        const exD = await exR.json();
        if (exD.ok) price = d.price / exD.price;
      }
      currentSymbol = d.symbol; currentStockPrice = price;
      $("qOutBox").style.display = "flex";
      $("qSymbolText").textContent = d.symbol;
      $("qPriceText").textContent = money(price);
    } else { alert("종목을 찾을 수 없습니다."); }
  } catch { alert("조회 실패"); }
  finally { $("qBtn").textContent = "조회"; }
}

// [매수]
async function buyStock() {
  const user = auth.currentUser;
  if (!user || !currentSymbol || currentStockPrice <= 0) return;
  try {
    await runTransaction(db, async (transaction) => {
      const userRef = doc(db, "users", user.email);
      const userSnap = await transaction.get(userRef);
      const userData = userSnap.data();
      if (userData.cash < currentStockPrice) throw "잔액 부족";
      const portRef = doc(db, "users", user.email, "portfolio", currentSymbol);
      const portSnap = await transaction.get(portRef);
      const currentQty = portSnap.exists() ? portSnap.data().qty : 0;
      transaction.update(userRef, { cash: userData.cash - currentStockPrice });
      transaction.set(portRef, { qty: currentQty + 1, lastPrice: currentStockPrice }, { merge: true });
    });
    await refreshEverything();
  } catch (e) { alert(e); }
}

// [매도]
async function sellStock(symbol, price) {
  const user = auth.currentUser;
  try {
    await runTransaction(db, async (transaction) => {
      const portRef = doc(db, "users", user.email, "portfolio", symbol);
      const portSnap = await transaction.get(portRef);
      const userRef = doc(db, "users", user.email);
      const userSnap = await transaction.get(userRef);
      transaction.update(userRef, { cash: userSnap.data().cash + price });
      if (portSnap.data().qty === 1) transaction.delete(portRef);
      else transaction.update(portRef, { qty: portSnap.data().qty - 1 });
    });
    await refreshEverything();
  } catch (e) { alert(e); }
}

// [새로고침] 자산 업데이트 및 랭킹 조회 연동
async function refreshEverything() {
  const user = auth.currentUser; if (!user) return;
  const userSnap = await getDoc(doc(db, "users", user.email));
  if (!userSnap.exists()) return;
  const userData = userSnap.data();
  $("userNickname").textContent = userData.nickname || user.email.split('@')[0];
  $("userEmail").textContent = user.email;
  $("cashText").textContent = money(userData.cash);
  
  let totalAsset = userData.cash;
  const portSnap = await getDocs(collection(db, "users", user.email, "portfolio"));
  let html = "";
  portSnap.forEach(dDoc => {
    const d = dDoc.data(); totalAsset += (d.qty * d.lastPrice);
    html += `<div class="portfolio-item"><div><b>${dDoc.id}</b><br><small>${d.qty}주</small></div><button onclick="window.sellStock('${dDoc.id}', ${d.lastPrice})" class="btn-sell">매도</button></div>`;
  });
  $("portfolioList").innerHTML = html;
  $("totalAssetsText").textContent = money(totalAsset);
  
  await setDoc(doc(db, "users", user.email), { totalAsset }, { merge: true });
  fetchRanking();
}

// [랭킹] 상위 20위 정렬 조회
async function fetchRanking() {
  const q = query(collection(db, "users"), orderBy("totalAsset", "desc"), limit(20));
  const qSnap = await getDocs(q);
  let html = ""; let i = 1;
  qSnap.forEach(d => {
    html += `<div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line); font-size:13px;">
      <span>${i++}. ${d.data().nickname || d.id.split('@')[0]}</span><b>${money(d.data().totalAsset)}</b></div>`;
  });
  $("rankingList").innerHTML = html;
}

// 이벤트 바인딩
$("loginBtn").onclick = async () => {
  try { await signInWithEmailAndPassword(auth, $("email").value, $("pw").value); }
  catch { alert("로그인 실패"); }
};
$("logoutBtn").onclick = () => signOut(auth);
$("qBtn").onclick = fetchQuote;
$("buyBtn").onclick = buyStock;
$("globalRefreshBtn").onclick = () => { lastRefreshTime = Date.now(); refreshEverything(); updateTradeButtonStatus(); };
window.sellStock = sellStock;

// 로그인 상태 감지 (자동 데이터 로드 포함)
onAuthStateChanged(auth, (user) => {
  if (user) { 
    $("authView").classList.add("hidden"); $("dashView").classList.remove("hidden"); 
    refreshEverything(); 
  } else { 
    $("authView").classList.remove("hidden"); $("dashView").classList.add("hidden"); 
  }
});

// 타이머는 1초마다 갱신 (데이터 요청 없음)
setInterval(updateTradeButtonStatus, 1000);
