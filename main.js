// ✅ 音声ファイルの定義と初期ロード
// preload="auto" を指定し、あらかじめデータをメモリに最大まで読み込ませます
const soundOk = new Audio('ok.wav');
soundOk.preload = "auto";

const soundAlert = new Audio('alert.wav');
soundAlert.preload = "auto";

// 🎯 【修正】スキャン時の再ロード（load()）を完全に撤廃しました。
// これにより、通信待ちや読み込み待ちが発生せず、完全に0秒で即時再生されます。
function playBeep() {
  soundOk.currentTime = 0; 
  soundOk.play().catch(e => console.error("Audio play error (OK):", e));
}

function playAlertSound() {
  soundAlert.currentTime = 0; 
  soundAlert.play().catch(e => console.error("Audio play error (Alert):", e));
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
        // 🎯 余計な処理を挟まず、即座にメインロジックを実行します
        await executeManualInput();
      }
    });
  }
  setTimeout(keepFocus, 500);
});

document.body.addEventListener("click", (e) => {
  const t = e.target.tagName;
  if (t === "BUTTON" || t === "INPUT") return;
  setTimeout(keepFocus, 50);
});

async function executeManualInput() {
  const barcodeInput = document.getElementById("barcodeInput");
  if (!barcodeInput) return;
  
  const val = barcodeInput.value.trim();
  
  // 入力欄のクリア
  barcodeInput.value = "";
  
  if (val !== "") {
    await handleGS1Check(val);
  }
}

// GS1-128 解析・チェックメインロジック
async function handleGS1Check(raw) {
  const digits = raw.replace(/\D/g, "");
  const resultList = document.getElementById("resultList");
  
  resultList.innerHTML = "";

  // 先頭2桁が「01」以外はエラー
  if (!digits.startsWith("01")) {
    const card = document.createElement("div");
    card.className = "card card-danger";
    card.innerHTML = `❌ GS1-128コードではありません！<br><span style="font-size:12px; font-weight:normal;">(入力値: ${raw})</span>`;
    resultList.prepend(card);
    playAlertSound(); 
    keepFocus();
    return;
  }

  const aiExpiry = digits.substring(16, 18);
  
  // 有効期限の識別子「17」ではない（＝期限のない商品）場合も緑色カード
  if (aiExpiry !== "17") {
    playBeep(); 
    const card = document.createElement("div");
    card.className = "card card-ok"; 
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
  
  // A. 本日より前 ＝ 【期限切れ！】（赤色 ＋ ⚠️警告音）
  if (expiryDate < today) {
    playAlertSound();
    const card = document.createElement("div");
    card.className = "card card-danger";
    card.innerHTML = `
      🚨 期限切れ！<br>
      <span style="font-size:24px;">有効期限: ${formattedExpiry}</span><br>
      <span style="font-size:12px; font-weight:normal;">(コード: ${digits})</span>
    `;
    resultList.prepend(card);
  }
  // B. 本日〜基準日の間 ＝ 【期限切迫！】（黄色 ＋ ⚠️警告音）
  else if (expiryDate >= today && expiryDate <= baseDate) {
    playAlertSound();
    const card = document.createElement("div");
    card.className = "card card-warn";
    card.innerHTML = `
      ⚠️ 期限切迫！<br>
      <span style="font-size:24px;">有効期限: ${formattedExpiry}</span><br>
      <span style="font-size:12px; font-weight:normal;">(コード: ${digits})</span>
    `;
    resultList.prepend(card);
  }
  // C. 基準日より先 ＝ 【OK】（緑色 ＋ ✅OK音）
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
