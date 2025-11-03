const mongoose = require('mongoose');
const Data = require('./models/Data'); // Sesuaikan path

mongoose.connect('mongodb://localhost:27017/aquarium', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function cekData() {
  try {
    const data = await Data.findOne().sort({ timestamp: -1 });
    console.log("Data terbaru:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error:", err);
  } finally {
    mongoose.connection.close();
  }
}

cekData();