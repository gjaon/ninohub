import React, { useState } from "react";
import { joinWaitlist } from "../services/waitlist";
import { GiftIcon, ClockIcon, StarIcon, BellIcon, RocketIcon, DiamondIcon } from "../components/icons/SvgIcons";
import "./WaitlistForm.css";

const WaitlistForm = () => {
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage({ type: "", text: "" });

    try {
      await joinWaitlist({
        name: formData.name,
        phone: formData.phone,
        email: formData.email || null,
      });

      setMessage({
        type: "success",
        text: "Success! Thank you for joining our waitlist. You'll receive exclusive updates and early-bird discounts!",
      });

      setFormData({
        name: "",
        phone: "",
        email: "",
      });

      // Clear message after 5 seconds
      setTimeout(() => {
        setMessage({ type: "", text: "" });
      }, 5000);
    } catch (error) {
      const errorMsg = error.message || "An error occurred";
      setMessage({
        type: "error",
        text: errorMsg,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="waitlist-form-page">
      <div className="waitlist-form-container">
        <div className="waitlist-header">
          <h1>Join Our Waitlist</h1>
          <p>
            Be among the first to experience our exclusive jewelry collection
            with massive discounts!
          </p>
        </div>

        <div className="waitlist-form-wrapper">
          <form className="waitlist-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="name">Full Name *</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Enter your full name"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="phone">Phone Number *</label>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                placeholder="Enter your phone number"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="email">Email Address (Optional)</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="Enter your email address"
              />
            </div>

            {message.text && (
              <div className={`message ${message.type}`}>
                {message.text}
              </div>
            )}

            <button
              type="submit"
              className="btn-submit"
              disabled={isLoading}
            >
              {isLoading ? "Joining..." : "Join Waitlist"}
            </button>
          </form>

          <div className="waitlist-benefits">
            <h3>Why Join Our Waitlist?</h3>
            <ul>
              <li>
                <span className="benefit-icon"><GiftIcon /></span>
                <span>Exclusive early-bird discounts up to 50% off</span>
              </li>
              <li>
                <span className="benefit-icon"><ClockIcon /></span>
                <span>First access to our launch collection</span>
              </li>
              <li>
                <span className="benefit-icon"><StarIcon /></span>
                <span>Special VIP offers for waitlist members</span>
              </li>
              <li>
                <span className="benefit-icon"><BellIcon /></span>
                <span>Instant notifications about promotions and new products</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="launch-info">
          <div className="info-card">
            <div className="info-icon"><RocketIcon /></div>
            <h4>Launch Date</h4>
            <p>March 6th, 2026 • 8:00 PM</p>
          </div>
          <div className="info-card">
            <div className="info-icon"><DiamondIcon /></div>
            <h4>Massive Discounts</h4>
            <p>Up to 50% off all items</p>
          </div>
          <div className="info-card">
            <div className="info-icon"><StarIcon /></div>
            <h4>First Launch Offer</h4>
            <p>Extra 10% off for waitlist members</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WaitlistForm;
