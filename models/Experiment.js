// models/Experiment.js
const mongoose = require('mongoose'); // <-- PERBAIKAN: Ditambahkan

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

module.exports = Experiment; // <-- PERBAIKAN: Ditambahkan