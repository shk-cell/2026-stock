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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const functions = getFunctions(app);
const tradeStock = httpsCallable(functions, 'tradeStock');

const API = "https://quote-ymhlxyctxq-uc.a.run.app"; 
const $ = (id) => document.getElementById(id);
const money = (v) => `$${Number(v || 0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;

let curPrice = 0, curSym = "", lastRefresh = 0;

// 타이머 업데이트 (HTML의 expireMsg ID 사용)
function updateTimer() {
  const msgElem = $("expireMsg");
  if (!msgElem) return;

  const diff = Date.now() - lastRefresh;
  const isExp = lastRefresh === 0 || diff >= 3600000; // 1시간 기준

  // 매수 버튼 상태 제어
  if($("buyBtn")) $("buyBtn").disabled = isExp || !curSym;

  if (isExp) {
    msgElem.textContent = "시세 갱신 필요";
  } else {
    const rem = 3600000 - diff;
    const min = Math.floor(rem / 60000);
    const sec = Math.floor((rem % 60000) / 1000);
    msgElem.textContent = `거래 가능: ${min}분 ${sec}초`;
  }
}
setInterval(updateTimer, 1000);

// 시세 조회 (HTML의 qSymbol, qSymbolText, qPriceText ID 사용)
async function fetchQuote() {
  const sym = $("qSymbol").value.trim().toUpperCase();
  if (!sym) return;
  
  lastRefresh = Date.now();
  $("qBtn").disabled = true;
  
  try {
    const res = await fetch(`${API}/quote?symbol=${sym}`);
    const data = await res.json();
    if (data.ok) {
      curSym = data.symbol;
      curPrice = data.price;
      
      if($("qSymbolText")) $("qSymbolText").textContent = curSym;
      if($("qPriceText")) $("qPriceText").textContent = money(curPrice);
      if($("buyBtn")) $("buyBtn").disabled = false;
    } else {
      alert("종목을 찾을 수 없습니다.");
    }
  } catch (e) {
    alert("시세 호출 실패");
  } finally {
    $("qBtn").disabled = false;
  }
}

// 매수 함수 (서버 호출 방식)
async function buyStock() {
  const user = auth.currentUser;
  if(!user || !curSym || curPrice <= 0) return;
  
  const qty = parseInt(prompt(`[${curSym}] 매수 수량:`, "1"));
  if(isNaN(qty) || qty <= 0) return;

  $("buyBtn").disabled = true;
  try {
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

// 매도 함수 (서버 호출 방식)
async function sellStock(sym, currentPrice) {
  const user = auth.currentUser;
  const qty = parseInt(prompt(`[${sym}] 매도 수량:`, "1"));
  if(isNaN(qty) || qty <= 0) return;

  try {
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

// 데이터 갱신 (HTML ID: cashText, totalAssetsText, userNickname, userEmail 등)
async function refreshData() {
  const user = auth.currentUser;
  if (!user) return;

  try {
    const uRef = doc(db, "users", user.email);
    const uSnap = await getDoc(uRef);
    if (!uSnap.exists()) return;
    const userData = uSnap.data();

    // 상단 정보 업데이트
    if($("userNickname")) $("userNickname").textContent = userData.nickname || user.email.split('@')[0];
    if($("userEmail")) $("userEmail").textContent = user.email;
    if($("cashText")) $("cashText").textContent = money(userData.cash);

    // 포트폴리오 계산
    const pCol = collection(db, "users", user.email, "portfolio");
    const pSnaps = await getDocs(pCol);
    let pHtml = "", stockTotal = 0;

    for (const s of pSnaps.docs) {
      const d = s.data();
      if (d.qty <= 0) continue;
      
      const res = await fetch(`${API}/quote?symbol=${s.id}`);
      const quote = await res.json();
      const price = quote.ok ? quote.price : 0;
      const val = price * d.qty;
      stockTotal += val;
      
      pHtml += `
        <div class="portfolio-item" style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid var(--line);">
          <div>
            <div style="font-weight:bold;">${s.id}</div>
            <div style="font-size:12px; color:var(--muted);">${d.qty}주 보유</div>
          </div>
          <div style="text-align:right;">
            <div style="font-weight:bold;">${money(val)}</div>
            <button onclick="sellStock('${s.id}', ${price})" class="btn-sell" style="padding:2px 8px; font-size:11px; background:var(--up); color:white; border:none; border-radius:4px; cursor:pointer;">매도</button>
          </div>
        </div>
      `;
    }
    if($("portfolioList")) $("portfolioList").innerHTML = pHtml || "<div style='padding:20px; text-align:center; color:var(--muted);'>보유 주식이 없습니다.</div>";
    
    const finalTotalAsset = (userData.cash || 0) + stockTotal;
    if($("totalAssetsText")) $("totalAssetsText").textContent = money(finalTotalAsset);
    
    // 총자산 업데이트
    await setDoc(uRef, { totalAsset: finalTotalAsset }, { merge: true });

    // 랭킹 표시
    const qRanking = query(collection(db, "users"), orderBy("totalAsset", "desc"), limit(10));
    const rSnaps = await getDocs(qRanking);
    let rHtml = "";
    rSnaps.docs.forEach((d, i) => {
      const rd = d.data();
      rHtml += `
        <div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid var(--line); ${d.id === user.email ? 'background:rgba(43,124,255,0.1);' : ''}">
          <span>${i + 1}. ${rd.nickname || d.id.split('@')[0]}</span>
          <span style="font-weight:bold;">${money(rd.totalAsset)}</span>
        </div>`;
    });
    if($("rankingList")) $("rankingList").innerHTML = rHtml;

    // 거래 내역 표시
    const qHistory = query(collection(db, "users", user.email, "history"), orderBy("timestamp", "desc"), limit(10));
    const hSnaps = await getDocs(qHistory);
    let hHtml = "";
    hSnaps.docs.forEach(doc => {
      const h = doc.data();
      const typeLabel = (h.type === 'BUY' || h.type === '매수') ? '🔴 매수' : '🔵 매도';
      hHtml += `
        <div style="display:flex; justify-content:space-between; font-size:12px; padding:6px 0; border-bottom:1px solid var(--line);">
          <span>${typeLabel} ${h.symbol}</span>
          <span>${h.qty}주 (${money(h.price)})</span>
        </div>`;
    });
    if($("transactionList")) $("transactionList").innerHTML = hHtml || "<div style='text-align:center; padding:10px; color:var(--muted);'>내역 없음</div>";

  } catch (e) {
    console.error("Data Refresh Error:", e);
  }
}

// 이벤트 바인딩
$("loginBtn").onclick = () => {
  const email = $("email").value;
  const pw = $("pw").value;
  signInWithEmailAndPassword(auth, email, pw).catch(e => alert("로그인 실패: " + e.message));
};
$("logoutBtn").onclick = () => signOut(auth);
$("qBtn").onclick = fetchQuote;
$("buyBtn").onclick = buyStock;
$("refreshBtn").onclick = () => { lastRefresh = Date.now(); refreshData(); };
window.sellStock = sellStock;

// 상태 변경 감지
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
    $("authView").style.display = "none";
    $("dashView").style.display = "block";
    refreshData();
  } else {
    $("authView").style.display = "block";
    $("dashView").style.display = "none";
  }
});
