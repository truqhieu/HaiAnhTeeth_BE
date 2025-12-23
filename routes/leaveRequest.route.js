const express = require('express');
const { verifyToken, verifyRole } = require('../middleware/auth.middleware');
const { createLeaveRequest, getAllLeaveRequest, handleLeaveRequest } = require('../controllers/leaveRequest.controller');
const router = express.Router();

router.post('/', verifyToken, verifyRole('Doctor','Nurse','Staff'), createLeaveRequest);
router.get('/', verifyToken, verifyRole('Manager','Doctor','Nurse','Staff'),getAllLeaveRequest);
router.patch('/:id',verifyToken, verifyRole('Manager'),handleLeaveRequest);

module.exports = router;