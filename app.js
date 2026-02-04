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

const API = "https://quote-ymhlxyctxq-uc.a.run.app"; 
const $ = (id) => document.getElementById(id);
const money = (v) => `$${Number(v || 0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;

let curPrice = 0, curSym = "", lastRefresh = 0;

// [1] 타이머
function updateTimer() {
  const diff = Date.now() - lastRefresh;
  const isExp = lastRefresh === 0 || diff >= 3600000;
  document.querySelectorAll('#buyBtn, .btn-sell').forEach(b => b.disabled = isExp);
  if (isExp) {
    $("expireMsg").textContent = lastRefresh === 0 ? "시세 갱신 필요" : "⚠️ 시세 만료";
    $("expireMsg").style.color = "var(--up)";
  } else {
    const rem = 3600000 - diff;
    $("expireMsg").textContent = `거래가능: ${Math.floor(rem/60000)}분 ${Math.floor((rem%60000)/1000)}초`;
    $("expireMsg").style.color = "var(--warn)";
  }
}

// [2] 조회 (환율)
async function fetchQuote() {
  const s = $("qSymbol").value.trim().toUpperCase();
  if(!s) return;
  $("qBtn").textContent = "...";
  try {
    const res = await fetch(`${API}?symbol=${encodeURIComponent(s)}`);
    const data = await res.json();
    if(data.ok) {
      let p = data.price;
      if(s.endsWith(".KS") || s.endsWith(".KQ")) {
        const exRes = await fetch(`${API}?symbol=USDKRW=X`);
        const exData = await exRes.json();
        if(exData.ok) p = data.price / exData.price;
      }
      curSym = data.symbol; curPrice = p;
      $("qOutBox").style.display = "flex";
      $("qSymbolText").textContent = curSym;
      $("qPriceText").textContent = money(p);
    } else alert("코드 확인");
  } catch { alert("실패"); }
  finally { $("qBtn").textContent = "조회"; }
}

// [3] 매수 (수량입력 + 평단가 + 내역저장)
async function buyStock() {
  const user = auth.currentUser; if(!user || !curSym || curPrice <= 0) return;
  const qtyInput = prompt(`[${curSym}] 몇 주를 매수할까요?`, "1");
  const qty = parseInt(qtyInput);
  if(isNaN(qty) || qty <= 0) return;

  try {
    await runTransaction(db, async (tx) => {
      const uRef = doc(db, "users", user.email);
      const uSnap = await tx.get(uRef);
      const cost = curPrice * qty;
      if(uSnap.data().cash < cost) throw "현금 부족";
      
      const pRef = doc(db, "users", user.email, "portfolio", curSym);
      const pSnap = await tx.get(pRef);
      let nQty = qty, nAvg = curPrice;
      if(pSnap.exists()) {
        const d = pSnap.data();
        nQty = d.qty + qty;
        nAvg = ((d.avgPrice || d.lastPrice) * d.qty + cost) / nQty;
      }
      tx.update(uRef, { cash: uSnap.data().cash - cost });
      tx.set(pRef, { qty: nQty, avgPrice: nAvg, lastPrice: curPrice }, { merge: true });
      tx.set(doc(collection(db, "users", user.email, "history")), {
        type: "매수", symbol: curSym, qty, price: curPrice, time: serverTimestamp()
      });
    });
    refreshData();
  } catch(e) { alert(e); }
}

// [4] 매도 (수량입력 + 내역저장)
async function sellStock(sym, p) {
  const user = auth.currentUser;
  const pRef = doc(db, "users", user.email, "portfolio", sym);
  const pSnap = await getDoc(pRef);
  const mQty = pSnap.data().qty;
  const qty = parseInt(prompt(`[${sym}] 몇 주를 매도할까요? (보유:${mQty})`, "1"));
  if(isNaN(qty) || qty <= 0 || qty > mQty) return;

  try {
    await runTransaction(db, async (tx) => {
      const uRef = doc(db, "users", user.email);
      const uSnap = await tx.get(uRef);
      tx.update(uRef, { cash: uSnap.data().cash + (p * qty) });
      if(mQty === qty) tx.delete(pRef);
      else tx.update(pRef, { qty: mQty - qty });
      tx.set(doc(collection(db, "users", user.email, "history")), {
        type: "매도", symbol: sym, qty, price: p, time: serverTimestamp()
      });
    });
    refreshData();
  } catch(e) { alert(e); }
}

// [5] 새로고침 (수익률 +/- 표시 로직 유지)
async function refreshData() {
  const user = auth.currentUser; if(!user) return;
  const uSnap = await getDoc(doc(db, "users", user.email));
  const uData = uSnap.data();
  $("userNickname").textContent = uData.nickname || user.email.split('@')[0];
  $("cashText").textContent = money(uData.cash);
  
  let totalAsset = uData.cash;
  const pSnap = await getDocs(collection(db, "users", user.email, "portfolio"));
  let pHtml = "";
  pSnap.forEach(d => {
    const item = d.data();
    const avg = item.avgPrice || item.lastPrice;
    const cur = item.lastPrice; 
    const rate = ((cur - avg) / avg * 100).toFixed(2);
    const color = rate > 0 ? "var(--up)" : (rate < 0 ? "var(--down)" : "var(--muted)");
    totalAsset += (item.qty * cur);
    pHtml += `<div class="item-flex">
      <div><b>${d.id}</b> <small style="color:var(--muted)">${item.qty}주</small><br>
      <small style="color:${color}">${rate > 0 ? '+':''}${rate}% (평단:${money(avg)})</small></div>
      <button onclick="window.sellStock('${d.id}', ${cur})" class="btn btn-sell">매도</button>
    </div>`;
  });
  $("portfolioList").innerHTML = pHtml || "기록 없음";
  $("totalAssetsText").textContent = money(totalAsset);
  await setDoc(doc(db, "users", user.email), { totalAsset }, { merge: true });

  // 랭킹
  const rSnap = await getDocs(query(collection(db, "users"), orderBy("totalAsset", "desc"), limit(10)));
  let rHtml = ""; let rank = 1;
  rSnap.forEach(d => rHtml += `<div class="item-flex"><span>${rank++}. ${d.data().nickname || d.id.split('@')[0]}</span><b>${money(d.data().totalAsset)}</b></div>`);
  $("rankingList").innerHTML = rHtml;

  // 거래내역 (10개)
  const hSnap = await getDocs(query(collection(db, "users", user.email, "history"), orderBy("time", "desc"), limit(10)));
  let hHtml = "";
  hSnap.forEach(d => {
    const h = d.data();
    hHtml += `<div class="item-flex" style="font-size:12px;"><span>${h.type === '매수'?'🔴':'🔵'} ${h.symbol}</span><span>${h.qty}주 (${money(h.price)})</span></div>`;
  });
  $("transactionList").innerHTML = hHtml || "기록 없음";
}

$("loginBtn").onclick = () => signInWithEmailAndPassword(auth, $("email").value, $("pw").value).catch(()=>alert("로그인 실패"));
$("logoutBtn").onclick = () => signOut(auth);
$("qBtn").onclick = fetchQuote;
$("buyBtn").onclick = buyStock;
$("globalRefreshBtn").onclick = () => { lastRefresh = Date.now(); refreshData(); updateTimer(); };
window.sellStock = sellStock;
onAuthStateChanged(auth, (u) => {
  if(u) { $("authView").classList.add("hidden"); $("dashView").classList.remove("hidden"); refreshData(); }
  else { $("authView").classList.remove("hidden"); $("dashView").classList.add("hidden"); }
});
setInterval(updateTimer, 1000);
