import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ✅ 여기를 Firebase 콘솔(Web 앱) 설정값으로 교체
const firebaseConfig = {
  apiKey: "AIzaSyCzjJDKMbzHjs7s7jMnfK64bbHEEmpyZxI",
  authDomain: "stock-62c76.firebaseapp.com",
  projectId: "stock-62c76",
  storageBucket: "stock-62c76.firebasestorage.app",
  messagingSenderId: "149071161310",
  appId: "1:149071161310:web:79ebd6f09321dd5f2f1f4f",
  measurementId: "G-XESP43FXJG"
};


const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);

const emailEl = $("email");
const pwEl = $("pw");
const loginBtn = $("loginBtn");
const logoutBtn = $("logoutBtn");
const whoBtn = $("whoBtn");
const msgEl = $("msg");
const meEl = $("me");

const fmtUSD = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

function setMsg(t = "") { msgEl.textContent = t; }

async function ensureStarterMoney(user) {
  // users/{uid} 문서가 없으면 생성 + 현금 70,000 지급
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      email: user.email,
      cash: 70000,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

async function showMyAsset(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : null;

  meEl.style.display = "block";
  meEl.innerHTML = `
    <div style="font-weight:800">${user.email}</div>
    <div class="muted" style="margin-top:6px">현금: <b>${fmtUSD(data?.cash || 0)}</b></div>
  `;
}

loginBtn.onclick = async () => {
  try {
    setMsg("");
    const email = emailEl.value.trim();
    const pw = pwEl.value;

    if (!email || !pw) return setMsg("이메일과 비밀번호를 입력해 주세요.");

    await signInWithEmailAndPassword(auth, email, pw);
  } catch (e) {
    setMsg(`로그인 실패: ${e.code || e.message}
(※ 이메일이 test01@com 이면 형식 오류일 수 있어요. 점(.) 포함 주소로 확인해 주세요.)`);
  }
};

logoutBtn.onclick = async () => {
  await signOut(auth);
};

whoBtn.onclick = async () => {
  const user = auth.currentUser;
  if (!user) return;
  await showMyAsset(user);
};

onAuthStateChanged(auth, async (user) => {
  meEl.style.display = "none";
  meEl.innerHTML = "";

  if (!user) {
    logoutBtn.style.display = "none";
    whoBtn.style.display = "none";
    setMsg("로그인 해 주세요.");
    return;
  }

  logoutBtn.style.display = "inline-block";
  whoBtn.style.display = "inline-block";
  setMsg("로그인 성공! (처음 로그인이라면 70,000달러가 지급됩니다.)");

  await ensureStarterMoney(user);
  await showMyAsset(user);
});
