import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, query, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
// [추가] 서버 함수 호출을 위해 필요한 기능
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";

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
// [추가] 서버 함수 연동
const functions = getFunctions(app);
const tradeStock = httpsCallable(functions, 'tradeStock');

const API = "https://quote-ymhlxyctxq-uc.a.run.app"; 
const $ = (id) => document.getElementById(id);
const money = (v) => `$${Number(v || 0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;

let curPrice = 0, curSym = "", lastRefresh = 0;

function updateTimer() {
  const now = Date.now();
  const diff = Math.max(0, 30 - Math.floor((now - lastRefresh) / 1000));
  $("timer").innerText = `새로고침: ${diff}초`;
  if (diff <= 0) fetchQuote();
}
setInterval(updateTimer, 1000);

async function fetchQuote() {
  const sym = $("symInput").value.trim().toUpperCase();
  if (!sym) return;
  lastRefresh = Date.now();
  $("qBtn").disabled = true;
  try {
    const res = await fetch(`${API}/quote?symbol=${sym}`);
    const data = await res.json();
    if (data.ok) {
      curSym = data.symbol;
      curPrice = data.price;
      $("qResult").innerHTML = `
        <div class="flex justify-between items-center bg-gray-50 p-3 rounded">
          <span class="font-bold text-lg">${curSym}</span>
          <span class="text-blue-600 font-bold text-xl">${money(curPrice)}</span>
        </div>
      `;
      $("buyBtn").classList.remove("hidden");
    } else {
      alert("종목을 찾을 수 없습니다.");
    }
  } catch (e) {
    alert("시세 호출 실패");
  } finally {
    $("qBtn").disabled = false;
  }
}

// [보안 강화] 매수 함수
async function buyStock() {
  const user = auth.currentUser; 
  if(!user || !curSym || curPrice <= 0) return;
  const qty = parseInt(prompt(`[${curSym}] 매수 수량:`, "1"));
  if(isNaN(qty) || qty <= 0) return;

  $("buyBtn").disabled = true;
  try {
    // 이제 직접 DB를 수정하지 않고 서버 함수에 요청합니다.
    const result = await tradeStock({
      type: "BUY",
      symbol: curSym,
      qty: qty,
      price: curPrice
    });

    if(result.data.success) {
      alert(`[${curSym}] ${qty}주 매수 완료!`);
      refreshData();
    }
  } catch(e) { 
    alert("매수 실패: " + e.message); 
  } finally {
    $("buyBtn").disabled = false;
  }
}

// [보안 강화] 매도 함수
async function sellStock(sym, currentPrice) {
  const user = auth.currentUser;
  const pRef = doc(db, "users", user.email, "portfolio", sym);
  const pSnap = await getDoc(pRef);
  if(!pSnap.exists()) return;

  const mQty = pSnap.data().qty;
  const qty = parseInt(prompt(`[${sym}] 매도 수량 (보유:${mQty}):`, "1"));
  if(isNaN(qty) || qty <= 0 || qty > mQty) return;

  try {
    // 이제 직접 DB를 수정하지 않고 서버 함수에 요청합니다.
    const result = await tradeStock({
      type: "SELL",
      symbol: sym,
      qty: qty,
      price: currentPrice
    });

    if(result.data.success) {
      alert(`[${sym}] ${qty}주 매도 완료!`);
      refreshData();
    }
  } catch(e) { 
    alert("매도 실패: " + e.message); 
  }
}

async function refreshData() {
  const user = auth.currentUser;
  if (!user) return;

  const uRef = doc(db, "users", user.email);
  const uSnap = await getDoc(uRef);
  if (!uSnap.exists()) return;
  const userData = uSnap.data();

  // 잔고 표시
  $("userCash").innerText = money(userData.cash);

  // 포트폴리오 & 내 자산 가치 계산
  const pCol = collection(db, "users", user.email, "portfolio");
  const pSnaps = await getDocs(pCol);
  let pHtml = "", stockTotal = 0;

  for (const s of pSnaps.docs) {
    const d = s.data();
    if (d.qty <= 0) continue;
    try {
      const res = await fetch(`${API}/quote?symbol=${s.id}`);
      const quote = await res.json();
      const price = quote.ok ? quote.price : 0;
      const val = price * d.qty;
      stockTotal += val;
      pHtml += `
        <div class="p-3 bg-white border rounded shadow-sm">
          <div class="flex justify-between items-center mb-2">
            <span class="font-bold">${s.id} (${d.qty}주)</span>
            <span class="text-blue-600 font-semibold">${money(price)}</span>
          </div>
          <div class="flex justify-between items-center text-sm text-gray-500">
            <span>평가금액: ${money(val)}</span>
            <button onclick="sellStock('${s.id}', ${price})" class="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 transition">매도</button>
          </div>
        </div>
      `;
    } catch (e) { console.error(e); }
  }
  $("portfolioList").innerHTML = pHtml || "보유 주식 없음";
  
  const finalTotalAsset = userData.cash + stockTotal;
  $("totalAsset").innerText = money(finalTotalAsset);
  await setDoc(uRef, { totalAsset: finalTotalAsset }, { merge: true });

  // 랭킹 (Top 10)
  const qRanking = query(collection(db, "users"), orderBy("totalAsset", "desc"), limit(10));
  const rSnaps = await getDocs(qRanking);
  let rHtml = "";
  rSnaps.docs.forEach((d, i) => {
    const data = d.data();
    rHtml += `<div class="flex justify-between p-2 ${d.id === user.email ? 'bg-yellow-100 font-bold' : ''}">
      <span>${i + 1}. ${data.nickname || d.id}</span>
      <span>${money(data.totalAsset)}</span>
    </div>`;
  });
  $("rankingList").innerHTML = rHtml;

  // 거래 내역 (최근 10개)
  const qHistory = query(collection(db, "users", user.email, "history"), orderBy("timestamp", "desc"), limit(10));
  const hSnaps = await getDocs(qHistory);
  let hHtml = "";
  hSnaps.docs.forEach(doc => {
    const h = doc.data();
    const typeLabel = h.type === 'BUY' ? '🔴 매수' : '🔵 매도';
    hHtml += `<div class="item-flex" style="font-size:12px;"><span>${typeLabel} ${h.symbol}</span><span>${h.qty}주 (${money(h.price)})</span></div>`;
  });
  $("transactionList").innerHTML = hHtml || "내역 없음";
}

$("loginBtn").onclick = () => signInWithEmailAndPassword(auth, $("email").value, $("pw").value).catch(()=>alert("로그인 실패"));
$("logoutBtn").onclick = () => signOut(auth);
$("qBtn").onclick = fetchQuote;
$("buyBtn").onclick = buyStock;
$("globalRefreshBtn").onclick = () => { lastRefresh = Date.now(); refreshData(); updateTimer(); };
window.sellStock = sellStock;

onAuthStateChanged(auth, async (u) => {
  if (u) {
    const uRef = doc(db, "users", u.email);
    const uSnap = await getDoc(uRef);
    if (!uSnap.exists()) {
      await setDoc(uRef, {
        email: u.email,
        nickname: u.email.split('@')[0],
        cash: 70000,
        totalAsset: 70000,
        createdAt: serverTimestamp()
      });
    }
    $("authView").classList.add("hidden");
    $("dashView").classList.remove("hidden");
    refreshData();
  } else {
    $("authView").classList.remove("hidden");
    $("dashView").classList.add("hidden");
  }
});
