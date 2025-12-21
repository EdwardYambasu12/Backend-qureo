const express = require("express")
const Activity = require("../models/Activities")



const router = express.Router()

router.post("/add-activity", async(req, res)=>{

    const {userId, message} = req.body

    try{

    const data = Activity.create({
        userId : userId, 
        message : message
    })
    res.status(201).json({body : "Activity added successfully"})
}

catch (e){
    res.status(500).json({body : "Error adding activity"})
}

})

router.get("/activities", async(req, res)=>{
    const {userId} = req.query

    try{
        const activities = await Activity.find({userId}).sort({createdAt: -1}).limit(10)
        res.status(200).json(activities)
    }
    catch (e){
        res.status(500).json({body : "Error fetching activities"})
    }
})



module.exports = router