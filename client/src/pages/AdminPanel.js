import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import {
  addFallbackNote,
  getAdminUsers,
  getAdminWaitlist,
  getCampaignDeliveryLogs,
  getFallbackById,
  getFallbackQueue,
  markFallbackReviewed,
  resolveFallback,
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
    channels: ["email"],
    audience: {
      scope: "all",
      query: "",
      waitlistStatus: "",
      userSegment: "",
    },
    template: {
      subject: "Hello {{firstName}}",
      emailBody: "<p>Hello {{name}}, this is a message from NINO.</p>",
      smsBody: "Hi {{firstName}}, this is a message from NINO.",
    },
  });
  const [campaignLogs, setCampaignLogs] = useState([]);

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

  useEffect(() => {
    if (!isAdmin) return;
    loadFallbacks();
    loadUsers();
    loadWaitlist();
    loadCampaignLogs();
  }, [isAdmin, loadFallbacks, loadUsers, loadWaitlist, loadCampaignLogs]);

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

  return (
    <div className="admin-page">
      <h1>Admin Panel</h1>
      {error && <div className="admin-error">{error}</div>}

      <div className="admin-tabs">
        <button onClick={() => setActiveTab("fallbacks")} className={activeTab === "fallbacks" ? "active" : ""}>Fallbacks</button>
        <button onClick={() => setActiveTab("users")} className={activeTab === "users" ? "active" : ""}>Users</button>
        <button onClick={() => setActiveTab("waitlist")} className={activeTab === "waitlist" ? "active" : ""}>Waitlist</button>
        <button onClick={() => setActiveTab("campaigns")} className={activeTab === "campaigns" ? "active" : ""}>Campaigns</button>
      </div>

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
                <pre>{JSON.stringify(selectedFallback, null, 2)}</pre>
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
            <h3>Send Campaign</h3>
            <input placeholder="Campaign name" value={campaignPayload.name} onChange={(e) => setCampaignPayload((prev) => ({ ...prev, name: e.target.value }))} required />
            <div className="admin-actions">
              <label>
                <input
                  type="checkbox"
                  checked={campaignPayload.channels.includes("email")}
                  onChange={(e) => {
                    setCampaignPayload((prev) => ({
                      ...prev,
                      channels: e.target.checked
                        ? [...new Set([...prev.channels, "email"])]
                        : prev.channels.filter((item) => item !== "email"),
                    }));
                  }}
                />
                Email
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={campaignPayload.channels.includes("sms")}
                  onChange={(e) => {
                    setCampaignPayload((prev) => ({
                      ...prev,
                      channels: e.target.checked
                        ? [...new Set([...prev.channels, "sms"])]
                        : prev.channels.filter((item) => item !== "sms"),
                    }));
                  }}
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
            <input
              placeholder="Email subject"
              value={campaignPayload.template.subject}
              onChange={(e) =>
                setCampaignPayload((prev) => ({
                  ...prev,
                  template: { ...prev.template, subject: e.target.value },
                }))
              }
            />
            <textarea
              placeholder="Email body (HTML allowed)"
              value={campaignPayload.template.emailBody}
              onChange={(e) =>
                setCampaignPayload((prev) => ({
                  ...prev,
                  template: { ...prev.template, emailBody: e.target.value },
                }))
              }
            />
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
