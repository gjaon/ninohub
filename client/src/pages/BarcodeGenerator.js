import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { toast } from "sonner";
import {
  createBarcode,
  deleteBarcode,
  fetchBarcode,
  listBarcodes,
  updateBarcode,
  uploadBarcodeMedia,
} from "../services/barcodes";
import {
  renderShapedQrDataUrl,
  MODULE_STYLES,
  FRAME_SHAPES,
} from "../utils/shapedQrCode";
import {
  TEXT_BG_PRESETS,
  DEFAULT_TEXT_BG,
  getContrastText,
} from "../utils/textContrast";
import "./BarcodeGenerator.css";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_VIDEO_BYTES = 6 * 1024 * 1024;
const MAX_BLOCKS = 12;
// Total budget for one barcode, measured on the base64 data URLs actually sent
// and stored (~33% larger than the source files). Per-file limits alone let a
// legal set of blocks add up to more than the request body and MongoDB document
// limits allow, which failed late with an opaque "too large" error.
// Keep in sync with MAX_TOTAL_BYTES in controllers/barcodeController.js.
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
];
const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
];

const parseAdminAllowlist = () =>
  String(process.env.REACT_APP_ADMIN_EMAIL_ALLOWLIST || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

let blockCounter = 0;
const makeBlockId = () => {
  blockCounter += 1;
  return `blk-${Date.now().toString(36)}-${blockCounter}`;
};

const makeBlock = (kind, overrides = {}) => ({
  id: makeBlockId(),
  kind,
  content: "",
  mimeType: "",
  bgColor: kind === "text" ? DEFAULT_TEXT_BG : "",
  meta: null,
  // "s3" once the file has been uploaded and `content` holds its URL; "inline"
  // while the file is embedded as a base64 data URL (the fallback when the
  // server has no storage configured). Only inline media counts against the
  // shared size budget.
  storage: "inline",
  storageKey: "",
  ...overrides,
});

const KIND_LABEL = { text: "Text", image: "Image", video: "Video", url: "Link" };

// Rough byte size of a base64 data URL — used to show a sensible size on the
// media preview when loading an existing barcode for editing (we no longer
// have the original File object).
const approxBytesFromDataUrl = (dataUrl) => {
  const value = String(dataUrl || "");
  const comma = value.indexOf(",");
  const base64 = comma >= 0 ? value.slice(comma + 1) : value;
  return Math.floor((base64.length * 3) / 4);
};

const formatBytes = (bytes) => {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(value > 0 ? 1 : 0, Math.round(value / 1024))} KB`;
};

// Size a block contributes to the barcode document. Uploaded media costs only
// its URL; inline media is a base64 data URL (ASCII, so one char per byte);
// text is UTF-8 and short enough to measure exactly.
const blockBytes = (block) => {
  const content = String(block?.content || "");
  if (!content) return 0;
  if (block.kind === "text") {
    return typeof TextEncoder !== "undefined"
      ? new TextEncoder().encode(content).length
      : content.length;
  }
  return content.length;
};

const isInlineMedia = (block) =>
  block?.kind !== "text" && block?.storage !== "s3";

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });

const formatRelative = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const BarcodeGenerator = () => {
  const { isAuthenticated, currentUser } = useSelector((state) => state.user);
  const adminAllowlist = useMemo(parseAdminAllowlist, []);
  const isAdmin =
    isAuthenticated &&
    (Boolean(currentUser?.isAdmin) ||
      adminAllowlist.includes(String(currentUser?.email || "").toLowerCase()));

  // Ordered list of content blocks. Multiple blocks of the same kind are
  // allowed and their order is exactly what a scanner sees. A standalone Link
  // is exclusive, so it lives outside this list.
  const [blocks, setBlocks] = useState(() => [makeBlock("text")]);
  const [urlIncluded, setUrlIncluded] = useState(false);
  const [urlValue, setUrlValue] = useState("");

  const [label, setLabel] = useState("");
  const [moduleStyle, setModuleStyle] = useState("square");
  const [frameShape, setFrameShape] = useState("heart");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  // When set, the form edits an existing barcode (same slug) instead of
  // creating a new one. Generating then PUTs over the existing record.
  const [editingSlug, setEditingSlug] = useState(null);
  const [loadingEdit, setLoadingEdit] = useState(false);

  // Block ids with an upload in flight.
  const [uploading, setUploading] = useState({});

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Hidden file inputs, one per media block, keyed by block id.
  const fileInputs = useRef({});

  // Bytes that end up inside the barcode document: text, plus any media still
  // embedded as base64. Uploaded files live in storage and cost only a URL, so
  // they don't consume the budget.
  const inlineBytes = useMemo(
    () =>
      urlIncluded
        ? 0
        : blocks.reduce(
            (sum, b) => sum + (b.storage === "s3" ? 0 : blockBytes(b)),
            0
          ),
    [blocks, urlIncluded]
  );
  // Actual file size of everything uploaded — shown for information only.
  const uploadedBytes = useMemo(
    () =>
      urlIncluded
        ? 0
        : blocks.reduce(
            (sum, b) => sum + (b.storage === "s3" ? Number(b.meta?.size) || 0 : 0),
            0
          ),
    [blocks, urlIncluded]
  );
  const hasInlineMedia = !urlIncluded && blocks.some(isInlineMedia);
  const isUploading = Object.keys(uploading).length > 0;
  const overBudget = inlineBytes > MAX_TOTAL_BYTES;
  const usedPercent = Math.min(100, (inlineBytes / MAX_TOTAL_BYTES) * 100);

  const scanOrigin = useMemo(() => {
    const configured = (process.env.REACT_APP_SCAN_ORIGIN || "").trim();
    if (configured) return configured.replace(/\/+$/, "");
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  // Live style preview — uses a representative target so the chosen frame and
  // module style are reflected before the real code is generated.
  const stylePreview = useMemo(() => {
    try {
      return renderShapedQrDataUrl(`${scanOrigin}/scan/preview`, {
        size: 360,
        moduleStyle,
        frameShape,
        errorCorrectionLevel: "H",
      });
    } catch (_error) {
      return "";
    }
  }, [scanOrigin, moduleStyle, frameShape]);

  const resetResult = () => {
    setResult((value) => (value ? null : value));
  };

  const loadHistory = useCallback(async () => {
    if (!isAdmin) return;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await listBarcodes(50);
      setHistory(response?.data || []);
    } catch (error) {
      setHistoryError(error.message || "Could not load history");
    } finally {
      setHistoryLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (!pendingDelete) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape" && !deleting) {
        setPendingDelete(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pendingDelete, deleting]);

  useEffect(() => {
    if (!showPreview) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setShowPreview(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showPreview]);

  const handleConfirmDelete = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await deleteBarcode(pendingDelete.slug);
      setHistory((rows) => rows.filter((row) => row.slug !== pendingDelete.slug));
      if (result?.slug === pendingDelete.slug) setResult(null);
      if (editingSlug === pendingDelete.slug) {
        setEditingSlug(null);
      }
      toast.success("Barcode deleted");
      setPendingDelete(null);
    } catch (error) {
      toast.error(error.message || "Could not delete barcode");
    } finally {
      setDeleting(false);
    }
  };

  // ---- Block operations ------------------------------------------------

  const updateBlock = (id, patch) => {
    setBlocks((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
    resetResult();
  };

  const removeBlock = (id) => {
    setBlocks((rows) => rows.filter((row) => row.id !== id));
    delete fileInputs.current[id];
    resetResult();
  };

  const moveBlock = (id, dir) => {
    setBlocks((rows) => {
      const idx = rows.findIndex((row) => row.id === id);
      const j = idx + dir;
      if (idx === -1 || j < 0 || j >= rows.length) return rows;
      const next = [...rows];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
    resetResult();
  };

  const addBlock = (kind) => {
    if (urlIncluded) {
      toast.error("Turn off the standalone link to add content");
      return;
    }
    if (blocks.length >= MAX_BLOCKS) {
      toast.error(`A barcode can hold up to ${MAX_BLOCKS} items`);
      return;
    }
    setBlocks((rows) => [...rows, makeBlock(kind)]);
    resetResult();
  };

  const handleBlockFile = async (id, kind, file) => {
    if (!file) return;
    const allowed = kind === "image" ? ALLOWED_IMAGE_TYPES : ALLOWED_VIDEO_TYPES;
    const maxBytes = kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (!allowed.includes(file.type)) {
      toast.error(
        kind === "image"
          ? "Use a PNG, JPG, WebP, GIF, or SVG image"
          : "Use an MP4, WebM, OGG, or MOV video"
      );
      return;
    }
    if (file.size > maxBytes) {
      toast.error(
        kind === "image" ? "Image must be under 2MB" : "Video must be under 6MB"
      );
      return;
    }
    const meta = { name: file.name, size: file.size, type: file.type };

    try {
      const dataUrl = await readFileAsDataUrl(file);

      // Upload straight away so the file lives in storage and the barcode
      // itself only carries a URL. One request per file means a barcode's media
      // never has to fit in a single request body or a single document.
      setUploading((rows) => ({ ...rows, [id]: true }));
      try {
        const response = await uploadBarcodeMedia({
          dataUrl,
          kind,
          fileName: file.name,
        });
        updateBlock(id, {
          content: response?.data?.url,
          mimeType: response?.data?.mimeType || file.type,
          storage: "s3",
          storageKey: response?.data?.storageKey || "",
          meta,
        });
        return;
      } catch (error) {
        if (!error.storageDisabled) throw error;
        // No storage configured — embed the file instead. That reimposes the
        // shared budget, so check it before accepting the file.
        const otherBytes = blocks.reduce(
          (sum, b) => sum + (b.id === id || b.storage === "s3" ? 0 : blockBytes(b)),
          0
        );
        const nextTotal = otherBytes + String(dataUrl).length;
        if (nextTotal > MAX_TOTAL_BYTES) {
          toast.error(
            `That ${kind} pushes this barcode to ${formatBytes(
              nextTotal
            )}, over the ${formatBytes(
              MAX_TOTAL_BYTES
            )} limit. Remove another item or use a smaller file.`
          );
          if (fileInputs.current[id]) fileInputs.current[id].value = "";
          return;
        }
        updateBlock(id, {
          content: dataUrl,
          mimeType: file.type,
          storage: "inline",
          storageKey: "",
          meta,
        });
      }
    } catch (error) {
      toast.error(error.message || "Could not load file");
    } finally {
      setUploading((rows) => {
        const next = { ...rows };
        delete next[id];
        return next;
      });
    }
  };

  const clearBlockFile = (id) => {
    if (fileInputs.current[id]) fileInputs.current[id].value = "";
    // The uploaded object stays in storage until the barcode is saved without
    // it — the server removes whatever the new version no longer references.
    updateBlock(id, {
      content: "",
      mimeType: "",
      storage: "inline",
      storageKey: "",
      meta: null,
    });
  };

  const handleToggleUrl = () => {
    setUrlIncluded((value) => {
      const next = !value;
      resetResult();
      return next;
    });
  };

  // ---- Load an existing barcode into the builder ----------------------

  const loadBarcodeForEdit = async (slug) => {
    if (!slug || loadingEdit) return;
    setLoadingEdit(true);
    try {
      const response = await fetchBarcode(slug);
      const data = response?.data;
      const items = data?.items;
      if (!data || !Array.isArray(items) || !items.length) {
        throw new Error("Could not load this barcode");
      }

      const urlItem = items.find((item) => item.kind === "url");
      const isLinkOnly = items.length === 1 && Boolean(urlItem);

      if (isLinkOnly) {
        setUrlIncluded(true);
        setUrlValue(urlItem.content || "");
        setBlocks([]);
      } else {
        setUrlIncluded(false);
        setUrlValue("");
        const loaded = items
          .filter((item) => ["text", "image", "video"].includes(item.kind))
          .map((item) => {
            const content = item.content || "";
            // Media already in storage comes back as a URL; older barcodes
            // still carry their base64 inline.
            const stored = /^https?:\/\//i.test(content);
            return makeBlock(item.kind, {
              content,
              mimeType: item.mimeType || "",
              storage: stored ? "s3" : "inline",
              storageKey: item.storageKey || "",
              bgColor:
                item.kind === "text"
                  ? item.bgColor || DEFAULT_TEXT_BG
                  : "",
              meta:
                item.kind === "image" || item.kind === "video"
                  ? {
                      name: `Current ${item.kind}`,
                      size: stored ? 0 : approxBytesFromDataUrl(content),
                      type: item.mimeType || "",
                    }
                  : null,
            });
          });
        setBlocks(loaded.length ? loaded : [makeBlock("text")]);
      }

      fileInputs.current = {};
      setLabel(data.label || "");
      setEditingSlug(slug);
      setResult(null);

      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      toast.success("Loaded for editing");
    } catch (error) {
      toast.error(error.message || "Could not load this barcode");
    } finally {
      setLoadingEdit(false);
    }
  };

  const handleCancelEdit = () => {
    handleReset();
    toast.message("Switched to a new barcode");
  };

  // Build the ordered items array from the current builder state, validating as
  // we go. Returns null (after surfacing a toast) when something is missing.
  const buildItems = () => {
    if (urlIncluded) {
      const trimmed = urlValue.trim();
      try {
        const parsed = new URL(trimmed);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          throw new Error("Use an http or https link");
        }
      } catch (_error) {
        toast.error("Enter a valid http or https URL");
        return null;
      }
      return [{ kind: "url", content: trimmed }];
    }

    const items = [];
    for (const block of blocks) {
      if (block.kind === "text") {
        const trimmed = block.content.trim();
        if (!trimmed) {
          toast.error("Add some text or remove the text block");
          return null;
        }
        items.push({
          kind: "text",
          content: trimmed,
          bgColor: block.bgColor || DEFAULT_TEXT_BG,
        });
      } else if (block.kind === "image" || block.kind === "video") {
        if (!block.content) {
          toast.error(
            block.kind === "image"
              ? "Choose an image or remove the image block"
              : "Choose a video or remove the video block"
          );
          return null;
        }
        // storageKey lets the server match an unchanged item to the object it
        // already holds, instead of treating it as new and orphaning the old.
        items.push({
          kind: block.kind,
          content: block.content,
          mimeType: block.mimeType || "",
          storageKey: block.storageKey || "",
        });
      }
    }

    if (!items.length) {
      toast.error("Add at least one block of content");
      return null;
    }

    // Backstop for content that never went through the uploader (an edited
    // barcode loaded from the server, a long text block).
    if (overBudget) {
      toast.error(
        `This barcode holds ${formatBytes(inlineBytes)}, over the ${formatBytes(
          MAX_TOTAL_BYTES
        )} limit. Remove or shrink an item and try again.`
      );
      return null;
    }
    return items;
  };

  const handleGenerate = async (event) => {
    event.preventDefault();
    if (generating) return;

    const items = buildItems();
    if (!items) return;

    const payload = { items };
    if (label.trim()) payload.label = label.trim();

    const isLinkOnly = items.length === 1 && items[0].kind === "url";

    try {
      setGenerating(true);
      const response = editingSlug
        ? await updateBarcode(editingSlug, payload)
        : await createBarcode(payload);
      const slug = response?.data?.slug;
      if (!slug) {
        throw new Error(
          editingSlug ? "Could not update barcode" : "Could not create barcode"
        );
      }

      const qrTarget = isLinkOnly
        ? items[0].content
        : `${scanOrigin}/scan/${slug}`;

      // Styled modules can erode scan reliability, so always encode at the
      // highest error-correction level (H) and keep the code square inside the
      // decorative frame.
      const qrDataUrl = renderShapedQrDataUrl(qrTarget, {
        size: 640,
        moduleStyle,
        frameShape,
        errorCorrectionLevel: "H",
      });

      setResult({
        slug,
        scanUrl: qrTarget,
        qrDataUrl,
        label: response?.data?.label || "",
        kinds: response?.data?.kinds || [],
        isLinkOnly,
        moduleStyle,
        frameShape,
      });
      // Stay in edit mode for the resulting code so further tweaks update it in
      // place instead of spawning duplicates.
      setEditingSlug(slug);
      toast.success(editingSlug ? "Barcode updated" : "Barcode generated");
      loadHistory();
    } catch (error) {
      toast.error(
        error.message ||
          (editingSlug ? "Could not update barcode" : "Could not generate barcode")
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyLink = async () => {
    if (!result?.scanUrl) return;
    try {
      await navigator.clipboard.writeText(result.scanUrl);
      toast.success("Link copied");
    } catch (_error) {
      toast.error("Could not copy link");
    }
  };

  const handleDownload = () => {
    if (!result?.qrDataUrl) return;
    const link = document.createElement("a");
    link.href = result.qrDataUrl;
    link.download = `barcode-${result.slug}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShare = async () => {
    if (!result?.scanUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: result.label || "Scan this barcode",
          url: result.scanUrl,
        });
      } catch (_error) {
        // user cancelled
      }
    } else {
      handleCopyLink();
    }
  };

  const handleReset = () => {
    setBlocks([makeBlock("text")]);
    setUrlIncluded(false);
    setUrlValue("");
    setLabel("");
    setModuleStyle("square");
    setFrameShape("heart");
    setResult(null);
    setEditingSlug(null);
    fileInputs.current = {};
  };

  // Preview reflects exactly what a scanner will see. A standalone link has no
  // on-page content (it redirects), so we preview the blocks.
  const previewItems = urlIncluded
    ? urlValue.trim()
      ? [{ kind: "url", content: urlValue.trim() }]
      : []
    : blocks
        .filter((b) => b.content && (b.kind !== "text" || b.content.trim()))
        .map((b) => ({
          kind: b.kind,
          content: b.content,
          mimeType: b.mimeType,
          bgColor: b.bgColor,
        }));

  const includedCount = urlIncluded ? 1 : blocks.length;

  const renderBlock = (block, idx) => {
    const isText = block.kind === "text";
    const isImage = block.kind === "image";
    const canMoveUp = idx > 0;
    const canMoveDown = idx < blocks.length - 1;

    return (
      <fieldset key={block.id} className="barcode-section block-card active">
        <div className="section-header">
          <div className="section-title">
            <h3>
              <span className={`block-badge block-badge-${block.kind}`}>
                {KIND_LABEL[block.kind]}
              </span>
            </h3>
          </div>
          <div className="section-actions">
            {blocks.length > 1 && (
              <div className="section-reorder" aria-label="Reorder block">
                <button
                  type="button"
                  className="reorder-btn"
                  onClick={() => moveBlock(block.id, -1)}
                  disabled={!canMoveUp}
                  title="Move earlier"
                  aria-label="Move block earlier"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="reorder-btn"
                  onClick={() => moveBlock(block.id, 1)}
                  disabled={!canMoveDown}
                  title="Move later"
                  aria-label="Move block later"
                >
                  ↓
                </button>
              </div>
            )}
            <button
              type="button"
              className="block-remove-btn"
              onClick={() => removeBlock(block.id)}
              aria-label={`Remove ${KIND_LABEL[block.kind]} block`}
            >
              Remove
            </button>
          </div>
        </div>

        {isText && (
          <div className="form-group">
            <textarea
              value={block.content}
              onChange={(e) => updateBlock(block.id, { content: e.target.value })}
              placeholder="Type or paste anything — notes, contact info, a message..."
              rows="4"
              maxLength={4000}
            />
            <span className="char-count">{block.content.length}/4000 characters</span>

            <div className="text-color-field">
              <span className="style-field-label">Background colour</span>
              <div className="text-color-swatches">
                {TEXT_BG_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`color-swatch ${
                      block.bgColor?.toLowerCase() === preset.bg.toLowerCase()
                        ? "selected"
                        : ""
                    }`}
                    style={{
                      background: preset.bg,
                      color: getContrastText(preset.bg),
                    }}
                    onClick={() => updateBlock(block.id, { bgColor: preset.bg })}
                    title={preset.label}
                    aria-label={`${preset.label} background`}
                  >
                    Aa
                  </button>
                ))}
                <label className="color-swatch color-swatch-custom" title="Custom colour">
                  <input
                    type="color"
                    value={block.bgColor || DEFAULT_TEXT_BG}
                    onChange={(e) =>
                      updateBlock(block.id, { bgColor: e.target.value })
                    }
                    aria-label="Custom background colour"
                  />
                  <span aria-hidden="true">+</span>
                </label>
              </div>
              <div
                className="text-color-hint"
                style={{
                  background: block.bgColor || DEFAULT_TEXT_BG,
                  color: getContrastText(block.bgColor || DEFAULT_TEXT_BG),
                }}
              >
                Text stays readable on your chosen background.
              </div>
            </div>
          </div>
        )}

        {!isText && (
          <div className="form-group">
            {uploading[block.id] ? (
              <div className="image-dropzone is-uploading" aria-busy="true">
                <p>Uploading {block.kind}…</p>
                <span>{block.kind === "video" ? "Videos can take a moment" : "Almost there"}</span>
              </div>
            ) : !block.content ? (
              <div
                className="image-dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleBlockFile(block.id, block.kind, e.dataTransfer.files?.[0]);
                }}
                onClick={() => fileInputs.current[block.id]?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputs.current[block.id]?.click();
                  }
                }}
              >
                {isImage ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="9" cy="9" r="2" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" />
                  </svg>
                )}
                <p>Click to upload or drag and drop</p>
                <span>
                  {isImage
                    ? "PNG, JPG, WebP, GIF, SVG · up to 2MB"
                    : "MP4, WebM, OGG, MOV · up to 6MB"}
                </span>
              </div>
            ) : (
              <div className="image-preview">
                {isImage ? (
                  <img src={block.content} alt={block.meta?.name || "Preview"} />
                ) : (
                  <video src={block.content} muted playsInline preload="metadata" />
                )}
                <div className="image-meta">
                  <span className="image-name">{block.meta?.name}</span>
                  <span className="image-size">
                    {block.meta?.size
                      ? formatBytes(block.meta.size)
                      : block.storage === "s3"
                      ? "Stored"
                      : ""}
                  </span>
                  {block.storage === "s3" && (
                    <span className="image-badge" title="Uploaded to file storage">
                      Uploaded
                    </span>
                  )}
                  <button
                    type="button"
                    className="image-remove"
                    onClick={() => clearBlockFile(block.id)}
                  >
                    Replace
                  </button>
                </div>
              </div>
            )}
            <input
              ref={(el) => {
                if (el) fileInputs.current[block.id] = el;
              }}
              type="file"
              accept={(isImage ? ALLOWED_IMAGE_TYPES : ALLOWED_VIDEO_TYPES).join(",")}
              onChange={(e) => handleBlockFile(block.id, block.kind, e.target.files?.[0])}
              hidden
            />
          </div>
        )}
      </fieldset>
    );
  };

  if (!isAdmin) {
    return (
      <div className="barcode-page barcode-locked">
        <div className="barcode-locked-card">
          <h2>Admin access required</h2>
          <p>
            The barcode generator is available to admins only. Please log in
            with an admin account to continue.
          </p>
          {!isAuthenticated && (
            <Link to="/login" className="btn-primary">
              Log in
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="barcode-page">
      <header className="barcode-hero">
        <h1>Barcode Generator</h1>
        <p>
          Stack as many text notes, images, and videos as you like into a single
          scannable barcode. Anyone who scans it lands on a dedicated page with
          all of your content, in order.
        </p>
      </header>

      <div className="barcode-shell">
        <section className="barcode-form-card">
          {editingSlug && (
            <div className="edit-banner" role="status">
              <div className="edit-banner-text">
                <strong>Editing /{editingSlug}</strong>
                <span>
                  Add, change, reorder, or remove any block — saving updates this
                  existing code.
                </span>
              </div>
              <button
                type="button"
                className="edit-banner-new"
                onClick={handleCancelEdit}
                disabled={generating}
              >
                Start new
              </button>
            </div>
          )}

          <div className="barcode-summary">
            <span className="summary-pill">
              {urlIncluded
                ? "Standalone link"
                : `${includedCount} ${includedCount === 1 ? "block" : "blocks"}`}
            </span>
            <span className="summary-hint">
              Add multiple blocks — they appear together in the order below.
            </span>
          </div>

          {!urlIncluded && (uploadedBytes > 0 || hasInlineMedia) && (
            <div className={`capacity-meter ${overBudget ? "over" : ""}`}>
              <div className="capacity-head">
                <span className="capacity-label">
                  {hasInlineMedia ? "Barcode capacity" : "Media"}
                </span>
                <span className="capacity-value">
                  {hasInlineMedia
                    ? `${formatBytes(inlineBytes)} of ${formatBytes(
                        MAX_TOTAL_BYTES
                      )}`
                    : `${formatBytes(uploadedBytes)} uploaded`}
                </span>
              </div>
              {hasInlineMedia && (
                <div
                  className="capacity-track"
                  role="progressbar"
                  aria-valuenow={Math.round(usedPercent)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Barcode capacity used"
                >
                  <span
                    className="capacity-fill"
                    style={{ width: `${usedPercent}%` }}
                  />
                </div>
              )}
              <span className="capacity-hint">
                {overBudget
                  ? "Over the limit — remove or shrink an item to generate."
                  : hasInlineMedia
                  ? "File storage is unavailable, so media is stored inside the code and counts against this budget."
                  : "Files are uploaded to storage, so there's no shared size limit — only the per-file caps."}
              </span>
            </div>
          )}

          <form className="barcode-form" onSubmit={handleGenerate}>
            {!urlIncluded && (
              <>
                {blocks.length > 1 && (
                  <p className="reorder-hint">
                    Use the ↑ ↓ arrows to set the order content appears when
                    scanned.
                  </p>
                )}

                {blocks.map((block, idx) => renderBlock(block, idx))}

                <div className="add-block-row">
                  <span className="add-block-label">Add block</span>
                  <div className="add-block-buttons">
                    <button
                      type="button"
                      className="add-block-btn"
                      onClick={() => addBlock("text")}
                      disabled={blocks.length >= MAX_BLOCKS}
                    >
                      + Text
                    </button>
                    <button
                      type="button"
                      className="add-block-btn"
                      onClick={() => addBlock("image")}
                      disabled={blocks.length >= MAX_BLOCKS}
                    >
                      + Image
                    </button>
                    <button
                      type="button"
                      className="add-block-btn"
                      onClick={() => addBlock("video")}
                      disabled={blocks.length >= MAX_BLOCKS}
                    >
                      + Video
                    </button>
                  </div>
                </div>
              </>
            )}

            <fieldset className={`barcode-section ${urlIncluded ? "active" : ""}`}>
              <div className="section-header">
                <div className="section-title">
                  <h3>Link</h3>
                  <span>Stands alone — scans go straight to this URL</span>
                </div>
                <label className="section-toggle">
                  <input
                    type="checkbox"
                    checked={urlIncluded}
                    onChange={handleToggleUrl}
                  />
                  <span className="toggle-track" aria-hidden="true">
                    <span className="toggle-thumb" />
                  </span>
                  <span className="toggle-label">
                    {urlIncluded ? "On" : "Use link"}
                  </span>
                </label>
              </div>
              {urlIncluded && (
                <div className="form-group">
                  <input
                    id="url-input"
                    type="url"
                    value={urlValue}
                    onChange={(e) => {
                      setUrlValue(e.target.value);
                      resetResult();
                    }}
                    placeholder="https://example.com"
                    inputMode="url"
                    autoComplete="off"
                  />
                  <span className="form-hint">
                    A link barcode is exclusive — content blocks are turned off
                    while it's on.
                  </span>
                </div>
              )}
            </fieldset>

            <div className="form-group">
              <label htmlFor="label-input">
                Label <span className="optional">(optional)</span>
              </label>
              <input
                id="label-input"
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="A short name to recognize this barcode"
                maxLength={120}
              />
            </div>

            <fieldset className="barcode-section style-section active">
              <div className="section-header">
                <div className="section-title">
                  <h3>Shape &amp; style</h3>
                  <span>Make it a heart — or pick another look</span>
                </div>
              </div>

              <div className="style-grid">
                <div className="style-preview">
                  {stylePreview ? (
                    <img src={stylePreview} alt="QR style preview" />
                  ) : (
                    <div className="style-preview-empty">Preview</div>
                  )}
                </div>

                <div className="style-controls">
                  <div className="style-field">
                    <span className="style-field-label">Frame</span>
                    <div className="style-options">
                      {FRAME_SHAPES.map((shape) => (
                        <button
                          key={shape.id}
                          type="button"
                          className={`style-chip ${
                            frameShape === shape.id ? "selected" : ""
                          }`}
                          onClick={() => {
                            setFrameShape(shape.id);
                            resetResult();
                          }}
                        >
                          {shape.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="style-field">
                    <span className="style-field-label">Module style</span>
                    <div className="style-options">
                      {MODULE_STYLES.map((style) => (
                        <button
                          key={style.id}
                          type="button"
                          className={`style-chip ${
                            moduleStyle === style.id ? "selected" : ""
                          }`}
                          onClick={() => {
                            setModuleStyle(style.id);
                            resetResult();
                          }}
                        >
                          {style.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <p className="style-hint">
                    Codes are encoded at the highest error-correction level so
                    decorative styles stay scannable. Always test-scan before
                    printing.
                  </p>
                </div>
              </div>
            </fieldset>

            <div className="form-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={handleReset}
                disabled={generating}
              >
                Reset
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowPreview(true)}
                disabled={generating || previewItems.length === 0}
              >
                Preview
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={
                  generating || includedCount === 0 || overBudget || isUploading
                }
                title={
                  overBudget
                    ? `Over the ${formatBytes(MAX_TOTAL_BYTES)} limit`
                    : isUploading
                    ? "Waiting for uploads to finish"
                    : undefined
                }
              >
                {generating
                  ? editingSlug
                    ? "Updating..."
                    : "Generating..."
                  : editingSlug
                  ? "Update barcode"
                  : "Generate barcode"}
              </button>
            </div>
          </form>
        </section>

        <section
          className={`barcode-result-card ${result ? "has-result" : ""}`}
          aria-live="polite"
        >
          {result ? (
            <>
              <div className="qr-frame">
                <img src={result.qrDataUrl} alt="Generated barcode" />
              </div>
              {result.label && <p className="result-label">{result.label}</p>}
              {result.kinds?.length > 0 && (
                <div className="result-kinds">
                  {result.kinds.map((kind, idx) => (
                    <span key={`${kind}-${idx}`} className="result-kind-pill">
                      {kind}
                    </span>
                  ))}
                </div>
              )}
              <div className="result-link">
                <span className="result-link-label">
                  {result.isLinkOnly ? "Direct destination" : "Scan target"}
                </span>
                <code>{result.scanUrl}</code>
              </div>
              <div className="result-actions">
                <button type="button" className="btn-secondary" onClick={handleCopyLink}>
                  Copy link
                </button>
                <button type="button" className="btn-secondary" onClick={handleShare}>
                  Share
                </button>
                <button type="button" className="btn-primary" onClick={handleDownload}>
                  Download PNG
                </button>
              </div>
              <p className="result-hint">
                Scanning this code with any phone camera will open the dedicated
                page on this site.
              </p>
            </>
          ) : (
            <div className="result-empty">
              <div className="result-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <path d="M14 14h3v3h-3zM20 14h1v1M14 20h1v1M20 20h1v1" />
                </svg>
              </div>
              <h3>Your barcode will appear here</h3>
              <p>
                Stack any mix of text, images, and videos — or use a standalone
                link. Preview it, then generate a downloadable code and a
                shareable link.
              </p>
            </div>
          )}
        </section>
      </div>

      <section className="barcode-history">
        <div className="history-head">
          <h2>Previously generated</h2>
          <button
            type="button"
            className="history-refresh"
            onClick={loadHistory}
            disabled={historyLoading}
          >
            {historyLoading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {historyError && <p className="history-error">{historyError}</p>}

        {!historyError && history.length === 0 && !historyLoading && (
          <p className="history-empty">
            No barcodes yet. Generate one above to see it here.
          </p>
        )}

        {history.length > 0 && (
          <ul className="history-list">
            {history.map((entry) => (
              <li key={entry.slug} className="history-item">
                <div className="history-info">
                  <span className="history-label">
                    {entry.label || "Untitled barcode"}
                  </span>
                  <div className="history-kinds">
                    {(entry.kinds || []).map((kind, idx) => (
                      <span key={`${kind}-${idx}`} className="history-kind-pill">
                        {kind}
                      </span>
                    ))}
                  </div>
                  <span className="history-meta">
                    {formatRelative(entry.createdAt)} · /{entry.slug}
                    {entry.bytes ? ` · ${formatBytes(entry.bytes)}` : ""}
                  </span>
                </div>
                <div className="history-actions">
                  {entry.targetUrl ? (
                    <a
                      href={entry.targetUrl}
                      className="history-open"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open
                    </a>
                  ) : (
                    <Link
                      to={`/scan/${entry.slug}`}
                      className="history-open"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open
                    </Link>
                  )}
                  <button
                    type="button"
                    className="history-edit"
                    onClick={() => loadBarcodeForEdit(entry.slug)}
                    disabled={loadingEdit}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="history-delete"
                    onClick={() =>
                      setPendingDelete({
                        slug: entry.slug,
                        label: entry.label,
                        kinds: entry.kinds,
                      })
                    }
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {showPreview && (
        <div
          className="preview-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Barcode content preview"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPreview(false);
          }}
        >
          <div className="preview-modal">
            <div className="preview-modal-head">
              <div>
                <h3>Content preview</h3>
                <span>What people see after they scan</span>
              </div>
              <button
                type="button"
                className="preview-close"
                onClick={() => setShowPreview(false)}
                aria-label="Close preview"
              >
                ✕
              </button>
            </div>

            <div className="preview-phone">
              <div className="preview-screen">
                {urlIncluded ? (
                  <div className="preview-stage preview-stage-url">
                    <div className="preview-link-card">
                      <span className="preview-link-eyebrow">Link</span>
                      <p className="preview-link-url">
                        {urlValue.trim() || "https://example.com"}
                      </p>
                      <span className="preview-link-btn">Open link</span>
                      <p className="preview-redirect-note">
                        A standalone link redirects immediately — no page is shown.
                      </p>
                    </div>
                  </div>
                ) : previewItems.length ? (
                  previewItems.map((item, idx) => {
                    if (item.kind === "text") {
                      const bg = item.bgColor || DEFAULT_TEXT_BG;
                      return (
                        <div
                          key={idx}
                          className="preview-stage preview-stage-text"
                        >
                          <div
                            className="preview-note-card"
                            style={{ background: bg, color: getContrastText(bg) }}
                          >
                            <p>{item.content}</p>
                          </div>
                        </div>
                      );
                    }
                    if (item.kind === "image") {
                      return (
                        <div key={idx} className="preview-stage preview-stage-media">
                          <img src={item.content} alt="Preview" />
                        </div>
                      );
                    }
                    if (item.kind === "video") {
                      return (
                        <div key={idx} className="preview-stage preview-stage-media">
                          <video src={item.content} controls muted playsInline preload="metadata" />
                        </div>
                      );
                    }
                    return null;
                  })
                ) : (
                  <div className="preview-empty">Add content to preview</div>
                )}
              </div>
            </div>

            <p className="preview-foot">
              Scroll inside the phone to see each block. This is a close
              approximation of the live scan page.
            </p>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div
          className="confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-delete-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleting) {
              setPendingDelete(null);
            }
          }}
        >
          <div className="confirm-modal">
            <h3 id="confirm-delete-title">Delete this barcode?</h3>
            <p>
              <strong>{pendingDelete.label || "Untitled barcode"}</strong> will be
              removed permanently. Anyone who scans the code afterwards will see a
              "not found" message.
            </p>
            <div className="confirm-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={handleConfirmDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Delete barcode"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BarcodeGenerator;
