const mongoose = require('mongoose');

const promotionSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Vui lòng điền tiêu đề ưu đãi dịch vụ'],
        trim: true,
    },
    description: {
        type: String,
        required: [true, 'Vui điền mô tả của ưu đãi dịch vụ'],
        trim: true,
    },
    discountType: {
        type: String,
        enum: ["Percent", "Fix"],
        trim: true,
    },
    discountValue: {
        type: Number,
        required: [true, 'Vui điền số tiền giảm của ưu đãi đối với dịch vụ'],
        trim: true,
    },
    applyToAll: {
        type: Boolean,
        default: true,
    },
    startDate: {
        type: Date,
        required: [true, 'Vui lòng nhập ngày bắt đầu ưu đãi giảm giá'],
        trim: true,
    },
    endDate: {
        type: Date,
        required: [true, 'Vui lòng nhập ngày kết thúc ưu đãi giảm giá'],
        trim: true,
    },
    status: {
        type: String,
        enum: ["Upcoming", "Active", "Expired", "Inactive"],
        default: "Upcoming",
    }
}, {
    timestamps: true
});


promotionSchema.virtual('currentStatus').get(function () {
    const now = new Date();
    if (now < this.startDate) return 'Upcoming';
    if (now >= this.startDate && now <= this.endDate) return 'Active';
    return 'Expired';
});

// 2. Method: Cập nhật status vào DB (khi cần)
promotionSchema.methods.syncStatus = async function () {
    const realStatus = this.currentStatus;
    if (this.status !== realStatus) {
        this.status = realStatus;
        await this.save();
    }
};

// 3. Static: Cập nhật tất cả (dùng cho cron)
promotionSchema.statics.syncAllStatuses = async function () {
    const now = new Date();

    await this.updateMany(
        { startDate: { $gt: now } },
        { status: 'Upcoming' }
    );

    await this.updateMany(
        { startDate: { $lte: now }, endDate: { $gte: now } },
        { status: 'Active' }
    );

    await this.updateMany(
        { endDate: { $lt: now } },
        { status: 'Expired' }
    );
};

module.exports = mongoose.model('Promotion', promotionSchema, 'promotions');