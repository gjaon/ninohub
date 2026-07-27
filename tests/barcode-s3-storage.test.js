const test = require("node:test");
const assert = require("node:assert/strict");

// The bucket name must be set before the storage module reads it.
process.env.AWS_BUCKET_NAME = process.env.AWS_BUCKET_NAME || "test-bucket";

const {
  isOwnStorageUrl,
  collectKeys,
  orphanedKeys,
  categoryFor,
} = require("../services/barcodeStorage");

const BUCKET = process.env.AWS_BUCKET_NAME;

test("media is filed under a per-kind prefix", () => {
  assert.equal(categoryFor("image"), "barcodes/images");
  assert.equal(categoryFor("video"), "barcodes/videos");
});

test("accepts URLs from our own bucket in both S3 URL styles", () => {
  assert.ok(
    isOwnStorageUrl(
      `https://${BUCKET}.s3.us-east-2.amazonaws.com/barcodes/images/x/1-a.png`
    )
  );
  assert.ok(
    isOwnStorageUrl(
      `https://s3.us-east-2.amazonaws.com/${BUCKET}/barcodes/images/x/1-a.png`
    )
  );
});

test("rejects URLs that are not objects in our bucket", () => {
  // Somebody else's bucket, virtual-host style.
  assert.equal(
    isOwnStorageUrl("https://other-bucket.s3.us-east-2.amazonaws.com/x.png"),
    false
  );
  // Somebody else's bucket, path style.
  assert.equal(
    isOwnStorageUrl(`https://s3.us-east-2.amazonaws.com/other-bucket/x.png`),
    false
  );
  // A host merely containing the bucket name.
  assert.equal(isOwnStorageUrl(`https://evil.com/${BUCKET}/x.png`), false);
  // A subdomain attack: bucket name as a prefix of another host.
  assert.equal(
    isOwnStorageUrl(`https://${BUCKET}.s3.us-east-2.amazonaws.com.evil.com/x.png`),
    false
  );
  assert.equal(isOwnStorageUrl("data:image/png;base64,AAAA"), false);
  assert.equal(isOwnStorageUrl(""), false);
});

test("collects keys from stored items and ignores inline ones", () => {
  const items = [
    { kind: "text", content: "hi" },
    { kind: "image", content: "data:image/png;base64,AAAA" },
    {
      kind: "video",
      content: `https://${BUCKET}.s3.us-east-2.amazonaws.com/barcodes/videos/x/1-v.mp4`,
      storageKey: "barcodes/videos/x/1-v.mp4",
    },
  ];

  assert.deepEqual(collectKeys(items), ["barcodes/videos/x/1-v.mp4"]);
});

test("derives the key from the URL when storageKey was never recorded", () => {
  const items = [
    {
      kind: "image",
      content: `https://${BUCKET}.s3.us-east-2.amazonaws.com/barcodes/images/x/1-a.png`,
    },
  ];

  assert.deepEqual(collectKeys(items), ["barcodes/images/x/1-a.png"]);
});

test("an edit orphans only the objects it stopped referencing", () => {
  const kept = { kind: "image", content: "u", storageKey: "barcodes/images/x/kept.png" };
  const replaced = {
    kind: "video",
    content: "u",
    storageKey: "barcodes/videos/x/old.mp4",
  };
  const added = {
    kind: "video",
    content: "u",
    storageKey: "barcodes/videos/x/new.mp4",
  };

  const previous = [kept, replaced];
  const next = [kept, added];

  assert.deepEqual(orphanedKeys(previous, next), ["barcodes/videos/x/old.mp4"]);
  // And in reverse — what a rollback would need to remove.
  assert.deepEqual(orphanedKeys(next, previous), ["barcodes/videos/x/new.mp4"]);
});

// ── Legacy barcodes: created before S3, media stored inline as base64 ────────

test("a legacy link barcode never yields a storage key", () => {
  // Regression: deriving a key from a user-supplied destination aimed deletes
  // at arbitrary objects — and this bucket is shared with SellSquare, whose
  // product images live under exactly this prefix.
  const items = [
    { kind: "url", content: "https://shop.example.com/products/images/hero.png" },
  ];

  assert.deepEqual(collectKeys(items), []);
  assert.deepEqual(orphanedKeys(items, []), []);
});

test("a legacy barcode with inline base64 media yields no storage keys", () => {
  const items = [
    { kind: "text", content: "an old note" },
    { kind: "image", content: "data:image/png;base64,AAAA", mimeType: "image/png" },
    { kind: "video", content: "data:video/mp4;base64,BBBB", mimeType: "video/mp4" },
  ];

  // Nothing to delete: none of this lives in the bucket.
  assert.deepEqual(collectKeys(items), []);
  // Deleting such a barcode releases nothing.
  assert.deepEqual(orphanedKeys(items, []), []);
});

test("a media item cannot smuggle in a storage key for someone else's object", () => {
  // storageKey is server-derived, but guard the helper too: only keys attached
  // to media items are ever considered.
  const items = [
    { kind: "url", content: "https://example.com", storageKey: "products/images/x/a.png" },
    { kind: "text", content: "hi", storageKey: "products/images/x/b.png" },
  ];

  assert.deepEqual(collectKeys(items), []);
});

test("re-saving an unchanged barcode orphans nothing", () => {
  const items = [
    { kind: "text", content: "note" },
    { kind: "image", content: "u", storageKey: "barcodes/images/x/a.png" },
  ];

  assert.deepEqual(orphanedKeys(items, items), []);
});
