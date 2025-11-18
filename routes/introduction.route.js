const express = require('express');
const router = express.Router();
const upload = require('../config/multer');
const { verifyToken, verifyRole } = require('../middleware/auth.middleware');
const { createIntroduction, getAllIntroductions, viewDetailIntroduction, updateIntroduction } = require('../controllers/introduction.controller');

router.post('/introductions', verifyToken, verifyRole('Manager'), upload.single('thumbnailUrl'), createIntroduction);
router.get('/introductions', getAllIntroductions);
router.get('/introductions/:id', viewDetailIntroduction);
router.patch('/introductions/:id', verifyToken, verifyRole('Manager'), upload.single('thumbnailUrl'), updateIntroduction);
// router.delete('/introductions/:id', verifyToken, verifyRole('Manager'), deleteIntroduction);

module.exports = router;