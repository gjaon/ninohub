const express = require("express");
const router = express.Router();
const {
  registerUser,
  loginUser,
  logout,
  refreshAccessToken,
  getUser,
  loginStatus,
  updateUser,
  changePassword,
} = require("../controllers/userController");
const protect = require("../middleware/authMiddleware");

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/refresh", refreshAccessToken);
router.get("/logout", logout);
router.get("/getuser", protect, getUser);
router.get("/loggedin", loginStatus);
router.patch("/updateuser", protect, updateUser);
router.patch("/changepassword", protect, changePassword);

module.exports = router;
