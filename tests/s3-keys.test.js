const test = require("node:test");
const assert = require("node:assert/strict");

// Pure key/URL helpers only — no network, no credentials required.
const { buildS3Key, sanitizeSegment, keyFromUrl } = require("../utils/s3bucket");

test("builds a categorized key and strips unsafe characters", () => {
  const key = buildS3Key({
    category: "barcodes/images",
    scope: "ab12cd34",
    fileName: "my photo (1).png",
  });

  assert.match(key, /^barcodes\/images\/ab12cd34\/\d+-my-photo-1-\.png$/);
});

test("refuses to let a filename escape its prefix", () => {
  const key = buildS3Key({
    category: "barcodes/images",
    scope: "../../etc",
    fileName: "../../../etc/passwd",
  });

  assert.ok(!key.includes(".."), `key must not contain "..": ${key}`);
  assert.ok(key.startsWith("barcodes/images/"), key);
  assert.equal(key.split("/").length, 4);
});

test("falls back to safe defaults for empty segments", () => {
  assert.equal(sanitizeSegment("", "shared"), "shared");
  assert.equal(sanitizeSegment("///"), "misc");
  const key = buildS3Key({ fileName: "" });
  assert.match(key, /^misc\/shared\/\d+-file$/);
});

test("recovers the key from both S3 URL styles", () => {
  const key = "barcodes/videos/ab12cd34/1700000000-clip.mp4";
  const bucket = process.env.AWS_BUCKET_NAME;

  assert.equal(
    keyFromUrl(`https://${bucket}.s3.us-east-2.amazonaws.com/${key}`),
    key
  );
  // Path-style URLs only lose the bucket prefix when the bucket name is known.
  if (bucket) {
    assert.equal(
      keyFromUrl(`https://s3.us-east-2.amazonaws.com/${bucket}/${key}`),
      key
    );
  }
});

test("returns null rather than throwing on junk input", () => {
  assert.equal(keyFromUrl(""), null);
  assert.equal(keyFromUrl(null), null);
  assert.equal(keyFromUrl("not a url"), null);
});
