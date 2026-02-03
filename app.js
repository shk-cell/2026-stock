import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { 
  getFirestore, doc, getDoc, setDoc, 
  runTransaction, serverTimestamp, collection, getDocs 
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { 
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

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
const QUOTE_ENDPOINT = "https://quote-ymhlxyctxq-uc.a.run.app";

let currentStockPrice = 0;
let currentSymbol = "";
let currentView = null;

const $ = (id) => document.getElementById(id);
const money = (v) => `$${Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function show(el, on) {
  if (!el) return;
  if (on) el.classList.remove("hidden");
  else el.classList.add("hidden");
}

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
      o.innerHTML = `<b style="color:#2b7cff;">${d.symbol}</b>: ${money(d.price)} <span style="font-size:11px; color:#93a4b8;">(조회 성공)</span>`;
    } else {
      currentSymbol = "";
      currentStockPrice = 0;
      o.textContent = "조회 실패: 존재하지 않는 종목";
    }
  } catch (e) {
    o.textContent = "네트워크 에러";
  }
}

// 매수 로직
async function buyStock() {
  const user = auth.currentUser;
  const qty = parseInt($("qQty").value);

  if (!user || !currentSymbol || currentStockPrice <= 0) {
    alert("먼저 종목을 조회해주세요.");
    return;
  }
  if (isNaN(qty) || qty <= 0) return;

  const totalCost = currentStockPrice * qty;
  const userRef = doc(db, "users", user.email);
  const stockRef = doc(db, "users", user.email, "portfolio", currentSymbol);

  try {
    await runTransaction(db, async (transaction) => {
      const userSnap = await transaction.get(userRef);
      const currentCash = userSnap.data().cash;

      if (currentCash < totalCost) throw "가용 자산이 부족합니다!";

      transaction.update(userRef, { cash: currentCash - totalCost });

      const stockSnap = await transaction.get(stockRef);
      if (stockSnap.exists()) {
        transaction.update(stockRef, { qty: stockSnap.data().qty + qty });
      } else {
        transaction.set(stockRef, { symbol: currentSymbol, qty: qty, updatedAt: serverTimestamp() });
      }
    });

    alert("매수 완료!");
    await updateAssets(user);
  } catch (e) {
    alert(e);
  }
}

// 자산 정보 업데이트 및 포트폴리오 출력
async function updateAssets(user) {
  const userRef = doc(db, "users", user.email);
  const snap = await getDoc(userRef);
  
  if (snap.exists()) {
    const cash = snap.data().cash;
    $("cashText").textContent = money(cash);
    
    // 포트폴리오 목록 가져오기
    const portRef = collection(db, "users", user.email, "portfolio");
    const portSnap = await getDocs(portRef);
    let listHtml = "";
    
    portSnap.forEach(d => {
      const item = d.data();
      listHtml += `<div class="portfolio-item"><span>${item.symbol}</span><span>${item.qty}주</span></div>`;
    });
    
    $("portfolioList").innerHTML = listHtml || '<div class="muted" style="text-align:center;">보유 주식 없음</div>';
    $("totalAssetsText").textContent = money(cash); // 현재는 Cash만 합산
  }
}

async function login() {
  const email = $("email").value.trim();
  const pw = $("pw").value.trim();
  try {
    await signInWithEmailAndPassword(auth, email, pw);
  } catch (e) {
    $("authMsg").textContent = "로그인 실패: 계정을 확인하세요.";
  }
}

async function render(user) {
  const nextView = user ? "dash" : "auth";
  if (currentView !== nextView) {
    currentView = nextView;
    show($("authView"), !user);
    show($("dashView"), !!user);
  }
  if (user) {
    $("userEmail").textContent = user.email;
    await updateAssets(user);
  }
}

function wireEvents() {
  $("loginBtn").onclick = login;
  $("logoutBtn").onclick = () => { currentView = null; signOut(auth); };
  $("qBtn").onclick = fetchQuote;
  $("buyBtn").onclick = buyStock;
  $("pw").onkeydown = (e) => e.key === "Enter" && login();
}

onAuthStateChanged(auth, render);
document.addEventListener("DOMContentLoaded", wireEvents);
