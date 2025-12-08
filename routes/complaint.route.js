const express = require('express');
const { verifyToken, verifyRole } = require('../middleware/auth.middleware');
const { createComplaint, getAllComplaints, viewDetailComplaint, handleComplaint, deleteComplaint } = require('../controllers/complaint.cotroller');
const router = express.Router();

router.post('/', verifyToken, verifyRole('Patient'), createComplaint)
router.get('/', verifyToken, verifyRole('Manager', 'Patient'), getAllComplaints)
router.get('/:id', verifyToken, verifyRole('Manager'), viewDetailComplaint)
router.patch('/:id', verifyToken, verifyRole('Manager'), handleComplaint)
router.delete('/:id', verifyToken, verifyRole('Manager','Patient'),deleteComplaint)

module.exports = router;

