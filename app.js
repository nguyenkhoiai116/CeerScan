/* =============================================
   app.js — Quét Mã Sinh Viên (Đọc trực tiếp từ CSV)
   ============================================= */

// ---------- Hàm lấy ngày hiện tại chuẩn giờ VN ----------
function getCurrentDate() {
  const tzOffset = (new Date()).getTimezoneOffset() * 60000;
  return (new Date(Date.now() - tzOffset)).toISOString().slice(0,10);
}

// ---------- State (dữ liệu ứng dụng) ----------
let studentDB   = {};   
let students    = [];   
let html5QrCode = null; 
let isScanning  = false;
let sessionStart = null;
let lastScannedId = null; 
let lastScanTime = 0;
let sessionId = getCurrentDate(); // Đã sửa: Lấy chuẩn ngày giờ địa phương

// Bỏ URL Web App của bạn vào đây để dễ quản lý
const GOOGLE_APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzLIKZwfd8b79UVBtP0c7ILIW-JiBvUk3KOYqlAYK5KX75CbmrizVKg2chlHTl_Fr5Z/exec";

// ---------- Khởi tạo sau khi DOM sẵn sàng ----------
document.addEventListener('DOMContentLoaded', async () => {
  await loadStudentData();
  loadLocal();
  renderList();
  updateStats();
  
  document.getElementById('btn-toggle-scan').addEventListener('click', toggleScan);
  document.getElementById('btn-add-manual').addEventListener('click', addManual);
  document.getElementById('btn-clear-all').addEventListener('click', clearAll);
  document.getElementById('btn-export').addEventListener('click', exportCSV);
  
  document.getElementById('manual-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addManual();
  });

  setInterval(updateSessionTimer, 1000);
  setInterval(syncFromSheet, 10000);
});

// ---------- Tự động đọc file CSV ----------
async function loadStudentData() {
  try {
    const response = await fetch('thanhVienCeer.csv');
    if (!response.ok) throw new Error('Không tìm thấy file');
    
    const text = await response.text();
    const lines = text.split('\n');
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const parts = line.split(',');
      if (parts.length >= 3) {
        const name = parts[1].trim(); 
        const id = parts[2].trim();   
        if (id) studentDB[id] = name;
      }
    }
    showToast(`✅ Đã tải dữ liệu ${Object.keys(studentDB).length} sinh viên từ file CSV!`);
  } catch (err) {
    showToast('❌ Lỗi đọc file CSV. Vui lòng chạy qua Live Server (Localhost).', true);
    console.error(err);
  }
}

// ---------- Đồng hồ phiên ----------
function updateSessionTimer() {
  if (!sessionStart) return;
  const diff = Math.floor((Date.now() - sessionStart) / 1000);
  const m = String(Math.floor(diff / 60)).padStart(2, '0');
  const s = String(diff % 60).padStart(2, '0');
  document.getElementById('session-time').textContent = m + ':' + s;
}

// ---------- Tiện ích ----------
function currentTime() {
  return new Date().toLocaleTimeString('vi-VN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

function showToast(msg, isError = false) {
  const toast = document.getElementById('result-toast');
  toast.textContent = msg;
  toast.className = 'result-toast' + (isError ? ' error' : '');
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

function playBeep() {
  try {
    const ctx  = new AudioContext();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch (e) {}
}

// ---------- Quản lý danh sách ----------
function addStudent(id, name = '') {
  if (students.find(s => s.id === id)) return false; 
  
  students.unshift({ id, name, time: currentTime() });
  saveLocal();
  sendToSheet(id, name);
  renderList();
  updateStats();
  if (!sessionStart) sessionStart = Date.now();
  return true;
}

function deleteStudent(index) {
  students.splice(index, 1);
  saveLocal();
  renderList();
  updateStats();
}

function clearAll() {
  if (students.length === 0) return;
  if (!confirm('Xóa tất cả ' + students.length + ' sinh viên?')) return;

  students = [];
  localStorage.removeItem("students");
  sessionStart = null;
  sessionId = getCurrentDate(); // Đã sửa
  document.getElementById('session-time').textContent = '--:--';

  renderList();
  updateStats();
}

function updateStats() {
  document.getElementById('count-display').textContent = students.length + ' sinh viên';
}

function renderList() {
  const listEl = document.getElementById('student-list');
  document.getElementById('list-count').textContent = students.length;
  document.getElementById('btn-export').disabled = students.length === 0; 

  if (students.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-text">Chưa có dữ liệu.<br>Quét hoặc nhập mã sinh viên.</div>
      </div>`;
    return;
  }

  listEl.innerHTML = students.map((s, i) => `
    <div class="student-item">
      <div class="student-index">#${students.length - i}</div>
      <div class="student-info">
        <div class="student-id">${s.id}</div>
        <div class="student-name">
          ${s.name || '<em style="opacity:0.5; color: red;">Không có trong danh sách</em>'}
        </div>
      </div>
      <div class="student-time">${s.time}</div>
      <button class="btn-delete" onclick="deleteStudent(${i})">✕</button>
    </div>
  `).join('');
}

// ---------- Nhập thủ công ----------
function addManual() {
  const input = document.getElementById('manual-input');
  const id = input.value.trim();
  if (!id) return;

  const name = studentDB[id] || "";
  const ok = addStudent(id, name);
  if (ok) {
    showToast('✅ Đã lưu: ' + id + (name ? ' — ' + name : ''));
  } else {
    showToast('⚠️ MSSV ' + id + ' đã điểm danh!', true);
  }
  input.value = '';
}

// ---------- Camera & Quét ----------
async function toggleScan() {
  if (!isScanning) await startScan();
  else await stopScan();
}

async function startScan() {
  const btn = document.getElementById('btn-toggle-scan');
  btn.innerHTML = '<span>⏹</span> Dừng quét';
  btn.classList.add('scanning');
  document.getElementById('scan-dot').classList.add('active');
  document.getElementById('scan-status-text').textContent = 'Đang quét';
  document.getElementById('scan-line').style.display = 'block';
  isScanning = true;

  html5QrCode = new Html5Qrcode('reader');
  try {
    await html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 220, height: 120 } },
      onScanSuccess,
      () => {}
    );
  } catch (err) {
    showToast('❌ Không thể mở camera: ' + err, true);
    await stopScan();
  }
}

async function stopScan() {
  const btn = document.getElementById('btn-toggle-scan');
  btn.innerHTML = '<span>📷</span> Bắt đầu quét';
  btn.classList.remove('scanning');
  document.getElementById('scan-dot').classList.remove('active');
  document.getElementById('scan-status-text').textContent = 'Tắt';
  document.getElementById('scan-line').style.display = 'none';
  isScanning = false;

  if (html5QrCode) {
    try { await html5QrCode.stop(); } catch (e) {}
    html5QrCode = null;
  }
}

// ---------- Xử lý Quét Thành công ----------
function onScanSuccess(decodedText) {
  const id = decodedText.trim();
  const now = Date.now();

  if (id === lastScannedId && (now - lastScanTime) < 2000) return;
  lastScannedId = id;
  lastScanTime = now;

  if (students.find(s => s.id === id)) return; 

  const name = studentDB[id] || "";
  const ok = addStudent(id, name);
  if (ok) {
    playBeep();
    showToast('✅ Đã điểm danh: ' + id + (name ? ' — ' + name : ''));
  }
}

// ---------- Xuất CSV ----------
function exportCSV() {
  if (students.length === 0) {
    showToast('⚠️ Chưa có dữ liệu để xuất!', true);
    return;
  }

  const BOM    = '\uFEFF';
  const header = 'STT,MSSV,Họ và tên,Thời gian quét\n';
  const rows   = students.map((s, i) =>
    `${i + 1},"${s.id}","${s.name || ''}","${s.time}"`
  ).join('\n');

  const csvContent = BOM + header + rows;
  const fileName   = `DiemDanh_${getCurrentDate()}.csv`; // Đã sửa

  try {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('✅ Đã tải thành công file Excel!');
  } catch (err) {
    try {
      const encodedUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', fileName);
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('✅ Đã tải file bằng phương pháp dự phòng!');
    } catch (fallbackErr) {
      alert('❌ Trình duyệt chặn tải file. Vui lòng mở bằng Chrome hoặc Safari!');
    }
  }
}

/* =========================
   LOCAL STORAGE & ĐỒNG BỘ
========================= */
function saveLocal() {
  localStorage.setItem("students", JSON.stringify(students));
}

function loadLocal() {
  const savedDate = localStorage.getItem("scanDate");
  const today = new Date().toDateString();

  if (savedDate !== today) {
    localStorage.removeItem("students");
    localStorage.setItem("scanDate", today);
    students = [];
    return;
  }
  const data = localStorage.getItem("students");
  if (data) students = JSON.parse(data);
}

function sendToSheet(mssv, ten) {
  fetch(GOOGLE_APP_SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({
      session: sessionId,
      mssv: mssv,
      ten: ten
    })
  });
}

function syncFromSheet() {
  const old = document.getElementById("syncScript");
  if (old) old.remove();

  const script = document.createElement("script");
  script.id = "syncScript";
  script.src = GOOGLE_APP_SCRIPT_URL + "?session=" + sessionId + "&callback=handleSheetData";
  document.body.appendChild(script);
}

function handleSheetData(data) {
  // 1. Lọc và chuẩn hóa dữ liệu từ Sheet
  const sheetStudents = data
    .filter(r => r.session === sessionId)
    .map(r => ({
      id: String(r.mssv),
      name: r.ten,
      time: new Date(r.time).toLocaleTimeString('vi-VN')
    }))
    .reverse(); // Đảo ngược mảng để dữ liệu mới nhất lên đầu (giống trên máy)

  // 2. CHỐNG GHI ĐÈ DỮ LIỆU CŨ (Fix lỗi mất liền)
  // Nếu dữ liệu từ Sheet tải về ít hơn số người máy đang hiển thị
  // -> Sheet chưa lưu kịp -> Bỏ qua, giữ nguyên màn hình hiện tại
  if (sheetStudents.length < students.length) {
    return;
  }

  // 3. Kiểm tra xem có thật sự có dữ liệu mới không (so sánh theo mssv)
  // (Thay vì dùng JSON.stringify rất dễ lỗi định dạng thời gian)
  const currentIds = students.map(s => s.id).join(',');
  const sheetIds = sheetStudents.map(s => s.id).join(',');

  if (currentIds === sheetIds) return;

  // 4. Cập nhật khi có dữ liệu mới (ví dụ: máy tính khác quét)
  students = sheetStudents;
  saveLocal();
  renderList();
  updateStats();
}
// HẾT FILE app.js