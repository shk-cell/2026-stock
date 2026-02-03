// app.js (FULL) - GitHub Pages + Firebase(Firestore) + Yahoo 현재가 조회(Functions)
// 교육용 간이 로그인 구조

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
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
// 앱 상수
// ===============================
const START_CASH = 70000;
const SESSION_KEY = "stock_sim_user_id";

// ===============================
// Firebase init
// ===============================
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ===============================
// 유틸
// ===============================
const $ = (id) => document.getElementById(id);

function formatMoney(v) {
  return Number(v || 0).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function show(id, on) {
  const el = $(id);
  if (el) el.style.display = on ? "" : "none";
}

// ===============================
// 세션
// ===============================
function getMeId() {
  return localStorage.getItem(SESSION_KEY);
}
function setMeId(id) {
  localStorage.setItem(SESSION_KEY, id);
}
function clearMeId() {
  localStorage.removeItem(SESSION_KEY);
}

// ===============================
// 간이 로그인
// ===============================
async function loginWithIdPassword(id, pw) {
  const uid = id.trim();
  if (!uid || !pw) throw "ID_PW_REQUIRED";

  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw "NO_USER";

  const u = snap.data();
  if (u.password !== pw) throw "BAD_PASSWORD";

  if (!u.initialized) {
    await updateDoc(ref, {
      initialized: true,
      cash: START_CASH,
      updatedAt: serverTimestamp(),
    });
  }

  setMeId(uid);
}

// ===============================
// 자산
// ===============================
async function getMyAsset() {
  const uid = getMeId();
  if (!uid) return null;

  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;

  const cash = Number(snap.data().cash || 0);
  return { cash, total: cash };
}

// ===============================
// 상단
// ===============================
async function refreshTopbar() {
  const uid = getMeId();
  setText("meIdBadge", uid ? `ID: ${uid}` : "ID: -");

  const asset = await getMyAsset();
  setText(
    "meAssetBadge",
    asset ? `총자산 $${formatMoney(asset.total)}` : "총자산 -"
  );
}

// ===============================
// 로그아웃
// ===============================
function wireLogout() {
  const btn = $("logoutBtn");
  if (btn)
    btn.onclick = () => {
      clearMeId();
      routeByLogin();
    };
}

// ===============================
// 화면
// ===============================
async function routeByLogin() {
  const on = !!getMeId();
  show("loginWrap", !on);
  show("appWrap", on);
  await refreshTopbar();
}

// ===============================
// 로그인 UI
// ===============================
function wireLoginUI() {
  const btn = $("loginBtn");
  if (!btn) return;

  btn.onclick = async () => {
    const id = $("loginId").value;
    const pw = $("loginPw").value;
    const msg = $("loginMsg");
    if (msg) msg.textContent = "";

    try {
      await loginWithIdPassword(id, pw);
      await routeByLogin();
    } catch (e) {
      if (!msg) return;
      msg.textContent =
        e === "NO_USER"
          ? "존재하지 않는 아이디입니다."
          : e === "BAD_PASSWORD"
          ? "비밀번호가 틀렸습니다."
          : "로그인 실패";
    }
  };
}

// ===============================
// 현재가 조회
// ===============================
async function fetchQuote(symbol) {
  const r = await fetch(
    `${QUOTE_ENDPOINT}?symbol=${encodeURIComponent(symbol)}`
  );
  const d = await r.json();
  if (!r.ok || !d.ok) throw "QUOTE_FAIL";
  return d;
}

function wireQuoteMini() {
  const i = $("qSymbol"),
    b = $("qBtn"),
    o = $("qOut");
  if (!i || !b || !o) return;

  const run = async () => {
    o.textContent = "조회중…";
    try {
      const q = await fetchQuote(i.value);
      o.textContent = `${q.symbol} (${q.name}) $${q.price}`;
    } catch {
      o.textContent = "조회 실패";
    }
  };

  b.onclick = run;
  i.onkeydown = (e) => e.key === "Enter" && run();
}

// ===============================
// 시작
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  wireLoginUI();
  wireLogout();
  wireQuoteMini();
  await routeByLogin();
});
