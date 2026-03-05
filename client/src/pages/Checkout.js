import React, { useState, useEffect, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { clearCart } from "../redux/slices/cartSlice";
import { setUser } from "../redux/slices/userSlice";
import { getUser } from "../services/auth";
import {
  initializeMarketplaceCheckout,
  verifyMarketplaceCheckout,
} from "../services/marketplace";
import { getSocket } from "../services/socket";
import {
  CHECKOUT_SHIPPING_FEE_NGN,
  CHECKOUT_TAX_RATE,
  CHECKOUT_VAT_PERCENT_LABEL,
} from "../config/checkoutPricing";
import CartCountdown from "../components/CartCountdown";
import "./Checkout.css";

const toMoney = (value) => Math.round(Number(value || 0) * 100) / 100;

const computeCheckoutTotals = (subtotalAmount, options = {}) => {
  const isPickup = String(options.fulfillmentMethod || "").toLowerCase() === "pickup";
  const subtotal = toMoney(subtotalAmount);
  const shipping = subtotal > 0 && !isPickup ? CHECKOUT_SHIPPING_FEE_NGN : 0;
  const tax = toMoney(subtotal * CHECKOUT_TAX_RATE);
  const total = toMoney(subtotal + shipping + tax);

  return {
    subtotal,
    shipping,
    tax,
    total,
  };
};

const formatNaira = (amount) =>
  `₦${Number(amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

const Checkout = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    cartId,
    items, 
    totalAmount, 
    reservationExpiry, 
    reservationStatus 
  } = useSelector((state) => state.cart);
  const { currentUser, isAuthenticated } = useSelector((state) => state.user);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [authResolved, setAuthResolved] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [fulfillmentMethod, setFulfillmentMethod] = useState("delivery");
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    address: "",
    state: "",
    country: "",
  });

  const searchParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search]
  );

  const paymentReference = searchParams.get("reference") || searchParams.get("trxref");
  const verifyStatus = searchParams.get("verify") || searchParams.get("status");
  const checkoutTotals = useMemo(
    () => computeCheckoutTotals(totalAmount, { fulfillmentMethod }),
    [totalAmount, fulfillmentMethod]
  );

  useEffect(() => {
    let isMounted = true;

    const restoreSession = async () => {
      if (isAuthenticated && currentUser) {
        if (isMounted) {
          setAuthResolved(true);
        }
        return;
      }

      try {
        const restoredUser = await getUser();
        if (restoredUser) {
          dispatch(setUser(restoredUser));
        }
      } catch (_restoreError) {
      } finally {
        if (isMounted) {
          setAuthResolved(true);
        }
      }
    };

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, [dispatch, isAuthenticated, currentUser]);

  useEffect(() => {
    if (!authResolved) {
      return;
    }

    const isPaymentReturn = Boolean(paymentReference);

    if (!isAuthenticated || !currentUser) {
      if (isPaymentReturn) {
        return;
      }

      navigate("/login", {
        state: {
          redirectTo: "/checkout",
          fromCheckout: true,
        },
      });
      return;
    }

    const socket = getSocket();
    if (!socket) return;

    // Notify backend that checkout has started
    socket.emit("cart:startCheckout");

    // Listen for checkout started confirmation
    const handleCheckoutStarted = (data) => {
      console.log("Checkout timer started:", data);
    };

    // Listen for reservation expiry
    const handleReservationExpired = (payload = {}) => {
      if (cartId && payload?.cartId && String(payload.cartId) !== String(cartId)) {
        return;
      }
      toast.error("Your checkout time has expired. Items have been released.", {
        duration: 5000,
      });
      dispatch(clearCart());
      navigate("/cart");
    };

    socket.on("cart:checkoutStarted", handleCheckoutStarted);
    socket.on("cart:reservation:expired", handleReservationExpired);

    return () => {
      socket.off("cart:checkoutStarted", handleCheckoutStarted);
      socket.off("cart:reservation:expired", handleReservationExpired);
      
      // If leaving checkout without completing, cancel checkout
      if (reservationStatus === "checkout") {
        socket.emit("cart:cancelCheckout");
      }
    };
  }, [
    dispatch,
    navigate,
    cartId,
    reservationStatus,
    isAuthenticated,
    currentUser,
    authResolved,
    paymentReference,
  ]);

  const handleReservationExpired = () => {
    toast.error("Your checkout time has expired. Please try again.", {
      duration: 5000,
    });
    dispatch(clearCart());
    navigate("/cart");
  };

  useEffect(() => {
    const verifyReturnPayment = async () => {
      if (!paymentReference) {
        return;
      }

      const verifyingKey = `verifying:${paymentReference}`;
      const alreadyVerified = sessionStorage.getItem(`verified:${paymentReference}`);
      const currentlyVerifying = sessionStorage.getItem(verifyingKey);
      if (alreadyVerified || currentlyVerifying) {
        return;
      }

      try {
        sessionStorage.setItem(verifyingKey, "1");
        setVerifying(true);
        setCheckoutError("");

        const persistedShipping = sessionStorage.getItem("checkoutShippingAddress");
        const shippingAddress = persistedShipping ? JSON.parse(persistedShipping) : undefined;

        await verifyMarketplaceCheckout({
          reference: paymentReference,
          status: verifyStatus === "failed" ? "failed" : undefined,
          shippingAddress,
        });

        sessionStorage.setItem(`verified:${paymentReference}`, "1");
        sessionStorage.removeItem(verifyingKey);
        toast.success("Payment verified and order created successfully");
        dispatch(clearCart());
        navigate("/track-order", { replace: true });
      } catch (error) {
        sessionStorage.removeItem(verifyingKey);
        setCheckoutError(error.message || "Verification failed");
        toast.error(error.message || "Verification failed");
      } finally {
        setVerifying(false);
      }
    };

    verifyReturnPayment();
  }, [
    paymentReference,
    verifyStatus,
    dispatch,
    navigate,
  ]);

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleNext = () => {
    if (step < 2) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const toShippingAddress = () => {
    if (fulfillmentMethod === "pickup") {
      return {
        fulfillmentMethod: "pickup",
        pickupLocation: "Nino's store, Lafe Junction, Akure",
      };
    }

    return {
      fulfillmentMethod: "delivery",
      fullName: formData.fullName,
      email: formData.email,
      phone: formData.phone,
      street: formData.address,
      state: formData.state,
      country: formData.country,
    };
  };

  const validateShipping = () => {
    if (fulfillmentMethod === "pickup") {
      return true;
    }

    const requiredFields = [
      "fullName",
      "email",
      "phone",
      "address",
      "state",
      "country",
    ];
    return requiredFields.every((field) => String(formData[field] || "").trim());
  };

  const createUuid = () =>
    (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const handleProceedToPayment = async () => {
    if (!validateShipping()) {
      setCheckoutError("Please complete the required delivery information before continuing");
      return;
    }

    if (!currentUser || !isAuthenticated) {
      navigate("/login", {
        state: { redirectTo: "/checkout", fromCheckout: true },
      });
      return;
    }

    try {
      setSubmitting(true);
      setCheckoutError("");

      const shippingAddress = toShippingAddress();
      sessionStorage.setItem("checkoutShippingAddress", JSON.stringify(shippingAddress));

      const idempotencyKey = createUuid();
      const correlationId = createUuid();

      const response = await initializeMarketplaceCheckout(
        {
          shippingAddress,
          sessionId: localStorage.getItem("sessionId") || null,
        },
        idempotencyKey,
        correlationId
      );

      if (!response?.authorizationUrl) {
        throw new Error("Payment provider did not return authorization URL");
      }

      window.location.href = response.authorizationUrl;
    } catch (error) {
      setCheckoutError(error.message || "Failed to initialize checkout");
    } finally {
      setSubmitting(false);
    }
  };

  if (items.length === 0 && !paymentReference) {
    navigate("/cart");
    return null;
  }

  return (
    <div className="checkout-page">
      <h1>Checkout</h1>

      {/* Checkout Countdown Timer */}
      <CartCountdown
        expiryTime={reservationExpiry}
        status={reservationStatus}
        onExpired={handleReservationExpired}
        variant="checkout"
      />

      <div className="checkout-progress">
        <div className={`progress-item ${step >= 1 ? "active" : ""}`}>
          <div className="progress-circle">1</div>
          <span>Delivery</span>
        </div>
        <div className={`progress-item ${step >= 2 ? "active" : ""}`}>
          <div className="progress-circle">2</div>
          <span>Review</span>
        </div>
      </div>

      {checkoutError ? <p className="checkout-error">{checkoutError}</p> : null}
      {verifying ? <p className="checkout-info">Verifying payment and finalizing order...</p> : null}

      <div className="checkout-content">
        <div className="checkout-form">
          {step === 1 && (
            <div className="form-section">
              <h2>How would you like to receive your order?</h2>

              <div className="fulfillment-options">
                <button
                  type="button"
                  className={`fulfillment-option ${fulfillmentMethod === "delivery" ? "active" : ""}`}
                  onClick={() => {
                    setFulfillmentMethod("delivery");
                    setCheckoutError("");
                  }}
                >
                  Delivery
                </button>
                <button
                  type="button"
                  className={`fulfillment-option ${fulfillmentMethod === "pickup" ? "active" : ""}`}
                  onClick={() => {
                    setFulfillmentMethod("pickup");
                    setCheckoutError("");
                  }}
                >
                  Pick up at Nino's store
                </button>
              </div>

              {fulfillmentMethod === "pickup" ? (
                <div className="pickup-note">
                  Pickup location: Nino's store, Lafe Junction, Akure.
                </div>
              ) : (
              <div className="form-grid">
                <input
                  type="text"
                  name="fullName"
                  placeholder="Full Name *"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  required
                  className="full-width"
                />
                <input
                  type="email"
                  name="email"
                  placeholder="Email *"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                  className="full-width"
                />
                <input
                  type="tel"
                  name="phone"
                  placeholder="Phone Number *"
                  value={formData.phone}
                  onChange={handleInputChange}
                  required
                  className="full-width"
                />
                <input
                  type="text"
                  name="address"
                  placeholder="Address *"
                  value={formData.address}
                  onChange={handleInputChange}
                  required
                  className="full-width"
                />
                <input
                  type="text"
                  name="state"
                  placeholder="State *"
                  value={formData.state}
                  onChange={handleInputChange}
                  required
                />
                <input
                  type="text"
                  name="country"
                  placeholder="Country *"
                  value={formData.country}
                  onChange={handleInputChange}
                  required
                />
              </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="form-section review-section">
              <h2>Review Your Order</h2>

              <div className="review-group">
                <h3>{fulfillmentMethod === "pickup" ? "Pickup Details" : "Delivery Details"}</h3>
                {fulfillmentMethod === "pickup" ? (
                  <p>Nino's store, Lafe Junction, Akure</p>
                ) : (
                  <>
                    <p>{formData.fullName}</p>
                    <p>{formData.address}</p>
                    <p>{formData.state}</p>
                    <p>{formData.country}</p>
                    <p>{formData.email}</p>
                    <p>{formData.phone}</p>
                  </>
                )}
              </div>

              <div className="review-group">
                <h3>Payment Method</h3>
                <p>Paystack secure redirect</p>
                <p>No manual card entry on this page</p>
              </div>

              <div className="review-group">
                <h3>Order Items</h3>
                {items.map((item) => (
                  <div key={item.id} className="review-item">
                    <span>
                      {item.name} × {item.quantity}
                    </span>
                    <span>₦{item.totalPrice.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="form-actions">
            {step > 1 && (
              <button className="btn-back" onClick={handleBack}>
                Back
              </button>
            )}
            {step < 2 ? (
              <button className="btn-next" onClick={handleNext}>
                Continue
              </button>
            ) : (
              <button
                className="btn-place-order"
                onClick={handleProceedToPayment}
                disabled={submitting || verifying}
              >
                {submitting ? "Redirecting..." : "Proceed to Paystack"}
              </button>
            )}
          </div>
        </div>

        <div className="order-summary">
          <h2>Order Summary</h2>

          <div className="summary-items">
            {items.map((item) => (
              <div key={item.id} className="summary-item">
                <span>
                  {item.name} × {item.quantity}
                </span>
                <span>₦{item.totalPrice.toLocaleString()}</span>
              </div>
            ))}
          </div>

          <div className="summary-totals">
            <div className="summary-row">
              <span>Subtotal</span>
              <span>{formatNaira(checkoutTotals.subtotal)}</span>
            </div>
            <div className="summary-row">
              <span>{fulfillmentMethod === "pickup" ? "Pickup" : "Shipping"}</span>
              <span>
                {fulfillmentMethod === "pickup"
                  ? "₦0"
                  : formatNaira(checkoutTotals.shipping)}
              </span>
            </div>
            <div className="summary-row">
              <span>{`VAT (${CHECKOUT_VAT_PERCENT_LABEL})`}</span>
              <span>{formatNaira(checkoutTotals.tax)}</span>
            </div>
            <div className="summary-divider"></div>
            <div className="summary-row total">
              <span>Total</span>
              <span>{formatNaira(checkoutTotals.total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
