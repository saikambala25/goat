// models/Order.js
const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema(
  {
    name: String,
    phone: String,
    line: String,
    city: String,
    state: String,
    pincode: String
  },
  { _id: false }
);

const orderItemSchema = new mongoose.Schema(
  {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Livestock'
    },
    name: String,
    price: Number,
    breed: String
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    items: [orderItemSchema],
    total: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ['Processing', 'Shipped', 'Delivered', 'Cancelled'],
      default: 'Processing'
    },
    customer: String,
    address: addressSchema,
    date: String // stored as display string (e.g., 5/12/2025)
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);
