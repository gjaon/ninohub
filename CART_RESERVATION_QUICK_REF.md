# Cart Reservation - Quick Reference

## Timers

| Action | Timer Duration | Background Color |
|--------|---------------|------------------|
| Add to cart | 5 minutes | Purple gradient |
| Modify cart | 5 minutes (reset) | Purple gradient |
| Checkout | 3 minutes | Blue gradient |
| Warning | Last 2 minutes | Pink gradient |
| Critical | Last 1 minute | Red gradient (pulsing) |

## Socket Events

### Client Emits
```javascript
socket.emit("cart:add", { product, quantity })
socket.emit("cart:remove", { productId })
socket.emit("cart:updateQuantity", { productId, quantity })
socket.emit("cart:startCheckout")
socket.emit("cart:cancelCheckout")
socket.emit("cart:getRemainingTime")
```

### Server Emits
```javascript
socket.emit("cart:updated", { ...cart, remainingTime, reservationExpiry })
socket.emit("cart:checkoutStarted", { remainingTime, reservationExpiry })
socket.emit("cart:reservation:expired", { cartId })
socket.emit("inventory:updated")
```

## Key Functions

### Backend (`utils/cartReservation.js`)
```javascript
await reserveCartItems(cart)              // Start/restart 5-min timer
await releaseCartReservations(cartId)     // Release all reservations
await startCheckout(cartId)               // Switch to 3-min timer
await completeCart(cartId)                // Finalize order, deduct stock
getRemainingTime(cart)                    // Get seconds remaining
await cleanupExpiredReservations(io)      // Clean up expired carts
await getAvailableStock(productId)        // Get available quantity
```

### Frontend Component
```jsx
<CartCountdown
  expiryTime={reservationExpiry}
  status={reservationStatus}
  onExpired={handleExpired}
  variant="cart" // or "checkout"
/>
```

## Reservation States

```
active → checkout → completed (order placed)
      ↓
   expired (timer ran out)
```

## File Structure

```
/models
  ├─ productModel.js        # NEW - Inventory tracking
  └─ cartModel.js           # MODIFIED - Added reservation fields

/utils
  └─ cartReservation.js     # NEW - Reservation logic

/controllers
  └─ orderController.js     # MODIFIED - Complete cart on order

/client/src/components
  ├─ CartCountdown.js       # NEW - Timer component
  └─ CartCountdown.css      # NEW - Timer styles

/client/src/pages
  ├─ Cart.js                # MODIFIED - Show timer
  └─ Checkout.js            # MODIFIED - Checkout timer

/client/src/redux/slices
  └─ cartSlice.js           # MODIFIED - Reservation state

server.js                   # MODIFIED - Socket events + cleanup
```

## Common Tasks

### Test Quickly (30 second timer)
```javascript
// utils/cartReservation.js
const CART_EXPIRY_MINUTES = 0.5;        // 30 seconds
const CHECKOUT_EXPIRY_MINUTES = 0.25;   // 15 seconds
```

### Check Database Reservations
```javascript
// MongoDB Compass or CLI
db.products.find({ "reservations.0": { $exists: true } })
db.carts.find({ reservationExpiry: { $exists: true } })
```

### Clear All Reservations
```javascript
// Development only - MongoDB
db.carts.updateMany({}, { $set: { reservationExpiry: null } })
db.products.updateMany({}, { $set: { reservations: [], reservedStock: 0 } })
```

### Monitor Cleanup
```javascript
// Server logs
console.log("Cleaned up X expired reservations");
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Timer not showing | Check socket connection, verify `reservationExpiry` in Redux state |
| Timer not counting | Check `CartCountdown` component, verify `expiryTime` prop |
| Cart not clearing | Check cleanup interval running, verify socket events |
| Over-reservation | Initialize Product inventory, check `reserveCartItems` calls |
| Socket disconnect | Restart server, check CORS settings |

## Configuration Files

### Timer Duration
📁 `utils/cartReservation.js`
```javascript
const CART_EXPIRY_MINUTES = 5;
const CHECKOUT_EXPIRY_MINUTES = 3;
```

### Cleanup Interval
📁 `server.js`
```javascript
setInterval(cleanup, 30000); // Every 30 seconds
```

### Default Stock
📁 `models/productModel.js`
```javascript
totalStock: { default: 100 }
```

## Testing Checklist

- [ ] Add to cart → Timer starts (5:00)
- [ ] Update quantity → Timer resets (5:00)
- [ ] Checkout → Timer switches (3:00)
- [ ] Back from checkout → Timer resets (5:00)
- [ ] Wait 5 min → Cart clears
- [ ] Multiple users → Stock accurately tracked
- [ ] Complete order → Stock deducted
- [ ] Mobile → Timer displays correctly
- [ ] Expiration → Notification shows

## API Response Format

```javascript
{
  items: [
    { productId, productName, price, quantity, image }
  ],
  customizations: [...],
  totalItems: 5,
  totalPrice: 15000,
  reservationExpiry: "2026-02-25T14:35:00.000Z",  // NEW
  reservationStatus: "active",                     // NEW
  remainingTime: 300                               // NEW (seconds)
}
```

## Pro Tips

💡 **Development**: Use 30-second timers for faster testing
💡 **Production**: Monitor cart abandonment rates
💡 **Performance**: Cleanup runs async, doesn't block requests
💡 **Scalability**: Each product tracks its own reservations
💡 **UX**: Critical animation creates urgency without being annoying

## Resources

- 📖 Full Documentation: `CART_RESERVATION_GUIDE.md`
- 🚀 Setup Guide: `CART_RESERVATION_SETUP.md`
- 📋 Summary: `CART_RESERVATION_SUMMARY.md`
- 💻 Code: All inline comments

---

**Quick Start**: `npm run dev` (backend) + `npm start` (frontend) → Add to cart → See timer! 🎉
