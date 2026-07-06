// ✅ 音声ファイルの定義と初期ロード
const soundOk = new Audio('ok.wav');
soundOk.preload = "auto";

const soundAlert = new Audio('alert.wav');
soundAlert.preload = "auto";

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
        await executeManualInput();
      }
    });
  }
  updateHistoryCountDisplay(); // 起動時に現在の蓄積件数を表示
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
  barcodeInput.value = "";
  
  if (val !== "") {
    await handleGS1Check(val);
  }
}

// 🎯 【新機能】件数表示の更新
function updateHistoryCountDisplay() {
  const data = JSON.parse(localStorage.getItem("gs1_scan_history") || "[]");
  document.getElementById("historyCount").innerText = `${data.length} 件`;
}

// 🎯 【新機能】データの蓄積（localStorageへの保存）
function saveScanRecord(rawCode, parsedJan, parsedExpiry, parsedLot) {
  const history = JSON.parse(localStorage.getItem("gs1_scan_history") || "[]");
  
  // 現在の日時を取得 (yyyy/mm/dd hh:mm:ss)
  const now = new Date();
  const timestamp = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  
  // 新しいレコードを作成
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

// 🎯 【新機能】CSVデータの出力・共有（現場調査アプリ移植仕様）
function shareDataAsCSV() {
  const history = JSON.parse(localStorage.getItem("gs1_scan_history") || "[]");
  if (history.length === 0) {
    alert("蓄積されたデータがありません。");
    return;
  }
  
  // CSVのヘッダー定義（エクセル化けを防ぐためShift_JIS文字コードではなく標準のUTF-8・BOM付で書き出します）
  let csvContent = "\uFEFF読込日時,読み込んだコード,JAN,有効期限,ロット\r\n";
  
  history.forEach(item => {
    // CSV項目内でカンマや改行の誤動作を防ぐ安全処理
    const row = [
      `"${item.time}"`,
      `"${item.raw}"`,
      `"${item.jan}"`,
      `"${item.expiry}"`,
      `"${item.lot}"`
    ];
    csvContent += row.join(",") + "\r\n";
  });
  
  // Web Share API 用にファイルを生成
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const file = new File([blob], "gs1_scan_data.csv", { type: "text/csv" });
  
  // スマホの標準共有（メール、LINE、ファイル保存など）を起動
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

// 🎯 【新機能】蓄積データの全消去
function clearStoredData() {
  if (!confirm("蓄積されたすべての履歴データを削除しますか？\n（一度消すと元に戻せません）")) return;
  localStorage.removeItem("gs1_scan_history");
  updateHistoryCountDisplay();
  alert("履歴をクリアしました。");
  keepFocus();
}

// GS1-128 解析・チェック・蓄積メインロジック
async function handleGS1Check(raw) {
  const digits = raw.replace(/\D/g, "");
  const resultList = document.getElementById("resultList");
  
  resultList.innerHTML = "";

  // A. 先頭2桁が「01」以外はエラー
  if (!digits.startsWith("01")) {
    const card = document.createElement("div");
    card.className = "card card-danger";
    card.innerHTML = `❌ GS1-128コードではありません！<br><span style="font-size:12px; font-weight:normal;">(入力値: ${raw})</span>`;
    resultList.prepend(card);
    playAlertSound(); 
    
    // GS1ではないが、①読取コードと②読込日時だけを蓄積に回す（③は空欄）
    saveScanRecord(raw, "", "", "");
    keepFocus();
    return;
  }

  // ⑪ GS1-128構造の解析変数定義
  let janCode = digits.substring(2, 16); // AI(01)に続く14桁のGTIN/JAN
  let expiryStr = "";
  let lotCode = "";

  const aiExpiry = digits.substring(16, 18);
  
  // B. 有効期限の識別子「17」ではない（＝期限のない商品）場合
  if (aiExpiry !== "17") {
    // 期限はないが、ロット情報(AI:10)がさらに後ろに存在するか簡易抽出を試みる
    if (digits.length > 16) {
      lotCode = digits.substring(16); // 残りを暫定ロットとして扱う
    }
    
    // データを蓄積
    saveScanRecord(raw, janCode, "期限なし", lotCode);
    
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
  expiryStr = `${year}/${String(month + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}`;

  // 有効期限の後ろ（24桁目以降）にデータがあれば、それをロット識別子(10)とロット番号として抽出
  if (digits.length > 24) {
    // 先頭が10（ロット識別子）から始まっている場合はそれを除いた部分をロット番号にする
    const remaining = digits.substring(24);
    if (remaining.startsWith("10")) {
      lotCode = remaining.substring(22); // AI(10)を取り除いた残りの文字列
    } else {
      lotCode = remaining;
    }
  }

  // 🎯 【重要】判定前に、切り分けたデータをスマホに確定蓄積
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
  
  // C-1. 本日より前 ＝ 【期限切れ！】
  if (expiryDate < today) {
    playAlertSound();
    const card = document.createElement("div");
    card.className = "card card-danger";
    card.innerHTML = `
      🚨 期限切れ！<br>
      <span style="font-size:24px;">有効期限: ${expiryStr}</span><br>
      <span style="font-size:12px; font-weight:normal;">(コード: ${digits})</span>
    `;
    resultList.prepend(card);
  }
  // C-2. 本日〜基準日の間 ＝ 【期限切迫！】
  else if (expiryDate >= today && expiryDate <= baseDate) {
    playAlertSound();
    const card = document.createElement("div");
    card.className = "card card-warn";
    card.innerHTML = `
      ⚠️ 期限切迫！<br>
      <span style="font-size:24px;">有効期限: ${expiryStr}</span><br>
      <span style="font-size:12px; font-weight:normal;">(コード: ${digits})</span>
    `;
    resultList.prepend(card);
  }
  // C-3. 基準日より先 ＝ 【OK】
  else {
    playBeep(); 
    const card = document.createElement("div");
    card.className = "card card-ok";
    card.innerHTML = `
      ✅ OK (安全圏)<br>
      <span style="font-size:20px;">有効期限: ${expiryStr}</span>
    `;
    resultList.prepend(card);
  }

  keepFocus();
}
