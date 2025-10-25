require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const assessmentRoutes = require('./routes/assessment');
const assessment = require('./models/HealthAssessment');
const profile = require('./models/Profile');
const users = require('./models/User');

const app = express();

// 🧩 1️⃣ Configure CORS for development
app.use(cors({
  origin: function(origin, callback) {
    const allowedOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Set-Cookie']
}));

// 🧩 2️ Middlewares
app.use(cookieParser());
app.use(express.json());

// Debug middleware to log requests and cookies
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log('\n🔍 Debug:', new Date().toISOString());
    console.log('📝 Request:', req.method, req.path);
    console.log('🍪 Cookies:', req.cookies);
    next();
  });
}

// 🧩 3️⃣ MongoDB connection
const MONGO_URI = "mongodb+srv://edwardsyambasu_db_user:bxhuqJ83mhFQG78K@cluster0.nwnbuqt.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// 🧩 4️⃣ Routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/assessment', assessmentRoutes);

app.get('/', (req, res) => res.send('Auth server is running'));

// Test cookie endpoint
app.get('/test-cookie', (req, res) => {
  const options = {
    httpOnly: false,
    sameSite: 'lax',     // Less restrictive
    secure: false,       // Allow non-HTTPS in development
    path: '/'
  };
  
  res.cookie('test_cookie', 'test_value', options);
  res.json({ 
    message: 'Test cookie set',
    cookieOptions: options,
    headers: res.getHeaders()
  });
});

// Debug endpoint
app.get('/debug/cookies', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).send('Not found');
  }
  res.json({
    cookies: req.cookies,
    headers: {
      origin: req.headers.origin,
      referer: req.headers.referer,
      host: req.headers.host
    }
  });
});

// Demo endpoints
app.get('/all_health_assessment', async (req, res) => {
  const all = await assessment.find({});
  res.json(all);
});


app.get("/delete_health_assessments", async (req, res) => {
  await assessment.deleteMany({});
  res.json({ message: "All health assessments deleted" });
});

app.get("/delete_users", async (req, res) => {
  await users.deleteMany({});
  res.json({ message: "All health assessments deleted" });
});

app.get("/delete_profiles", async (req, res) => {
  await profile.deleteMany({});
  res.json({ message: "All profiles deleted" });
}   );

app.get('/all_profile', async (req, res) => {
  const all = await profile.find({});
  res.json(all);
});

app.get('/all_users', async (req, res) => {
  const all = await users.find({});
  res.json(all);
});

// 🧩 5️⃣ Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Auth server listening on port ${PORT}`);
});
