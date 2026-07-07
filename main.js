// ✅ 音声ファイルの定義と初期ロード
const soundOk = new Audio('ok.wav');
soundOk.preload = "auto";

const soundAlert = new Audio('alert.wav');
soundAlert.preload = "auto";

// ダブルタップ判定用のタイムスタンプ保持
let lastTapTime = 0;
let isDarkOverlayActive = false;

function initAudio() {
  soundOk.load();
  soundAlert.load();
}

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
  // 暗転モード中、または通常のフォーカス外れ時にインプットにフォーカスを戻す
  if (inputEl && (document.activeElement === document.body || document.activeElement === null || isDarkOverlayActive)) {
    inputEl.focus();
  }
}

// 🎯 暗転モード（画面誤動作防止）を有効にする
function enableDarkOverlay() {
  initAudio(); // iOS等の音声再生制限の予備解除
  const overlay = document.getElementById("darkOverlay");
  if (overlay) {
    overlay.style.display = "flex";
    isDarkOverlayActive = true;
    setTimeout(keepFocus, 100);
  }
}

// 🎯 暗転モード中のクリック（タップ）を検知し、ダブルタップなら解除する
function handleOverlayClick() {
  const currentTime = new Date().getTime();
  const tapLength = currentTime - lastTapTime;
  
  // 300ミリ秒以内の連続タップであれば「ダブルタップ」と判定して解除
  if (tapLength < 300 && tapLength > 0) {
    const overlay = document.getElementById("darkOverlay");
    if (overlay) {
      overlay.style.display = "none";
      isDarkOverlayActive = false;
      alert("画面誤動作防止モードを解除しました。");
      setTimeout(keepFocus, 200);
    }
  }
  lastTapTime = currentTime;
}

// 起動時・クリック時のフォーカス制御
window.addEventListener("DOMContentLoaded", () => {
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
        await executeManualInput();
      }
    });
  }
  updateHistoryCountDisplay(); 
  setTimeout(keepFocus, 500);
});

document.body.addEventListener("click", (e) => {
  const t = e.target.tagName;
  if (t === "BUTTON" || t === "INPUT" || isDarkOverlayActive) return;
  setTimeout(keepFocus, 50);
});

async function executeManualInput() {
  const barcodeInput = document.getElementById("barcodeInput");
  if (!barcodeInput) return;
  
  const val = barcodeInput.value.trim();
  barcodeInput.value = "";
  
  if (val !== "") {
    await handleGS1Check(val);
  }
}

function updateHistoryCountDisplay() {
  const data = JSON.parse(localStorage.getItem("gs1_scan_history") || "[]");
  document.getElementById("historyCount").innerText = `${data.length} 件`;
}

function saveScanRecord(rawCode, parsedJan, parsedExpiry, parsedLot) {
  const history = JSON.parse(localStorage.getItem("gs1_scan_history") || "[]");
  
  const now = new Date();
  const timestamp = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  
  const newRecord = {
    raw: rawCode,
    time: timestamp,
    jan: parsedJan || "",
    expiry: parsedExpiry || "",
    lot: parsedLot || ""
  };
  
  history.push(newRecord);
  localStorage.setItem("gs1_scan_history", JSON.stringify(history));
  updateHistoryCountDisplay();
}

function shareDataAsCSV() {
  const history = JSON.parse(localStorage.getItem("gs1_scan_history") || "[]");
  if (history.length === 0) {
    alert("蓄積されたデータがありません。");
    return;
  }
  
  let csvContent = "\uFEFF読込日時,読み込んだコード,JAN,有効期限,ロット\r\n";
  
  history.forEach(item => {
    const row = [
      `"${item.time}"`,
      `"${item.raw}"`,
      `"${item.jan}"`,
      `"${item.expiry}"`,
      `"${item.lot}"`
    ];
    csvContent += row.join(",") + "\r\n";
  });
  
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const file = new File([blob], "gs1_scan_data.csv", { type: "text/csv" });
  
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({
      files: [file],
      title: "GS1読取データエクスポート",
      text: "蓄積したバーコード読取履歴データ(CSV)です。"
    }).catch(err => console.log("共有キャンセル:", err));
  } else {
    alert("お使いのブラウザ・環境はCSVファイル直接共有に対応していません。");
  }
}

function clearStoredData() {
  if (!confirm("蓄積されたすべての履歴データを削除しますか？\n（一度消すと元に戻せません）")) return;
  localStorage.removeItem("gs1_scan_history");
  updateHistoryCountDisplay();
  alert("履歴をクリアしました。");
  keepFocus();
}

// GS1-128 解析・チェック・蓄積メインロジック
async function handleGS1Check(raw) {
  const resultList = document.getElementById("resultList");
  // 暗転モード中でなければ画面を書き換える
  if (!isDarkOverlayActive) {
    resultList.innerHTML = "";
  }

  const cleanRaw = raw.replace(/[\s\x00-\x1F\x7F-\x9F]/g, "");

  // 先頭2桁が「01」以外はエラー
  if (!cleanRaw.startsWith("01")) {
    if (!isDarkOverlayActive) {
      const card = document.createElement("div");
      card.className = "card card-danger";
      card.innerHTML = `❌ GS1-128コードではありません！<br><span style="font-size:12px; font-weight:normal;">(入力値: ${raw})</span>`;
      resultList.prepend(card);
    }
    playAlertSound(); 
    saveScanRecord(raw, "", "", "");
    keepFocus();
    return;
  }

  let janCode = cleanRaw.substring(2, 16); 
  let expiryStr = "";
  let lotCode = "";

  const aiExpiry = cleanRaw.substring(16, 18); 
  
  if (aiExpiry !== "17") {
    saveScanRecord(raw, janCode, "期限なし", "");
    playBeep(); 
    
    if (!isDarkOverlayActive) {
      const card = document.createElement("div");
      card.className = "card card-ok"; 
      card.innerHTML = `
        ✅ OK (期限なし商品)<br>
        <span style="font-size:14px; font-weight:normal;">有効期限の指定がない製品です。</span>
      `;
      resultList.prepend(card);
    }
    keepFocus();
    return;
  }

  const yy = cleanRaw.substring(18, 20);
  const mm = cleanRaw.substring(20, 22);
  const dd = cleanRaw.substring(22, 24);

  let year = 2000 + parseInt(yy, 10);
  let month = parseInt(mm, 10) - 1; 
  let day = parseInt(dd, 10);

  if (dd === "00") {
    const lastDay = new Date(year, month + 1, 0);
    day = lastDay.getDate();
  }

  const expiryDate = new Date(year, month, day);
  expiryStr = `${year}/${String(month + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}`;

  if (cleanRaw.length > 24) {
    const remaining = cleanRaw.substring(24); 
    if (remaining.startsWith("10")) {
      lotCode = remaining.substring(2); 
    }
  }

  saveScanRecord(raw, janCode, expiryStr, lotCode);

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

  // 判定と音の鳴らし分け
  if (expiryDate < today) {
    playAlertSound();
    if (!isDarkOverlayActive) {
      const card = document.createElement("div");
      card.className = "card card-danger";
      card.innerHTML = `
        🚨 期限切れ！<br>
        <span style="font-size:24px;">有効期限: ${expiryStr}</span><br>
        <span style="font-size:12px; font-weight:normal;">(コード: ${cleanRaw})</span>
      `;
      resultList.prepend(card);
    }
  }
  else if (expiryDate >= today && expiryDate <= baseDate) {
    playAlertSound();
    if (!isDarkOverlayActive) {
      const card = document.createElement("div");
      card.className = "card card-warn";
      card.innerHTML = `
        ⚠️ 期限切迫！<br>
        <span style="font-size:24px;">有効期限: ${expiryStr}</span><br>
        <span style="font-size:12px; font-weight:normal;">(コード: ${cleanRaw})</span>
      `;
      resultList.prepend(card);
    }
  }
  else {
    playBeep(); 
    if (!isDarkOverlayActive) {
      const card = document.createElement("div");
      card.className = "card card-ok";
      card.innerHTML = `
        ✅ OK (安全圏)<br>
        <span style="font-size:20px;">有効期限: ${expiryStr}</span>
      `;
      resultList.prepend(card);
    }
  }

  keepFocus();
}
