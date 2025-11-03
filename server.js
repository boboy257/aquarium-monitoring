const express = require('express');
const mongoose = require('mongoose');
const mqtt = require('mqtt');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const Data = require('./models/Data');
const Control = require('./models/Control'); // Pastikan model ini ada

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files dari folder frontend
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

// CORS untuk frontend
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.use(express.json());

// MongoDB connection
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/aquarium';
mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// MQTT Client
const client = mqtt.connect('mqtt://broker.hivemq.com');

client.on('connect', () => {
  console.log('Connected to MQTT broker');
  client.subscribe('unhas/informatika/aquarium/data');
});

client.on('message', async (topic, message) => {
  if (topic === 'unhas/informatika/aquarium/data') {
    const data = JSON.parse(message.toString());
    console.log('Payload diterima (dari ESP32):', data); // Debug log
    await Data.create(data);
    // Emit ke semua klien via socket
    io.emit('newData', data);
    console.log('Data dikirim ke socket:', data);
  }
});

// API Routes
app.get('/api/data', async (req, res) => {
  const { start, end } = req.query;
  let filter = {};

  if (start && end) {
    filter.timestamp = {
      $gte: new Date(start),
      $lte: new Date(end)
    };
  }

  const data = await Data.find(filter).sort({ timestamp: -1 }).limit(100);
  res.json(data);
});

app.get('/api/control', async (req, res) => {
  const control = await Control.findOne();
  // Kembalikan nilai default jika tidak ditemukan
  res.json(control || {
    kontrol_aktif: "Fuzzy",
    suhu_setpoint: 28.0,
    kp_suhu: 25,
    ki_suhu: 1.5,
    kd_suhu: 4,
    keruh_setpoint: 10.0,
    kp_keruh: 10,
    ki_keruh: 0.5,
    kd_keruh: 1
  });
});

app.post('/api/control', async (req, res) => {
  // Ambil semua parameter dari body frontend
  const { kontrol_aktif, suhu_setpoint, kp_suhu, ki_suhu, kd_suhu, keruh_setpoint, kp_keruh, ki_keruh, kd_keruh } = req.body;

  // Validasi sederhana (opsional)
  if (!['Fuzzy', 'PID'].includes(kontrol_aktif)) {
    return res.status(400).json({ error: 'kontrol_aktif harus Fuzzy atau PID' });
  }
  if (typeof suhu_setpoint !== 'number' || typeof kp_suhu !== 'number' || typeof ki_suhu !== 'number' || typeof kd_suhu !== 'number' ||
      typeof keruh_setpoint !== 'number' || typeof kp_keruh !== 'number' || typeof ki_keruh !== 'number' || typeof kd_keruh !== 'number') {
    return res.status(400).json({ error: 'Parameter kontrol harus berupa angka' });
  }

  // Simpan ke database (gunakan nama field yang sesuai)
  const updatedControl = await Control.findOneAndUpdate(
    {},
    { kontrol_aktif, suhu_setpoint, kp_suhu, ki_suhu, kd_suhu, keruh_setpoint, kp_keruh, ki_keruh, kd_keruh },
    { upsert: true, new: true } // upsert: buat jika tidak ada, new: kembalikan dokumen baru
  );

  // --- KIRIM SEMUA PARAMETER KE ESP32 MELALUI MQTT ---
  const controlPayload = {
    kontrol_aktif: updatedControl.kontrol_aktif,
    suhu_setpoint: updatedControl.suhu_setpoint,
    kp_suhu: updatedControl.kp_suhu,
    ki_suhu: updatedControl.ki_suhu,
    kd_suhu: updatedControl.kd_suhu,
    keruh_setpoint: updatedControl.keruh_setpoint,
    kp_keruh: updatedControl.kp_keruh,
    ki_keruh: updatedControl.ki_keruh,
    kd_keruh: updatedControl.kd_keruh
  };

  client.publish('unhas/informatika/aquarium/mode', JSON.stringify(controlPayload));
  console.log('Control payload dikirim ke ESP32 via MQTT:', controlPayload);
  // --- END OF MQTT SEND ---

  res.json({ message: 'Control updated and sent to ESP32', data: updatedControl });
});

// API untuk export ke CSV (diperbarui untuk mencakup data dari dua loop kontrol)
app.get('/api/export', async (req, res) => {
  const { start, end } = req.query;
  let filter = {};

  if (start && end) {
    filter.timestamp = {
      $gte: new Date(start),
      $lte: new Date(end)
    };
  }

  const data = await Data.find(filter).sort({ timestamp: 1 });

  if (data.length === 0) {
    return res.status(404).json({ message: 'No data found' });
  }

  // Header CSV diperbarui: Gunakan field baru
  let csv = 'Timestamp,Suhu,Kontrol Aktif,PWM Heater,PWM Pompa,Turbidity Persen\n'; // Urutan: Timestamp, Suhu, Kontrol, PWM Heater, PWM Pompa, Turbidity Persen
  data.forEach(item => {
    // Konversi ke waktu lokal WITA (GMT+8)
    const witaTime = new Date(item.timestamp.getTime() + 8 * 3600000); // Tambah 8 jam

    // Format waktu dalam format ISO (dikenal Excel)
    const formattedTime = witaTime.toISOString().replace('T', ' ').substring(0, 19);

    // Urutan data harus sesuai header: Timestamp, Suhu, Kontrol Aktif, PWM Heater, PWM Pompa, Turbidity Persen
    // Gunakan field-field baru dari payload MQTT
    csv += `"${formattedTime}","${item.suhu}","${item.kontrol_aktif}","${item.pwm_heater}","${item.pwm_pompa}","${item.turbidity_persen}"\n`;
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="aquarium_data_wita.csv"');
  res.send(csv);
});

// Serve index.html jika request ke root
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// =============================
// Fungsi untuk dapatkan IP lokal
function getLocalIP() {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Route untuk tampilkan QR Code dan IP
app.get('/info', (req, res) => {
  const localIP = getLocalIP();
  const url = `http://${localIP}:3000`;

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <title>Info Akses Dashboard</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body {
        font-family: Arial, sans-serif;
        text-align: center;
        padding: 50px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }
      .container {
        background: rgba(255,255,255,0.1);
        padding: 30px;
        border-radius: 15px;
        backdrop-filter: blur(10px);
        box-shadow: 0 8px 32px rgba(0,0,0,0.1);
      }
      h1 { margin-bottom: 30px; }
      .qr-code {
        margin: 20px 0;
        padding: 20px;
        background: white;
        display: inline-block;
        border-radius: 10px;
      }
      .url {
        background: rgba(255,255,255,0.2);
        padding: 15px;
        border-radius: 8px;
        margin: 20px 0;
        word-break: break-all;
      }
      .btn {
        background: #4CAF50;
        color: white;
        padding: 12px 24px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 16px;
        margin: 10px;
      }
      .btn:hover { background: #45a049; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>🔗 Akses Dashboard Aquarium</h1>

      <div class="qr-code">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}" alt="QR Code">
      </div>

      <div class="url">
        <strong>🌐 URL untuk akses:</strong><br>
        <code>${url}</code>
      </div>

      <p>📱 Scan QR Code di atas atau ketik URL di browser HP kamu</p>

      <button class="btn" onclick="location.reload()">🔄 Refresh IP</button>
      <button class="btn" onclick="window.open('${url}')">🚀 Buka Dashboard</button>

      <p style="margin-top: 30px; font-size: 14px;">
        Pastikan HP dan komputer terhubung ke WiFi yang sama
      </p>
    </div>
  </body>
  </html>
  `;

  res.send(html);
});

// =============================
server.listen(3000, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log(`
╔══════════════════════════════════════════════════════════╗
║                    🐠 AQUARIUM CONTROL                   ║
╠══════════════════════════════════════════════════════════╣
║ 🖥️  Local:    http://localhost:3000                    ║
║ 🌐 Network:   http://${localIP}:3000                   ║
║ 🔗 Info Page: http://${localIP}:3000/info              ║
╚══════════════════════════════════════════════════════════╝
  `);
});