import React, { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import useCartSocket from "../hooks/useCartSocket";
import { getProductImageUrl } from "../utils/image";
import { markExpired } from "../redux/slices/cartSlice";
import {
  CHECKOUT_SHIPPING_FEE_NGN,
  CHECKOUT_VAT_PERCENT_LABEL,
} from "../config/checkoutPricing";
import CartCountdown from "../components/CartCountdown";
import { getSocket } from "../services/socket";
import "./Cart.css";

const formatVariantLabel = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  const hyphenIndex = text.indexOf("-");
  if (hyphenIndex < 0) return text;
  const trimmed = text.slice(hyphenIndex + 1).trim();
  return trimmed || text;
};

const Cart = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { 
    cartId,
    items, 
    totalQuantity, 
    totalAmount, 
    reservationExpiry, 
    reservationStatus,
    isExpired,
  } = useSelector((state) => state.cart);
  const products = useSelector((state) => state.products.items || []);
  const { addToCartSocket, removeFromCartSocket, updateQuantitySocket, updateVariantSocket } = useCartSocket();

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // Listen for reservation expiry
    const handleReservationExpired = (payload = {}) => {
      if (cartId && payload?.cartId && String(payload.cartId) !== String(cartId)) {
        return;
      }
      toast.error("Your cart reservation has expired. Items have been released.", {
        duration: 5000,
      });
      dispatch(markExpired());
    };

    socket.on("cart:reservation:expired", handleReservationExpired);

    return () => {
      socket.off("cart:reservation:expired", handleReservationExpired);
    };
  }, [dispatch, cartId]);

  const handleReservationExpired = () => {
    toast.error("Your reservation has expired. Please add items again.", {
      duration: 5000,
    });
    dispatch(markExpired());
  };

  const handleRemove = (item) => {
    toast.warning("Remove this item from cart?", {
      action: {
        label: "Remove",
        onClick: () => {
          // Only emit WebSocket event - let socket response update Redux
          removeFromCartSocket(item.lineKey || item.id, item.productId, item.variantId || null);
          toast.success("Item removed from cart!");
        },
      },
      cancel: {
        label: "Cancel",
        onClick: () => {},
      },
    });
  };

  const handleQuantityChange = (item, newQuantity) => {
    if (isExpired) {
      toast.error("Your reservation expired. Re-add items to continue.");
      return;
    }
    if (newQuantity > 0) {
      const effectiveAvailable = resolveEffectiveAvailableForItem(item);
      if (Number.isFinite(effectiveAvailable)) {
        const maxAllowed = Number(item.quantity || 0) + effectiveAvailable;
        if (newQuantity > maxAllowed) {
          toast.error(`Only ${Math.max(0, maxAllowed)} available for this item`);
          return;
        }
      }

      // Only emit WebSocket event - let socket response update Redux
      updateQuantitySocket(item.lineKey || item.id, newQuantity, item.productId, item.variantId || null);
    }
  };

  const resolveVariantOptions = (item) => {
    const listingId = String(item.listingId || item.productId || "");
    const groupedProduct = products.find((product) => String(product.id) === listingId);
    return Array.isArray(groupedProduct?.variants) ? groupedProduct.variants : [];
  };

  const resolveEffectiveAvailableForItem = (item) => {
    const listingId = String(item.listingId || item.parentGroupId || item.productId || "");
    const product = products.find(
      (entry) => String(entry.listingId || entry.id || "") === listingId
    );

    if (!product) {
      return Number.POSITIVE_INFINITY;
    }

    if (item.variantId) {
      const variant = (Array.isArray(product.variants) ? product.variants : []).find(
        (entry) => String(entry?.variantId || entry?.id || "") === String(item.variantId || "")
      );
      return Math.max(0, Number(variant?.availableQuantity || 0));
    }

    return Math.max(0, Number(product?.availableQuantity || 0));
  };

  const handleVariantChange = (item, nextVariantId) => {
    if (!nextVariantId) return;
    const options = resolveVariantOptions(item);
    const nextVariant = options.find(
      (variant) => String(variant?.variantId || variant?.id) === String(nextVariantId)
    );

    if (!nextVariant) {
      toast.error("Selected variant is unavailable");
      return;
    }

    const nextVariantAvailable = Math.max(0, Number(nextVariant?.availableQuantity || 0));
    if (nextVariantAvailable < Number(item.quantity || 0)) {
      toast.error(`Only ${nextVariantAvailable} available for selected variant`);
      return;
    }

    updateVariantSocket({
      lineKey: item.lineKey || item.id,
      productId: item.productId,
      currentVariantId: item.variantId || null,
      nextVariantId: String(nextVariant?.variantId || nextVariant?.id || ""),
      nextVariantName: nextVariant?.name || null,
      nextPrice: Number(nextVariant?.price || item.price || 0),
      nextImage: nextVariant?.image || nextVariant?.imageUrl || item.selectedImage || item.image || "",
    });
  };

  const handleCheckout = () => {
    if (isExpired) {
      toast.error("Your reservation expired. Re-add items to checkout.");
      return;
    }
    navigate("/checkout");
  };

  const handleReAddAll = () => {
    items.forEach((item) => {
      addToCartSocket(
        {
          id: item.productId,
          listingId: item.listingId || item.parentGroupId || item.productId,
          name: item.name,
          price: item.price,
          image: item.image,
          selectedImage: item.selectedImage || item.image,
          variantId: item.variantId || null,
          variantName: item.variantName || null,
          parentGroupId: item.parentGroupId || null,
          groupName: item.groupName || null,
          originalPrice: item.originalPrice || item.basePrice || item.price,
          discountPercent: item.intrinsicDiscountPercent || 0,
        },
        item.quantity
      );
    });
    toast.success("Re-reserving your items...");
  };

  if (items.length === 0) {
    return (
      <div className="cart-page empty-cart">
        <h2>Your Cart is Empty</h2>
        <p>Add some beautiful jewelry to your cart!</p>
        <button onClick={() => navigate("/products")} className="btn-shop">
          Browse Products
        </button>
      </div>
    );
  }

  return (
    <div className="cart-page">
      <h1>Shopping Cart</h1>

      {/* Cart Countdown Timer */}
      {items.length > 0 && (
        <CartCountdown
          expiryTime={reservationExpiry}
          status={reservationStatus}
          onExpired={handleReservationExpired}
          variant="cart"
        />
      )}

      <div className="cart-content">
        <div className="cart-items">
          {items.map((item) => (
            
            <div
              key={item.id}
              className={`cart-item${isExpired ? " is-expired" : ""}`}
              aria-disabled={isExpired}
            >
              <div className="item-image">
                {item.selectedImage || item.image ? (
                  <img
                    src={getProductImageUrl(item.selectedImage || item.image)}
                    alt={item.name}
                  />
                ) : (
                  <span>{item.category}</span>
                )}
              </div>

              <div className="item-details">
                <h3>{item.name}</h3>
                <p className="item-category">{item.category}</p>
                {item.groupName && (
                  <p className="item-category">Group: {item.groupName}</p>
                )}
                {item.variantName && (
                  <p className="item-category">Variant: {formatVariantLabel(item.variantName)}</p>
                )}
                {item.groupName && resolveVariantOptions(item).length > 0 && (
                  <select
                    value={item.variantId || ""}
                    disabled={isExpired}
                    onChange={(event) => handleVariantChange(item, event.target.value)}
                  >
                    {resolveVariantOptions(item).map((variant) => {
                      const value = String(variant?.variantId || variant?.id || "");
                      const available = Math.max(0, Number(variant?.availableQuantity || 0));
                      return (
                        <option key={value} value={value}>
                          {`${formatVariantLabel(variant?.name || value)} (${available} available)`}
                        </option>
                      );
                    })}
                  </select>
                )}
                {item.isCustom && (
                  <span className="custom-badge">Customized</span>
                )}
              </div>

              <div className="item-quantity">
                <button
                  disabled={isExpired}
                  onClick={() =>
                    handleQuantityChange(item, item.quantity - 1)
                  }
                >
                  -
                </button>
                <span>{item.quantity}</span>
                <button
                  disabled={isExpired || resolveEffectiveAvailableForItem(item) < 1}
                  onClick={() =>
                    handleQuantityChange(item, item.quantity + 1)
                  }
                >
                  +
                </button>
              </div>

              <div className="item-price">
                {(item.intrinsicDiscountPercent > 0 || item.discountPercent > 0) ? (
                  <>
                    <p className="base-price">
                      <span className="strikethrough">
                        ₦{Math.round(
                          item.intrinsicDiscountPercent > 0
                            ? (item.originalPrice || item.basePrice)
                            : item.basePrice
                        ).toLocaleString()}
                      </span>
                      <span className="discount-badge-small">
                        {(item.intrinsicDiscountPercent || item.discountPercent)}% off
                      </span>
                    </p>
                    <p className="unit-price">
                      ₦{Math.round(
                        item.intrinsicDiscountPercent > 0
                          ? item.basePrice
                          : item.unitPrice
                      ).toLocaleString()} each
                    </p>
                  </>
                ) : (
                  <p className="unit-price">
                    ₦{Math.round(item.basePrice).toLocaleString()} each
                  </p>
                )}
                <p className="total-price">
                  <strong>
                    ₦{Math.round(item.totalPrice).toLocaleString()}
                  </strong>
                </p>
              </div>

              <button
                className="remove-btn"
                disabled={isExpired}
                onClick={() => handleRemove(item)}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="cart-summary">
          <h2>Order Summary</h2>

          {isExpired && (
            <div className="expired-note">
              Reservation expired. Re-add items to reserve again.
            </div>
          )}

          <div className="summary-row">
            <span>Items ({totalQuantity})</span>
            <span>₦{Math.round(totalAmount).toLocaleString()}</span>
          </div>

          <div className="summary-row">
            <span>Shipping</span>
            <span>Shipping fee will be communicated to you when your order is processed</span>
          </div>

          <div className="summary-row">
            <span>VAT</span>
            <span>{`${CHECKOUT_VAT_PERCENT_LABEL} at checkout`}</span>
          </div>

          <div className="summary-divider"></div>

          <div className="summary-row total">
            <span>Total</span>
            <span>₦{Math.round(totalAmount).toLocaleString()}</span>
          </div>

          {isExpired && (
            <button className="readd-btn" onClick={handleReAddAll}>
              Re-add Items
            </button>
          )}

          <button className="checkout-btn" onClick={handleCheckout} disabled={isExpired}>
            Proceed to Checkout
          </button>

          <button
            className="continue-shopping"
            onClick={() => navigate("/products")}
          >
            Continue Shopping
          </button>
        </div>
      </div>
    </div>
  );
};

export default Cart;

//   const handleCheckout = () => {
//     navigate("/checkout");
//   };

//   if (items.length === 0) {
//     return (
//       <div className="cart-page empty-cart">
//         <h2>Your Cart is Empty</h2>
//         <p>Add some beautiful jewelry to your cart!</p>
//         <button onClick={() => navigate("/products")} className="btn-shop">
//           Browse Products
//         </button>
//       </div>
//     );
//   }

//   return (
//     <div className="cart-page">
//       <h1>Shopping Cart</h1>

//       <div className="cart-content">
//         <div className="cart-items">
//           {items.map((item) => (
//             <div key={item.id} className="cart-item">
//               <div className="item-image">
//                 {item.image ? (
//                   <img
//                     src={require(`../assets/product-images/${item.image}`)}
//                     alt={item.name}
//                   />
//                 ) : (
//                   <span>{item.category}</span>
//                 )}
//               </div>

//               <div className="item-details">
//                 <h3>{item.name}</h3>
//                 <p className="item-category">{item.category}</p>
//                 {item.isCustom && (
//                   <span className="custom-badge">Customized</span>
//                 )}
//               </div>

//               <div className="item-quantity">
//                 <button
//                   onClick={() =>
//                     handleQuantityChange(item.id, item.quantity - 1)
//                   }
//                 >
//                   -
//                 </button>
//                 <span>{item.quantity}</span>
//                 <button
//                   onClick={() =>
//                     handleQuantityChange(item.id, item.quantity + 1)
//                   }
//                 >
//                   +
//                 </button>
//               </div>

//               <div className="item-price">
//                 {item.discountPercent > 0 ? (
//                   <>
//                     <p className="base-price">
//                       <span className="strikethrough">
//                         ₦{Math.round(item.basePrice).toLocaleString()}
//                       </span>
//                       <span className="discount-badge-small">
//                         {item.discountPercent}% off
//                       </span>
//                     </p>
//                     <p className="unit-price">
//                       ₦{Math.round(item.unitPrice).toLocaleString()} each
//                     </p>
//                   </>
//                 ) : (
//                   <p className="unit-price">
//                     ₦{Math.round(item.basePrice).toLocaleString()} each
//                   </p>
//                 )}
//                 <p className="total-price">
//                   <strong>
//                     ₦{Math.round(item.totalPrice).toLocaleString()}
//                   </strong>
//                 </p>
//               </div>

//               <button
//                 className="remove-btn"
//                 onClick={() => handleRemove(item.id)}
//               >
//                 ×
//               </button>
//             </div>
//           ))}
//         </div>

//         <div className="cart-summary">
//           <h2>Order Summary</h2>

//           <div className="summary-row">
//             <span>Items ({totalQuantity})</span>
//             <span>₦{Math.round(totalAmount).toLocaleString()}</span>
//           </div>

//           <div className="summary-row">
//             <span>Shipping</span>
//             <span>Calculated at checkout</span>
//           </div>

//           <div className="summary-row">
//             <span>Tax</span>
//             <span>Calculated at checkout</span>
//           </div>

//           <div className="summary-divider"></div>

//           <div className="summary-row total">
//             <span>Total</span>
//             <span>₦{Math.round(totalAmount).toLocaleString()}</span>
//           </div>

//           <button className="checkout-btn" onClick={handleCheckout}>
//             Proceed to Checkout
//           </button>

//           <button
//             className="continue-shopping"
//             onClick={() => navigate("/products")}
//           >
//             Continue Shopping
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default Cart;
