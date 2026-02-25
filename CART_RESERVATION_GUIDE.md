# Cart Reservation & Countdown System

## Overview
This system implements a cart reservation feature with countdown timers to ensure fair inventory allocation and create urgency for checkout completion.

## Features

### 1. **Cart Reservation (5 minutes)**
- When users add items to cart, those quantities are reserved for them
- Timer restarts every time they add or modify cart items
- Reserved items are not available to other users during the reservation period
- If timer expires, items are automatically released and available to others

### 2. **Checkout Timer (3 minutes)**
- When users proceed to checkout, the timer switches to 3 minutes
- This ensures users complete payment promptly
- If they leave checkout page, the timer continues
- If expired, items are released and cart is cleared

### 3. **Visual Countdown Display**
- Displays remaining time in MM:SS format
- Color-coded warnings:
  - **Normal**: Purple gradient (more than 2 minutes)
  - **Warning**: Pink gradient (last 2 minutes)
  - **Critical**: Red gradient with pulsing animation (last minute)
- Different variants for cart page and checkout page

## Backend Implementation

### Models

#### 1. **Product Model** (`models/productModel.js`)
Tracks inventory and reservations:
```javascript
{
  productId: String,
  totalStock: Number,
  availableStock: Number,
  reservedStock: Number,
  reservations: [{
    cartId: ObjectId,
    userId: ObjectId,
    sessionId: String,
    quantity: Number,
    expiresAt: Date,
    status: 'active' | 'checkout' | 'expired' | 'completed'
  }]
}
```

**Methods**:
- `reserveQuantity()` - Reserve items for a cart
- `releaseReservation()` - Release reserved items
- `updateReservationStatus()` - Update reservation status
- `cleanupExpiredReservations()` - Clean up expired reservations (static)

#### 2. **Cart Model** (`models/cartModel.js`)
Updated with reservation fields:
```javascript
{
  // ... existing cart fields
  reservationExpiry: Date,
  reservationStatus: 'active' | 'expired' | 'checkout' | 'completed',
  checkoutStartedAt: Date
}
```

### Utilities

#### Cart Reservation Service (`utils/cartReservation.js`)
Core business logic for managing reservations:

**Constants**:
- `CART_EXPIRY_MINUTES = 5` - Cart reservation duration
- `CHECKOUT_EXPIRY_MINUTES = 3` - Checkout duration

**Functions**:
- `reserveCartItems(cart)` - Reserve all items in cart with 5-min timer
- `releaseCartReservations(cartId)` - Release all reservations for a cart
- `startCheckout(cartId)` - Switch to 3-minute checkout timer
- `completeCart(cartId)` - Mark cart as completed, deduct from stock
- `getRemainingTime(cart)` - Get remaining seconds
- `cleanupExpiredReservations(io)` - Clean up expired carts globally
- `getAvailableStock(productId)` - Get available quantity

### Socket Events

#### Server Events (server.js)

**Emitted by Client**:
- `cart:add` - Add item to cart (starts/restarts timer)
- `cart:remove` - Remove item from cart
- `cart:updateQuantity` - Update item quantity
- `cart:sync` - Sync cart data
- `cart:getRemainingTime` - Get current remaining time
- `cart:startCheckout` - Start checkout timer (3 min)
- `cart:cancelCheckout` - Cancel checkout, return to cart timer (5 min)

**Emitted by Server**:
- `cart:updated` - Cart updated with reservation data
- `cart:synced` - Cart synced with reservation data
- `cart:remainingTime` - Remaining time response
- `cart:checkoutStarted` - Checkout timer started
- `cart:checkoutCancelled` - Checkout cancelled, back to cart
- `cart:reservation:expired` - Reservation expired
- `inventory:updated` - Inventory changed (notify other users)
- `cart:error` - Error occurred

**Cleanup Interval**:
```javascript
setInterval(async () => {
  await cleanupExpiredReservations(io);
}, 30000); // Every 30 seconds
```

### Order Completion

Updated `orderController.js`:
- `createOrder()` - Calls `completeCart()` to finalize reservation
- `verifyPaymentAndCreateOrder()` - Calls `completeCart()` after payment

## Frontend Implementation

### Redux State (`redux/slices/cartSlice.js`)

Added fields:
```javascript
{
  items: [],
  customizations: [],
  totalQuantity: 0,
  totalAmount: 0,
  totalPrice: 0,
  reservationExpiry: Date,
  reservationStatus: 'active' | 'expired' | 'checkout' | 'completed',
  remainingTime: Number // seconds
}
```

### Components

#### CartCountdown Component (`components/CartCountdown.js`)

**Props**:
- `expiryTime` - Expiry timestamp from backend
- `status` - Reservation status
- `onExpired` - Callback when timer reaches 0
- `variant` - 'cart' or 'checkout' (different messaging)

**Features**:
- Real-time countdown display
- Auto-updates every second
- Color-coded warning levels
- Pulsing animation for critical state
- Mobile responsive

**Styling** (`components/CartCountdown.css`):
- Gradient backgrounds based on warning level
- Smooth animations and transitions
- Fully responsive design

### Pages

#### Cart Page (`pages/Cart.js`)

**Updates**:
- Imports `CartCountdown` component
- Displays countdown timer at top of cart
- Listens for `cart:reservation:expired` socket event
- Clears cart and shows toast on expiration

**Socket Integration**:
```javascript
useEffect(() => {
  socket.on("cart:reservation:expired", handleExpired);
  return () => socket.off("cart:reservation:expired");
}, []);
```

#### Checkout Page (`pages/Checkout.js`)

**Updates**:
- Displays countdown timer at top of checkout
- Emits `cart:startCheckout` on mount
- Emits `cart:cancelCheckout` on unmount (if not completed)
- Listens for `cart:reservation:expired` event
- Redirects to cart if timer expires

**Socket Integration**:
```javascript
useEffect(() => {
  socket.emit("cart:startCheckout");
  
  socket.on("cart:checkoutStarted", handleCheckoutStarted);
  socket.on("cart:reservation:expired", handleExpired);
  
  return () => {
    if (reservationStatus === "checkout") {
      socket.emit("cart:cancelCheckout");
    }
    socket.off("cart:checkoutStarted");
    socket.off("cart:reservation:expired");
  };
}, []);
```

## User Flow

### Adding to Cart
1. User adds product to cart
2. Backend reserves quantity with 5-minute expiry
3. Frontend displays countdown timer
4. Timer restarts if user adds/modifies cart

### Cart Expiration
1. Timer reaches 0:00
2. Backend releases reservations (cleanup interval)
3. Backend emits `cart:reservation:expired`
4. Frontend clears cart, shows notification
5. Items available to other users

### Proceeding to Checkout
1. User clicks "Proceed to Checkout"
2. Frontend emits `cart:startCheckout`
3. Backend updates reservations to 3-minute timer
4. Frontend displays checkout countdown

### Leaving Checkout
1. User navigates away from checkout
2. Frontend emits `cart:cancelCheckout` (on unmount)
3. Backend resets to 5-minute timer
4. User can return to cart

### Completing Order
1. User completes payment
2. Backend calls `completeCart()`
3. Reservations marked as completed
4. Stock deducted from inventory
5. Cart cleared

## Error Handling

### Out of Stock
- If reserved quantity exceeds available stock
- Backend throws error: "Only X items available"
- Frontend shows error toast
- Item not added to cart

### Expired During Checkout
- Timer expires while filling checkout form
- Backend releases reservations
- Frontend emits `cart:reservation:expired`
- User redirected to cart with notification

### Network Issues
- Socket disconnection handled gracefully
- Cart state persisted in Redux
- Reconnection syncs cart state

## Inventory Management

### Stock Tracking
- `totalStock` - Total inventory
- `reservedStock` - Currently reserved
- `availableStock` - Available for reservation (totalStock - reservedStock)

### Reservation Lifecycle
```
active → checkout → completed (stock deducted)
                 ↓
              expired (stock released)
```

### Concurrent Users
- Each user's reservation tracked separately
- Real-time inventory updates via socket.io
- Other users see reduced availability immediately

## Testing Scenarios

### Test Case 1: Basic Reservation
1. Add item to cart → Timer starts at 5:00
2. Wait → Timer counts down
3. Add another item → Timer resets to 5:00

### Test Case 2: Checkout Flow
1. Add items to cart
2. Click checkout → Timer switches to 3:00
3. Complete order → Cart cleared, stock deducted

### Test Case 3: Expiration
1. Add items to cart
2. Wait 5+ minutes without activity
3. Backend releases items
4. Frontend shows expiration message

### Test Case 4: Abandonment
1. Add items to cart
2. Proceed to checkout
3. Leave page → 3-minute timer continues
4. Don't return → Items released after 3 minutes

### Test Case 5: Multiple Users
1. User A adds last 3 items
2. User B tries to add same items → Error (out of stock)
3. User A's timer expires
4. User B can now add items

## Configuration

### Timers
Edit `utils/cartReservation.js`:
```javascript
const CART_EXPIRY_MINUTES = 5;      // Cart timer
const CHECKOUT_EXPIRY_MINUTES = 3;  // Checkout timer
```

### Cleanup Interval
Edit `server.js`:
```javascript
setInterval(async () => {
  await cleanupExpiredReservations(io);
}, 30000); // Adjust interval (ms)
```

### Default Stock
Edit `utils/cartReservation.js` and `models/productModel.js`:
```javascript
totalStock: 100, // Default inventory per product
```

## Performance Considerations

### Database Queries
- Indexed queries on `productId`, `userId`, `sessionId`
- Cleanup runs every 30 seconds (adjustable)
- Bulk updates for expired reservations

### Socket Events
- Events emitted only to affected users
- `inventory:updated` broadcast to all users
- Minimal payload size

### Frontend Updates
- Local countdown timer (reduces server calls)
- Socket events for state sync only
- Efficient Redux state updates

## Future Enhancements

### Possible Additions
1. **Email Notifications** - Alert users before expiration
2. **Push Notifications** - Browser notifications for countdown
3. **Extended Timer** - Allow users to request more time
4. **Analytics** - Track cart abandonment rates
5. **Dynamic Timers** - Adjust based on product demand
6. **SMS Alerts** - Text message warnings
7. **Grace Period** - Brief extension after expiration

## Troubleshooting

### Timer Not Showing
- Check `reservationExpiry` in cart state
- Verify socket connection
- Check browser console for errors

### Items Not Reserved
- Check Product model creation
- Verify socket events emitting
- Check server logs for errors

### Premature Expiration
- Verify server time synchronization
- Check cleanup interval timing
- Review timer duration constants

## File Changes Summary

### New Files
- `models/productModel.js` - Product inventory model
- `utils/cartReservation.js` - Reservation business logic
- `client/src/components/CartCountdown.js` - Timer component
- `client/src/components/CartCountdown.css` - Timer styles

### Modified Files
- `models/cartModel.js` - Added reservation fields
- `server.js` - Updated socket events, added cleanup
- `controllers/orderController.js` - Added completeCart calls
- `client/src/redux/slices/cartSlice.js` - Added reservation state
- `client/src/pages/Cart.js` - Added countdown display
- `client/src/pages/Checkout.js` - Added checkout timer logic

## Summary

The cart reservation system is now fully implemented with:
- ✅ 5-minute cart reservation timer
- ✅ Timer restarts when adding items
- ✅ 3-minute checkout timer
- ✅ Visual countdown with warnings
- ✅ Automatic expiration and cleanup
- ✅ Real-time inventory management
- ✅ Socket.io real-time updates
- ✅ Mobile responsive UI
- ✅ Error handling and edge cases

The system ensures fair inventory allocation and creates urgency for users to complete their purchases.
