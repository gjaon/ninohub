import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { fetchBarcode } from "../services/barcodes";
import "./ScanView.css";

const ScanView = () => {
  const { slug } = useParams();
  const [status, setStatus] = useState("loading");
  const [barcode, setBarcode] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [debugInfo, setDebugInfo] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");

    (async () => {
      // Try the same-origin REST call first via axios. If that fails on a
      // mobile browser, fall back to a raw `fetch` against an absolute,
      // same-origin URL so we (a) bypass any axios interceptor quirks and
      // (b) collect enough info to display on screen for debugging — mobile
      // Safari has no easy on-device console.
      const pageOrigin =
        typeof window !== "undefined" ? window.location.origin : "";
      const fallbackUrl = `${pageOrigin}/api/barcodes/${encodeURIComponent(
        slug
      )}`;
      try {
        const response = await fetchBarcode(slug);
        if (cancelled) return;
        const data = response?.data || null;
        const items = data?.items || [];
        const isLinkOnly = items.length === 1 && items[0]?.kind === "url";
        if (isLinkOnly && items[0].content) {
          window.location.replace(items[0].content);
          return;
        }
        setBarcode(data);
        setStatus("ready");
      } catch (primaryError) {
        // Same-origin fetch fallback. If this succeeds, the bug is in the
        // axios layer (likely the base URL). If it also fails, it's a real
        // network/CORS/server problem and we capture the details on screen.
        try {
          const res = await fetch(fallbackUrl, {
            method: "GET",
            credentials: "include",
            headers: { Accept: "application/json" },
          });
          const text = await res.text();
          let parsed = null;
          try {
            parsed = JSON.parse(text);
          } catch (_e) {
            parsed = null;
          }
          if (cancelled) return;
          if (res.ok && parsed?.data) {
            const data = parsed.data;
            const items = data?.items || [];
            const isLinkOnly =
              items.length === 1 && items[0]?.kind === "url";
            if (isLinkOnly && items[0].content) {
              window.location.replace(items[0].content);
              return;
            }
            setBarcode(data);
            setStatus("ready");
            return;
          }
          setDebugInfo({
            pageOrigin,
            fallbackUrl,
            primaryError:
              primaryError?.message || String(primaryError) || "unknown",
            fallbackStatus: `${res.status} ${res.statusText}`,
            fallbackBody: text.slice(0, 200),
            userAgent:
              typeof navigator !== "undefined" ? navigator.userAgent : "",
          });
          setErrorMessage(
            parsed?.message ||
              primaryError?.message ||
              "Could not load barcode"
          );
          setStatus("error");
        } catch (fallbackError) {
          if (cancelled) return;
          setDebugInfo({
            pageOrigin,
            fallbackUrl,
            primaryError:
              primaryError?.message || String(primaryError) || "unknown",
            fallbackError:
              fallbackError?.message ||
              String(fallbackError) ||
              "unknown",
            userAgent:
              typeof navigator !== "undefined" ? navigator.userAgent : "",
          });
          setErrorMessage(
            primaryError?.message || "Could not load barcode"
          );
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const items = barcode?.items || [];

  const handleCopy = async (value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied to clipboard");
    } catch (_error) {
      toast.error("Could not copy");
    }
  };

  const handleDownload = (dataUrl, filename) => {
    if (!dataUrl) return;
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const buildActions = () => {
    const actions = [];
    items.forEach((item, idx) => {
      if (item.kind === "text") {
        actions.push({
          key: `text-${idx}`,
          label: items.filter((i) => i.kind === "text").length > 1
            ? `Copy text ${idx + 1}`
            : "Copy text",
          variant: "secondary",
          onClick: () => handleCopy(item.content),
        });
      } else if (item.kind === "url") {
        actions.push({
          key: `url-${idx}`,
          label: "Open link",
          variant: "primary",
          href: item.content,
          target: "_blank",
        });
      } else if (item.kind === "image") {
        const ext = (item.mimeType || "image/png").split("/")[1] || "png";
        actions.push({
          key: `image-${idx}`,
          label: items.filter((i) => i.kind === "image").length > 1
            ? `Download image ${idx + 1}`
            : "Download image",
          variant: "secondary",
          onClick: () =>
            handleDownload(
              item.content,
              `barcode-${barcode.slug}-image-${idx + 1}.${ext}`
            ),
        });
      } else if (item.kind === "video") {
        const ext = (item.mimeType || "video/mp4").split("/")[1] || "mp4";
        actions.push({
          key: `video-${idx}`,
          label: items.filter((i) => i.kind === "video").length > 1
            ? `Download video ${idx + 1}`
            : "Download video",
          variant: "secondary",
          onClick: () =>
            handleDownload(
              item.content,
              `barcode-${barcode.slug}-video-${idx + 1}.${ext}`
            ),
        });
      }
    });
    return actions;
  };

  return (
    <div className="scan-page">
      <div className="scan-shell">
        {status === "loading" && (
          <div className="scan-state">
            <div className="scan-spinner" />
            <p>Loading barcode...</p>
          </div>
        )}

        {status === "error" && (
          <div className="scan-state scan-state-error">
            <h2>Barcode not found</h2>
            <p>{errorMessage}</p>
            {debugInfo && (
              <details
                style={{
                  marginTop: 16,
                  textAlign: "left",
                  fontSize: 12,
                  background: "rgba(0,0,0,0.04)",
                  padding: 12,
                  borderRadius: 8,
                  wordBreak: "break-all",
                }}
              >
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                  Diagnostics
                </summary>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    margin: "8px 0 0",
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, monospace",
                  }}
                >
                  {JSON.stringify(debugInfo, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}

        {status === "ready" && barcode && (
          <>
            <div className="scan-items">
              {items.map((item, idx) => {
                if (item.kind === "text") {
                  return (
                    <div key={`text-${idx}`} className="scan-block scan-block-text">
                      <pre>{item.content}</pre>
                    </div>
                  );
                }
                if (item.kind === "url") {
                  return (
                    <div key={`url-${idx}`} className="scan-block scan-block-link">
                      <a
                        href={item.content}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {item.content}
                      </a>
                    </div>
                  );
                }
                if (item.kind === "image") {
                  return (
                    <div key={`image-${idx}`} className="scan-block scan-block-image">
                      <img src={item.content} alt="" />
                    </div>
                  );
                }
                if (item.kind === "video") {
                  return (
                    <div key={`video-${idx}`} className="scan-block scan-block-video">
                      <video
                        src={item.content}
                        controls
                        playsInline
                        preload="metadata"
                      />
                    </div>
                  );
                }
                return null;
              })}
            </div>

            <div className="scan-actions">
              {buildActions().map((action) =>
                action.href ? (
                  <a
                    key={action.key}
                    href={action.href}
                    target={action.target}
                    rel="noopener noreferrer"
                    className={
                      action.variant === "primary"
                        ? "scan-btn-primary"
                        : "scan-btn-secondary"
                    }
                  >
                    {action.label}
                  </a>
                ) : (
                  <button
                    key={action.key}
                    type="button"
                    className={
                      action.variant === "primary"
                        ? "scan-btn-primary"
                        : "scan-btn-secondary"
                    }
                    onClick={action.onClick}
                  >
                    {action.label}
                  </button>
                )
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ScanView;
