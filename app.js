import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* Firebase 설정 */
const firebaseConfig = {
  apiKey: "AIzaSyCzjJDKMbzHjs7s7jMnfK64bbHEEmpyZxI",
  authDomain: "stock-62c76.firebaseapp.com",
  projectId: "stock-62c76",
  storageBucket: "stock-62c76.firebasestorage.app",
  messagingSenderId: "149071161310",
  appId: "1:149071161310:web:79ebd6f09321dd5f2f1f4f",
  measurementId: "G-XESP43FXJG",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* DOM helpers */
const $ = (id) => document.getElementById(id);
const must = (id) => {
  const el = $(id);
  if (!el) throw new Error(`HTML에서 id="${id}" 요소를 찾을 수 없습니다. (index.html id 확인!)`);
  return el;
};

let authView, dashView, emailEl, pwEl, loginBtn, logoutBtn;
let authMsg, dashMsg, userEmail, cashText;

const fmtUSD = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

function safeSetText(el, text = "") {
  if (el) el.textContent = text;
}

function showGuest() {
  authView.classList.remove("hidden");
  dashView.classList.add("hidden");
}

function showAuthed(user) {
  authView.classList.add("hidden");
  dashView.classList.remove("hidden");
  userEmail.textContent = user.email || "-";
}

/* Firestore */
async function ensureUserDoc(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      email: user.email,
      cash: 70000,
      createdAt: serverTimestamp(),
    });
    return { created: true };
  }
  return { created: false };
}

async function loadCash(user) {
  const snap = await getDoc(doc(db, "users", user.uid));
  const data = snap.data();
  cashText.textContent = fmtUSD(data?.cash ?? 0);
}

/* 부팅 */
function boot() {
  // ✅ 여기서 id가 하나라도 없으면 즉시 “정확한 원인”을 에러로 보여줌
  authView = must("authView");
  dashView = must("dashView");

  emailEl = must("email");
  pwEl = must("pw");
  loginBtn = must("loginBtn");
  logoutBtn = must("logoutBtn");

  authMsg = must("authMsg");
  dashMsg = must("dashMsg");
  userEmail = must("userEmail");
  cashText = must("cashText");

  /* 이벤트 */
  loginBtn.onclick = async () => {
    try {
      safeSetText(authMsg, "");
      const email = emailEl.value.trim();
      const pw = pwEl.value;

      if (!email || !pw) {
        safeSetText(authMsg, "이메일과 비밀번호를 입력해 주세요.");
        return;
      }

      await signInWithEmailAndPassword(auth, email, pw);
    } catch (e) {
      safeSetText(authMsg, "로그인 실패: " + (e.code || e.message || e));
    }
  };

  logoutBtn.onclick = async () => {
    await signOut(auth);
  };

  /* 인증 상태 */
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      showGuest();
      safeSetText(authMsg, "로그인 해 주세요.");
      return;
    }

    showAuthed(user);

    try {
      const result = await ensureUserDoc(user);
      await loadCash(user);
      safeSetText(
        dashMsg,
        result.created ? "첫 로그인이라 70,000달러가 지급되었습니다." : ""
      );
    } catch (e) {
      safeSetText(dashMsg, "데이터 로딩 실패: " + (e.code || e.message || e));
    }
  });
}

// ✅ 문서 로드 후 실행
try {
  boot();
} catch (e) {
  console.error(e);
  // 화면에도 보이게 출력 (authMsg가 없을 수도 있으니 document에 직접 출력)
  const pre = document.createElement("pre");
  pre.style.whiteSpace = "pre-wrap";
  pre.style.color = "#ffd479";
  pre.style.padding = "12px";
  pre.textContent = "초기화 오류:\n" + (e.message || e);
  document.body.prepend(pre);
}

