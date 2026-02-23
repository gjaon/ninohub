import React, { useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import useCartSocket from "../hooks/useCartSocket";
import { getDiscountInfo } from "../utils/pricing";
import { getProductImageUrl } from "../utils/image";
import "./Cart.css";

const Cart = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { items, totalQuantity, totalAmount } = useSelector(
    (state) => state.cart
  );
  const { removeFromCartSocket, updateQuantitySocket } = useCartSocket();

  const handleRemove = (id) => {
    toast.warning("Remove this item from cart?", {
      action: {
        label: "Remove",
        onClick: () => {
          // Only emit WebSocket event - let socket response update Redux
          removeFromCartSocket(id);
          toast.success("Item removed from cart!");
        },
      },
      cancel: {
        label: "Cancel",
        onClick: () => {},
      },
    });
  };

  const handleQuantityChange = (id, newQuantity) => {
    if (newQuantity > 0) {
      // Only emit WebSocket event - let socket response update Redux
      updateQuantitySocket(id, newQuantity);
    }
  };

  const handleCheckout = () => {
    navigate("/checkout");
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

      <div className="cart-content">
        <div className="cart-items">
          {items.map((item) => (
            <div key={item.id} className="cart-item">
              <div className="item-image">
                {item.image ? (
                  <img
                    src={getProductImageUrl(item.image)}
                    alt={item.name}
                  />
                ) : (
                  <span>{item.category}</span>
                )}
              </div>

              <div className="item-details">
                <h3>{item.name}</h3>
                <p className="item-category">{item.category}</p>
                {item.isCustom && (
                  <span className="custom-badge">Customized</span>
                )}
              </div>

              <div className="item-quantity">
                <button
                  onClick={() =>
                    handleQuantityChange(item.id, item.quantity - 1)
                  }
                >
                  -
                </button>
                <span>{item.quantity}</span>
                <button
                  onClick={() =>
                    handleQuantityChange(item.id, item.quantity + 1)
                  }
                >
                  +
                </button>
              </div>

              <div className="item-price">
                {item.discountPercent > 0 ? (
                  <>
                    <p className="base-price">
                      <span className="strikethrough">
                        ₦{Math.round(item.basePrice).toLocaleString()}
                      </span>
                      <span className="discount-badge-small">
                        {item.discountPercent}% off
                      </span>
                    </p>
                    <p className="unit-price">
                      ₦{Math.round(item.unitPrice).toLocaleString()} each
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
                onClick={() => handleRemove(item.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="cart-summary">
          <h2>Order Summary</h2>

          <div className="summary-row">
            <span>Items ({totalQuantity})</span>
            <span>₦{Math.round(totalAmount).toLocaleString()}</span>
          </div>

          <div className="summary-row">
            <span>Shipping</span>
            <span>Calculated at checkout</span>
          </div>

          <div className="summary-row">
            <span>Tax</span>
            <span>Calculated at checkout</span>
          </div>

          <div className="summary-divider"></div>

          <div className="summary-row total">
            <span>Total</span>
            <span>₦{Math.round(totalAmount).toLocaleString()}</span>
          </div>

          <button className="checkout-btn" onClick={handleCheckout}>
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
