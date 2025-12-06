// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'YOUR_MONGODB_URI_HERE';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

// --- Mongo Connection ---
mongoose
  .connect(MONGO_URI, { dbName: 'livestock_mart' })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => {
    console.error('Mongo error:', err);
    process.exit(1);
  });

// --- Schemas & Models ---

const AddressSchema = new mongoose.Schema(
  {
    title: { type: String, default: 'Home' },
    name: String,
    phone: String,
    line: String,
    city: String,
    state: String,
    pincode: String,
  },
  { _id: false }
);

const CartItemSchema = new mongoose.Schema(
  {
    id: String, // livestock _id as string
    name: String,
    breed: String,
    price: Number,
    image: String,
    selected: { type: Boolean, default: true },
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    passwordHash: { type: String, required: true },
    cart: [CartItemSchema],
    wishlist: [String], // livestock IDs
    address: AddressSchema,
  },
  { timestamps: true }
);

const LivestockSchema = new mongoose.Schema(
  {
    name: String,
    type: String, // Goat / Sheep
    breed: String,
    age: String,
    price: Number,
    image: String,
    tags: [String],
  },
  { timestamps: true }
);

const OrderItemSchema = new mongoose.Schema(
  {
    id: String,
    name: String,
    breed: String,
    price: Number,
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: [OrderItemSchema],
    total: Number,
    status: { type: String, default: 'Processing' },
    date: String, // for display
    address: AddressSchema,
  },
  { timestamps: true }
);

const User = mongoose.model('User', UserSchema);
const Livestock = mongoose.model('Livestock', LivestockSchema);
const Order = mongoose.model('Order', OrderSchema);

// --- Middleware ---

app.use(
  cors({
    origin: true, // reflects request origin
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// --- Auth helpers ---

function createToken(user) {
  return jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
}

async function authRequired(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ message: 'Not authenticated' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.id);
    if (!user) return res.status(401).json({ message: 'User not found' });
    req.user = user;
    next();
  } catch (err) {
    console.error('Auth error:', err);
    return res.status(401).json({ message: 'Invalid token' });
  }
}

// --- Auth Routes ---

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'All fields are required' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, passwordHash, cart: [], wishlist: [] });

    const token = createToken(user);
    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ user: { id: user._id.toString(), name: user.name, email: user.email } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'Email and password required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(400).json({ message: 'Invalid credentials' });

    const token = createToken(user);
    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ user: { id: user._id.toString(), name: user.name, email: user.email } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/auth/me', authRequired, (req, res) => {
  const u = req.user;
  res.json({ user: { id: u._id.toString(), name: u.name, email: u.email } });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

// --- Livestock Routes ---

// Simple seeding if collection empty (optional)
async function ensureSeedLivestock() {
  const count = await Livestock.countDocuments();
  if (count === 0) {
    await Livestock.insertMany([
      {
        name: 'Premium Goat',
        type: 'Goat',
        breed: 'Boer',
        age: '2 years',
        price: 15000,
        image: '🐐',
        tags: ['Healthy'],
      },
      {
        name: 'Woolly Sheep',
        type: 'Sheep',
        breed: 'Merino',
        age: '1.5 years',
        price: 12000,
        image: '🐑',
        tags: ['High Wool'],
      },
    ]);
    console.log('Seeded default livestock');
  }
}

ensureSeedLivestock().catch(console.error);

app.get('/api/livestock', async (req, res) => {
  try {
    const items = await Livestock.find().sort({ createdAt: -1 }).lean();
    res.json(items);
  } catch (err) {
    console.error('Livestock error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// --- User State Routes (cart, wishlist, address, orders) ---

// Get full state for logged user
app.get('/api/user/state', authRequired, async (req, res) => {
  try {
    const user = req.user;
    const orders = await Order.find({ userId: user._id }).sort({ createdAt: -1 }).lean();

    res.json({
      cart: user.cart || [],
      wishlist: user.wishlist || [],
      address: user.address || null,
      orders: orders || [],
    });
  } catch (err) {
    console.error('Get state error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update partial state (cart / wishlist / address)
app.put('/api/user/state', authRequired, async (req, res) => {
  try {
    const user = req.user;
    const { cart, wishlist, address } = req.body;

    if (Array.isArray(cart)) {
      user.cart = cart;
    }
    if (Array.isArray(wishlist)) {
      user.wishlist = wishlist;
    }
    if (address && typeof address === 'object') {
      user.address = address;
    }

    await user.save();

    res.json({
      cart: user.cart || [],
      wishlist: user.wishlist || [],
      address: user.address || null,
    });
  } catch (err) {
    console.error('Update state error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// --- Orders Routes (per user) ---

app.get('/api/orders', authRequired, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json(orders);
  } catch (err) {
    console.error('Orders get error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/orders', authRequired, async (req, res) => {
  try {
    const { items, total, status, date, address } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'No items in order' });
    }

    const order = await Order.create({
      userId: req.user._id,
      items,
      total,
      status: status || 'Processing',
      date: date || new Date().toLocaleDateString('en-IN'),
      address: address || req.user.address || null,
    });

    res.status(201).json(order);
  } catch (err) {
    console.error('Orders post error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
