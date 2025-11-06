// models/ResearchData.js
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
  pid_integral_keruh: { type:Number },
  
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