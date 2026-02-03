
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

/* ✅ Firebase 설정 (사용자 제공 값) */
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

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);

const authView = $("authView");
const dashView = $("dashView");

const emailEl = $("email");
const pwEl = $("pw");
const loginBtn = $("loginBtn");

const logoutBtn = $("logoutBtn");

const authMsg = $("authMsg");
const dashMsg = $("dashMsg");
const userEmail = $("userEmail");
const cashText = $("cashText");

const fmtUSD = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

function setText(el, text = "") {
  if (el) el.textContent = text;
}

function showAuthed(user) {
  authView.classList.add("hidden");
  dashView.classList.remove("hidden");
  setText(userEmail, user.email || "-");
}

function showGuest() {
  dashView.classList.add("hidden");
  authView.classList.remove("hidden");
  setText(userEmail, "-");
  setText(cashText, "-");
  setText(dashMsg, "");
}

/* ---------- Firestore ---------- */
async function ensureUserDoc(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  // ✅ 첫 로그인 시에만 7만 달러 지급
  if (!snap.exists()) {
    await setDoc(ref, {
      email: user.email,
      cash: 70000,
      createdAt: serverTimestamp(),
    });
    return { cash: 70000, created: true };
  }

  const data = snap.data();
  return { cash: data.cash ?? 0, created: false };
}

async function loadCash(user) {
  const snap = await getDoc(doc(db, "users", user.uid));
  const data = snap.data();
  setText(cashText, fmtUSD(data?.cash ?? 0));
}

/* ---------- Events ---------- */
loginBtn.onclick = async () => {
  try {
    setText(authMsg, "");
    const email = emailEl.value.trim();
    const pw = pwEl.value;

    if (!email || !pw) {
      setText(authMsg, "이메일과 비밀번호를 입력해 주세요.");
      return;
    }

    await signInWithEmailAndPassword(auth, email, pw);
  } catch (e) {
    setText(authMsg, `로그인 실패: ${e.code || e.message}`);
  }
};

logoutBtn.onclick = async () => {
  await signOut(auth);
};

/* ---------- Auth State ---------- */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    showGuest();
    setText(authMsg, "로그인 해 주세요.");
    return;
  }

  showAuthed(user);

  try {
    const result = await ensureUserDoc(user);
    await loadCash(user);

    if (result.created) {
      setText(dashMsg, "첫 로그인이라 70,000달러가 지급되었습니다.");
    } else {
      setText(dashMsg, "");
    }
  } catch (e) {
    setText(dashMsg, `데이터 로딩 실패: ${e.code || e.message}`);
  }
});
