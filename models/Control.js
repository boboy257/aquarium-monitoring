const mongoose = require('mongoose');

const controlSchema = new mongoose.Schema({
  kontrol_aktif: { type: String, default: "Fuzzy" },    // Mode kontrol: "Fuzzy" atau "PID"

  // --- Parameter Kontrol Suhu ---
  suhu_setpoint: { type: Number, default: 28.0 },    // Setpoint suhu target
  kp_suhu: { type: Number, default: 8.0 },          // Gain Proporsional untuk suhu
  ki_suhu: { type: Number, default: 0.3 },          // Gain Integral untuk suhu
  kd_suhu: { type: Number, default: 6.0 },          // Gain Derivatif untuk suhu

  // --- Parameter Kontrol Kekeruhan ---
  keruh_setpoint: { type: Number, default: 10.0 },   // Setpoint kekeruhan target (%)
  kp_keruh: { type: Number, default: 5.0 },         // Gain Proporsional untuk kekeruhan
  ki_keruh: { type: Number, default: 0.3 },         // Gain Integral untuk kekeruhan
  kd_keruh: { type: Number, default: 2.0 },         // Gain Derivatif untuk kekeruhan

  // Kalibrasi ADC (TAMBAHKAN DEFAULT VALUE!)
  adc_jernih: { type: Number, default: 9475 },
  adc_keruh: { type: Number, default: 3550 },

  timestamp: { type: Date, default: Date.now } // Waktu data disimpan (opsional, tapi bagus untuk logging)
}, {
  strict: false // Kamu bisa menambahkan ini jika ingin menyimpan field tambahan yang tidak didefinisikan, tapi tidak disarankan untuk skema yang sudah ditentukan
});

module.exports = mongoose.model('Control', controlSchema);