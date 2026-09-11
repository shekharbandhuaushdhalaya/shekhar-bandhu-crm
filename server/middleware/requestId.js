const crypto = require('crypto');
module.exports = function requestId(req, res, next) {
  const supplied = req.headers['x-request-id'];
  const id = (typeof supplied === 'string' && supplied.length <= 128) ? supplied : crypto.randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
};
