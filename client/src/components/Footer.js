import React from "react";
import { Link } from "react-router-dom";
import "./Footer.css";

const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-section">
          <h3>Shop with Nino</h3>
          <p>
            Premium jewelry for every occasion. Wholesale, retail, and custom
            designs.
          </p>
          <div className="social-icons">
            <a href="https://www.facebook.com/shopwithnino" aria-label="Facebook">
              <img
                src={require("../assets/facebook-icon.svg").default}
                alt="Facebook"
              />
            </a>
            <a href="https://www.instagram.com/shop_with_nino?igsh=MTNudHdudnVnMDJvaQ==" aria-label="Instagram">
              <img
                src={require("../assets/instagram-icon.svg").default}
                alt="Instagram"
              />
            </a>
            <a href="https://www.tiktok.com/@shopwith_nino?_r=1&_t=ZS-93xNsLH49VV" aria-label="TikTok">
              <img
                src={require("../assets/tiktok-icon.svg").default}
                alt="TikTok"
              />
            </a>
          </div>
        </div>

        <div className="footer-section">
          <h4>Quick Links</h4>
          <ul>
            <li>
              <Link to="/products">Shop</Link>
            </li>
            {/* <li>
              <Link to="/customization">Customize</Link>
            </li> */}
            <li>
              <Link to="/track-order">Track Order</Link>
            </li>
            <li>
              <Link to="/cart">Cart</Link>
            </li>
          </ul>
        </div>

        <div className="footer-section">
          <h4>Customer Service</h4>
          <ul>
            <li>
              <Link to="/contact">Contact Us</Link>
            </li>
            <li>
              <a href="#shipping">Shipping Info</a>
            </li>
            <li>
              <a href="#returns">Returns</a>
            </li>
            <li>
              <a href="#faq">FAQ</a>
            </li>
          </ul>
        </div>
      </div>

      <div className="footer-bottom">
        <p>&copy; 2025 Shop with Nino. All rights reserved.</p>
      </div>
    </footer>
  );
};

export default Footer;
