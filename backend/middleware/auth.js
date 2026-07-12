const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'transitops-dev-secret-change-in-production';

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Roles allowed to access a route. Admin always allowed.
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (req.user.role === 'Admin' || roles.includes(req.user.role)) return next();
    return res.status(403).json({ error: `Forbidden: requires one of [${roles.join(', ')}]` });
  };
}

module.exports = { authenticate, authorize, JWT_SECRET };
