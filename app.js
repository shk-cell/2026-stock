import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, runTransaction, serverTimestamp, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
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

const START_CASH = 70000;
const QUOTE_ENDPOINT = "https://quote-ymhlxyctxq-uc.a.run.app"; // 스샷 확인된 주소

let currentStockPrice = 0;
let currentSymbol = "";
let currentView = null;

const $ = (id) => document.getElementById(id);
const money = (v) => `$${Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function show(el, on) {
  if (!el) return;
  on ? el.classList.remove("hidden") : el.classList.add("hidden");
}

function wireEvents() {
  // 로그인/로그아웃
  $("loginBtn").onclick = login;
  $("logoutBtn").onclick = () => { 
    currentView = null; 
    signOut(auth); 
  };

  // 주가 조회 버튼 (클릭 이벤트 직접 할당)
  const qBtn = $("qBtn");
  if (qBtn) {
    qBtn.onclick = async () => {
      console.log("조회 버튼 클릭됨"); // 디버깅용
      await fetchQuote();
    };
  }

  // 매수 버튼
  const buyBtn = $("buyBtn");
  if (buyBtn) {
    buyBtn.onclick = buyStock;
  }

  // 엔터 키 대응
  $("qSymbol").onkeydown = (e) => {
    if (e.key === "Enter") fetchQuote();
  };
  
  $("pw").onkeydown = (e) => {
    if (e.key === "Enter") login();
  };
}

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

async function buyStock() {
  const user = auth.currentUser;
  const qty = parseInt($("qQty").value);
  if (!user || !currentSymbol || currentStockPrice <= 0 || isNaN(qty) || qty <= 0) {
    alert("종목을 먼저 조회하고 수량을 확인하세요.");
    return;
  }

  const totalCost = currentStockPrice * qty;
  const userRef = doc(db, "users", user.email);
  const stockRef = doc(db, "users", user.email, "portfolio", currentSymbol);

  try {
    await runTransaction(db, async (transaction) => {
      const userSnap = await transaction.get(userRef);
      const cash = userSnap.data().cash;
      if (cash < totalCost) throw "가용 자산이 부족합니다!";
      
      transaction.update(userRef, { cash: cash - totalCost });
      const stockSnap = await transaction.get(stockRef);
      if (stockSnap.exists()) {
        transaction.update(stockRef, { qty: stockSnap.data().qty + qty });
      } else {
        transaction.set(stockRef, { symbol: currentSymbol, qty: qty, updatedAt: serverTimestamp() });
      }
    });
    alert("매수 성공!");
    await updateAssets(user);
  } catch (e) { alert(e); }
}

async function updateAssets(user) {
  try {
    const userRef = doc(db, "users", user.email);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, { cash: START_CASH, initialized: true });
      $("cashText").textContent = money(START_CASH);
      return;
    }

    const cash = snap.data().cash;
    $("cashText").textContent = money(cash);

    const portSnap = await getDocs(collection(db, "users", user.email, "portfolio"));
    let listHtml = "";
    portSnap.forEach(d => {
      const item = d.data();
      listHtml += `<div class="portfolio-item"><span>${item.symbol}</span><span>${item.qty}주</span></div>`;
    });
    $("portfolioList").innerHTML = listHtml || '<div class="muted" style="text-align:center;">보유 주식 없음</div>';
    $("totalAssetsText").textContent = money(cash);
  } catch (e) { console.error("Asset Load Error:", e); }
}

async function login() {
  const email = $("email").value.trim();
  const pw = $("pw").value.trim();
  try {
    await signInWithEmailAndPassword(auth, email, pw);
  } catch { $("authMsg").textContent = "로그인 정보가 틀립니다."; }
}

async function render(user) {
  const nextView = user ? "dash" : "auth";
  if (currentView !== nextView) {
    currentView = nextView;
    show($("authView"), !user);
    show($("dashView"), !!user);
    if (user) {
      $("userEmail").textContent = user.email;
      $("email").value = ""; $("pw").value = "";
    }
  }
  if (user) await updateAssets(user);
}

onAuthStateChanged(auth, render);
document.addEventListener("DOMContentLoaded", () => {
  $("loginBtn").onclick = login;
  $("logoutBtn").onclick = () => { currentView = null; signOut(auth); };
  $("qBtn").onclick = fetchQuote;
  $("buyBtn").onclick = buyStock;
  $("pw").onkeydown = (e) => e.key === "Enter" && login();
});
