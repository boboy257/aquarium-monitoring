const mongoose = require('mongoose');

const researchDataSchema = new mongoose.Schema({
  // Timing
  timestamp: { type: Date, default: Date.now, index: true },
  timestamp_ms: { type: Number },
  
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
  error_keruh: { type: Number }
  
}, {
  timestamps: true,
  collection: 'research_data',
  strict: false,
  strictQuery: false
});

researchDataSchema.index({ kontrol_aktif: 1, timestamp: -1 });

module.exports = mongoose.model('ResearchData', researchDataSchema);