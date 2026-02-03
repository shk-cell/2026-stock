// app.js (FULL) - index.html(제공본) 전용 매핑
// - GitHub Pages + Firebase(Firestore)
// - 간이 로그인: Firestore users/{id}.password로 검증 (Firebase Auth 미사용)
// - 첫 로그인 시 70,000달러 지급(중복 지급 방지)
// - Yahoo 현재가 조회: Firebase Functions(quote) 호출 (#qSymbol/#qBtn/#qOut)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ===============================
// Firebase 설정 (사용자 제공 값)
// ===============================
const firebaseConfig = {
  apiKey: "AIzaSyCzjJDKMbzHjs7s7jMnfK64bbHEEmpyZxI",
  authDomain: "stock-62c76.firebaseapp.com",
  projectId: "stock-62c76",
  storageBucket: "stock-62c76.firebasestorage.app",
  messagingSenderId: "149071161310",
  appId: "1:149071161310:web:79ebd6",
};

// ===============================
// Yahoo 현재가 Function URL
// ===============================
const QUOTE_ENDPOINT =
  "https://us-central1-stock-62c76.cloudfunctions.net/quote";

// ===============================
const START_CASH = 70000;
const SESSION_KEY = "stock_sim_user_id";
const QUOTE_CACHE_MS = 60 * 1000; // 1분 캐시(호출 줄이기)

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);

function show(el, on) {
  if (!el) return;
  el.classList.toggle("hidden", !on);
}

function money(v) {
  return `$${Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function setMsg(el, text = "") {
  if (!el) return;
  el.textContent = text;
}

function setText(el, text = "") {
  if (!el) return;
  el.textContent = text;
}

function getMeId() {
  return localStorage.getItem(SESSION_KEY) || "";
}
function setMeId(id) {
  localStorage.setItem(SESSION_KEY, id);
}
function clearMeId() {
  localStorage.removeItem(SESSION_KEY);
}

// ===============================
// 간이 로그인 + 첫 지급(트랜잭션으로 중복 방지)
// ===============================
async function loginAndInit(id, pw) {
  const uid = (id || "").trim();
  const pass = (pw || "").trim();
  if (!uid || !pass) throw new Error("ID_PW_REQUIRED");

  const ref = doc(db, "users", uid);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("NO_USER");

    const u = snap.data();

    if ((u.password || "") !== pass) throw new Error("BAD_PASSWORD");

    // 첫 로그인 시 지급
    if (!u.initialized) {
      tx.update(ref, {
        initialized: true,
        cash: START_CASH,
        updatedAt: serverTimestamp(),
      });
    } else {
      // 혹시 cash 필드가 없다면 안전하게 0으로라도 유지
      if (typeof u.cash !== "number") {
        tx.update(ref, { cash: Number(u.cash || 0), updatedAt: serverTimestamp() });
      }
    }
  });

  setMeId(uid);
}

async function loadMe() {
  const uid = getMeId();
  if (!uid) return null;

  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;

  const u = snap.data();
  return {
    id: uid,
    cash: Number(u.cash || 0),
    initialized: !!u.initialized,
  };
}

// ===============================
// 화면 렌더
// ===============================
async function render() {
  const authView = $("authView");
  const dashView = $("dashView");

  const userEmail = $("userEmail");
  const cashText = $("cashText");

  const dashMsg = $("dashMsg");

  const me = await loadMe();
  const on = !!me;

  show(authView, !on);
  show(dashView, on);

  if (!on) return;

  setText(userEmail, me.id);
  setText(cashText, money(me.cash));
  setMsg(dashMsg, "");
}

// ===============================
// 로그인 UI
// ===============================
function wireLogin() {
  const email = $("email"); // 여기엔 이메일이 아니라 아이디(test01) 넣어도 됨
  const pw = $("pw");
  const btn = $("loginBtn");
  const authMsg = $("authMsg");

  if (!btn) return;

  const run = async () => {
    setMsg(authMsg, "");
    const id = email?.value || "";
    const pass = pw?.value || "";

    btn.disabled = true;
    btn.textContent = "로그인 중…";
    try {
      await loginAndInit(id, pass);
      await render();
    } catch (e) {
      const code = String(e?.message || e);
      setMsg(
        authMsg,
        code === "ID_PW_REQUIRED"
          ? "아이디/비밀번호를 입력하세요."
          : code === "NO_USER"
          ? "존재하지 않는 아이디입니다."
          : code === "BAD_PASSWORD"
          ? "비밀번호가 틀렸습니다."
          : "로그인 실패"
      );
    } finally {
      btn.disabled = false;
      btn.textContent = "로그인";
    }
  };

  btn.addEventListener("click", run);
  if (email) email.addEventListener("keydown", (ev) => ev.key === "Enter" && run());
  if (pw) pw.addEventListener("keydown", (ev) => ev.key === "Enter" && run());
}

function wireLogout() {
  const btn = $("logoutBtn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    clearMeId();
    await render();
  });
}

// ===============================
// Yahoo 현재가 조회 (1분 캐시)
// ===============================
const quoteCache = new Map(); // symbol -> { t, data }

async function fetchQuote(symbolRaw) {
  const symbol = (symbolRaw || "").trim().toUpperCase();
  if (!symbol) throw new Error("SYMBOL_EMPTY");

  const cached = quoteCache.get(symbol);
  const now = Date.now();
  if (cached && now - cached.t < QUOTE_CACHE_MS) return cached.data;

  const r = await fetch(`${QUOTE_ENDPOINT}?symbol=${encodeURIComponent(symbol)}`);
  const d = await r.json();
  if (!r.ok || !d.ok) throw new Error(d.error || "QUOTE_FAIL");

  quoteCache.set(symbol, { t: now, data: d });
  return d;
}

function wireQuoteMini() {
  const i = $("qSymbol");
  const b = $("qBtn");
  const o = $("qOut");

  if (!i || !b || !o) return;

  const run = async () => {
    o.textContent = "조회중…";
    try {
      const q = await fetchQuote(i.value);
      const name = q.name ? `(${q.name})` : "";
      o.textContent = `${q.symbol} ${name} $${q.price}`;
    } catch {
      o.textContent = "조회 실패";
    }
  };

  b.addEventListener("click", run);
  i.addEventListener("keydown", (ev) => ev.key === "Enter" && run());
}

// ===============================
// 시작
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  wireLogin();
  wireLogout();
  wireQuoteMini();
  await render();
});
