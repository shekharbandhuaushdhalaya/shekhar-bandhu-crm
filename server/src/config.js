module.exports = {
  port: parseInt(process.env.PORT, 10) || 5000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/shekhar-bandhu-crm',
  jwtSecret: process.env.JWT_SECRET || 'shekhar-bandhu-crm-jwt-secret-key-2026',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },
  allowedOrigins: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : [
        'http://localhost:3000',
        'http://localhost:8081',
        'http://localhost:19006',
        'https://shekhar-bandhu-crm.vercel.app',
      ],
};
