const mongoose = require('mongoose');

const medicineSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    images: {
      type: [String],
      default: [],
    },
      pharmacy: {
    type: String,
    default: 'Qureo Pharmacy', 
  },
    price: {
      type: Number,
      required: true,
    },
    originalPrice: {
      type: Number,
      required: true,
    },
    discountPercent: {
      type: Number,
      default: 0, // will be auto-calculated
    },
    prescriptionRequired: {
      type: Boolean,
      default: false,
    },

    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    reviews: {
      type: Number,
      default: 0,
    },
    stock: {
      type: Map,
      of: Number,
      default: {},
    },
    available: {
      type: Boolean,
      default: true,
    },
    description: {
      type: String,
    },
    genericName: {
      type: String,
    },
    brandName: {
      type: String,
    },
    drugClass: {
      type: String,
    },
    featured: {
  type: Boolean,
  default: false,
},

    category: {
      type: String,
      enum: [
        'Pain Relief',
        'Cold & Flu',
        "OTC",
        'Antibiotics',
        "Syrups",
        "Injection",
        "Statins",
        "Ointment",
        "Potions",
        'Vitamins',
        'Allergy',
        'Heart & Blood Pressure',
        'Other',
      ],
      default: 'Other',
    },
    refundPolicy: {
      type: String,
    },
    shipping: {
      type: String,
      default: 'Free Shipping',
    },
        storageInstructions: { type: [String], default: [] }, // array of strings
    directions: { type: [String], default: [] }, // array of strings
  },
  { timestamps: true }
);

// 🔥 Auto-calculate discount before saving
medicineSchema.pre('save', function (next) {
  if (this.originalPrice && this.price) {
    this.discountPercent = Math.round(
      ((this.originalPrice - this.price) / this.originalPrice) * 100
    );
  }

  // automatically mark as unavailable if all stock quantities are 0
  const totalStock = Array.from(this.stock.values()).reduce((a, b) => a + b, 0);
  this.available = totalStock > 0;

  next();
});

module.exports = mongoose.model('Medicine', medicineSchema);
