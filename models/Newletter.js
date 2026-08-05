const mongoose = require('mongoose');

const newletterSchema = new mongoose.Schema({
    email: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Newletter', newletterSchema);