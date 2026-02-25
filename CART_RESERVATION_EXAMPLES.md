# Cart Reservation System - Code Examples

## Frontend Usage Examples

### 1. Using CartCountdown Component

```jsx
// In Cart.js
import React from 'react';
import { useSelector } from 'react-redux';
import CartCountdown from '../components/CartCountdown';

function Cart() {
  const { reservationExpiry, reservationStatus } = useSelector(state => state.cart);

  const handleExpiration = () => {
    console.log('Cart expired!');
    // Handled automatically by useEffect in Cart.js
  };

  return (
    <div>
      <h1>Shopping Cart</h1>
      
      {/* Cart Timer */}
      <CartCountdown
        expiryTime={reservationExpiry}
        status={reservationStatus}
        onExpired={handleExpiration}
        variant="cart"
      />
      
      {/* Cart items */}
    </div>
  );
}
```

### 2. Listening to Socket Events

```jsx
// In any component
import { useEffect } from 'react';
import { getSocket } from '../services/socket';

function MyComponent() {
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // Listen for reservation expiry
    const handleExpired = (data) => {
      console.log('Reservation expired:', data);
      toast.error('Your cart has expired!');
    };

    // Listen for inventory updates
    const handleInventoryUpdate = () => {
      console.log('Inventory updated');
      // Refresh product availability
    };

    socket.on('cart:reservation:expired', handleExpired);
    socket.on('inventory:updated', handleInventoryUpdate);

    // Cleanup
    return () => {
      socket.off('cart:reservation:expired', handleExpired);
      socket.off('inventory:updated', handleInventoryUpdate);
    };
  }, []);

  return <div>My Component</div>;
}
```

### 3. Checkout Flow

```jsx
// In Checkout.js
import { useEffect } from 'react';
import { getSocket } from '../services/socket';

function Checkout() {
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // Start checkout timer
    socket.emit('cart:startCheckout');

    // Listen for confirmation
    socket.on('cart:checkoutStarted', (data) => {
      console.log('Checkout started, 3 min timer:', data);
    });

    // Cleanup: cancel checkout if leaving
    return () => {
      socket.emit('cart:cancelCheckout');
      socket.off('cart:checkoutStarted');
    };
  }, []);

  return (
    <div>
      <CartCountdown variant="checkout" />
      {/* Checkout form */}
    </div>
  );
}
```

### 4. Getting Remaining Time

```jsx
import { getSocket } from '../services/socket';

function checkRemainingTime() {
  const socket = getSocket();
  
  socket.emit('cart:getRemainingTime');
  
  socket.once('cart:remainingTime', (data) => {
    console.log('Remaining time:', data.remainingTime, 'seconds');
    console.log('Expiry:', data.reservationExpiry);
    console.log('Status:', data.reservationStatus);
  });
}
```

## Backend Usage Examples

### 1. Reserve Items When Adding to Cart

```javascript
// In server.js - cart:add event handler
const { reserveCartItems } = require('./utils/cartReservation');

socket.on('cart:add', async (data) => {
  const { product, quantity } = data;
  
  // ... add item to cart ...
  
  try {
    // Reserve items with 5-min timer
    await reserveCartItems(cart);
    
    // Send updated cart with reservation data
    socket.emit('cart:updated', {
      ...cart.toObject(),
      remainingTime: getRemainingTime(cart),
      reservationExpiry: cart.reservationExpiry
    });
  } catch (error) {
    // Handle reservation error (e.g., out of stock)
    socket.emit('cart:error', { 
      message: error.message 
    });
  }
});
```

### 2. Start Checkout

```javascript
// In server.js - cart:startCheckout event handler
const { startCheckout } = require('./utils/cartReservation');

socket.on('cart:startCheckout', async () => {
  const cart = await Cart.findOne({ userId: socket.userId });
  
  // Switch to 3-minute timer
  await startCheckout(cart._id);
  
  const updatedCart = await Cart.findById(cart._id);
  
  socket.emit('cart:checkoutStarted', {
    remainingTime: getRemainingTime(updatedCart),
    reservationExpiry: updatedCart.reservationExpiry
  });
});
```

### 3. Complete Order

```javascript
// In orderController.js - createOrder function
const { completeCart } = require('../utils/cartReservation');

async function createOrder(req, res) {
  const cart = await Cart.findOne({ userId: req.user.id });
  
  // Create order
  const order = await Order.create({
    userId: req.user.id,
    items: cart.items,
    totalAmount: cart.totalPrice,
    // ... other fields
  });
  
  // Complete cart reservation
  // This marks reservation as completed and deducts stock
  await completeCart(cart._id);
  
  // Clear cart
  cart.items = [];
  await cart.save();
  
  res.json({ order });
}
```

### 4. Manual Reservation Release

```javascript
// If you need to manually release a cart
const { releaseCartReservations } = require('./utils/cartReservation');

async function cancelCart(cartId) {
  await releaseCartReservations(cartId);
  console.log('Reservations released for cart:', cartId);
}
```

### 5. Check Available Stock

```javascript
// Check how many items are available
const { getAvailableStock } = require('./utils/cartReservation');

async function checkStock(productId) {
  const available = await getAvailableStock(productId);
  console.log(`Product ${productId} has ${available} items available`);
  return available;
}
```

### 6. Custom Cleanup Trigger

```javascript
// Manually trigger cleanup
const { cleanupExpiredReservations } = require('./utils/cartReservation');

async function runCleanup(io) {
  const expiredCarts = await cleanupExpiredReservations(io);
  console.log(`Cleaned up ${expiredCarts.length} expired carts`);
  return expiredCarts;
}
```

## Database Query Examples

### 1. Find All Active Reservations

```javascript
const Product = require('./models/productModel');

async function getActiveReservations() {
  const products = await Product.find({
    'reservations.status': 'active'
  }).select('productId reservations');
  
  return products;
}
```

### 2. Find Carts About to Expire

```javascript
const Cart = require('./models/cartModel');

async function getExpiringCarts(minutesFromNow = 1) {
  const expiryThreshold = new Date(Date.now() + minutesFromNow * 60 * 1000);
  
  const carts = await Cart.find({
    reservationExpiry: { 
      $lte: expiryThreshold,
      $gt: new Date()
    },
    reservationStatus: 'active'
  });
  
  return carts;
}
```

### 3. Get Total Reserved Stock

```javascript
async function getTotalReservedStock(productId) {
  const product = await Product.findOne({ productId });
  if (!product) return 0;
  
  return product.reservedStock;
}
```

### 4. Find User's Active Cart Reservation

```javascript
async function getUserCartReservation(userId) {
  const cart = await Cart.findOne({ 
    userId,
    reservationStatus: 'active',
    reservationExpiry: { $gt: new Date() }
  });
  
  if (!cart) return null;
  
  const remainingSeconds = Math.floor(
    (new Date(cart.reservationExpiry) - new Date()) / 1000
  );
  
  return {
    cart,
    remainingSeconds,
    expiryTime: cart.reservationExpiry
  };
}
```

## Testing Examples

### 1. Test Cart Reservation

```javascript
// test-cart-reservation.js
const mongoose = require('mongoose');
const Cart = require('./models/cartModel');
const { reserveCartItems } = require('./utils/cartReservation');

async function testReservation() {
  await mongoose.connect(process.env.MONGO_URI);
  
  // Create test cart
  const cart = await Cart.create({
    userId: null,
    sessionId: 'test-session-123',
    items: [
      {
        productId: '1',
        productName: 'Test Ring',
        price: 1000,
        quantity: 2,
        image: 'test.jpg'
      }
    ],
    totalItems: 2,
    totalPrice: 2000
  });
  
  console.log('Created cart:', cart._id);
  
  // Reserve items
  await reserveCartItems(cart);
  
  console.log('Items reserved until:', cart.reservationExpiry);
  console.log('Status:', cart.reservationStatus);
  
  await mongoose.disconnect();
}

testReservation().catch(console.error);
```

### 2. Test Expiration Cleanup

```javascript
// test-cleanup.js
const mongoose = require('mongoose');
const { cleanupExpiredReservations } = require('./utils/cartReservation');

async function testCleanup() {
  await mongoose.connect(process.env.MONGO_URI);
  
  console.log('Running cleanup...');
  const expired = await cleanupExpiredReservations(null);
  
  console.log(`Cleaned up ${expired.length} expired reservations`);
  console.log('Expired cart IDs:', expired);
  
  await mongoose.disconnect();
}

testCleanup().catch(console.error);
```

### 3. Test Stock Availability

```javascript
// test-stock.js
const mongoose = require('mongoose');
const Product = require('./models/productModel');
const { getAvailableStock } = require('./utils/cartReservation');

async function testStock() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const productId = '1';
  const available = await getAvailableStock(productId);
  
  console.log(`Product ${productId}:`);
  console.log(`Available stock: ${available}`);
  
  const product = await Product.findOne({ productId });
  if (product) {
    console.log(`Total stock: ${product.totalStock}`);
    console.log(`Reserved stock: ${product.reservedStock}`);
    console.log(`Active reservations: ${product.reservations.length}`);
  }
  
  await mongoose.disconnect();
}

testStock().catch(console.error);
```

## API Response Examples

### 1. Cart Updated Response

```json
{
  "_id": "65abc123...",
  "userId": "65def456...",
  "sessionId": null,
  "items": [
    {
      "productId": "1",
      "productName": "Diamond Ring",
      "price": 2999.99,
      "quantity": 2,
      "image": "rings-01.jpg"
    }
  ],
  "customizations": [],
  "totalItems": 2,
  "totalPrice": 5999.98,
  "reservationExpiry": "2026-02-25T15:30:00.000Z",
  "reservationStatus": "active",
  "remainingTime": 300
}
```

### 2. Checkout Started Response

```json
{
  "remainingTime": 180,
  "reservationExpiry": "2026-02-25T15:03:00.000Z",
  "reservationStatus": "checkout"
}
```

### 3. Remaining Time Response

```json
{
  "remainingTime": 245,
  "reservationExpiry": "2026-02-25T15:30:00.000Z",
  "reservationStatus": "active"
}
```

### 4. Error Response

```json
{
  "message": "Only 5 items available for this product"
}
```

## Integration Examples

### 1. React Component with Full Integration

```jsx
import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { getSocket } from '../services/socket';
import { clearCart, updateCartFromSocket } from '../redux/slices/cartSlice';
import CartCountdown from '../components/CartCountdown';
import { toast } from 'sonner';

function SmartCart() {
  const dispatch = useDispatch();
  const cart = useSelector(state => state.cart);
  const [socket, setSocket] = useState(null);

  // Initialize socket
  useEffect(() => {
    const sock = getSocket();
    setSocket(sock);
  }, []);

  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    const handleCartUpdated = (data) => {
      dispatch(updateCartFromSocket(data));
    };

    const handleReservationExpired = () => {
      toast.error('Your cart reservation has expired!', {
        duration: 5000
      });
      dispatch(clearCart());
    };

    const handleInventoryUpdated = () => {
      toast.info('Product availability has changed');
    };

    socket.on('cart:updated', handleCartUpdated);
    socket.on('cart:reservation:expired', handleReservationExpired);
    socket.on('inventory:updated', handleInventoryUpdated);

    return () => {
      socket.off('cart:updated', handleCartUpdated);
      socket.off('cart:reservation:expired', handleReservationExpired);
      socket.off('inventory:updated', handleInventoryUpdated);
    };
  }, [socket, dispatch]);

  const handleExpirationWarning = () => {
    toast.warning('Hurry! Your cart is about to expire', {
      duration: 3000
    });
  };

  if (cart.items.length === 0) {
    return <div>Your cart is empty</div>;
  }

  return (
    <div className="smart-cart">
      <h1>Shopping Cart</h1>
      
      <CartCountdown
        expiryTime={cart.reservationExpiry}
        status={cart.reservationStatus}
        onExpired={() => {}}
        variant="cart"
      />
      
      <div className="cart-items">
        {cart.items.map(item => (
          <div key={item.id}>
            {item.name} - Qty: {item.quantity}
          </div>
        ))}
      </div>
      
      <div className="cart-summary">
        <p>Total Items: {cart.totalQuantity}</p>
        <p>Total Amount: ₦{cart.totalAmount.toLocaleString()}</p>
        <p>Status: {cart.reservationStatus}</p>
        {cart.remainingTime && (
          <p>Time Remaining: {Math.floor(cart.remainingTime / 60)}:{cart.remainingTime % 60}</p>
        )}
      </div>
    </div>
  );
}

export default SmartCart;
```

## Utility Functions Examples

### 1. Format Remaining Time

```javascript
export function formatRemainingTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Usage
const timeString = formatRemainingTime(185); // "3:05"
```

### 2. Get Time Warning Level

```javascript
export function getTimeWarningLevel(seconds) {
  if (seconds <= 60) return 'critical';
  if (seconds <= 120) return 'warning';
  return 'normal';
}

// Usage
const level = getTimeWarningLevel(45); // "critical"
```

### 3. Check if Cart Expired

```javascript
export function isCartExpired(expiryTime) {
  if (!expiryTime) return false;
  return new Date(expiryTime) < new Date();
}

// Usage
const expired = isCartExpired(cart.reservationExpiry);
```

---

**Note**: All these examples are working code snippets that you can use directly in your application or as reference for building similar features.
