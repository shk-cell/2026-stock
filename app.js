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

const QUOTE_ENDPOINT = "https://quote-ymhlxyctxq-uc.a.run.app"; 
const $ = (id) => document.getElementById(id);
const money = (v) => `$${Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

let currentStockPrice = 0;
let currentSymbol = "";
let lastRefreshTime = 0;

// [유틸] 거래 버튼 활성화 관리
function updateTradeButtonStatus() {
  const isFresh = (Date.now() - lastRefreshTime) < 3600000;
  document.querySelectorAll('#buyBtn, .btn-sell').forEach(btn => btn.disabled = !isFresh);
  $("expireMsg").textContent = isFresh ? "(현재 실시간 거래가 가능합니다)" : "⚠️ 시세 만료 (갱신 버튼을 누르세요)";
}

// [조회] 실시간 환율 반영 시세 조회
async function fetchQuote() {
  const s = $("qSymbol").value.trim().toUpperCase();
  if (!s) return;
  $("qBtn").textContent = "...";
  try {
    const r = await fetch(`${QUOTE_ENDPOINT}?symbol=${encodeURIComponent(s)}`);
    const d = await r.json();
    if (d.ok) {
      let finalPrice = d.price;
      // 한국 주식이면 실시간 환율 적용
      if (s.endsWith(".KS") || s.endsWith(".KQ")) {
        const exR = await fetch(`${QUOTE_ENDPOINT}?symbol=USDKRW=X`);
        const exD = await exR.json();
        if (exD.ok) finalPrice = d.price / exD.price;
      }
      currentSymbol = d.symbol;
      currentStockPrice = finalPrice;
      $("qOutBox").style.display = "flex";
      $("qSymbolText").textContent = d.symbol;
      $("qPriceText").textContent = money(finalPrice);
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
      if (!userSnap.exists()) throw "사용자 데이터가 없습니다.";
      const userData = userSnap.data();
      if (userData.cash < currentStockPrice) throw "잔액이 부족합니다.";
      const portRef = doc(db, "users", user.email, "portfolio", currentSymbol);
      const portSnap = await transaction.get(portRef);
      const currentQty = portSnap.exists() ? portSnap.data().qty : 0;
      transaction.update(userRef, { cash: userData.cash - currentStockPrice });
      transaction.set(portRef, { qty: currentQty + 1, lastPrice: currentStockPrice }, { merge: true });
    });
    alert("매수 완료!"); await refreshEverything();
  } catch (e) { alert(e); }
}

// [매도]
async function sellStock(symbol, price) {
  const user = auth.currentUser;
  if (!user) return;
  try {
    await runTransaction(db, async (transaction) => {
      const portRef = doc(db, "users", user.email, "portfolio", symbol);
      const portSnap = await transaction.get(portRef);
      if (!portSnap.exists() || portSnap.data().qty <= 0) throw "보유 수량 부족";
      const userRef = doc(db, "users", user.email);
      const userSnap = await transaction.get(userRef);
      transaction.update(userRef, { cash: userSnap.data().cash + price });
      if (portSnap.data().qty === 1) transaction.delete(portRef);
      else transaction.update(portRef, { qty: portSnap.data().qty - 1 });
    });
    alert("매도 완료!"); await refreshEverything();
  } catch (e) { alert(e); }
}

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
  portSnap.forEach(doc => {
    const d = doc.data(); totalAsset += (d.qty * d.lastPrice);
    html += `<div class="portfolio-item"><div><b>${doc.id}</b><br><small>${d.qty}주</small></div><button onclick="window.sellStock('${doc.id}', ${d.lastPrice})" class="btn-sell">매도</button></div>`;
  });
  $("portfolioList").innerHTML = html;
  $("totalAssetsText").textContent = money(totalAsset);
  await setDoc(doc(db, "users", user.email), { totalAsset }, { merge: true });
  fetchRanking();
}

async function fetchRanking() {
  const q = query(collection(db, "users"), orderBy("totalAsset", "desc"), limit(20));
  const qSnap = await getDocs(q);
  let html = ""; let i = 1;
  qSnap.forEach(doc => {
    html += `<div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line); font-size:13px;">
      <span>${i++}. ${doc.data().nickname || doc.id}</span><b>${money(doc.data().totalAsset)}</b></div>`;
  });
  $("rankingList").innerHTML = html;
}

$("loginBtn").onclick = async () => {
  try { await signInWithEmailAndPassword(auth, $("email").value, $("pw").value); }
  catch { alert("로그인 실패"); }
};
$("logoutBtn").onclick = () => signOut(auth);
$("qBtn").onclick = fetchQuote;
$("buyBtn").onclick = buyStock;
$("globalRefreshBtn").onclick = () => { lastRefreshTime = Date.now(); refreshEverything(); updateTradeButtonStatus(); };
window.sellStock = sellStock;
onAuthStateChanged(auth, (user) => {
  if (user) { $("authView").classList.add("hidden"); $("dashView").classList.remove("hidden"); refreshEverything(); updateTradeButtonStatus(); }
  else { $("authView").classList.remove("hidden"); $("dashView").classList.add("hidden"); }
});
