const jwt = require('jsonwebtoken');

describe('Item 3: Socket.io Connection Authentication Middleware Unit Test', () => {
  const TEST_SECRET = 'socket_test_secret_123';

  const socketAuthMiddleware = (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Unauthorized: No authentication token provided'));
    }
    jwt.verify(token, TEST_SECRET, (err, user) => {
      if (err) {
        return next(new Error('Unauthorized: Invalid or expired token'));
      }
      socket.user = user;
      next();
    });
  };

  it('rejects handshake when token is missing', (done) => {
    const mockSocket = { handshake: { auth: {}, query: {} } };
    socketAuthMiddleware(mockSocket, (err) => {
      expect(err).toBeDefined();
      expect(err.message).toContain('Unauthorized');
      done();
    });
  });

  it('rejects handshake when token is invalid', (done) => {
    const mockSocket = { handshake: { auth: { token: 'invalid_token' }, query: {} } };
    socketAuthMiddleware(mockSocket, (err) => {
      expect(err).toBeDefined();
      expect(err.message).toContain('Unauthorized');
      done();
    });
  });

  it('authenticates handshake when token is valid', (done) => {
    const token = jwt.sign({ id: 'user1', name: 'Admin' }, TEST_SECRET);
    const mockSocket = { handshake: { auth: { token }, query: {} } };
    socketAuthMiddleware(mockSocket, (err) => {
      expect(err).toBeUndefined();
      expect(mockSocket.user.name).toBe('Admin');
      done();
    });
  });
});
