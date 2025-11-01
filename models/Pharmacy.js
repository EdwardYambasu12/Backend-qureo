const mongoose = require("mongoose");

const pharmacySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    description: { type: String },
    logo: { type: String }, // <-- profile picture URL
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // optional if linked to a user
  },
  { timestamps: true }
);

module.exports = mongoose.model("Pharmacy", pharmacySchema);
