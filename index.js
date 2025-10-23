require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const authRoutes = require('./routes/auth');
const mongoose = require('mongoose');

const MONGO_URI = "mongodb+srv://edwardsyambasu_db_user:bxhuqJ83mhFQG78K@cluster0.nwnbuqt.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const users = require('./models/User');
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());

app.use('/api/auth', authRoutes);

app.get("/", async(req, res) => {

   
  res.send("Auth server is running");
});

app.get("/all_users", async(req, res) => {
  // Placeholder for fetching all users
   const allUsers = await users.find({});
    res.json(allUsers);
 
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Auth server listening on port ${PORT}`);
});
