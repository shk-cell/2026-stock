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

/* DOM */
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
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n || 0);

/* 화면 전환 */
function showGuest() {
  authView.classList.remove("hidden");
  dashView.classList.add("hidden");
}

function showAuthed(user) {
  authView.classList.add("hidden");
  dashView.classList.remove("hidden");
  userEmail.textContent = user.email;
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
  cashText.textContent = fmtUSD(snap.data().cash);
}

/* 이벤트 */
loginBtn.onclick = async () => {
  try {
    authMsg.textContent = "";
    await signInWithEmailAndPassword(
      auth,
      emailEl.value.trim(),
      pwEl.value
    );
  } catch (e) {
    authMsg.textContent = "로그인 실패: " + e.code;
  }
};

logoutBtn.onclick = async () => {
  await signOut(auth);
};

/* 인증 상태 */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    showGuest();
    authMsg.textContent = "로그인 해 주세요.";
    return;
  }

  showAuthed(user);

  try {
    const result = await ensureUserDoc(user);
    await loadCash(user);
    dashMsg.textContent = result.created
      ? "첫 로그인이라 70,000달러가 지급되었습니다."
      : "";
  } catch (e) {
    dashMsg.textContent = "데이터 로딩 실패";
  }
});
