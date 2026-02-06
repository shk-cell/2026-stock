import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, query, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyCzjJDKMbzHjs7s7jMnfK64bbHEEmpyZxI",
  authDomain: "stock-62c76.firebaseapp.com",
  projectId: "stock-62c76",
  storageBucket: "stock-62c76.firebasestorage.app",
  messagingSenderId: "149071161310",
  appId: "1:149071161310:web:79ebd6",
};

// [초기화]
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// [중요] functions 변수명을 중복되지 않게 functionsInstance로 설정
// 지역은 선생님의 함수 위치인 "asia-northeast3" (서울)로 설정했습니다.
const functionsInstance = getFunctions(app, "asia-northeast3"); 
const tradeStock = httpsCallable(functionsInstance, 'tradeStock');

const API = "https://quote-ymhlxyctxq-uc.a.run.app"; 
const $ = (id) => document.getElementById(id);
const money = (v) => `$${Number(v || 0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;

let curPrice = 0, curSym = "", lastRefresh = 0;

// 타이머 및 버튼 제어
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

// 시세 조회
async function fetchQuote() {
  const sym = $("qSymbol").value.trim().toUpperCase();
  if (!sym) return;
  $("qBtn").disabled = true;
  try {
    const res = await fetch(`${API}/quote?symbol=${sym}`);
    const data = await res.json();
    if (data.ok) {
      curSym = data.symbol; curPrice = data.price;
      if($("qOutBox")) $("qOutBox").style.display = "flex";
      if($("qSymbolText")) $("qSymbolText").textContent = curSym;
      if($("qPriceText")) $("qPriceText").textContent = money(curPrice);
      lastRefresh = Date.now();
      updateTimer();
    } else { alert("종목을 찾을 수 없습니다."); }
  } catch (e) { alert("시세 호출 실패"); } finally { $("qBtn").disabled = false; }
}

// 매수 (서버 함수 호출)
async function buyStock() {
  const user = auth.currentUser;
  if(!user || !curSym || curPrice <= 0) return;
  const qty = parseInt(prompt(`[${curSym}] 매수 수량:`, "1"));
  if(isNaN(qty) || qty <= 0) return;
  $("buyBtn").disabled = true;
  try {
    const result = await tradeStock({ type: "BUY", symbol: curSym, qty: qty, price: curPrice });
    if(result.data.success) { alert(`[${curSym}] ${qty}주 매수 완료!`); refreshData(); }
  } catch(e) { alert("매수 실패: " + e.message); } finally { $("buyBtn").disabled = false; }
}

// 매도 (서버 함수 호출)
async function sellStock(sym, currentPrice) {
  const user = auth.currentUser;
  const qty = parseInt(prompt(`[${sym}] 매도 수량:`, "1"));
  if(isNaN(qty) || qty <= 0) return;
  try {
    const result = await tradeStock({ type: "SELL", symbol: sym, qty: qty, price: currentPrice });
    if(result.data.success) { alert(`[${sym}] ${qty}주 매도 완료!`); refreshData(); }
  } catch(e) { alert("매도 실패: " + e.message); }
}

// 데이터 갱신
async function refreshData() {
  const user = auth.currentUser; if (!user) return;
  try {
    const uSnap = await getDoc(doc(db, "users", user.email));
    if (!uSnap.exists()) return;
    const userData = uSnap.data();
    if($("userNickname")) $("userNickname").textContent = userData.nickname || user.email.split('@')[0];
    if($("userEmail")) $("userEmail").textContent = user.email;
    if($("cashText")) $("cashText").textContent = money(userData.cash);
    const pSnaps = await getDocs(collection(db, "users", user.email, "portfolio"));
    let pHtml = "", stockTotal = 0;
    for (const s of pSnaps.docs) {
      const d = s.data(); if (d.qty <= 0) continue;
      const res = await fetch(`${API}/quote?symbol=${s.id}`);
      const quote = await res.json();
      const price = quote.ok ? quote.price : 0;
      const val = price * d.qty; stockTotal += val;
      pHtml += `<div class="item-flex"><div style="flex:1;"><b style="font-size:15px;">${s.id}</b> <small>${d.qty}주</small><br><span style="font-size:12px; color:var(--warn);">현재가: ${money(price)}</span></div><button onclick="window.sellStock('${s.id}', ${price})" class="btn btn-trade btn-sell">매도</button></div>`;
    }
    if($("portfolioList")) $("portfolioList").innerHTML = pHtml || "보유 없음";
    const total = (userData.cash || 0) + stockTotal;
    if($("totalAssetsText")) $("totalAssetsText").textContent = money(total);
    await setDoc(doc(db, "users", user.email), { totalAsset: total }, { merge: true });
    const rSnaps = await getDocs(query(collection(db, "users"), orderBy("totalAsset", "desc"), limit(10)));
    let rHtml = ""; rSnaps.docs.forEach((d, i) => {
      const rd = d.data(); rHtml += `<div class="item-flex"><span>${i + 1}. ${rd.nickname || d.id.split('@')[0]}</span><b>${money(rd.totalAsset)}</b></div>`;
    });
    if($("rankingList")) $("rankingList").innerHTML = rHtml;
    const hSnaps = await getDocs(query(collection(db, "users", user.email, "history"), orderBy("timestamp", "desc"), limit(10)));
    let hHtml = ""; hSnaps.docs.forEach(doc => {
      const h = doc.data(); const typeLabel = (h.type === 'BUY' || h.type === '매수') ? '🔴 매수' : '🔵 매도';
      hHtml += `<div class="item-flex" style="font-size:12px;"><span>${typeLabel} ${h.symbol}</span><span>${h.qty}주 (${money(h.price)})</span></div>`;
    });
    if($("transactionList")) $("transactionList").innerHTML = hHtml || "내역 없음";
  } catch (e) { console.error(e); }
}

// 이벤트 바인딩 (안전장치 포함)
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
    const uRef = doc(db, "users", u.email);
    const uSnap = await getDoc(uRef);
    if (!uSnap.exists()) {
      await setDoc(uRef, { email: u.email, nickname: u.email.split('@')[0], cash: 70000, totalAsset: 70000, createdAt: serverTimestamp() });
    }
    $("authView").classList.add("hidden"); $("dashView").classList.remove("hidden");
    refreshData();
  } else { 
    $("authView").classList.remove("hidden"); $("dashView").classList.add("hidden"); 
  }
});
