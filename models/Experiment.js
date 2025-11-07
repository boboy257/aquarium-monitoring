const mongoose = require('mongoose');

const experimentSchema = new mongoose.Schema({
  experiment_id: { type: String, required: true, unique: true },
  control_mode: { type: String, enum: ['Fuzzy', 'PID'], required: true },
  
  config: {
    suhu_setpoint: { type: Number, required: true },
    keruh_setpoint: { type: Number, required: true },
    duration_ms: { type: Number, default: 600000 },
    kp_suhu: Number,
    ki_suhu: Number,
    kd_suhu: Number,
    kp_keruh: Number,
    ki_keruh: Number,
    kd_keruh: Number
  },
  
  status: { 
    type: String, 
    enum: ['pending', 'running', 'completed', 'stopped'], 
    default: 'pending' 
  },
  
  started_at: { type: Date },
  completed_at: { type: Date },
  
  results: {
    temperature: {
      overshoot_percent: { type: Number, default: 0 },
      settling_time_s: { type: Number, default: 0 },
      steady_state_error: { type: Number, default: 0 },
      rise_time_s: { type: Number, default: 0 },
      peak_time_s: { type: Number, default: 0 }
    },
    turbidity: {
      overshoot_percent: { type: Number, default: 0 },
      settling_time_s: { type: Number, default: 0 },
      steady_state_error: { type: Number, default: 0 },
      rise_time_s: { type: Number, default: 0 },
      peak_time_s: { type: Number, default: 0 }
    },
    data_points_count: { type: Number, default: 0 }
  }
}, {
  timestamps: true,
  collection: 'experiments',
  strict: false
});

module.exports = mongoose.model('Experiment', experimentSchema);