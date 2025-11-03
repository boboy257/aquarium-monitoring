const mongoose = require('mongoose');

const dataSchema = new mongoose.Schema({
  suhu: Number,
  turbidity_persen: Number, 
  kontrol_aktif: String,
  pwm_heater: Number, 
  pwm_pompa: Number,  
  timestamp: { type: Date, default: Date.now }
}, {
  strict: false // Agar field tambahan tetap disimpan
});

module.exports = mongoose.model('Data', dataSchema);