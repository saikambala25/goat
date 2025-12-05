// models/User.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const cartItemSchema = new mongoose.Schema(
  {
    livestockId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Livestock",
      required: true,
    },
    selected: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

const addressSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    line1: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },

    // Saved per-user state for dashboard
    cart: [cartItemSchema], // [{ livestockId, selected }]
    wishlist: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Livestock",
      },
    ], // array of livestock IDs
    addresses: [addressSchema], // [{ name, phone, line1, city, state, pincode }]
  },
  {
    timestamps: true,
  }
);

// Hash password before save if modified
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Compare plain password with hashed password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
