# Complete Integration Guide: Real-Time Cart & PayStack Checkout

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         React Frontend                       │
│  (Redux Store → Components → Hooks → WebSocket Emitters)   │
└────────────────────────┬────────────────────────────────────┘
                         │ Socket.io Events
                         │ ↕ REST API
┌────────────────────────┴────────────────────────────────────┐
│                    Express Backend                           │
│  (Server.js → Socket Handlers → Controllers → MongoDB)      │
└─────────────────────────────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────────┐
│                      MongoDB Atlas                           │
│  (Cart Collection, Order Collection, User Collection)       │
└─────────────────────────────────────────────────────────────┘
```

## Real-Time Cart Flow - Step by Step

### User Adds Product to Cart

```javascript
// 1. USER ACTION (ProductCard.js)
const handleAddToCart = (e) => {
  e.stopPropagation();
  
  // 2. LOCAL STATE UPDATE (Optimistic Update)
  dispatch(addToCart({ ...product, quantity: 1 }));
  
  // 3. WEBSOCKET EVENT (Real-time to backend)
  addToCartSocket(product, 1);
  
  toast.success("Product added to cart!");
};
```

**What happens on backend:**

```javascript
// 4. SOCKET LISTENER (server.js)
socket.on("cart:add", async (data) => {
  // 5. GET OR CREATE CART
  const query = socket.userId 
    ? { userId: socket.userId } 
    : { sessionId: socket.sessionId };
  
  let cart = await Cart.findOne(query);
  if (!cart) {
    cart = await Cart.create(cartData);
  }
  
  // 6. ADD ITEM TO CART
  const existingItem = cart.items.find(...);
  if (existingItem) {
    existingItem.quantity += data.quantity;
  } else {
    cart.items.push({
      productId: data.product.id,
      productName: data.product.name,
      price: data.product.price,
      quantity: data.quantity,
      image: data.product.image,
    });
  }
  
  // 7. RECALCULATE TOTALS
  cart.totalItems = cart.items.reduce((sum, item) => 
    sum + item.quantity, 0);
  cart.totalPrice = cart.items.reduce((sum, item) => 
    sum + (item.price * item.quantity), 0);
  
  // 8. SAVE TO DATABASE
  await cart.save();
  
  // 9. BROADCAST TO ALL CLIENTS
  socket.emit("cart:updated", cart);
  socket.broadcast.emit("cart:updated", cart);
});
```

**What happens on frontend:**

```javascript
// 10. LISTEN FOR UPDATES (App.js useEffect)
socket.on("cart:updated", (cart) => {
  // 11. UPDATE REDUX STATE FROM BACKEND
  dispatch(updateCartFromSocket(cart));
});

// cartSlice.js
updateCartFromSocket: (state, action) => {
  const backendCart = action.payload;
  state.items = backendCart.items;
  state.customizations = backendCart.customizations;
  state.totalQuantity = backendCart.totalItems;
  state.totalPrice = backendCart.totalPrice;
  // 12. UI AUTOMATICALLY RE-RENDERS ✨
}
```

**Result**: Cart updated everywhere in real-time ✅

---

## PayStack Payment Complete Flow

### Phase 1: Initiate Payment

```javascript
// User clicks "Pay with PayStack" in Checkout.js
const handlePayStackPayment = async () => {
  try {
    // 1. INITIALIZE PAYSTACK TRANSACTION
    const { authorizationUrl, reference } = 
      await initializePayment(totalAmount, userEmail);
    
    // 2. REDIRECT TO PAYSTACK CHECKOUT
    window.location.href = authorizationUrl;
    
  } catch (error) {
    toast.error("Payment initialization failed");
  }
};
```

**Backend handling:**

```javascript
// orderController.js - initializePayment
app.post("/api/orders/initialize-payment", protect, async (req, res) => {
  const { amount, email, sessionId } = req.body;
  
  // Make request to PayStack API
  const response = await axios.post(
    "https://api.paystack.co/transaction/initialize",
    {
      amount: Math.round(amount * 100), // Convert to kobo
      email,
      metadata: {
        userId: req.user?.id || null,
        sessionId,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      },
    }
  );
  
  // Return authorization URL
  res.json({
    authorizationUrl: response.data.data.authorization_url,
    accessCode: response.data.data.access_code,
    reference: response.data.data.reference,
  });
});
```

### Phase 2: User Completes Payment

```
User fills PayStack form:
- Card: 4111 1111 1111 1111
- Expiry: 12/25
- CVV: 123
- OTP: 123456
  ↓
PayStack Approves Payment ✅
  ↓
Redirects back to app with reference URL parameter
```

### Phase 3: Verify Payment & Create Order

```javascript
// User returns from PayStack payment
// 1. EXTRACT REFERENCE FROM URL
const [searchParams] = useSearchParams();
const reference = searchParams.get("reference");

// 2. VERIFY PAYMENT & CREATE ORDER
const { order } = await verifyPaymentAndCreateOrder(
  reference,
  shippingAddress
);
```

**Backend verification:**

```javascript
// orderController.js - verifyPaymentAndCreateOrder
app.post("/api/orders/verify-payment", protect, async (req, res) => {
  const { reference, shippingAddress } = req.body;
  
  // 1. VERIFY WITH PAYSTACK
  const verifyResponse = await axios.get(
    `https://api.paystack.co/transaction/verify/${reference}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      },
    }
  );
  
  const paymentData = verifyResponse.data.data;
  
  // 2. CHECK IF PAYMENT SUCCESSFUL
  if (paymentData.status !== "success") {
    return res.status(400).json({ 
      message: "Payment verification failed" 
    });
  }
  
  // 3. GET USER'S CART
  const cart = await Cart.findOne({ 
    userId: req.user?.id || sessionId 
  });
  
  // 4. CREATE ORDER
  const order = await Order.create({
    userId: req.user?.id || null,
    sessionId: sessionId || null,
    orderNumber: generateOrderNumber(), // ORD{timestamp}{random}
    items: cart.items,
    customizations: cart.customizations,
    totalAmount: paymentData.amount / 100, // Convert back from kobo
    status: "paid",
    paymentMethod: "paystack",
    paymentReference: reference,
    paystackReference: paymentData.reference,
    shippingAddress,
  });
  
  // 5. CLEAR CART
  cart.items = [];
  cart.customizations = [];
  cart.totalItems = 0;
  cart.totalPrice = 0;
  await cart.save();
  
  // 6. BROADCAST ORDER CREATED EVENT
  io.emit("order:created", {
    orderId: order._id,
    orderNumber: order.orderNumber,
    status: "paid",
  });
  
  // 7. RETURN RESULT
  res.status(201).json({
    message: "Order created successfully",
    order,
    cart,
  });
});
```

---

## Guest vs Registered User Flows

### Guest User Flow

```
1. Visit app (no login)
  ↓
2. Session ID generated: localStorage.setItem("sessionId")
  ↓
3. Add product to cart
  ↓
4. Backend finds cart by sessionId
  ↓
5. Cart saved with sessionId: db.carts.find({ sessionId: "..." })
  ↓
6. Close browser and reopen (same browser)
  ↓
7. SessionId retrieved from localStorage
  ↓
8. Cart re-loaded from same sessionId ✅
  ↓
9. Checkout with email
  ↓
10. Order created with sessionId (not userId)
```

### Registered User Flow

```
1. User logs in
  ↓
2. JWT token stored in cookie
  ↓
3. Add product to cart
  ↓
4. Backend finds/creates cart by userId
  ↓
5. Cart saved: db.carts.find({ userId: ObjectId })
  ↓
6. User logs out and logs back in (any browser)
  ↓
7. JWT validated from cookie
  ↓
8. Cart re-loaded by userId ✅
  ↓
9. Users carts sync across ALL devices
```

---

## Code Examples for Integration

### Example 1: Add Product with WebSocket

```javascript
// In any component where you want to add to cart
import useCartSocket from "../hooks/useCartSocket";

function ProductDetail() {
  const { addToCartSocket } = useCartSocket();
  const [quantity, setQuantity] = useState(1);
  const product = useSelector(state => 
    state.products.items.find(p => p.id === productId)
  );
  
  const handleAdd = () => {
    // Sends real-time update to backend
    addToCartSocket(product, quantity);
  };
  
  return (
    <button onClick={handleAdd}>
      Add {quantity} to Cart
    </button>
  );
}
```

### Example 2: Display Real-Time Cart

```javascript
// Cart.js automatically syncs from WebSocket
import { useSelector } from "react-redux";

function CartPage() {
  // This state updates automatically when backend sends
  // "cart:updated" events via WebSocket
  const { items, totalPrice } = useSelector(state => state.cart);
  
  return (
    <div>
      <h2>Your Cart ({items.length} items)</h2>
      {items.map(item => (
        <div key={item.productId}>
          <h3>{item.productName}</h3>
          <p>Qty: {item.quantity}</p>
          <p>Price: ₦{item.price * item.quantity}</p>
        </div>
      ))}
      <h3>Total: ₦{totalPrice}</h3>
    </div>
  );
}
```

### Example 3: Complete Checkout Flow

```javascript
import usePayStack from "../hooks/usePayStack";

function CheckoutPage() {
  const [loading, setLoading] = useState(false);
  const [shippingInfo, setShippingInfo] = useState({
    fullName: "",
    email: "",
    phone: "",
    street: "",
    city: "",
    state: "",
    zipCode: "",
    country: "Nigeria",
  });
  
  const { totalPrice } = useSelector(state => state.cart);
  const { user } = useSelector(state => state.user);
  const { 
    initializePayment, 
    verifyPaymentAndCreateOrder,
    loading: paymentLoading,
    error
  } = usePayStack();
  
  const handleCheckout = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // Step 1: Initialize payment
      const { authorizationUrl } = await initializePayment(
        totalPrice,
        shippingInfo.email
      );
      
      // Step 2: Redirect to PayStack
      window.location.href = authorizationUrl;
      
    } catch (err) {
      toast.error("Payment failed: " + error);
      setLoading(false);
    }
  };
  
  return (
    <form onSubmit={handleCheckout}>
      <h2>Shipping Information</h2>
      {/* Form inputs for shipping info */}
      
      <button disabled={loading || paymentLoading} type="submit">
        {paymentLoading ? "Processing..." : "Pay ₦" + totalPrice}
      </button>
    </form>
  );
}
```

### Example 4: Handle Payment Callback

```javascript
import { useSearchParams } from "react-router-dom";

function CheckoutCallback() {
  const [searchParams] = useSearchParams();
  const reference = searchParams.get("reference");
  const [order, setOrder] = useState(null);
  
  const { verifyPaymentAndCreateOrder } = usePayStack();
  const dispatch = useDispatch();
  
  useEffect(() => {
    if (!reference) return;
    
    const verifyPayment = async () => {
      try {
        // Verify payment and create order
        const result = await verifyPaymentAndCreateOrder(
          reference,
          {
            fullName: "John Doe",
            email: "john@example.com",
            phone: "+234123456789",
            street: "123 Main St",
            city: "Lagos",
            state: "Lagos",
            zipCode: "100001",
            country: "Nigeria",
          }
        );
        
        setOrder(result.order);
        
        // Clear cart from Redux
        dispatch(clearCart());
        
        toast.success("Order created successfully!");
        
      } catch (err) {
        toast.error("Payment verification failed");
      }
    };
    
    verifyPayment();
  }, [reference]);
  
  if (!order) return <div>Loading...</div>;
  
  return (
    <div>
      <h2>Order Confirmed!</h2>
      <p>Order Number: {order.orderNumber}</p>
      <p>Amount: ₦{order.totalAmount}</p>
    </div>
  );
}
```

---

## Performance Optimization Tips

### 1. Batch Multiple Cart Operations

```javascript
// INEFFICIENT: Multiple WebSocket events
addToCartSocket(product1, 1);
addToCartSocket(product2, 1);
addToCartSocket(product3, 1);

// EFFICIENT: Emit once with array
socket.emit("cart:addMultiple", [
  { product: product1, quantity: 1 },
  { product: product2, quantity: 1 },
  { product: product3, quantity: 1 },
]);
```

### 2. Debounce Quantity Changes

```javascript
import { debounce } from "lodash";

const debouncedUpdate = debounce((productId, quantity) => {
  updateQuantitySocket(productId, quantity);
}, 500); // Wait 500ms after user stops typing

const handleQuantityChange = (productId, newQuantity) => {
  debouncedUpdate(productId, newQuantity);
};
```

### 3. Cache Cart Locally

```javascript
// Redux automatically caches cart state
// Only syncs when:
// 1. Page loads (cart:sync event)
// 2. Another tab updates it (cart:updated event)
// 3. Backend broadcasts changes
```

---

## Error Handling

### Backend Error Handling

```javascript
socket.on("cart:add", async (data) => {
  try {
    // Process cart
    const cart = await Cart.findOne(...);
    // ... operations
    socket.emit("cart:updated", cart);
  } catch (error) {
    console.error("cart:add error:", error);
    // Send error back to client
    socket.emit("cart:error", { 
      message: "Failed to add item to cart"
    });
  }
});
```

### Frontend Error Handling

```javascript
// App.js
socket.on("cart:error", (error) => {
  toast.error("Cart error: " + error.message);
  // Attempt to re-sync
  socket.emit("cart:sync", { sessionId });
});
```

---

## Deployment Checklist

- [ ] Environment variables configured (.env file)
- [ ] MongoDB Atlas connection string valid
- [ ] PayStack secret key correct (production key)
- [ ] REACT_APP_SERVER_URL points to production backend
- [ ] Socket.io transports configured (websocket + polling)
- [ ] CORS origins updated for production domain
- [ ] Database indexes created for user queries
- [ ] Error logging configured
- [ ] SSL/TLS certificates installed
- [ ] Rate limiting implemented for API endpoints
- [ ] Database backups scheduled
- [ ] Monitoring/alerts set up

---

## Support & Debugging

### Check Socket Connection

```javascript
// Browser console
const socket = require("./services/socket").getSocket();
console.log("Connected:", socket?.connected);
console.log("Socket ID:", socket?.id);
```

### Monitor Event Traffic

```javascript
// Add logging in server.js
socket.on("*", (event, data) => {
  console.log(`[EVENT] ${event}:`, data);
});
```

### Backend Logs

```bash
# Watch for errors
npm run dev 2>&1 | grep -i "error\|socket"
```

### Database Verification

```javascript
// MongoDB query to check carts
db.carts.find().pretty()

// Check orders
db.orders.find({ status: "paid" }).pretty()
```

---

This implementation provides a **production-ready, scalable, real-time e-commerce backend** for your NINO jewelry store! 🎉
