const User = require('../models/user.model');

const DEFAULTS = {
  email: process.env.DEFAULT_ADMIN_EMAIL || 'admin@gmail.com',
  password: process.env.DEFAULT_ADMIN_PASSWORD || 'Thao123@',
  fullName: process.env.DEFAULT_ADMIN_FULLNAME || 'Admin',
  phoneNumber: process.env.DEFAULT_ADMIN_PHONE || '',
  address: process.env.DEFAULT_ADMIN_ADDRESS || '',
  gender: process.env.DEFAULT_ADMIN_GENDER || 'Other',
  avatar:
    process.env.DEFAULT_ADMIN_AVATAR ||
    'https://res.cloudinary.com/dglnkljzx/image/upload/v1763481608/introductions/fsqmwqvxihuw2hhodcnb.png'
};

const ensureAdminAccount = async () => {
  try {
    const { email } = DEFAULTS;
    const existingAdmin = await User.findOne({ email, role: 'Admin' });
    if (existingAdmin) {
      console.log(`✅ Admin ${email} already exists (role: Admin)`);
      return existingAdmin;
    }

    const admin = new User({
      fullName: DEFAULTS.fullName,
      email: DEFAULTS.email,
      passwordHash: DEFAULTS.password,
      phoneNumber: DEFAULTS.phoneNumber,
      address: DEFAULTS.address,
      gender: DEFAULTS.gender,
      avatar: DEFAULTS.avatar,
      role: 'Admin',
      status: 'Active'
    });

    await admin.save();
    console.log(`🎉 Default admin (${email}) created with password from env or fallback.`);
    return admin;
  } catch (error) {
    console.error('❌ Unable to ensure default admin account:', error);
    throw error;
  }
};

module.exports = ensureAdminAccount;

