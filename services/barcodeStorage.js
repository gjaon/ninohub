// Media storage for barcodes.
//
// Images and videos used to live inside the barcode document as base64 data
// URLs, which capped a whole barcode at ~10MB (MongoDB's 16MB per-document BSON
// limit, and the request body limit before that). Media now goes to S3 and the
// document keeps only a URL, so the per-barcode ceiling disappears — each file
// is bounded by its own size limit instead of by the sum of all of them.
//
// When S3 is not configured (local dev without AWS keys, tests) every function
// degrades to the previous inline behaviour, so nothing here is a hard
// dependency on the network.
const {
  isS3Configured,
  uploadDataUrlToS3,
  deleteAssetFromS3,
  keyFromUrl,
} = require("../utils/s3bucket");

const DATA_URL_RE = /^data:([^;,]+);base64,(.+)$/i;

const isDataUrl = (value) => DATA_URL_RE.test(String(value || ""));

const isRemoteUrl = (value) => /^https?:\/\//i.test(String(value || ""));

const categoryFor = (kind) =>
  kind === "video" ? "barcodes/videos" : "barcodes/images";

// True only for URLs that resolve to an object in our own bucket. Item content
// arriving as a URL is accepted solely on this basis, so a caller cannot point
// a barcode at an arbitrary third-party host by hand-crafting a request.
const isOwnStorageUrl = (value) => {
  if (!isRemoteUrl(value)) return false;
  const bucket = process.env.AWS_BUCKET_NAME;
  if (!bucket) return false;
  try {
    const { hostname, pathname } = new URL(String(value));
    if (!/(^|\.)s3[.-][a-z0-9-]*\.?amazonaws\.com$/i.test(hostname)) return false;
    // Virtual-host style: <bucket>.s3.<region>.amazonaws.com/<key>
    if (hostname.startsWith(`${bucket}.`)) return true;
    // Path style: s3.<region>.amazonaws.com/<bucket>/<key> — the bucket segment
    // must match ours, otherwise this is somebody else's bucket.
    return decodeURIComponent(pathname.replace(/^\/+/, "")).startsWith(
      `${bucket}/`
    );
  } catch (_error) {
    return false;
  }
};

// Upload one data URL and return what the document should store.
// Returns null when S3 is off, telling the caller to keep the content inline.
const storeMedia = async (dataUrl, { kind, slug, fileName } = {}) => {
  if (!isS3Configured() || !isDataUrl(dataUrl)) return null;

  const uploaded = await uploadDataUrlToS3(dataUrl, {
    category: categoryFor(kind),
    scope: slug || "shared",
    fileName,
  });

  return {
    content: uploaded.Location,
    storageKey: uploaded.Key,
    mimeType: uploaded.ContentType,
    bytes: uploaded.bytes,
  };
};

// Move any inline media in `items` to S3, leaving text, links, and
// already-uploaded URLs untouched. Items keep their order.
//
// On failure every object written during this call is rolled back, so a partial
// upload never leaves orphans in the bucket that no document references.
const persistItemsMedia = async (items, { slug } = {}) => {
  if (!isS3Configured()) return items;

  const written = [];
  try {
    const persisted = [];
    for (const item of items) {
      if ((item.kind !== "image" && item.kind !== "video") || !isDataUrl(item.content)) {
        persisted.push(item);
        continue;
      }
      const stored = await storeMedia(item.content, {
        kind: item.kind,
        slug,
      });
      if (!stored) {
        persisted.push(item);
        continue;
      }
      written.push(stored.storageKey);
      persisted.push({
        ...item,
        content: stored.content,
        storageKey: stored.storageKey,
        mimeType: item.mimeType || stored.mimeType,
      });
    }
    return persisted;
  } catch (error) {
    await releaseKeys(written);
    throw error;
  }
};

// Storage keys referenced by a set of items. Falls back to deriving the key
// from the URL for documents written before `storageKey` was recorded.
//
// Deliberately narrow: only media items, and only URLs that point into our own
// bucket. A "url" item holds a user-supplied destination, and deriving a key
// from it would aim a delete at whatever path that URL happened to have — in a
// bucket shared with SellSquare, a link to ".../products/images/x.png" would
// resolve to a real object belonging to another app.
const MEDIA_KINDS = new Set(["image", "video"]);

const collectKeys = (items = []) =>
  items
    .map((item) => {
      if (!MEDIA_KINDS.has(item?.kind)) return null;
      if (item.storageKey) return item.storageKey;
      return isOwnStorageUrl(item?.content) ? keyFromUrl(item.content) : null;
    })
    .filter(Boolean);

// Best-effort cleanup. Never throws: a leftover object in the bucket must not
// fail the user's request. Note the IAM user needs s3:DeleteObject for this to
// actually remove anything.
const releaseKeys = async (keys = []) => {
  const unique = [...new Set(keys.filter(Boolean))];
  if (!unique.length || !isS3Configured()) return 0;
  const results = await Promise.all(unique.map((key) => deleteAssetFromS3(key)));
  return results.filter(Boolean).length;
};

// Keys held by `previous` that `next` no longer references — the objects an
// update orphaned.
const orphanedKeys = (previous = [], next = []) => {
  const kept = new Set(collectKeys(next));
  return collectKeys(previous).filter((key) => !kept.has(key));
};

module.exports = {
  isDataUrl,
  isRemoteUrl,
  isOwnStorageUrl,
  categoryFor,
  storeMedia,
  persistItemsMedia,
  collectKeys,
  releaseKeys,
  orphanedKeys,
};
