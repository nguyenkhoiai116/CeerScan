/* =============================================
   app.js — Quét Mã Sinh Viên (Đọc trực tiếp từ CSV)
   ============================================= */

// ---------- State (dữ liệu ứng dụng) ----------
let studentDB   = {};   // Sẽ được tự động điền từ file CSV
let students    = [];   
let html5QrCode = null; 
let isScanning  = false;
let sessionStart = null;
let lastScannedId = null; // Tránh quét lặp 1 mã quá nhanh
let lastScanTime = 0;

// ---------- Khởi tạo sau khi DOM sẵn sàng ----------
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Tải dữ liệu từ file CSV trước
  await loadStudentData();
  loadLocal();
  renderList();
  updateStats();
  // 2. Gắn sự kiện cho các nút
  document.getElementById('btn-toggle-scan').addEventListener('click', toggleScan);
  document.getElementById('btn-add-manual').addEventListener('click', addManual);
  document.getElementById('btn-clear-all').addEventListener('click', clearAll);
  document.getElementById('btn-export').addEventListener('click', exportCSV);
  
  // Nhấn Enter trong ô nhập thủ công
  document.getElementById('manual-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addManual();
  });

  setInterval(updateSessionTimer, 1000);
});

// ---------- Tự động đọc file CSV ----------
async function loadStudentData() {
  try {
    // Đọc file thanhVienCeer.csv (phải cùng nằm trong thư mục)
    const response = await fetch('thanhVienCeer.csv');
    if (!response.ok) throw new Error('Không tìm thấy file');
    
    const text = await response.text();
    const lines = text.split('\n');
    
    // Bỏ qua dòng tiêu đề (index 0), bắt đầu từ index 1
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const parts = line.split(',');
      // Format file của bạn: STT,Họ và Tên,MSSV,Đang là
      if (parts.length >= 3) {
        const name = parts[1].trim(); // Cột 2: Họ và Tên
        const id = parts[2].trim();   // Cột 3: MSSV
        if (id) {
          studentDB[id] = name;
        }
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
  if (students.find(s => s.id === id)) {
    return false; // Đã điểm danh rồi thì bỏ qua
  }
  students.unshift({ id, name, time: currentTime() });

  saveLocal();

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
  if (!isScanning) {
    await startScan();
  } else {
    await stopScan();
  }
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

  // Chống spam: Tránh quét lại cùng 1 mã trong vòng 2 giây
  if (id === lastScannedId && (now - lastScanTime) < 2000) {
    return;
  }
  lastScannedId = id;
  lastScanTime = now;

  if (students.find(s => s.id === id)) {
      return; 
  }

  // Tra cứu Tên từ Database vừa lấy từ CSV
  const name = studentDB[id] || "";

  const ok = addStudent(id, name);
  if (ok) {
    playBeep();
    showToast('✅ Đã điểm danh: ' + id + (name ? ' — ' + name : ''));
  }
}

// ---------- Xuất CSV (Siêu tương thích) ----------
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
  const dateStr    = new Date().toISOString().slice(0, 10);
  const fileName   = `DiemDanh_${dateStr}.csv`;

  try {
    // Cách 1: Thử dùng Blob (Cách hiện đại)
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
    console.warn('Tải bằng Blob thất bại, chuyển sang Data URI...', err);
    
    // Cách 2: Dùng Data URI (Cách dự phòng cho trình duyệt khó tính/điện thoại)
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
      alert('❌ Trình duyệt của bạn chặn tải file. Vui lòng mở bằng Chrome hoặc Safari bản mới nhất!');
    }
  }
}

/* =========================
   LOCAL STORAGE
========================= */

function saveLocal() {
  localStorage.setItem("students", JSON.stringify(students));
}

function loadLocal() {

  const savedDate = localStorage.getItem("scanDate");
  const today = new Date().toDateString();

  // Nếu sang ngày mới → reset
  if (savedDate !== today) {
    localStorage.removeItem("students");
    localStorage.setItem("scanDate", today);
    students = [];
    return;
  }

  const data = localStorage.getItem("students");

  if (data) {
    students = JSON.parse(data);
  }

}