require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const axios = require('axios');
const { createServer } = require('http');
const { Server } = require('socket.io');


// Existing routes and models 
const authRoutes = require('./routes/auth');
 const profileRoutes = require('./routes/profile'); 
 const assessmentRoutes = require('./routes/assessment'); 
 const assessment = require('./models/HealthAssessment'); 
 const profile = require('./models/Profile'); 
 const users = require('./models/User');
  const medicineRoutes = require('./routes/medicine'); 
  const cartRoutes = require('./routes/cart'); 
  const orderRoutes = require('./routes/order'); 
  const pharmacy = require("./routes/pharmacy"); 
  const consultationRoutes = require("./routes/consultations");
   const dailyRoomRoutes = require("./routes/dailyRoom");
  const doctor = require("./routes/doctor.js")
const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cookieParser());
app.use(express.json());


const allowedOrigins = [
  'https://qureo.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  "https://qureo-dashboard.lovable.app",
  "https://d44c5427-ee5e-4513-99c0-2c71e843534e.lovableproject.com",
  "https://qureo-dashboard.vercel.app",
  "https://qureo-pharmacies.lovable.app",
  "http://192.168.1.116:8080",
  "http://localhost:8081",
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','x-refresh-token'],
}));



app.use('/api/medicines', medicineRoutes); 
app.use("/api/consultations", consultationRoutes);
 app.use('/api/auth', authRoutes);
  app.use('/api/profile', profileRoutes); 
  app.use('/api/assessment', assessmentRoutes); 
  app.use('/api/cart', cartRoutes); 
  app.use('/api/orders', orderRoutes); 
  app.use("/api/pharmacy", pharmacy); 
  app.use("/api/daily-room", dailyRoomRoutes);
  app.use("/api/doctor", doctor)
   app.get('/', (req,res) => res.send('Auth server is running'));






















app.get('/', (req,res) => res.send('Auth & Signaling server running'));

// ------------------------
// MongoDB connection (leave as-is)
// ------------------------
const MONGO_URI = "mongodb+srv://edwardsyambasu_db_user:bxhuqJ83mhFQG78K@cluster0.nwnbuqt.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
if (MONGO_URI) {
  mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }).then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB connection error:', err));
}

// ------------------------
// Helper: Fetch ICE servers from Xirsys (returns array)
// ------------------------
async function getXirsysIceServers() {
  try {
    const username = process.env.XIRSYS_USER;
    const secret = process.env.XIRSYS_SECRET;
    if (!username || !secret) {
      console.warn("XIRSYS credentials not set, returning empty ICE array");
      return [];
    }

    const response = await axios.put(
      "https://global.xirsys.net/_turn/MyFirstApp",
      { format: "urls" },
      {
        headers: {
          Authorization: "Basic " + Buffer.from(`${username}:${secret}`).toString("base64"),
          "Content-Type": "application/json",
        },
      }
    );

    // response.data.v.iceServers should be an array
    const ice = response.data?.v?.iceServers || [];
    return ice;
  } catch (err) {
    console.error("❌ Failed to fetch Xirsys ICE servers:", err?.message || err);
    return [];
  }
}

// ------------------------
// Socket.IO signaling
// ------------------------
io.on("connection", (socket) => {
  console.log("🧠 Socket connected:", socket.id);

  // Join a WebRTC room. payload: { roomId }
  socket.on("webrtc-join-room", async (roomId) => {
    try {
      socket.join(roomId);
      console.log(`🔹 ${socket.id} joined room ${roomId}`);

      // Fetch ICE servers and send them to the joining client
      const iceServers = await getXirsysIceServers(); // array or []
      socket.emit("ice-servers", iceServers);

      // inform other participants in the room that a user joined
      // Send the joining socket the existing peers and notify others about the join
      const clients = io.sockets.adapter.rooms.get(roomId) || new Set();
      for (const clientId of clients) {
        if (clientId === socket.id) continue;
        // notify existing peer that someone joined
        io.to(clientId).emit("user-joined", { peerId: socket.id });
        // inform the joining socket who is already there
        socket.emit("user-joined", { peerId: clientId });
      }
    } catch (err) {
      console.error("Error on webrtc-join-room:", err);
    }
  });

  // Forward offer, answer, and ice-candidate. Clients include `to` (target socket id).
  socket.on("webrtc-offer", ({ offer, to }) => {
    if (!to) return;
    io.to(to).emit("webrtc-offer", { offer, from: socket.id });
  });

  socket.on("webrtc-answer", ({ answer, to }) => {
    if (!to) return;
    io.to(to).emit("webrtc-answer", { answer, from: socket.id });
  });

  socket.on("webrtc-ice-candidate", ({ candidate, to }) => {
    if (!to) return;
    io.to(to).emit("webrtc-ice-candidate", { candidate, from: socket.id });
  });

  socket.on("disconnect", () => {
    console.log("❌ Socket disconnected:", socket.id);
    // notify rooms
    socket.rooms.forEach((roomId) => {
      socket.to(roomId).emit("user-left", { peerId: socket.id });
    });
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Signaling server listening on ${PORT}`));
