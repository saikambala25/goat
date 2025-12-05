// models/Livestock.js
const mongoose = require('mongoose');

const livestockSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['Goat', 'Sheep'], required: true },
    breed: { type: String, required: true },
    age: { type: String, required: true },
    price: { type: Number, required: true },
    image: { type: String, default: '🐐' }, // emoji or URL
    tags: [{ type: String }]
  },
  { timestamps: true }
);

module.exports = mongoose.model('Livestock', livestockSchema);
