import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "sonner";
import { logout } from "../redux/slices/userSlice";
import { logoutUser } from "../services/auth";
import "./MaintenancePage.css";

const parseAdminAllowlist = () =>
  String(process.env.REACT_APP_ADMIN_EMAIL_ALLOWLIST || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

const MaintenancePage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isAuthenticated, currentUser } = useSelector((state) => state.user);
  const adminAllowlist = useMemo(parseAdminAllowlist, []);
  const isAdmin =
    isAuthenticated &&
    (Boolean(currentUser?.isAdmin) ||
      adminAllowlist.includes(String(currentUser?.email || "").toLowerCase()));

  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logoutUser();
    } catch (_error) {
      // Even if the request fails, clear local session so the user isn't stuck.
    }
    localStorage.removeItem("accessToken");
    dispatch(logout());
    toast.success("Logged out");
    setLoggingOut(false);
    navigate("/");
  };

  return (
    <div className="maintenance-page">
      <div className="maintenance-card">
        <div className="maintenance-mark" aria-hidden="true">
          <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.4">
            <circle cx="32" cy="32" r="28" />
            <path d="M32 18v14l9 6" strokeLinecap="round" />
          </svg>
        </div>

        <h1 className="maintenance-title">We&rsquo;ll be right back</h1>
        <p className="maintenance-copy">
          Shop with Nino is undergoing scheduled maintenance. Our shop, product
          pages, and order tracking are temporarily unavailable. Thank you for
          your patience.
        </p>

        {isAdmin && (
          <div className="maintenance-admin">
            <p className="maintenance-admin-label">Admin tools</p>
            <Link to="/barcode" className="maintenance-cta">
              Open Barcode Generator
            </Link>
          </div>
        )}

        <div className="maintenance-session">
          {isAuthenticated ? (
            <>
              <span className="maintenance-session-name">
                Signed in as {currentUser?.email || currentUser?.name || "you"}
              </span>
              <button
                type="button"
                className="maintenance-session-btn"
                onClick={handleLogout}
                disabled={loggingOut}
              >
                {loggingOut ? "Logging out..." : "Log out"}
              </button>
            </>
          ) : (
            <Link to="/login" className="maintenance-session-btn">
              Log in
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

export default MaintenancePage;
