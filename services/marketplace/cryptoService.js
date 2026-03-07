const crypto = require("crypto");

const getKey = () => {
  const secret = process.env.MARKETPLACE_SECRET_ENCRYPTION_KEY || "";
  return crypto.createHash("sha256").update(secret).digest();
};

const encrypt = (value) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
};

const decrypt = (ciphertext) => {
  const [ivHex, tagHex, dataHex] = String(ciphertext || "").split(":");
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Invalid ciphertext");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const result = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);

  return result.toString("utf8");
};

const hashValue = (value) =>
  crypto.createHash("sha256").update(String(value)).digest("hex");

module.exports = {
  encrypt,
  decrypt,
  hashValue,
};
