const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  phone: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true
  },
  code: { 
    type: String, 
    required: true 
  },
  expiresAt: { 
    type: Date, 
    required: true,
    index: { expires: 0 } // Expire at the specific date/time set in expiresAt
  }
}, { timestamps: true });

module.exports = mongoose.model('Otp', otpSchema);
