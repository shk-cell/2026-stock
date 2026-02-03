import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { 
  getFirestore, doc, getDoc, setDoc, updateDoc, 
  runTransaction, serverTimestamp, collection, getDocs 
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { 
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

/* ===============================
   Firebase 설정
================================ */
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
const QUOTE_ENDPOINT = "https://quote-ymhlxyctxq-uc.a.run.app"; // 스샷에서 확인된 주소

/* ===============================
   전역 상태 및 유틸리티
================================ */
let currentView = null;
let currentStockPrice = 0;
let currentSymbol = "";

const $ = (id) => document.getElementById(id);
const money = (v) => `$${Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function show(el, on) {
  if (!el) return;
  if (on) el.classList.remove("hidden");
  else el.classList.add("hidden");
}

/* ===============================
   핵심 비즈니스 로직
================================ */

// 1. 주가 조회
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
      o.innerHTML = `<b style="color:#2b7cff;">${d.symbol}</b>: ${money(d.price)} <span style="font-size:12px; color:#93a4b8;">(조회 성공)</span>`;
    } else {
      currentSymbol = "";
      currentStockPrice = 0;
      o.textContent = "존재하지 않는 종목입니다.";
    }
  } catch (e) {
    o.textContent = "네트워크 에러 발생";
  }
}

// 2. 주식 매수 (트랜잭션 적용)
async function buyStock() {
  const user = auth.currentUser;
  const qtyInput = $("qQty");
  const qty = parseInt(qtyInput.value);

  if (!user) return;
  if (!currentSymbol || currentStockPrice <= 0) {
    alert("먼저 종목을 조회해주세요.");
    return;
  }
  if (isNaN(qty) || qty <= 0) {
    alert("올바른 수량을 입력하세요.");
    return;
  }

  const totalCost = currentStockPrice * qty;
  const userRef = doc(db, "users", user.email);
  const stockRef = doc(db, "users", user.email, "portfolio", currentSymbol);

  try {
    await runTransaction(db, async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) throw "사용자 데이터가 없습니다.";

      const currentCash = userSnap.data().cash;
      if (currentCash < totalCost) {
        throw "가용 자산이 부족합니다!";
      }

      // 현금 차감
      transaction.update(userRef, { cash: currentCash - totalCost });

      // 포트폴리오 업데이트
      const stockSnap = await transaction.get(stockRef);
      if (stockSnap.exists()) {
        transaction.update(stockRef, { 
          qty: stockSnap.data().qty + qty,
          lastPrice: currentStockPrice,
          updatedAt: serverTimestamp()
        });
      } else {
        transaction.set(stockRef, {
          symbol: currentSymbol,
          qty: qty,
          avgPrice: currentStockPrice, // 평단가 개념 (추후 고도화 가능)
          updatedAt: serverTimestamp()
        });
      }
    });

    alert(`${currentSymbol} ${qty}주 매수 완료!`);
    qtyInput.value = 1; // 수량 초기화
    render(user); // UI 갱신
  } catch (e) {
    alert(e);
    console.error(e);
  }
}

// 3. 자산 및 포트폴리오 렌더링
async function updateAssets(user) {
  try {
    const userRef = doc(db, "users", user.email);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      const cash = userSnap.data().cash;
      $("cashText").textContent = money(cash);
      
      // 포트폴리오 목록 가져오기 (총 자산 계산용)
      const portRef = collection(db, "users", user.email, "portfolio");
      const portSnap = await getDocs(portRef);
      
      let stockValue = 0;
      let listHtml = "";

      portSnap.forEach((doc) => {
        const data = doc.data();
        listHtml += `<div class="pill" style="display:block; margin-bottom:5px;">
          ${data.symbol}: ${data.qty}주
        </div>`;
        // 실시간 총 자산은 나중에 각 종목의 현재가를 다시 가져와서 더해야 함
        // 지금은 단순하게 구현
      });

      $("portfolioList").innerHTML = listHtml || '<div class="muted">보유 주식이 없습니다.</div>';
      $("totalAssetsText").textContent = money(cash); // 일단 Cash만 표시 (고도화 예정)
      
    } else {
      await setDoc(userRef, { cash: START_CASH, initialized: true });
      $("cashText").textContent = money(START_CASH);
    }
  } catch (e) {
    console.error("Asset Load Error:", e);
  }
}

/* ===============================
   인증 및 초기화
================================ */

async function login() {
  const email = $("email").value.trim();
  const pw = $("pw").value.trim();
  const btn = $("loginBtn");
  const msg = $("authMsg");

  if (!email || !pw) {
    msg.textContent = "정보를 입력하세요.";
    return;
  }

  btn.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, email, pw);
  } catch (e) {
    msg.textContent = "로그인 실패: 계정 정보를 확인하세요.";
  } finally {
    btn.disabled = false;
  }
}

async function render(user) {
  const authView = $("authView");
  const dashView = $("dashView");

  const nextView = user ? "dash" : "auth";
  if (currentView !== nextView) {
    currentView = nextView;
    show(authView, !user);
    show(dashView, !!user);
    if (user) {
        $("userEmail").textContent = user.email;
        $("email").value = "";
        $("pw").value = "";
    }
  }

  if (user) await updateAssets(user);
}

function wireEvents() {
  $("loginBtn").onclick = login;
  $("logoutBtn").onclick = () => { currentView = null; signOut(auth); };
  
  // 조회 및 매수 버튼
  $("qSymbol").onkeydown = (e) => { if (e.key === "Enter") fetchQuote(); };
  $("buyBtn").onclick = buyStock;
}

onAuthStateChanged(auth, (user) => {
  render(user);
});

document.addEventListener("DOMContentLoaded", wireEvents);
