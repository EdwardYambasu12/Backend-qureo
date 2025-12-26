const express = require('express');
const router = express.Router();
const searchCtrl = require('../controllers/search.controller');

// GET /api/search?q=term
router.get('/', searchCtrl.search);

module.exports = router;
