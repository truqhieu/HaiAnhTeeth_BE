const express = require('express');
const router = express.Router();
const policyController = require('../controllers/policy.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// Public routes - không cần authentication
router.get('/', policyController.getActivePolicies);

// Protected routes - cần authentication (chỉ admin/manager)
router.get('/all', verifyToken, policyController.getAllPolicies);
router.post('/', verifyToken, policyController.createPolicy);
router.put('/:id', verifyToken, policyController.updatePolicy);
router.delete('/:id', verifyToken, policyController.deletePolicy);

module.exports = router;
