const mongoose = require('mongoose');

const controlSchema = new mongoose.Schema({
  kontrol_aktif: String,    // Mode kontrol: "Fuzzy" atau "PID"

  // --- Parameter Kontrol Suhu ---
  suhu_setpoint: Number,    // Setpoint suhu target
  kp_suhu: Number,          // Gain Proporsional untuk suhu
  ki_suhu: Number,          // Gain Integral untuk suhu
  kd_suhu: Number,          // Gain Derivatif untuk suhu

  // --- Parameter Kontrol Kekeruhan ---
  keruh_setpoint: Number,   // Setpoint kekeruhan target (%)
  kp_keruh: Number,         // Gain Proporsional untuk kekeruhan
  ki_keruh: Number,         // Gain Integral untuk kekeruhan
  kd_keruh: Number,         // Gain Derivatif untuk kekeruhan

  timestamp: { type: Date, default: Date.now } // Waktu data disimpan (opsional, tapi bagus untuk logging)
}, {
  // strict: false // Kamu bisa menambahkan ini jika ingin menyimpan field tambahan yang tidak didefinisikan, tapi tidak disarankan untuk skema yang sudah ditentukan
});

module.exports = mongoose.model('Control', controlSchema);