const asyncHandler = require("express-async-handler");
const Waitlist = require("../models/waitlistModel");
const { emitWaitlistCount } = require("../utils/waitlistRealtime");

// Add to waitlist
const joinWaitlist = asyncHandler(async (req, res) => {
  const { name, phone, email } = req.body;

  // Validation
  if (!name || !phone) {
    res.status(400);
    throw new Error("Name and phone are required");
  }

  // Check if phone already exists in waitlist
  const existingEntry = await Waitlist.findOne({ phone });
  if (existingEntry) {
    res.status(400);
    throw new Error("This phone number is already on the waitlist");
  }

  // Create waitlist entry
  const waitlistEntry = await Waitlist.create({
    name,
    phone,
    email: email || null,
  });

  await emitWaitlistCount(req.app.locals.io);

  res.status(201).json({
    success: true,
    message: "Successfully joined the waitlist!",
    data: waitlistEntry,
  });
});

// Get waitlist total count
const getWaitlistCount = asyncHandler(async (req, res) => {
  const count = await Waitlist.countDocuments();

  res.status(200).json({
    success: true,
    count,
  });
});

// Get all waitlist entries (admin only)
const getWaitlist = asyncHandler(async (req, res) => {
  const waitlist = await Waitlist.find().sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: waitlist.length,
    data: waitlist,
  });
});

// Update waitlist entry status (admin only)
const updateWaitlistStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!["pending", "contacted", "converted"].includes(status)) {
    res.status(400);
    throw new Error("Invalid status");
  }

  const waitlistEntry = await Waitlist.findByIdAndUpdate(
    id,
    { status },
    { new: true, runValidators: true }
  );

  if (!waitlistEntry) {
    res.status(404);
    throw new Error("Waitlist entry not found");
  }

  res.status(200).json({
    success: true,
    message: "Waitlist entry updated",
    data: waitlistEntry,
  });
});

module.exports = {
  joinWaitlist,
  getWaitlist,
  getWaitlistCount,
  updateWaitlistStatus,
};
