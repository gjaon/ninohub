// S3 asset storage — ported from the SellSquare repo (GJAON/SellSquare:
// utils/s3bucket.js + the uploader half of utils/fileDownload.js) so both apps
// share one bucket, one key layout, and the same env var names.
//
// Added here for Nino's needs: buffer/data-URL uploads (the browser posts base64
// data URLs as JSON, there is no multer/disk-file step) and object deletion.
require("aws-sdk/lib/maintenance_mode_message").suppress = true;
const fs = require("fs");
const AWS = require("aws-sdk");

const bucketName = process.env.AWS_BUCKET_NAME;
const region = process.env.AWS_BUCKET_REGION;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

const s3 = new AWS.S3({
  AWS_SDK_LOAD_CONFIG: 1,
  region: region,
  accessKeyId: accessKeyId,
  secretAccessKey: secretAccessKey,
});

// True when every credential is present. Call sites should check this before
// routing uploads to S3 so a missing key degrades to the existing behaviour
// instead of throwing at request time.
const isS3Configured = () =>
  Boolean(bucketName && region && accessKeyId && secretAccessKey);

// Sanitize a path segment so it's safe to use inside an S3 key.
// Strips slashes, control chars, leading/trailing dots; collapses repeats.
const sanitizeSegment = (raw, fallback = "misc") => {
  const s = String(raw || "")
    .replace(/[\\/]+/g, "-")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  return s || fallback;
};

// Build a categorized S3 key. Examples:
//   buildS3Key({ category: "barcodes/images", scope: "<slug>", fileName })
//     → "barcodes/images/<slug>/<timestamp>-<filename>"
const buildS3Key = ({ category, businessId, scope, fileName }) => {
  const cat = String(category || "misc")
    .split("/")
    .map((p) => sanitizeSegment(p))
    .filter(Boolean)
    .join("/");
  const owner = sanitizeSegment(scope || businessId || "shared", "shared");
  const safeName = sanitizeSegment(fileName, "file");
  return `${cat}/${owner}/${Date.now()}-${safeName}`;
};

// Core uploader. Everything else funnels through here so the key layout and
// ContentType handling stay consistent.
//
// opts: {
//   category: string  (e.g. "barcodes/images", "barcodes/videos")
//   businessId?: string
//   scope?: string    (preferred when scope isn't a business, e.g. a slug)
//   contentType?: string  (defaults to "application/octet-stream")
// }
const uploadBufferToS3 = async (body, fileName, opts = {}) => {
  const Key = buildS3Key({
    category: opts.category,
    businessId: opts.businessId,
    scope: opts.scope,
    fileName,
  });
  const ContentType =
    opts.contentType || opts.mimetype || "application/octet-stream";
  const params = { Bucket: bucketName, Body: body, Key, ContentType };
  return new Promise((resolve, reject) => {
    s3.upload(params, (err, response) => {
      if (err) {
        console.error("[s3] upload failed:", err.code || err.message);
        reject(err);
      } else {
        resolve(response);
      }
    });
  });
};

// Generic categorized uploader for a file already on disk (multer's
// `file.path`). Same signature as SellSquare's uploadAssetToS3.
const uploadAssetToS3 = async (filePath, fileName, opts = {}) =>
  uploadBufferToS3(fs.readFileSync(filePath), fileName, opts);

const DATA_URL_RE = /^data:([^;,]+);base64,(.+)$/i;

// Nino's browser clients post media as base64 data URLs inside JSON. Decode and
// store the real bytes so the document only keeps a URL.
// Returns { Location, Key, ContentType, bytes }.
const uploadDataUrlToS3 = async (dataUrl, opts = {}) => {
  const match = DATA_URL_RE.exec(String(dataUrl || ""));
  if (!match) throw new Error("Expected a base64 data URL");

  const contentType = match[1].toLowerCase();
  const body = Buffer.from(match[2], "base64");
  const extension = (contentType.split("/")[1] || "bin").split("+")[0];
  const fileName = opts.fileName || `asset.${extension}`;

  const response = await uploadBufferToS3(body, fileName, {
    ...opts,
    contentType,
  });
  return { ...response, ContentType: contentType, bytes: body.length };
};

// Uploads to s3 (legacy SellSquare signature — path in, { fileUrl } out).
async function uploadFile(file) {
  const fileStream = fs.createReadStream(file);
  const params = {
    Bucket: bucketName,
    Body: fileStream,
    Key: file,
    contentType: "application/pdf",
  };
  const res = await new Promise((resolve, reject) => {
    s3.upload(params, (error, data) =>
      error == null ? resolve(data) : reject(error)
    );
  });
  return { fileUrl: res.Location };
}

// Recover the S3 key from a stored object URL, so replaced/deleted records can
// clean up after themselves instead of leaking orphaned objects in the bucket.
const keyFromUrl = (url) => {
  const value = String(url || "");
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const path = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    if (!path) return null;
    // Path-style URLs (s3.<region>.amazonaws.com/<bucket>/<key>) include the
    // bucket; virtual-host style (<bucket>.s3...amazonaws.com/<key>) does not.
    if (bucketName && path.startsWith(`${bucketName}/`)) {
      return path.slice(bucketName.length + 1) || null;
    }
    return path;
  } catch (_error) {
    return null;
  }
};

// Best-effort delete. Never throws: losing an orphaned object is not a reason
// to fail the user's request.
const deleteAssetFromS3 = async (keyOrUrl) => {
  const Key = keyOrUrl && keyOrUrl.includes("://") ? keyFromUrl(keyOrUrl) : keyOrUrl;
  if (!Key) return false;
  try {
    await s3.deleteObject({ Bucket: bucketName, Key }).promise();
    return true;
  } catch (err) {
    console.error(`[s3] delete failed for "${Key}":`, err.code || err.message);
    return false;
  }
};

// Downloads from s3.
// ⚠️ The returned stream MUST have an "error" listener attached before piping —
// an unhandled stream error is an uncaughtException that kills the process.
// Prefer pipeFileToResponse() below for Express responses.
function getFileStream(key) {
  const downloadParams = { Key: key, Bucket: bucketName };
  return s3.getObject(downloadParams).createReadStream();
}

// Streams an S3 object into an Express response with the error path handled:
// a missing/forbidden object answers 404 JSON instead of crashing the process
// (S3 reports a missing key as AccessDenied when the IAM user lacks
// s3:ListBucket, so both map to "not found" here).
//
// opts: {
//   downloadName?: string       — sets Content-Disposition attachment
//   missingMessage?: string     — 404 body message override
//   onError?: (err) => void     — fire-and-forget hook (e.g. clear a stale
//                                 stored URL so a retry regenerates)
// }
function pipeFileToResponse(res, key, opts = {}) {
  const stream = s3
    .getObject({ Key: key, Bucket: bucketName })
    .createReadStream();

  stream.on("error", (err) => {
    console.error(`[s3] stream error for "${key}":`, err.code || err.message);
    try {
      if (typeof opts.onError === "function") opts.onError(err);
    } catch (_) {
      /* the hook must never break the response path */
    }
    if (!res.headersSent) {
      const missing =
        err.statusCode === 404 ||
        err.code === "NoSuchKey" ||
        err.code === "AccessDenied";
      res.status(missing ? 404 : 500).json({
        message: missing
          ? opts.missingMessage ||
            "That file isn't available anymore. Please generate it again."
          : "The file could not be retrieved. Please try again.",
      });
    } else {
      // Mid-stream failure after headers went out — terminate the socket so
      // the client sees a broken download instead of hanging forever.
      res.destroy(err);
    }
  });

  if (opts.downloadName) res.attachment(opts.downloadName);
  stream.pipe(res);
  return stream;
}

module.exports = {
  s3,
  isS3Configured,
  buildS3Key,
  sanitizeSegment,
  uploadBufferToS3,
  uploadAssetToS3,
  uploadDataUrlToS3,
  uploadFile,
  keyFromUrl,
  deleteAssetFromS3,
  getFileStream,
  pipeFileToResponse,
};
