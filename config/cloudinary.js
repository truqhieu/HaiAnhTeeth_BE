const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_SECRET_KEY, 
});

const deleteOldImage = async (imageId) => {
  try {
    await cloudinary.uploader.destroy(imageId);
    console.log(`✅ Đã xóa ảnh: ${imageId}`);
  } catch (error) {
    console.error('❌ Lỗi khi xóa ảnh Cloudinary:', error);
  }
};

module.exports = { cloudinary, deleteOldImage };
