const mongoose = require("mongoose")

const Activity = new mongoose.Schema({
    userId : {type : mongoose.Schema.Types.ObjectId},
    message : String,
    createdAt: { type: Date, default: Date.now }
})



module.exports = mongoose.model("activities", Activity)