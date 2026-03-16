const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const ACCESS_EXPIRES = '15m';
const REFRESH_EXPIRES_SEC = 60 * 60 * 24 * 30; // 30 days in seconds
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Helper function to get consistent cookie options
function getCookieOptions(isRefreshToken = false) {
  const opts = {
    httpOnly: true,
    sameSite: 'none', // needed for cross-site (Vercel <-> Render)
    secure: true,     // required when sameSite='none'
    path: '/',        // apply to all routes
  };

  if (isRefreshToken) {
    opts.maxAge = REFRESH_EXPIRES_SEC * 1000;
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`Cookie options for ${isRefreshToken ? 'refresh' : 'access'} token:`, opts);
  }

  return opts;
}

function serializeUser(user) {
  return {
    id: user._id,
    fullName: user.fullName,
    email: user.email,
    authProvider: user.authProvider || 'password',
  };
}

async function verifyGoogleToken(idToken) {
  const verifyOptions = { idToken };
  if (process.env.GOOGLE_CLIENT_ID) {
    verifyOptions.audience = process.env.GOOGLE_CLIENT_ID;
  }

  const ticket = await googleClient.verifyIdToken(verifyOptions);
  const payload = ticket.getPayload();

  if (!payload?.sub || !payload?.email) {
    throw new Error('Google token missing required identity claims');
  }

  if (!payload.email_verified) {
    throw new Error('Google account email is not verified');
  }

  return payload;
}

// Debug endpoint to check stored tokens
router.get('/debug/tokens', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).send('Not found');
  }
  try {
    const { email } = req.query;
    const query = email ? { email: email.toLowerCase() } : {};
    const users = await User.find(query).select('email refreshToken');
    console.log('🔍 Debug - Stored tokens:', users.map(u => ({
      email: u.email,
      token: u.refreshToken ? `${u.refreshToken.substring(0,6)}...` : 'none'
    })));
    res.json({ users: users.map(u => ({
      email: u.email,
      tokenPrefix: u.refreshToken ? u.refreshToken.substring(0,6) : null
    }))});
  } catch (err) {
    console.error('Debug endpoint error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const { fullName, email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

  try {
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: 'User already exists' });

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const user = new User({ fullName: fullName || '', email: email.toLowerCase(), passwordHash: hash });
    await user.save();

    // create access token and refresh token
    const accessToken = jwt.sign({ id: user._id.toString(), email: user.email }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: ACCESS_EXPIRES });
    const refreshToken = crypto.randomBytes(40).toString('hex');
    user.refreshToken = refreshToken;
    await user.save();
    if (process.env.NODE_ENV !== 'production') {
      // dev helper: log a short prefix so we can compare cookie -> DB without exposing full token
      console.log(`Generated refresh token (signup) for ${user.email}:`, refreshToken ? `${refreshToken.substring(0,6)}...` : null);
    }

  try {
    // Set cookies with appropriate options
    const accessTokenOpts = getCookieOptions(false);
    const refreshTokenOpts = getCookieOptions(true);

    if (process.env.NODE_ENV !== 'production') {
      console.log('\n🍪 Setting Cookies:');
      console.log('Access Token Options:', accessTokenOpts);
      console.log('Refresh Token Options:', refreshTokenOpts);
    }

    // Try setting a simple test cookie first
    res.cookie('test_cookie', 'test_value', { 
      httpOnly: false,
      sameSite: 'none',
      secure: true,
      path: '/',
    
    });

    // Set auth cookies
   
res.cookie('refresh_token', refreshToken, {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  path: '/',
  maxAge: REFRESH_EXPIRES_SEC * 1000,
});

res.cookie('access_token', accessToken, {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  path: '/',
});

    // Log response headers and cookies in development
    if (process.env.NODE_ENV !== 'production') {
      console.log('\n📤 Response Headers:', res.getHeaders());
      console.log('\n🍪 Set-Cookie Header:', res.getHeader('Set-Cookie'));
    }

    // Send response with cookie debug info in development
    const responseData = {
      user: { id: user._id, fullName: user.fullName, email: user.email }
    };

    if (process.env.NODE_ENV !== 'production') {
      responseData._debug = {
        cookiesSet: {
          test: 'test_value',
          access: accessToken.substring(0, 10) + '...',
          refresh: refreshToken.substring(0, 6) + '...'
        },
        cookieOptions: {
          access: accessTokenOpts,
          refresh: refreshTokenOpts
        }
      };
    }

    res.json({
  ...responseData,
  refreshToken // 👈 send refresh token to frontend
});
  } catch (error) {
    console.error('Error setting cookies:', error);
    res.status(500).json({ message: 'Error setting cookies' });
  }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper to clear old tokens
async function clearOldTokens(email) {
  if (process.env.NODE_ENV !== 'production') {
    console.log('🧹 Clearing old tokens for:', email);
  }
  await User.updateMany(
    { email: email.toLowerCase() },
    { $unset: { refreshToken: 1 } }
  );
}

// POST /api/auth/signin
router.post('/signin', async (req, res) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('\n📥 Signin Request:');
    console.log('Headers:', {
      origin: req.headers.origin,
      referer: req.headers.referer,
      'user-agent': req.headers['user-agent']
    });
  }

  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    if (!user.passwordHash) {
      return res.status(401).json({ message: 'This account uses Google sign-in' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    // Clear any old tokens before generating new ones
    await clearOldTokens(email);

    const accessToken = jwt.sign({ id: user._id.toString(), email: user.email }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: ACCESS_EXPIRES });
    const refreshToken = crypto.randomBytes(40).toString('hex');
    user.refreshToken = refreshToken;
    
    // Save and verify the token was stored
    await user.save();
    const verifyUser = await User.findById(user._id);
    
    if (process.env.NODE_ENV !== 'production') {
      console.log('\n🔐 Token Storage Debug:');
      console.log(`📝 Generated refresh token for ${user.email}:`, refreshToken.substring(0,6) + '...');
      console.log('💾 Stored refresh token:', verifyUser.refreshToken ? verifyUser.refreshToken.substring(0,6) + '...' : 'none');
      console.log('📨 Request headers:', {
        origin: req.headers.origin,
        referer: req.headers.referer,
        'user-agent': req.headers['user-agent']
      });
      if (verifyUser.refreshToken !== refreshToken) {
        console.log('⚠️ WARNING: Token mismatch after save!');
      }
    }

  const sameSite = process.env.COOKIE_SAMESITE || 'none';
  const cookieOpts = { 
    httpOnly: true, 
    sameSite: sameSite,
    secure: sameSite === 'none' ? true : process.env.NODE_ENV === 'production', // must be secure if sameSite=none
    path: '/' // ensure cookie is available for all paths
  };
  res.cookie('access_token', accessToken, cookieOpts);
  res.cookie('refresh_token', refreshToken, { ...cookieOpts, maxAge: REFRESH_EXPIRES_SEC * 1000 });

   res.json({
  user: serializeUser(user),
  refreshToken // 👈 send refresh token to frontend
});
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/google', async (req, res) => {
  const { idToken } = req.body || {};
  if (!idToken) return res.status(400).json({ message: 'Google token required' });

  try {
    const googleProfile = await verifyGoogleToken(idToken);
    const email = String(googleProfile.email || '').toLowerCase().trim();

    let user = await User.findOne({ email });
    let created = false;

    if (!user) {
      user = new User({
        fullName: googleProfile.name || email.split('@')[0] || '',
        email,
        passwordHash: null,
        googleId: googleProfile.sub,
        authProvider: 'google',
      });
      created = true;
    } else {
      if (!user.fullName && googleProfile.name) {
        user.fullName = googleProfile.name;
      }
      if (!user.googleId) {
        user.googleId = googleProfile.sub;
      }
      if (!user.authProvider) {
        user.authProvider = user.passwordHash ? 'password' : 'google';
      }
    }

    await clearOldTokens(email);

    const accessToken = jwt.sign(
      { id: user._id.toString(), email: user.email },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: ACCESS_EXPIRES }
    );
    const refreshToken = crypto.randomBytes(40).toString('hex');

    user.refreshToken = refreshToken;
    await user.save();

    const sameSite = process.env.COOKIE_SAMESITE || 'none';
    const cookieOpts = {
      httpOnly: true,
      sameSite,
      secure: sameSite === 'none' ? true : process.env.NODE_ENV === 'production',
      path: '/',
    };

    res.cookie('access_token', accessToken, cookieOpts);
    res.cookie('refresh_token', refreshToken, { ...cookieOpts, maxAge: REFRESH_EXPIRES_SEC * 1000 });

    res.json({
      user: serializeUser(user),
      refreshToken,
      created,
    });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(401).json({ message: 'Google authentication failed' });
  }
});

module.exports = router;

// Refresh token endpoint
router.post('/refresh', async (req, res) => {
  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log('\n🔄 Refresh Token Debug:');
      console.log('📦 Request cookies:', req.cookies);
      console.log('📦 Request headers:', req.headers);
    }

    
    const refreshToken =
      req.headers['x-refresh-token'] ||
      req.cookies?.refresh_token ||
      req.body?.refresh_token;

    if (!refreshToken) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('❌ No refresh token found');
      }
      return res.status(401).json({ message: 'No refresh token' });
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('🔑 Received refresh token:', refreshToken.substring(0, 6) + '...');
    }

    const user = await User.findOne({ refreshToken });

    if (!user) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('❌ No user found with this refresh token');
        const anyUser = await User.findOne({});
        if (anyUser) {
          console.log('💡 Sample user token:', anyUser.refreshToken ? anyUser.refreshToken.substring(0, 6) + '...' : 'none');
        }
      }
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    const accessToken = jwt.sign(
      { id: user._id.toString(), email: user.email },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: ACCESS_EXPIRES }
    );

    const sameSite = process.env.COOKIE_SAMESITE || 'none';
    const cookieOpts = {
      httpOnly: true,
      sameSite: sameSite,
      secure: sameSite === 'none' ? true : process.env.NODE_ENV === 'production',
      path: '/',
    };

    res.cookie('access_token', accessToken, cookieOpts);
   res.json({
  accessToken, // ✅ send token in response body
  user: serializeUser(user),
});
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});
// Logout endpoint - clear cookies and remove refresh token
router.post('/logout', async (req, res) => {
  try {
    const { refresh_token } = req.cookies || {};
    if (refresh_token) {
      await User.updateOne({ refreshToken: refresh_token }, { $unset: { refreshToken: 1 } });
    }
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Me endpoint - validate access_token cookie
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : null;

    if (!token) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
      const user = await User.findById(payload.id).select('-passwordHash -refreshToken');
      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }
      return res.json({ user });
    } catch (err) {
      console.error('Access token verification failed:', err?.name || err);
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
  } catch (err) {
    console.error('Server error in /me:', err);
    res.status(500).json({ message: 'Server error' });
  }
});