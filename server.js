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

// Logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Static files
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

mqttClient.on('connect', () => {
  console.log('[MQTT] ✅ Connected to broker');
  mqttClient.subscribe([
    CONFIG.MQTT_TOPIC_DATA,
    CONFIG.MQTT_TOPIC_MODE // HANYA subscribe ke DATA dan MODE
    // CONFIG.MQTT_TOPIC_METRICS // DIHAPUS DARI SUBSCRIBE
  ], { qos: 1 }, (err) => {
    if (err) {
      console.error('[MQTT] ❌ Subscribe error:', err);
    } else {
      console.log('[MQTT] ✅ Subscribed to topics');
    }
  });
});

// ... (listener MQTT lainnya: disconnect, reconnect, close, offline) ...

mqttClient.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    
    if (topic === CONFIG.MQTT_TOPIC_DATA) {
      // Save to database
      console.log('[DEBUG] Raw MQTT Data:', data);
      let savedData = null;
      try {
        const savedData = await ResearchData.create(data);
        if (savedData) { 
          io.emit('newData', savedData);
        }
        console.log('[DEBUG] Data saved successfully:', savedData._id);
      } catch (dbError) {
        console.error('[MongoDB] Error saving data:', dbError.message);
        console.error('[MongoDB] Problematic data:', data);
        return; 
      }
      console.log('[MQTT] Data saved:', data.suhu, '°C', data.turbidity_persen, '%');
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

// ... (Route: /api/health, /api/data, /api/control (GET), /api/control (POST)) ...
// ... (Tidak ada perubahan di route-route ini) ...

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
    let control = await Control.findOne().lean();
    if (!control) {
      control = {
        kontrol_aktif: "Fuzzy",
        suhu_setpoint: 28.0,
        kp_suhu: 25,
        ki_suhu: 1.5,
        kd_suhu: 4,
        keruh_setpoint: 10.0,
        kp_keruh: 10,
        ki_keruh: 0.5,
        kd_keruh: 1
      };
    }
    res.json(control);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/control', async (req, res) => {
  try {
    console.log('[API] Control update request:', req.body);
    
    const updated = await Control.findOneAndUpdate(
      {},
      req.body,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    
    console.log('[API] Control updated in DB, now publishing to MQTT...'); 
    
    const payload = JSON.stringify(req.body);
    mqttClient.publish(CONFIG.MQTT_TOPIC_MODE, payload, { qos: 1 }, (err) => {
      console.log('[MQTT] Publish callback started'); 
      if (err) {
        console.error('[MQTT] Publish error:', err);
        return res.status(500).json({ error: 'MQTT publish failed' });
      }
      console.log('[MQTT] ✅ Control sent to ESP32:', payload);
      console.log('[API] Sending success response to frontend');
      res.json({ success: true, data: updated });
    });
  } catch (error) {
    console.error('[API] Control update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export data CSV (VERSI BARU DENGAN RENTANG WAKTU)
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

    // Cari data di database berdasarkan rentang timestamp
    const data = await ResearchData.find({
      timestamp: {
        $gte: startDate,
        $lte: endDate
      }
    })
    .sort({ timestamp: 1 }) // Urutkan dari lama ke baru
    .lean();
    
    if (data.length === 0) {
      return res.status(404).send('<html><body><h1>No data found for the selected time range.</h1></body></html>');
    }

    let csv = 'Timestamp,Control_Mode,Temp_Actual,Temp_Setpoint,Temp_Error,PWM_Heater,Turb_Actual,Turb_Setpoint,Turb_Error,PWM_Pump\n';
    
    data.forEach(row => {
      csv += `"${new Date(row.timestamp).toISOString()}",`;
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
    
    // Buat nama file yang dinamis
    const fileName = `aquarium_data_${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send('\uFEFF' + csv); // \uFEFF untuk encoding Excel

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