const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongod;

const connectTestDb = async () => {
  if (!mongod) {
    mongod = await MongoMemoryServer.create();
  }
  await mongoose.connect(mongod.getUri(), {
    dbName: "marketplace-tests",
  });
};

const clearTestDb = async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
};

const disconnectTestDb = async () => {
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
};

module.exports = {
  connectTestDb,
  clearTestDb,
  disconnectTestDb,
};
