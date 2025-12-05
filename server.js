// server.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
const jwt = require("jsonwebtoken");
require("dotenv").config();

// Models
const User = require("./models/User");
const Order = require("./models/Order");
const Livestock = require("./models/Livestock");

const app = express();

// --- Config ---
const PORT = process.env.PORT || 3000;
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/livestockmart";
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret-key";

// --- Middleware ---

// CORS: allow same-origin + credentials (for cookies)
app.use(
  cors({
    origin: true, // allows the requesting origin
    credentials: true,
  })
);

// Parse JSON request bodies
app.use(express.json());

// Parse cookies
app.use(cookieParser());

// Serve static frontend from /public
app.use(express.static(path.join(__dirname, "public")));

// --- MongoDB Connection ---
mongoose
  .connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("✅ Connected to MongoDB");
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
  });

// --- Auth Helpers ---

function createToken(user) {
  return jwt.sign(
    {
      id: user._id,
      name: user.name,
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function setAuthCookie(res, token) {
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

function authRequired(req, res, next) {
  const token = req.cookies && req.cookies.token;
  if (!token) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, name, email }
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

// ----------------------------------------------------
// AUTH ROUTES
// ----------------------------------------------------

// Register
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ message: "Name, email and password are required" });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "Email already in use" });
    }

    const user = new User({ name, email, password });
    await user.save();

    const token = createToken(user);
    setAuthCookie(res, token);

    res.status(201).json({
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Server error during registration" });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const token = createToken(user);
    setAuthCookie(res, token);

    res.json({
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error during login" });
  }
});

// Get current authenticated user
app.get("/api/auth/me", authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error("Auth me error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Logout
app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("token", {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  res.json({ message: "Logged out" });
});

// ----------------------------------------------------
// USER STATE ROUTES (cart, wishlist, addresses)
// ----------------------------------------------------

// Get logged-in user's state
app.get("/api/user/state", authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "cart wishlist addresses"
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      cart: user.cart || [],
      wishlist: user.wishlist || [],
      addresses: user.addresses || [],
    });
  } catch (err) {
    console.error("Get user state error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Update logged-in user's state
app.put("/api/user/state", authRequired, async (req, res) => {
  try {
    const { cart, wishlist, addresses } = req.body || {};

    const update = {};
    if (Array.isArray(cart)) update.cart = cart;
    if (Array.isArray(wishlist)) update.wishlist = wishlist;
    if (Array.isArray(addresses)) update.addresses = addresses;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: update },
      { new: true, runValidators: true }
    ).select("cart wishlist addresses");

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      cart: user.cart || [],
      wishlist: user.wishlist || [],
      addresses: user.addresses || [],
    });
  } catch (err) {
    console.error("Update user state error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ----------------------------------------------------
// LIVESTOCK ROUTES
// ----------------------------------------------------

// Get all livestock
app.get("/api/livestock", async (req, res) => {
  try {
    const items = await Livestock.find().sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    console.error("Get livestock error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Optional: add livestock (can be used in admin panel)
app.post("/api/livestock", async (req, res) => {
  try {
    const item = new Livestock(req.body);
    await item.save();
    res.status(201).json(item);
  } catch (err) {
    console.error("Create livestock error:", err);
    res.status(400).json({ error: err.message });
  }
});

// Optional: delete livestock
app.delete("/api/livestock/:id", async (req, res) => {
  try {
    await Livestock.findByIdAndDelete(req.params.id);
    res.json({ message: "Item deleted" });
  } catch (err) {
    console.error("Delete livestock error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// ORDER ROUTES
// ----------------------------------------------------

// Get orders for logged-in user
app.get("/api/orders", authRequired, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user.id }).sort({
      createdAt: -1,
    });
    res.json(orders);
  } catch (err) {
    console.error("Get orders error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Create new order for logged-in user
app.post("/api/orders", authRequired, async (req, res) => {
  try {
    const { items, total, date, status, address } = req.body || {};

    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ message: "Order items are required" });
    }

    if (typeof total !== "number") {
      return res.status(400).json({ message: "Order total is required" });
    }

    if (!address || !address.name || !address.phone || !address.line1) {
      return res.status(400).json({ message: "Address is incomplete" });
    }

    const newOrder = new Order({
      userId: req.user.id,
      items,
      total,
      date: date || new Date().toLocaleDateString("en-IN"),
      status: status || "Processing",
      address,
    });

    await newOrder.save();
    res.status(201).json(newOrder);
  } catch (err) {
    console.error("Create order error:", err);
    res.status(400).json({ error: err.message });
  }
});

// Optional: update order status (for admin usage)
app.put("/api/orders/:id", async (req, res) => {
  try {
    const { status } = req.body || {};
    const updated = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    res.json(updated);
  } catch (err) {
    console.error("Update order error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// PAGES (Frontend SPA)
// ----------------------------------------------------

// User app (index.html)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// If you have admin.html, you can add:
// app.get("/admin", (req, res) => {
//   res.sendFile(path.join(__dirname, "public", "admin.html"));
// });

// ----------------------------------------------------
// SERVER START / EXPORT
// ----------------------------------------------------

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
  });
}

// For Vercel
module.exports = app;
