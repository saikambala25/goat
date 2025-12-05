// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const User = require('./models/User');
const Order = require('./models/Order');
const Livestock = require('./models/Livestock');

const app = express();

// ---- CONFIG ----
const PORT = process.env.PORT || 3000;
const MONGO_URI =
  process.env.MONGO_URI ||
  'mongodb+srv://saikambala111_db_user:deDR8YMG99pHBXBc@cluster0.mgzygo3.mongodb.net/LivestockMart?retryWrites=true&w=majority';
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key';

// If frontend is separate domain, change CLIENT_ORIGIN
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';

// ---- MIDDLEWARE ----
app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true
  })
);
app.use(cookieParser());
app.use(bodyParser.json());

// ---- DB CONNECT ----
mongoose
  .connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

// ---- AUTH HELPERS ----
function signToken(user) {
  return jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ message: 'Not authenticated' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

async function loadUser(req, res, next) {
  if (!req.userId) return next();
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) return res.status(401).json({ message: 'User not found' });
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

// ---- AUTH ROUTES ----

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'All fields are required' });

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const user = await User.create({ name, email, password });
    const token = signToken(user);

    res
      .cookie('token', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production'
      })
      .json({
        user: {
          id: user._id,
          name: user.name,
          email: user.email
        }
      });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Registration failed' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ message: 'Invalid email or password' });

    const match = await user.comparePassword(password);
    if (!match)
      return res.status(400).json({ message: 'Invalid email or password' });

    const token = signToken(user);

    res
      .cookie('token', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production'
      })
      .json({
        user: {
          id: user._id,
          name: user.name,
          email: user.email
        }
      });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Login failed' });
  }
});

// Me
app.get('/api/auth/me', authMiddleware, loadUser, (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email
    }
  });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res
    .clearCookie('token', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    })
    .json({ message: 'Logged out' });
});

// ---- LIVESTOCK ROUTES ----

// Get all livestock
app.get('/api/livestock', async (req, res) => {
  try {
    const items = await Livestock.find().sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load livestock' });
  }
});

// (Optional) Admin – create livestock
app.post('/api/livestock', async (req, res) => {
  try {
    const item = await Livestock.create(req.body);
    res.status(201).json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create livestock' });
  }
});

// ---- ORDER ROUTES ----

// Get orders for current user ONLY
app.get('/api/orders', authMiddleware, loadUser, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch orders' });
  }
});

// Create order for current user
app.post('/api/orders', authMiddleware, loadUser, async (req, res) => {
  try {
    const { items, total, status, customer, address, date } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ message: 'No items in order' });
    }

    const order = await Order.create({
      user: req.user._id,
      items,
      total,
      status: status || 'Processing',
      customer: customer || req.user.name,
      address,
      date: date || new Date().toLocaleDateString()
    });

    res.status(201).json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create order' });
  }
});

// Root
app.get('/', (req, res) => {
  res.send('LivestockMart API running');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
