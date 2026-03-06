import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import {
  addFallbackNote,
  getAdminUsers,
  getAdminWaitlist,
  getCampaignDeliveryLogs,
  getAdminCoupons,
  getFallbackById,
  getFallbackQueue,
  generateUserCoupons,
  generateWaitlistCoupons,
  markFallbackReviewed,
  revokeAdminCoupon,
  resolveFallback,
  sendCouponSms,
  retryFallback,
  sendAdminCampaign,
  updateAdminWaitlistStatus,
} from "../services/admin";
import "./AdminPanel.css";

const parseAdminAllowlist = () =>
  String(process.env.REACT_APP_ADMIN_EMAIL_ALLOWLIST || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

const formatLabel = (value) =>
  String(value || "-")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const safeText = (value) => String(value || "-");

const AdminPanel = () => {
  const { currentUser, isAuthenticated } = useSelector((state) => state.user);
  const adminAllowlist = useMemo(parseAdminAllowlist, []);
  const isAdminFromEmail = adminAllowlist.includes(String(currentUser?.email || "").toLowerCase());
  const isAdmin = Boolean(currentUser?.isAdmin) || isAdminFromEmail;

  const [activeTab, setActiveTab] = useState("fallbacks");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [fallbackFilters, setFallbackFilters] = useState({
    status: "",
    reference: "",
    email: "",
    from: "",
    to: "",
  });
  const [fallbacks, setFallbacks] = useState([]);
  const [selectedFallback, setSelectedFallback] = useState(null);
  const [fallbackNote, setFallbackNote] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");

  const [userSearch, setUserSearch] = useState("");
  const [userSegment, setUserSegment] = useState("");
  const [users, setUsers] = useState([]);

  const [waitlistSearch, setWaitlistSearch] = useState("");
  const [waitlistStatus, setWaitlistStatus] = useState("");
  const [waitlistRows, setWaitlistRows] = useState([]);

  const [campaignPayload, setCampaignPayload] = useState({
    name: "",
    channels: ["sms"],
    audience: {
      scope: "all",
      query: "",
      waitlistStatus: "",
      userSegment: "",
    },
    template: {
      smsBody: "Hi {{firstName}}, this is a message from NINO.",
    },
  });
  const [campaignLogs, setCampaignLogs] = useState([]);

  const [couponFilters, setCouponFilters] = useState({
    status: "",
    assignedToType: "",
    code: "",
  });
  const [coupons, setCoupons] = useState([]);
  const [couponLoading, setCouponLoading] = useState(false);

  const [waitlistCouponForm, setWaitlistCouponForm] = useState({
    status: "",
    search: "",
    discountType: "amount",
    discountValue: "2000",
    expiresAt: "",
    dryRun: false,
  });

  const [userCouponForm, setUserCouponForm] = useState({
    search: "",
    segment: "with_phone",
    discountType: "percentage",
    discountValue: "10",
    expiresAt: "",
    dryRun: false,
  });

  const [couponSmsPayload, setCouponSmsPayload] = useState({
    name: "Waitlist Coupon SMS",
    smsBody: "Hi {{firstName}}, your code is {{couponCode}} for {{discountText}}. Expires {{expiryDate}}.",
  });
  const [couponSendMode, setCouponSendMode] = useState("all");
  const [selectedCouponCodes, setSelectedCouponCodes] = useState([]);
  const [adminSuccess, setAdminSuccess] = useState("");

  const loadFallbacks = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getFallbackQueue(fallbackFilters);
      setFallbacks(response.data || []);
      if (selectedFallback?.fallbackId) {
        const details = await getFallbackById(selectedFallback.fallbackId);
        setSelectedFallback(details);
      }
    } catch (err) {
      setError(err.message || "Failed to load fallback queue");
    } finally {
      setLoading(false);
    }
  }, [fallbackFilters, selectedFallback?.fallbackId]);

  const loadUsers = useCallback(async () => {
    try {
      const response = await getAdminUsers({
        search: userSearch || undefined,
        segment: userSegment || undefined,
      });
      setUsers(response.data || []);
    } catch (err) {
      setError(err.message || "Failed to load users");
    }
  }, [userSearch, userSegment]);

  const loadWaitlist = useCallback(async () => {
    try {
      const response = await getAdminWaitlist({
        search: waitlistSearch || undefined,
        status: waitlistStatus || undefined,
      });
      setWaitlistRows(response.data || []);
    } catch (err) {
      setError(err.message || "Failed to load waitlist");
    }
  }, [waitlistSearch, waitlistStatus]);

  const loadCampaignLogs = useCallback(async () => {
    try {
      const response = await getCampaignDeliveryLogs({});
      setCampaignLogs(response.data || []);
    } catch (_err) {
    }
  }, []);

  const loadCoupons = useCallback(async () => {
    setCouponLoading(true);
    try {
      const response = await getAdminCoupons({
        status: couponFilters.status || undefined,
        assignedToType: couponFilters.assignedToType || undefined,
        code: couponFilters.code || undefined,
      });
      setCoupons(response.data || []);
    } catch (err) {
      setError(err.message || "Failed to load coupons");
    } finally {
      setCouponLoading(false);
    }
  }, [couponFilters]);

  useEffect(() => {
    if (!isAdmin) return;
    loadFallbacks();
    loadUsers();
    loadWaitlist();
    loadCampaignLogs();
    loadCoupons();
  }, [isAdmin, loadFallbacks, loadUsers, loadWaitlist, loadCampaignLogs, loadCoupons]);

  useEffect(() => {
    setSelectedCouponCodes((previous) => {
      if (!previous.length) {
        return previous;
      }

      const activeCodes = new Set(coupons.map((coupon) => coupon.code));
      const filtered = previous.filter((code) => activeCodes.has(code));
      return filtered.length === previous.length ? previous : filtered;
    });
  }, [coupons]);

  if (!isAuthenticated || !isAdmin) {
    return (
      <div className="admin-page">
        <h2>Admin access required</h2>
        <p>You do not have access to this page.</p>
      </div>
    );
  }

  const onSelectFallback = async (fallbackId) => {
    try {
      const details = await getFallbackById(fallbackId);
      setSelectedFallback(details);
    } catch (err) {
      setError(err.message || "Failed to load fallback details");
    }
  };

  const onFallbackAction = async (action) => {
    if (!selectedFallback?.fallbackId) return;

    setLoading(true);
    setError("");

    try {
      if (action === "review") {
        await markFallbackReviewed(selectedFallback.fallbackId);
      }
      if (action === "note" && fallbackNote.trim()) {
        await addFallbackNote(selectedFallback.fallbackId, fallbackNote.trim());
        setFallbackNote("");
      }
      if (action === "retry") {
        await retryFallback(selectedFallback.fallbackId);
      }
      if (action === "resolve") {
        await resolveFallback(selectedFallback.fallbackId, resolutionNote.trim());
        setResolutionNote("");
      }

      await loadFallbacks();
      await onSelectFallback(selectedFallback.fallbackId);
    } catch (err) {
      setError(err.message || "Action failed");
    } finally {
      setLoading(false);
    }
  };

  const onWaitlistStatusUpdate = async (id, status) => {
    try {
      await updateAdminWaitlistStatus(id, status);
      await loadWaitlist();
    } catch (err) {
      setError(err.message || "Failed to update waitlist status");
    }
  };

  const onSendCampaign = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await sendAdminCampaign(campaignPayload);
      await loadCampaignLogs();
    } catch (err) {
      setError(err.message || "Failed to send campaign");
    } finally {
      setLoading(false);
    }
  };

  const onGenerateWaitlistCoupons = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setAdminSuccess("");
    try {
      const response = await generateWaitlistCoupons({
        ...waitlistCouponForm,
        discountValue: Number(waitlistCouponForm.discountValue),
      });
      setAdminSuccess(response.message || "Waitlist coupon generation completed");
      await loadCoupons();
    } catch (err) {
      setError(err.message || "Failed to generate waitlist coupons");
    } finally {
      setLoading(false);
    }
  };

  const onGenerateAllWaitlistCoupons = async () => {
    setLoading(true);
    setError("");
    setAdminSuccess("");
    try {
      const response = await generateWaitlistCoupons({
        ...waitlistCouponForm,
        status: "",
        search: "",
        dryRun: false,
        discountValue: Number(waitlistCouponForm.discountValue),
      });
      setAdminSuccess(response.message || "Coupons generated for all waitlist members");
      await loadCoupons();
      await loadWaitlist();
    } catch (err) {
      setError(err.message || "Failed to auto-generate waitlist coupons");
    } finally {
      setLoading(false);
    }
  };

  const onGenerateUserCoupons = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setAdminSuccess("");
    try {
      const response = await generateUserCoupons({
        ...userCouponForm,
        discountValue: Number(userCouponForm.discountValue),
      });
      setAdminSuccess(response.message || "User coupon generation completed");
      await loadCoupons();
    } catch (err) {
      setError(err.message || "Failed to generate user coupons");
    } finally {
      setLoading(false);
    }
  };

  const onRevokeCoupon = async (code) => {
    if (!window.confirm(`Revoke coupon ${code}?`)) return;

    setLoading(true);
    setError("");
    setAdminSuccess("");
    try {
      const response = await revokeAdminCoupon(code);
      setAdminSuccess(response.message || "Coupon revoked");
      await loadCoupons();
    } catch (err) {
      setError(err.message || "Failed to revoke coupon");
    } finally {
      setLoading(false);
    }
  };

  const onSendCouponSms = async (event) => {
    event.preventDefault();
    const normalizedSelectedCodes = selectedCouponCodes
      .map((code) => String(code || "").trim().toUpperCase())
      .filter(Boolean);

    if (couponSendMode === "selected" && normalizedSelectedCodes.length === 0) {
      setError("Select at least one coupon or switch to all active coupons.");
      return;
    }

    setLoading(true);
    setError("");
    setAdminSuccess("");
    try {
      const response = await sendCouponSms({
        name: couponSmsPayload.name,
        template: {
          smsBody: couponSmsPayload.smsBody,
        },
        ...(couponSendMode === "selected"
          ? { couponCodes: normalizedSelectedCodes }
          : {
              filters: {
                status: "active",
              },
            }),
      });
      setAdminSuccess(response.message || "Coupon SMS sent");
      await loadCampaignLogs();
    } catch (err) {
      setError(err.message || "Failed to send coupon SMS");
    } finally {
      setLoading(false);
    }
  };

  const onToggleCouponCode = (code) => {
    setSelectedCouponCodes((previous) => {
      if (previous.includes(code)) {
        return previous.filter((value) => value !== code);
      }
      return [...previous, code];
    });
  };

  const onSelectAllActiveCoupons = () => {
    setSelectedCouponCodes(
      coupons
        .filter((coupon) => coupon.status === "active")
        .map((coupon) => coupon.code)
    );
  };

  const onClearCouponSelection = () => {
    setSelectedCouponCodes([]);
  };

  return (
    <div className="admin-page">
      <h1>Admin Panel</h1>
      {error && <div className="admin-error">{error}</div>}
      {adminSuccess && <div className="admin-success">{adminSuccess}</div>}

      <div className="admin-tabs">
        <button onClick={() => setActiveTab("coupons")} className={activeTab === "coupons" ? "active" : ""}>Coupons</button>
        <button onClick={() => setActiveTab("fallbacks")} className={activeTab === "fallbacks" ? "active" : ""}>Fallbacks</button>
        <button onClick={() => setActiveTab("users")} className={activeTab === "users" ? "active" : ""}>Users</button>
        <button onClick={() => setActiveTab("waitlist")} className={activeTab === "waitlist" ? "active" : ""}>Waitlist</button>
        <button onClick={() => setActiveTab("campaigns")} className={activeTab === "campaigns" ? "active" : ""}>Campaigns</button>
      </div>

      {activeTab === "coupons" && (
        <div className="admin-grid">
          <form className="admin-card" onSubmit={onGenerateWaitlistCoupons}>
            <h3>Generate for Waitlist</h3>
            <button
              type="button"
              className="admin-btn-secondary"
              disabled={loading}
              onClick={onGenerateAllWaitlistCoupons}
            >
              Auto-generate for all waitlist members
            </button>
            <select
              value={waitlistCouponForm.status}
              onChange={(e) => setWaitlistCouponForm((prev) => ({ ...prev, status: e.target.value }))}
            >
              <option value="">All statuses</option>
              <option value="pending">pending</option>
              <option value="contacted">contacted</option>
              <option value="converted">converted</option>
            </select>
            <input
              placeholder="Search name/email/phone"
              value={waitlistCouponForm.search}
              onChange={(e) => setWaitlistCouponForm((prev) => ({ ...prev, search: e.target.value }))}
            />
            <select
              value={waitlistCouponForm.discountType}
              onChange={(e) => setWaitlistCouponForm((prev) => ({ ...prev, discountType: e.target.value }))}
            >
              <option value="amount">Fixed amount</option>
              <option value="percentage">Percentage</option>
            </select>
            <input
              type="number"
              min="1"
              placeholder="Discount value"
              value={waitlistCouponForm.discountValue}
              onChange={(e) => setWaitlistCouponForm((prev) => ({ ...prev, discountValue: e.target.value }))}
            />
            <input
              type="date"
              value={waitlistCouponForm.expiresAt}
              onChange={(e) => setWaitlistCouponForm((prev) => ({ ...prev, expiresAt: e.target.value }))}
            />
            <label>
              <input
                type="checkbox"
                checked={waitlistCouponForm.dryRun}
                onChange={(e) => setWaitlistCouponForm((prev) => ({ ...prev, dryRun: e.target.checked }))}
              />
              Preview only (dry run)
            </label>
            <button type="submit" disabled={loading}>Generate</button>
          </form>

          <form className="admin-card" onSubmit={onGenerateUserCoupons}>
            <h3>Generate for Users</h3>
            <input
              placeholder="Search users"
              value={userCouponForm.search}
              onChange={(e) => setUserCouponForm((prev) => ({ ...prev, search: e.target.value }))}
            />
            <select
              value={userCouponForm.segment}
              onChange={(e) => setUserCouponForm((prev) => ({ ...prev, segment: e.target.value }))}
            >
              <option value="">All users</option>
              <option value="with_phone">with_phone</option>
              <option value="recent_30d">recent_30d</option>
            </select>
            <select
              value={userCouponForm.discountType}
              onChange={(e) => setUserCouponForm((prev) => ({ ...prev, discountType: e.target.value }))}
            >
              <option value="amount">Fixed amount</option>
              <option value="percentage">Percentage</option>
            </select>
            <input
              type="number"
              min="1"
              placeholder="Discount value"
              value={userCouponForm.discountValue}
              onChange={(e) => setUserCouponForm((prev) => ({ ...prev, discountValue: e.target.value }))}
            />
            <input
              type="date"
              value={userCouponForm.expiresAt}
              onChange={(e) => setUserCouponForm((prev) => ({ ...prev, expiresAt: e.target.value }))}
            />
            <label>
              <input
                type="checkbox"
                checked={userCouponForm.dryRun}
                onChange={(e) => setUserCouponForm((prev) => ({ ...prev, dryRun: e.target.checked }))}
              />
              Preview only (dry run)
            </label>
            <button type="submit" disabled={loading}>Generate</button>
          </form>

          <div className="admin-card admin-span-2">
            <h3>Coupons</h3>
            <div className="admin-actions">
              <button type="button" onClick={onSelectAllActiveCoupons} disabled={couponLoading || loading}>
                Select all active
              </button>
              <button type="button" onClick={onClearCouponSelection} disabled={loading}>
                Clear selection
              </button>
              <span className="admin-helper-text">Selected: {selectedCouponCodes.length}</span>
            </div>
            <div className="admin-filters">
              <input
                placeholder="Search code"
                value={couponFilters.code}
                onChange={(e) => setCouponFilters((prev) => ({ ...prev, code: e.target.value }))}
              />
              <select
                value={couponFilters.status}
                onChange={(e) => setCouponFilters((prev) => ({ ...prev, status: e.target.value }))}
              >
                <option value="">All statuses</option>
                <option value="active">active</option>
                <option value="redeemed">redeemed</option>
                <option value="expired">expired</option>
                <option value="revoked">revoked</option>
              </select>
              <select
                value={couponFilters.assignedToType}
                onChange={(e) => setCouponFilters((prev) => ({ ...prev, assignedToType: e.target.value }))}
              >
                <option value="">All assignments</option>
                <option value="waitlist">waitlist</option>
                <option value="user">user</option>
                <option value="manual">manual</option>
              </select>
              <button type="button" onClick={loadCoupons} disabled={couponLoading}>Apply</button>
            </div>

            <div className="admin-table">
              {coupons.map((coupon) => (
                <div key={coupon._id} className="admin-row admin-row-coupon">
                  <span>
                    <input
                      type="checkbox"
                      checked={selectedCouponCodes.includes(coupon.code)}
                      onChange={() => onToggleCouponCode(coupon.code)}
                      disabled={loading}
                    />
                  </span>
                  <span>{coupon.code}</span>
                  <span>
                    <span className={`admin-badge admin-badge-${coupon.status}`}>{coupon.status}</span>
                  </span>
                  <span>{coupon.discountType === "percentage" ? `${coupon.discountValue}%` : `₦${Number(coupon.discountValue || 0).toLocaleString()}`}</span>
                  <span>{safeText(coupon.assignedToType)}</span>
                  <button
                    type="button"
                    disabled={coupon.status !== "active" || loading}
                    onClick={() => onRevokeCoupon(coupon.code)}
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          </div>

          <form className="admin-card admin-span-2" onSubmit={onSendCouponSms}>
            <h3>Send Coupon SMS (Termii)</h3>
            <div className="admin-actions">
              <label>
                <input
                  type="radio"
                  name="couponSendMode"
                  value="all"
                  checked={couponSendMode === "all"}
                  onChange={() => setCouponSendMode("all")}
                />
                Send to all active coupons
              </label>
              <label>
                <input
                  type="radio"
                  name="couponSendMode"
                  value="selected"
                  checked={couponSendMode === "selected"}
                  onChange={() => setCouponSendMode("selected")}
                />
                Send to selected coupons ({selectedCouponCodes.length})
              </label>
            </div>
            <input
              placeholder="Campaign name"
              value={couponSmsPayload.name}
              onChange={(e) => setCouponSmsPayload((prev) => ({ ...prev, name: e.target.value }))}
            />
            <textarea
              placeholder="SMS body"
              value={couponSmsPayload.smsBody}
              onChange={(e) => setCouponSmsPayload((prev) => ({ ...prev, smsBody: e.target.value }))}
            />
            <small>
              Variables: {"{{name}}"}, {"{{firstName}}"}, {"{{phone}}"}, {"{{couponCode}}"}, {"{{discountText}}"}, {"{{expiryDate}}"}
            </small>
            <button type="submit" disabled={loading}>Send SMS</button>
          </form>
        </div>
      )}

      {activeTab === "fallbacks" && (
        <div className="admin-grid">
          <div className="admin-card">
            <h3>Queue</h3>
            <div className="admin-filters">
              <input placeholder="Reference" value={fallbackFilters.reference} onChange={(e) => setFallbackFilters((prev) => ({ ...prev, reference: e.target.value }))} />
              <input placeholder="Email" value={fallbackFilters.email} onChange={(e) => setFallbackFilters((prev) => ({ ...prev, email: e.target.value }))} />
              <select value={fallbackFilters.status} onChange={(e) => setFallbackFilters((prev) => ({ ...prev, status: e.target.value }))}>
                <option value="">All status</option>
                <option value="pending">pending</option>
                <option value="reviewed">reviewed</option>
                <option value="retrying">retrying</option>
                <option value="failed">failed</option>
                <option value="resolved_manual">resolved_manual</option>
                <option value="resolved_retry">resolved_retry</option>
              </select>
              <input type="date" value={fallbackFilters.from} onChange={(e) => setFallbackFilters((prev) => ({ ...prev, from: e.target.value }))} />
              <input type="date" value={fallbackFilters.to} onChange={(e) => setFallbackFilters((prev) => ({ ...prev, to: e.target.value }))} />
              <button onClick={loadFallbacks}>Apply</button>
            </div>

            <div className="admin-list">
              {fallbacks.map((item) => (
                <button key={item.fallbackId} className="admin-list-item" onClick={() => onSelectFallback(item.fallbackId)}>
                  <strong>{item.paymentReference}</strong>
                  <span>{item.status}</span>
                  <span>{item.buyer?.email || "-"}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="admin-card">
            <h3>Details</h3>
            {selectedFallback ? (
              <>
                <div className="admin-actions">
                  <button disabled={loading} onClick={() => onFallbackAction("review")}>Mark reviewed</button>
                  <button disabled={loading} onClick={() => onFallbackAction("retry")}>Retry submission</button>
                  <button disabled={loading} onClick={() => onFallbackAction("resolve")}>Mark resolved</button>
                </div>
                <textarea placeholder="Add note" value={fallbackNote} onChange={(e) => setFallbackNote(e.target.value)} />
                <button disabled={loading || !fallbackNote.trim()} onClick={() => onFallbackAction("note")}>Add note</button>
                <textarea placeholder="Resolution note (optional)" value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} />
                <div className="admin-readable-sections">
                  <div className="admin-section">
                    <h4>Buyer Info</h4>
                    <p>Name: {safeText(selectedFallback.readableDetails?.buyerInfo?.name)}</p>
                    <p>Email: {safeText(selectedFallback.readableDetails?.buyerInfo?.email)}</p>
                    <p>Phone: {safeText(selectedFallback.readableDetails?.buyerInfo?.phone)}</p>
                  </div>

                  <div className="admin-section">
                    <h4>Payment Info</h4>
                    <p>Reference: {safeText(selectedFallback.readableDetails?.paymentInfo?.reference)}</p>
                    <p>Status: {formatLabel(selectedFallback.readableDetails?.paymentInfo?.status)}</p>
                    <p>Amount: {safeText(selectedFallback.readableDetails?.paymentInfo?.amount)}</p>
                    <p>Verified At: {safeText(selectedFallback.readableDetails?.paymentInfo?.verifiedAt)}</p>
                  </div>

                  <div className="admin-section">
                    <h4>Items Summary</h4>
                    <p>Total Items: {safeText(selectedFallback.readableDetails?.itemsSummary?.itemCount)}</p>
                    <p>Unresolved Items: {safeText(selectedFallback.readableDetails?.itemsSummary?.unresolvedItemCount)}</p>
                    {(selectedFallback.readableDetails?.itemsSummary?.items || []).map((item, index) => (
                      <p key={`${item.productName}-${index}`}>
                        {safeText(item.productName)} × {safeText(item.quantity)} ({safeText(item.unitPrice)})
                      </p>
                    ))}
                  </div>

                  <div className="admin-section">
                    <h4>Error Summary</h4>
                    <p>Message: {safeText(selectedFallback.readableDetails?.errorSummary?.message)}</p>
                    <p>Status Code: {safeText(selectedFallback.readableDetails?.errorSummary?.statusCode)}</p>
                    <p>Retry Count: {safeText(selectedFallback.readableDetails?.errorSummary?.retryCount)}</p>
                  </div>

                  <div className="admin-section">
                    <h4>Timeline/History</h4>
                    {(selectedFallback.readableDetails?.timeline || []).map((entry, index) => (
                      <p key={`${entry.action}-${index}`}>
                        {safeText(entry.when)} — {formatLabel(entry.action)} ({safeText(entry.actor)})
                      </p>
                    ))}
                  </div>

                  <div className="admin-section">
                    <h4>Admin Notes</h4>
                    {(selectedFallback.readableDetails?.adminNotes || []).length === 0 ? (
                      <p>No notes yet</p>
                    ) : (
                      (selectedFallback.readableDetails?.adminNotes || []).map((note, index) => (
                        <p key={`${note.createdAt}-${index}`}>
                          {safeText(note.createdAt)} — {safeText(note.actor)}: {safeText(note.note)}
                        </p>
                      ))
                    )}
                  </div>
                </div>
              </>
            ) : (
              <p>Select a fallback record</p>
            )}
          </div>
        </div>
      )}

      {activeTab === "users" && (
        <div className="admin-card">
          <h3>Users</h3>
          <div className="admin-filters">
            <input placeholder="Search name/email/phone" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} />
            <select value={userSegment} onChange={(e) => setUserSegment(e.target.value)}>
              <option value="">All segments</option>
              <option value="with_email">with_email</option>
              <option value="with_phone">with_phone</option>
              <option value="recent_30d">recent_30d</option>
              <option value="waitlist_pending">waitlist_pending</option>
              <option value="waitlist_converted">waitlist_converted</option>
            </select>
            <button onClick={loadUsers}>Apply</button>
          </div>
          <div className="admin-table">
            {users.map((user) => (
              <div key={user._id} className="admin-row">
                <span>{user.name}</span>
                <span>{user.email}</span>
                <span>{user.phone || "-"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "waitlist" && (
        <div className="admin-card">
          <h3>Waitlist</h3>
          <div className="admin-filters">
            <input placeholder="Search waitlist" value={waitlistSearch} onChange={(e) => setWaitlistSearch(e.target.value)} />
            <select value={waitlistStatus} onChange={(e) => setWaitlistStatus(e.target.value)}>
              <option value="">All status</option>
              <option value="pending">pending</option>
              <option value="contacted">contacted</option>
              <option value="converted">converted</option>
            </select>
            <button onClick={loadWaitlist}>Apply</button>
          </div>
          <div className="admin-table">
            {waitlistRows.map((row) => (
              <div key={row._id} className="admin-row">
                <span>{row.name}</span>
                <span>{row.email || "-"}</span>
                <span>{row.phone}</span>
                <select value={row.status} onChange={(e) => onWaitlistStatusUpdate(row._id, e.target.value)}>
                  <option value="pending">pending</option>
                  <option value="contacted">contacted</option>
                  <option value="converted">converted</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "campaigns" && (
        <div className="admin-grid">
          <form className="admin-card" onSubmit={onSendCampaign}>
            <h3>Send Campaign (SMS only)</h3>
            <input placeholder="Campaign name" value={campaignPayload.name} onChange={(e) => setCampaignPayload((prev) => ({ ...prev, name: e.target.value }))} required />
            <div className="admin-actions">
              <label>
                <input
                  type="checkbox"
                  checked
                  readOnly
                />
                SMS
              </label>
            </div>
            <select
              value={campaignPayload.audience.scope}
              onChange={(e) =>
                setCampaignPayload((prev) => ({
                  ...prev,
                  audience: { ...prev.audience, scope: e.target.value },
                }))
              }
            >
              <option value="all">all</option>
              <option value="users">users</option>
              <option value="waitlist">waitlist</option>
            </select>
            <input
              placeholder="Audience search"
              value={campaignPayload.audience.query}
              onChange={(e) =>
                setCampaignPayload((prev) => ({
                  ...prev,
                  audience: { ...prev.audience, query: e.target.value },
                }))
              }
            />
            <select
              value={campaignPayload.audience.waitlistStatus}
              onChange={(e) =>
                setCampaignPayload((prev) => ({
                  ...prev,
                  audience: { ...prev.audience, waitlistStatus: e.target.value },
                }))
              }
            >
              <option value="">waitlist status (optional)</option>
              <option value="pending">pending</option>
              <option value="contacted">contacted</option>
              <option value="converted">converted</option>
            </select>
            <textarea
              placeholder="SMS body"
              value={campaignPayload.template.smsBody}
              onChange={(e) =>
                setCampaignPayload((prev) => ({
                  ...prev,
                  template: { ...prev.template, smsBody: e.target.value },
                }))
              }
            />
            <button type="submit" disabled={loading}>Send campaign</button>
            <small>Variables: {"{{name}}"}, {"{{firstName}}"}, {"{{phone}}"}, {"{{email}}"}</small>
          </form>

          <div className="admin-card">
            <h3>Delivery Logs</h3>
            <div className="admin-table">
              {campaignLogs.map((log) => (
                <div className="admin-row" key={log._id}>
                  <span>{log.campaignId}</span>
                  <span>{log.channel}</span>
                  <span>{log.status}</span>
                  <span>{log.recipientSnapshot?.email || log.recipientSnapshot?.phone || "-"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
