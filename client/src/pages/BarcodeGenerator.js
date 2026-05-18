import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import QRCode from "qrcode";
import { toast } from "sonner";
import { createBarcode, deleteBarcode, listBarcodes } from "../services/barcodes";
import "./BarcodeGenerator.css";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_VIDEO_BYTES = 6 * 1024 * 1024;
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

const SectionHeader = ({ title, subtitle, included, onToggle }) => (
  <div className="section-header">
    <div className="section-title">
      <h3>{title}</h3>
      <span>{subtitle}</span>
    </div>
    <label className="section-toggle">
      <input type="checkbox" checked={included} onChange={onToggle} />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
      <span className="toggle-label">{included ? "Included" : "Add"}</span>
    </label>
  </div>
);

const BarcodeGenerator = () => {
  const { isAuthenticated, currentUser } = useSelector((state) => state.user);
  const adminAllowlist = useMemo(parseAdminAllowlist, []);
  const isAdmin =
    isAuthenticated &&
    (Boolean(currentUser?.isAdmin) ||
      adminAllowlist.includes(String(currentUser?.email || "").toLowerCase()));

  const [textIncluded, setTextIncluded] = useState(true);
  const [urlIncluded, setUrlIncluded] = useState(false);
  const [imageIncluded, setImageIncluded] = useState(false);
  const [videoIncluded, setVideoIncluded] = useState(false);

  const [textValue, setTextValue] = useState("");
  const [urlValue, setUrlValue] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [imageMeta, setImageMeta] = useState(null);
  const [videoDataUrl, setVideoDataUrl] = useState("");
  const [videoMeta, setVideoMeta] = useState(null);
  const [label, setLabel] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);

  const scanOrigin = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

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

  const handleConfirmDelete = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await deleteBarcode(pendingDelete.slug);
      setHistory((rows) => rows.filter((row) => row.slug !== pendingDelete.slug));
      if (result?.slug === pendingDelete.slug) setResult(null);
      toast.success("Barcode deleted");
      setPendingDelete(null);
    } catch (error) {
      toast.error(error.message || "Could not delete barcode");
    } finally {
      setDeleting(false);
    }
  };

  const handleImageFile = async (file) => {
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error("Use a PNG, JPG, WebP, GIF, or SVG image");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Image must be under 2MB");
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setImageDataUrl(dataUrl);
      setImageMeta({ name: file.name, size: file.size, type: file.type });
      setImageIncluded(true);
      resetResult();
    } catch (error) {
      toast.error(error.message || "Could not load image");
    }
  };

  const handleVideoFile = async (file) => {
    if (!file) return;
    if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
      toast.error("Use an MP4, WebM, OGG, or MOV video");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      toast.error("Video must be under 6MB");
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setVideoDataUrl(dataUrl);
      setVideoMeta({ name: file.name, size: file.size, type: file.type });
      setVideoIncluded(true);
      resetResult();
    } catch (error) {
      toast.error(error.message || "Could not load video");
    }
  };

  const clearImage = () => {
    setImageDataUrl("");
    setImageMeta(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
    resetResult();
  };

  const clearVideo = () => {
    setVideoDataUrl("");
    setVideoMeta(null);
    if (videoInputRef.current) videoInputRef.current.value = "";
    resetResult();
  };

  const handleToggleText = () => {
    setTextIncluded((value) => {
      const next = !value;
      if (next) setUrlIncluded(false);
      return next;
    });
    resetResult();
  };

  const handleToggleUrl = () => {
    setUrlIncluded((value) => {
      const next = !value;
      if (next) {
        setTextIncluded(false);
        setImageIncluded(false);
        setVideoIncluded(false);
      }
      return next;
    });
    resetResult();
  };

  const handleToggleImage = () => {
    setImageIncluded((value) => {
      const next = !value;
      if (next) setUrlIncluded(false);
      return next;
    });
    resetResult();
  };

  const handleToggleVideo = () => {
    setVideoIncluded((value) => {
      const next = !value;
      if (next) setUrlIncluded(false);
      return next;
    });
    resetResult();
  };

  const handleGenerate = async (event) => {
    event.preventDefault();
    if (generating) return;

    const items = [];

    if (textIncluded) {
      const trimmed = textValue.trim();
      if (!trimmed) {
        toast.error("Add some text or remove the text section");
        return;
      }
      items.push({ kind: "text", content: trimmed });
    }

    if (urlIncluded) {
      const trimmed = urlValue.trim();
      try {
        const parsed = new URL(trimmed);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          throw new Error("Use an http or https link");
        }
      } catch (_error) {
        toast.error("Enter a valid http or https URL");
        return;
      }
      items.push({ kind: "url", content: trimmed });
    }

    if (imageIncluded) {
      if (!imageDataUrl) {
        toast.error("Choose an image or remove the image section");
        return;
      }
      items.push({ kind: "image", content: imageDataUrl });
    }

    if (videoIncluded) {
      if (!videoDataUrl) {
        toast.error("Choose a video or remove the video section");
        return;
      }
      items.push({ kind: "video", content: videoDataUrl });
    }

    if (!items.length) {
      toast.error("Include at least one item");
      return;
    }

    const payload = { items };
    if (label.trim()) payload.label = label.trim();

    const isLinkOnly = items.length === 1 && items[0].kind === "url";

    try {
      setGenerating(true);
      const response = await createBarcode(payload);
      const slug = response?.data?.slug;
      if (!slug) throw new Error("Could not create barcode");

      const qrTarget = isLinkOnly
        ? items[0].content
        : `${scanOrigin}/scan/${slug}`;

      const qrDataUrl = await QRCode.toDataURL(qrTarget, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 480,
        color: { dark: "#1a1a1a", light: "#ffffff" },
      });

      setResult({
        slug,
        scanUrl: qrTarget,
        qrDataUrl,
        label: response?.data?.label || "",
        kinds: response?.data?.kinds || [],
        isLinkOnly,
      });
      toast.success("Barcode generated");
      loadHistory();
    } catch (error) {
      toast.error(error.message || "Could not generate barcode");
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
    setTextValue("");
    setUrlValue("");
    clearImage();
    clearVideo();
    setLabel("");
    setTextIncluded(true);
    setUrlIncluded(false);
    setImageIncluded(false);
    setVideoIncluded(false);
    setResult(null);
  };

  const includedCount =
    Number(textIncluded) +
    Number(urlIncluded) +
    Number(imageIncluded) +
    Number(videoIncluded);

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
          Combine text, a link, an image, and a video into a single scannable
          barcode. Anyone who scans it lands on a dedicated page with all of
          your content.
        </p>
      </header>

      <div className="barcode-shell">
        <section className="barcode-form-card">
          <div className="barcode-summary">
            <span className="summary-pill">
              {includedCount} of 4 included
            </span>
            <span className="summary-hint">
              Toggle any section on or off — mix and match as you like.
            </span>
          </div>

          <form className="barcode-form" onSubmit={handleGenerate}>
            <fieldset
              className={`barcode-section ${textIncluded ? "active" : ""}`}
            >
              <SectionHeader
                title="Text"
                subtitle="Notes, messages, contact info"
                included={textIncluded}
                onToggle={handleToggleText}
              />
              {textIncluded && (
                <div className="form-group">
                  <textarea
                    id="text-input"
                    value={textValue}
                    onChange={(e) => {
                      setTextValue(e.target.value);
                      resetResult();
                    }}
                    placeholder="Type or paste anything — notes, contact info, a message..."
                    rows="5"
                    maxLength={4000}
                  />
                  <span className="char-count">
                    {textValue.length}/4000 characters
                  </span>
                </div>
              )}
            </fieldset>

            <fieldset
              className={`barcode-section ${urlIncluded ? "active" : ""}`}
            >
              <SectionHeader
                title="Link"
                subtitle="Stands alone — scans go straight to this URL"
                included={urlIncluded}
                onToggle={handleToggleUrl}
              />
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
                    A link barcode is exclusive — text, image, and video are
                    turned off automatically.
                  </span>
                </div>
              )}
            </fieldset>

            <fieldset
              className={`barcode-section ${imageIncluded ? "active" : ""}`}
            >
              <SectionHeader
                title="Image"
                subtitle="PNG, JPG, WebP, GIF, SVG up to 2MB"
                included={imageIncluded}
                onToggle={handleToggleImage}
              />
              {imageIncluded && (
                <div className="form-group">
                  {!imageDataUrl ? (
                    <div
                      className="image-dropzone"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleImageFile(e.dataTransfer.files?.[0]);
                      }}
                      onClick={() => imageInputRef.current?.click()}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          imageInputRef.current?.click();
                        }
                      }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        aria-hidden="true"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="9" cy="9" r="2" />
                        <path d="M21 15l-5-5L5 21" />
                      </svg>
                      <p>Click to upload or drag and drop</p>
                      <span>PNG, JPG, WebP, GIF, SVG · up to 2MB</span>
                    </div>
                  ) : (
                    <div className="image-preview">
                      <img
                        src={imageDataUrl}
                        alt={imageMeta?.name || "Preview"}
                      />
                      <div className="image-meta">
                        <span className="image-name">{imageMeta?.name}</span>
                        <span className="image-size">
                          {(imageMeta?.size / 1024).toFixed(1)} KB
                        </span>
                        <button
                          type="button"
                          className="image-remove"
                          onClick={clearImage}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept={ALLOWED_IMAGE_TYPES.join(",")}
                    onChange={(e) => handleImageFile(e.target.files?.[0])}
                    hidden
                  />
                </div>
              )}
            </fieldset>

            <fieldset
              className={`barcode-section ${videoIncluded ? "active" : ""}`}
            >
              <SectionHeader
                title="Video"
                subtitle="MP4, WebM, OGG, MOV up to 6MB"
                included={videoIncluded}
                onToggle={handleToggleVideo}
              />
              {videoIncluded && (
                <div className="form-group">
                  {!videoDataUrl ? (
                    <div
                      className="image-dropzone"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleVideoFile(e.dataTransfer.files?.[0]);
                      }}
                      onClick={() => videoInputRef.current?.click()}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          videoInputRef.current?.click();
                        }
                      }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        aria-hidden="true"
                      >
                        <polygon points="23 7 16 12 23 17 23 7" />
                        <rect x="1" y="5" width="15" height="14" rx="2" />
                      </svg>
                      <p>Click to upload or drag and drop</p>
                      <span>MP4, WebM, OGG, MOV · up to 6MB</span>
                    </div>
                  ) : (
                    <div className="image-preview">
                      <video
                        src={videoDataUrl}
                        muted
                        playsInline
                        preload="metadata"
                      />
                      <div className="image-meta">
                        <span className="image-name">{videoMeta?.name}</span>
                        <span className="image-size">
                          {(videoMeta?.size / (1024 * 1024)).toFixed(2)} MB
                        </span>
                        <button
                          type="button"
                          className="image-remove"
                          onClick={clearVideo}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept={ALLOWED_VIDEO_TYPES.join(",")}
                    onChange={(e) => handleVideoFile(e.target.files?.[0])}
                    hidden
                  />
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
                type="submit"
                className="btn-primary"
                disabled={generating || includedCount === 0}
              >
                {generating ? "Generating..." : "Generate barcode"}
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
              {result.label && (
                <p className="result-label">{result.label}</p>
              )}
              {result.kinds?.length > 0 && (
                <div className="result-kinds">
                  {result.kinds.map((kind, idx) => (
                    <span
                      key={`${kind}-${idx}`}
                      className="result-kind-pill"
                    >
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
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleCopyLink}
                >
                  Copy link
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleShare}
                >
                  Share
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleDownload}
                >
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
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  aria-hidden="true"
                >
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <path d="M14 14h3v3h-3zM20 14h1v1M14 20h1v1M20 20h1v1" />
                </svg>
              </div>
              <h3>Your barcode will appear here</h3>
              <p>
                Toggle any combination of text, link, image, or video, fill
                them in, and generate. You'll get a downloadable code and a
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
                      <span
                        key={`${kind}-${idx}`}
                        className="history-kind-pill"
                      >
                        {kind}
                      </span>
                    ))}
                  </div>
                  <span className="history-meta">
                    {formatRelative(entry.createdAt)} · /{entry.slug}
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
              <strong>
                {pendingDelete.label || "Untitled barcode"}
              </strong>{" "}
              will be removed permanently. Anyone who scans the code afterwards
              will see a "not found" message.
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
