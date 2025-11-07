const mongoose = require('mongoose');

const metricsSchema = new mongoose.Schema({
  experiment_id: { type: String, required: true, index: true },
  kontrol_aktif: { type: String, enum: ['Fuzzy', 'PID'], required: true },
  elapsed_s: { type: Number },
  timestamp: { type: Date, default: Date.now },
  
  temperature: {
    overshoot_percent: { type: Number, default: 0 },
    settling_time_s: { type: Number, default: 0 },
    steady_state_error: { type: Number, default: 0 },
    peak_value: { type: Number, default: 0 },
    peak_time_s: { type: Number, default: 0 },
    settled: { type: Boolean, default: false }
  },
  
  turbidity: {
    overshoot_percent: { type: Number, default: 0 },
    settling_time_s: { type: Number, default: 0 },
    steady_state_error: { type: Number, default: 0 },
    peak_value: { type: Number, default: 0 },
    peak_time_s: { type: Number, default: 0 },
    settled: { type: Boolean, default: false }
  }
}, {
  timestamps: true,
  collection: 'performance_metrics',
  strict: false
});

metricsSchema.index({ experiment_id: 1, timestamp: -1 });

module.exports = mongoose.model('PerformanceMetrics', metricsSchema);