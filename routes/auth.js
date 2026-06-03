const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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

async function fetchGoogleProfileFromAccessToken(accessToken) {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Invalid Google access token');
  }

  const payload = await response.json();

  if (!payload?.sub || !payload?.email) {
    throw new Error('Google access token missing required identity claims');
  }

  if (!payload.email_verified) {
    throw new Error('Google account email is not verified');
  }

  return payload;
}

// POST /api/auth/signup (no JWT)
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

    res.json({
      user: serializeUser(user)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/signin (no JWT)
router.post('/signin', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    if (!user.passwordHash) {
      return res.status(401).json({ message: 'This account uses Google sign-in' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return res.status(401).json({ message: 'Password not correct.' });

    res.json({
      user: serializeUser(user)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/google', async (req, res) => {
  const { idToken, credential, accessToken } = req.body || {};
  const effectiveIdToken = idToken || credential;
  if (!effectiveIdToken && !accessToken) {
    return res.status(400).json({ message: 'Google token required' });
  }

  try {
    const googleProfile = effectiveIdToken
      ? await verifyGoogleToken(effectiveIdToken)
      : await fetchGoogleProfileFromAccessToken(accessToken);
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

    await user.save();

    res.json({
      user: serializeUser(user),
      created,
    });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(401).json({ message: 'Google authentication failed' });
  }
});

// /me endpoint (no JWT verification - return user by ID from query)
router.get('/me', async (req, res) => {
  try {
    const userId = req.query?.userId || req.body?.userId;

    if (!userId) {
      return res.status(400).json({ message: 'userId required' });
    }

    const user = await User.findById(userId).select('-passwordHash -refreshToken');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json({ user: serializeUser(user) });
  } catch (err) {
    console.error('Server error in /me:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Logout endpoint (no JWT needed)
router.post('/logout', async (req, res) => {
  try {
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;