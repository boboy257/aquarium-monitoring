// =========================================================================
//                   models/ResearchData.js
// =========================================================================
const mongoose = require('mongoose');

const researchDataSchema = new mongoose.Schema({
  // Timing
  timestamp: { type: Date, default: Date.now, index: true },
  timestamp_ms: { type: Number }, // Milliseconds from ESP32
  
  // Sensor Readings
  suhu: { type: Number, required: true },
  turbidity_persen: { type: Number, required: true },
  
  // Control Info
  kontrol_aktif: { type: String, enum: ['Fuzzy', 'PID'], required: true },
  pwm_heater: { type: Number },
  pwm_pompa: { type: Number },
  
  // Setpoints
  setpoint_suhu: { type: Number },
  setpoint_keruh: { type: Number },
  
  // Errors
  error_suhu: { type: Number },
  error_keruh: { type: Number },
  
  // PID Internals (only for PID mode)
  pid_integral_suhu: { type: Number },
  pid_integral_keruh: { type: Number },
  
  // Experiment Info
  experiment_running: { type: Boolean, default: false },
  experiment_id: { type: String, index: true },
  experiment_elapsed_s: { type: Number }
}, {
  timestamps: true,
  collection: 'research_data'
});

// Index for fast querying
researchDataSchema.index({ experiment_id: 1, timestamp: 1 });
researchDataSchema.index({ kontrol_aktif: 1, experiment_running: 1 });

module.exports = mongoose.model('ResearchData', researchDataSchema);

// =========================================================================
//                   models/PerformanceMetrics.js
// =========================================================================
const metricsSchema = new mongoose.Schema({
  // Experiment Info
  experiment_id: { type: String, required: true, index: true },
  kontrol_aktif: { type: String, enum: ['Fuzzy', 'PID'], required: true },
  elapsed_s: { type: Number },
  timestamp: { type: Date, default: Date.now },
  
  // Temperature Metrics
  temperature: {
    overshoot_percent: { type: Number },
    settling_time_s: { type: Number },
    steady_state_error: { type: Number },
    peak_value: { type: Number },
    peak_time_s: { type: Number },
    settled: { type: Boolean, default: false }
  },
  
  // Turbidity Metrics
  turbidity: {
    overshoot_percent: { type: Number },
    settling_time_s: { type: Number },
    steady_state_error: { type: Number },
    peak_value: { type: Number },
    peak_time_s: { type: Number },
    settled: { type: Boolean, default: false }
  }
}, {
  timestamps: true,
  collection: 'performance_metrics'
});

metricsSchema.index({ experiment_id: 1, timestamp: -1 });

const PerformanceMetrics = mongoose.model('PerformanceMetrics', metricsSchema);

// =========================================================================
//                   models/Experiment.js
// =========================================================================
const experimentSchema = new mongoose.Schema({
  experiment_id: { type: String, required: true, unique: true },
  control_mode: { type: String, enum: ['Fuzzy', 'PID'], required: true },
  
  // Configuration
  config: {
    suhu_setpoint: { type: Number, required: true },
    keruh_setpoint: { type: Number, required: true },
    duration_ms: { type: Number },
    
    // PID Parameters (if PID mode)
    kp_suhu: Number,
    ki_suhu: Number,
    kd_suhu: Number,
    kp_keruh: Number,
    ki_keruh: Number,
    kd_keruh: Number
  },
  
  // Status
  status: { 
    type: String, 
    enum: ['pending', 'running', 'completed', 'stopped'], 
    default: 'pending' 
  },
  started_at: { type: Date },
  completed_at: { type: Date },
  
  // Final Results (calculated after completion)
  results: {
    temperature: {
      overshoot_percent: Number,
      settling_time_s: Number,
      steady_state_error: Number,
      rise_time_s: Number,
      peak_time_s: Number
    },
    turbidity: {
      overshoot_percent: Number,
      settling_time_s: Number,
      steady_state_error: Number,
      rise_time_s: Number,
      peak_time_s: Number
    },
    data_points_count: { type: Number, default: 0 }
  }
}, {
  timestamps: true,
  collection: 'experiments'
});

const Experiment = mongoose.model('Experiment', experimentSchema);

// =========================================================================
//                   Enhanced server.js with Research Features
// =========================================================================
const express = require('express');
//const mongoose = require('mongoose');
const mqtt = require('mqtt');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const ResearchData = require('./models/ResearchData');
const PerformanceMetrics = require('./models/PerformanceMetrics');
const Experiment = require('./models/Experiment');
const Control = require('./models/Control');

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
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Serve static files
const frontendPath = __dirname.startsWith('/opt/render/project/src') ?
  path.join(__dirname, 'frontend') :
  path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

// =========================================================================
//                   DATABASE CONNECTION
// =========================================================================
mongoose.connect(CONFIG.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('[MongoDB] Connected to research database');
}).catch(err => {
  console.error('[MongoDB] Connection error:', err);
  process.exit(1);
});

// =========================================================================
//                   MQTT CLIENT
// =========================================================================
const mqttClient = mqtt.connect(CONFIG.MQTT_BROKER, {
  reconnectPeriod: 5000
});

let lastDataTime = 0;
const DEBOUNCE_MS = 500;

mqttClient.on('connect', () => {
  console.log('[MQTT] Connected');
  mqttClient.subscribe([CONFIG.MQTT_TOPIC_DATA, CONFIG.MQTT_TOPIC_METRICS], { qos: 1 });
});

mqttClient.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    
    if (topic === CONFIG.MQTT_TOPIC_DATA) {
      const now = Date.now();
      if (now - lastDataTime < DEBOUNCE_MS) return;
      lastDataTime = now;
      
      await ResearchData.create(data);
      io.emit('newData', data);
      
      // Update experiment data count
      if (data.experiment_running && data.experiment_id) {
        await Experiment.findOneAndUpdate(
          { experiment_id: data.experiment_id },
          { $inc: { 'results.data_points_count': 1 } }
        );
      }
    }
    
    if (topic === CONFIG.MQTT_TOPIC_METRICS) {
      await PerformanceMetrics.create(data);
      io.emit('newMetrics', data);
      
      // Update experiment with latest metrics
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
    }
  } catch (error) {
    console.error('[MQTT] Processing error:', error.message);
  }
});

// =========================================================================
//                   API ROUTES - RESEARCH FOCUSED
// =========================================================================

// Start new experiment
app.post('/api/experiment/start', async (req, res) => {
  try {
    const { control_mode, suhu_setpoint, keruh_setpoint, duration_ms, pid_params } = req.body;
    
    if (!['Fuzzy', 'PID'].includes(control_mode)) {
      return res.status(400).json({ error: 'Invalid control mode' });
    }
    
    const experiment_id = `${control_mode}_${Date.now()}`;
    
    // Create experiment record
    const experiment = await Experiment.create({
      experiment_id,
      control_mode,
      config: {
        suhu_setpoint,
        keruh_setpoint,
        duration_ms: duration_ms || 600000,
        ...(control_mode === 'PID' && pid_params)
      },
      status: 'running',
      started_at: new Date()
    });
    
    // Send command to ESP32
    const command = {
      experiment_start: true,
      experiment_id,
      duration: duration_ms || 600000,
      kontrol_aktif: control_mode,
      suhu_setpoint,
      keruh_setpoint,
      ...(control_mode === 'PID' && pid_params)
    };
    
    mqttClient.publish(CONFIG.MQTT_TOPIC_MODE, JSON.stringify(command));
    
    console.log('[EXPERIMENT] Started:', experiment_id);
    res.json({ success: true, experiment });
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
    
    mqttClient.publish(CONFIG.MQTT_TOPIC_MODE, JSON.stringify({
      experiment_stop: true,
      experiment_id: id
    }));
    
    console.log('[EXPERIMENT] Stopped:', id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get experiment list
app.get('/api/experiments', async (req, res) => {
  try {
    const { control_mode, status } = req.query;
    const filter = {};
    if (control_mode) filter.control_mode = control_mode;
    if (status) filter.status = status;
    
    const experiments = await Experiment.find(filter)
      .sort({ createdAt: -1 })
      .limit(50);
    
    res.json(experiments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get experiment details with data
app.get('/api/experiment/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const experiment = await Experiment.findOne({ experiment_id: id });
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
      latest_metrics: metrics[0] || null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export experiment data as CSV
app.get('/api/experiment/:id/export', async (req, res) => {
  try {
    const { id } = req.params;
    
    const experiment = await Experiment.findOne({ experiment_id: id });
    if (!experiment) {
      return res.status(404).json({ error: 'Experiment not found' });
    }
    
    const data = await ResearchData.find({ experiment_id: id })
      .sort({ timestamp: 1 })
      .lean();
    
    if (data.length === 0) {
      return res.status(404).json({ error: 'No data found' });
    }
    
    // CSV Header
    let csv = 'Timestamp,Timestamp_MS,Elapsed_S,Control_Mode,';
    csv += 'Temp_Actual,Temp_Setpoint,Temp_Error,PWM_Heater,';
    csv += 'Turb_Actual,Turb_Setpoint,Turb_Error,PWM_Pump,';
    csv += 'PID_Integral_Temp,PID_Integral_Turb\n';
    
    // CSV Data
    data.forEach(row => {
      csv += `"${row.timestamp.toISOString()}",`;
      csv += `${row.timestamp_ms || 0},`;
      csv += `${row.experiment_elapsed_s || 0},`;
      csv += `"${row.kontrol_aktif}",`;
      csv += `${row.suhu || 0},`;
      csv += `${row.setpoint_suhu || 0},`;
      csv += `${row.error_suhu || 0},`;
      csv += `${row.pwm_heater || 0},`;
      csv += `${row.turbidity_persen || 0},`;
      csv += `${row.setpoint_keruh || 0},`;
      csv += `${row.error_keruh || 0},`;
      csv += `${row.pwm_pompa || 0},`;
      csv += `${row.pid_integral_suhu || 0},`;
      csv += `${row.pid_integral_keruh || 0}\n`;
    });
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="experiment_${id}.csv"`);
    res.send('\uFEFF' + csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Compare two experiments
app.get('/api/compare/:id1/:id2', async (req, res) => {
  try {
    const { id1, id2 } = req.params;
    
    const [exp1, exp2] = await Promise.all([
      Experiment.findOne({ experiment_id: id1 }),
      Experiment.findOne({ experiment_id: id2 })
    ]);
    
    if (!exp1 || !exp2) {
      return res.status(404).json({ error: 'One or both experiments not found' });
    }
    
    const [data1, data2] = await Promise.all([
      ResearchData.find({ experiment_id: id1 }).sort({ timestamp: 1 }).lean(),
      ResearchData.find({ experiment_id: id2 }).sort({ timestamp: 1 }).lean()
    ]);
    
    res.json({
      experiment1: { info: exp1, data: data1 },
      experiment2: { info: exp2, data: data2 }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Calculate statistics for experiment
app.get('/api/experiment/:id/statistics', async (req, res) => {
  try {
    const { id } = req.params;
    
    const data = await ResearchData.find({ experiment_id: id })
      .sort({ timestamp: 1 })
      .lean();
    
    if (data.length === 0) {
      return res.status(404).json({ error: 'No data found' });
    }
    
    // Calculate statistics
    const tempErrors = data.map(d => Math.abs(d.error_suhu || 0));
    const turbErrors = data.map(d => Math.abs(d.error_keruh || 0));
    
    const stats = {
      temperature: {
        mean_error: tempErrors.reduce((a,b) => a+b, 0) / tempErrors.length,
        max_error: Math.max(...tempErrors),
        min_error: Math.min(...tempErrors),
        std_dev: calculateStdDev(tempErrors)
      },
      turbidity: {
        mean_error: turbErrors.reduce((a,b) => a+b, 0) / turbErrors.length,
        max_error: Math.max(...turbErrors),
        min_error: Math.min(...turbErrors),
        std_dev: calculateStdDev(turbErrors)
      },
      total_data_points: data.length
    };
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function calculateStdDev(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

// Legacy routes for compatibility
app.get('/api/data', async (req, res) => {
  try {
    const { start, end, limit = 100 } = req.query;
    let filter = {};
    
    if (start && end) {
      filter.timestamp = {
        $gte: new Date(start),
        $lte: new Date(end)
      };
    }
    
    const data = await ResearchData.find(filter)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .lean();
    
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/control', async (req, res) => {
  try {
    const control = await Control.findOne().lean();
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
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/control', async (req, res) => {
  try {
    const updated = await Control.findOneAndUpdate(
      {},
      req.body,
      { upsert: true, new: true }
    );
    
    mqttClient.publish(CONFIG.MQTT_TOPIC_MODE, JSON.stringify(req.body));
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// =========================================================================
//                   SERVER START
// =========================================================================
server.listen(CONFIG.PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║           🔬 AQUARIUM RESEARCH SYSTEM                    ║
╠══════════════════════════════════════════════════════════╣
║ 🌐 Server:    http://localhost:${CONFIG.PORT}           
║ 📊 Database:  ${CONFIG.MONGODB_URI}
║ 🔌 MQTT:      ${CONFIG.MQTT_BROKER}
╚══════════════════════════════════════════════════════════╝
  `);
});

module.exports = { app, server, mqttClient };