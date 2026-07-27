const mongoose = require("mongoose");

const barcodeItemSchema = mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ["text", "url", "image", "video"],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      trim: true,
      default: "",
    },
    // S3 object key when the media lives in the bucket and `content` is a URL.
    // Empty for text, links, and legacy items whose base64 is stored inline.
    // Recorded so deletes and replacements can remove the exact object instead
    // of re-deriving it from the URL.
    storageKey: {
      type: String,
      trim: true,
      default: "",
    },
    // Background colour for a text note (hex, e.g. "#dc2626"). The scan view
    // derives the matching text colour from this, so only the background is
    // stored. Empty for non-text items.
    bgColor: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false }
);

const barcodeSchema = mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    label: {
      type: String,
      trim: true,
      default: "",
      maxlength: 120,
    },
    items: {
      type: [barcodeItemSchema],
      validate: {
        validator: (value) => Array.isArray(value) && value.length > 0,
        message: "At least one item is required",
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Barcode", barcodeSchema);
