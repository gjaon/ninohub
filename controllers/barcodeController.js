const asyncHandler = require("express-async-handler");
const crypto = require("crypto");
const Barcode = require("../models/barcodeModel");
const { isS3Configured, keyFromUrl } = require("../utils/s3bucket");
const {
  isOwnStorageUrl,
  storeMedia,
  persistItemsMedia,
  collectKeys,
  releaseKeys,
  orphanedKeys,
} = require("../services/barcodeStorage");

const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const MAX_TEXT_LENGTH = 4000;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_VIDEO_BYTES = 12 * 1024 * 1024;
const MAX_ITEMS = 12;

// Total budget for one barcode, measured on the *stored* payload (base64 data
// URLs, ~33% larger than the source file). Per-item limits alone are not enough:
// 12 items were individually legal but collectively blew past both the 20mb
// express.json() limit (a 413 before any handler ran) and MongoDB's hard 16MB
// per-document BSON limit. 10MB leaves headroom for JSON overhead under both.
// Keep in sync with MAX_TOTAL_BYTES in client/src/pages/BarcodeGenerator.js.
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
const ALLOWED_KINDS = new Set(["text", "url", "image", "video"]);
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

// Normalise a caller-supplied background colour to "#rrggbb" or "" if invalid.
const normalizeHexColor = (value) => {
  const raw = String(value || "").trim();
  if (!HEX_COLOR_RE.test(raw)) return "";
  const hex = raw.replace(/^#/, "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : hex;
  return `#${full.toLowerCase()}`;
};
const ALLOWED_IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);
const ALLOWED_VIDEO_MIME = new Set([
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
]);

const generateSlug = (length = 8) => {
  const bytes = crypto.randomBytes(length);
  let slug = "";
  for (let i = 0; i < length; i += 1) {
    slug += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  }
  return slug;
};

const isHttpUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_error) {
    return false;
  }
};

const parseDataUrl = (value) => {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(String(value || ""));
  if (!match) return null;
  return { mimeType: match[1].toLowerCase(), base64: match[2] };
};

const validateItem = (item) => {
  if (!item || typeof item !== "object") {
    throw new Error("Invalid item");
  }

  const kind = String(item.kind || "").toLowerCase();
  if (!ALLOWED_KINDS.has(kind)) {
    throw new Error("Invalid item type");
  }

  const rawContent = item.content;
  if (typeof rawContent !== "string" || !rawContent.trim()) {
    throw new Error(`${kind} content is required`);
  }

  const content = rawContent.trim();

  if (kind === "text") {
    if (content.length > MAX_TEXT_LENGTH) {
      throw new Error(`Text must be ${MAX_TEXT_LENGTH} characters or fewer`);
    }
    return { kind, content, mimeType: "", bgColor: normalizeHexColor(item.bgColor) };
  }

  if (kind === "url") {
    if (!isHttpUrl(content)) {
      throw new Error("Provide a valid http(s) URL");
    }
    return { kind, content, mimeType: "" };
  }

  // Media already uploaded to our bucket (via POST /api/barcodes/uploads, or
  // carried over when an existing barcode is edited). Store the URL as-is —
  // it was size- and type-checked when it was uploaded, and re-uploading it
  // would orphan the original object.
  if (isOwnStorageUrl(content)) {
    const declared = String(item.mimeType || "").toLowerCase();
    const allowed = kind === "image" ? ALLOWED_IMAGE_MIME : ALLOWED_VIDEO_MIME;
    return {
      kind,
      content,
      mimeType: allowed.has(declared) ? declared : "",
      // Always derived from the verified URL, never taken from the request: a
      // caller-supplied key would let a delete be aimed at any object in the
      // bucket, which SellSquare also writes to.
      storageKey: keyFromUrl(content) || "",
    };
  }

  const parsed = parseDataUrl(content);
  if (!parsed) {
    throw new Error(`${kind} must be a base64 data URL`);
  }

  const approxBytes = Math.floor((parsed.base64.length * 3) / 4);

  if (kind === "image") {
    if (!ALLOWED_IMAGE_MIME.has(parsed.mimeType)) {
      throw new Error("Unsupported image type");
    }
    if (approxBytes > MAX_IMAGE_BYTES) {
      throw new Error("Image is larger than 2MB limit");
    }
  } else {
    if (!ALLOWED_VIDEO_MIME.has(parsed.mimeType)) {
      throw new Error("Unsupported video type");
    }
    if (approxBytes > MAX_VIDEO_BYTES) {
      throw new Error("Video is larger than 12MB limit");
    }
  }

  return { kind, content, mimeType: parsed.mimeType };
};

const formatBytes = (bytes) => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

// Stored size of an item — the data URL / text as it lands in the document.
const itemBytes = (item) =>
  Buffer.byteLength(String(item.content || ""), "utf8") +
  Buffer.byteLength(String(item.mimeType || ""), "utf8");

const totalItemBytes = (items) =>
  items.reduce((sum, item) => sum + itemBytes(item), 0);

// Shared validation for create and update. Sets the response status and throws
// on the first problem; the caller lets express-async-handler surface it.
const validateItems = (items, res) => {
  if (!Array.isArray(items) || !items.length) {
    res.status(400);
    throw new Error("Add at least one piece of content");
  }

  if (items.length > MAX_ITEMS) {
    res.status(400);
    throw new Error(`A barcode can hold up to ${MAX_ITEMS} items`);
  }

  let validatedItems;
  try {
    validatedItems = items.map(validateItem);
  } catch (error) {
    res.status(400);
    throw error;
  }

  const hasUrl = validatedItems.some((item) => item.kind === "url");
  if (hasUrl && validatedItems.length > 1) {
    res.status(400);
    throw new Error("A link barcode cannot include other content");
  }

  const bytes = totalItemBytes(validatedItems);
  // The cap exists to keep the document under MongoDB's 16MB BSON limit. With
  // S3 configured, media never reaches the document — only a URL does — so the
  // only ceiling left is each file's own size limit, enforced above.
  if (!isS3Configured() && bytes > MAX_TOTAL_BYTES) {
    res.status(413);
    throw new Error(
      `This barcode holds ${formatBytes(bytes)} of content, over the ` +
        `${formatBytes(MAX_TOTAL_BYTES)} limit for a single code. Remove or ` +
        `shrink an item and try again.`
    );
  }

  return { validatedItems, bytes };
};

// MongoDB rejects oversized documents and quota-exhausted writes with messages
// no admin can act on. Translate the two we can actually hit.
const rethrowFriendlyWriteError = (error, res) => {
  const message = String(error?.message || "");
  if (/16793600|16777216|too large|BSONObj/i.test(message)) {
    res.status(413);
    throw new Error(
      `This barcode is too large to store (limit ${formatBytes(
        MAX_TOTAL_BYTES
      )}). Remove or shrink an item and try again.`
    );
  }
  if (/space quota|over your space/i.test(message)) {
    res.status(507);
    throw new Error(
      "The database is out of storage space. Delete some old barcodes, then try again."
    );
  }
  throw error;
};

const createBarcode = asyncHandler(async (req, res) => {
  const { items, label } = req.body || {};

  const { validatedItems, bytes } = validateItems(items, res);

  let slug = generateSlug();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await Barcode.exists({ slug });
    if (!existing) break;
    slug = generateSlug();
  }

  // Offload any inline media to S3 before writing, so the document stores URLs.
  const storedItems = await persistItemsMedia(validatedItems, { slug });

  let barcode;
  try {
    barcode = await Barcode.create({
      slug,
      label: typeof label === "string" ? label.trim().slice(0, 120) : "",
      items: storedItems,
    });
  } catch (error) {
    // The write failed, so nothing references the objects we just uploaded.
    await releaseKeys(collectKeys(storedItems));
    rethrowFriendlyWriteError(error, res);
  }

  res.status(201).json({
    success: true,
    data: {
      slug: barcode.slug,
      label: barcode.label,
      itemCount: barcode.items.length,
      kinds: barcode.items.map((item) => item.kind),
      bytes: totalItemBytes(storedItems),
      maxBytes: MAX_TOTAL_BYTES,
      storage: isS3Configured() ? "s3" : "inline",
      createdAt: barcode.createdAt,
    },
  });
});

const updateBarcode = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const { items, label } = req.body || {};

  const { validatedItems } = validateItems(items, res);

  const barcode = await Barcode.findOne({ slug });
  if (!barcode) {
    res.status(404);
    throw new Error("Barcode not found");
  }

  // Snapshot before mutating — needed to work out which objects this edit
  // orphans (a replaced image, a removed video).
  const previousItems = barcode.toObject().items || [];

  const storedItems = await persistItemsMedia(validatedItems, { slug });

  barcode.items = storedItems;
  if (typeof label === "string") {
    barcode.label = label.trim().slice(0, 120);
  }
  try {
    await barcode.save();
  } catch (error) {
    await releaseKeys(orphanedKeys(storedItems, previousItems));
    rethrowFriendlyWriteError(error, res);
  }

  // Only after the new items are safely persisted.
  await releaseKeys(orphanedKeys(previousItems, storedItems));

  res.status(200).json({
    success: true,
    data: {
      slug: barcode.slug,
      label: barcode.label,
      itemCount: barcode.items.length,
      kinds: barcode.items.map((item) => item.kind),
      bytes: totalItemBytes(storedItems),
      maxBytes: MAX_TOTAL_BYTES,
      storage: isS3Configured() ? "s3" : "inline",
      createdAt: barcode.createdAt,
    },
  });
});

const getBarcode = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const barcode = await Barcode.findOne({ slug });

  if (!barcode) {
    res.status(404);
    throw new Error("Barcode not found");
  }

  res.status(200).json({
    success: true,
    data: {
      slug: barcode.slug,
      label: barcode.label,
      items: barcode.items.map((item) => ({
        kind: item.kind,
        content: item.content,
        mimeType: item.mimeType,
        bgColor: item.bgColor || "",
        // Echoed so an edit can post the item back unchanged instead of
        // re-uploading media that is already in the bucket.
        storageKey: item.storageKey || "",
      })),
      createdAt: barcode.createdAt,
    },
  });
});

const listBarcodes = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);

  // Project in the database rather than loading whole documents: the list only
  // needs kinds, a standalone link, and a size. Selecting `items` pulled every
  // embedded base64 image and video into memory and down the wire — tens of MB
  // for a page that renders a few labels.
  const records = await Barcode.aggregate([
    { $sort: { createdAt: -1 } },
    { $limit: limit },
    {
      $project: {
        _id: 0,
        slug: 1,
        label: 1,
        createdAt: 1,
        bytes: { $bsonSize: "$$ROOT" },
        kinds: {
          $map: {
            input: { $ifNull: ["$items", []] },
            as: "item",
            in: "$$item.kind",
          },
        },
        targetUrl: {
          $let: {
            vars: { first: { $arrayElemAt: [{ $ifNull: ["$items", []] }, 0] } },
            in: {
              $cond: [
                {
                  $and: [
                    { $eq: [{ $size: { $ifNull: ["$items", []] } }, 1] },
                    { $eq: ["$$first.kind", "url"] },
                  ],
                },
                "$$first.content",
                null,
              ],
            },
          },
        },
      },
    },
  ]);

  const data = records.map((record) => ({
    slug: record.slug,
    label: record.label || "",
    kinds: record.kinds || [],
    targetUrl: record.targetUrl || null,
    bytes: record.bytes || 0,
    createdAt: record.createdAt,
  }));

  res.status(200).json({
    success: true,
    count: data.length,
    maxBytes: MAX_TOTAL_BYTES,
    totalBytes: data.reduce((sum, row) => sum + row.bytes, 0),
    data,
  });
});

const deleteBarcode = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const deleted = await Barcode.findOneAndDelete({ slug });

  if (!deleted) {
    res.status(404);
    throw new Error("Barcode not found");
  }

  // Nothing references these objects now.
  const released = await releaseKeys(collectKeys(deleted.toObject().items));

  res.status(200).json({
    success: true,
    data: { slug: deleted.slug, filesRemoved: released },
  });
});

// Single-file upload used by the builder. Media is uploaded one request at a
// time and the barcode payload then carries only URLs — that is what removes
// the old per-barcode ceiling, since files no longer have to share one request
// body or one document.
const uploadBarcodeMedia = asyncHandler(async (req, res) => {
  const { dataUrl, kind: rawKind, fileName } = req.body || {};
  const kind = String(rawKind || "").toLowerCase();

  if (kind !== "image" && kind !== "video") {
    res.status(400);
    throw new Error("Upload kind must be image or video");
  }

  if (!isS3Configured()) {
    // The client falls back to embedding the file in the barcode itself, which
    // still works but reimposes the shared size budget.
    res.status(503);
    throw new Error(
      "File storage is not configured, so media is stored inside the barcode."
    );
  }

  // Reuse the item rules so an upload can never be looser than a direct post.
  let validated;
  try {
    validated = validateItem({ kind, content: dataUrl });
  } catch (error) {
    res.status(400);
    throw error;
  }

  const stored = await storeMedia(validated.content, {
    kind,
    slug: "uploads",
    fileName: typeof fileName === "string" ? fileName : undefined,
  });

  res.status(201).json({
    success: true,
    data: {
      url: stored.content,
      storageKey: stored.storageKey,
      mimeType: stored.mimeType,
      bytes: stored.bytes,
    },
  });
});

module.exports = {
  createBarcode,
  updateBarcode,
  getBarcode,
  listBarcodes,
  deleteBarcode,
  uploadBarcodeMedia,
  // Exported for tests.
  validateItems,
  totalItemBytes,
  MAX_TOTAL_BYTES,
  MAX_ITEMS,
};
