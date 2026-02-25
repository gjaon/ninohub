# Cart Reservation System - Visual Flow

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          USER INTERFACE                             │
│                                                                     │
│  ┌──────────────┐            ┌──────────────┐                     │
│  │  Cart Page   │            │ Checkout Page │                     │
│  │              │            │               │                     │
│  │  ┌────────┐  │            │  ┌────────┐   │                     │
│  │  │ Timer  │  │            │  │ Timer  │   │                     │
│  │  │ 5:00   │  │            │  │ 3:00   │   │                     │
│  │  └────────┘  │            │  └────────┘   │                     │
│  └──────┬───────┘            └───────┬───────┘                     │
│         │                            │                             │
│         └────────────┬───────────────┘                             │
│                      │                                             │
└──────────────────────┼─────────────────────────────────────────────┘
                       │
                       │ Socket.IO Events
                       │
┌──────────────────────▼─────────────────────────────────────────────┐
│                     BACKEND SERVER                                  │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │                  Socket.IO Handler                         │    │
│  │                                                            │    │
│  │  Events:                                                   │    │
│  │  • cart:add → reserveCartItems()                          │    │
│  │  • cart:remove → update reservations                      │    │
│  │  • cart:updateQuantity → update reservations              │    │
│  │  • cart:startCheckout → startCheckout()                   │    │
│  │  • cart:cancelCheckout → reserveCartItems()               │    │
│  │                                                            │    │
│  └────────────────────┬───────────────────────────────────────┘    │
│                       │                                            │
│  ┌────────────────────▼───────────────────────────────────────┐    │
│  │            Cart Reservation Service                        │    │
│  │            (utils/cartReservation.js)                      │    │
│  │                                                            │    │
│  │  • reserveCartItems(cart)          [5 min]                │    │
│  │  • startCheckout(cartId)           [3 min]                │    │
│  │  • releaseCartReservations(cartId)                        │    │
│  │  • completeCart(cartId)                                   │    │
│  │  • cleanupExpiredReservations(io)  [every 30s]            │    │
│  │                                                            │    │
│  └────────────────────┬───────────────────────────────────────┘    │
│                       │                                            │
└───────────────────────┼────────────────────────────────────────────┘
                        │
                        │ Database Operations
                        │
┌───────────────────────▼────────────────────────────────────────────┐
│                     MONGODB DATABASE                                │
│                                                                     │
│  ┌─────────────────────┐        ┌─────────────────────┐            │
│  │   Cart Collection   │        │ Product Collection  │            │
│  │                     │        │                     │            │
│  │  • items[]          │        │  • productId        │            │
│  │  • userId           │        │  • totalStock       │            │
│  │  • sessionId        │        │  • reservedStock    │            │
│  │  • reservationExpiry│◄──────►│  • availableStock   │            │
│  │  • reservationStatus│        │  • reservations[]   │            │
│  │  • checkoutStartedAt│        │                     │            │
│  │                     │        │  Each reservation:  │            │
│  │                     │        │   - cartId          │            │
│  │                     │        │   - quantity        │            │
│  │                     │        │   - expiresAt       │            │
│  │                     │        │   - status          │            │
│  └─────────────────────┘        └─────────────────────┘            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Timer State Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    CART RESERVATION FLOW                    │
└─────────────────────────────────────────────────────────────┘

START
  │
  ▼
┌─────────────────┐
│  User adds      │
│  item to cart   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│  Backend: reserveCartItems()                │
│  • Create/update Product reservation        │
│  • Set cart.reservationExpiry = now + 5min  │
│  • Set cart.reservationStatus = "active"    │
└────────┬────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│  Frontend:      │
│  Display Timer  │
│  ⏱️  5:00       │
└────────┬────────┘
         │
         ├──────────── User adds/updates ────────┐
         │                                       │
         │                                       ▼
         │                            ┌──────────────────┐
         │                            │  Timer RESETS    │
         │                            │  to 5:00         │
         │                            └─────────┬────────┘
         │                                      │
         │                                      ▼
         │◄─────────────────────────────────────┘
         │
         ├──────────── User clicks checkout ────┐
         │                                       │
         │                                       ▼
         │                            ┌──────────────────┐
         │                            │  startCheckout() │
         │                            │  Timer → 3:00    │
         │                            │  Status:checkout │
         │                            └─────────┬────────┘
         │                                      │
         │                                      ▼
         │                            ┌──────────────────┐
         │                            │ User completes   │
         │                            │ payment?         │
         │                            └─────┬────┬───────┘
         │                                  │    │
         │                           YES ───┘    └─── NO
         │                            │              │
         │                            ▼              ▼
         │                  ┌──────────────┐  ┌──────────────┐
         │                  │completeCart()│  │ User leaves  │
         │                  │Stock deducted│  │ checkout     │
         │                  │Cart cleared  │  └──────┬───────┘
         │                  └──────────────┘         │
         │                            │              │
         │                            ▼              ▼
         │                         ┌────────────────────┐
         │                         │ Timer continues    │
         │                         │ (3 min countdown)  │
         │                         └─────────┬──────────┘
         │                                   │
         ▼                                   ▼
┌─────────────────────────────────────────────────────┐
│              TIMER EXPIRES (0:00)                   │
│                                                     │
│  Backend: cleanupExpiredReservations()              │
│  • Release Product reservations                     │
│  • Set cart.reservationStatus = "expired"           │
│  • Emit "cart:reservation:expired"                  │
│                                                     │
│  Frontend:                                          │
│  • Clear cart                                       │
│  • Show notification                                │
│  • Items available to other users                   │
└─────────────────────────────────────────────────────┘
```

## Reservation Status Lifecycle

```
┌──────────┐     Add to Cart      ┌──────────┐
│  (none)  │ ──────────────────► │  active  │
└──────────┘                      └─────┬────┘
                                        │
                         ┌──────────────┼──────────────┐
                         │              │              │
                   Click Checkout   Timer Expires   Complete
                         │              │           Order
                         ▼              ▼              ▼
                  ┌──────────┐   ┌──────────┐   ┌──────────┐
                  │ checkout │   │ expired  │   │completed │
                  └─────┬────┘   └──────────┘   └──────────┘
                        │              ▲
                   Timer Expires       │
                        └──────────────┘
```

## Stock Calculation Flow

```
┌─────────────────────────────────────────────────────────────┐
│                  INVENTORY TRACKING                         │
└─────────────────────────────────────────────────────────────┘

Product: "Diamond Ring #123"
totalStock: 100
reservedStock: 0
availableStock: 100

USER A adds 5 items to cart
  │
  ▼
productModel.reserveQuantity(cartA, 5)
  │
  ├─ Check: availableStock (100) >= quantity (5) ✅
  │
  ├─ Create reservation:
  │   {
  │     cartId: cartA,
  │     quantity: 5,
  │     expiresAt: now + 5min,
  │     status: "active"
  │   }
  │
  └─ Update stock:
      reservedStock: 0 → 5
      availableStock: 100 → 95

USER B adds 3 items to cart
  │
  ▼
productModel.reserveQuantity(cartB, 3)
  │
  ├─ Check: availableStock (95) >= quantity (3) ✅
  │
  ├─ Create reservation:
  │   {
  │     cartId: cartB,
  │     quantity: 3,
  │     expiresAt: now + 5min,
  │     status: "active"
  │   }
  │
  └─ Update stock:
      reservedStock: 5 → 8
      availableStock: 95 → 92

USER C tries to add 100 items
  │
  ▼
productModel.reserveQuantity(cartC, 100)
  │
  └─ Check: availableStock (92) >= quantity (100) ❌
      │
      └─ THROW ERROR: "Only 92 items available"

USER A's timer expires (5 minutes)
  │
  ▼
cleanupExpiredReservations()
  │
  ├─ Find expired reservations
  │
  ├─ Release User A's reservation:
  │   reservedStock: 8 → 3
  │   availableStock: 92 → 97
  │   reservation.status: "expired"
  │
  └─ Emit event: cart:reservation:expired

USER B completes order
  │
  ▼
completeCart(cartB)
  │
  ├─ Update reservation status: "completed"
  │
  └─ Deduct from stock:
      totalStock: 100 → 97
      reservedStock: 3 → 0
      availableStock: 97 → 97

FINAL STATE:
  totalStock: 97
  reservedStock: 0
  availableStock: 97
```

## Color States Timeline

```
Timer:  5:00  4:00  3:00  2:00  1:00  0:30  0:00
        ├─────┼─────┼─────┼─────┼─────┼─────┤
Color:  Purple      │     Pink   │  Red/Pulse
        Normal      │  Warning   │  Critical
                    └────────────┴───────────
                         Animations
```

## Multi-User Interaction

```
Time: 00:00  User A adds 5 items
      ↓      reservedStock: 0 → 5
      │      availableStock: 100 → 95
      │
      02:00  User B adds 10 items
      ↓      reservedStock: 5 → 15
      │      availableStock: 95 → 85
      │
      03:00  User C sees only 85 available
      ↓      (real-time via socket.io)
      │
      05:00  User A's timer expires
      ↓      reservedStock: 15 → 10
      │      availableStock: 85 → 90
      │      User A's cart cleared
      │
      05:30  User C adds 15 items
      ↓      reservedStock: 10 → 25
      │      availableStock: 90 → 75
      │
      07:00  User B completes checkout
      ↓      (timer switches to 3:00)
      │
      08:30  User C updates quantity to 20
      ↓      reservedStock: 25 → 30
      │      availableStock: 75 → 70
      │      User C's timer resets to 5:00
      │
      10:00  User B completes payment
      ↓      totalStock: 100 → 90
      │      reservedStock: 30 → 20
      │      User B's order complete
      │
      13:30  User C's timer expires
      ↓      reservedStock: 20 → 0
      │      availableStock: 70 → 90
      │      User C's cart cleared
      │
      FINAL: totalStock: 90
             reservedStock: 0
             availableStock: 90
```

## Socket Event Flow

```
┌────────────┐                              ┌────────────┐
│  Frontend  │                              │  Backend   │
└──────┬─────┘                              └──────┬─────┘
       │                                           │
       │  cart:add { product, quantity }           │
       ├──────────────────────────────────────────►│
       │                                           │
       │                                 Reserve items
       │                                 Update database
       │                                           │
       │  ◄────────────────────────────────────────┤
       │  cart:updated { cart, remainingTime }     │
       │                                           │
Update Redux                                       │
Show timer                                         │
       │                                           │
       │  cart:startCheckout                       │
       ├──────────────────────────────────────────►│
       │                                           │
       │                              Update to 3-min timer
       │                                           │
       │  ◄────────────────────────────────────────┤
       │  cart:checkoutStarted { remainingTime }   │
       │                                           │
Update timer                                       │
       │                                           │
       :                                           :
       :          (5 minutes pass)                 :
       :                                           :
       │                                    Cleanup runs
       │                               Finds expired cart
       │                              Releases reservation
       │                                           │
       │  ◄────────────────────────────────────────┤
       │  cart:reservation:expired                 │
       │                                           │
Clear cart                                         │
Show toast                                         │
       │                                           │
```

---

**Legend:**
- 🟣 Purple: Normal state (>2 minutes)
- 🩷 Pink: Warning state (1-2 minutes)
- 🔴 Red: Critical state (<1 minute)
- ⏱️ Timer: Active countdown
- ✅ Success: Operation completed
- ❌ Error: Operation failed
