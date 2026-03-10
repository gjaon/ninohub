import React, { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import useCartSocket from "../hooks/useCartSocket";
import { getProductImageUrl } from "../utils/image";
import {
  markExpired,
  beginOptimisticOperation,
  rollbackOptimisticOperation,
  removeFromCart,
  updateQuantity,
} from "../redux/slices/cartSlice";
import { marketplaceRealtimeFlags } from "../config/marketplaceRealtimeFlags";
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
  const [isReadding, setIsReadding] = React.useState(false);
  const [isOpeningCheckout, setIsOpeningCheckout] = React.useState(false);
  const [pendingLineOperations, setPendingLineOperations] = React.useState({});

  useEffect(() => {
    const activeKeys = new Set(items.map((item) => String(item.lineKey || item.id || "")));
    setPendingLineOperations((current) => {
      const next = { ...current };
      let changed = false;
      Object.keys(next).forEach((lineKey) => {
        if (!activeKeys.has(String(lineKey || ""))) {
          delete next[lineKey];
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [items]);

  const createOperationId = React.useCallback(
    () => `cart-op-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    []
  );

  const setLinePending = React.useCallback((lineKey, operationId) => {
    setPendingLineOperations((current) => ({
      ...current,
      [String(lineKey || "")]: operationId,
    }));
  }, []);

  const clearLinePending = React.useCallback((lineKey, operationId = "") => {
    const normalizedLineKey = String(lineKey || "");
    const normalizedOperationId = String(operationId || "");
    setPendingLineOperations((current) => {
      const existingOpId = String(current[normalizedLineKey] || "");
      if (normalizedOperationId && existingOpId && existingOpId !== normalizedOperationId) {
        return current;
      }
      if (!existingOpId) {
        return current;
      }

      const next = { ...current };
      delete next[normalizedLineKey];
      return next;
    });
  }, []);

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
          const lineKey = item.lineKey || item.id;
          const operationId = createOperationId();

          if (marketplaceRealtimeFlags.optimisticCartEnabled) {
            dispatch(beginOptimisticOperation({ operationId }));
            dispatch(removeFromCart(lineKey));
          }

          setLinePending(lineKey, operationId);
          const sent = removeFromCartSocket(
            lineKey,
            item.productId,
            item.variantId || null,
            (response = {}) => {
              if (response?.accepted || response?.ok) {
                setTimeout(() => clearLinePending(lineKey, operationId), 600);
                return;
              }

              if (!response?.ok && marketplaceRealtimeFlags.optimisticCartEnabled) {
                dispatch(rollbackOptimisticOperation({ operationId }));
                clearLinePending(lineKey, operationId);
              }
            },
            { operationId }
          );

          if (!sent && marketplaceRealtimeFlags.optimisticCartEnabled) {
            dispatch(rollbackOptimisticOperation({ operationId }));
            clearLinePending(lineKey, operationId);
          }

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

      const lineKey = item.lineKey || item.id;
      const operationId = createOperationId();

      if (marketplaceRealtimeFlags.optimisticCartEnabled) {
        dispatch(beginOptimisticOperation({ operationId }));
        dispatch(updateQuantity({ id: lineKey, quantity: newQuantity }));
      }

      setLinePending(lineKey, operationId);
      const sent = updateQuantitySocket(
        lineKey,
        newQuantity,
        item.productId,
        item.variantId || null,
        (response = {}) => {
          if (response?.accepted || response?.ok) {
            setTimeout(() => clearLinePending(lineKey, operationId), 600);
            return;
          }

          if (!response?.ok && marketplaceRealtimeFlags.optimisticCartEnabled) {
            dispatch(rollbackOptimisticOperation({ operationId }));
          }

          if (!response?.ok) {
            clearLinePending(lineKey, operationId);
          }
        },
        { operationId }
      );

      if (!sent) {
        if (marketplaceRealtimeFlags.optimisticCartEnabled) {
          dispatch(rollbackOptimisticOperation({ operationId }));
        }
        clearLinePending(lineKey, operationId);
      }

      setTimeout(() => {
        clearLinePending(lineKey, operationId);
      }, 10000);
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

    setIsOpeningCheckout(true);
    navigate("/checkout");
  };

  const handleReAddAll = async () => {
    if (isReadding || items.length === 0) {
      return;
    }

    setIsReadding(true);

    const results = await Promise.all(
      items.map(
        (item) =>
          new Promise((resolve) => {
            let resolved = false;
            const timeout = setTimeout(() => {
              if (!resolved) {
                resolved = true;
                resolve({ ok: false, itemName: item.name, reason: "timeout" });
              }
            }, 8000);

            const sent = addToCartSocket(
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
              item.quantity,
              (response = {}) => {
                if (resolved) {
                  return;
                }

                clearTimeout(timeout);
                resolved = true;
                resolve({
                  ok: Boolean(response.ok),
                  itemName: item.name,
                  reason: response.message || null,
                });
              }
            );

            if (!sent && !resolved) {
              clearTimeout(timeout);
              resolved = true;
              resolve({
                ok: false,
                itemName: item.name,
                reason: "connection_unavailable",
              });
            }
          })
      )
    );

    const successCount = results.filter((result) => result.ok).length;
    const failedCount = results.length - successCount;

    if (failedCount === 0) {
      toast.success(`Re-added ${successCount} item${successCount === 1 ? "" : "s"} to cart.`);
    } else {
      toast.warning(
        `Re-add completed: ${successCount} succeeded, ${failedCount} failed. Please retry failed items.`
      );
    }

    setIsReadding(false);
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
                  disabled={isExpired || Boolean(pendingLineOperations[item.lineKey || item.id])}
                  onClick={() =>
                    handleQuantityChange(item, item.quantity - 1)
                  }
                >
                  -
                </button>
                <span>
                  {item.quantity}
                  {pendingLineOperations[item.lineKey || item.id] ? " ..." : ""}
                </span>
                <button
                  disabled={
                    isExpired
                    || resolveEffectiveAvailableForItem(item) < 1
                    || Boolean(pendingLineOperations[item.lineKey || item.id])
                  }
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
                disabled={isExpired || Boolean(pendingLineOperations[item.lineKey || item.id])}
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
            <button className="readd-btn" onClick={handleReAddAll} disabled={isReadding}>
              {isReadding ? "Re-adding..." : "Re-add Items"}
            </button>
          )}

          <button
            className="checkout-btn"
            onClick={handleCheckout}
            disabled={isExpired || isOpeningCheckout}
          >
            {isOpeningCheckout ? "Opening checkout..." : "Proceed to Checkout"}
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
