import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, runTransaction, collection, getDocs, query, orderBy, limit, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
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

let currentStockPrice = 0, currentSymbol = "", lastRefreshTime = 0;

// [타이머 및 버튼 제어]
function updateTradeButtonStatus() {
  const now = Date.now(), limitTime = 3600000, diff = now - lastRefreshTime;
  if (lastRefreshTime > 0 && diff < limitTime) {
    document.querySelectorAll('#buyBtn, .btn-sell').forEach(b => b.disabled = false);
    const rem = limitTime - diff;
    $("expireMsg").textContent = `남은 시간: ${Math.floor(rem/60000)}:${String(Math.floor((rem%60000)/1000)).padStart(2,'0')}`;
  } else {
    document.querySelectorAll('#buyBtn, .btn-sell').forEach(b => b.disabled = true);
    $("expireMsg").textContent = lastRefreshTime === 0 ? "남은 시간: 60:00" : "⚠️ 시세 만료 (갱신 필요)";
  }
}

// [시세 조회]
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
    } else alert("종목 오류");
  } catch { alert("조회 실패"); }
  finally { $("qBtn").textContent = "조회"; }
}

// [매수] 수량 입력 + 내역 저장
async function buyStock() {
  const user = auth.currentUser; if (!user || !currentSymbol || currentStockPrice <= 0) return;
  const qty = parseInt(prompt(`[${currentSymbol}] 매수 수량:`, "1"));
  if (isNaN(qty) || qty <= 0) return;

  const cost = currentStockPrice * qty;
  try {
    await runTransaction(db, async (tx) => {
      const uRef = doc(db, "users", user.email);
      const uSnap = await tx.get(uRef);
      if (uSnap.data().cash < cost) throw "잔액 부족";
      
      const pRef = doc(db, "users", user.email, "portfolio", currentSymbol);
      const pSnap = await tx.get(pRef);
      const curQty = pSnap.exists() ? pSnap.data().qty : 0;
      
      tx.update(uRef, { cash: uSnap.data().cash - cost });
      tx.set(pRef, { qty: curQty + qty, lastPrice: currentStockPrice }, { merge: true });
      tx.set(doc(collection(db, "users", user.email, "history")), {
        type: "BUY", symbol: currentSymbol, qty, price: currentStockPrice, time: serverTimestamp()
      });
    });
    refreshEverything();
  } catch (e) { alert(e); }
}

// [매도] 수량 입력 + 내역 저장
async function sellStock(symbol, price) {
  const user = auth.currentUser;
  const pRef = doc(db, "users", user.email, "portfolio", symbol);
  const pSnap = await getDoc(pRef);
  const maxQty = pSnap.data().qty;
  const qty = parseInt(prompt(`[${symbol}] 매도 수량 (보유:${maxQty}):`, "1"));
  if (isNaN(qty) || qty <= 0 || qty > maxQty) return alert("수량 오류");

  try {
    await runTransaction(db, async (tx) => {
      const uRef = doc(db, "users", user.email);
      const uSnap = await tx.get(uRef);
      tx.update(uRef, { cash: uSnap.data().cash + (price * qty) });
      if (maxQty === qty) tx.delete(pRef);
      else tx.update(pRef, { qty: maxQty - qty });
      tx.set(doc(collection(db, "users", user.email, "history")), {
        type: "SELL", symbol, qty, price, time: serverTimestamp()
      });
    });
    refreshEverything();
  } catch (e) { alert(e); }
}

// [데이터 동기화] 자산, 랭킹, 거래내역
async function refreshEverything() {
  const user = auth.currentUser; if (!user) return;
  const uSnap = await getDoc(doc(db, "users", user.email));
  const userData = uSnap.data();
  $("userNickname").textContent = userData.nickname || user.email.split('@')[0];
  $("userEmail").textContent = user.email;
  $("cashText").textContent = money(userData.cash);
  
  // 포트폴리오 & 총자산 계산
  let totalAsset = userData.cash;
  const pSnap = await getDocs(collection(db, "users", user.email, "portfolio"));
  let pHtml = "";
  pSnap.forEach(d => {
    const data = d.data(); totalAsset += (data.qty * data.lastPrice);
    pHtml += `<div class="portfolio-item"><div><b>${d.id}</b><br><small>${data.qty}주</small></div>
              <button onclick="window.sellStock('${d.id}', ${data.lastPrice})" class="btn-sell">매도</button></div>`;
  });
  $("portfolioList").innerHTML = pHtml;
  $("totalAssetsText").textContent = money(totalAsset);
  await setDoc(doc(db, "users", user.email), { totalAsset }, { merge: true });

  // 랭킹 조회
  const qR = query(collection(db, "users"), orderBy("totalAsset", "desc"), limit(10));
  const rSnap = await getDocs(qR);
  let rHtml = ""; let i = 1;
  rSnap.forEach(d => rHtml += `<div style="display:flex;justify-content:space-between;padding:5px 0;"><span>${i++}. ${d.data().nickname || d.id.split('@')[0]}</span><b>${money(d.data().totalAsset)}</b></div>`);
  $("rankingList").innerHTML = rHtml;

  // 거래 내역 조회
  const qH = query(collection(db, "users", user.email, "history"), orderBy("time", "desc"), limit(5));
  const hSnap = await getDocs(qH);
  let hHtml = "";
  hSnap.forEach(d => {
    const data = d.data();
    hHtml += `<div class="history-item"><span>${data.type === 'BUY'?'🔴매수':'🔵매도'} ${data.symbol}</span><span>${data.qty}주 (${money(data.price)})</span></div>`;
  });
  $("transactionList").innerHTML = hHtml || "<div class='muted'>내역 없음</div>";
}

// 버튼 연결
$("loginBtn").onclick = async () => { try { await signInWithEmailAndPassword(auth, $("email").value, $("pw").value); } catch { alert("로그인 실패"); } };
$("logoutBtn").onclick = () => signOut(auth);
$("qBtn").onclick = fetchQuote;
$("buyBtn").onclick = buyStock;
$("globalRefreshBtn").onclick = () => { lastRefreshTime = Date.now(); refreshEverything(); updateTradeButtonStatus(); };
window.sellStock = sellStock;

onAuthStateChanged(auth, (u) => {
  if (u) { $("authView").classList.add("hidden"); $("dashView").classList.remove("hidden"); refreshEverything(); }
  else { $("authView").classList.remove("hidden"); $("dashView").classList.add("hidden"); }
});

setInterval(updateTradeButtonStatus, 1000);
