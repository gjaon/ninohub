import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { fetchBarcode } from "../services/barcodes";
import "./ScanView.css";

// Immersive video block. We try to autoplay WITH sound first; browsers usually
// block sound-on autoplay, so we fall back to muted autoplay (which they do
// allow) and surface a tap-to-unmute affordance — the viewer still lands on a
// playing video immediately rather than a paused poster.
const ScanVideo = ({ src, mimeType, active }) => {
  const videoRef = useRef(null);
  const [muted, setMuted] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (!active) {
      el.pause();
      return;
    }

    let cancelled = false;
    const attempt = async () => {
      try {
        el.muted = false;
        await el.play();
        if (!cancelled) setMuted(false);
      } catch (_soundErr) {
        // Sound-on autoplay rejected — retry muted so it still plays.
        try {
          el.muted = true;
          await el.play();
          if (!cancelled) {
            setMuted(true);
            setNeedsTap(true);
          }
        } catch (_mutedErr) {
          // Even muted autoplay blocked — viewer must tap to start.
          if (!cancelled) setNeedsTap(true);
        }
      }
    };
    attempt();

    return () => {
      cancelled = true;
    };
  }, [active]);

  const handleEnableSound = useCallback(async () => {
    const el = videoRef.current;
    if (!el) return;
    try {
      el.muted = false;
      await el.play();
      setMuted(false);
      setNeedsTap(false);
    } catch (_err) {
      // ignore — leave overlay up
    }
  }, []);

  return (
    <div className="scan-video-wrap" onClick={muted ? handleEnableSound : undefined}>
      <video
        ref={videoRef}
        playsInline
        loop
        controls
        preload="auto"
        className="scan-video"
      >
        <source src={src} type={mimeType || "video/mp4"} />
      </video>
      {needsTap && muted && (
        <button
          type="button"
          className="scan-unmute"
          onClick={handleEnableSound}
        >
          <span className="scan-unmute-icon" aria-hidden="true">
            🔇
          </span>
          Tap for sound
        </button>
      )}
    </div>
  );
};

const ScanImage = ({ src }) => {
  const [zoomed, setZoomed] = useState(false);
  return (
    <div
      className={`scan-image-wrap ${zoomed ? "zoomed" : ""}`}
      onClick={() => setZoomed((v) => !v)}
    >
      <img src={src} alt="" className="scan-image" />
    </div>
  );
};

const ScanNote = ({ content }) => (
  <div className="scan-note">
    <div className="scan-note-card">
      <p>{content}</p>
    </div>
  </div>
);

const ScanLink = ({ content }) => (
  <div className="scan-link-block">
    <div className="scan-link-card">
      <span className="scan-link-eyebrow">Link</span>
      <p className="scan-link-url">{content}</p>
      <a
        href={content}
        target="_blank"
        rel="noopener noreferrer"
        className="scan-link-btn"
      >
        Open link
      </a>
    </div>
  </div>
);

const ScanView = () => {
  const { slug } = useParams();
  const [status, setStatus] = useState("loading");
  const [barcode, setBarcode] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [debugInfo, setDebugInfo] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const feedRef = useRef(null);
  const stageRefs = useRef([]);

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
  const hasMultiple = items.length > 1;

  // Track which stage is in view so we only autoplay the active video and can
  // hide the scroll cue on the last item.
  useEffect(() => {
    if (status !== "ready" || !hasMultiple) return undefined;
    const root = feedRef.current;
    if (!root) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = Number(entry.target.dataset.index);
            if (!Number.isNaN(idx)) setActiveIndex(idx);
          }
        });
      },
      { root, threshold: 0.6 }
    );

    stageRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [status, hasMultiple, items.length]);

  const scrollToNext = useCallback(() => {
    const next = stageRefs.current[activeIndex + 1];
    if (next) next.scrollIntoView({ behavior: "smooth" });
  }, [activeIndex]);

  const renderItem = (item, idx) => {
    if (item.kind === "video") {
      return (
        <ScanVideo
          src={item.content}
          mimeType={item.mimeType}
          active={!hasMultiple || activeIndex === idx}
        />
      );
    }
    if (item.kind === "image") return <ScanImage src={item.content} />;
    if (item.kind === "url") return <ScanLink content={item.content} />;
    return <ScanNote content={item.content} />;
  };

  if (status === "loading") {
    return (
      <div className="scan-immersive scan-centered">
        <div className="scan-spinner" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="scan-immersive scan-centered">
        <div className="scan-error-card">
          <h2>Nothing here</h2>
          <p>{errorMessage}</p>
          {debugInfo && (
            <details className="scan-diagnostics">
              <summary>Diagnostics</summary>
              <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
            </details>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="scan-immersive">
      <div
        className={`scan-feed ${hasMultiple ? "multi" : "single"}`}
        ref={feedRef}
      >
        {items.map((item, idx) => (
          <section
            key={`${item.kind}-${idx}`}
            className={`scan-stage stage-${item.kind}`}
            data-index={idx}
            ref={(el) => {
              stageRefs.current[idx] = el;
            }}
          >
            {renderItem(item, idx)}

            {hasMultiple && idx < items.length - 1 && (
              <button
                type="button"
                className="scan-scroll-cue"
                onClick={scrollToNext}
                aria-label="Scroll to next item"
              >
                <span className="scan-scroll-label">More</span>
                <span className="scan-chevron" aria-hidden="true">
                  ⌄
                </span>
              </button>
            )}
          </section>
        ))}
      </div>
    </div>
  );
};

export default ScanView;
