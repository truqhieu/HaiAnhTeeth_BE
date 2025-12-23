const mongoose = require('mongoose');

const promotionServiceSchema = new mongoose.Schema({
    promotionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Promotion',
        required: true
    },
    serviceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Service',
        required: true
    }
}, {
    timestamps: true
});

promotionServiceSchema.index({ promotionId: 1, serviceId: 1 }, { unique: true });

module.exports = mongoose.model('PromotionService', promotionServiceSchema, 'promotionservices');