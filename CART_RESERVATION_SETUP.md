# Cart Reservation System - Setup & Testing Guide

## Quick Start

### 1. Install Dependencies (if needed)

No new dependencies are required! The system uses existing packages:
- mongoose (database)
- socket.io (real-time)
- express (server)

### 2. Database Migration

The new fields are backward compatible. Existing carts will work normally.

However, you may want to initialize product inventory:

```javascript
// Optional: Run this script once to initialize product inventory
// You can create a separate script file or run via MongoDB Compass

const mongoose = require('mongoose');
const Product = require('./models/productModel');
const products = require('./data/product');

async function initializeInventory() {
  await mongoose.connect(process.env.MONGO_URI);
  
  for (const product of products) {
    const exists = await Product.findOne({ productId: product.id.toString() });
    if (!exists) {
      await Product.create({
        productId: product.id.toString(),
        totalStock: 100,
        availableStock: 100,
        reservedStock: 0,
        reservations: []
      });
    }
  }
  
  console.log('Inventory initialized!');
  process.exit(0);
}

initializeInventory();
```

### 3. Environment Variables

Make sure these are set in your `.env`:
```
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
PORT=5000
```

### 4. Start the Application

**Backend** (from repo root):
```bash
npm run dev
```

**Frontend** (from client/ folder):
```bash
npm start
```

## Testing the Feature

### Test 1: Basic Cart Reservation (5 minutes)

1. **Open the application** in your browser
2. **Navigate to Products** page
3. **Add an item to cart**
   - You should see a countdown timer appear at the top
   - Timer shows "Items reserved for 5:00"
4. **Watch the countdown**
   - Timer counts down in real-time
   - Changes color as time runs out:
     - Purple: Normal (>2 min)
     - Pink: Warning (1-2 min)
     - Red/Yellow: Critical (<1 min with pulsing)
5. **Add another item**
   - Timer should reset to 5:00

### Test 2: Timer Restart on Cart Activity

1. **Add item to cart** - Timer starts at 5:00
2. **Wait 2 minutes** - Timer at ~3:00
3. **Update quantity** (increase/decrease)
   - Timer should reset to 5:00
4. **Add a different product**
   - Timer resets to 5:00 again

### Test 3: Checkout Timer (3 minutes)

1. **Add items to cart**
2. **Click "Proceed to Checkout"**
   - Timer changes to "Complete checkout in 3:00"
   - Background color changes to blue gradient
3. **Fill out checkout form**
   - Timer continues counting down
4. **Go back to cart** (browser back button)
   - Timer should reset to 5:00 (cart mode)

### Test 4: Cart Expiration

**Option A: Wait 5 minutes** (slow)
1. Add items to cart
2. Don't interact with cart
3. Wait 5+ minutes
4. Cart should clear automatically
5. Notification: "Your cart reservation has expired"

**Option B: Speed test** (modify code temporarily)
1. Edit `utils/cartReservation.js`:
   ```javascript
   const CART_EXPIRY_MINUTES = 0.5; // 30 seconds for testing
   ```
2. Restart server
3. Add items to cart
4. Wait 30 seconds
5. Cart clears, notification shows
6. **Remember to change back to 5 minutes after testing!**

### Test 5: Multiple Browsers (Inventory Reservation)

1. **Browser 1**: Add 5 items of a product
   - Items reserved for Browser 1
2. **Browser 2** (incognito/different browser): Try to add 10+ items
   - If default stock is 100, Browser 2 can add up to 95 items
   - If trying to exceed available stock, error appears
3. **Browser 1**: Let timer expire
4. **Browser 2**: Now can add the released items

### Test 6: Checkout Abandonment

1. **Add items to cart**
2. **Proceed to checkout** - 3-minute timer starts
3. **Close the tab/browser**
4. **Wait 3+ minutes**
5. **Reopen application**
   - Cart should be cleared
   - Items available again

### Test 7: Successful Order Completion

1. **Login** to your account
2. **Add items to cart**
3. **Proceed to checkout**
4. **Fill out shipping information**
5. **Complete payment** (or mock checkout)
6. Order created successfully
7. Cart cleared
8. Inventory permanently reduced

## Visual Indicators

### Cart Page
- **Top Banner**: Countdown timer with time remaining
- **Color Coding**:
  - Purple gradient: Normal time
  - Pink gradient: Warning (last 2 min)
  - Red/yellow gradient: Critical (last min)
- **Critical State**: Pulsing animation + warning message

### Checkout Page
- **Top Banner**: "Complete checkout in MM:SS"
- **Blue Gradient**: Initially calm blue
- **Changes to Warning Colors**: As time runs out
- **Same Critical State**: Pulsing when < 1 min

### Console Logs (Browser DevTools)

Open DevTools → Console to see:
- "Connected to WebSocket server"
- "Checkout timer started"
- Cart update events
- Reservation status changes

### Network Tab

Check Socket.IO events:
- `cart:add` → `cart:updated`
- `cart:startCheckout` → `cart:checkoutStarted`
- `cart:reservation:expired` (when timer expires)

## Common Issues & Solutions

### Timer Not Appearing

**Problem**: Countdown doesn't show after adding to cart

**Solutions**:
1. Check browser console for errors
2. Verify socket connection: Look for "Connected to WebSocket server"
3. Check Redux state: Open Redux DevTools, check `cart.reservationExpiry`
4. Restart both frontend and backend

### Timer Not Counting Down

**Problem**: Timer shows but doesn't update

**Solutions**:
1. Check `CartCountdown.js` component is imported
2. Verify `expiryTime` prop is valid Date
3. Check for JavaScript errors in console

### Cart Not Clearing on Expiry

**Problem**: Timer reaches 0 but cart still has items

**Solutions**:
1. Check server logs for cleanup errors
2. Verify cleanup interval is running (server.js)
3. Check socket connection is active
4. Force refresh the page

### Inventory Issues

**Problem**: Can add more items than available

**Solutions**:
1. Initialize Product inventory (see migration above)
2. Check Product model exists in database
3. Verify reserveCartItems is being called
4. Check server logs for reservation errors

### Socket Disconnection

**Problem**: "Disconnected from WebSocket server" in console

**Solutions**:
1. Restart backend server
2. Check firewall/CORS settings
3. Verify WebSocket port is open
4. Check network connection

## Development Tips

### Adjust Timer for Testing

For faster testing, temporarily modify:

**File**: `utils/cartReservation.js`
```javascript
const CART_EXPIRY_MINUTES = 0.5;      // 30 seconds
const CHECKOUT_EXPIRY_MINUTES = 0.25; // 15 seconds
```

**Remember**: Change back to production values:
```javascript
const CART_EXPIRY_MINUTES = 5;
const CHECKOUT_EXPIRY_MINUTES = 3;
```

### Monitor Reservations

Add console logs to track reservations:

**File**: `utils/cartReservation.js`
```javascript
const reserveCartItems = async (cart) => {
  console.log(`Reserving items for cart ${cart._id}`);
  // ... existing code
  console.log(`Reservation expires at: ${cart.reservationExpiry}`);
  return cart;
};
```

### Check Database Directly

Use MongoDB Compass or CLI:

```javascript
// Check product reservations
db.products.find({ "reservations.0": { $exists: true } })

// Check cart reservation status
db.carts.find({ reservationExpiry: { $exists: true } })

// Count active reservations
db.products.aggregate([
  { $unwind: "$reservations" },
  { $match: { "reservations.status": "active" } },
  { $count: "activeReservations" }
])
```

### Clear All Reservations (Development)

If you need to reset during testing:

```javascript
// Run in MongoDB Compass or CLI
db.carts.updateMany(
  {},
  {
    $set: {
      reservationExpiry: null,
      reservationStatus: "active"
    }
  }
)

db.products.updateMany(
  {},
  {
    $set: {
      reservations: [],
      reservedStock: 0,
      availableStock: 100
    }
  }
)
```

## Deployment Checklist

Before deploying to production:

- [ ] Set correct timer values (5 min cart, 3 min checkout)
- [ ] Test on staging environment
- [ ] Verify socket connections work in production
- [ ] Initialize product inventory in production database
- [ ] Monitor server logs for errors
- [ ] Test with real users
- [ ] Set up error tracking (e.g., Sentry)
- [ ] Document for support team

## Performance Monitoring

Key metrics to watch:

1. **Cleanup Execution Time**
   - Should complete in < 1 second
   - Monitor server logs

2. **Socket Event Latency**
   - Cart updates should be instant
   - Test under load

3. **Database Query Performance**
   - Index on `productId`, `userId`, `sessionId`
   - Monitor slow queries

4. **Cart Abandonment Rate**
   - Track how often carts expire
   - Adjust timer if too aggressive

## Support

If you encounter issues:

1. Check server logs (`npm run dev` output)
2. Check browser console (F12 → Console)
3. Verify socket connection
4. Review error messages
5. Refer to `CART_RESERVATION_GUIDE.md` for detailed docs

## Success Criteria

The system is working correctly when:

✅ Timer appears when adding to cart
✅ Timer counts down smoothly
✅ Timer resets when adding/updating items
✅ Timer switches to 3 min at checkout
✅ Cart clears when timer expires
✅ Notification shows on expiration
✅ Items release to other users on expiry
✅ Order completion clears reservation
✅ Multiple users can't over-reserve stock
✅ Mobile display works correctly

Enjoy your new cart reservation system! 🎉
