const mongoose = require('mongoose');
const ensureAdminAccount = require('./seedAdmin');

const connectMongo = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    console.log('📍 MONGO_URI:', process.env.MONGO_URI ? 'Set' : 'Not set');
    
    // Kết nối với MongoDB với timeout settings  
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/healingmedicine';
    console.log('🔗 Connecting to:', mongoUri.includes('localhost') ? 'Local MongoDB' : 'MongoDB Atlas');
    
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    await ensureAdminAccount();
    
    // Xử lý các sự kiện kết nối
    mongoose.connection.on('connected', () => {
      console.log('Mongoose connected to MongoDB');
    });

    mongoose.connection.on('error', (err) => {
      console.error('Mongoose connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('Mongoose disconnected from MongoDB');
    });

  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);
    process.exit(1);
  }
};

// Gracefully close the connection when the app is terminated
process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed through app termination');
    process.exit(0);
  } catch (error) {
    console.error('Error closing MongoDB connection:', error);
    process.exit(1);
  }
});

module.exports = connectMongo;
  