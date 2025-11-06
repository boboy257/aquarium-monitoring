// models/PerformanceMetrics.js
const mongoose = require('mongoose'); // <-- PERBAIKAN: Ditambahkan

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

module.exports = PerformanceMetrics; // <-- PERBAIKAN: Ditambahkan