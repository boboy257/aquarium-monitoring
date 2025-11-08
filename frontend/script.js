// =========================================================================
//                GLOBAL STATE
// =========================================================================
let chartTemp = null;
let chartTurb = null;
let socket = null;
let dataBuffer = [];
let isConnected = false;
let currentTempSetpoint = 28.0; 
let currentTurbSetpoint = 10.0; 

const API_BASE = window.location.origin;

// =========================================================================
//                UTILITY FUNCTIONS
// =========================================================================
function showNotification(message, type = 'info') {
  const colors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    info: 'bg-blue-500',
    warning: 'bg-yellow-500'
  };
  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠'
  };
  const notif = document.createElement('div');
  notif.className = `notification ${colors[type]} text-white px-6 py-4 rounded-lg shadow-2xl flex items-center space-x-3 max-w-md`;
  notif.innerHTML = `
    <span class="text-2xl">${icons[type]}</span>
    <span class="font-medium">${message}</span>
  `;
  document.body.appendChild(notif);
  setTimeout(() => {
    notif.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => notif.remove(), 300);
  }, 3000);
}

function updateConnectionStatus(connected) {
  isConnected = connected;
  const statusEl = document.getElementById('connection-status');
  const dotEl = document.querySelector('#connection-status .pulse-dot');
  
  const colorClass = connected ? 'bg-green-500' : 'bg-red-500';
  const statusText = connected ? 'Connected' : 'Disconnected';
  const bgColorClass = connected ? 'bg-green-100' : 'bg-red-100';
  const textColorClass = connected ? 'text-green-700' : 'text-red-700';

  if (statusEl) {
    statusEl.className = `ml-4 flex items-center space-x-2 px-3 py-1.5 rounded-full ${bgColorClass}`;
    statusEl.innerHTML = `
      <span class="w-2 h-2 ${colorClass} rounded-full"></span>
      <span class="text-xs font-medium ${textColorClass}">${statusText}</span>
    `;
  }
}

function formatNumber(num, decimals = 2) {
  if (num === null || num === undefined || isNaN(num)) return '--';
  return Number(num).toFixed(decimals);
}

// =========================================================================
//                TAB MANAGEMENT (DIHAPUS KARENA HANYA 1 TAB)
// =========================================================================

// =========================================================================
//                SOCKET.IO CONNECTION
// =========================================================================
function connectSocket() {
  console.log('[Socket] Connecting to server...');
  socket = io(API_BASE, {
    transports: ['websocket', 'polling'],
    timeout: 20000,
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionAttempts: Infinity
  });
  socket.on('connect', () => {
    console.log('[Socket] ✅ Connected');
    updateConnectionStatus(true);
    showNotification('Connected to server', 'success');
  });
  socket.on('disconnect', (reason) => {
    console.log('[Socket] ❌ Disconnected:', reason);
    updateConnectionStatus(false);
    showNotification('Connection lost', 'error');
  });
  socket.on('connect_error', (error) => {
    console.error('[Socket] Connection error:', error.message);
    updateConnectionStatus(false);
  });
  socket.on('reconnect', (attemptNumber) => {
    console.log('[Socket] ✅ Reconnected after', attemptNumber, 'attempts');
    showNotification('Reconnected to server', 'success');
  });

  socket.on('newData', (data) => {
    updateDashboard(data);
  });
}

// =========================================================================
//                DASHBOARD UPDATES
// =========================================================================
function updateDashboard(data) {
  if (!data) {
    console.error('[ERROR] Received null data');
    return;
  }
  document.getElementById('current-temp').textContent = `${formatNumber(data.suhu)}°C`;
  document.getElementById('current-turb').textContent = `${formatNumber(data.turbidity_persen)}%`;
  document.getElementById('current-mode').textContent = data.kontrol_aktif || '--';
  document.getElementById('current-pwm-heater').textContent = `${formatNumber(data.pwm_heater, 1)}%`;
  document.getElementById('current-pwm-pump').textContent = `${formatNumber(data.pwm_pompa, 1)}%`;

  const timestamp = new Date();
  dataBuffer.push({
    time: timestamp.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    temp: data.suhu || 0,
    turb: data.turbidity_persen || 0
  });

  if (dataBuffer.length > 50) {
    dataBuffer.shift();
  }
  updateCharts();
}

// =========================================================================
//                CHART MANAGEMENT
// =========================================================================
function initCharts() {
  const ctxTemp = document.getElementById('chartTemp');
  if (ctxTemp) {
    chartTemp = new Chart(ctxTemp.getContext('2d'), {
      type: 'line',
      data: { labels: [], datasets: [
        { 
          label: 'Temperature (°C)',
          data: [],
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 2,
          pointHoverRadius: 5,
          yAxisID: 'y'
        },
        { 
          label: 'Setpoint Suhu',
          data: [],
          borderColor: 'rgba(255, 0, 0, 1)', 
          borderDash: [5, 5], 
          fill: false,
          pointRadius: 0, 
          yAxisID: 'y',
          hidden: false 
        }
      ]},
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { 
            display: true, 
            position: 'top', 
            labels: { font: { size: 12, weight: '600' } },
            onClick: function(e, legendItem, legend) {
              const index = legendItem.datasetIndex;
              const ci = legend.chart;
              if (index !== undefined && ci && typeof ci.isDatasetVisible === 'function' && typeof ci.hide === 'function' && typeof ci.show === 'function') {
                if (ci.isDatasetVisible(index)) {
                  ci.hide(index);
                } else {
                  ci.show(index);
                }
              }
            }
          },
          tooltip: { backgroundColor: 'rgba(0, 0, 0, 0.8)', titleFont: { size: 13 }, bodyFont: { size: 12 }, padding: 12, cornerRadius: 8 }
        },
        scales: {
          y: { 
            min: 20, 
            max: 40,
            grid: { color: 'rgba(0, 0, 0, 0.05)' }, 
            title: { 
              display: true, 
              text: 'Temperature (°C)', 
              font: { size: 13, weight: '600' } 
            }
          },
          x: { grid: { display: false }, ticks: { maxRotation: 45, minRotation: 0 } }
        },
        animation: { duration: 0 }
      }
    });
  }

  const ctxTurb = document.getElementById('chartTurb');
  if (ctxTurb) {
    chartTurb = new Chart(ctxTurb.getContext('2d'), {
      type: 'line',
      data: { labels: [], datasets: [
        { 
          label: 'Turbidity (%)',
          data: [],
          borderColor: 'rgb(245, 158, 11)',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 2,
          pointHoverRadius: 5,
          yAxisID: 'y'
        },
        { 
          label: 'Setpoint Kekeruhan',
          data: [],
          borderColor: 'rgba(255, 0, 0, 1)', 
          borderDash: [5, 5], 
          fill: false,
          pointRadius: 0, 
          yAxisID: 'y',
          hidden: false
        }
      ]},
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { 
            display: true, 
            position: 'top', 
            labels: { font: { size: 12, weight: '600' } },
            onClick: function(e, legendItem, legend) {
              const index = legendItem.datasetIndex;
              const ci = legend.chart;
              if (index !== undefined && ci && typeof ci.isDatasetVisible === 'function' && typeof ci.hide === 'function' && typeof ci.show === 'function') {
                if (ci.isDatasetVisible(index)) {
                  ci.hide(index);
                } else {
                  ci.show(index);
                }
              }
            }
          },
          tooltip: { backgroundColor: 'rgba(0, 0, 0, 0.8)', titleFont: { size: 13 }, bodyFont: { size: 12 }, padding: 12, cornerRadius: 8 }
        },
        scales: {
          y: { 
            min: 0, 
            max: 100, 
            grid: { color: 'rgba(0, 0, 0, 0.05)' }, 
            title: { 
              display: true, 
              text: 'Turbidity (%)', 
              font: { size: 13, weight: '600' } 
            },
            ticks: {
              stepSize: 5
            }
          },
          x: { grid: { display: false }, ticks: { maxRotation: 45, minRotation: 0 } }
        },
        animation: { duration: 0 }
      }
    });
  }
  console.log('[Charts] ✅ Initialized');
}

function updateCharts() {
  if (!chartTemp || !chartTurb || dataBuffer.length === 0) return;
  const labels = dataBuffer.map(d => d.time);
  const tempData = dataBuffer.map(d => d.temp);
  const turbData = dataBuffer.map(d => d.turb);
  chartTemp.data.labels = labels;
  chartTemp.data.datasets[0].data = tempData; 
  chartTemp.data.datasets[1].data = Array(tempData.length).fill(currentTempSetpoint);
  chartTemp.update('none');
  chartTurb.data.labels = labels;
  chartTurb.data.datasets[0].data = turbData; 
  chartTurb.data.datasets[1].data = Array(turbData.length).fill(currentTurbSetpoint);
  chartTurb.update('none');
}

// =========================================================================
//                CONTROL FUNCTIONS
// =========================================================================
async function updateControl() {
  const mode = document.getElementById('control-mode').value;
  const tempSp = parseFloat(document.getElementById('control-temp-sp').value);
  const turbSp = parseFloat(document.getElementById('control-turb-sp').value);
  if (isNaN(tempSp) || isNaN(turbSp)) {
    showNotification('Please enter valid numbers', 'error');
    return;
  }
  currentTempSetpoint = tempSp;
  currentTurbSetpoint = turbSp;
  const payload = { kontrol_aktif: mode, suhu_setpoint: tempSp, keruh_setpoint: turbSp };
  if (mode === 'PID') {
    payload.kp_suhu = parseFloat(document.getElementById('control-kp-temp').value);
    payload.ki_suhu = parseFloat(document.getElementById('control-ki-temp').value);
    payload.kd_suhu = parseFloat(document.getElementById('control-kd-temp').value);
    payload.kp_keruh = parseFloat(document.getElementById('control-kp-turb').value);
    payload.ki_keruh = parseFloat(document.getElementById('control-ki-turb').value);
    payload.kd_keruh = parseFloat(document.getElementById('control-kd-turb').value);
  }
  try {
    const res = await fetch(`${API_BASE}/api/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = await res.json();
    console.log('[Control] Updated:', result);
    showNotification('Settings sent to ESP32', 'success');
  } catch (error) {
    console.error('[Control] Error:', error);
    showNotification('Failed to update settings', 'error');
  }
}

async function loadControlSettings() {
  try {
    const res = await fetch(`${API_BASE}/api/control`);
    const control = await res.json();
    document.getElementById('control-mode').value = control.kontrol_aktif || 'Fuzzy';
    document.getElementById('control-temp-sp').value = control.suhu_setpoint || 28.0;
    document.getElementById('control-turb-sp').value = control.keruh_setpoint || 10.0;
    currentTempSetpoint = control.suhu_setpoint || 28.0;
    currentTurbSetpoint = control.keruh_setpoint || 10.0;
  } catch (error) {
    console.error('[Control] Load error:', error);
  }
}

// =========================================================================
//                FUNGSI EXPORT BARU DENGAN RENTANG WAKTU
// =========================================================================

// Helper untuk memformat tanggal ke input datetime-local
function formatDateForInput(date) {
  const pad = (num) => String(num).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function openExportModal() {
  const modal = document.getElementById('export-modal');
  if (modal) {
    // Otomatis isi waktu: Selesai = sekarang, Mulai = 1 jam lalu
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - (60 * 60 * 1000)); // 1 jam lalu

    document.getElementById('export-start-time').value = formatDateForInput(startTime);
    document.getElementById('export-end-time').value = formatDateForInput(endTime);
    
    modal.classList.remove('hidden');
  }
}

function closeExportModal() {
  const modal = document.getElementById('export-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

async function downloadRangedCSV() {
  const startTime = document.getElementById('export-start-time').value;
  const endTime = document.getElementById('export-end-time').value;

  if (!startTime || !endTime) {
    showNotification('Harap isi waktu mulai dan selesai', 'warning');
    return;
  }

  // Konversi ke format ISO 8601 (yang aman untuk URL)
  const startISO = new Date(startTime).toISOString();
  const endISO = new Date(endTime).toISOString();

  if (new Date(startISO) >= new Date(endISO)) {
    showNotification('Waktu mulai harus sebelum waktu selesai', 'warning');
    return;
  }

  // Buat URL dengan query parameter
  const url = `${API_BASE}/api/export/csv/range?start=${startISO}&end=${endISO}`;
  
  showNotification('Generating CSV...', 'info');
  window.open(url, '_blank');
  closeExportModal();
}

// =========================================================================
//                EVENT LISTENERS
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
  console.log('[App] 🚀 Initializing...');
  
  try {
    // Inisialisasi fungsi inti
    initCharts();
    connectSocket();
    loadControlSettings(); // Load pengaturan manual saat mulai
    lucide.createIcons();
    
    // Listener untuk toggle PID di Control Settings
    const controlModeSelect = document.getElementById('control-mode');
    if (controlModeSelect) {
      controlModeSelect.addEventListener('change', (e) => {
        const pidParams = document.getElementById('pid-params-control');
        if (pidParams) pidParams.classList.toggle('hidden', e.target.value !== 'PID');
      });
      // Sembunyikan saat load jika bukan PID
      const pidParamsControl = document.getElementById('pid-params-control');
      if (pidParamsControl) pidParamsControl.classList.toggle('hidden', controlModeSelect.value !== 'PID');
    }
    
    console.log('[App] ✅ Ready');
    
  } catch (error) {
    console.error('[App] ❌ FATAL INITIALIZATION ERROR:', error);
    showNotification('Gagal memuat aplikasi. Periksa HTML.', 'error');
  }
});

// Cleanup
window.addEventListener('beforeunload', () => {
  if (socket) socket.disconnect();
  if (chartTemp) chartTemp.destroy();
  if (chartTurb) chartTurb.destroy();
});