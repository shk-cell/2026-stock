import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
// Authentication 모듈 로드
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

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
const auth = getAuth(app); // 인증 객체

const START_CASH = 70000;
const QUOTE_ENDPOINT = "https://us-central1-stock-62c76.cloudfunctions.net/quote";

/* ===============================
   유틸리티
================================ */
const $ = (id) => document.getElementById(id);
const money = (v) => `$${Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

function show(el, on) {
  if (!el) return;
  if (on) el.classList.remove("hidden");
  else el.classList.add("hidden");
}

/* ===============================
   메인 로직 (인증 기반)
================================ */

// 1. 로그인 함수
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
    // Firebase Auth 정식 로그인 (인증 메뉴의 계정 확인)
    await signInWithEmailAndPassword(auth, email, pw);
    msg.textContent = "";
  } catch (e) {
    console.error(e);
    if (e.code === "auth/invalid-credential") msg.textContent = "계정 정보가 틀립니다.";
    else if (e.code === "auth/user-not-found") msg.textContent = "등록되지 않은 사용자입니다.";
    else msg.textContent = "로그인 실패: " + e.message;
  } finally {
    btn.disabled = false;
  }
}

// 2. 화면 렌더링 (로그인 상태에 따라 자동 전환)
async function render(user) {
  const authView = $("authView");
  const dashView = $("dashView");

  if (user) {
    show(authView, false);
    show(dashView, true);
    $("userEmail").textContent = user.email;

    // Firestore에서 유저 잔고 정보 가져오기
    // (Auth 계정과 연동하기 위해 이메일을 문서 ID로 사용)
    const userRef = doc(db, "users", user.email);
    const snap = await getDoc(userRef);

    if (snap.exists()) {
      $("cashText").textContent = money(snap.data().cash);
    } else {
      // Auth엔 계정이 있지만 Firestore에 데이터가 없는 경우 초기화
      await setDoc(userRef, { cash: START_CASH, initialized: true });
      $("cashText").textContent = money(START_CASH);
    }
  } else {
    show(authView, true);
    show(dashView, false);
  }
}

/* ===============================
   이벤트 연결
================================ */
function wireEvents() {
  $("loginBtn").onclick = login;
  
  $("logoutBtn").onclick = () => signOut(auth);

  // 엔터 키 대응
  $("pw").onkeydown = (e) => e.key === "Enter" && login();

  // 주가 조회
  $("qBtn").onclick = async () => {
    const o = $("qOut");
    const s = $("qSymbol").value.trim().toUpperCase();
    if (!s) return;
    o.textContent = "조회중...";
    try {
      const r = await fetch(`${QUOTE_ENDPOINT}?symbol=${encodeURIComponent(s)}`);
      const d = await r.json();
      o.textContent = d.ok ? `${d.symbol}: $${d.price}` : "실패";
    } catch {
      o.textContent = "에러";
    }
  };
}

/* ===============================
   초기화 (관찰자 설정)
================================ */
// 페이지 로드 시 인증 상태 관찰자 등록
onAuthStateChanged(auth, (user) => {
  render(user);
});

document.addEventListener("DOMContentLoaded", wireEvents);
