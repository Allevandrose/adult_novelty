const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    // Removed deprecated options
    const conn = await mongoose.connect(process.env.MONGODB_URI);

    logger.info(`✅ MongoDB Connected: ${conn.connection.host}`);
    
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected, attempting to reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });

  } catch (error) {
    logger.error('❌ MongoDB connection failed:', error.message);
    logger.warn('⚠️ Will retry connection...');
    setTimeout(connectDB, 5000);
  }
};

module.exports = connectDB;
