require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const axios = require('axios');
const { createServer } = require('http');
const { Server } = require('socket.io');

// -------------------- Import existing routes --------------------
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const assessmentRoutes = require('./routes/assessment');
const medicineRoutes = require('./routes/medicine');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/order');
const pharmacyRoutes = require('./routes/pharmacy');
const consultationRoutes = require('./routes/consultations');
const dailyRoomRoutes = require('./routes/dailyRoom');
const doctorRoutes = require('./routes/doctor');
const gptRoutes = require('./routes/gpt');
const ashaRoutes = require('./routes/asha');
const authMiddleware = require('./middleware/auth');
const notificationTokenRoutes = require('./routes/notificationToken');
const doctorAuthRoutes = require('./routes/doctorAuth');
const blog = require('./routes/blogRoutes');
const labTestRoutes = require("./routes/labtest");
const booking = require("./routes/bookinglabtest");
const providerAuthRoutes = require("./routes/providerAuth");
const scanned_documents = require("./routes/scannedDocument");
const walletRoutes = require('./routes/wallet');
const insuranceRoutes = require('./routes/insurance');
//const providersRoutes = require('./routes/providers');
//const benefitsRoutes = require('./routes/benefits');
//const providerRoutes = require('./routes/provider.routes');
//const notificationRoutes = require('./routes/notification.routes');
const activityRoutes = require('./routes/activityRoutes');
const searchRoutes = require('./routes/search');

// -------------------- Express app --------------------
const app = express();
const server = createServer(app);

app.use(express.json());
app.use(cookieParser());

// -------------------- CORS --------------------
const allowedOrigins = [
  'https://qureo.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  "https://qureo-dashboard.lovable.app",
  "https://qureo-dashboard.vercel.app",
  "https://qureo-pharmacies.lovable.app",
  "https://app.qureohealth.com",
  "http://192.168.1.116:8080",
  "http://192.168.1.108:8080",
  "http://localhost:8081",
  "http://192.168.1.112:8080",
  "http://192.168.1.112:8082",
  "http://192.168.1.112:8080",

];




app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-refresh-token'],
}));

// -------------------- Routes --------------------
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/assessment', assessmentRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/pharmacy', pharmacyRoutes);
app.use('/api/consultations', consultationRoutes);
app.use('/api/daily-room', dailyRoomRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/doctor/auth', doctorAuthRoutes);
app.use('/api/gpt', gptRoutes);
app.use('/api/asha', authMiddleware, ashaRoutes);
app.use('/api/notifications', notificationTokenRoutes);
app.use("/api/blogs", blog);
app.use("/api/labtests", labTestRoutes);
app.use("/api/lab-bookings", booking);
app.use("/api/providers", providerAuthRoutes);
app.use("/api/upload-health-records", scanned_documents);
app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/insurance', insuranceRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/search', searchRoutes);
//app.use('/api/benefits', benefitsRoutes);
//app.use('/api/providers', providerRoutes);
//app.use('/api/notifications', notificationRoutes);
app.get('/', (req, res) => res.send('Auth & Signaling server running'));


// -------------------- MongoDB --------------------
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://edwardsyambasu_db_user:bxhuqJ83mhFQG78K@cluster0.nwnbuqt.mongodb.net/?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// -------------------- ICE Servers (Xirsys) --------------------
async function getXirsysIceServers() {
  try {
    const username = process.env.XIRSYS_USER;
    const secret = process.env.XIRSYS_SECRET;

    if (!username || !secret) {
      console.warn("XIRSYS credentials not set, using default STUN only");
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

    return response.data?.v?.iceServers || [];
  } catch (err) {
    console.error("❌ Failed to fetch Xirsys ICE servers:", err.message || err);
    return [];
  }
}

// -------------------- Socket.IO (WebRTC Signaling) --------------------
const io = new Server(server, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  console.log("🧠 Socket connected:", socket.id);

  // Join a room
  socket.on("webrtc-join-room", async (roomId) => {
    try {
      socket.join(roomId);
      console.log(`🔹 ${socket.id} joined room ${roomId}`);

      // Send ICE servers
      const iceServers = await getXirsysIceServers();
      socket.emit("ice-servers", iceServers);

      // Notify all other users in room and inform joining socket
      const clients = io.sockets.adapter.rooms.get(roomId) || new Set();
      for (const clientId of clients) {
        if (clientId === socket.id) continue;
        io.to(clientId).emit("user-joined", { peerId: socket.id });
        socket.emit("user-joined", { peerId: clientId });
      }
    } catch (err) {
      console.error("Error on webrtc-join-room:", err);
    }
  });

  // Forward offers, answers, ICE candidates
socket.on("webrtc-offer", async ({ offer, from }) => {
  try {
    if (!pcRef.current) await initLocalAndPC([{ urls: "stun:stun.l.google.com:19302" }]);
    peerIdRef.current = from;

    // Only accept new offer if we're stable (not negotiating)
    if (pcRef.current.signalingState !== "stable") {
      console.warn("Ignoring offer: already negotiating");
      return;
    }

    await pcRef.current.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pcRef.current.createAnswer();
    await pcRef.current.setLocalDescription(answer);
    socketRef.current.emit("webrtc-answer", { answer, to: from });
    setInCall(true);
    await drainIceQueue();
  } catch (err) {
    console.error("Doctor error handling offer:", err);
  }
});


socket.on("webrtc-answer", async ({ answer }) => {
  try {
    if (!pcRef.current) return;

    // Prevent duplicate or out-of-order answers
    if (pcRef.current.signalingState !== "have-local-offer") {
      console.warn("Ignoring answer: PC state =", pcRef.current.signalingState);
      return;
    }

    await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
    setInCall(true);
  } catch (err) {
    console.error("Doctor error handling answer:", err);
  }
});


  socket.on("webrtc-ice-candidate", ({ candidate, to }) => {
    if (!to) return;
    io.to(to).emit("webrtc-ice-candidate", { candidate, from: socket.id });
  });

  // Forward chat messages
  socket.on("chat-message", ({ room, message }) => {
    io.to(room).emit("chat-message", { message, from: socket.id });
  });

  // Disconnect
  socket.on("disconnect", () => {
    console.log("❌ Socket disconnected:", socket.id);
    socket.rooms.forEach((roomId) => {
      socket.to(roomId).emit("user-left", { peerId: socket.id });
    });
  });
});

// -------------------- Start server --------------------
const PORT = process.env.PORT || 5001;
if (require.main === module) {
  server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
}

module.exports = { app, server };
