const User = require('../models/User');

const lastWriteTimes = {};

function trackAgentActivity(userId, req) {
  if (!userId) return;
  const now = Date.now();
  const lastWrite = lastWriteTimes[userId] || 0;
  
  // Throttle updates to once every 60 seconds per user to reduce database write load
  if (now - lastWrite > 60000) {
    lastWriteTimes[userId] = now;
    
    // Parse friendly device info from User-Agent header
    const userAgentStr = req.headers['user-agent'] || '';
    let deviceInfo = 'Unknown Device';
    
    if (userAgentStr.includes('iPhone')) {
      deviceInfo = 'iPhone App';
    } else if (userAgentStr.includes('iPad')) {
      deviceInfo = 'iPad App';
    } else if (userAgentStr.includes('Android')) {
      deviceInfo = 'Android App';
    } else if (userAgentStr.includes('Macintosh')) {
      deviceInfo = 'Mac (Browser)';
    } else if (userAgentStr.includes('Windows')) {
      deviceInfo = 'Windows PC (Browser)';
    } else if (userAgentStr.includes('Linux')) {
      deviceInfo = 'Linux (Browser)';
    } else if (userAgentStr.length > 0) {
      deviceInfo = userAgentStr.substring(0, 50); // limit string size
    }
    
    // Get client IP address
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || 'Unknown IP';
    
    // Perform update asynchronously to not block the request thread
    User.findByIdAndUpdate(userId, {
      lastActive: new Date(),
      ipAddress: ip,
      deviceInfo: deviceInfo
    }).catch(err => {
      console.error(`[AgentTracker] Error updating activity for user ${userId}:`, err.message);
    });
  }
}

module.exports = { trackAgentActivity };
