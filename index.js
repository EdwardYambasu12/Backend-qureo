require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');

const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const assessmentRoutes = require('./routes/assessment');

const app = express();

// ✅ Allowed frontend origins
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://qureo.vercel.app'
];

// ✅ CORS setup for cookies + cross-origin requests
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Set-Cookie']
  })
);

// ✅ Core middlewares
app.use(cookieParser());
app.use(express.json());

// Debug logs (non-production)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log('\n🔍', req.method, req.path);
    console.log('🍪 Cookies:', req.cookies);
    next();
  });
}

// ✅ MongoDB connection
mongoose
  .connect("mongodb+srv://edwardsyambasu_db_user:bxhuqJ83mhFQG78K@cluster0.nwnbuqt.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0", {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// ✅ Routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/assessment', assessmentRoutes);

// ✅ Root test
app.get('/', (req, res) => {
  res.send('🚀 Qureo Backend Active');
});

// ✅ Quick test endpoint for cookie
app.get('/test-cookie', (req, res) => {
  res.cookie('test_cookie', 'working', {
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    path: '/'
  });
  res.json({ message: '✅ Test cookie set successfully!' });
});

// ✅ Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🔥 Server running on port ${PORT}`));
