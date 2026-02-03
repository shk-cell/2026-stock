import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { 
  getFirestore, doc, getDoc, setDoc, runTransaction, 
  serverTimestamp, collection, getDocs 
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { 
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

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
const auth = getAuth(app);

const START_CASH = 70000;
const QUOTE_ENDPOINT = "https://quote-ymhlxyctxq-uc.a.run.app"; 

let currentStockPrice = 0;
let currentSymbol = "";
let currentView = null;

const $ = (id) => document.getElementById(id);
const money = (v) => `$${Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function show(el, on) {
  if (!el) return;
  on ? el.classList.remove("hidden") : el.classList.add("hidden");
}

async function fetchQuote() {
  const o = $("qOut");
  const s = $("qSymbol").value.trim().toUpperCase();
  if (!s) return;
  o.textContent = "조회중...";
  try {
    const r = await fetch(`${QUOTE_ENDPOINT}?symbol=${encodeURIComponent(s)}`);
    const d = await r.json();
    if (d.ok) {
      currentSymbol = d.symbol;
      currentStockPrice = d.price;
      o.innerHTML = `<b style="color:#2b7cff;">${d.symbol}</b>: ${money(d.price)} <small style="color:#93a4b8;">(조회됨)</small>`;
    } else { o.textContent = "조회 실패: 없는 종목"; }
  } catch { o.textContent = "네트워크 에러"; }
}

async function buyStock() {
  const user = auth.currentUser;
  if (!user || !currentSymbol || currentStockPrice <= 0) {
    alert("종목을 먼저 조회해 주세요.");
    return;
  }
  const inputQty = prompt(`${currentSymbol}을 몇 주 매수하시겠습니까?\n(현재가: ${money(currentStockPrice)})`, "1");
  const qty = parseInt(inputQty);
  if (isNaN(qty) || qty <= 0) return;

  const totalCost = currentStockPrice * qty;
  const userRef = doc(db, "users", user.email);
  const stockRef = doc(db, "users", user.email, "portfolio", currentSymbol);

  try {
    await runTransaction(db, async (t) => {
      const uSnap = await t.get(userRef);
      const sSnap = await t.get(stockRef);
      const cash = uSnap.data().cash;
      if (cash < totalCost) throw "가용 자산이 부족합니다!";
      t.update(userRef, { cash: cash - totalCost });
      if (sSnap.exists()) t.update(stockRef, { qty: sSnap.data().qty + qty, updatedAt: serverTimestamp() });
      else t.set(stockRef, { symbol: currentSymbol, qty: qty, updatedAt: serverTimestamp() });
    });
    alert("매수 완료!");
    await updateAssets(user);
  } catch (e) { alert(e); }
}

async function sellStock(symbol, sellQty) {
  const user = auth.currentUser;
  const userRef = doc(db, "users", user.email);
  const stockRef = doc(db, "users", user.email, "portfolio", symbol);

  try {
    await runTransaction(db, async (t) => {
      const uSnap = await t.get(userRef);
      const sSnap = await t.get(stockRef);
      if (!sSnap.exists() || sSnap.data().qty < sellQty) throw "보유 수량이 부족합니다!";
      const cash = uSnap.data().cash;
      const totalGain = currentStockPrice * sellQty;
      t.update(userRef, { cash: cash + totalGain });
      if (sSnap.data().qty === sellQty) t.delete(stockRef);
      else t.update(stockRef, { qty: sSnap.data().qty - sellQty });
    });
    alert("매도 완료!");
    await updateAssets(user);
  } catch (e) { alert(e); }
}

async function updateAssets(user) {
  try {
    const userRef = doc(db, "users", user.email);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, { cash: START_CASH });
      $("cashText").textContent = money(START_CASH);
      return;
    }
    const cash = snap.data().cash;
    $("cashText").textContent = money(cash);

    const portSnap = await getDocs(collection(db, "users", user.email, "portfolio"));
    let listHtml = "";
    let totalStockValue = 0;

    for (const d of portSnap.docs) {
      const item = d.data();
      let livePrice = 0;
      try {
        const r = await fetch(`${QUOTE_ENDPOINT}?symbol=${encodeURIComponent(item.symbol)}`);
        const res = await r.json();
        if (res.ok) livePrice = res.price;
      } catch {}
      totalStockValue += (livePrice * item.qty);
      listHtml += `
        <div class="portfolio-item">
          <div style="display:flex; flex-direction:column;">
            <span style="font-weight:bold; color:var(--pri);">${item.symbol}</span>
            <small style="color:var(--muted);">현재가: ${money(livePrice)}</small>
          </div>
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="text-align:right;">
              <b style="color:#fff; display:block;">${item.qty}주</b>
              <small style="color:var(--warn);">평가액: ${money(livePrice * item.qty)}</small>
            </div>
            <button class="btn-sell" onclick="window.quickSell('${item.symbol}')">매도</button>
          </div>
        </div>`;
    }
    $("portfolioList").innerHTML = listHtml || '<div class="muted" style="text-align:center;">보유 주식 없음</div>';
    $("totalAssetsText").textContent = money(cash + totalStockValue);
  } catch (e) { console.error(e); }
}

window.quickSell = async (symbol) => {
  $("qSymbol").value = symbol;
  await fetchQuote();
  const q = prompt(`${symbol}을 몇 주 매도하시겠습니까?`, "1");
  if (q && parseInt(q) > 0) await sellStock(symbol, parseInt(q));
};

async function login() {
  const email = $("email").value.trim();
  const pw = $("pw").value.trim();
  try { await signInWithEmailAndPassword(auth, email, pw); } 
  catch { $("authMsg").textContent = "로그인 정보가 틀립니다."; }
}

onAuthStateChanged(auth, async (user) => {
  const nextView = user ? "dash" : "auth";
  if (currentView !== nextView) {
    currentView = nextView;
    show($("authView"), !user);
    show($("dashView"), !!user);
    if (user) $("userEmail").textContent = user.email;
  }
  if (user) await updateAssets(user);
});

document.addEventListener("DOMContentLoaded", () => {
  $("loginBtn").onclick = login;
  $("logoutBtn").onclick = () => { currentView = null; signOut(auth); };
  $("qBtn").onclick = fetchQuote;
  $("buyBtn").onclick = buyStock;
  $("pw").onkeydown = (e) => e.key === "Enter" && login();
});
