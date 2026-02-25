import React, { useState, useEffect } from "react";
import "./CartCountdown.css";

const CartCountdown = ({ 
  expiryTime, 
  status = "active", 
  onExpired,
  variant = "cart" // "cart" or "checkout"
}) => {
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!expiryTime || status === "completed") {
      setTimeRemaining(0);
      return;
    }

    const calculateTimeRemaining = () => {
      const now = new Date();
      const expiry = new Date(expiryTime);
      const remaining = Math.max(0, Math.floor((expiry - now) / 1000));
      
      setTimeRemaining(remaining);
      
      if (remaining === 0 && !isExpired) {
        setIsExpired(true);
        if (onExpired) {
          onExpired();
        }
      }
    };

    calculateTimeRemaining();
    const interval = setInterval(calculateTimeRemaining, 1000);

    return () => clearInterval(interval);
  }, [expiryTime, status, isExpired, onExpired]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getWarningLevel = () => {
    if (timeRemaining <= 60) return "critical"; // Last minute
    if (timeRemaining <= 120) return "warning"; // Last 2 minutes
    return "normal";
  };

  if (!expiryTime || status === "completed" || timeRemaining === 0) {
    return null;
  }

  const warningLevel = getWarningLevel();
  const isCheckout = variant === "checkout";

  return (
    <div className={`cart-countdown ${warningLevel} ${isCheckout ? "checkout-mode" : ""}`}>
      <div className="cart-countdown-content">
        <div className="cart-countdown-icon">
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M10 0C4.486 0 0 4.486 0 10s4.486 10 10 10 10-4.486 10-10S15.514 0 10 0zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z"
              fill="currentColor"
            />
            <path
              d="M10 4c-.553 0-1 .447-1 1v5c0 .267.105.52.293.707l3 3c.391.391 1.023.391 1.414 0 .391-.391.391-1.023 0-1.414L11 9.586V5c0-.553-.447-1-1-1z"
              fill="currentColor"
            />
          </svg>
        </div>
        <div className="cart-countdown-text">
          <span className="cart-countdown-label">
            {isCheckout ? "Complete checkout in" : "Items reserved for"}
          </span>
          <span className="cart-countdown-time">{formatTime(timeRemaining)}</span>
        </div>
      </div>
      {warningLevel === "critical" && (
        <div className="cart-countdown-warning">
          Hurry! Your reservation expires soon
        </div>
      )}
    </div>
  );
};

export default CartCountdown;
