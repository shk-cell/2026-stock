<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>부평중 모의투자</title>
  <style>
    :root { --bg: #0b0f14; --card: #121923; --line: #1e2a3a; --muted: #93a4b8; --txt: #eaf0f7; --pri: #2b7cff; --warn: #ffd479; --up: #ff4d4d; --down: #4d94ff; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, sans-serif; background: var(--bg); color: var(--txt); }
    .wrap { max-width: 520px; margin: 60px auto; padding: 0 16px; }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: 20px; padding: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.3); }
    h1 { margin: 0 0 8px; font-size: 22px; line-height: 1.4; word-break: keep-all; }
    .muted { color: var(--muted); font-size: 14px; margin-bottom: 20px; }
    label { display: block; margin-top: 16px; font-size: 12px; color: var(--pri); font-weight: 600; text-transform: uppercase; }
    
    input { width: 100%; height: 48px; border-radius: 12px; border: 1px solid var(--line); background: #0e141d; color: var(--txt); padding: 0 16px; outline: none; font-size: 15px; }
    .btn { height: 40px; border-radius: 10px; border: 0; color: white; font-weight: 700; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; font-size: 13px; }
    .btn:disabled { opacity: 0.2; cursor: not-allowed; filter: grayscale(1); }
    
    .btn-buy { background: var(--up); width: 60px; }
    .btn-sell { background: var(--pri); min-width: 60px; height: 36px; border-radius: 8px; font-weight: 700; border: 0; color: white; cursor: pointer; }
    .btn-refresh { background: #1e2a3a; border: 1px solid var(--pri); color: var(--pri); width: 100%; margin-top: 10px; height: 44px; }
    .btn-outline { background: transparent; border: 1px solid var(--line); height: 32px; padding: 0 12px; font-size: 12px; border-radius: 8px; color: var(--muted); cursor: pointer; }

    .hidden { display: none !important; }
    .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
    .stat-card { background: #1a222c; border: 1px solid var(--line); border-radius: 16px; padding: 14px; }
    .stat-label { font-size: 11px; color: var(--muted); }
    .stat-value { font-size: 18px; font-weight: 800; margin-top: 4px; }
    
    .portfolio-item { background: #1e2a3a; padding: 14px; border-radius: 16px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--line); }
    #qOutBox { margin-top: 10px; padding: 12px; background: #1a222c; border-radius: 12px; display: none; align-items: center; justify-content: space-between; border: 1px solid var(--line); }
    .list-container { background: #1a222c; border-radius: 16px; padding: 8px; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <section id="authView">
        <h1 style="text-align: center; color: var(--pri);">부평중학교<br>모의 투자시뮬레이션</h1>
        <div class="muted" style="text-align: center;">계정 정보를 입력하여 시작하세요.</div>
        <input id="email" type="email" placeholder="이메일 아이디" style="margin-bottom:8px;" />
        <input id="pw" type="password" placeholder="비밀번호" />
        <button id="loginBtn" class="btn" style="width:100%; background:var(--pri); margin-top:20px; height:52px; font-size: 16px;">로그인</button>
        <div id="authMsg" style="text-align:center; color:var(--warn); margin-top:10px;"></div>
      </section>

      <section id="dashView" class="hidden">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--line); padding-bottom: 15px;">
          <div>
            <h1 id="userNickname" style="font-size:18px; margin:0;">로딩 중...</h1>
            <div id="userEmail" style="font-size: 11px; color: var(--muted);"></div>
          </div>
          <button id="logoutBtn" class="btn-outline">로그아웃</button>
        </div>

        <div style="background: rgba(43, 124, 255, 0.05); border: 1px dashed var(--pri); padding: 12px; border-radius: 15px; margin-bottom: 20px; text-align: center;">
          <div style="font-size: 12px; color: var(--txt); margin-bottom: 5px;">현재가를 반영해야 매수 / 매도가 가능합니다.</div>
          <div id="expireMsg" style="font-size: 11px; color: var(--muted); margin-bottom: 8px;">(갱신 유효 시간 60분 남음)</div>
          <button id="globalRefreshBtn" class="btn btn-refresh">시세 갱신 ↻</button>
        </div>

        <div class="stat-grid">
          <div class="stat-card"><div class="stat-label">현금</div><div id="cashText" class="stat-value">$0.00</div></div>
          <div class="stat-card"><div class="stat-label">총 자산</div><div id="totalAssetsText" class="stat-value">$0.00</div></div>
        </div>

        <label>주식 조회 및 매수</label>
        <div style="display:flex; gap:6px; margin-top:6px; align-items: center;">
          <input id="qSymbol" placeholder="종목명 (예: TSLA)" style="height:40px;" />
          <button id="qBtn" class="btn" style="width: 60px; background: #3a4452;">조회</button>
          <button id="buyBtn" class="btn btn-buy" disabled>매수</button>
        </div>

        <div id="qOutBox">
          <span id="qSymbolText" style="color: var(--muted); font-size: 13px; font-weight: 600;">-</span>
          <span id="qPriceText" style="color: var(--warn); font-size: 18px; font-weight: 800;">$0.00</span>
        </div>

        <label style="margin-top: 24px;">내 포트폴리오</label>
        <div id="portfolioList" style="margin-top: 10px;"></div>

        <label style="margin-top: 24px;">🏆 랭킹 (자산 순위)</label>
        <div id="rankingList" class="list-container"></div>

        <label style="margin-top: 24px;">🕒 최근 거래 내역</label>
        <div id="historyList" class="list-container" style="max-height: 200px; overflow-y: auto;"></div>
      </section>
    </div>
  </div>
  <script type="module" src="./app.js"></script>
</body>
</html>
