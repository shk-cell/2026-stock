// app.js — index.html(authView/email/pw/dashView) 전용 최종본
// 구조:
// - Firestore users/{id} 기반 간이 로그인
// - 첫 로그인 시 70,000달러 지급 (중복 방지)
// - 현재 금액 표시
// - Yahoo Finance 현재가 조회 (Firebase Functions)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ===============================
   Firebase 설정 (확정값)
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
   상수
================================ */
const START_CASH = 70000;
const SESSION_KEY = "stock_user_id";
const QUOTE_ENDPOINT =
  "https://us-central1-stock-62c76.cloudfunctions.net/quote";

/* ===============================
   유틸
================================ */
const $ = (id) => document.getElementById(id);
const money = (v) =>
  `$${Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

function show(el, on) {
  if (!el) return;
  el.classList.toggle("hidden", !on);
}

/* ===============================
   세션
================================ */
const getMe = () => localStorage.getItem(SESSION_KEY);
const setMe = (id) => localStorage.setItem(SESSION_KEY, id);
const clearMe = () => localStorage.removeItem(SESSION_KEY);

/* ===============================
   로그인 + 첫 지급 (트랜잭션)
================================ */
async function loginAndInit(id, pw) {
  const uid = id.trim();
  const pass = pw.trim();
  if (!uid || !pass) throw "ID_PW_REQUIRED";

  const ref = doc(db, "users", uid);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw "NO_USER";

    const u = snap.data();
    if (u.password !== pass) throw "BAD_PASSWORD";

    if (!u.initialized) {
      tx.update(ref, {
        initialized: true,
        cash: START_CASH,
        updatedAt: serverTimestamp(),
      });
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
   렌더
================================ */
async function render() {
  const authView = $("authView");
  const dashView = $("dashView");

  const userEmail = $("userEmail");
  const cashText = $("cashText");

  const me = await loadMe();

  show(authView, !me);
  show(dashView, !!me);

  if (me) {
    userEmail.textContent = me.id;
    cashText.textContent = money(me.cash);
  }
}

/* ===============================
   로그인 UI
================================ */
function wireLogin() {
  const email = $("email");
  const pw = $("pw");
  const btn = $("loginBtn");
  const msg = $("authMsg");

  btn.onclick = async () => {
    msg.textContent = "";
    btn.disabled = true;

    try {
      await loginAndInit(email.value, pw.value);
      await render();
    } catch (e) {
      msg.textContent =
        e === "ID_PW_REQUIRED"
          ? "아이디/비밀번호를 입력하세요."
          : e === "NO_USER"
          ? "존재하지 않는 아이디입니다."
          : e === "BAD_PASSWORD"
          ? "비밀번호가 틀렸습니다."
          : "로그인 실패";
    } finally {
      btn.disabled = false;
    }
  };

  email.onkeydown = (e) => e.key === "Enter" && btn.click();
  pw.onkeydown = (e) => e.key === "Enter" && btn.click();
}

/* ===============================
   로그아웃
================================ */
function wireLogout() {
  $("logoutBtn").onclick = async () => {
    clearMe();
    await render();
  };
}

/* ===============================
   현재가 조회
================================ */
async function fetchQuote(symbol) {
  const s = symbol.trim().toUpperCase();
  if (!s) throw "NO_SYMBOL";

  const r = await fetch(`${QUOTE_ENDPOINT}?symbol=${encodeURIComponent(s)}`);
  const d = await r.json();
  if (!r.ok || !d.ok) throw "QUOTE_FAIL";
  return d;
}

function wireQuote() {
  const i = $("qSymbol");
  const b = $("qBtn");
  const o = $("qOut");

  b.onclick = async () => {
    o.textContent = "조회중…";
    try {
      const q = await fetchQuote(i.value);
      o.textContent = `${q.symbol} (${q.name}) $${q.price}`;
    } catch {
      o.textContent = "조회 실패";
    }
  };

  i.onkeydown = (e) => e.key === "Enter" && b.click();
}

/* ===============================
   시작
================================ */
document.addEventListener("DOMContentLoaded", async () => {
  wireLogin();
  wireLogout();
  wireQuote();
  await render();
});
