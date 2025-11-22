const express = require('express');
const mongoose = require('mongoose');
const mqtt = require('mqtt');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

// Models
const ResearchData = require('./models/ResearchData');
const Control = require('./models/Control');

// Config
const CONFIG = {
  PORT: process.env.PORT || 3000,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/aquarium_research',
  MQTT_BROKER: 'mqtt://broker.hivemq.com',
  MQTT_TOPIC_DATA: 'unhas/informatika/aquarium/data',
  MQTT_TOPIC_MODE: 'unhas/informatika/aquarium/mode',
  MQTT_TOPIC_METRICS: 'unhas/informatika/aquarium/metrics' // Topic ini tidak akan terpakai lagi
};

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// [MODIFIKASI] Menambahkan definisi variabel frontendPath agar tidak ReferenceError
const frontendPath = path.join(__dirname, 'frontend');
app.use(express.static(frontendPath));

console.log('[Static] Serving from:', frontendPath);

// =========================================================================
//                MONGODB CONNECTION
// =========================================================================
mongoose.connect(CONFIG.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('[MongoDB] ✅ Connected'))
.catch(err => {
  console.error('[MongoDB] ❌ Error:', err.message);
  process.exit(1);
});

// =========================================================================
//                MQTT CLIENT
// =========================================================================
const mqttClient = mqtt.connect(CONFIG.MQTT_BROKER, {
  reconnectPeriod: 5000,
  keepalive: 60
});

// [MODIFIKASI] Menambahkan Logika 'Anti Lupa' saat Server Baru Nyala
mqttClient.on('connect', async () => {
  console.log('[MQTT] ✅ Connected to broker');
  
  // Subscribe Data Sensor
  mqttClient.subscribe([
    CONFIG.MQTT_TOPIC_DATA,
    CONFIG.MQTT_TOPIC_MODE 
  ], { qos: 1 }, (err) => {
    if (err) console.error('[MQTT] ❌ Subscribe error:', err);
    else console.log('[MQTT] ✅ Subscribed to topics');
  });

  // --- TAMBAHAN: SINKRONISASI STARTUP ---
  try {
    // Ambil settingan terakhir dari DB
    let lastSettings = await Control.findOne().sort({ timestamp: -1 }).lean();

    // Jika database kosong, buat default
    if (!lastSettings) {
      lastSettings = await Control.create({});
      lastSettings = lastSettings.toObject();
    }

    // Bersihkan data sampah MongoDB (_id, dll) agar ESP32 tidak error
    delete lastSettings._id; delete lastSettings.__v; delete lastSettings.timestamp;

    // Kirim ke ESP32 dengan RETAIN: TRUE
    const payload = JSON.stringify(lastSettings);
    mqttClient.publish(CONFIG.MQTT_TOPIC_MODE, payload, { qos: 1, retain: true });
    console.log(`[Sync] 🔄 Mode Terakhir Dikirim ke ESP32: ${lastSettings.kontrol_aktif}`);

  } catch (err) {
    console.error('[Sync] Gagal sync startup:', err);
  }
});

// ... (listener MQTT lainnya tetap sama) ...

mqttClient.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    
    if (topic === CONFIG.MQTT_TOPIC_DATA) {
      // Save to database
      // console.log('[DEBUG] Raw MQTT Data:', data); // Opsional: di-comment biar terminal bersih
      let savedData = null;
      try {
        const savedData = await ResearchData.create(data);
        if (savedData) { 
          io.emit('newData', savedData);
          // [MODIFIKASI] Kirim ke Debug Terminal Frontend
          io.emit('debugLog', { type: 'DATA', data: data });
        }
        const time = new Date().toLocaleTimeString('id-ID', { hour12: false });
        const mode = (data.kontrol_aktif || '-').toUpperCase().padEnd(5, ' '); // Rata kiri 5 karakter

        // Format Suhu: T:Aktual/Set (Err:.. PWM:..)
        const tAct = (data.suhu || 0).toFixed(2);
        const tSet = (data.setpoint_suhu || 0).toFixed(1);
        const tErr = (data.error_suhu || 0).toFixed(2);
        const tPwm = (data.pwm_heater || 0).toFixed(0);
        const strSuhu = `T:${tAct}/${tSet}°C (E:${tErr} PWM:${tPwm})`;

        // Format Keruh: K:Aktual/Set (Err:.. PWM:..)
        const kAct = (data.turbidity_persen || 0).toFixed(1);
        const kSet = (data.setpoint_keruh || 0).toFixed(1);
        const kErr = (data.error_keruh || 0).toFixed(1);
        const kPwm = (data.pwm_pompa || 0).toFixed(0);
        const strKeruh = `K:${kAct}/${kSet}% (E:${kErr} PWM:${kPwm})`;
        
        const strAdc = `ADC:${data.turbidity_adc || 0}`;

        // CETAK HASIL (Satu Baris Rapi)
        console.log(`[${time}] [${mode}] ${strSuhu} | ${strKeruh} | ${strAdc}`);
      } catch (dbError) {
        console.error('[MongoDB] Error saving data:', dbError.message);
        return; 
      }
      console.log('[MQTT] Data saved:', data.suhu, '°C', data.turbidity_persen, '%');
      
      // [PENTING] SAYA HAPUS LOGIKA "AUTO-FIX" DARI SINI KARENA ITU PENYEBAB GAGAL UPDATE
    }
  } catch (error) {
    console.error('[MQTT] Processing error:', error.message);
  }
});

mqttClient.on('error', (error) => {
  console.error('[MQTT] ❌ Error:', error.message);
});

// =========================================================================
//                API ROUTES
// =========================================================================

// ... (Route Health & Data tidak berubah) ...
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    mqtt: mqttClient.connected,
    db: mongoose.connection.readyState === 1
  });
});

app.get('/api/data', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const data = await ResearchData.find()
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .lean();
    res.json(data);
  } catch (error) {
    console.error('[API] /api/data error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/control', async (req, res) => {
  try {
    // [MODIFIKASI] Mengambil data terbaru (sort timestamp desc)
    let control = await Control.findOne().sort({ timestamp: -1 }).lean();
    if (!control) {
        // Jika kosong buat baru (pakai default dari schema)
        control = await Control.create({});
    }
    res.json(control);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// [MODIFIKASI] Route Update Control (Agar ESP32 menerima data)
app.post('/api/control', async (req, res) => {
  try {
    console.log('[API] Control update request:', req.body);
    
    // 1. Simpan ke DB dulu
    const updated = await Control.findOneAndUpdate(
      {}, 
      { $set: req.body }, 
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    
    // 2. BERSIHKAN DATA (Hanya ambil field penting & pastikan tipe angka)
    // Ini agar ESP32 tidak "tersedak" data sampah MongoDB
    const cleanPayload = {
        kontrol_aktif: req.body.kontrol_aktif, // String
        suhu_setpoint: parseFloat(req.body.suhu_setpoint),
        keruh_setpoint: parseFloat(req.body.keruh_setpoint),
        kp_suhu: parseFloat(req.body.kp_suhu || 0),
        ki_suhu: parseFloat(req.body.ki_suhu || 0),
        kd_suhu: parseFloat(req.body.kd_suhu || 0),
        kp_keruh: parseFloat(req.body.kp_keruh || 0),
        ki_keruh: parseFloat(req.body.ki_keruh || 0),
        kd_keruh: parseFloat(req.body.kd_keruh || 0),
        adc_jernih: req.body.adc_jernih ? parseInt(req.body.adc_jernih) : undefined,
        adc_keruh: req.body.adc_keruh ? parseInt(req.body.adc_keruh) : undefined
    };

    // Hapus undefined
    Object.keys(cleanPayload).forEach(key => cleanPayload[key] === undefined && delete cleanPayload[key]);

    const payload = JSON.stringify(cleanPayload);

    // 3. Kirim ke MQTT dengan RETAIN: TRUE
    mqttClient.publish(CONFIG.MQTT_TOPIC_MODE, payload, { qos: 1, retain: true }, (err) => {
      if (err) console.error('[MQTT] Publish error:', err);
      else console.log('[MQTT] Control sent to ESP32:', payload);
    });

    // 4. Kirim ke Frontend Debug Terminal
    io.emit('debugLog', { type: 'CONTROL', data: cleanPayload });

    res.json({ success: true, data: updated });
    
  } catch (error) {
    console.error('[API] Control update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// [MODIFIKASI] Route Calibration
app.post('/api/calibration', async (req, res) => {
  try {
    console.log('[API] ===== Calibration Update Request =====');
    const { adc_jernih, adc_keruh } = req.body;
    
    if (!adc_jernih || !adc_keruh) {
      return res.status(400).json({ error: 'adc_jernih and adc_keruh are required' });
    }
    
    // Update DB
    const updated = await Control.findOneAndUpdate(
      {},
      { $set: { adc_jernih: parseInt(adc_jernih), adc_keruh: parseInt(adc_keruh) } },
      { upsert: true, new: true }
    );
    
    // Siapkan Payload Bersih
    const cleanPayload = {
      adc_jernih: parseInt(adc_jernih),
      adc_keruh: parseInt(adc_keruh)
    };
    
    const payloadStr = JSON.stringify(cleanPayload);
    
    // Kirim MQTT (Retain)
    mqttClient.publish(CONFIG.MQTT_TOPIC_MODE, payloadStr, { qos: 1, retain: true });
    
    // Kirim Frontend Debug
    io.emit('debugLog', { type: 'CALIB', data: cleanPayload });

    console.log('[MQTT] Calibration sent:', payloadStr);
    res.json({ success: true, data: updated });
    
  } catch (error) {
    console.error('[API] ❌ Calibration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ... (Export CSV Route Asli Anda) ...
app.get('/api/export/csv/range', async (req, res) => {
  try {
    const { start, end } = req.query;

    if (!start || !end) {
      return res.status(400).json({ error: 'Start and end query parameters are required.' });
    }

    const startDate = new Date(start);
    const endDate = new Date(end);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format.' });
    }

    const data = await ResearchData.find({
      timestamp: {
        $gte: startDate,
        $lte: endDate
      }
    })
    .sort({ timestamp: 1 }) 
    .lean();
    
    if (data.length === 0) {
      return res.status(404).send('<html><body><h1>No data found for the selected time range.</h1></body></html>');
    }

    let csv = 'Timestamp,Control_Mode,Temp_Actual,Temp_Setpoint,Temp_Error,PWM_Heater,Turb_Actual,Turb_Setpoint,Turb_Error,PWM_Pump\n';
    
    data.forEach(row => {
      const localTimestamp = new Date(row.timestamp).toLocaleString('sv-SE', { timeZone: 'Asia/Makassar' });
      csv += `"${localTimestamp}",`;
      csv += `"${row.kontrol_aktif || ''}",`;
      csv += `${row.suhu || 0},`;
      csv += `${row.setpoint_suhu || 0},`;
      csv += `${row.error_suhu || 0},`;
      csv += `${row.pwm_heater || 0},`;
      csv += `${row.turbidity_persen || 0},`;
      csv += `${row.setpoint_keruh || 0},`;
      csv += `${row.error_keruh || 0},`;
      csv += `${row.pwm_pompa || 0}\n`;
    });
    
    const fileName = `aquarium_data_${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send('\uFEFF' + csv); 

  } catch (error) {
    console.error('[API] Export CSV error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Catch-all
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(frontendPath, 'index.html'));
  } else {
    res.status(404).json({ error: 'API endpoint not found' });
  }
});

// =========================================================================
//                SOCKET.IO
// =========================================================================
io.on('connection', (socket) => {
  console.log('[Socket.IO] ✅ Client connected:', socket.id);
  
  socket.on('disconnect', (reason) => {
    console.log('[Socket.IO] Client disconnected:', socket.id, reason);
  });
  
  socket.on('error', (error) => {
    console.error('[Socket.IO] Error:', error);
  });
});

// =========================================================================
//                SERVER START
// =========================================================================
server.listen(CONFIG.PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║         🔬 AQUARIUM RESEARCH SYSTEM                      ║
╠════════════════════════════════════════════════════════════╣
║ 🌐 Server:    http://localhost:${CONFIG.PORT}            
║ 📊 Database:  ${CONFIG.MONGODB_URI.includes('localhost') ? 'Local MongoDB' : 'Remote'}
║ 🔌 MQTT:       ${CONFIG.MQTT_BROKER}
║ ✅ Status:     All systems operational
╚════════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down...');
  server.close(() => {
    mongoose.connection.close(false, () => {
      mqttClient.end();
      process.exit(0);
    });
  });
});

module.exports = { app, server, mqttClient };