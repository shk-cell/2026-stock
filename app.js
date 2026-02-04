import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, runTransaction, collection, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// 1. 파이어베이스 설정
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

// 2. 상수 및 전역 변수
const QUOTE_ENDPOINT = "https://quote-ymhlxyctxq-uc.a.run.app"; 
const $ = (id) => document.getElementById(id);
const money = (v) => `$${Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

let currentStockPrice = 0;
let currentSymbol = "";
let lastRefreshTime = 0;

// 3. 거래 버튼 및 타이머 상태 업데이트
function updateTradeButtonStatus() {
  const now = Date.now();
  const limitTime = 3600000; // 60분 (밀리초)
  const diff = now - lastRefreshTime;

  if (lastRefreshTime > 0 && diff < limitTime) {
    // 60분 이내라면 버튼 활성화
    document.querySelectorAll('#buyBtn, .btn-sell').forEach(btn => btn.disabled = false);
    const remaining = limitTime - diff;
    const min = Math.floor(remaining / 60000);
    const sec = Math.floor((remaining % 60000) / 1000);
    $("expireMsg").textContent = `남은 시간: ${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    $("expireMsg").style.color = "var(--warn)";
  } else {
    // 60분 경과 시 버튼 비활성화
    document.querySelectorAll('#buyBtn, .btn-sell').forEach(btn => btn.disabled = true);
    $("expireMsg").textContent = lastRefreshTime === 0 ? "남은 시간: 60:00" : "⚠️ 시세 만료 (갱신 필요)";
    $("expireMsg").style.color = lastRefreshTime === 0 ? "var(--muted)" : "var(--up)";
  }
}

// 4. 주식 시세 조회 (한국 주식 환율 계산 포함)
async function fetchQuote() {
  const s = $("qSymbol").value.trim().toUpperCase();
  if (!s) return;
  $("qBtn").textContent = "...";
  try {
    const r = await fetch(`${QUOTE_ENDPOINT}?symbol=${encodeURIComponent(s)}`);
    const d = await r.json();
    if (d.ok) {
      let price = d.price;
      // 한국 주식(.KS, .KQ)일 경우 환율 적용
      if (s.endsWith(".KS") || s.endsWith(".KQ")) {
        const exR = await fetch(`${QUOTE_ENDPOINT}?symbol=USDKRW=X`);
        const exD = await exR.json();
        if (exD.ok) price = d.price / exD.price;
      }
      currentSymbol = d.symbol; 
      currentStockPrice = price;
      $("qOutBox").style.display = "flex";
      $("qSymbolText").textContent = d.symbol;
      $("qPriceText").textContent = money(price);
    } else { alert("종목을 찾을 수 없습니다."); }
  } catch { alert("조회 중 오류가 발생했습니다."); }
  finally { $("qBtn").textContent = "조회"; }
}

// 5. 매수 로직
async function buyStock() {
  const user = auth.currentUser;
  if (!user || !currentSymbol || currentStockPrice <= 0) return;
  try {
    await runTransaction(db, async (transaction) => {
      const userRef = doc(db, "users", user.email);
      const userSnap = await transaction.get(userRef);
      const userData = userSnap.data();
      if (userData.cash < currentStockPrice) throw "잔액이 부족합니다.";
      
      const portRef = doc(db, "users", user.email, "portfolio", currentSymbol);
      const portSnap = await transaction.get(portRef);
      const currentQty = portSnap.exists() ? portSnap.data().qty : 0;
      
      transaction.update(userRef, { cash: userData.cash - currentStockPrice });
      transaction.set(portRef, { qty: currentQty + 1, lastPrice: currentStockPrice }, { merge: true });
    });
    await refreshEverything();
  } catch (e) { alert(e); }
}

// 6. 매도 로직
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

// 7. 데이터 동기화 (내 정보 + 포트폴리오 + 랭킹 업데이트 호출)
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
    const d = dDoc.data(); 
    totalAsset += (d.qty * d.lastPrice);
    html += `<div class="portfolio-item">
               <div><b>${dDoc.id}</b><br><small>${d.qty}주</small></div>
               <button onclick="window.sellStock('${dDoc.id}', ${d.lastPrice})" class="btn-sell">매도</button>
             </div>`;
  });
  $("portfolioList").innerHTML = html;
  $("totalAssetsText").textContent = money(totalAsset);
  
  // 총 자산 DB 업데이트 후 랭킹 새로고침
  await setDoc(doc(db, "users", user.email), { totalAsset }, { merge: true });
  fetchRanking();
}

// 8. 랭킹 데이터 호출
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

// 9. 이벤트 리스너 등록
$("loginBtn").onclick = async () => {
  try { await signInWithEmailAndPassword(auth, $("email").value, $("pw").value); }
  catch { alert("로그인 정보를 확인해주세요."); }
};

$("logoutBtn").onclick = () => signOut(auth);
$("qBtn").onclick = fetchQuote;
$("buyBtn").onclick = buyStock;
$("globalRefreshBtn").onclick = () => { 
  lastRefreshTime = Date.now(); 
  refreshEverything(); 
  updateTradeButtonStatus(); 
};

// 매도 버튼은 동적으로 생성되므로 window 객체에 할당
window.sellStock = sellStock;

// 10. 초기 구동 로직
onAuthStateChanged(auth, (user) => {
  if (user) { 
    $("authView").classList.add("hidden"); 
    $("dashView").classList.remove("hidden"); 
    refreshEverything(); // 로그인 시 자동 갱신
  } else { 
    $("authView").classList.remove("hidden"); 
    $("dashView").classList.add("hidden"); 
  }
});

// 타이머 숫자 업데이트만 1초마다 수행 (네트워크 요청 없음)
setInterval(updateTradeButtonStatus, 1000);
