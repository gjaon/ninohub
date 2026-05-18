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
