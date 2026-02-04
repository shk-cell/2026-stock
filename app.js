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

function updateTimer() {
  const diff = Date.now() - lastRefresh;
  const isExp = lastRefresh === 0 || diff >= 3600000;
  document.querySelectorAll('#buyBtn, .btn-sell').forEach(b => b.disabled = isExp);
  if (isExp) $("expireMsg").textContent = "시세 갱신 필요";
  else {
    const rem = 3600000 - diff;
    $("expireMsg").textContent = `거래 가능: ${Math.floor(rem/60000)}분 ${Math.floor((rem%60000)/1000)}초`;
  }
}

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
  } catch { alert("조회 실패"); }
  finally { $("qBtn").textContent = "조회"; }
}

async function buyStock() {
  const user = auth.currentUser; if(!user || !curSym || curPrice <= 0) return;
  const qty = parseInt(prompt(`[${curSym}] 매수 수량:`, "1"));
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

async function sellStock(sym, currentPrice) {
  const user = auth.currentUser;
  const pRef = doc(db, "users", user.email, "portfolio", sym);
  const pSnap = await getDoc(pRef);
  const mQty = pSnap.data().qty;
  const qty = parseInt(prompt(`[${sym}] 매도 수량 (보유:${mQty}):`, "1"));
  if(isNaN(qty) || qty <= 0 || qty > mQty) return;

  try {
    await runTransaction(db, async (tx) => {
      const uRef = doc(db, "users", user.email);
      const uSnap = await tx.get(uRef);
      tx.update(uRef, { cash: uSnap.data().cash + (currentPrice * qty) });
      if(mQty === qty) tx.delete(pRef);
      else tx.update(pRef, { qty: mQty - qty });
      tx.set(doc(collection(db, "users", user.email, "history")), {
        type: "매도", symbol: sym, qty, price: currentPrice, time: serverTimestamp()
      });
    });
    refreshData();
  } catch(e) { alert(e); }
}

async function refreshData() {
  const user = auth.currentUser; if(!user) return;
  const uSnap = await getDoc(doc(db, "users", user.email));
  const uData = uSnap.data();
  $("userNickname").textContent = uData.nickname || user.email.split('@')[0];
  $("cashText").textContent = money(uData.cash);
  
  let total = uData.cash;
  const pSnap = await getDocs(collection(db, "users", user.email, "portfolio"));
  let pHtml = "";
  pSnap.forEach(d => {
    const item = d.data();
    const avg = item.avgPrice || item.lastPrice;
    const cur = item.lastPrice; 
    const rate = ((cur - avg) / avg * 100).toFixed(2);
    const color = rate > 0 ? "var(--up)" : (rate < 0 ? "var(--down)" : "var(--muted)");
    total += (item.qty * cur);
    
    pHtml += `<div class="item-flex">
      <div style="flex:1;">
        <b style="font-size:15px;">${d.id}</b> <small style="color:var(--muted)">${item.qty}주</small><br>
        <span style="font-size:12px; color:var(--muted);">구매: ${money(avg)}</span> | 
        <span style="font-size:12px; color:var(--warn);">현재: ${money(cur)}</span><br>
        <b style="color:${color}; font-size:14px;">${rate > 0 ? '+':''}${rate}% 수익중</b>
      </div>
      <button onclick="window.sellStock('${d.id}', ${cur})" class="btn btn-trade btn-sell">매도</button>
    </div>`;
  });
  $("portfolioList").innerHTML = pHtml || "보유 없음";
  $("totalAssetsText").textContent = money(total);
  await setDoc(doc(db, "users", user.email), { totalAsset: total }, { merge: true });

  const rSnap = await getDocs(query(collection(db, "users"), orderBy("totalAsset", "desc"), limit(10)));
  let rHtml = ""; let rank = 1;
  rSnap.forEach(d => rHtml += `<div class="item-flex"><span>${rank++}. ${d.data().nickname || d.id.split('@')[0]}</span><b>${money(d.data().totalAsset)}</b></div>`);
  $("rankingList").innerHTML = rHtml;

  const hSnap = await getDocs(query(collection(db, "users", user.email, "history"), orderBy("time", "desc"), limit(10)));
  let hHtml = "";
  hSnap.forEach(d => {
    const h = d.data();
    hHtml += `<div class="item-flex" style="font-size:12px;"><span>${h.type === '매수'?'🔴':'🔵'} ${h.symbol}</span><span>${h.qty}주 (${money(h.price)})</span></div>`;
  });
  $("transactionList").innerHTML = hHtml || "내역 없음";
}

$("loginBtn").onclick = () => signInWithEmailAndPassword(auth, $("email").value, $("pw").value).catch(()=>alert("실패"));
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
