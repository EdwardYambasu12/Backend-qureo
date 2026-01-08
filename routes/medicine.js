const express = require('express');
const router = express.Router();
const Medicine = require('../models/Medicine');




// ✅ Add new medicine
router.post('/', async (req, res) => {
  try {
    const medicine = new Medicine(req.body);
    await medicine.save();
    res.status(201).json({ message: 'Medicine added successfully', medicine });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to add medicine', error });
  }
});

// ✅ Get all medicines
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;    // page number
    const limit = parseInt(req.query.limit) || 20; // items per page
    const skip = (page - 1) * limit;

    const medicines = await Medicine.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Medicine.countDocuments();

    res.json({
      medicines,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});


// ✅ Get medicine by category
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const medicines = await Medicine.find({ category });
    res.json({ medicines });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ Search by name or brand
// ✅ Enhanced search with related category results
// ✅ Enhanced search by name, brandName, or drugClass + related by category
router.get('/search/:query', async (req, res) => {
  try {
    const query = req.params.query;

    // 1️⃣ Main search: match by name, brandName, or drugClass
    const medicines = await Medicine.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { brandName: { $regex: query, $options: 'i' } },
        { drugClass: { $regex: query, $options: 'i' } },
        {category: { $regex: query, $options: 'i' } },
      ],
    });

    // 2️⃣ Related search: find similar category products
    let related = [];
    if (medicines.length > 0 && medicines[0].category) {
      related = await Medicine.find({
        category: medicines[0].category,
        _id: { $nin: medicines.map((m) => m._id) },
      }).limit(6);
    }

    // 3️⃣ Return both results
    res.json({
      results: medicines,
      related,
    });
  } catch (error) {
    console.error('❌ Search error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/:id/review', async (req, res) => {
  try {
    const { newRating } = req.body; // e.g. 5, 4, 3

    const medicine = await Medicine.findById(req.params.id);
    if (!medicine) return res.status(404).json({ message: 'Medicine not found' });

    // compute new average
    const totalReviews = medicine.reviews + 1;
    const newAverage = ((medicine.rating * medicine.reviews) + newRating) / totalReviews;

    medicine.rating = parseFloat(newAverage.toFixed(1));
    medicine.reviews = totalReviews;

    await medicine.save();
    res.json({ message: 'Review added', medicine });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update rating', error: err.message });
  }
});


// GET /api/medicines/related/:id
router.get('/related/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Find the current medicine
    const current = await Medicine.findById(id);
    if (!current) return res.status(404).json({ message: 'Medicine not found' });

    // Find related medicines by category or drugClass, excluding the current one
    const related = await Medicine.find({
      _id: { $ne: id },
      $or: [
        { category: current.category },
        { drugClass: current.drugClass },
      ]
    }).limit(8); // limit results for frontend display

    res.json({ related });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch related medicines', error: err.message });
  }
});

//✅Get Medicines with a specific pharmacy name

router.get("/pharmacy/:id", async(req, res)=>{
  try{
        const {id} = req.params
        const pharma = await Medicine.find({pharmacy : id})

        res.json({pharma})
  }

  catch(err){
    console.log(err)
    res.status(500).json({message: "faild to fetch pharmacy produce", error : err.message})
  }
})


// ✅ Get featured products
router.get('/featured', async (req, res) => {
  try {
    const featured = await Medicine.find({ featured: true }).limit(10);
    res.json({ featured });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch featured products', error: err.message });
  }
});

// ✅ Get best sellers (top 10 by reviews and rating)
router.get('/best-sellers', async (req, res) => {
  try {
    const bestSellers = await Medicine.find()
      .sort({ reviews: -1, rating: -1 }) // highest reviews first, then highest rating
      .limit(10);
    res.json({ bestSellers });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch best sellers', error: err.message });
  }
});

// ✅ Get low stock medicines
router.get('/low-stock', async (req, res) => {
  try {
    const medicines = await Medicine.find();
    const lowStock = medicines.filter(med => {
      const totalStock = Array.from(med.stock.values()).reduce((a, b) => a + b, 0);
      return totalStock <= 5;
    });
    res.json({ lowStock });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch low stock medicines', error: err.message });
  }
});

// ✅ Delete a medicine by ID
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const deletedMedicine = await Medicine.findByIdAndDelete(id);

    if (!deletedMedicine) {
      return res.status(404).json({ message: 'Medicine not found' });
    }

    res.json({
      message: 'Medicine deleted successfully',
      deletedMedicine,
    });
  } catch (err) {
    console.error('❌ Delete medicine error:', err);
    res.status(500).json({ message: 'Failed to delete medicine', error: err.message });
  }
});


router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const medicine = await Medicine.findById(id);

    if (!medicine) {
      return res.status(404).json({ message: 'Medicine not found' });
    }

    res.json({ medicine });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});
module.exports = router;
