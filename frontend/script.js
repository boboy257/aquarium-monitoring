/**
 * AQUARIUM RESEARCH DASHBOARD
 * ----------------------------------------------
 * Merged & Optimized Script
 */

// =========================================================================
// 1. CONFIG & GLOBAL STATE
// =========================================================================
const CONFIG = {
  API_BASE: window.location.origin,
  MAX_DATA_POINTS: 50, // Jumlah titik data di grafik sebelum digeser
  RECONNECT_DELAY: 2000,
  TIMEOUT: 20000,
  COLORS: {
    temp: 'rgb(59, 130, 246)', // Blue
    turb: 'rgb(245, 158, 11)', // Amber
    setpoint: 'rgba(255, 0, 0, 1)' // Red
  }
};

// State Variables
let state = {
  chartTemp: null,
  chartTurb: null,
  socket: null,
  dataBuffer: [],
  isConnected: false,
  setpoints: {
    temp: 28.0,
    turb: 10.0
  }
};

// =========================================================================
// 2. UTILITY FUNCTIONS
// =========================================================================

// Helper untuk format angka
function formatNumber(num, decimals = 2) {
  if (num === null || num === undefined || isNaN(num)) return '--';
  return Number(num).toFixed(decimals);
}

// Helper untuk notifikasi Toast
function showNotification(message, type = 'info') {
  const colors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    info: 'bg-blue-500',
    warning: 'bg-amber-500'
  };
  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠'
  };

  const notif = document.createElement('div');
  notif.className = `notification ${colors[type]} text-white px-6 py-4 rounded-lg shadow-xl flex items-center space-x-3 max-w-md transition-all duration-300`;
  notif.style.zIndex = '10000'; // Pastikan di atas elemen lain
  notif.innerHTML = `
    <span class="text-xl font-bold">${icons[type]}</span>
    <span class="font-medium">${message}</span>
  `;

  document.body.appendChild(notif);

  // Animasi masuk
  setTimeout(() => notif.style.transform = 'translateX(0)', 10);

  // Hapus otomatis
  setTimeout(() => {
    notif.style.opacity = '0';
    notif.style.transform = 'translateX(20px)';
    setTimeout(() => notif.remove(), 300);
  }, 3000);
}

// Helper untuk status koneksi UI
function updateConnectionStatus(connected) {
  state.isConnected = connected;
  const statusEl = document.getElementById('connection-status');
  
  const config = connected 
    ? { bg: 'bg-green-100', dot: 'bg-green-500', text: 'text-green-700', label: 'Connected' }
    : { bg: 'bg-red-100', dot: 'bg-red-500', text: 'text-red-700', label: 'Disconnected' };

  if (statusEl) {
    statusEl.className = `ml-4 flex items-center space-x-2 px-3 py-1.5 rounded-full ${config.bg} transition-colors duration-300`;
    statusEl.innerHTML = `
      <span class="w-2 h-2 ${config.dot} rounded-full ${connected ? '' : 'animate-pulse'}"></span>
      <span class="text-xs font-medium ${config.text}">${config.label}</span>
    `;
  }
}

// Helper format tanggal untuk input datetime-local
function formatDateForInput(date) {
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// =========================================================================
// 3. SOCKET.IO CONNECTION
// =========================================================================
function connectSocket() {
  console.log('[Socket] Connecting...');
  
  state.socket = io(CONFIG.API_BASE, {
    transports: ['websocket', 'polling'],
    timeout: CONFIG.TIMEOUT,
    reconnection: true,
    reconnectionDelay: CONFIG.RECONNECT_DELAY
  });

  state.socket.on('connect', () => {
    console.log('[Socket] ✅ Connected');
    updateConnectionStatus(true);
    showNotification('Terhubung ke server', 'success');
  });

  state.socket.on('disconnect', (reason) => {
    console.warn('[Socket] ❌ Disconnected:', reason);
    updateConnectionStatus(false);
  });

  state.socket.on('connect_error', (error) => {
    console.error('[Socket] Error:', error.message);
    updateConnectionStatus(false);
  });

  state.socket.on('newData', (data) => {
    processNewData(data);
  });
}

// =========================================================================
// 4. DATA PROCESSING & DASHBOARD UI
// =========================================================================
function processNewData(data) {
  if (!data) return;

  // 1. Update Kartu Info Utama
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

  // 2. Update Live ADC (dengan efek visual)
  if (els.adc && data.turbidity_adc !== undefined) {
    els.adc.textContent = data.turbidity_adc;
    // Tambah efek visual pulse kecil saat data masuk
    els.adc.classList.remove('text-blue-600');
    els.adc.classList.add('text-blue-400');
    setTimeout(() => {
      els.adc.classList.remove('text-blue-400');
      els.adc.classList.add('text-blue-600');
    }, 100);
  }

  // 3. Update Buffer Data untuk Grafik
  const timestamp = new Date();
  const timeStr = timestamp.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  
  state.dataBuffer.push({
    time: timeStr,
    temp: data.suhu || 0,
    turb: data.turbidity_persen || 0
  });

  // Jaga agar array tidak terlalu panjang
  if (state.dataBuffer.length > CONFIG.MAX_DATA_POINTS) {
    state.dataBuffer.shift();
  }

  // 4. Refresh Grafik
  updateCharts();
}

// =========================================================================
// 5. CHART MANAGEMENT
// =========================================================================
function initCharts() {
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top' },
      tooltip: { 
        backgroundColor: 'rgba(0,0,0,0.8)', 
        padding: 10, 
        cornerRadius: 8 
      }
    },
    scales: {
      x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
      y: { grid: { color: '#f1f5f9' } }
    },
    animation: false // Matikan animasi agar performa real-time ringan
  };

  // Chart Suhu
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
        scales: { ...commonOptions.scales, y: { min: 20, max: 35 } }
      }
    });
  }

  // Chart Kekeruhan
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

  // Update Data Suhu
  state.chartTemp.data.labels = labels;
  state.chartTemp.data.datasets[0].data = tempData;
  state.chartTemp.data.datasets[1].data = Array(tempData.length).fill(state.setpoints.temp);
  state.chartTemp.update('none'); // 'none' mode prevents re-animation

  // Update Data Kekeruhan
  state.chartTurb.data.labels = labels;
  state.chartTurb.data.datasets[0].data = turbData;
  state.chartTurb.data.datasets[1].data = Array(turbData.length).fill(state.setpoints.turb);
  state.chartTurb.update('none');
}

// =========================================================================
// 6. CONTROL LOGIC (API)
// =========================================================================
async function loadControlSettings() {
  try {
    const res = await fetch(`${CONFIG.API_BASE}/api/control`);
    if (!res.ok) throw new Error('Gagal mengambil data');
    
    const data = await res.json();

    // Update UI Kontrol
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
      // Calibration Inputs
      adcJernih: document.getElementById('calib-adc-jernih'),
      adcKeruh: document.getElementById('calib-adc-keruh')
    };

    if (els.mode) els.mode.value = data.kontrol_aktif || 'Fuzzy';
    if (els.tempSp) els.tempSp.value = data.suhu_setpoint || 28.0;
    if (els.turbSp) els.turbSp.value = data.keruh_setpoint || 10.0;

    // Trigger event change untuk menampilkan/menyembunyikan PID params
    if (els.mode) els.mode.dispatchEvent(new Event('change'));

    // Isi nilai PID jika ada
    if (els.kpTemp) els.kpTemp.value = data.kp_suhu || 0;
    if (els.kiTemp) els.kiTemp.value = data.ki_suhu || 0;
    if (els.kdTemp) els.kdTemp.value = data.kd_suhu || 0;
    // ... dst untuk turb ...

    // Isi nilai Kalibrasi jika ada
    if (data.adc_jernih && els.adcJernih) els.adcJernih.value = data.adc_jernih;
    if (data.adc_keruh && els.adcKeruh) els.adcKeruh.value = data.adc_keruh;

    // Update state lokal
    state.setpoints.temp = parseFloat(data.suhu_setpoint) || 28.0;
    state.setpoints.turb = parseFloat(data.keruh_setpoint) || 10.0;

    console.log('[API] Settings loaded');
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
    showNotification('Setpoint harus berupa angka!', 'error');
    return;
  }

  // Payload dasar
  const payload = {
    kontrol_aktif: mode,
    suhu_setpoint: tempSp,
    keruh_setpoint: turbSp
  };

  // Jika PID, ambil parameter tambahan
  if (mode === 'PID') {
    payload.kp_suhu = parseFloat(document.getElementById('control-kp-temp').value) || 0;
    payload.ki_suhu = parseFloat(document.getElementById('control-ki-temp').value) || 0;
    payload.kd_suhu = parseFloat(document.getElementById('control-kd-temp').value) || 0;
    payload.kp_keruh = parseFloat(document.getElementById('control-kp-turb').value) || 0;
    payload.ki_keruh = parseFloat(document.getElementById('control-ki-turb').value) || 0;
    payload.kd_keruh = parseFloat(document.getElementById('control-kd-turb').value) || 0;
  }

  try {
    const res = await fetch(`${CONFIG.API_BASE}/api/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    // Update State Lokal agar grafik langsung berubah
    state.setpoints.temp = tempSp;
    state.setpoints.turb = turbSp;

    showNotification('Pengaturan berhasil disimpan!', 'success');
  } catch (error) {
    console.error('[Control] Error:', error);
    showNotification('Gagal menyimpan pengaturan', 'error');
  }
}

// =========================================================================
// 7. CALIBRATION LOGIC
// =========================================================================
async function uploadCalibration() {
  const adcJernih = parseInt(document.getElementById('calib-adc-jernih').value);
  const adcKeruh = parseInt(document.getElementById('calib-adc-keruh').value);
  const statusEl = document.getElementById('calib-status');

  // Validasi
  if (isNaN(adcJernih) || isNaN(adcKeruh)) {
    showNotification('Nilai ADC harus berupa angka!', 'warning');
    return;
  }
  if (adcJernih === adcKeruh) {
    showNotification('Nilai ADC jernih dan keruh tidak boleh sama!', 'warning');
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

    statusEl.innerHTML = '<span class="text-green-600">Berhasil dikalibrasi ✓</span>';
    document.getElementById('calib-last-update').textContent = `Terakhir: ${new Date().toLocaleString('id-ID')}`;
    showNotification('Kalibrasi Sensor Berhasil!', 'success');

    setTimeout(() => {
      statusEl.innerHTML = '<span class="text-gray-800">Siap untuk kalibrasi ulang</span>';
    }, 3000);

  } catch (error) {
    console.error('[Calibration] Error:', error);
    statusEl.innerHTML = '<span class="text-red-600">Gagal upload ✗</span>';
    showNotification('Gagal mengirim kalibrasi', 'error');
  }
}

function resetCalibration() {
  document.getElementById('calib-adc-jernih').value = 9475;
  document.getElementById('calib-adc-keruh').value = 3550;
  showNotification('Nilai dikembalikan ke default', 'info');
}

// =========================================================================
// 8. EXPORT / CSV LOGIC
// =========================================================================
function openExportModal() {
  const modal = document.getElementById('export-modal');
  if (modal) {
    const end = new Date();
    const start = new Date(end.getTime() - (60 * 60 * 1000)); // Default 1 jam lalu
    
    document.getElementById('export-start-time').value = formatDateForInput(start);
    document.getElementById('export-end-time').value = formatDateForInput(end);
    
    modal.classList.remove('hidden');
  }
}

function closeExportModal() {
  const modal = document.getElementById('export-modal');
  if (modal) modal.classList.add('hidden');
}

function downloadRangedCSV() {
  const startVal = document.getElementById('export-start-time').value;
  const endVal = document.getElementById('export-end-time').value;

  if (!startVal || !endVal) {
    showNotification('Waktu mulai dan selesai harus diisi', 'warning');
    return;
  }

  const startISO = new Date(startVal).toISOString();
  const endISO = new Date(endVal).toISOString();

  if (new Date(startISO) >= new Date(endISO)) {
    showNotification('Waktu mulai harus lebih kecil dari waktu selesai', 'warning');
    return;
  }

  // Buka link download di tab baru
  const url = `${CONFIG.API_BASE}/api/export/csv/range?start=${startISO}&end=${endISO}`;
  window.open(url, '_blank');
  closeExportModal();
  showNotification('Sedang mengunduh CSV...', 'info');
}

// =========================================================================
// 9. INITIALIZATION
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
  console.log('[App] Initializing...');

  // 1. Setup Charts
  initCharts();

  // 2. Setup Socket
  connectSocket();

  // 3. Load Initial Data from DB/API
  loadControlSettings();

  // 4. Setup Event Listeners UI
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

  // 5. Initialize Icons
  if (window.lucide) window.lucide.createIcons();
});

// Cleanup saat halaman ditutup
window.addEventListener('beforeunload', () => {
  if (state.socket) state.socket.disconnect();
  if (state.chartTemp) state.chartTemp.destroy();
  if (state.chartTurb) state.chartTurb.destroy();
});