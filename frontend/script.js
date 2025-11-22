/**
 * AQUARIUM RESEARCH DASHBOARD
 * Complete Logic: Real-time, Control, Calibration, Zoom, & Watchdog
 */

// =========================================================================
// 1. CONFIG & GLOBAL STATE
// =========================================================================
const CONFIG = {
  API_BASE: window.location.origin, // Otomatis deteksi host (localhost:3000)
  MAX_DATA_POINTS: 50,              // Jumlah data di grafik
  RECONNECT_DELAY: 2000,
  TIMEOUT: 20000,
  WATCHDOG_THRESHOLD: 30000,         // 30 Detik tanpa data = Sensor Mati
  COLORS: {
    temp: 'rgb(59, 130, 246)',      // Blue
    turb: 'rgb(245, 158, 11)',      // Amber
    setpoint: 'rgba(255, 0, 0, 1)'  // Red Dotted
  }
};

// State Variables
let state = {
  chartTemp: null,
  chartTurb: null,
  socket: null,
  dataBuffer: [],
  isConnected: false,
  lastDataTime: Date.now(), // Untuk Watchdog
  watchdogInterval: null,
  setpoints: {
    temp: 28.0,
    turb: 10.0
  }
};

// =========================================================================
// 2. UTILITY FUNCTIONS
// =========================================================================

function formatNumber(num, decimals = 2) {
  if (num === null || num === undefined || isNaN(num)) return '--';
  return Number(num).toFixed(decimals);
}

function showNotification(message, type = 'info') {
  const colors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    info: 'bg-blue-500',
    warning: 'bg-amber-500'
  };
  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };

  const notif = document.createElement('div');
  notif.className = `notification ${colors[type]} text-white px-6 py-4 rounded-lg shadow-xl flex items-center space-x-3 max-w-md transition-all duration-300 fixed top-5 right-5 z-[9999] translate-x-full`;
  notif.innerHTML = `
    <span class="text-xl font-bold">${icons[type]}</span>
    <span class="font-medium">${message}</span>
  `;

  document.body.appendChild(notif);

  // Animasi Masuk
  requestAnimationFrame(() => {
    notif.style.transform = 'translateX(0)';
  });

  // Hapus Otomatis
  setTimeout(() => {
    notif.style.transform = 'translateX(120%)'; // Slide out
    setTimeout(() => notif.remove(), 300);
  }, 3000);
}

function updateConnectionStatus(connected) {
  state.isConnected = connected;
  const statusEl = document.getElementById('connection-status');
  
  const config = connected 
    ? { bg: 'bg-green-100', dot: 'bg-green-500', text: 'text-green-700', label: 'Connected' }
    : { bg: 'bg-red-100', dot: 'bg-red-500', text: 'text-red-700', label: 'Disconnected' };

  if (statusEl) {
    statusEl.className = `flex items-center space-x-2 px-3 py-1.5 rounded-full ${config.bg} w-full sm:w-auto justify-center transition-colors duration-300`;
    statusEl.innerHTML = `
      <span class="w-2 h-2 ${config.dot} rounded-full ${connected ? '' : 'animate-pulse'}"></span>
      <span class="text-xs font-medium ${config.text}">${config.label}</span>
    `;
  }
}

function formatDateForInput(date) {
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// =========================================================================
// 3. WATCHDOG TIMER (DETEKSI SENSOR MATI)
// =========================================================================
function startWatchdog() {
  if (state.watchdogInterval) clearInterval(state.watchdogInterval);

  state.watchdogInterval = setInterval(() => {
    const now = Date.now();
    const timeDiff = now - state.lastDataTime;
    const alertEl = document.getElementById('sensor-watchdog-alert');
    
    // Jika tidak ada data > 5 detik
    if (timeDiff > CONFIG.WATCHDOG_THRESHOLD) {
      if (alertEl && alertEl.classList.contains('hidden')) {
        // Tampilkan Banner
        alertEl.classList.remove('hidden');
        console.warn(`[Watchdog] ⚠️ SENSOR DEAD! No data for ${Math.floor(timeDiff/1000)}s`);
        
        // Ubah tampilan nilai jadi "LOST" merah
        const ids = ['current-temp', 'current-turb', 'current-pwm-heater', 'current-pwm-pump', 'live-adc-value'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if(el) {
                el.dataset.prevVal = el.textContent; // Simpan nilai lama
                el.textContent = "LOST";
                el.classList.add('text-red-500', 'animate-pulse');
                // Hapus warna asli sementara
                el.classList.remove('text-blue-600', 'text-amber-600', 'text-green-600', 'text-red-600', 'text-purple-600'); 
            }
        });
      }
    }
  }, 1000); // Cek setiap 1 detik
}

// =========================================================================
// 4. SOCKET.IO CONNECTION
// =========================================================================
function connectSocket() {
  console.log('[Socket] Connecting...');
  
  state.socket = io(CONFIG.API_BASE, {
    transports: ['websocket', 'polling'],
    timeout: CONFIG.TIMEOUT,
    reconnection: true
  });

  state.socket.on('connect', () => {
    console.log('[Socket] ✅ Connected');
    updateConnectionStatus(true);
    showNotification('Terhubung ke server', 'success');
  });

  state.socket.on('disconnect', () => {
    updateConnectionStatus(false);
  });

  state.socket.on('newData', (data) => {
    processNewData(data);
  });

  state.socket.on('debugLog', (packet) => {
    if (packet.type === 'CONTROL') {
        // [TAMBAHAN] Update variabel global jika ada perubahan baru
        lastKnownControlSettings = packet.data;
    }
    logToTerminal(packet.data, packet.type);
  });
}

// =========================================================================
// 5. DATA PROCESSING (UI UPDATE)
// =========================================================================
function processNewData(data) {
  if (!data) return;

  logToTerminal(data, 'DATA');

  // --- A. RESET WATCHDOG ---
  state.lastDataTime = Date.now();
  
  // Sembunyikan Alert Banner jika muncul
  const alertEl = document.getElementById('sensor-watchdog-alert');
  if (alertEl && !alertEl.classList.contains('hidden')) {
    alertEl.classList.add('hidden');
    showNotification('Koneksi Sensor Pulih', 'success');
    
    // Reset style elemen (Hapus merah/LOST)
    const ids = [
        {id: 'current-temp', color: 'text-blue-600'},
        {id: 'current-turb', color: 'text-amber-600'},
        {id: 'current-pwm-heater', color: 'text-red-600'},
        {id: 'current-pwm-pump', color: 'text-purple-600'},
        {id: 'live-adc-value', color: 'text-blue-600'}
    ];
    ids.forEach(item => {
        const el = document.getElementById(item.id);
        if(el) {
            el.classList.remove('text-red-500', 'animate-pulse');
            el.classList.add(item.color);
        }
    });
  }

  // --- B. UPDATE KARTU UTAMA ---
  const els = {
    temp: document.getElementById('current-temp'),
    turb: document.getElementById('current-turb'),
    mode: document.getElementById('current-mode'),
    heater: document.getElementById('current-pwm-heater'),
    pump: document.getElementById('current-pwm-pump'),
    adc: document.getElementById('live-adc-value')
  };

  if (els.temp) els.temp.textContent = `${formatNumber(data.suhu)}°C`;
  if (els.turb) els.turb.textContent = `${formatNumber(data.turbidity_persen)}%`;
  if (els.mode) els.mode.textContent = data.kontrol_aktif || '--';
  if (els.heater) els.heater.textContent = `${formatNumber(data.pwm_heater, 1)}%`;
  if (els.pump) els.pump.textContent = `${formatNumber(data.pwm_pompa, 1)}%`;
  if (els.adc && data.turbidity_adc !== undefined) els.adc.textContent = data.turbidity_adc;

  // --- C. BUFFER DATA GRAFIK ---
  const timeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  
  state.dataBuffer.push({
    time: timeStr,
    temp: data.suhu || 0,
    turb: data.turbidity_persen || 0
  });

  if (state.dataBuffer.length > CONFIG.MAX_DATA_POINTS) {
    state.dataBuffer.shift();
  }

  updateCharts();
}

// =========================================================================
// 6. CHART MANAGEMENT (ZOOM & PAN ENABLED)
// =========================================================================
function initCharts() {
  // Opsi Umum Grafik
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', labels: { boxWidth: 12, padding: 10 } },
      tooltip: { backgroundColor: 'rgba(0,0,0,0.8)', padding: 10, cornerRadius: 8 },
      // --- KONFIGURASI ZOOM ---
      zoom: {
        pan: {
          enabled: true,
          mode: 'x', // Hanya geser horizontal (Waktu)
        },
        zoom: {
          wheel: { enabled: true }, // Scroll mouse
          pinch: { enabled: true }, // Cubit layar HP
          mode: 'x',
        }
      }
    },
    scales: {
      x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
      y: { grid: { color: '#f1f5f9' } }
    },
    animation: false // Matikan animasi agar performa tinggi
  };

  // 1. CHART SUHU
  const ctxTemp = document.getElementById('chartTemp');
  if (ctxTemp) {
    state.chartTemp = new Chart(ctxTemp.getContext('2d'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Suhu (°C)',
            data: [],
            borderColor: CONFIG.COLORS.temp,
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 0 // Titik hilang agar rapi, muncul saat hover
          },
          {
            label: 'Setpoint',
            data: [],
            borderColor: CONFIG.COLORS.setpoint,
            borderDash: [5, 5],
            borderWidth: 1,
            pointRadius: 0
          }
        ]
      },
      options: {
        ...commonOptions,
        scales: { ...commonOptions.scales, y: { min: 20, max: 35 } } // Range Suhu Akuarium
      }
    });
  }

  // 2. CHART KEKERUHAN
  const ctxTurb = document.getElementById('chartTurb');
  if (ctxTurb) {
    state.chartTurb = new Chart(ctxTurb.getContext('2d'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Kekeruhan (%)',
            data: [],
            borderColor: CONFIG.COLORS.turb,
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 0
          },
          {
            label: 'Setpoint',
            data: [],
            borderColor: CONFIG.COLORS.setpoint,
            borderDash: [5, 5],
            borderWidth: 1,
            pointRadius: 0
          }
        ]
      },
      options: {
        ...commonOptions,
        scales: { ...commonOptions.scales, y: { min: 0, max: 100 } }
      }
    });
  }
}

function updateCharts() {
  if (!state.chartTemp || !state.chartTurb || state.dataBuffer.length === 0) return;

  const labels = state.dataBuffer.map(d => d.time);
  const tempData = state.dataBuffer.map(d => d.temp);
  const turbData = state.dataBuffer.map(d => d.turb);

  // Update Chart Suhu
  state.chartTemp.data.labels = labels;
  state.chartTemp.data.datasets[0].data = tempData;
  state.chartTemp.data.datasets[1].data = Array(tempData.length).fill(state.setpoints.temp);
  state.chartTemp.update('none'); // 'none' = update tanpa animasi berat

  // Update Chart Turbidity
  state.chartTurb.data.labels = labels;
  state.chartTurb.data.datasets[0].data = turbData;
  state.chartTurb.data.datasets[1].data = Array(turbData.length).fill(state.setpoints.turb);
  state.chartTurb.update('none');
}

// Fungsi Reset Zoom (Dipanggil oleh tombol HTML)
function resetZoomChart(type) {
  if (type === 'temp' && state.chartTemp) {
    state.chartTemp.resetZoom();
  } else if (type === 'turb' && state.chartTurb) {
    state.chartTurb.resetZoom();
  }
}

// =========================================================================
// 7. CONTROL LOGIC
// =========================================================================
async function loadControlSettings() {
  try {
    const res = await fetch(`${CONFIG.API_BASE}/api/control`);
    if (!res.ok) throw new Error('API Error');
    
    const data = await res.json();

    lastKnownControlSettings = data;
    setTimeout(() => {
        logToTerminal(data, 'CONTROL');
    }, 1500);

    console.group("🔌 [LOAD] Pengaturan Kontrol dari Server");
    console.table(data); // Menampilkan data rapi dalam bentuk tabel
    console.groupEnd();

    // Isi Form
    const els = {
      mode: document.getElementById('control-mode'),
      tempSp: document.getElementById('control-temp-sp'),
      turbSp: document.getElementById('control-turb-sp'),
      kpTemp: document.getElementById('control-kp-temp'),
      kiTemp: document.getElementById('control-ki-temp'),
      kdTemp: document.getElementById('control-kd-temp'),
      kpTurb: document.getElementById('control-kp-turb'),
      kiTurb: document.getElementById('control-ki-turb'),
      kdTurb: document.getElementById('control-kd-turb'),
      adcJernih: document.getElementById('calib-adc-jernih'),
      adcKeruh: document.getElementById('calib-adc-keruh')
    };

    if (els.mode) els.mode.value = data.kontrol_aktif || 'Fuzzy';
    if (els.tempSp) els.tempSp.value = data.suhu_setpoint || 28.0;
    if (els.turbSp) els.turbSp.value = data.keruh_setpoint || 10.0;

    // Trigger perubahan mode (untuk hide/show PID params)
    if (els.mode) els.mode.dispatchEvent(new Event('change'));

    // Isi PID params jika ada
    if (els.kpTemp) els.kpTemp.value = data.kp_suhu || 0;
    if (els.kiTemp) els.kiTemp.value = data.ki_suhu || 0;
    if (els.kdTemp) els.kdTemp.value = data.kd_suhu || 0;
    // ... (lainnya sesuai kebutuhan)

    // Isi Kalibrasi
    if (data.adc_jernih && els.adcJernih) els.adcJernih.value = data.adc_jernih;
    if (data.adc_keruh && els.adcKeruh) els.adcKeruh.value = data.adc_keruh;

    // Update Setpoint Lokal
    state.setpoints.temp = parseFloat(data.suhu_setpoint) || 28.0;
    state.setpoints.turb = parseFloat(data.keruh_setpoint) || 10.0;

  } catch (error) {
    console.error('[API] Load error:', error);
    showNotification('Gagal memuat pengaturan awal', 'error');
  }
}

async function updateControl() {
  const mode = document.getElementById('control-mode').value;
  const tempSp = parseFloat(document.getElementById('control-temp-sp').value);
  const turbSp = parseFloat(document.getElementById('control-turb-sp').value);

  if (isNaN(tempSp) || isNaN(turbSp)) {
    showNotification('Setpoint harus angka!', 'warning');
    return;
  }

  const payload = {
    kontrol_aktif: mode,
    suhu_setpoint: tempSp,
    keruh_setpoint: turbSp
  };

  // Jika PID, masukkan parameter PID
  if (mode === 'PID') {
    payload.kp_suhu = parseFloat(document.getElementById('control-kp-temp').value) || 0;
    payload.ki_suhu = parseFloat(document.getElementById('control-ki-temp').value) || 0;
    payload.kd_suhu = parseFloat(document.getElementById('control-kd-temp').value) || 0;
    payload.kp_keruh = parseFloat(document.getElementById('control-kp-turb').value) || 0;
    payload.ki_keruh = parseFloat(document.getElementById('control-ki-turb').value) || 0;
    payload.kd_keruh = parseFloat(document.getElementById('control-kd-turb').value) || 0;
  }

  console.log("🚀 [SEND] Mengirim Update Kontrol:", payload);

  try {
    const res = await fetch(`${CONFIG.API_BASE}/api/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('Gagal update');
    
    state.setpoints.temp = tempSp;
    state.setpoints.turb = turbSp;
    showNotification('Pengaturan disimpan!', 'success');

  } catch (error) {
    showNotification('Gagal menyimpan pengaturan', 'error');
  }
}

// =========================================================================
// 8. CALIBRATION LOGIC
// =========================================================================
async function uploadCalibration() {
  const adcJernih = parseInt(document.getElementById('calib-adc-jernih').value);
  const adcKeruh = parseInt(document.getElementById('calib-adc-keruh').value);
  const statusEl = document.getElementById('calib-status');

  if (isNaN(adcJernih) || isNaN(adcKeruh)) {
    showNotification('Nilai ADC harus angka!', 'warning');
    return;
  }
  if (adcJernih === adcKeruh) {
    showNotification('Nilai tidak boleh sama!', 'warning');
    return;
  }

  statusEl.textContent = 'Uploading...';
  
  try {
    const res = await fetch(`${CONFIG.API_BASE}/api/calibration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adc_jernih: adcJernih, adc_keruh: adcKeruh })
    });

    if (!res.ok) throw new Error('Gagal upload');

    statusEl.innerHTML = '<span class="text-green-600 font-semibold">Tersimpan ✓</span>';
    document.getElementById('calib-last-update').textContent = `Update: ${new Date().toLocaleTimeString()}`;
    showNotification('Kalibrasi Berhasil!', 'success');

    setTimeout(() => {
      statusEl.innerHTML = 'Menunggu input...';
    }, 3000);

  } catch (error) {
    statusEl.innerHTML = '<span class="text-red-600 font-semibold">Gagal ✗</span>';
    showNotification('Gagal upload kalibrasi', 'error');
  }
}

function resetCalibration() {
  document.getElementById('calib-adc-jernih').value = 9475;
  document.getElementById('calib-adc-keruh').value = 3550;
}

// =========================================================================
// 9. EXPORT LOGIC
// =========================================================================
function openExportModal() {
  const modal = document.getElementById('export-modal');
  if (modal) {
    const end = new Date();
    const start = new Date(end.getTime() - (60 * 60 * 1000)); // 1 jam lalu
    
    document.getElementById('export-start-time').value = formatDateForInput(start);
    document.getElementById('export-end-time').value = formatDateForInput(end);
    
    modal.classList.remove('hidden');
    // Animasi masuk (opsional)
    setTimeout(() => modal.querySelector('div').classList.remove('scale-95', 'opacity-0'), 10);
  }
}

function closeExportModal() {
  const modal = document.getElementById('export-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

function downloadRangedCSV() {
  const startVal = document.getElementById('export-start-time').value;
  const endVal = document.getElementById('export-end-time').value;

  if (!startVal || !endVal) {
    showNotification('Isi waktu mulai & selesai', 'warning');
    return;
  }

  const startISO = new Date(startVal).toISOString();
  const endISO = new Date(endVal).toISOString();

  if (new Date(startISO) >= new Date(endISO)) {
    showNotification('Waktu mulai harus < selesai', 'warning');
    return;
  }

  const url = `${CONFIG.API_BASE}/api/export/csv/range?start=${startISO}&end=${endISO}`;
  window.open(url, '_blank');
  closeExportModal();
  showNotification('Mengunduh CSV...', 'info');
}

// =========================================================================
// 10. INITIALIZATION
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
  console.log('[App] Initializing...');

  initCharts();
  connectSocket();
  loadControlSettings();
  startWatchdog(); // Jalankan deteksi sensor mati

  // Listener Toggle PID/Fuzzy
  const modeSelect = document.getElementById('control-mode');
  const pidParams = document.getElementById('pid-params-control');
  if (modeSelect && pidParams) {
    modeSelect.addEventListener('change', (e) => {
      if (e.target.value === 'PID') {
        pidParams.classList.remove('hidden');
      } else {
        pidParams.classList.add('hidden');
      }
    });
  }

  // Init Icons
  if (window.lucide) window.lucide.createIcons();
});

// =========================================================================
// 11. DEBUG CONSOLE LOGIC (NEW FEATURE)
// =========================================================================
const debugState = {
  maxLogs: 50, // Batas log biar browser tidak berat
  isVisible: false
};

function toggleDebugConsole() {
  const wrapper = document.getElementById('debug-console-wrapper');
  debugState.isVisible = !debugState.isVisible;
  
  if (debugState.isVisible) {
    wrapper.classList.remove('hidden');
  } else {
    wrapper.classList.add('hidden');
  }
}

function clearDebugConsole() {
  const container = document.getElementById('debug-log-container');
  container.innerHTML = '<div class="opacity-50 italic">Log cleared. Waiting for data...</div>';
}

function logToTerminal(data, type = 'DATA') {
  // Hanya proses jika terminal dibuka (untuk performa)
  // Hapus "if (!debugState.isVisible) return;" jika ingin log tetap jalan di background
  
  const container = document.getElementById('debug-log-container');
  if (!container) return;

  const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
  const time = new Date().toLocaleTimeString('id-ID', { hour12: false });
  
  // Format JSON biar berwarna (Syntax Highlighting sederhana)
  let jsonString = JSON.stringify(data);
  
  // Mewarnai Key dan Value (Regex sederhana)
  jsonString = jsonString.replace(/"([^"]+)":/g, '<span class="log-key">"$1":</span>');
  jsonString = jsonString.replace(/:([0-9.]+)/g, ':<span class="log-num">$1</span>');
  jsonString = jsonString.replace(/:("[^"]+")/g, ':<span class="log-val">$1</span>');
  jsonString = jsonString.replace(/:(true|false)/g, ':<span class="log-bool">$1</span>');

  // Warna Label & Border
  let labelColor = '#4ade80'; 
  let borderColor = '#4ade80'; // Default Hijau

  if (type === 'CONTROL') {
      labelColor = '#c084fc'; borderColor = '#c084fc'; // Ungu
  } else if (type === 'CALIB') {
      labelColor = '#facc15'; borderColor = '#facc15'; // Kuning
  } else if (type === 'AUTO-FIX') {
      labelColor = '#f87171'; borderColor = '#f87171'; // Merah
  }
  const entry = document.createElement('div');
  // Inline Styles
  entry.style.borderLeft = `4px solid ${borderColor}`;
  entry.style.paddingLeft = '8px';
  entry.style.marginBottom = '4px';
  entry.style.fontFamily = 'monospace';
  entry.style.fontSize = '12px';
  entry.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';

  entry.innerHTML = `
    <span class="log-time">[${time}]</span> 
    <span class="label-${type}">[${type}]</span> 
    <span style="color: #d4d4d4;">${jsonString}</span>
  `;

  container.appendChild(entry);

  if (isNearBottom) {
      container.scrollTop = container.scrollHeight;
  }

  // Bersihkan log lama
  while (container.children.length > debugState.maxLogs) {
    container.removeChild(container.firstChild);
  }
}

// =======================================================
// [TAMBAHAN] GLOBAL VARIABLE UNTUK MENYIMPAN SETTINGAN TERAKHIR
// =======================================================
let lastKnownControlSettings = null;

// Timer untuk menampilkan ulang data Control setiap 5 detik
// Agar tidak "tenggelam" oleh data sensor
setInterval(() => {
    if (lastKnownControlSettings) {
        // Tampilkan lagi di terminal
        logToTerminal(lastKnownControlSettings, 'CONTROL');
    }
}, 5000); // <-- Ubah 5000 jadi 3000 jika ingin lebih cepat (3 detik)