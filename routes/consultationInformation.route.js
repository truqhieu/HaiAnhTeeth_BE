const express = require('express');
const { createForm } = require('../controllers/consultationInformation.controller');
const router = express.Router();


router.post('/create', createForm)


module.exports = router