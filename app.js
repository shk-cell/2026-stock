import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { 
  getFirestore, doc, getDoc, setDoc, runTransaction, 
  serverTimestamp, collection, getDocs 
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

// 3. 유틸리티 함수
const $ = (id) => document.getElementById(id);
const money = (v) => `$${Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function show(el, on) {
  if (!el) return;
  on ? el.classList.remove("hidden") : el.classList.add("hidden");
}

/* ===============================
   핵심 기능 함수
================================ */

// 주가 조회
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
      currentSymbol = "";
      currentStockPrice = 0;
      o.textContent = "조회 실패: 없는 종목";
    }
  } catch (e) { 
    o.textContent = "네트워크 에러"; 
    console.error(e);
  }
}

// 주식 매수
async function buyStock() {
  const user = auth.currentUser;
  const qtyInput = $("qQty");
  const qty = parseInt(qtyInput.value);

  if (!user || !currentSymbol || currentStockPrice <= 0 || isNaN(qty) || qty <= 0) {
    alert("종목을 먼저 조회하고 올바른 수량을 확인하세요.");
    return;
  }

  const totalCost = currentStockPrice * qty;
  const userRef = doc(db, "users", user.email);
  const stockRef = doc(db, "users", user.email, "portfolio", currentSymbol);

  try {
    await runTransaction(db, async (transaction) => {
      // [중요] 모든 읽기(get) 작업을 쓰기 작업보다 먼저 수행합니다.
      const userSnap = await transaction.get(userRef);
      const stockSnap = await transaction.get(stockRef); // 읽기 작업을 위로 올림

      if (!userSnap.exists()) throw "사용자 정보가 없습니다.";
      
      const cash = userSnap.data().cash;
      if (cash < totalCost) throw "가용 자산이 부족합니다!";
      
      // [중요] 읽기가 모두 끝난 후 쓰기(update, set) 작업을 시작합니다.
      // 1. 잔고 차감
      transaction.update(userRef, { cash: cash - totalCost });

      // 2. 포트폴리오 업데이트
      if (stockSnap.exists()) {
        transaction.update(stockRef, { 
          qty: stockSnap.data().qty + qty,
          updatedAt: serverTimestamp() 
        });
      } else {
        transaction.set(stockRef, { 
          symbol: currentSymbol, 
          qty: qty, 
          updatedAt: serverTimestamp() 
        });
      }
    });

    alert(`${currentSymbol} ${qty}주 매수 완료!`);
    qtyInput.value = 1;
    await updateAssets(user);
  } catch (e) { 
    alert(e); 
    console.error(e);
  }
}

// 자산 및 포트폴리오 목록 업데이트
async function updateAssets(user) {
  try {
    const userRef = doc(db, "users", user.email);
    const snap = await getDoc(userRef);
    
    // 유저 데이터가 없으면 초기화
    if (!snap.exists()) {
      await setDoc(userRef, { cash: START_CASH, initialized: true });
      $("cashText").textContent = money(START_CASH);
      $("totalAssetsText").textContent = money(START_CASH);
      return;
    }

    const cash = snap.data().cash;
    $("cashText").textContent = money(cash);

    // 포트폴리오 가져오기
    const portSnap = await getDocs(collection(db, "users", user.email, "portfolio"));
    let listHtml = "";
    portSnap.forEach(d => {
      const item = d.data();
      listHtml += `
        <div class="portfolio-item">
          <span>${item.symbol}</span>
          <b style="color:#fff;">${item.qty}주</b>
        </div>`;
    });
    
    $("portfolioList").innerHTML = listHtml || '<div class="muted" style="text-align:center;">보유 주식 없음</div>';
    
    // 현재는 단순하게 가용자산만 총자산으로 표시 (추후 주식 가치 합산 기능 추가 가능)
    $("totalAssetsText").textContent = money(cash);
    
  } catch (e) { 
    console.error("Asset Load Error:", e); 
  }
}

/* ===============================
   인증 및 렌더링
================================ */

async function login() {
  const email = $("email").value.trim();
  const pw = $("pw").value.trim();
  const msg = $("authMsg");

  if (!email || !pw) return;

  try {
    await signInWithEmailAndPassword(auth, email, pw);
    msg.textContent = "";
  } catch (e) { 
    msg.textContent = "로그인 정보가 틀립니다."; 
  }
}

async function render(user) {
  const nextView = user ? "dash" : "auth";
  
  if (currentView !== nextView) {
    currentView = nextView;
    show($("authView"), !user);
    show($("dashView"), !!user);
    
    if (user) {
      $("userEmail").textContent = user.email;
      $("email").value = ""; 
      $("pw").value = "";
    }
  }

  if (user) await updateAssets(user);
}

// 이벤트 리스너 통합 관리
function wireEvents() {
  $("loginBtn").onclick = login;
  $("logoutBtn").onclick = () => { currentView = null; signOut(auth); };
  
  $("qBtn").onclick = fetchQuote;
  $("buyBtn").onclick = buyStock;

  // 엔터키 지원
  $("qSymbol").onkeydown = (e) => { if (e.key === "Enter") fetchQuote(); };
  $("pw").onkeydown = (e) => { if (e.key === "Enter") login(); };
}

// 초기화 호출
onAuthStateChanged(auth, render);
document.addEventListener("DOMContentLoaded", wireEvents);
