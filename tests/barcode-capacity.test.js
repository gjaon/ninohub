const test = require("node:test");
const assert = require("node:assert/strict");

// The total-size cap guards the barcode *document*, so it only applies when
// media is stored inline. Force that mode before anything reads the env, so a
// developer with real AWS keys in .env still exercises this path.
delete process.env.AWS_BUCKET_NAME;
delete process.env.AWS_BUCKET_REGION;
delete process.env.AWS_ACCESS_KEY_ID;
delete process.env.AWS_SECRET_ACCESS_KEY;

const {
  connectTestDb,
  clearTestDb,
  disconnectTestDb,
} = require("./helpers/db");
const Barcode = require("../models/barcodeModel");
const {
  listBarcodes,
  validateItems,
  totalItemBytes,
  MAX_TOTAL_BYTES,
} = require("../controllers/barcodeController");

test.before(async () => {
  await connectTestDb();
});

test.after(async () => {
  await disconnectTestDb();
});

test.beforeEach(async () => {
  await clearTestDb();
});

// Minimal express double: records the status the controller set.
const makeRes = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

// A base64 data URL whose stored size is roughly `bytes`.
const dataUrlOfSize = (mimeType, bytes) =>
  `data:${mimeType};base64,${"A".repeat(Math.max(4, bytes))}`;

test("rejects a set of individually-legal media items that exceed the total budget", () => {
  const res = makeRes();
  // Two videos, each under the 12MB per-file cap, together over the total.
  const items = [
    { kind: "video", content: dataUrlOfSize("video/mp4", 6 * 1024 * 1024) },
    { kind: "video", content: dataUrlOfSize("video/mp4", 6 * 1024 * 1024) },
  ];

  assert.throws(
    () => validateItems(items, res),
    /over the .* limit for a single code/i
  );
  assert.equal(res.statusCode, 413);
});

test("accepts content that fits the budget and reports its stored size", () => {
  const res = makeRes();
  const items = [
    { kind: "text", content: "hello" },
    { kind: "image", content: dataUrlOfSize("image/png", 1024 * 1024) },
  ];

  const { validatedItems, bytes } = validateItems(items, res);
  assert.equal(res.statusCode, 200);
  assert.equal(validatedItems.length, 2);
  assert.ok(bytes > 1024 * 1024 && bytes < MAX_TOTAL_BYTES);
  assert.equal(bytes, totalItemBytes(validatedItems));
});

test("a barcode that passes validation stays under MongoDB's 16MB document limit", async () => {
  const res = makeRes();
  const items = Array.from({ length: 4 }, () => ({
    kind: "image",
    content: dataUrlOfSize("image/png", 2 * 1024 * 1024),
  }));

  const { validatedItems } = validateItems(items, res);
  const saved = await Barcode.create({ slug: "fitcheck", items: validatedItems });
  assert.ok(saved._id);
});

test("history list omits embedded media and reports each barcode's size", async () => {
  await Barcode.create({
    slug: "withmedia",
    label: "Has a video",
    items: [
      { kind: "text", content: "note" },
      {
        kind: "video",
        content: dataUrlOfSize("video/mp4", 512 * 1024),
        mimeType: "video/mp4",
      },
    ],
  });
  await Barcode.create({
    slug: "linkonly",
    items: [{ kind: "url", content: "https://example.com" }],
  });

  const res = makeRes();
  await listBarcodes({ query: {} }, res, () => {});

  assert.equal(res.body.success, true);
  assert.equal(res.body.count, 2);

  const rows = res.body.data;
  const media = rows.find((row) => row.slug === "withmedia");
  const link = rows.find((row) => row.slug === "linkonly");

  // The whole payload must stay small — no base64 blobs anywhere in it.
  const serialized = JSON.stringify(res.body);
  assert.ok(
    serialized.length < 2000,
    `list response should stay small, got ${serialized.length} bytes`
  );
  assert.ok(!serialized.includes("data:video/mp4"));

  assert.deepEqual(media.kinds, ["text", "video"]);
  assert.equal(media.targetUrl, null);
  assert.ok(media.bytes > 512 * 1024);

  assert.equal(link.targetUrl, "https://example.com");
  assert.deepEqual(link.kinds, ["url"]);
});
