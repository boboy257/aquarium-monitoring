/**
 * AQUARIUM RESEARCH DASHBOARD - DUAL THEME
 * Complete Logic: Real-time, Control, Calibration, Zoom, Watchdog & Theme Toggle
 */

// =========================================================================
// 1. CONFIG & GLOBAL STATE
// =========================================================================
const CONFIG = {
  API_BASE: window.location.origin,
  MAX_DATA_POINTS: 50,
  RECONNECT_DELAY: 2000,
  TIMEOUT: 20000,
  WATCHDOG_THRESHOLD: 30000,
  COLORS: {
    temp: null,        // Will be set dynamically
    turb: null,        // Will be set dynamically
    setpoint: null,    // Will be set dynamically
    gridColor: null,
    textColor: null
  }
};

let state = {
  chartTemp: null,
  chartTurb: null,
  socket: null,
  dataBuffer: [],
  isLiveMode: true,
  isConnected: false,
  lastDataTime: Date.now(),
  watchdogInterval: null,
  setpoints: {
    temp: 28.0,
    turb: 10.0
  },
  currentTheme: 'light'  // Default theme
};

// =========================================================================
// 2. THEME SYSTEM
// =========================================================================
function updateChartColors() {
  const isDark = state.currentTheme === 'dark';
  
  CONFIG.COLORS = {
    temp: isDark ? 'rgb(96, 165, 250)' : 'rgb(59, 130, 246)',
    turb: isDark ? 'rgb(251, 191, 36)' : 'rgb(245, 158, 11)',
    setpoint: 'rgba(34, 211, 238, 1)',
    gridColor: isDark ? 'rgba(56, 189, 248, 0.1)' : 'rgba(14, 165, 233, 0.08)',
    textColor: isDark ? '#e2e8f0' : '#334155'
  };
}

function toggleTheme() {
  const body = document.body;
  const themeIcon = document.querySelector('#theme-toggle i');
  
  // Toggle theme
  if (state.currentTheme === 'light') {
    body.classList.remove('light-theme');
    body.classList.add('dark-theme');
    state.currentTheme = 'dark';
    if (themeIcon) themeIcon.setAttribute('data-lucide', 'moon');
  } else {
    body.classList.remove('dark-theme');
    body.classList.add('light-theme');
    state.currentTheme = 'light';
    if (themeIcon) themeIcon.setAttribute('data-lucide', 'sun');
  }
  
  // Refresh icons
  if (window.lucide) window.lucide.createIcons();
  
  // Update chart colors
  updateChartColors();
  
  // Update existing charts
  // Update existing charts (CEK NULL DULU!)
  if (state.chartTemp && state.chartTemp.options) {
    state.chartTemp.options.plugins.legend.labels.color = CONFIG.COLORS.textColor;
    updateChartTheme(state.chartTemp);
    state.chartTemp.update();
  }
  if (state.chartTurb && state.chartTurb.options) {
    state.chartTurb.options.plugins.legend.labels.color = CONFIG.COLORS.textColor;
    updateChartTheme(state.chartTurb);
    state.chartTurb.update();
  }
  
  // Save preference
  localStorage.setItem('aquarium-theme', state.currentTheme);
  
  showNotification(`Tema ${state.currentTheme === 'dark' ? 'Gelap' : 'Terang'} diaktifkan`, 'success');
}

function updateChartTheme(chart) {
  // Update colors
  chart.data.datasets[0].borderColor = CONFIG.COLORS.temp || CONFIG.COLORS.turb;
  chart.data.datasets[0].backgroundColor = state.currentTheme === 'dark' 
    ? (chart === state.chartTemp ? 'rgba(96, 165, 250, 0.1)' : 'rgba(251, 191, 36, 0.1)')
    : (chart === state.chartTemp ? 'rgba(59, 130, 246, 0.1)' : 'rgba(245, 158, 11, 0.1)');
  
  // Update grid & text colors
  chart.options.scales.x.grid.color = CONFIG.COLORS.gridColor;
  chart.options.scales.y.grid.color = CONFIG.COLORS.gridColor;
  chart.options.scales.x.ticks.color = CONFIG.COLORS.textColor;
  chart.options.scales.y.ticks.color = CONFIG.COLORS.textColor;
  chart.options.plugins.legend.labels.color = CONFIG.COLORS.textColor;
  chart.options.plugins.tooltip.backgroundColor = state.currentTheme === 'dark' 
    ? 'rgba(15, 29, 53, 0.95)' 
    : 'rgba(255, 255, 255, 0.95)';
  chart.options.plugins.tooltip.titleColor = state.currentTheme === 'dark' ? '#38bdf8' : '#0ea5e9';
  chart.options.plugins.tooltip.bodyColor = CONFIG.COLORS.textColor;
}

function loadThemePreference() {
  const savedTheme = localStorage.getItem('aquarium-theme');
  if (savedTheme === 'dark') {
    document.body.classList.remove('light-theme');
    document.body.classList.add('dark-theme');
    state.currentTheme = 'dark';
    const themeIcon = document.querySelector('#theme-toggle i');
    if (themeIcon) {
      themeIcon.setAttribute('data-lucide', 'moon');
    }
  }
  updateChartColors();
}

// =========================================================================
// 3. UTILITY FUNCTIONS
// =========================================================================
function formatNumber(num, decimals = 2) {
  if (num === null || num === undefined || isNaN(num)) return '--';
  return Number(num).toFixed(decimals);
}

function showNotification(message, type = 'info') {
  const colors = {
    success: 'bg-gradient-to-r from-green-500 to-emerald-600',
    error: 'bg-gradient-to-r from-red-500 to-red-600',
    info: 'bg-gradient-to-r from-cyan-500 to-blue-600',
    warning: 'bg-gradient-to-r from-amber-500 to-orange-600'
  };
  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };

  const notif = document.createElement('div');
  notif.className = `notification ${colors[type]} text-white px-6 py-4 rounded-lg shadow-2xl flex items-center space-x-3 max-w-md transition-all duration-300 fixed top-5 right-5 z-[9999] translate-x-full border border-white/20`;
  notif.innerHTML = `
    <span class="text-xl font-bold">${icons[type]}</span>
    <span class="font-medium">${message}</span>
  `;

  document.body.appendChild(notif);

  requestAnimationFrame(() => {
    notif.style.transform = 'translateX(0)';
  });

  setTimeout(() => {
    notif.style.transform = 'translateX(120%)';
    setTimeout(() => notif.remove(), 300);
  }, 3000);
}

function updateConnectionStatus(connected) {
  state.isConnected = connected;
  const statusEl = document.getElementById('connection-status');
  
  const config = connected 
    ? { bg: 'bg-green-500/20', dot: 'bg-green-400', text: 'text-green-600', label: 'Connected' }
    : { bg: 'bg-red-500/20', dot: 'bg-red-500', text: 'text-red-600', label: 'Disconnected' };

  if (statusEl) {
    statusEl.className = `flex items-center space-x-2 px-3 py-1.5 rounded-full ${config.bg} border border-${connected ? 'green' : 'red'}-500/30 transition-colors duration-300`;
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
// 4. WATCHDOG TIMER
// =========================================================================
function startWatchdog() {
  if (state.watchdogInterval) clearInterval(state.watchdogInterval);

  state.watchdogInterval = setInterval(() => {
    const now = Date.now();
    const timeDiff = now - state.lastDataTime;
    const alertEl = document.getElementById('sensor-watchdog-alert');
    
    if (timeDiff > CONFIG.WATCHDOG_THRESHOLD) {
      if (alertEl && alertEl.classList.contains('hidden')) {
        alertEl.classList.remove('hidden');
        console.warn(`[Watchdog] ⚠️ SENSOR DEAD! No data for ${Math.floor(timeDiff/1000)}s`);
        
        const ids = ['current-temp', 'current-turb', 'current-pwm-heater', 'current-pwm-pump', 'live-adc-value'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if(el) {
                el.dataset.prevVal = el.textContent;
                el.textContent = "LOST";
                el.classList.add('text-red-500', 'animate-pulse', 'font-bold');
                el.classList.remove('stat-glow'); 
            }
        });
      }
    }
  }, 1000);
}

// =========================================================================
// 5. SOCKET.IO CONNECTION
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
        lastKnownControlSettings = packet.data;
    }
    logToTerminal(packet.data, packet.type);
  });
}

// =========================================================================
// 6. DATA PROCESSING
// =========================================================================
function processNewData(data) {
  if (!data) return;

  logToTerminal(data, 'DATA');

  state.lastDataTime = Date.now();
  
  const alertEl = document.getElementById('sensor-watchdog-alert');
  if (alertEl && !alertEl.classList.contains('hidden')) {
    alertEl.classList.add('hidden');
    showNotification('Koneksi Sensor Pulih', 'success');
    
    const ids = ['current-temp', 'current-turb', 'current-pwm-heater', 'current-pwm-pump', 'live-adc-value'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.classList.remove('text-red-500', 'animate-pulse', 'font-bold');
            el.classList.add('stat-glow');
        }
    });
  }

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

  if (state.isLiveMode) {
      const timeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      state.dataBuffer.push({
        time: timeStr,
        temp: data.suhu || 0,
        turb: data.turbidity_persen || 0,
        mode: data.kontrol_aktif || 'Unknown'
      });

      if (state.dataBuffer.length > CONFIG.MAX_DATA_POINTS) {
        state.dataBuffer.shift();
      }

    updateCharts();
  }
}

// =========================================================================
// 7. CHART MANAGEMENT
// =========================================================================
function initCharts() {
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { 
        position: 'top', 
        labels: { 
          boxWidth: 12, 
          padding: 10,
          color: CONFIG.COLORS.textColor,
          font: {
            family: 'Inter'
          }
        } 
      },
      tooltip: { 
        backgroundColor: state.currentTheme === 'dark' ? 'rgba(15, 29, 53, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        titleColor: state.currentTheme === 'dark' ? '#38bdf8' : '#0ea5e9',
        bodyColor: CONFIG.COLORS.textColor,
        borderColor: state.currentTheme === 'dark' ? 'rgba(56, 189, 248, 0.3)' : 'rgba(14, 165, 233, 0.3)',
        borderWidth: 1,
        padding: 12, 
        cornerRadius: 8,
        callbacks: {
          label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                  label += ': ';
              }
              if (context.parsed.y !== null) {
                  label += context.parsed.y;
              }
              
              if (context.dataset.modes && context.dataset.modes[context.dataIndex]) {
                  const currentMode = context.dataset.modes[context.dataIndex];
                  label += ` [${currentMode}]`; 
              }
              return label;
          }
        }
      },
      zoom: {
        pan: {
          enabled: true,
          mode: 'x',
        },
        zoom: {
          wheel: { enabled: true },
          pinch: { enabled: true },
          mode: 'x',
        }
      }
    },
    scales: {
      x: { 
        ticks: { 
          maxRotation: 0, 
          autoSkip: true, 
          maxTicksLimit: 6,
          color: CONFIG.COLORS.textColor 
        },
        grid: { color: CONFIG.COLORS.gridColor }
      },
      y: { 
        grid: { color: CONFIG.COLORS.gridColor },
        ticks: { color: CONFIG.COLORS.textColor }
      }
    },
    animation: false
  };

  // Temperature Chart
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
            backgroundColor: state.currentTheme === 'dark' ? 'rgba(96, 165, 250, 0.1)' : 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 0,
            segment: {
              backgroundColor: (ctx) => {
                const dataset = ctx.chart.data.datasets[ctx.datasetIndex];
                const index = ctx.p0DataIndex;
                const mode = (dataset && dataset.modes) ? dataset.modes[index] : 'Unknown';
                return mode === 'PID' 
                  ? 'rgba(168, 85, 247, 0.15)'
                  : (state.currentTheme === 'dark' ? 'rgba(96, 165, 250, 0.15)' : 'rgba(59, 130, 246, 0.15)');
              }
            }
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
        scales: { 
          ...commonOptions.scales, 
          y: { 
            ...commonOptions.scales.y,
            min: 20, 
            max: 35 
          } 
        }
      }
    });
  }

  // Turbidity Chart
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
            backgroundColor: state.currentTheme === 'dark' ? 'rgba(251, 191, 36, 0.1)' : 'rgba(245, 158, 11, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 0,
            segment: {
              backgroundColor: (ctx) => {
                const dataset = ctx.chart.data.datasets[ctx.datasetIndex];
                const index = ctx.p0DataIndex;
                const mode = (dataset && dataset.modes) ? dataset.modes[index] : 'Unknown';
                return mode === 'PID' 
                  ? 'rgba(168, 85, 247, 0.15)'
                  : (state.currentTheme === 'dark' ? 'rgba(251, 191, 36, 0.15)' : 'rgba(245, 158, 11, 0.15)');
              }
            }
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
        scales: { 
          ...commonOptions.scales, 
          y: { 
            ...commonOptions.scales.y,
            min: 0, 
            max: 100 
          } 
        }
      }
    });
  }
}

function updateCharts() {
  if (!state.chartTemp || !state.chartTurb || state.dataBuffer.length === 0) return;

  const labels = state.dataBuffer.map(d => d.time);
  const tempData = state.dataBuffer.map(d => d.temp);
  const turbData = state.dataBuffer.map(d => d.turb);
  const currentModes = state.dataBuffer.map(d => d.mode);

  state.chartTemp.data.labels = labels;
  state.chartTemp.data.datasets[0].data = tempData;
  state.chartTemp.data.datasets[0].modes = currentModes;
  if (state.chartTemp.data.datasets[1]) {
      state.chartTemp.data.datasets[1].data = Array(tempData.length).fill(state.setpoints.temp);
  }
  state.chartTemp.update('none');

  state.chartTurb.data.labels = labels;
  state.chartTurb.data.datasets[0].data = turbData;
  state.chartTurb.data.datasets[0].modes = currentModes;
  if (state.chartTurb.data.datasets[1]) {
      state.chartTurb.data.datasets[1].data = Array(turbData.length).fill(state.setpoints.turb);
  }
  state.chartTurb.update('none');
}

function resetZoomChart(type) {
  if (type === 'temp' && state.chartTemp) {
    state.chartTemp.resetZoom();
  } else if (type === 'turb' && state.chartTurb) {
    state.chartTurb.resetZoom();
  }
}

// =========================================================================
// 8. CONTROL LOGIC
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
    console.table(data);
    console.groupEnd();

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

    if (els.mode) els.mode.dispatchEvent(new Event('change'));

    if (els.kpTemp) els.kpTemp.value = data.kp_suhu || 0;
    if (els.kiTemp) els.kiTemp.value = data.ki_suhu || 0;
    if (els.kdTemp) els.kdTemp.value = data.kd_suhu || 0;
    if (els.kpTurb) els.kpTurb.value = data.kp_keruh || 0;
    if (els.kiTurb) els.kiTurb.value = data.ki_keruh || 0;
    if (els.kdTurb) els.kdTurb.value = data.kd_keruh || 0;

    if (data.adc_jernih && els.adcJernih) els.adcJernih.value = data.adc_jernih;
    if (data.adc_keruh && els.adcKeruh) els.adcKeruh.value = data.adc_keruh;

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
// 9. CALIBRATION LOGIC
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
// 10. EXPORT LOGIC
// =========================================================================
function openExportModal() {
  const modal = document.getElementById('export-modal');
  if (modal) {
    const end = new Date();
    const start = new Date(end.getTime() - (60 * 60 * 1000));
    
    document.getElementById('export-start-time').value = formatDateForInput(start);
    document.getElementById('export-end-time').value = formatDateForInput(end);
    
    modal.classList.remove('hidden');
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
// 11. DEBUG CONSOLE
// =========================================================================
const debugState = {
  maxLogs: 50,
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
  container.innerHTML = '<div class="opacity-50 italic text-subtext">> Log cleared. Waiting for data...</div>';
}

function logToTerminal(data, type = 'DATA') {
  const container = document.getElementById('debug-log-container');
  if (!container) return;

  const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
  const time = new Date().toLocaleTimeString('id-ID', {
    hour12: false
  });
  
  let jsonString = JSON.stringify(data);
  jsonString = jsonString.replace(/"([^"]+)":/g, '<span class="log-key">"$1":</span>');
  jsonString = jsonString.replace(/:([0-9.]+)/g, ':<span class="log-num">$1</span>');
  jsonString = jsonString.replace(/:("[^"]+")/g, ':<span class="log-val">$1</span>');
  jsonString = jsonString.replace(/:(true|false)/g, ':<span class="log-bool">$1</span>');

  let labelColor = '#4ade80';
  let borderColor = '#4ade80';

  if (type === 'CONTROL') {
    labelColor = '#c084fc';
    borderColor = '#c084fc';
  } else if (type === 'CALIB') {
    labelColor = '#facc15';
    borderColor = '#facc15';
  } else if (type === 'AUTO-FIX') {
    labelColor = '#f87171';
    borderColor = '#f87171';
  }

  const entry = document.createElement('div');
  entry.style.borderLeft = `4px solid ${borderColor}`;
  entry.style.paddingLeft = '8px';
  entry.style.marginBottom = '4px';
  entry.style.fontFamily = 'monospace';
  entry.style.fontSize = '12px';
  entry.style.backgroundColor = state.currentTheme === 'dark' ? 'rgba(56, 189, 248, 0.05)' : 'rgba(14, 165, 233, 0.05)';
  
  entry.innerHTML = `
    <span class="log-time">[${time}]</span>
    <span class="label-${type}">[${type}]</span>
    <span style="color: ${state.currentTheme === 'dark' ? '#d4d4d4' : '#334155'};">${jsonString}</span>
  `;

  container.appendChild(entry);

  if (isNearBottom) {
    container.scrollTop = container.scrollHeight;
  }

  while (container.children.length > debugState.maxLogs) {
    container.removeChild(container.firstChild);
  }
}

let lastKnownControlSettings = null;
setInterval(() => {
  if (lastKnownControlSettings) {
    logToTerminal(lastKnownControlSettings, 'CONTROL');
  }
}, 5000);

// =========================================================================
// 12. HISTORY CHART LOGIC
// =========================================================================
function handleTimeRangeChange() {
  const range = document.getElementById('chartTimeRange').value;
  const customInputs = document.getElementById('customDateInputs');

  if (range === 'live') {
    state.isLiveMode = true;
    state.dataBuffer = [];
    customInputs.classList.add('hidden');
    if (state.chartTemp) state.chartTemp.resetZoom();
    if (state.chartTurb) state.chartTurb.resetZoom();

    showNotification('Kembali ke Mode Live Stream', 'info');
    return;
  }

  if (range === 'custom') {
    state.isLiveMode = false;
    customInputs.classList.remove('hidden');
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    document.getElementById('chartEndDate').value = formatDateForInput(now);
    document.getElementById('chartStartDate').value = formatDateForInput(oneHourAgo);

    return;
  }

  state.isLiveMode = false;
  customInputs.classList.add('hidden');
  loadHistoryByUrl(`${CONFIG.API_BASE}/api/history?hours=${range}`);
}

function loadCustomHistory() {
  const startVal = document.getElementById('chartStartDate').value;
  const endVal = document.getElementById('chartEndDate').value;

  if (!startVal || !endVal) {
    return showNotification('Harap isi Tanggal Mulai dan Selesai!', 'warning');
  }
  if (new Date(startVal) >= new Date(endVal)) {
    return showNotification('Tanggal Mulai harus lebih awal dari Selesai!', 'warning');
  }
  
  const url = `${CONFIG.API_BASE}/api/history?start=${new Date(startVal).toISOString()}&end=${new Date(endVal).toISOString()}`;
  loadHistoryByUrl(url);
}

async function loadHistoryByUrl(url) {
  showNotification('Memuat data history...', 'info');
  try {
    const res = await fetch(url);
    const historyData = await res.json();
    
    if (!historyData || historyData.length === 0) {
      showNotification('Data tidak ditemukan di rentang ini', 'warning');
      return;
    }

    const pointColors = historyData.map(d => d.mode === 'PID' ? '#c084fc' : '#4ade80');
    const modes = historyData.map(d => d.mode);

    // Update Temp Chart
    state.chartTemp.data.labels = historyData.map(d => d.time);
    state.chartTemp.data.datasets[0].data = historyData.map(d => d.temp);
    state.chartTemp.data.datasets[0].pointBackgroundColor = pointColors;
    state.chartTemp.data.datasets[0].pointBorderColor = pointColors;
    state.chartTemp.data.datasets[0].modes = modes;
    
    if (state.chartTemp.data.datasets[1]) {
      state.chartTemp.data.datasets[1].data = historyData.map(d => d.set_temp);
      state.chartTemp.data.datasets[1].pointRadius = 0;
    }
    state.chartTemp.update();
    state.chartTemp.resetZoom();

    // Update Turb Chart
    state.chartTurb.data.labels = historyData.map(d => d.time);
    state.chartTurb.data.datasets[0].data = historyData.map(d => d.turb);
    state.chartTurb.data.datasets[0].pointBackgroundColor = pointColors;
    state.chartTurb.data.datasets[0].pointBorderColor = pointColors;
    state.chartTurb.data.datasets[0].modes = modes;
    
    if (state.chartTurb.data.datasets[1]) {
      state.chartTurb.data.datasets[1].data = historyData.map(d => d.set_turb);
      state.chartTurb.data.datasets[1].pointRadius = 0;
    }
    state.chartTurb.update();
    state.chartTurb.resetZoom();

    showNotification(`Berhasil memuat ${historyData.length} data`, 'success');
  } catch (error) {
    console.error(error);
    showNotification('Gagal mengambil data history', 'error');
  }
}

// =========================================================================
// 13. INITIALIZATION
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
  console.log('[App] Initializing...');
  // Load theme preference first
  loadThemePreference();
  initCharts();
  connectSocket();
  loadControlSettings();
  startWatchdog();

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

  if (window.lucide) window.lucide.createIcons();
});