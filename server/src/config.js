module.exports = {
  port: parseInt(process.env.PORT, 10) || 5000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/shekhar-bandhu-crm',
  jwtSecret: process.env.JWT_SECRET,
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },
};
