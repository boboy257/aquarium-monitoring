// =========================================================================
//                   GLOBAL STATE
// =========================================================================
let chartTemp = null;
let chartTurb = null;
let socket = null;
let dataBuffer = [];
let currentExperimentId = null;
let isConnected = false;
let currentTempSetpoint = 28.0; // Default value
let currentTurbSetpoint = 10.0; // Default value

const API_BASE = window.location.origin;

// =========================================================================
//                   UTILITY FUNCTIONS
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
  const mobileStatusEl = document.getElementById('mobile-connection-status');
  const dotEl = document.querySelector('#connection-status .pulse-dot');
  const mobileDotEl = document.querySelector('#mobile-menu .pulse-dot');

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

  if (mobileStatusEl) {
    mobileStatusEl.textContent = statusText;
    mobileStatusEl.className = `text-xs font-medium ${textColorClass}`;
  }

  if (dotEl) dotEl.className = `w-2 h-2 ${colorClass} rounded-full`;
  if (mobileDotEl) mobileDotEl.className = `w-2 h-2 ${colorClass} rounded-full`;
}

function formatNumber(num, decimals = 2) {
  if (num === null || num === undefined || isNaN(num)) return '--';
  return Number(num).toFixed(decimals);
}

// =========================================================================
//                   TAB MANAGEMENT
// =========================================================================
function showTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));

  document.getElementById(`tab-${tabName}`).classList.remove('hidden');
  document.getElementById(`tab-btn-${tabName}`).classList.add('active');

  if (tabName === 'experiments') loadExperiments();
  if (tabName === 'analysis') loadExperimentsForComparison();

  lucide.createIcons();
}

function toggleMobileMenu() {
  document.getElementById('mobile-menu').classList.toggle('hidden');
}

function showTabAndClose(tabName) {
  showTab(tabName);
  document.getElementById('mobile-menu').classList.add('hidden');
}

// =========================================================================
//                   SOCKET.IO CONNECTION
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
    //console.log('[DEBUG] Received new data:', data);
    updateDashboard(data); // <-- Ini harus update semua nilai, termasuk mode
  });
  socket.on('newMetrics', (metrics) => updateMetricsDisplay(metrics));
}

// =========================================================================
//                   DASHBOARD UPDATES
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

function updateMetricsDisplay(metrics) {
  if (!metrics || !metrics.temperature || !metrics.turbidity) return;

  const t = metrics.temperature;
  const tb = metrics.turbidity;

  document.getElementById('metric-temp-overshoot').textContent = t.overshoot_percent > 0 ? `${formatNumber(t.overshoot_percent)}%` : '--';
  document.getElementById('metric-temp-settling').textContent = t.settling_time_s > 0 ? `${formatNumber(t.settling_time_s, 1)}s` : '--';
  document.getElementById('metric-temp-sse').textContent = `${formatNumber(t.steady_state_error, 3)}°C`;
  document.getElementById('metric-temp-peak').textContent = `${formatNumber(t.peak_value)}°C`;

  document.getElementById('metric-turb-overshoot').textContent = tb.overshoot_percent > 0 ? `${formatNumber(tb.overshoot_percent)}%` : '--';
  document.getElementById('metric-turb-settling').textContent = tb.settling_time_s > 0 ? `${formatNumber(tb.settling_time_s, 1)}s` : '--';
  document.getElementById('metric-turb-sse').textContent = `${formatNumber(tb.steady_state_error, 3)}%`;
  document.getElementById('metric-turb-peak').textContent = `${formatNumber(tb.peak_value)}%`;
}

// =========================================================================
//                   CHART MANAGEMENT
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
          // Dataset setpoint suhu - inisialisasi kosong
          label: 'Setpoint Suhu',
          data: [],
          borderColor: 'rgba(255, 0, 0, 1)', // Merah
          borderDash: [5, 5], // Garis putus-putus
          fill: false,
          pointRadius: 0, // Tidak ada titik
          yAxisID: 'y',
          hidden: true // Sembunyikan dulu
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
            // Perbaikan fungsi onClick untuk toggle dataset
            onClick: function(e, legendItem, legend) {
              const index = legendItem.datasetIndex;
              const ci = legend.chart;
              // Tambahkan pengecekan untuk menghindari error
              if (index !== undefined && ci && typeof ci.isDatasetVisible === 'function' && typeof ci.hide === 'function' && typeof ci.show === 'function') {
                if (ci.isDatasetVisible(index)) {
                  ci.hide(index);
                } else {
                  ci.show(index);
                }
              }
              // Jangan akses legend.chart.options.plugins.legend.labels[index].hidden
              // Chart.js otomatis mengelola status visible/hidden internal-nya
            }
          },
          tooltip: { backgroundColor: 'rgba(0, 0, 0, 0.8)', titleFont: { size: 13 }, bodyFont: { size: 12 }, padding: 12, cornerRadius: 8 }
        },
        scales: {
          y: { 
            min: 20, 
            max: 40, // <-- Sudah diganti dari 35 menjadi 40
            grid: { color: 'rgba(0, 0, 0, 0.05)' }, 
            title: { 
              display: true, 
              text: 'Temperature (°C)', 
              font: { size: 13, weight: '600' } 
            }
            // Tidak perlu tambahkan ticks.stepSize untuk suhu karena kamu ingin default
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
          // Dataset setpoint kekeruhan - inisialisasi kosong
          label: 'Setpoint Kekeruhan',
          data: [],
          borderColor: 'rgba(255, 0, 0, 1)', // Merah
          borderDash: [5, 5], // Garis putus-putus
          fill: false,
          pointRadius: 0, // Tidak ada titik
          yAxisID: 'y',
          hidden: true // Sembunyikan dulu
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
            // Perbaikan fungsi onClick untuk toggle dataset
            onClick: function(e, legendItem, legend) {
              const index = legendItem.datasetIndex;
              const ci = legend.chart;
              // Tambahkan pengecekan untuk menghindari error
              if (index !== undefined && ci && typeof ci.isDatasetVisible === 'function' && typeof ci.hide === 'function' && typeof ci.show === 'function') {
                if (ci.isDatasetVisible(index)) {
                  ci.hide(index);
                } else {
                  ci.show(index);
                }
              }
              // Jangan akses legend.chart.options.plugins.legend.labels[index].hidden
              // Chart.js otomatis mengelola status visible/hidden internal-nya
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
            // Tambahkan baris ini untuk mengatur interval ticks menjadi 5
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
  
  // Update chart suhu
  chartTemp.data.labels = labels;
  chartTemp.data.datasets[0].data = tempData; // Dataset 0 = suhu aktual
  // Update data setpoint (dataset 1), tetap dengan panjang yang sama
  chartTemp.data.datasets[1].data = Array(tempData.length).fill(currentTempSetpoint);
  chartTemp.update('none');

  // Update chart kekeruhan
  chartTurb.data.labels = labels;
  chartTurb.data.datasets[0].data = turbData; // Dataset 0 = kekeruhan aktual
  // Update data setpoint (dataset 1), tetap dengan panjang yang sama
  chartTurb.data.datasets[1].data = Array(turbData.length).fill(currentTurbSetpoint);
  chartTurb.update('none');
}

// =========================================================================
//                   CONTROL FUNCTIONS
// =========================================================================
async function updateControl() {
  const mode = document.getElementById('control-mode').value;
  const tempSp = parseFloat(document.getElementById('control-temp-sp').value);
  const turbSp = parseFloat(document.getElementById('control-turb-sp').value);

  if (isNaN(tempSp) || isNaN(turbSp)) {
    showNotification('Please enter valid numbers', 'error');
    return;
  }

  // Simpan nilai setpoint terbaru
  currentTempSetpoint = tempSp;
  currentTurbSetpoint = turbSp;

  const payload = { kontrol_aktif: mode, suhu_setpoint: tempSp, keruh_setpoint: turbSp };

  // Tambahkan PID parameters jika mode PID
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
    // Simpan nilai setpoint terbaru
    currentTempSetpoint = control.suhu_setpoint || 28.0;
    currentTurbSetpoint = control.keruh_setpoint || 10.0;
  } catch (error) {
    console.error('[Control] Load error:', error);
  }
}

// =========================================================================
//                   EXPERIMENT FUNCTIONS
// =========================================================================
async function startExperiment() {
  const mode = document.getElementById('exp-mode').value;
  const tempSp = parseFloat(document.getElementById('exp-temp-sp').value);
  const turbSp = parseFloat(document.getElementById('exp-turb-sp').value);
  const duration = parseInt(document.getElementById('exp-duration').value) * 60000;

  if (isNaN(tempSp) || isNaN(turbSp) || isNaN(duration)) {
    showNotification('Please fill all fields correctly', 'error');
    return;
  }

  const payload = { control_mode: mode, suhu_setpoint: tempSp, keruh_setpoint: turbSp, duration_ms: duration };

  if (mode === 'PID') {
    payload.pid_params = {
      kp_suhu: parseFloat(document.getElementById('exp-kp-temp').value),
      ki_suhu: parseFloat(document.getElementById('exp-ki-temp').value),
      kd_suhu: parseFloat(document.getElementById('exp-kd-temp').value),
      kp_keruh: parseFloat(document.getElementById('exp-kp-turb').value),
      ki_keruh: parseFloat(document.getElementById('exp-ki-turb').value),
      kd_keruh: parseFloat(document.getElementById('exp-kd-turb').value)
    };
  }

  try {
    console.log('[Experiment] Starting:', payload);
    const res = await fetch(`${API_BASE}/api/experiment/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = await res.json();
    console.log('[Experiment] Started:', result);
    showNotification(`Experiment started: ${result.experiment.experiment_id}`, 'success');
    currentExperimentId = result.experiment.experiment_id;
    setTimeout(() => { showTab('experiments'); loadExperiments(); }, 1000);
  } catch (error) {
    console.error('[Experiment] Start error:', error);
    showNotification('Failed to start experiment: ' + error.message, 'error');
  }
}

async function stopExperiment(id) {
  if (!confirm(`Stop experiment ${id}?`)) return;
  try {
    const res = await fetch(`${API_BASE}/api/experiment/stop/${id}`, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showNotification('Experiment stopped', 'success');
    setTimeout(() => loadExperiments(), 1000);
  } catch (error) {
    console.error('[Experiment] Stop error:', error);
    showNotification('Failed to stop experiment', 'error');
  }
}

async function loadExperiments() {
  try {
    const res = await fetch(`${API_BASE}/api/experiments`);
    const experiments = await res.json();
    const container = document.getElementById('experiment-list');
    if (experiments.length === 0) {
      container.innerHTML = '<p class="text-gray-500 text-center py-8">No experiments yet</p>';
      return;
    }

    container.innerHTML = '';
    experiments.forEach(exp => {
      const statusClass = {
        running: 'status-running',
        completed: 'status-completed',
        stopped: 'status-stopped',
        pending: 'status-pending'
      }[exp.status] || 'status-pending';

      const card = document.createElement('div');
      card.className = 'experiment-card border-2 rounded-xl p-4';
      card.innerHTML = `
        <div class="flex justify-between items-start mb-3">
          <div>
            <div class="flex items-center space-x-2 mb-2">
              <span class="font-bold text-lg">${exp.control_mode}</span>
              <span class="metric-badge ${statusClass}">${exp.status}</span>
            </div>
            <p class="text-sm text-gray-600 font-mono">${exp.experiment_id}</p>
          </div>
          <div class="text-right text-sm">
            <p class="text-gray-700 font-semibold">Temp: ${exp.config.suhu_setpoint}°C</p>
            <p class="text-gray-700 font-semibold">Turb: ${exp.config.keruh_setpoint}%</p>
          </div>
        </div>
        <div class="flex justify-between items-center text-xs text-gray-500">
          <span>${new Date(exp.started_at).toLocaleString('id-ID')}</span>
          <span>${exp.results.data_points_count || 0} data points</span>
        </div>
        <div class="mt-3 flex space-x-2">
          <button onclick="viewExperiment('${exp.experiment_id}')" 
                  class="flex-1 bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition">
            View Details
          </button>
          <button onclick="exportExperiment('${exp.experiment_id}')" 
                  class="flex-1 bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition">
            Export CSV
          </button>
          ${exp.status === 'running' ? `
            <button onclick="stopExperiment('${exp.experiment_id}')" 
                    class="flex-1 bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition">
              Stop
            </button>` : ''}
        </div>
      `;
      container.appendChild(card);
    });
    lucide.createIcons();
  } catch (error) {
    console.error('[Experiments] Load error:', error);
    document.getElementById('experiment-list').innerHTML = '<p class="text-red-500 text-center py-8">Error loading experiments</p>';
  }
}

async function viewExperiment(id) {
  try {
    const res = await fetch(`${API_BASE}/api/experiment/${id}`);
    const data = await res.json();
    const metricsHtml = `
      <strong>Temperature Metrics:</strong><br>
      Overshoot: ${formatNumber(data.experiment.results.temperature?.overshoot_percent)}%<br>
      Settling Time: ${formatNumber(data.experiment.results.temperature?.settling_time_s, 1)}s<br>
      SSE: ${formatNumber(data.experiment.results.temperature?.steady_state_error, 3)}°C<br><br>
      
      <strong>Turbidity Metrics:</strong><br>
      Overshoot: ${formatNumber(data.experiment.results.turbidity?.overshoot_percent)}%<br>
      Settling Time: ${formatNumber(data.experiment.results.turbidity?.settling_time_s, 1)}s<br>
      SSE: ${formatNumber(data.experiment.results.turbidity?.steady_state_error, 3)}%<br><br>
      
      <strong>Data Points:</strong> ${data.data_count}
    `;
    const popup = document.createElement('div');
    popup.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
    popup.innerHTML = `
      <div class="bg-white rounded-xl p-6 max-w-lg w-full shadow-2xl">
        <h3 class="text-xl font-bold mb-4">${id}</h3>
        <div class="text-sm leading-relaxed">${metricsHtml}</div>
        <button onclick="this.closest('.fixed').remove()" 
                class="mt-4 w-full bg-gray-600 hover:bg-gray-700 text-white py-2 rounded-lg font-medium">
          Close
        </button>
      </div>
    `;
    document.body.appendChild(popup);
  } catch (error) {
    console.error('[Experiment] View error:', error);
    showNotification('Error loading experiment details', 'error');
  }
}

function exportExperiment(id) {
  window.open(`${API_BASE}/api/experiment/${id}/export`, '_blank');
  showNotification('Downloading CSV...', 'info');
}

// =========================================================================
//                   ANALYSIS FUNCTIONS
// =========================================================================
async function loadExperimentsForComparison() {
  try {
    const res = await fetch(`${API_BASE}/api/experiments?status=completed`);
    const experiments = await res.json();
    const select1 = document.getElementById('compare-exp1');
    const select2 = document.getElementById('compare-exp2');
    [select1, select2].forEach(select => {
      select.innerHTML = '<option value="">-- Select Experiment --</option>';
      experiments.forEach(exp => {
        const option = document.createElement('option');
        option.value = exp.experiment_id;
        option.textContent = `${exp.control_mode} - ${new Date(exp.started_at).toLocaleDateString('id-ID')} - ${exp.experiment_id.slice(-8)}`;
        select.appendChild(option);
      });
    });
  } catch (error) {
    console.error('[Analysis] Load error:', error);
  }
}

async function compareExperiments() {
  const id1 = document.getElementById('compare-exp1').value;
  const id2 = document.getElementById('compare-exp2').value;
  if (!id1 || !id2) {
    showNotification('Please select both experiments', 'warning');
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/api/compare/${id1}/${id2}`);
    const comparison = await res.json();
    const container = document.getElementById('comparison-results');
    container.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="border-2 border-blue-200 rounded-xl p-5 bg-blue-50">
          <h4 class="font-bold text-lg mb-3 text-blue-800">${comparison.experiment1.info.control_mode}</h4>
          <div class="space-y-2 text-sm">
            <p><strong>ID:</strong> ${comparison.experiment1.info.experiment_id}</p>
            <p><strong>Data Points:</strong> ${comparison.experiment1.count}</p>
            <p><strong>Started:</strong> ${new Date(comparison.experiment1.info.started_at).toLocaleString('id-ID')}</p>
            <hr class="my-3">
            <p class="font-semibold text-gray-700">Temperature:</p>
            <p>Overshoot: ${formatNumber(comparison.experiment1.info.results.temperature.overshoot_percent)}%</p>
            <p>Settling: ${formatNumber(comparison.experiment1.info.results.temperature.settling_time_s, 1)}s</p>
            <p>SSE: ${formatNumber(comparison.experiment1.info.results.temperature.steady_state_error, 3)}°C</p>
            <hr class="my-3">
            <p class="font-semibold text-gray-700">Turbidity:</p>
            <p>Overshoot: ${formatNumber(comparison.experiment1.info.results.turbidity.overshoot_percent)}%</p>
            <p>Settling: ${formatNumber(comparison.experiment1.info.results.turbidity.settling_time_s, 1)}s</p>
            <p>SSE: ${formatNumber(comparison.experiment1.info.results.turbidity.steady_state_error, 3)}%</p>
          </div>
        </div>
        <div class="border-2 border-green-200 rounded-xl p-5 bg-green-50">
          <h4 class="font-bold text-lg mb-3 text-green-800">${comparison.experiment2.info.control_mode}</h4>
          <div class="space-y-2 text-sm">
            <p><strong>ID:</strong> ${comparison.experiment2.info.experiment_id}</p>
            <p><strong>Data Points:</strong> ${comparison.experiment2.count}</p>
            <p><strong>Started:</strong> ${new Date(comparison.experiment2.info.started_at).toLocaleString('id-ID')}</p>
            <hr class="my-3">
            <p class="font-semibold text-gray-700">Temperature:</p>
            <p>Overshoot: ${formatNumber(comparison.experiment2.info.results.temperature.overshoot_percent)}%</p>
            <p>Settling: ${formatNumber(comparison.experiment2.info.results.temperature.settling_time_s, 1)}s</p>
            <p>SSE: ${formatNumber(comparison.experiment2.info.results.temperature.steady_state_error, 3)}°C</p>
            <hr class="my-3">
            <p class="font-semibold text-gray-700">Turbidity:</p>
            <p>Overshoot: ${formatNumber(comparison.experiment2.info.results.turbidity.overshoot_percent)}%</p>
            <p>Settling: ${formatNumber(comparison.experiment2.info.results.turbidity.settling_time_s, 1)}s</p>
            <p>SSE: ${formatNumber(comparison.experiment2.info.results.turbidity.steady_state_error, 3)}%</p>
          </div>
        </div>
      </div>
    `;
    showNotification('Comparison loaded', 'success');
  } catch (error) {
    console.error('[Comparison] Error:', error);
    showNotification('Comparison failed', 'error');
  }
}

// =========================================================================
//                   EVENT LISTENERS
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
  console.log('[App] 🚀 Initializing...');
  initCharts();
  connectSocket();
  loadControlSettings();
  lucide.createIcons();
  console.log('[App] ✅ Ready');
});
 document.getElementById('control-mode').addEventListener('change', (e) => {
    const pidParams = document.getElementById('pid-params-control');
    pidParams.classList.toggle('hidden', e.target.value !== 'PID');
  });
document.getElementById('exp-mode').addEventListener('change', (e) => {
  const pidParams = document.getElementById('pid-params');
  pidParams.classList.toggle('hidden', e.target.value !== 'PID');
});

// Cleanup
window.addEventListener('beforeunload', () => {
  if (socket) socket.disconnect();
  if (chartTemp) chartTemp.destroy();
  if (chartTurb) chartTurb.destroy();
});