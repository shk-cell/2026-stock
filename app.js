import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
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
const QUOTE_ENDPOINT = "https://us-central1-stock-62c76.cloudfunctions.net/quote";

const $ = (id) => document.getElementById(id);
const money = (v) => `$${Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

function show(el, on) {
  if (!el) return;
  if (on) el.classList.remove("hidden");
  else el.classList.add("hidden");
}

// [핵심 수정] 현재 뷰 상태를 저장하여 불필요한 리렌더링 방지
let currentView = null;

async function login() {
  const email = $("email").value.trim();
  const pw = $("pw").value.trim();
  const btn = $("loginBtn");
  const msg = $("authMsg");

  if (!email || !pw) {
    msg.textContent = "이메일과 비밀번호를 입력하세요.";
    return;
  }

  btn.disabled = true;
  msg.textContent = "로그인 중...";

  try {
    await signInWithEmailAndPassword(auth, email, pw);
    // 성공 시 onAuthStateChanged가 호출되므로 여기서 input을 비울 필요 없음
  } catch (e) {
    console.error(e);
    if (e.code === "auth/invalid-credential" || e.code === "auth/wrong-password") msg.textContent = "계정 정보가 틀립니다.";
    else if (e.code === "auth/user-not-found") msg.textContent = "등록되지 않은 사용자입니다.";
    else msg.textContent = "로그인 실패: " + e.code;
  } finally {
    btn.disabled = false;
  }
}

async function render(user) {
  const authView = $("authView");
  const dashView = $("dashView");

  // 상태가 실제로 변했을 때만 뷰 전환 (비밀번호 입력 방해 방지)
  const nextView = user ? "dash" : "auth";
  if (currentView === nextView) {
    // 이미 해당 뷰라면 잔고 데이터만 업데이트하고 리턴
    if (user) await updateBalance(user);
    return;
  }
  currentView = nextView;

  if (user) {
    show(authView, false);
    show(dashView, true);
    $("userEmail").textContent = user.email;
    await updateBalance(user);
    // 로그인 성공 시 입력 필드 초기화
    $("email").value = "";
    $("pw").value = "";
    $("authMsg").textContent = "";
  } else {
    show(authView, true);
    show(dashView, false);
  }
}

// 잔고 업데이트 로직 분리
async function updateBalance(user) {
  try {
    const userRef = doc(db, "users", user.email);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      $("cashText").textContent = money(snap.data().cash);
    } else {
      await setDoc(userRef, { cash: START_CASH, initialized: true });
      $("cashText").textContent = money(START_CASH);
    }
  } catch (e) {
    console.error("잔고 로드 실패:", e);
  }
}

function wireEvents() {
  $("loginBtn").onclick = login;
  $("logoutBtn").onclick = () => {
    currentView = null; // 로그아웃 시 상태 초기화
    signOut(auth);
  };

  // 엔터 키 대응 (preventDefault 제거로 입력 방해 금지)
  $("pw").onkeydown = (e) => {
    if (e.key === "Enter") login();
  };

  $("qBtn").onclick = async () => {
    const o = $("qOut");
    const s = $("qSymbol").value.trim().toUpperCase();
    if (!s) return;
    o.textContent = "조회중...";
    try {
      const r = await fetch(`${QUOTE_ENDPOINT}?symbol=${encodeURIComponent(s)}`);
      const d = await r.json();
      o.textContent = d.ok ? `${d.symbol}: $${d.price}` : "조회 실패";
    } catch {
      o.textContent = "네트워크 에러";
    }
  };
}

onAuthStateChanged(auth, (user) => {
  render(user);
});

document.addEventListener("DOMContentLoaded", wireEvents);
