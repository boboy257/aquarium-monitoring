// Base URL untuk API
//const API_BASE_URL = 'http://localhost:3000';
const API_BASE_URL = ''; // Ganti dengan IP kamu

// Deklarasi variabel di awal
var chartSuhu; // Chart.js instance untuk suhu
var chartKekeruhan; // Chart.js instance untuk kekeruhan
var socket;
var dataBuffer = [];

// Fungsi connect socket
function connectSocket() {
  console.log('Mencoba connect socket...');
  socket = io(API_BASE_URL, {
    transports: ['websocket', 'polling'],
    timeout: 20000
  });

  socket.on('connect', function() {
    console.log('Connected to server via Socket.io');
  });

  socket.on('disconnect', function(reason) {
    console.log('Disconnected from server:', reason);
    setTimeout(connectSocket, 5000); // Coba connect ulang setiap 5 detik
  });

  socket.on('connect_error', function(error) {
    console.error('Socket connection error:', error);
    alert('Gagal terhubung ke server. Pastikan backend berjalan di http://localhost:3000');
  });

  // Handler untuk data baru
  socket.on('newData', function(data) {
    console.log('Data diterima (real-time):', data);
    // Update status
    document.getElementById('suhu-value').textContent = data.suhu !== undefined ? data.suhu.toFixed(2) + '°C' : 'N/A';
    document.getElementById('turbidity-value').textContent = data.turbidity_persen !== undefined ? data.turbidity_persen.toFixed(2) + '%' : 'N/A';
    document.getElementById('kontrol-value').textContent = data.kontrol_aktif || 'N/A';
    document.getElementById('pwm-value').textContent = data.pwm_heater !== undefined ? data.pwm_heater + '%' : 'N/A';
    document.getElementById('pwm-pompa-value').textContent = data.pwm_pompa !== undefined ? data.pwm_pompa + '%' : 'N/A'; // Tambahkan baris ini

    // Validasi timestamp
    var timestamp = new Date(data.timestamp);
    if (isNaN(timestamp.getTime())) {
      // Jika timestamp tidak valid, gunakan waktu sekarang
      timestamp = new Date();
    }

    // Add to buffer
    dataBuffer.push({
      timestamp: timestamp,
      suhu: data.suhu,
      turbidity: data.turbidity_persen, // Gunakan field baru
      pwm_heater: data.pwm_heater,      // Tambahkan field baru
      pwm_pompa: data.pwm_pompa,        // Tambahkan field baru
      kontrol: data.kontrol_aktif
    });

    // Keep only last 50 data points
    if (dataBuffer.length > 50) {
      dataBuffer.shift();
    }

    // Update chart-chart if they exist
    if (chartSuhu && chartKekeruhan) {
      console.log('Mencoba update chart-chart (real-time)...');
      try {
        var labels = dataBuffer.map(function(d) {
          return d.timestamp.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        });
        var suhuData = dataBuffer.map(function(d) { return d.suhu; });
        // Gunakan field baru di chart
        var kekeruhanData = dataBuffer.map(function(d) { return d.turbidity; }); // Ambil dari buffer yang sudah diperbarui

        // Ambil setpoint dari form
        var setpointValue = parseFloat(document.getElementById('setpoint').value);
        var setpointKeruhValue = parseFloat(document.getElementById('keruh_setpoint').value); // Ambil dari form

        // Update chartSuhu
        chartSuhu.data.labels = labels;
        chartSuhu.data.datasets[0].data = suhuData;
        chartSuhu.data.datasets[1].data = Array(suhuData.length).fill(setpointValue); // Update garis setpoint
        chartSuhu.update('none');

        // Update chartKekeruhan
        chartKekeruhan.data.labels = labels;
        chartKekeruhan.data.datasets[0].data = kekeruhanData;
        // Update garis setpoint kekeruhan
        chartKekeruhan.data.datasets[1].data = Array(kekeruhanData.length).fill(setpointKeruhValue); // Gunakan input form
        chartKekeruhan.update('none');

        console.log('Chart-chart updated successfully (real-time)');
      } catch (error) {
        console.error('Error updating chart-chart (real-time):', error);
      }
    }
  });
}

// Load initial control settings
async function loadControl() {
  console.log('Mencoba load control...');
  try {
    var res = await fetch('/api/control');
    console.log('Response status:', res.status);
    var control = await res.json();
    console.log('Control ', control);

    document.getElementById('mode').value = control.kontrol_aktif;
    document.getElementById('setpoint').value = control.suhu_setpoint;
    document.getElementById('kp').value = control.kp_suhu; // Ambil dari backend
    document.getElementById('ki').value = control.ki_suhu; // Ambil dari backend
    document.getElementById('kd').value = control.kd_suhu; // Ambil dari backend
    document.getElementById('keruh_setpoint').value = control.keruh_setpoint; // Ambil dari backend
    document.getElementById('kp_keruh').value = control.kp_keruh; // Ambil dari backend
    document.getElementById('ki_keruh').value = control.ki_keruh; // Ambil dari backend
    document.getElementById('kd_keruh').value = control.kd_keruh; // Ambil dari backend
  } catch (error) {
    console.error('Error loading control:', error);
    alert('Gagal mengakses backend. Pastikan server berjalan di http://localhost:3000');
  }
}

// Save Control Function (Harus di-define di global scope)
async function saveControl() {
  var kontrol_aktif = document.getElementById('mode').value;
  var suhu_setpoint = parseFloat(document.getElementById('setpoint').value);
  var kp_suhu = parseFloat(document.getElementById('kp').value); // Ganti nama variabel
  var ki_suhu = parseFloat(document.getElementById('ki').value); // Ganti nama variabel
  var kd_suhu = parseFloat(document.getElementById('kd').value); // Ganti nama variabel
  var keruh_setpoint = parseFloat(document.getElementById('keruh_setpoint').value); // Ambil dari form
  var kp_keruh = parseFloat(document.getElementById('kp_keruh').value); // Ambil dari form
  var ki_keruh = parseFloat(document.getElementById('ki_keruh').value); // Ambil dari form
  var kd_keruh = parseFloat(document.getElementById('kd_keruh').value); // Ambil dari form

  console.log('Mengirim control:', { kontrol_aktif, suhu_setpoint, kp_suhu, ki_suhu, kd_suhu, keruh_setpoint, kp_keruh, ki_keruh, kd_keruh }); // Log diperbarui
  try {
    var res = await fetch(API_BASE_URL + '/api/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kontrol_aktif: kontrol_aktif,
        suhu_setpoint: suhu_setpoint,
        kp_suhu: kp_suhu, // Kirim dengan nama field baru
        ki_suhu: ki_suhu, // Kirim dengan nama field baru
        kd_suhu: kd_suhu, // Kirim dengan nama field baru
        keruh_setpoint: keruh_setpoint, // Kirim dengan nama field baru
        kp_keruh: kp_keruh, // Kirim dengan nama field baru
        ki_keruh: ki_keruh, // Kirim dengan nama field baru
        kd_keruh: kd_keruh  // Kirim dengan nama field baru
      })
    });
    console.log('Response status:', res.status);

    if (res.status === 200) {
      alert('Control updated and sent to ESP32');
      // Muat ulang kontrol untuk konfirmasi
      loadControl();
    } else {
      alert('Gagal mengirim control ke ESP32. Status: ' + res.status);
    }
  } catch (error) {
    console.error('Error saving control:', error);
    alert('Gagal mengirim control ke backend: ' + error.message);
  }
}

// Export CSV Function (Harus di-define di global scope)
async function exportCSV() {
  var startDate = document.getElementById('start-date').value;
  var endDate = document.getElementById('end-date').value;

  var url = API_BASE_URL + '/api/export';
  if (startDate && endDate) {
    url += '?start=' + startDate + '&end=' + endDate;
  } else {
    // Jika tidak ada filter, export semua data
    alert('Silakan pilih rentang tanggal untuk export data.');
    return;
  }

  console.log('Exporting CSV:', url);
  window.open(url);
}

// Fungsi untuk load data awal (tanpa filter)
async function loadInitialData() {
  console.log('Mencoba load data awal...');

  // Ambil data terakhir 50 dari API
  var url = API_BASE_URL + '/api/data';

  console.log('Requesting:', url);
  try {
    var res = await fetch(url);
    console.log('Response status:', res.status);
    var data = await res.json();
    console.log('Data received:', data.length, 'items');

    if (data.length === 0) {
      // Jika tidak ada data, buat chart-chart kosong
      createChartSuhu([], [], 28.0); // Default setpoint
      createChartKekeruhan([], [], 5.0); // Default setpoint keruh
      return;
    }

    // Validasi timestamp di data dari API
    var labels = data.map(function(d) {
      var timestamp = new Date(d.timestamp);
      if (isNaN(timestamp.getTime())) {
        timestamp = new Date();
      }
      return timestamp.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    });

    var suhuData = data.map(function(d) { return d.suhu; });
    // Ambil data dari API - gunakan field baru
    var turbidityData = data.map(function(d) { return d.turbidity_persen; }); // Gunakan field baru

    // Update buffer - gunakan field baru
    dataBuffer = data.map(function(d) {
      return {
        timestamp: new Date(d.timestamp),
        suhu: d.suhu,
        turbidity: d.turbidity_persen, // Gunakan field baru
        pwm_heater: d.pwm_heater,      // Tambahkan field baru
        pwm_pompa: d.pwm_pompa,        // Tambahkan field baru
        kontrol: d.kontrol_aktif
      };
    });

    // Ambil setpoint dari form
    var setpointValue = parseFloat(document.getElementById('setpoint').value);
    var setpointKeruhValue = parseFloat(document.getElementById('keruh_setpoint').value); // Ambil dari form

    // Buat chart-chart
    createChartSuhu(labels, suhuData, setpointValue);
    createChartKekeruhan(labels, turbidityData, setpointKeruhValue); // Gunakan setpoint dari form
  } catch (error) {
    console.error('Error loading initial ', error);
    // Buat chart-chart kosong jika error
    createChartSuhu([], [], 28.0); // Default
    createChartKekeruhan([], [], 5.0); // Default
  }
}

// ===================================================
// === FUNGSI UNTUK MEMBUAT GRAFIK SUHU =============
// ===================================================
function createChartSuhu(labels, suhuData, setpointValue) {
  if (chartSuhu) {
    chartSuhu.destroy(); // Hancurkan chart lama
  }

  var ctx = document.getElementById('chartSuhu');
  if (!ctx) {
    console.error('Canvas chartSuhu tidak ditemukan!');
    return;
  }
  var ctx2d = ctx.getContext('2d');

  var config = {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Suhu (°C)',
          data: suhuData,
          borderColor: 'rgb(59, 130, 246)', // Biru
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.2,
          yAxisID: 'y',
          pointRadius: 1,
          pointHoverRadius: 5
        },
        {
          label: 'Setpoint Suhu',
          data:Array(suhuData.length).fill(setpointValue), // Garis horizontal
          borderColor: 'rgba(245, 3, 3, 1)', // Merah
          borderDash: [5, 5], // Garis putus-putus
          fill: false,
          pointRadius: 0,
          yAxisID: 'y'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        tooltip: { mode: 'index', intersect: false }
      },
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { grid: { display: false } },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          min: 0,
          max: 40, // Sesuaikan range suhu
          title: { display: true, text: 'Suhu (°C)' },
          grid: { color: 'rgba(0, 0, 0, 0.05)' }
        }
      }
    }
  };

  chartSuhu = new Chart(ctx2d, config);
  console.log('Chart Suhu created successfully');
}
// ===================================================
// === AKHIR FUNGSI GRAFIK SUHU =====================
// ===================================================


// ===================================================
// === FUNGSI UNTUK MEMBUAT GRAFIK KEKERUHAN =======
// ===================================================
function createChartKekeruhan(labels, kekeruhanData, setpointKeruhValue) { // Tambahkan parameter setpoint
  if (chartKekeruhan) {
    chartKekeruhan.destroy(); // Hancurkan chart lama
  }

  var ctx = document.getElementById('chartKekeruhan');
  if (!ctx) {
    console.error('Canvas chartKekeruhan tidak ditemukan!');
    return;
  }
  var ctx2d = ctx.getContext('2d');

  var config = {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Kekeruhan Air (%)',
          data: kekeruhanData,
          borderColor: 'rgb(245, 158, 11)', // Amber
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          fill: false, // Atau true jika ingin area terisi
          tension: 0.2,
          yAxisID: 'y',
          pointRadius: 1,
          pointHoverRadius: 5
        },
        // Tambahkan garis setpoint kekeruhan
        {
          label: 'Setpoint Kekeruhan',
          data: Array(kekeruhanData.length).fill(setpointKeruhValue), // Gunakan setpoint dari parameter
          borderColor: 'rgba(245, 3, 3, 1)', // Merah
          borderDash: [5, 5], // Garis putus-putus
          fill: false,
          pointRadius: 0,
          yAxisID: 'y'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        tooltip: { mode: 'index', intersect: false }
      },
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { grid: { display: false } },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          min: 0,
          max: 100, // Karena persen
          title: { display: true, text: 'Kekeruhan (%)' },
          grid: { color: 'rgba(0, 0, 0, 0.05)' }
        }
      }
    }
  };

  chartKekeruhan = new Chart(ctx2d, config);
  console.log('Chart Kekeruhan created successfully');
}
// ===================================================
// === AKHIR FUNGSI GRAFIK KEKERUHAN ================
// ===================================================


// Panggil fungsi connect socket
console.log('Memulai dashboard...');
connectSocket();

// Load initial data and control settings
loadControl();
loadInitialData();