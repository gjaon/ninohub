import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import "./Navbar.css";

const Navbar = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const {
    items,
    customizations,
    reservationStatus,
    remainingTime,
    reservationExpiry,
    isExpired,
  } = useSelector((state) => state.cart);
  const cartItemCount = (items?.length || 0) + (customizations?.length || 0);
  const { isAuthenticated, currentUser } = useSelector((state) => state.user);
  const adminEmails = String(process.env.REACT_APP_ADMIN_EMAIL_ALLOWLIST || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const isAdmin =
    isAuthenticated &&
    (Boolean(currentUser?.isAdmin) ||
      adminEmails.includes(String(currentUser?.email || "").toLowerCase()));
  const isCountdownActive =
    cartItemCount > 0 &&
    !isExpired &&
    reservationStatus === "active" &&
    remainingTime > 0;
  const totalSeconds = 300;
  const ringProgress = isCountdownActive
    ? Math.max(0, Math.min(1, remainingTime / totalSeconds))
    : 0;
  const badgeStyle = isCountdownActive
    ? { "--ring-progress": ringProgress }
    : undefined;

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  // Prevent body scroll when mobile menu is open
  React.useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isMobileMenuOpen]);

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-logo" onClick={closeMobileMenu}>
          <img
            src={require("../assets/logo.svg").default}
            alt="Shop with Nino"
            className="logo-img"
          />
          <span>Shop with Nino</span>
        </Link>

        <ul className={`navbar-menu ${isMobileMenuOpen ? "active" : ""}`}>
          <li>
            <Link to="/" onClick={closeMobileMenu}>
              Home
            </Link>
          </li>
          <li>
            <Link to="/products" onClick={closeMobileMenu}>
              Products
            </Link>
          </li>
          {/* <li>
            <Link to="/customization" onClick={closeMobileMenu}>
              Customization
            </Link>
          </li> */}
          <li>
            <Link to="/track-order">Track Order</Link>
          </li>
          {isAuthenticated ? (
            <>
              {isAdmin && (
                <li>
                  <Link to="/admin" onClick={closeMobileMenu}>
                    Admin
                  </Link>
                </li>
              )}
              <li>
                <Link
                  to="/profile"
                  onClick={closeMobileMenu}
                  className="user-info-link"
                >
                  {currentUser?.name || "User"}
                </Link>
              </li>
            </>
          ) : (
            <li>
              <Link to="/login" onClick={closeMobileMenu}>
                Login
              </Link>
            </li>
          )}
        </ul>

        <div className="navbar-actions">
          <Link to="/cart" className="cart-link" onClick={closeMobileMenu}>
            <img
              src={require("../assets/cart-icon.svg").default}
              alt="Cart"
              className="cart-icon"
            />
            <span>Cart</span>
            {cartItemCount > 0 && (
              <span
                key={reservationExpiry || "badge"}
                className={`cart-badge${isCountdownActive ? " countdown-active" : ""}`}
                style={badgeStyle}
              >
                {isCountdownActive && (
                  <svg className="cart-badge-ring" viewBox="0 0 36 36">
                    <circle className="ring-bg" cx="18" cy="18" r="15.915" />
                    <circle className="ring-progress" cx="18" cy="18" r="15.915" />
                  </svg>
                )}
                {cartItemCount}
              </span>
            )}
          </Link>

          <button
            className={`hamburger ${isMobileMenuOpen ? "active" : ""}`}
            onClick={toggleMobileMenu}
            aria-label="Toggle menu"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="mobile-menu-overlay" onClick={closeMobileMenu}></div>
      )}
    </nav>
  );
};

export default Navbar;
