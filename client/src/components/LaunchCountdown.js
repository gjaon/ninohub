import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useLaunch } from "../context/LaunchContext";
import useWaitlistCount from "../hooks/useWaitlistCount";
import "./LaunchCountdown.css";

const LaunchCountdown = () => {
  const { pathname } = useLocation();
  const { isPreLaunch, launchDate } = useLaunch();
  const shouldTrackWaitlistCount = pathname !== "/waitlist";
  const { count: waitlistCount, isLoading: isWaitlistCountLoading } =
    useWaitlistCount(shouldTrackWaitlistCount);

  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);

  // Sample promotional images
  const promotionalImages = [
    require("../assets/sales/sales3.jpeg"),
    require("../assets/sales/sales2.png"),
    require("../assets/sales/sales1.png"),
  ];

  // Countdown timer - Initialize all hooks at top level
  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = launchDate - new Date().getTime();

      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60),
        });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [launchDate]);

  // Auto-rotate images every 5 seconds
  useEffect(() => {
    if (!autoRotate) return;

    const imageTimer = setInterval(() => {
      setCurrentImageIndex(
        (prevIndex) => (prevIndex + 1) % promotionalImages.length
      );
    }, 5000);

    return () => clearInterval(imageTimer);
  }, [autoRotate, promotionalImages.length]);

  const goToPreviousImage = () => {
    setAutoRotate(false);
    setCurrentImageIndex(
      (prevIndex) =>
        (prevIndex - 1 + promotionalImages.length) % promotionalImages.length
    );
  };

  const goToNextImage = () => {
    setAutoRotate(false);
    setCurrentImageIndex(
      (prevIndex) => (prevIndex + 1) % promotionalImages.length
    );
  };

  const goToImage = (index) => {
    setAutoRotate(false);
    setCurrentImageIndex(index);
  };

  // Hide countdown on waitlist page
  if (pathname === "/waitlist") {
    return null;
  }

  // If launch date has passed, show nothing
  if (!isPreLaunch) {
    return null;
  }

  return (
    <div className="launch-countdown-overlay">
      <div className="launch-countdown-wrapper">
        {/* Image Carousel Section */}
        <div className="carousel-section">
          <div className="carousel-container">
            <img
              src={promotionalImages[currentImageIndex]}
              alt="Promotional Flier"
              className="carousel-image"
            />
            <div className="carousel-overlay"></div>
          </div>

          {/* Navigation Arrows */}
          <button
            className="carousel-arrow carousel-arrow-left"
            onClick={goToPreviousImage}
            title="Previous image"
          >
            &#10094;
          </button>
          <button
            className="carousel-arrow carousel-arrow-right"
            onClick={goToNextImage}
            title="Next image"
          >
            &#10095;
          </button>

          {/* Carousel Dots */}
          <div className="carousel-dots">
            {promotionalImages.map((_, index) => (
              <button
                key={index}
                className={`dot ${index === currentImageIndex ? "active" : ""}`}
                onClick={() => goToImage(index)}
                title={`Go to image ${index + 1}`}
              ></button>
            ))}
          </div>
        </div>

        {/* Content Section */}
        <div className="countdown-section">
          <div className="countdown-content">
            <h2 className="launch-title">
              🎉 Launching with Massive Discounts! 🎉
            </h2>
            <p className="launch-message">
              Get ready for our awoof sales starting on{" "}
              <strong>March 6th, 2026 at 12:00 AM</strong>
            </p>

            <div className="countdown-timer">
              <div className="countdown-item">
                <div className="countdown-value">
                  {String(timeLeft.days).padStart(2, "0")}
                </div>
                <div className="countdown-label">Days</div>
              </div>
              <div className="countdown-separator">:</div>
              <div className="countdown-item">
                <div className="countdown-value">
                  {String(timeLeft.hours).padStart(2, "0")}
                </div>
                <div className="countdown-label">Hours</div>
              </div>
              <div className="countdown-separator">:</div>
              <div className="countdown-item">
                <div className="countdown-value">
                  {String(timeLeft.minutes).padStart(2, "0")}
                </div>
                <div className="countdown-label">Minutes</div>
              </div>
              <div className="countdown-separator">:</div>
              <div className="countdown-item">
                <div className="countdown-value">
                  {String(timeLeft.seconds).padStart(2, "0")}
                </div>
                <div className="countdown-label">Seconds</div>
              </div>
            </div>

            <p className="launch-subtext">
              Join our waitlist to be notified about the launch and get
              exclusive early-bird discounts!
            </p>

            <p className="waitlist-count-text">
              {isWaitlistCountLoading
                ? "Loading waitlist..."
                : `${waitlistCount.toLocaleString()} people already joined the waitlist`}
            </p>

            <a href="/waitlist" className="btn-join-waitlist">
              Join Waitlist
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LaunchCountdown;
