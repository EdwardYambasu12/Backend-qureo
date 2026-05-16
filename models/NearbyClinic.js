const mongoose = require("mongoose");

const nearbyClinicSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    area: { type: String, required: true, trim: true },
    eta: { type: String, required: true, trim: true },
    image: { type: String, default: "", trim: true },
    address: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("NearbyClinic", nearbyClinicSchema);
