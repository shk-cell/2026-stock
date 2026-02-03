// app.js (FULL) - GitHub Pages + Firebase(Firestore) + Yahoo 현재가 조회(Functions)
// - 간이 로그인(Firestore users/{id}에 password 저장)  ※교육용
// - 첫 로그인 시 초기자산 지급(중복 지급 방지)
// - 상단 배지(ID/총자산/로그아웃) 업데이트
// - 현재가 조회 최소 UI: #qSymbol #qBtn #qOut
//
// 필요한 HTML id (없어도 코드가 조용히 넘어가도록 방어 처리됨)
// - 로그인 영역: #loginWrap, #loginId, #loginPw, #loginBtn, #loginMsg
// - 메인 영역: #appWrap
// - 상단: #meIdBadge, #meAssetBadge, #logoutBtn
// - 현재가: #qSymbol, #qBtn, #qOut

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
// 0) Firebase 설정 (본인 값으로 교체)
// ===============================
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// ===============================
// 1) Yahoo 현재가 Function URL (이미 배포된 것)
// ===============================
const QUOTE_ENDPOINT =
  "https://us-central1-stock-62c76.cloudfunctions.net/quote";

// ===============================
// 2) 앱 기본 상수
// ===============================
const START_CASH = 70000;
const SESSION_KEY = "stock_sim_user_id";

// ===============================
// 3) Firebase init
// ===============================
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ===============================
// 4) 유틸
// ===============================
const $ = (id) => document.getElementById(id);

function formatMoney(v) {
  const n = Number(v || 0);
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function show(id, isShow) {
  const el = $(id);
  if (!el) return;
  el.style.display = isShow ? "" : "none";
}

// ===============================
// 5) 세션
// ===============================
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
// 6) (교육용) 간이 로그인: Firestore users/{id}.password 비교
//    - users/{id} 문서 예시:
//      { password: "test", initialized: true/false, cash: 70000, createdAt: ... }
// ===============================
async function loginWithIdPassword(id, pw) {
  const userId = (id || "").trim();
  const password = (pw || "").trim();
  if (!userId || !password) throw new Error("ID_PW_REQUIRED");

  const ref = doc(db, "users", userId);
  const snap = await getDoc(ref);

  if (!snap.exists()) throw new Error("NO_USER");

  const data = snap.data();
  if ((data.password || "") !== password) throw new Error("BAD_PASSWORD");

  // 최초 지급/초기화
  if (!data.initialized) {
    await updateDoc(ref, {
      initialized: true,
      cash: START_CASH,
      updatedAt: serverTimestamp(),
    });
  }

  setMeId(userId);
  return true;
}

// ===============================
// 7) 현재 사용자 자산 읽기
// ===============================
async function getMyAsset() {
  const meId = getMeId();
  if (!meId) return null;

  const ref = doc(db, "users", meId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const u = snap.data();

  // 지금은 현금만 총자산으로 표시 (추후 보유주식 합산 가능)
  const cash = Number(u.cash || 0);
  const total = cash;

  return { meId, cash, total };
}

// ===============================
// 8) 상단 배지 업데이트
// ===============================
async function refreshTopbar() {
  const meId = getMeId();
  if (!meId) {
    setText("meIdBadge", "ID: -");
    setText("meAssetBadge", "총자산 -");
    return;
  }

  setText("meIdBadge", `ID: ${meId}`);

  const asset = await getMyAsset();
  if (!asset) {
    setText("meAssetBadge", "총자산 -");
    return;
  }
  setText("meAssetBadge", `총자산 $${formatMoney(asset.total)}`);
}

// ===============================
// 9) 로그아웃
// ===============================
function wireLogout() {
  const btn = $("logoutBtn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    clearMeId();
    routeByLogin();
  });
}

// ===============================
// 10) 화면 라우팅 (로그인/메인)
// ===============================
async function routeByLogin() {
  const meId = getMeId();
  const loggedIn = !!meId;

  show("loginWrap", !loggedIn);
  show("appWrap", loggedIn);

  await refreshTopbar();
}

// ===============================
// 11) 로그인 UI 연결
// ===============================
function wireLoginUI() {
  const btn = $("loginBtn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const id = $("loginId")?.value || "";
    const pw = $("loginPw")?.value || "";
    const msg = $("loginMsg");

    if (msg) msg.textContent = "";

    try {
      btn.disabled = true;
      await loginWithIdPassword(id, pw);
      await routeByLogin();
    } catch (e) {
      const code = String(e?.message || e);
      if (msg) {
        msg.textContent =
          code === "NO_USER"
            ? "존재하지 않는 아이디입니다."
            : code === "BAD_PASSWORD"
            ? "비밀번호가 틀렸습니다."
            : code === "ID_PW_REQUIRED"
            ? "아이디/비밀번호를 입력하세요."
            : "로그인 실패";
      }
    } finally {
      btn.disabled = false;
    }
  });

  // Enter로 로그인
  const idInput = $("loginId");
  const pwInput = $("loginPw");
  const enterHandler = (ev) => {
    if (ev.key === "Enter") btn.click();
  };
  if (idInput) idInput.addEventListener("keydown", enterHandler);
  if (pwInput) pwInput.addEventListener("keydown", enterHandler);
}

// ===============================
// 12) Yahoo 현재가 조회(Functions) - 최소
// ===============================
async function fetchQuote(symbol) {
  const s = (symbol || "").trim().toUpperCase();
  if (!s) throw new Error("SYMBOL_EMPTY");

  const r = await fetch(`${QUOTE_ENDPOINT}?symbol=${encodeURIComponent(s)}`);
  const d = await r.json();

  if (!r.ok || !d.ok) throw new Error(d.error || "QUOTE_FAIL");
  return d; // { ok, symbol, name, price, ... }
}

function wireQuoteMini() {
  const $in = $("qSymbol");
  const $btn = $("qBtn");
  const $out = $("qOut");
  if (!$in || !$btn || !$out) return; // UI 없으면 조용히 종료

  const run = async () => {
    const sym = $in.value;
    $out.textContent = "조회중…";
    try {
      const q = await fetchQuote(sym);
      const name = q.name ? `(${q.name})` : "";
      $out.textContent = `${q.symbol} ${name} $${q.price}`;
    } catch (e) {
      $out.textContent = "조회 실패";
    }
  };

  $btn.addEventListener("click", run);
  $in.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") run();
  });
}

// ===============================
// 13) 시작
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  wireLoginUI();
  wireLogout();
  wireQuoteMini();
  await routeByLogin();
});
