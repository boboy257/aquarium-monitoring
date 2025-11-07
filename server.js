const express = require('express');
const mongoose = require('mongoose');
const mqtt = require('mqtt');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

// Models
const ResearchData = require('./models/ResearchData');
const PerformanceMetrics = require('./models/PerformanceMetrics');
const Experiment = require('./models/Experiment');
const Control = require('./models/Control');

// Config
const CONFIG = {
  PORT: process.env.PORT || 3000,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/aquarium_research',
  MQTT_BROKER: 'mqtt://broker.hivemq.com',
  MQTT_TOPIC_DATA: 'unhas/informatika/aquarium/data',
  MQTT_TOPIC_MODE: 'unhas/informatika/aquarium/mode',
  MQTT_TOPIC_METRICS: 'unhas/informatika/aquarium/metrics'
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
//                   MONGODB CONNECTION
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
//                   MQTT CLIENT
// =========================================================================
const mqttClient = mqtt.connect(CONFIG.MQTT_BROKER, {
  reconnectPeriod: 5000,
  keepalive: 60
});

// Hapus variabel lastDataTime karena kita hapus debounce

mqttClient.on('connect', () => {
  console.log('[MQTT] ✅ Connected to broker');
  mqttClient.subscribe([
    CONFIG.MQTT_TOPIC_DATA,
    CONFIG.MQTT_TOPIC_METRICS
  ], { qos: 1 }, (err) => {
    if (err) {
      console.error('[MQTT] ❌ Subscribe error:', err);
    } else {
      console.log('[MQTT] ✅ Subscribed to topics');
    }
  });
});

// Tambahkan event listener untuk debugging
mqttClient.on('disconnect', (reason) => {
  console.error('[MQTT] ❌ DISCONNECTED:', reason);
});

mqttClient.on('reconnect', () => {
  console.log('[MQTT] 🔄 Reconnecting...');
});

mqttClient.on('close', () => {
  console.error('[MQTT] ❌ CONNECTION CLOSED');
});

mqttClient.on('offline', () => {
  console.error('[MQTT] ❌ OFFLINE');
});

mqttClient.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    
    if (topic === CONFIG.MQTT_TOPIC_DATA) {
      // HAPUS DEBOUNCE KARENA MENYEBABKAN STUCK
      
      // Save to database
      console.log('[DEBUG] Raw MQTT Data:', data);
      let savedData = null;
      try {
        const savedData = await ResearchData.create(data);
        if (savedData) { // Pastikan savedData tidak null
          io.emit('newData', savedData);
        }
        console.log('[DEBUG] Data saved successfully:', savedData._id);
      } catch (dbError) {
        console.error('[MongoDB] Error saving data:', dbError.message);
        console.error('[MongoDB] Problematic data:', data);
        // JANGAN BREAK LOOP, lanjutkan proses
        return; // Hanya skip data ini, jangan break MQTT loop
      }
      
      // Emit via Socket.IO
      //io.emit('newData', savedData);
      
      // Update experiment count
      if (data.experiment_running && data.experiment_id) {
        await Experiment.findOneAndUpdate(
          { experiment_id: data.experiment_id },
          { $inc: { 'results.data_points_count': 1 } }
        );
      }
      
      console.log('[MQTT] Data saved:', data.suhu, '°C', data.turbidity_persen, '%');
    }
    
    if (topic === CONFIG.MQTT_TOPIC_METRICS) {
      await PerformanceMetrics.create(data);
      io.emit('newMetrics', data);
      
      // Update experiment results
      if (data.experiment_id) {
        await Experiment.findOneAndUpdate(
          { experiment_id: data.experiment_id },
          { 
            $set: { 
              'results.temperature': data.temperature,
              'results.turbidity': data.turbidity
            }
          }
        );
      }
      
      console.log('[MQTT] Metrics saved for:', data.experiment_id);
    }
  } catch (error) {
    console.error('[MQTT] Processing error:', error.message);
    // JANGAN BREAK LOOP MQTT KARENA ERROR
    // Biarkan fungsi selesai normal agar data berikutnya bisa diproses
  }
});

mqttClient.on('error', (error) => {
  console.error('[MQTT] ❌ Error:', error.message);
});

// =========================================================================
//                   API ROUTES
// =========================================================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    mqtt: mqttClient.connected,
    db: mongoose.connection.readyState === 1
  });
});

// Get recent data
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

// Get control settings
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

// Update control settings
app.post('/api/control', async (req, res) => {
  try {
    console.log('[API] Control update request:', req.body);
    
    const updated = await Control.findOneAndUpdate(
      {},
      req.body,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    
    console.log('[API] Control updated in DB, now publishing to MQTT...'); // LOG TAMBAHAN
    
    // Publish to MQTT
    const payload = JSON.stringify(req.body);
    mqttClient.publish(CONFIG.MQTT_TOPIC_MODE, payload, { qos: 1 }, (err) => {
      console.log('[MQTT] Publish callback started'); // LOG TAMBAHAN
      if (err) {
        console.error('[MQTT] Publish error:', err);
        return res.status(500).json({ error: 'MQTT publish failed' });
      }
      console.log('[MQTT] ✅ Control sent to ESP32:', payload);
      console.log('[API] Sending success response to frontend'); // LOG TAMBAHAN
      res.json({ success: true, data: updated });
    });
  } catch (error) {
    console.error('[API] Control update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start experiment
app.post('/api/experiment/start', async (req, res) => {
  try {
    console.log('[API] Start experiment request:', req.body);
    
    const { control_mode, suhu_setpoint, keruh_setpoint, duration_ms, pid_params } = req.body;
    
    if (!['Fuzzy', 'PID'].includes(control_mode)) {
      return res.status(400).json({ error: 'Invalid control mode' });
    }
    
    const experiment_id = `${control_mode}_${Date.now()}`;
    
    // Create experiment
    const experiment = await Experiment.create({
      experiment_id,
      control_mode,
      config: {
        suhu_setpoint,
        keruh_setpoint,
        duration_ms: duration_ms || 600000,
        ...pid_params
      },
      status: 'running',
      started_at: new Date()
    });
    
    // Send to ESP32
    const command = {
      experiment_start: true,
      experiment_id,
      duration: duration_ms || 600000,
      kontrol_aktif: control_mode,
      suhu_setpoint,
      keruh_setpoint,
      ...pid_params
    };
    
    mqttClient.publish(CONFIG.MQTT_TOPIC_MODE, JSON.stringify(command), { qos: 1 }, (err) => {
      if (err) {
        console.error('[MQTT] Publish error:', err);
        return res.status(500).json({ error: 'Failed to send to ESP32' });
      }
      console.log('[MQTT] ✅ Experiment started:', experiment_id);
      res.json({ success: true, experiment });
    });
  } catch (error) {
    console.error('[API] Start experiment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Stop experiment
app.post('/api/experiment/stop/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await Experiment.findOneAndUpdate(
      { experiment_id: id },
      { status: 'stopped', completed_at: new Date() }
    );
    
    const command = {
      experiment_stop: true,
      experiment_id: id
    };
    
    mqttClient.publish(CONFIG.MQTT_TOPIC_MODE, JSON.stringify(command), { qos: 1 }, (err) => {
      if (err) {
        console.error('[MQTT] Publish error (stop):', err);
      }
      console.log('[API] Experiment stopped:', id);
      res.json({ success: true });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get experiments list
app.get('/api/experiments', async (req, res) => {
  try {
    const { control_mode, status } = req.query;
    const filter = {};
    
    if (control_mode) filter.control_mode = control_mode;
    if (status) filter.status = status;
    
    const experiments = await Experiment.find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    
    res.json(experiments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get experiment details
app.get('/api/experiment/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const experiment = await Experiment.findOne({ experiment_id: id }).lean();
    if (!experiment) {
      return res.status(404).json({ error: 'Experiment not found' });
    }
    
    const data = await ResearchData.find({ experiment_id: id })
      .sort({ timestamp: 1 })
      .lean();
    
    const metrics = await PerformanceMetrics.find({ experiment_id: id })
      .sort({ timestamp: -1 })
      .limit(1)
      .lean();
    
    res.json({
      experiment,
      data,
      latest_metrics: metrics[0] || null,
      data_count: data.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export experiment CSV
app.get('/api/experiment/:id/export', async (req, res) => {
  try {
    const { id } = req.params;
    
    const data = await ResearchData.find({ experiment_id: id })
      .sort({ timestamp: 1 })
      .lean();
    
    if (data.length === 0) {
      return res.status(404).json({ error: 'No data found' });
    }
    
    let csv = 'Timestamp,Elapsed_S,Control_Mode,Temp_Actual,Temp_Setpoint,Temp_Error,PWM_Heater,Turb_Actual,Turb_Setpoint,Turb_Error,PWM_Pump\n';
    
    data.forEach(row => {
      csv += `"${row.timestamp.toISOString()}",`;
      csv += `${row.experiment_elapsed_s || 0},`;
      csv += `"${row.kontrol_aktif}",`;
      csv += `${row.suhu || 0},`;
      csv += `${row.setpoint_suhu || 0},`;
      csv += `${row.error_suhu || 0},`;
      csv += `${row.pwm_heater || 0},`;
      csv += `${row.turbidity_persen || 0},`;
      csv += `${row.setpoint_keruh || 0},`;
      csv += `${row.error_keruh || 0},`;
      csv += `${row.pwm_pompa || 0}\n`;
    });
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="experiment_${id}.csv"`);
    res.send('\uFEFF' + csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Compare experiments
app.get('/api/compare/:id1/:id2', async (req, res) => {
  try {
    const { id1, id2 } = req.params;
    
    const [exp1, exp2, data1, data2] = await Promise.all([
      Experiment.findOne({ experiment_id: id1 }).lean(),
      Experiment.findOne({ experiment_id: id2 }).lean(),
      ResearchData.find({ experiment_id: id1 }).sort({ timestamp: 1 }).lean(),
      ResearchData.find({ experiment_id: id2 }).sort({ timestamp: 1 }).lean()
    ]);
    
    if (!exp1 || !exp2) {
      return res.status(404).json({ error: 'Experiment not found' });
    }
    
    res.json({
      experiment1: { info: exp1, data: data1, count: data1.length },
      experiment2: { info: exp2, data: data2, count: data2.length }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Catch-all for SPA routing
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(frontendPath, 'index.html'));
  } else {
    res.status(404).json({ error: 'API endpoint not found' });
  }
});

// =========================================================================
//                   SOCKET.IO
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
//                   SERVER START
// =========================================================================
server.listen(CONFIG.PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║           🔬 AQUARIUM RESEARCH SYSTEM                     ║
╠════════════════════════════════════════════════════════════╣
║ 🌐 Server:    http://localhost:${CONFIG.PORT}            
║ 📊 Database:  ${CONFIG.MONGODB_URI.includes('localhost') ? 'Local MongoDB' : 'Remote'}
║ 🔌 MQTT:      ${CONFIG.MQTT_BROKER}
║ ✅ Status:    All systems operational
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