// models/Livestock.js
const mongoose = require("mongoose");

const livestockSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      required: true,
      enum: ["Goat", "Sheep", "Buffalo", "Cow", "Other"],
      default: "Goat",
    },

    breed: {
      type: String,
      trim: true,
    },

    age: {
      type: Number,
      default: 0,
    },

    price: {
      type: Number,
      required: true,
    },

    image: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Livestock", livestockSchema);
