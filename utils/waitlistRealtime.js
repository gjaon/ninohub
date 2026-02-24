const Waitlist = require("../models/waitlistModel");

const WAITLIST_COUNT_EVENT = "waitlist:count:updated";

const getWaitlistCount = async () => {
  return Waitlist.countDocuments();
};

const emitWaitlistCount = async (io, socketId = null) => {
  if (!io) return;

  const count = await getWaitlistCount();
  const payload = { count };

  if (socketId) {
    io.to(socketId).emit(WAITLIST_COUNT_EVENT, payload);
    return;
  }

  io.emit(WAITLIST_COUNT_EVENT, payload);
};

const startWaitlistChangeStream = (io) => {
  try {
    const stream = Waitlist.watch();

    stream.on("change", async () => {
      try {
        await emitWaitlistCount(io);
      } catch (error) {
        console.error("Failed to emit waitlist count update:", error.message);
      }
    });

    stream.on("error", (error) => {
      console.warn("Waitlist change stream unavailable:", error.message);
    });

    return stream;
  } catch (error) {
    console.warn("Failed to start waitlist change stream:", error.message);
    return null;
  }
};

module.exports = {
  WAITLIST_COUNT_EVENT,
  emitWaitlistCount,
  startWaitlistChangeStream,
};
