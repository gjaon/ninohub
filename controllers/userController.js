const asyncHandler = require("express-async-handler");
const User = require("../models/userModel");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { migrateSessionCart } = require("./cartController");

const generateAccessToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "1d" });
};

const generateRefreshToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });
};

const setAuthCookies = (res, accessToken, refreshToken) => {
  const isProduction =
    process.env.NODE_ENV === "production" ||
    process.env.NODE_ENV === "staging";
  const baseOptions = {
    path: "/",
    httpOnly: true,
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
  };

  res.cookie("accessToken", accessToken, {
    ...baseOptions,
    maxAge: 1000 * 60 * 60 * 24, // 1 day
  });

  res.cookie("refreshToken", refreshToken, {
    ...baseOptions,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  });
};

// Register User
const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password, sessionId } = req.body;

  // Validation
  if (!name || !email || !password) {
    res.status(400);
    throw new Error("Please fill in all required fields");
  }
  if (password.length < 6) {
    res.status(400);
    throw new Error("Password must be at least 6 characters");
  }

  // Check if user email already exists
  const userExists = await User.findOne({ email });

  if (userExists) {
    res.status(400);
    throw new Error("Email has already been registered");
  }

  // Create new user
  const user = await User.create({
    name,
    email,
    password,
  });

  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);
  user.refreshToken = refreshToken;
  await user.save();
  setAuthCookies(res, accessToken, refreshToken);

  // Migrate session cart to user cart if sessionId is provided
  if (sessionId) {
    await migrateSessionCart(user._id, sessionId);
  }

  if (user) {
    const { _id, name, email, photo, phone, bio } = user;
    res.status(201).json({
      _id,
      name,
      email,
      photo,
      phone,
      bio,
    });
  } else {
    res.status(400);
    throw new Error("Invalid user data");
  }
});

// Login User
const loginUser = asyncHandler(async (req, res) => {
  const { email, password, sessionId } = req.body;

  // Validate Request
  if (!email || !password) {
    res.status(400);
    throw new Error("Please add email and password");
  }

  // Check if user exists
  const user = await User.findOne({ email });

  if (!user) {
    res.status(400);
    throw new Error("User not found, please signup");
  }

  // User exists, check if password is correct
  const passwordIsCorrect = await bcrypt.compare(password, user.password);

  if (user && passwordIsCorrect) {
    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);
    user.refreshToken = refreshToken;
    await user.save();
    setAuthCookies(res, accessToken, refreshToken);
    
    // Migrate session cart to user cart if sessionId is provided
    if (sessionId) {
      await migrateSessionCart(user._id, sessionId);
    }
    
    const { _id, name, email, photo, phone, bio } = user;
    res.status(200).json({
      _id,
      name,
      email,
      photo,
      phone,
      bio,
    });
  } else {
    res.status(400);
    throw new Error("Invalid email or password");
  }
});

// Logout User
const logout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (refreshToken) {
    const user = await User.findOne({ refreshToken });
    if (user) {
      user.refreshToken = null;
      await user.save();
    }
  }

  const isProduction =
    process.env.NODE_ENV === "production" ||
    process.env.NODE_ENV === "staging";
  const clearOptions = {
    path: "/",
    httpOnly: true,
    expires: new Date(0),
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
  };

  res.cookie("accessToken", "", clearOptions);
  res.cookie("refreshToken", "", clearOptions);
  return res.status(200).json({ message: "Successfully Logged Out" });
});

// Get User Data
const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    const { _id, name, email, photo, phone, bio } = user;
    res.status(200).json({
      _id,
      name,
      email,
      photo,
      phone,
      bio,
    });
  } else {
    res.status(400);
    throw new Error("User Not Found");
  }
});

// Get Login Status
const loginStatus = asyncHandler(async (req, res) => {
  const token = req.cookies.accessToken;
  if (!token) {
    return res.json(false);
  }
  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    if (verified) {
      return res.json(true);
    }
    return res.json(false);
  } catch (error) {
    return res.json(false);
  }
});

// Refresh Access Token
const refreshAccessToken = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) {
    res.status(401);
    throw new Error("Refresh token missing");
  }

  const verified = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  const user = await User.findById(verified.id);

  if (!user || user.refreshToken !== refreshToken) {
    res.status(401);
    throw new Error("Invalid refresh token");
  }

  const newAccessToken = generateAccessToken(user._id);
  const newRefreshToken = generateRefreshToken(user._id);
  user.refreshToken = newRefreshToken;
  await user.save();
  setAuthCookies(res, newAccessToken, newRefreshToken);

  res.status(200).json({ message: "Token refreshed" });
});

// Update User
const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    const { name, email, photo, phone, bio } = user;
    user.email = email;
    user.name = req.body.name || name;
    user.phone = req.body.phone || phone;
    user.bio = req.body.bio || bio;
    user.photo = req.body.photo || photo;

    const updatedUser = await user.save();
    res.status(200).json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      photo: updatedUser.photo,
      phone: updatedUser.phone,
      bio: updatedUser.bio,
    });
  } else {
    res.status(404);
    throw new Error("User not found");
  }
});

// Change Password
const changePassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const { oldPassword, password } = req.body;

  if (!user) {
    res.status(400);
    throw new Error("User not found, please signup");
  }
  //Validate
  if (!oldPassword || !password) {
    res.status(400);
    throw new Error("Please add old and new password");
  }

  // check if old password matches password in DB
  const passwordIsCorrect = await bcrypt.compare(oldPassword, user.password);

  // Save new password
  if (user && passwordIsCorrect) {
    user.password = password;
    await user.save();
    res.status(200).send("Password change successful");
  } else {
    res.status(400);
    throw new Error("Old password is incorrect");
  }
});

module.exports = {
  registerUser,
  loginUser,
  logout,
  refreshAccessToken,
  getUser,
  loginStatus,
  updateUser,
  changePassword,
};
