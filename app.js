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

/* ✅ 사용자 Firebase 설정 (제공해주신 값 그대로) */
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
const emailEl = $("email");
const pwEl = $("pw");
const loginBtn = $("loginBtn");
const logoutBtn = $("logoutBtn");
const msgEl = $("msg");
const assetEl = $("asset");

const fmtUSD = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n || 0);

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
  }
}

async function showAsset(user) {
  const snap = await getDoc(doc(db, "users", user.uid));
  const data = snap.data();

  assetEl.style.display = "block";
  assetEl.innerHTML = `
    <b>${user.email}</b><br/>
    현재 금액: <b>${fmtUSD(data.cash)}</b>
  `;
}

/* ---------- Auth ---------- */
loginBtn.onclick = async () => {
  try {
    msgEl.textContent = "";
    await signInWithEmailAndPassword(
      auth,
      emailEl.value.trim(),
      pwEl.value
    );
  } catch (e) {
    msgEl.textContent = "로그인 실패: " + e.code;
  }
};

logoutBtn.onclick = async () => {
  await signOut(auth);
};

/* ---------- Auth State ---------- */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    logoutBtn.style.display = "none";
    assetEl.style.display = "none";
    msgEl.textContent = "로그인 해 주세요.";
    return;
  }

  logoutBtn.style.display = "block";
  msgEl.textContent = "로그인 성공! (첫 로그인 시 7만 달러 지급)";
  await ensureUserDoc(user);
  await showAsset(user);
});
