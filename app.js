/* =============================================
   app.js — Quét Mã Sinh Viên
   ============================================= */

// ---------- State (dữ liệu ứng dụng) ----------
let students    = [];   // Mảng lưu danh sách sinh viên đã quét
let html5QrCode = null; // Instance của thư viện quét
let isScanning  = false;// Trạng thái camera
let pendingId   = null; // MSSV đang chờ nhập tên (modal đang mở)
let sessionStart = null;// Thời điểm bắt đầu phiên làm việc

// ---------- Khởi tạo sau khi DOM sẵn sàng ----------
document.addEventListener('DOMContentLoaded', () => {
  // Gắn sự kiện cho các nút
  document.getElementById('btn-toggle-scan').addEventListener('click', toggleScan);
  document.getElementById('btn-add-manual').addEventListener('click', addManual);
  document.getElementById('btn-clear-all').addEventListener('click', clearAll);
  document.getElementById('btn-export').addEventListener('click', exportCSV);
  document.getElementById('btn-modal-skip').addEventListener('click', () => saveFromModal(true));
  document.getElementById('btn-modal-save').addEventListener('click', () => saveFromModal(false));

  // Nhấn Enter trong ô nhập thủ công
  document.getElementById('manual-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addManual();
  });

  // Nhấn Enter trong modal
  document.getElementById('modal-name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveFromModal(false);
  });

  // Click ra ngoài modal để đóng
  document.getElementById('name-modal').addEventListener('click', function (e) {
    if (e.target === this) saveFromModal(true);
  });

  // Bộ đếm thời gian phiên làm việc
  setInterval(updateSessionTimer, 1000);
});

// ---------- Đồng hồ phiên ----------
function updateSessionTimer() {
  if (!sessionStart) return;
  const diff = Math.floor((Date.now() - sessionStart) / 1000);
  const m = String(Math.floor(diff / 60)).padStart(2, '0');
  const s = String(diff % 60).padStart(2, '0');
  document.getElementById('session-time').textContent = m + ':' + s;
}

// ---------- Tiện ích ----------

/** Trả về giờ hiện tại dạng HH:MM:SS */
function currentTime() {
  return new Date().toLocaleTimeString('vi-VN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

/** Hiển thị thông báo nhanh (toast) */
function showToast(msg, isError = false) {
  const toast = document.getElementById('result-toast');
  toast.textContent = msg;
  toast.className = 'result-toast' + (isError ? ' error' : '');
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

/** Phát âm thanh beep khi quét thành công */
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
  } catch (e) {
    // Bỏ qua nếu trình duyệt không hỗ trợ AudioContext
  }
}

// ---------- Quản lý danh sách ----------

/**
 * Thêm sinh viên vào danh sách.
 * @param {string} id   - Mã số sinh viên
 * @param {string} name - Họ tên (có thể rỗng)
 * @returns {boolean} true nếu thêm thành công, false nếu trùng
 */
function addStudent(id, name = '') {
  // Kiểm tra trùng MSSV
  if (students.find(s => s.id === id)) {
    showToast('⚠️ MSSV ' + id + ' đã tồn tại!', true);
    return false;
  }

  // Thêm vào đầu mảng (mới nhất hiển thị trên cùng)
  students.unshift({ id, name, time: currentTime() });

  renderList();
  updateStats();

  // Bắt đầu đếm giờ phiên nếu chưa có
  if (!sessionStart) sessionStart = Date.now();

  return true;
}

/** Xóa một sinh viên theo index */
function deleteStudent(index) {
  students.splice(index, 1);
  renderList();
  updateStats();
}

/** Xóa toàn bộ danh sách */
function clearAll() {
  if (students.length === 0) return;
  if (!confirm('Xóa tất cả ' + students.length + ' sinh viên?')) return;

  students = [];
  sessionStart = null;
  document.getElementById('session-time').textContent = '--:--';
  renderList();
  updateStats();
}

/** Cập nhật số đếm trên stats bar */
function updateStats() {
  document.getElementById('count-display').textContent = students.length + ' sinh viên';
}

/** Render lại toàn bộ danh sách ra HTML */
function renderList() {
  const listEl = document.getElementById('student-list');
  document.getElementById('list-count').textContent = students.length;
  document.getElementById('btn-export').disabled = students.length === 0;

  // Hiển thị empty state nếu chưa có dữ liệu
  if (students.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-text">Chưa có dữ liệu.<br>Quét hoặc nhập mã sinh viên.</div>
      </div>`;
    return;
  }

  // Render từng item sinh viên
  listEl.innerHTML = students.map((s, i) => `
    <div class="student-item">
      <div class="student-index">#${students.length - i}</div>
      <div class="student-info">
        <div class="student-id">${s.id}</div>
        <div class="student-name">
          ${s.name || '<em style="opacity:0.5">Chưa có tên</em>'}
        </div>
      </div>
      <div class="student-time">${s.time}</div>
      <button class="btn-delete" onclick="deleteStudent(${i})">✕</button>
    </div>
  `).join('');
}

// ---------- Nhập thủ công ----------

/** Lấy giá trị từ ô input và mở modal nhập tên */
function addManual() {
  const input = document.getElementById('manual-input');
  const id = input.value.trim();
  if (!id) return;

  pendingId = id;
  input.value = '';
  openModal(id);
}

// ---------- Modal nhập tên ----------

/** Mở modal, hiển thị MSSV vừa quét */
function openModal(id) {
  document.getElementById('modal-id-display').textContent = id;
  document.getElementById('modal-name-input').value = '';
  document.getElementById('name-modal').classList.add('active');

  // Auto focus vào ô nhập tên
  setTimeout(() => {
    document.getElementById('modal-name-input').focus();
  }, 300);
}

/**
 * Lưu dữ liệu từ modal.
 * @param {boolean} skip - true = bỏ qua tên, lưu MSSV không có tên
 */
function saveFromModal(skip = false) {
  const name = skip ? '' : document.getElementById('modal-name-input').value.trim();
  document.getElementById('name-modal').classList.remove('active');

  if (pendingId) {
    const ok = addStudent(pendingId, name);
    if (ok) {
      showToast('✅ Đã lưu: ' + pendingId + (name ? ' — ' + name : ''));
    }
    pendingId = null;
  }
}

// ---------- Camera & Quét ----------

/** Bật hoặc tắt camera */
async function toggleScan() {
  if (!isScanning) {
    await startScan();
  } else {
    await stopScan();
  }
}

/** Bắt đầu quét — mở camera */
async function startScan() {
  // Cập nhật UI sang trạng thái "đang quét"
  const btn = document.getElementById('btn-toggle-scan');
  btn.innerHTML = '<span>⏹</span> Dừng quét';
  btn.classList.add('scanning');
  document.getElementById('scan-dot').classList.add('active');
  document.getElementById('scan-status-text').textContent = 'Đang quét';
  document.getElementById('scan-line').style.display = 'block';
  isScanning = true;

  // Khởi tạo thư viện html5-qrcode với phần tử có id="reader"
  html5QrCode = new Html5Qrcode('reader');

  try {
    await html5QrCode.start(
      { facingMode: 'environment' },          // Ưu tiên camera sau
      { fps: 10, qrbox: { width: 220, height: 120 } }, // Khung quét
      onScanSuccess,                           // Callback khi quét được
      () => {}                                 // Callback lỗi (bỏ qua)
    );
  } catch (err) {
    showToast('❌ Không thể mở camera: ' + err, true);
    await stopScan();
  }
}

/** Dừng quét — tắt camera */
async function stopScan() {
  // Cập nhật UI về trạng thái "tắt"
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

/**
 * Callback được gọi khi thư viện quét được mã thành công.
 * @param {string} decodedText - Nội dung mã vừa quét
 */
function onScanSuccess(decodedText) {
  // Không xử lý nếu modal đang mở
  if (pendingId) return;

  playBeep();
  stopScan();

  pendingId = decodedText.trim();
  openModal(pendingId);
}

// ---------- Xuất CSV ----------

/** Tạo và tải xuống file CSV từ danh sách sinh viên */
function exportCSV() {
  if (students.length === 0) return;

  // BOM giúp Excel đọc đúng tiếng Việt
  const BOM    = '\uFEFF';
  const header = 'STT,MSSV,Họ và tên,Thời gian quét\n';
  const rows   = students.map((s, i) =>
    `${students.length - i},"${s.id}","${s.name || ''}","${s.time}"`
  ).join('\n');

  const csv  = BOM + header + rows;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);

  // Tạo link ảo và click để tải xuống
  const link      = document.createElement('a');
  const dateStr   = new Date().toISOString().slice(0, 10);
  link.href       = url;
  link.download   = `sinh_vien_${dateStr}.csv`;
  link.click();

  URL.revokeObjectURL(url);
  showToast('✅ Đã xuất ' + students.length + ' sinh viên ra file CSV!');
}
