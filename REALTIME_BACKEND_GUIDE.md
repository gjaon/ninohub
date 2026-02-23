# Event-Driven Real-Time Backend Implementation

## Overview
Your NINO application now has a complete event-driven backend using **Socket.io WebSockets** for real-time cart synchronization and **PayStack integration** for payment processing.

## Architecture

### Backend (Node.js/Express)
- **Server Framework**: Express 5 + Socket.io
- **Database**: MongoDB with Mongoose
- **Real-time Events**: Socket.io with automatic fallback to polling
- **Payment**: PayStack API integration
- **Authentication**: JWT + Cookie-based auth

### Frontend (React)
- **Socket.io Client**: Real-time connection to backend
- **Redux State Management**: Cart, products, user, customizations
- **Hooks**: Custom hooks for cart and payment operations
- **Session Management**: UUID-based session IDs for guests

## Key Features

### 1. Real-Time Cart Synchronization
- **Persistent Storage**: MongoDB Cart model for authenticated users
- **Guest Support**: In-memory with session IDs
- **Auto-sync**: Cart updates broadcast to all connected clients
- **No Page Reload**: Data syncs without navigation

### 2. WebSocket Events
```javascript
// Cart Events
socket.emit("cart:add", { product, quantity })
socket.emit("cart:remove", { productId })
socket.emit("cart:updateQuantity", { productId, quantity })
socket.emit("cart:sync", { sessionId })
socket.emit("cart:addCustomization", { customization })

// Listen for updates
socket.on("cart:updated", (cart) => { /* handle */ })
socket.on("cart:synced", (cart) => { /* handle */ })
socket.on("cart:error", (error) => { /* handle */ })
```

### 3. PayStack Payment Integration
- **Initialize Payment**: Create PayStack transaction
- **Verification**: Verify payment reference and create order
- **Order Tracking**: Real-time order status updates
- **Payment Reference**: Stored in MongoDB Order model

### 4. Order Management
- **Order Creation**: After payment verification
- **Status Tracking**: pending → paid → processing → shipped → delivered/cancelled
- **Guest Orders**: Tracked by sessionId
- **Customizations**: Saved with orders

## Environment Variables Required

Add these to your `.env` file:

```env
# Backend
MONGO_URI=mongodb://...
JWT_SECRET=your_jwt_secret_key
PAYSTACK_SECRET_KEY=pk_live_or_pk_test_from_paystack
NODE_ENV=development

# Frontend (.env in /client folder)
REACT_APP_SERVER_URL=http://localhost:5000
```

## Database Models

### Cart Model
```javascript
{
  userId: ObjectId (optional),
  sessionId: String (for guests),
  items: [
    { productId, productName, price, quantity, image }
  ],
  customizations: [
    { customizationId, productId, name, details, price, quantity }
  ],
  totalItems: Number,
  totalPrice: Number,
  createdAt, updatedAt
}
```

### Order Model
```javascript
{
  userId: ObjectId (optional),
  sessionId: String,
  orderNumber: String (unique),
  items: Array,
  customizations: Array,
  totalAmount: Number,
  status: String ('pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'),
  paymentMethod: 'paystack',
  paymentReference: String,
  paystackReference: String,
  shippingAddress: {
    fullName, email, phone, street, city, state, zipCode, country
  },
  trackingNumber: String,
  createdAt, updatedAt
}
```

## Frontend Hooks

### useCartSocket Hook
```javascript
import useCartSocket from "./hooks/useCartSocket";

const { 
  addToCartSocket,
  removeFromCartSocket,
  updateQuantitySocket,
  addCustomizationSocket,
  syncCartSocket
} = useCartSocket();

// Usage
addToCartSocket({ id: 1, name: "Ring", price: 2999 }, 1);
removeFromCartSocket(1);
updateQuantitySocket(1, 5);
```

### usePayStack Hook
```javascript
import usePayStack from "./hooks/usePayStack";

const { 
  initializePayment,
  verifyPaymentAndCreateOrder,
  getOrder,
  getUserOrders,
  loading,
  error
} = usePayStack();

// Initialize payment
const { authorizationUrl, accessCode, reference } = 
  await initializePayment(10000, "user@example.com");

// Verify and create order
const { order } = await verifyPaymentAndCreateOrder(reference, shippingAddress);
```

## API Routes

### Cart Routes
- `POST /api/cart/init` - Initialize/get cart
- `POST /api/cart/get` - Get cart
- `POST /api/cart/add` - Add item to cart (WebSocket preferred)
- `POST /api/cart/remove` - Remove item from cart (WebSocket preferred)
- `POST /api/cart/update-quantity` - Update quantity (WebSocket preferred)
- `POST /api/cart/clear` - Clear cart (WebSocket preferred)
- `POST /api/cart/add-customization` - Add customization

### Order Routes
- `POST /api/orders/initialize-payment` - Initialize PayStack transaction
- `POST /api/orders/verify-payment` - Verify payment & create order
- `POST /api/orders/get/:orderId` - Get order details
- `POST /api/orders/user-orders` - Get user's orders
- `PUT /api/orders/update-status/:orderId` - Update order status (admin)
- `POST /api/orders/cancel/:orderId` - Cancel order

## Testing the Implementation

### 1. Start Backend
```bash
npm run dev
# Server should be running on http://localhost:5000
# Socket.io will be available at http://localhost:5000/socket.io
```

### 2. Start Frontend
```bash
cd client
npm start
# React app on http://localhost:3000
```

### 3. Test Cart Synchronization
1. Open the app in your browser
2. Add a product to cart (should see WebSocket event in console)
3. Check Network tab → WS to see WebSocket connection
4. Open another tab and add a different product
5. Cart should sync across tabs automatically

### 4. Test Guest Cart
1. Don't log in, add items to cart
2. Check localStorage for `sessionId` value
3. Cart persists based on sessionId
4. Close and reopen browser - items should still be there (via sessionId)

### 5. Test Payment Flow
1. Go to checkout with items in cart
2. Enter email: test@example.com
3. Click "Pay with PayStack"
4. Use PayStack test credentials:
   - Card: 4111 1111 1111 1111
   - Expiry: 12/25
   - CVV: 123
5. After payment, order should be created

## Understanding the Flow

### Adding to Cart
```
User clicks "Add to Cart"
↓
ProductCard component dispatches local Redux action
↓
WebSocket emits "cart:add" event to backend
↓
Backend Socket handler processes event
↓
Cart saved to MongoDB
↓
Backend broadcasts "cart:updated" to all clients
↓
All connected clients receive update
↓
Redux dispatch updateCartFromSocket
↓
Local state syncs with backend
```

### Checkout Process
```
User clicks "Checkout"
↓
Initiates PayStack transaction via /api/orders/initialize-payment
↓
Gets authorization URL and reference
↓
User completes payment on PayStack
↓
Verifies payment with /api/orders/verify-payment
↓
Order created in MongoDB
↓
Payment broadcast via WebSocket
↓
Cart cleared
↓
Redirect to order confirmation
```

## Session Management

### Session ID Generation
- **Guests**: UUID generated on first visit, stored in localStorage
- **Authenticated Users**: Uses JWT token from cookies
- **Persistence**: sessionId maintained across page navigations and browser sessions

### Cart Association
```javascript
// For logged-in users
cart = await Cart.findOne({ userId: req.user.id })

// For guests
cart = await Cart.findOne({ sessionId: guestSessionId })
```

## Real-Time Features Active

- ✅ Cart item additions/removals
- ✅ Quantity updates
- ✅ Customization additions
- ✅ Order status updates (admin → clients)
- ✅ Cross-tab synchronization
- ✅ Cross-device synchronization (same user)

## Performance Optimizations

1. **Indexed Queries**: MongoDB indexes on userId, sessionId, and orderNumber
2. **EventListener Cleanup**: Proper cleanup in useEffect to prevent memory leaks
3. **Optimistic Updates**: Local Redux updates before server confirmation
4. **Reconnection Handling**: Automatic reconnection with exponential backoff
5. **Namespace Isolation**: Cart events isolated from other namespaces

## Security Features

1. **Authentication Middleware**: JWT verification on all cart operations
2. **Session Isolation**: Users can only access their own carts/orders
3. **CORS Protection**: Socket.io CORS settings match Express CORS
4. **XSS Prevention**: No inline scripts, all user data sanitized
5. **Payment Verification**: Server-side verification of PayStack transactions

## Next Steps

1. **Configure PayStack**: Add your actual PayStack secret key to .env
2. **Test Payment**: Use PayStack test keys first
3. **Deploy**: Update REACT_APP_SERVER_URL for production
4. **Customize**: Add email notifications on order creation
5. **Admin Dashboard**: Create admin panel for order tracking

## Troubleshooting

### Cart Not Syncing
- Check WebSocket connection in DevTools Network tab
- Ensure sessionId is stored in localStorage
- Check browser console for socket errors

### PayStack Payment Failing
- Verify PAYSTACK_SECRET_KEY in .env
- Check PayStack test credentials
- Ensure shippingAddress is provided

### Orders Not Created
- Verify MongoDB connection
- Check /api/orders/initialize-payment response
- Ensure payment reference is being passed correctly

## Architecture Diagram

```
Frontend (React + Redux)
    ↓ (REST API)
├── ProductCard → /api/cart/add (WebSocket preferred)
├── Cart.js → /api/cart/remove, /update-quantity
└── Checkout.js → /api/orders/initialize-payment → /verify-payment
    
Backend (Express + Socket.io)
    ↓ (WebSocket)
├── cart:add → cartController → Cart Model → broadcast cart:updated
├── cart:remove → cartController → Cart Model → broadcast cart:updated
├── cart:updateQuantity → cartController → Cart Model → broadcast cart:updated
└── Order Events → orderController → Order Model → broadcast order:created

Database (MongoDB)
├── Cart Collection (userId + sessionId indexed)
├── Order Collection (userId + sessionId indexed)
├── User Collection (existing)
└── Product Collection (frontend only)
```

## Support

For issues or questions, check:
1. Browser console for errors
2. Server logs (terminal running `npm run dev`)
3. MongoDB connection string in .env
4. Socket.io connection in DevTools Network tab → WS filter
