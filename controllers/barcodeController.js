const asyncHandler = require("express-async-handler");
const crypto = require("crypto");
const Barcode = require("../models/barcodeModel");

const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const MAX_TEXT_LENGTH = 4000;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_VIDEO_BYTES = 6 * 1024 * 1024;
const MAX_ITEMS = 4;
const ALLOWED_KINDS = new Set(["text", "url", "image", "video"]);
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
    return { kind, content, mimeType: "" };
  }

  if (kind === "url") {
    if (!isHttpUrl(content)) {
      throw new Error("Provide a valid http(s) URL");
    }
    return { kind, content, mimeType: "" };
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
      throw new Error("Video is larger than 6MB limit");
    }
  }

  return { kind, content, mimeType: parsed.mimeType };
};

const createBarcode = asyncHandler(async (req, res) => {
  const { items, label } = req.body || {};

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

  let slug = generateSlug();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await Barcode.exists({ slug });
    if (!existing) break;
    slug = generateSlug();
  }

  const barcode = await Barcode.create({
    slug,
    label: typeof label === "string" ? label.trim().slice(0, 120) : "",
    items: validatedItems,
  });

  res.status(201).json({
    success: true,
    data: {
      slug: barcode.slug,
      label: barcode.label,
      itemCount: barcode.items.length,
      kinds: barcode.items.map((item) => item.kind),
      createdAt: barcode.createdAt,
    },
  });
});

const updateBarcode = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const { items, label } = req.body || {};

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

  const barcode = await Barcode.findOne({ slug });
  if (!barcode) {
    res.status(404);
    throw new Error("Barcode not found");
  }

  barcode.items = validatedItems;
  if (typeof label === "string") {
    barcode.label = label.trim().slice(0, 120);
  }
  await barcode.save();

  res.status(200).json({
    success: true,
    data: {
      slug: barcode.slug,
      label: barcode.label,
      itemCount: barcode.items.length,
      kinds: barcode.items.map((item) => item.kind),
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
      })),
      createdAt: barcode.createdAt,
    },
  });
});

const listBarcodes = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);

  const records = await Barcode.find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("slug label items createdAt")
    .lean();

  const data = records.map((record) => {
    const items = record.items || [];
    const kinds = items.map((item) => item.kind);
    const isLinkOnly = items.length === 1 && items[0]?.kind === "url";
    return {
      slug: record.slug,
      label: record.label || "",
      kinds,
      targetUrl: isLinkOnly ? items[0].content : null,
      createdAt: record.createdAt,
    };
  });

  res.status(200).json({
    success: true,
    count: data.length,
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

  res.status(200).json({
    success: true,
    data: { slug: deleted.slug },
  });
});

module.exports = {
  createBarcode,
  updateBarcode,
  getBarcode,
  listBarcodes,
  deleteBarcode,
};
