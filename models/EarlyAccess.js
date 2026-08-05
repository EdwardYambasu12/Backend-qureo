const mongoose = require("mongoose");

const earlyAccessSchema = new mongoose.Schema({
    name : {type: String, required: true},
    country : {type: String, required: true},
    intrestedAs : {type: String, required: true},
    email: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("EarlyAccess", earlyAccessSchema);