import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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

/* ===============================
   상수 및 유틸
================================ */
const START_CASH = 70000;
const SESSION_KEY = "stock_user_id";
const QUOTE_ENDPOINT = "https://us-central1-stock-62c76.cloudfunctions.net/quote";

const $ = (id) => document.getElementById(id);
const money = (v) => `$${Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

function show(el, on) {
  if (!el) return;
  if (on) el.classList.remove("hidden");
  else el.classList.add("hidden");
}

/* ===============================
   세션 관리
================================ */
const getMe = () => localStorage.getItem(SESSION_KEY);
const setMe = (id) => localStorage.setItem(SESSION_KEY, id);
const clearMe = () => localStorage.removeItem(SESSION_KEY);

/* ===============================
   로그인 로직 (회원가입 겸용)
================================ */
async function loginAndInit(id, pw) {
  const uid = id.trim();
  const pass = pw.trim();
  if (!uid || !pass) throw "ID_PW_REQUIRED";

  const ref = doc(db, "users", uid);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    
    if (!snap.exists()) {
      // 유저가 없으면 자동 생성 (테스트용)
      tx.set(ref, {
        password: pass,
        initialized: true,
        cash: START_CASH,
        createdAt: serverTimestamp(),
      });
    } else {
      const u = snap.data();
      if (u.password !== pass) throw "BAD_PASSWORD";
      
      if (!u.initialized) {
        tx.update(ref, {
          initialized: true,
          cash: START_CASH,
          updatedAt: serverTimestamp(),
        });
      }
    }
  });

  setMe(uid);
}

async function loadMe() {
  const uid = getMe();
  if (!uid) return null;
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  const u = snap.data();
  return { id: uid, cash: Number(u.cash || 0) };
}

/* ===============================
   렌더링
================================ */
async function render() {
  const me = await loadMe();
  
  show($("authView"), !me);
  show($("dashView"), !!me);

  if (me) {
    $("userEmail").textContent = me.id;
    $("cashText").textContent = money(me.cash);
  }
}

/* ===============================
   이벤트 바인딩
================================ */
function wireLogin() {
  const btn = $("loginBtn");
  if (!btn) return;

  btn.onclick = async () => {
    const emailEl = $("email");
    const pwEl = $("pw");
    const msg = $("authMsg");

    if (!emailEl || !pwEl) return;

    msg.textContent = "로그인 중...";
    btn.disabled = true;

    try {
      await loginAndInit(emailEl.value, pwEl.value);
      await render();
    } catch (e) {
      console.error(e);
      msg.textContent = 
        e === "ID_PW_REQUIRED" ? "아이디/비밀번호를 입력하세요." :
        e === "BAD_PASSWORD" ? "비밀번호가 틀렸습니다." : 
        "로그인 실패 (Firestore 규칙 확인 필요)";
    } finally {
      btn.disabled = false;
    }
  };
}

function wireLogout() {
  const btn = $("logoutBtn");
  if (btn) {
    btn.onclick = () => {
      clearMe();
      render();
    };
  }
}

function wireQuote() {
  const i = $("qSymbol");
  const b = $("qBtn");
  const o = $("qOut");
  if (!b) return;

  b.onclick = async () => {
    o.textContent = "조회중…";
    try {
      const s = i.value.trim().toUpperCase();
      const r = await fetch(`${QUOTE_ENDPOINT}?symbol=${encodeURIComponent(s)}`);
      const d = await r.json();
      if (!r.ok || !d.ok) throw "FAIL";
      o.textContent = `${d.symbol}: $${d.price}`;
    } catch {
      o.textContent = "조회 실패";
    }
  };
}

// 시작
document.addEventListener("DOMContentLoaded", () => {
  wireLogin();
  wireLogout();
  wireQuote();
  render();
});
