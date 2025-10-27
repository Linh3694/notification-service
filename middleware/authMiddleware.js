const jwt = require('jsonwebtoken');

// Middleware xác thực token cho Notification Service (giống attendance service)
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ 
      success: false,
      message: "Authorization header missing or invalid",
      code: 'MISSING_TOKEN',
      timestamp: new Date().toISOString()
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const secret = process.env.JWT_SECRET || "breakpoint";
    const decoded = jwt.verify(token, secret);

    // Support multiple token formats (giống attendance service):
    // - Web app uses 'id' field
    // - Parent portal uses 'userId' field  
    // - Frappe JWT uses 'user' field (email)
    const userId = decoded.id || decoded.userId || decoded.user || decoded.sub || decoded.email || decoded.name;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false,
        message: "Invalid token structure",
        timestamp: new Date().toISOString()
      });
    }

    // Store user info from token (không cần database lookup)
    req.user = {
      _id: userId,
      name: userId,
      email: decoded.email || decoded.user || null,
      role: decoded.role || null,
      employeeCode: decoded.employeeCode || null,
      fullname: decoded.fullname || decoded.name || null
    };
    
    console.log(`✅ [Notification Service] User authenticated: ${userId}`);
    next();
  } catch (error) {
    console.warn('❌ [Notification Service] Token verification failed:', error.message);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Authentication failed',
      code: 'AUTH_FAILED'
    });
  }
};

// Optional authentication - doesn't fail if no token provided
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without authentication
      req.user = null;
      return next();
    }

    const token = authHeader.substring(7);
    
    if (!token) {
      req.user = null;
      return next();
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (!decoded) {
      req.user = null;
      return next();
    }

    // Get user from database
    const user = await database.get('User', decoded.userId || decoded.name);
    
    if (!user || user.disabled === 1) {
      req.user = null;
      return next();
    }

    // Add user to request object
    req.user = user;
    next();
    
  } catch (error) {
    // Token verification failed, continue without authentication
    req.user = null;
    next();
  }
};

// Admin authorization
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  const allowedRoles = ['admin', 'superadmin', 'technical'];
  
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }

  next();
};

// Super admin authorization
const requireSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  if (req.user.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      message: 'Super admin access required'
    });
  }

  next();
};

module.exports = {
  authenticate,
  optionalAuth,
  requireAdmin,
  requireSuperAdmin
}; 