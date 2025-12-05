// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Models
const Livestock = require('./models/Livestock');
const Order = require('./models/Order');
const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';

// Middleware
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

// Database Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/livestockmart';

mongoose
  .connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => console.error('❌ MongoDB Connection Error:', err));

// --- AUTH HELPERS ---

function createToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function setAuthCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function authMiddleware(req, res, next) {
  const token = req.cookies && req.cookies.token;
  if (!token) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { id: decoded.id, email: decoded.email, name: decoded.name };
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

// --- AUTH ROUTES ---

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    const user = new User({ name, email, password });
    await user.save();

    const token = createToken(user);
    setAuthCookie(res, token);

    res.status(201).json({
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    const token = createToken(user);
    setAuthCookie(res, token);

    res.json({
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Get current user (basic info)
app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token', {
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  res.json({ message: 'Logged out' });
});

// --- USER STATE (cart, wishlist, addresses) ---
// All data now stored ONLY in MongoDB

// Get saved state (returns UI-friendly objects)
app.get('/api/user/state', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('cart.livestockId', 'name type breed age price image tags')
      .lean();

    if (!user) return res.status(404).json({ message: 'User not found' });

    const cart = (user.cart || []).map((ci) => {
      const ls = ci.livestockId || {};
      return {
        _id: ls._id ? ls._id.toString() : null,
        name: ls.name || '',
        breed: ls.breed || '',
        price: ls.price || 0,
        image: ls.image || '🐐',
        age: ls.age || '',
        type: ls.type || '',
        tags: ls.tags || [],
        selected: ci.selected !== false,
      };
    });

    const wishlist = (user.wishlist || []).map((id) => id.toString());

    const addresses = (user.addresses || []).map((a) => ({
      label: a.label || `${a.pincode || ''} - ${a.city || ''}, ${a.state || ''}`,
      name: a.name,
      line1: a.line1,
      line2: a.line2 || '',
      city: a.city,
      state: a.state,
      pincode: a.pincode,
      phone: a.phone,
    }));

    res.json({ cart, wishlist, addresses });
  } catch (err) {
    console.error('Get user state error:', err);
    res.status(500).json({ message: 'Failed to load user state' });
  }
});

// Save state (expects UI-friendly objects)
app.put('/api/user/state', authMiddleware, async (req, res) => {
  try {
    const { cart = [], wishlist = [], addresses = [] } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.cart = (cart || [])
      .filter((c) => c._id)
      .map((c) => ({
        livestockId: c._id,
        quantity: 1,
        selected: c.selected !== false,
      }));

    user.wishlist = wishlist || [];

    user.addresses = (addresses || []).map((a) => ({
      label: a.label || `${a.pincode || ''} - ${a.city || ''}, ${a.state || ''}`,
      name: a.name,
      line1: a.line1 || a.line || '',
      line2: a.line2 || '',
      city: a.city,
      state: a.state,
      pincode: a.pincode,
      phone: a.phone,
    }));

    await user.save();
    res.json({ success: true });
  } catch (err) {
    console.error('Save user state error:', err);
    res.status(500).json({ message: 'Failed to save user state' });
  }
});

// --- EXISTING API ROUTES (unchanged URLs) ---

// 1. Get All Livestock
app.get('/api/livestock', async (req, res) => {
  try {
    const livestock = await Livestock.find().sort({ createdAt: -1 });
    res.json(livestock);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Add Livestock
app.post('/api/livestock', async (req, res) => {
  try {
    const newItem = new Livestock(req.body);
    await newItem.save();
    res.status(201).json(newItem);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3. Delete Livestock
app.delete('/api/livestock/:id', async (req, res) => {
  try {
    await Livestock.findByIdAndDelete(req.params.id);
    res.json({ message: 'Item deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Get ALL Orders (admin)
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4b. Get MY Orders (user-specific)
app.get('/api/my-orders', authMiddleware, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    console.error('My orders error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Create Order (user must be logged in)
app.post('/api/orders', authMiddleware, async (req, res) => {
  try {
    const { customer, date, items, total, status, address } = req.body;

    const newOrder = new Order({
      user: req.user.id,
      customer,
      date,
      items,
      total,
      status: status || 'Processing',
      // any extra fields (like address) will be ignored by schema
    });

    await newOrder.save();
    res.status(201).json(newOrder);
  } catch (err) {
    console.error('Create order error:', err);
    res.status(400).json({ error: err.message });
  }
});

// 6. Update Order Status
app.put('/api/orders/:id', async (req, res) => {
  try {
    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    );
    res.json(updatedOrder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve Admin Portal
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Serve User Portal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'user.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

module.exports = app;
