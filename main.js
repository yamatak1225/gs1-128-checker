// ✅ Audio設定（高精度Web Audio APIを使用）
let audioCtx = null;

function initAudio() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    // ダミーの音を鳴らして有効化
    const osc = audioCtx.createOscillator();
    osc.connect(audioCtx.destination);
    osc.start(0);
    osc.stop(0.01);
  } catch (e) {
    console.error("Audio init error:", e);
  }
}

// 🎯 安全圏用・期限なし用の「ピ！」という短い単発ビープ音
function playBeep() {
  initAudio();
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const soundLength = 0.05; 
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  
  o.frequency.value = 2300; 
  g.gain.setValueAtTime(1.0, now); 
  g.gain.exponentialRampToValueAtTime(0.001, now + soundLength);
  
  o.connect(g); g.connect(audioCtx.destination);
  o.start(now); o.stop(now + soundLength);
}

// 警告用（3回ビープ）
function playAlertSound() {
  return new Promise((resolve) => {
    initAudio();
    if (!audioCtx) { resolve(); return; }
    const now = audioCtx.currentTime;
    const soundLength = 0.08;
    const interval = 0.15;
    
    for (let i = 0; i < 3; i++) {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = 1800; // 警告音
      g.gain.setValueAtTime(1.0, now + (interval * i));
      g.gain.exponentialRampToValueAtTime(0.001, now + (interval * i) + soundLength);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(now + (interval * i)); o.stop(now + (interval * i) + soundLength);
    }
    setTimeout(() => { resolve(); }, 500);
  });
}

function forceReloadApp() {
  if (!confirm("アプリを最新状態に更新しますか？")) return;
  const currentUrl = window.location.origin + window.location.pathname;
  window.location.replace(currentUrl + "?v=" + new Date().getTime());
}

function keepFocus() {
  const inputEl = document.getElementById("barcodeInput");
  if (inputEl && (document.activeElement === document.body || document.activeElement === null)) {
    inputEl.focus();
  }
}

// 起動時・クリック時のフォーカス制御
window.addEventListener("DOMContentLoaded", () => {
  // 切迫基準日のデフォルトを「6カ月先」に設定
  const baseDate = new Date();
  baseDate.setMonth(baseDate.getMonth() + 6);
  
  const yyyy = baseDate.getFullYear();
  const mm = String(baseDate.getMonth() + 1).padStart(2, '0');
  const dd = String(baseDate.getDate()).padStart(2, '0');
  document.getElementById("alertBaseDate").value = `${yyyy}-${mm}-${dd}`;

  const barcodeInput = document.getElementById("barcodeInput");
  if (barcodeInput) {
    barcodeInput.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        initAudio(); // 🎯 スキャン（エンター）の瞬間に音声を強制アクティブ化
        await executeManualInput();
      }
    });
  }
  setTimeout(keepFocus, 500);
});

document.body.addEventListener("click", (e) => {
  const t = e.target.tagName;
  if (t === "BUTTON" || t === "INPUT") return;
  initAudio(); // 🎯 画面タップ時にも音声コンテキストを有効化
  setTimeout(keepFocus, 50);
});

async function executeManualInput() {
  const barcodeInput = document.getElementById("barcodeInput");
  if (!barcodeInput) return;
  
  const val = barcodeInput.value.trim();
  barcodeInput.value = ""; // 次の読み取りのために即座にクリア
  
  if (val !== "") {
    await handleGS1Check(val);
  }
}

// GS1-128 解析・チェックメインロジック
async function handleGS1Check(raw) {
  const digits = raw.replace(/\D/g, "");
  const resultList = document.getElementById("resultList");
  
  resultList.innerHTML = "";

  // ⑩ 先頭2桁が「01」以外はエラー
  if (!digits.startsWith("01")) {
    const card = document.createElement("div");
    card.className = "card card-danger";
    card.innerHTML = `❌ GS1-128コードではありません！<br><span style="font-size:12px; font-weight:normal;">(入力値: ${raw})</span>`;
    resultList.prepend(card);
    await playAlertSound();
    keepFocus();
    return;
  }

  const aiExpiry = digits.substring(16, 18);
  
  // 🎯 【変更】有効期限の識別子「17」ではない（＝期限のない商品）場合も緑色カードにして「ピ！」と鳴らす
  if (aiExpiry !== "17") {
    playBeep(); // 安全圏と同じ「ピ！」音
    const card = document.createElement("div");
    card.className = "card card-ok"; // 安全圏と同じ緑色
    card.innerHTML = `
      ✅ OK (期限なし商品)<br>
      <span style="font-size:14px; font-weight:normal;">有効期限の指定がない製品です。</span>
    `;
    resultList.prepend(card);
    keepFocus();
    return;
  }

  // 有効期限6桁 (yymmdd) を抽出
  const yy = digits.substring(18, 20);
  const mm = digits.substring(20, 22);
  const dd = digits.substring(22, 24);

  let year = 2000 + parseInt(yy, 10);
  let month = parseInt(mm, 10) - 1; 
  let day = parseInt(dd, 10);

  if (dd === "00") {
    const lastDay = new Date(year, month + 1, 0);
    day = lastDay.getDate();
  }

  const expiryDate = new Date(year, month, day);
  
  const baseDateVal = document.getElementById("alertBaseDate").value;
  if (!baseDateVal) {
    alert("切迫基準日を入力してください。");
    return;
  }
  const baseDate = new Date(baseDateVal);
  baseDate.setHours(0,0,0,0);
  
  const today = new Date();
  today.setHours(0,0,0,0);
  expiryDate.setHours(0,0,0,0);

  const formattedExpiry = `${year}/${String(month + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}`;

  // 判定と音の鳴らし分け
  
  // A. 本日より前 ＝ 【期限切れ！】（赤色 ＋ 警告音）
  if (expiryDate < today) {
    await playAlertSound();
    const card = document.createElement("div");
    card.className = "card card-danger";
    card.innerHTML = `
      🚨 期限切れ！<br>
      <span style="font-size:24px;">有効期限: ${formattedExpiry}</span><br>
      <span style="font-size:12px; font-weight:normal;">(コード: ${digits})</span>
    `;
    resultList.prepend(card);
  }
  // B. 本日〜基準日の間 ＝ 【期限切迫！】（黄色 ＋ 警告音）
  else if (expiryDate >= today && expiryDate <= baseDate) {
    await playAlertSound();
    const card = document.createElement("div");
    card.className = "card card-warn";
    card.innerHTML = `
      ⚠️ 期限切迫！<br>
      <span style="font-size:24px;">有効期限: ${formattedExpiry}</span><br>
      <span style="font-size:12px; font-weight:normal;">(コード: ${digits})</span>
    `;
    resultList.prepend(card);
  }
  // C. 基準日より先 ＝ 【OK】（緑色 ＋ 単発ピ！音）
  else {
    playBeep(); 
    const card = document.createElement("div");
    card.className = "card card-ok";
    card.innerHTML = `
      ✅ OK (安全圏)<br>
      <span style="font-size:20px;">有効期限: ${formattedExpiry}</span>
    `;
    resultList.prepend(card);
  }

  keepFocus();
}
