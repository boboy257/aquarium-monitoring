// Global State
    let chartTemp, chartTurb, socket;
    let dataBuffer = [];
    let currentExperimentId = null;

    // Tab Management
    function showTab(tabName) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
      document.getElementById(`tab-${tabName}`).classList.remove('hidden');

      if (tabName === 'experiments') {
        loadExperiments();
      }
      if (tabName === 'analysis') {
        loadExperimentsForComparison();
      }
    }

    // Toggle PID parameters visibility
    document.getElementById('exp-mode').addEventListener('change', (e) => {
      document.getElementById('pid-params').classList.toggle('hidden', e.target.value !== 'PID');
    });

    // Socket.IO Connection
    function connectSocket() {
      socket = io('', { transports: ['websocket', 'polling'] });

      socket.on('connect', () => {
        console.log('[Socket] Connected');
        showNotification('Connected to server', 'success');
      });

      socket.on('newData', (data) => {
        updateDashboard(data);
      });

      socket.on('newMetrics', (metrics) => {
        updateMetrics(metrics);
      });

      socket.on('disconnect', () => {
        showNotification('Disconnected from server', 'error');
      });
    }

    // Update Dashboard
    function updateDashboard(data) {
      document.getElementById('current-temp').textContent = `${data.suhu?.toFixed(2) || '--'}°C`;
      document.getElementById('current-turb').textContent = `${data.turbidity_persen?.toFixed(2) || '--'}%`;
      document.getElementById('current-mode').textContent = data.kontrol_aktif || '--';
      document.getElementById('current-pwm-heater').textContent = `${data.pwm_heater?.toFixed(1) || '--'}%`;
      document.getElementById('current-pwm-pump').textContent = `${data.pwm_pompa?.toFixed(1) || '--'}%`;

      // Add to buffer
      dataBuffer.push({
        time: new Date().toLocaleTimeString('id-ID'),
        temp: data.suhu || 0,
        turb: data.turbidity_persen || 0
      });

      if (dataBuffer.length > 50) dataBuffer.shift();

      updateCharts();
    }

    // Update Metrics Display
    function updateMetrics(metrics) {
      if (!metrics.temperature || !metrics.turbidity) return;

      const t = metrics.temperature;
      const tu = metrics.turbidity;

      document.getElementById('metric-temp-overshoot').textContent = `${t.overshoot_percent?.toFixed(2) || 0}%`;
      document.getElementById('metric-temp-settling').textContent = t.settling_time_s > 0 ? `${t.settling_time_s.toFixed(1)}s` : '--';
      document.getElementById('metric-temp-sse').textContent = `${t.steady_state_error?.toFixed(3) || 0}°C`;
      document.getElementById('metric-temp-peak').textContent = `${t.peak_value?.toFixed(2) || 0}°C`;

      document.getElementById('metric-turb-overshoot').textContent = `${tu.overshoot_percent?.toFixed(2) || 0}%`;
      document.getElementById('metric-turb-settling').textContent = tu.settling_time_s > 0 ? `${tu.settling_time_s.toFixed(1)}s` : '--';
      document.getElementById('metric-turb-sse').textContent = `${tu.steady_state_error?.toFixed(3) || 0}%`;
      document.getElementById('metric-turb-peak').textContent = `${tu.peak_value?.toFixed(2) || 0}%`;
    }

    // Update Charts
    function updateCharts() {
      if (!chartTemp || !chartTurb || dataBuffer.length === 0) return;

      const labels = dataBuffer.map(d => d.time);
      const tempData = dataBuffer.map(d => d.temp);
      const turbData = dataBuffer.map(d => d.turb);

      chartTemp.data.labels = labels;
      chartTemp.data.datasets[0].data = tempData;
      chartTemp.update('none');

      chartTurb.data.labels = labels;
      chartTurb.data.datasets[0].data = turbData;
      chartTurb.update('none');
    }

    // Initialize Charts
    function initCharts() {
      const ctxTemp = document.getElementById('chartTemp').getContext('2d');
      chartTemp = new Chart(ctxTemp, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'Temperature (°C)',
            data: [],
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            tension: 0.4,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { min: 0, max: 40 }
          },
          animation: { duration: 0 }
        }
      });

      const ctxTurb = document.getElementById('chartTurb').getContext('2d');
      chartTurb = new Chart(ctxTurb, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'Turbidity (%)',
            data: [],
            borderColor: 'rgb(245, 158, 11)',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            tension: 0.4,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { min: 0, max: 100 }
          },
          animation: { duration: 0 }
        }
      });
    }

    // Start Experiment
    async function startExperiment() {
      const mode = document.getElementById('exp-mode').value;
      const tempSp = parseFloat(document.getElementById('exp-temp-sp').value);
      const turbSp = parseFloat(document.getElementById('exp-turb-sp').value);
      const duration = parseInt(document.getElementById('exp-duration').value) * 60000;

      const payload = {
        control_mode: mode,
        suhu_setpoint: tempSp,
        keruh_setpoint: turbSp,
        duration_ms: duration
      };

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
        const res = await fetch('/api/experiment/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const result = await res.json();
        if (result.success) {
          showNotification('Experiment started!', 'success');
          currentExperimentId = result.experiment.experiment_id;
          setTimeout(() => loadExperiments(), 1000);
        } else {
          showNotification('Failed to start experiment', 'error');
        }
      } catch (error) {
        showNotification('Error: ' + error.message, 'error');
      }
    }

    // Load Experiments
    async function loadExperiments() {
      try {
        const res = await fetch('/api/experiments');
        const experiments = await res.json();

        const container = document.getElementById('experiment-list');
        container.innerHTML = '';

        experiments.forEach(exp => {
          const card = document.createElement('div');
          card.className = 'experiment-card border rounded-lg p-4 hover:shadow-md cursor-pointer';
          card.onclick = () => viewExperiment(exp.experiment_id);

          const statusClass = exp.status === 'running' ? 'status-running' :
            exp.status === 'completed' ? 'status-completed' : 'status-stopped';

          card.innerHTML = `
            <div class="flex justify-between items-start">
              <div>
                <div class="flex items-center space-x-2 mb-2">
                  <span class="font-semibold">${exp.control_mode}</span>
                  <span class="metric-badge ${statusClass}">${exp.status}</span>
                </div>
                <p class="text-sm text-gray-600">ID: ${exp.experiment_id}</p>
                <p class="text-xs text-gray-500 mt-1">Started: ${new Date(exp.started_at).toLocaleString('id-ID')}</p>
              </div>
              <div class="text-right text-sm">
                <p class="text-gray-600">Temp: ${exp.config.suhu_setpoint}°C</p>
                <p class="text-gray-600">Turb: ${exp.config.keruh_setpoint}%</p>
              </div>
            </div>
          `;

          container.appendChild(card);
        });
      } catch (error) {
        console.error('Load experiments error:', error);
      }
    }

    // View Experiment Details
    async function viewExperiment(id) {
      try {
        const res = await fetch(`/api/experiment/${id}`);
        const data = await res.json();

        alert(`Experiment: ${id}\n\nData Points: ${data.data.length}\n\nExport: /api/experiment/${id}/export`);
      } catch (error) {
        showNotification('Error loading experiment', 'error');
      }
    }

    // Load Experiments for Comparison
    async function loadExperimentsForComparison() {
      try {
        const res = await fetch('/api/experiments?status=completed');
        const experiments = await res.json();

        const select1 = document.getElementById('compare-exp1');
        const select2 = document.getElementById('compare-exp2');

        [select1, select2].forEach(select => {
          select.innerHTML = '<option value="">-- Select --</option>';
          experiments.forEach(exp => {
            const option = document.createElement('option');
            option.value = exp.experiment_id;
            option.textContent = `${exp.control_mode} - ${new Date(exp.started_at).toLocaleDateString()}`;
            select.appendChild(option);
          });
        });
      } catch (error) {
        console.error('Load comparison error:', error);
      }
    }

    // Compare Experiments
    async function compareExperiments() {
      const id1 = document.getElementById('compare-exp1').value;
      const id2 = document.getElementById('compare-exp2').value;

      if (!id1 || !id2) {
        showNotification('Please select both experiments', 'error');
        return;
      }

      try {
        const res = await fetch(`/api/compare/${id1}/${id2}`);
        const comparison = await res.json();

        const container = document.getElementById('comparison-results');
        container.innerHTML = `
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="border rounded-lg p-4">
              <h4 class="font-semibold mb-3">${comparison.experiment1.info.control_mode}</h4>
              <p class="text-sm">Data Points: ${comparison.experiment1.data.length}</p>
              <p class="text-sm">Temp Overshoot: ${comparison.experiment1.info.results?.temperature?.overshoot_percent?.toFixed(2) || 'N/A'}%</p>
              <p class="text-sm">Temp Settling: ${comparison.experiment1.info.results?.temperature?.settling_time_s?.toFixed(2) || 'N/A'}s</p>
            </div>
            <div class="border rounded-lg p-4">
              <h4 class="font-semibold mb-3">${comparison.experiment2.info.control_mode}</h4>
              <p class="text-sm">Data Points: ${comparison.experiment2.data.length}</p>
              <p class="text-sm">Temp Overshoot: ${comparison.experiment2.info.results?.temperature?.overshoot_percent?.toFixed(2) || 'N/A'}%</p>
              <p class="text-sm">Temp Settling: ${comparison.experiment2.info.results?.temperature?.settling_time_s?.toFixed(2) || 'N/A'}s</p>
            </div>
          </div>
        `;
      } catch (error) {
        showNotification('Comparison failed', 'error');
      }
    }

    // Notification System
    function showNotification(message, type = 'info') {
      const colors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        info: 'bg-blue-500'
      };

      const notif = document.createElement('div');
      notif.className = `fixed top-4 right-4 ${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg z-50`;
      notif.textContent = message;
      document.body.appendChild(notif);

      setTimeout(() => notif.remove(), 3000);
    }

    // Initialize
    document.addEventListener('DOMContentLoaded', () => {
      initCharts();
      connectSocket();
      lucide.createIcons();
      console.log('[Research Dashboard] Initialized');
    });