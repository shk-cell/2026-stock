import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { 
  getFirestore, doc, getDoc, setDoc, runTransaction, 
  serverTimestamp, collection, getDocs, deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { 
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// 1. Firebase 설정
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
const START_CASH = 70000;
const QUOTE_ENDPOINT = "https://quote-ymhlxyctxq-uc.a.run.app"; 

let currentStockPrice = 0;
let currentSymbol = "";
let currentView = null;

const $ = (id) => document.getElementById(id);
const money = (v) => `$${Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function show(el, on) {
  if (!el) return;
  on ? el.classList.remove("hidden") : el.classList.add("hidden");
}

/* --- 핵심 기능 --- */

// 주가 조회 함수
async function fetchQuote() {
  const o = $("qOut");
  const s = $("qSymbol").value.trim().toUpperCase();
  if (!s) return;
  o.textContent = "조회중...";
  try {
    const r = await fetch(`${QUOTE_ENDPOINT}?symbol=${encodeURIComponent(s)}`);
    const d = await r.json();
    if (d.ok) {
      currentSymbol = d.symbol;
      currentStockPrice = d.price;
      o.innerHTML = `<b style="color:#2b7cff;">${d.symbol}</b>: ${money(d.price)} <small style="color:#93a4b8;">(조회됨)</small>`;
    } else {
      o.textContent = "조회 실패: 없는 종목";
    }
  } catch { o.textContent = "네트워크 에러"; }
}

// 주식 매수 함수 (팝업 수량 입력 방식 적용)
async function buyStock() {
  const user = auth.currentUser;
  
  if (!user || !currentSymbol || currentStockPrice <= 0) {
    alert("종목을 먼저 조회해 주세요.");
    return;
  }

  // 팝업으로 수량 입력받기
  const inputQty = prompt(`${currentSymbol}을 몇 주 매수하시겠습니까?\n(현재가: ${money(currentStockPrice)})`, "1");
  const qty = parseInt(inputQty);

  if (isNaN(qty) || qty <= 0) {
    if (inputQty !== null) alert("올바른 수량을 입력해 주세요.");
    return;
  }

  const totalCost = currentStockPrice * qty;
  const userRef = doc(db, "users", user.email);
  const stockRef = doc(db, "users", user.email, "portfolio", currentSymbol);

  try {
    await runTransaction(db, async (t) => {
      // 모든 읽기를 먼저 수행 (Firestore Transaction 규칙)
      const uSnap = await t.get(userRef);
      const sSnap = await t.get(stockRef); 
      const cash = uSnap.data().cash;

      if (cash < totalCost) throw "가용 자산이 부족합니다!";
      
      t.update(userRef, { cash: cash - totalCost });
      if (sSnap.exists()) {
        t.update(stockRef, { qty: sSnap.data().qty + qty, updatedAt: serverTimestamp() });
      } else {
        t.set(stockRef, { symbol: currentSymbol, qty: qty, updatedAt: serverTimestamp() });
      }
    });
    alert(`${currentSymbol} ${qty}주 매수 완료!`);
    await updateAssets(user);
  } catch (e) { alert(e); }
}

// 주식 매도 함수
async function sellStock() {
  const user = auth.currentUser;
  const qtyInput = $("qQty") ? $("qQty").value : "0"; // qQty가 없을 경우 대비
  const qty = parseInt(qtyInput);
  const symbol = $("qSymbol").value.trim().toUpperCase();

  if (!user || !symbol || currentStockPrice <= 0 || isNaN(qty) || qty <= 0) {
    alert("매도 정보를 확인하세요.");
    return;
  }
  const userRef = doc(db, "users", user.email);
  const stockRef = doc(db, "users", user.email, "portfolio", symbol);

  try {
    await runTransaction(db, async (t) => {
      const uSnap = await t.get(userRef);
      const sSnap = await t.get(stockRef); 
      if (!sSnap.exists() || sSnap.data().qty < qty) throw "보유 수량이 부족합니다!";
      
      const cash = uSnap.data().cash;
      const totalGain = currentStockPrice * qty;
      t.update(userRef, { cash: cash + totalGain });
      if (sSnap.data().qty === qty) t.delete(stockRef);
      else t.update(stockRef, { qty: sSnap.data().qty - qty });
    });
    alert("매도 완료!");
    await updateAssets(user);
  } catch (e) { alert(e); }
}

// 자산 정보 업데이트 및 포트폴리오 출력
async function updateAssets(user) {
  try {
    const userRef = doc(db, "users", user.email);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, { cash: START_CASH });
      $("cashText").textContent = money(START_CASH);
      return;
    }
    const cash = snap.data().cash;
    $("cashText").textContent = money(cash);

    const portSnap = await getDocs(collection(db, "users", user.email, "portfolio"));
    let listHtml = "";
    let totalStockValue = 0;

    for (const d of portSnap.docs) {
      const item = d.data();
      let livePrice = 0;
      try {
        const r = await fetch(`${QUOTE_ENDPOINT}?symbol=${encodeURIComponent(item.symbol)}`);
        const res = await r.json();
        if (res.ok) livePrice = res.price;
      } catch {}
      
      totalStockValue += (livePrice * item.qty);
      listHtml += `
        <div class="portfolio-item">
          <div style="display:flex; flex-direction:column;">
            <span style="font-weight:bold; color:var(--pri);">${item.symbol}</span>
            <small style="color:var(--muted);">현재가: ${money(livePrice)}</small>
          </div>
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="text-align:right;">
              <b style="color:#fff; display:block;">${item.qty}주</b>
              <small style="color:var(--warn);">평가액: ${money(livePrice * item.qty)}</small>
            </div>
            <button class="btn-outline" style="border-color:var(--pri); color:var(--pri); cursor:pointer;" 
              onclick="window.quickSell('${item.symbol}')">매도</button>
          </div>
        </div>`;
    }
    $("portfolioList").innerHTML = listHtml || '<div class="muted" style="text-align:center;">보유 주식 없음</div>';
    $("totalAssetsText").textContent = money(cash + totalStockValue); 
  } catch (e) { console.error(e); }
}

// 목록에서 매도 버튼 클릭 시 처리 (수량 입력 팝업)
window.quickSell = async (symbol) => {
  $("qSymbol").value = symbol;
  await fetchQuote();
  const q = prompt(`${symbol}을 몇 주 매도하시겠습니까?`, "1");
  if (q && parseInt(q) > 0) {
    // 임시 수량 전달용 (sellStock 함수 호환 유지)
    const dummyQty = document.createElement("input");
    dummyQty.id = "qQty";
    dummyQty.value = q;
    document.body.appendChild(dummyQty);
    await sellStock();
    document.body.removeChild(dummyQty);
  }
};

/* --- 인증 및 이벤트 --- */

async function login() {
  const email = $("email").value.trim();
  const pw = $("pw").value.trim();
  try { await signInWithEmailAndPassword(auth, email, pw); } 
  catch { $("authMsg").textContent = "로그인 정보가 틀립니다."; }
}

async function render(user) {
  const nextView = user ? "dash" : "auth";
  if (currentView !== nextView) {
    currentView = nextView;
    show($("authView"), !user);
    show($("dashView"), !!user);
    if (user) $("userEmail").textContent = user.email;
  }
  if (user) await updateAssets(user);
}

onAuthStateChanged(auth, render);

document.addEventListener("DOMContentLoaded", () => {
  $("loginBtn").onclick = login;
  $("logoutBtn").onclick = () => { currentView = null; signOut(auth); };
  $("qBtn").onclick = fetchQuote;
  $("buyBtn").onclick = buyStock;
  // sellBtn은 HTML에서 제거되었으므로 연결 제외
  $("pw").onkeydown = (e) => e.key === "Enter" && login();
});
