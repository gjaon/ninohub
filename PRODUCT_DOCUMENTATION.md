# NINO - Product Documentation

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Product Overview](#product-overview)
3. [Technical Architecture](#technical-architecture)
4. [Core Features](#core-features)
5. [User Journeys](#user-journeys)
6. [User Personas](#user-personas)
7. [Feature Details](#feature-details)
8. [Business Logic](#business-logic)
9. [Future Enhancements](#future-enhancements)

---

## Executive Summary

**NINO** (House of Jewelry) is a full-stack e-commerce platform specializing in wholesale and retail jewelry sales with an innovative custom jewelry design capability. The platform enables customers to browse an extensive catalog, purchase jewelry with quantity-based discounts, and create personalized jewelry with custom text, images, video, or audio engravings.

### Key Metrics
- **Product Categories**: 4 (Rings, Necklaces, Bracelets, Earrings)
- **Product Catalog**: 100+ items
- **Target Launch**: March 6, 2026 at 8:00 PM
- **Pricing Model**: Tiered quantity discounts (3+ items: 5% off, 5+ items: 10% off, 10+ items: 15% off)
- **Currency**: Nigerian Naira (₦)

---

## Product Overview

### Vision
To provide an accessible, user-friendly platform where customers can discover quality jewelry and create personalized pieces that tell their unique stories.

### Value Proposition
1. **Wholesale & Retail Flexibility** - Competitive pricing for both individual buyers and bulk purchasers
2. **Customization Innovation** - Industry-leading multimedia customization (text, images, video, audio)
3. **Transparent Pricing** - Clear quantity-based discounts encourage larger purchases
4. **Pre-Launch Strategy** - Waitlist system with exclusive early-bird discounts

### Target Market
- Individual consumers seeking quality jewelry
- Couples looking for engagement/wedding rings
- Retailers and wholesalers needing bulk inventory
- Gift buyers wanting personalized jewelry
- Event planners (weddings, anniversaries, corporate gifts)

---

## Technical Architecture

### Stack Overview

#### Frontend
- **Framework**: React 18 with Create React App
- **Routing**: React Router v6
- **State Management**: Redux Toolkit
- **UI Components**: Custom components with CSS modules
- **Toast Notifications**: Sonner library
- **Asset Management**: Local images with dynamic imports

#### Backend
- **Runtime**: Node.js with Express 5
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT-based cookie authentication
- **Security**: bcrypt password hashing, httpOnly cookies
- **Middleware**: CORS, body-parser, cookie-parser, custom error handling

#### Deployment
- **Environment Support**: Development, Staging, Production
- **Frontend Build**: Static files served from `/client/build`
- **API Namespace**: All backend routes prefixed with `/api`
- **Production URL**: https://www.ninohub.com

### Project Structure
```
NINO/
├── server.js                 # Express server entry point
├── client/                   # React application
│   ├── src/
│   │   ├── pages/           # Route-level components
│   │   ├── components/      # Reusable UI components
│   │   ├── redux/           # State management
│   │   ├── services/        # API integration
│   │   ├── context/         # React Context providers
│   │   ├── utils/           # Utility functions
│   │   └── assets/          # Static assets
│   └── build/               # Production build output
├── controllers/             # Business logic
├── models/                  # MongoDB schemas
├── routes/                  # API routes
└── middleware/              # Custom middleware
```

---

## Core Features

### 1. Product Browsing & Discovery
- **Search**: Real-time product search by name or description
- **Filtering**: Category-based filtering (All, Rings, Necklaces, Bracelets, Earrings)
- **Pagination**: 9 products per page with smooth navigation
- **Product Details**: Comprehensive view with image zoom, specifications, pricing
- **Categories**: Visual category navigation from homepage

### 2. Shopping Cart
- **Add to Cart**: From product listing or detail pages
- **Quantity Management**: Increment/decrement with live price updates
- **Dynamic Pricing**: Real-time discount calculations based on quantity
- **Cart Badge**: Navbar shows total item count
- **Persistent State**: Redux state persists during session
- **Support for Custom Items**: Both regular and customized products

### 3. Jewelry Customization
**4-Step Workflow**:
1. **Select Product**: Browse and select customizable jewelry
2. **Add Media**: Upload text, image, video, or audio
3. **Add Notes**: Special instructions for customization
4. **Review & Save**: Preview and save or add to cart

**Features**:
- Save customizations for later
- View all saved customizations
- Add customized items to cart
- File upload support for multimedia

### 4. User Authentication
- **Registration**: Name, email, password (minimum 6 characters)
- **Login**: Email & password authentication
- **Protected Routes**: Profile and checkout require authentication
- **JWT Tokens**: Secure cookie-based authentication with refresh tokens
- **Session Management**: Auto-redirect to intended page after login

### 5. User Profile
- **Account Information**: Name, email, phone, bio
- **Profile Updates**: Edit personal information
- **Order History**: View past orders with status
- **Password Management**: Change password functionality
- **Logout**: Secure session termination

### 6. Checkout Process
**3-Step Flow**:
1. **Shipping Information**: Name, address, contact details
2. **Payment Details**: Card information (simulated)
3. **Order Review**: Final confirmation with order summary

**Calculations**:
- Subtotal from cart items
- Shipping: Flat rate ($15.00)
- Tax: 8% of subtotal
- Final Total: Subtotal + Shipping + Tax

### 7. Order Tracking
- **Guest Tracking**: Track by order number and email
- **Authenticated Tracking**: View all orders
- **Real-Time Status**: 7-stage timeline
  1. Order Placed
  2. Payment Confirmed
  3. Processing
  4. Shipped
  5. In Transit
  6. Out for Delivery
  7. Delivered
- **Estimated Delivery**: Dynamic date calculations

### 8. Pre-Launch Features
- **Launch Countdown**: Live countdown to March 6, 2026, 8:00 PM
- **Waitlist System**: Name, phone, email collection
- **Status Tracking**: pending → contacted → converted
- **Early-Bird Messaging**: Exclusive discounts for waitlist members

### 9. Contact & Support
- **Contact Form**: Name, email, phone, subject, message
- **Location Information**: Physical address display
- **Phone Support**: Multiple contact numbers with business hours
- **Email Support**: Direct email link
- **Social Media**: WhatsApp integration

---

## User Journeys

### Journey 1: Guest Customer - Quick Purchase

**Persona**: Sarah, 28, buying an engagement gift

**Goal**: Find and purchase a necklace quickly

**Steps**:
1. **Landing** → Arrives on homepage
2. **Browse** → Clicks "Shop by Category" → Selects "Necklaces"
3. **Search** → Uses search bar: "diamond necklace"
4. **View Product** → Clicks product card for "Diamond Pendant Necklace"
5. **Add to Cart** → Selects quantity: 1, clicks "Add to Cart"
6. **Checkout** → Navbar cart badge shows (1), clicks cart icon
7. **Review Cart** → Verifies item, clicks "Proceed to Checkout"
8. **Shipping Info** → Enters name, address, email, phone
9. **Payment** → Enters card details
10. **Order Review** → Reviews total (₦25,999 + ₦15 shipping + tax)
11. **Confirmation** → Places order, receives order number NNO-XXXXXXXXX
12. **Track Order** → Saves order number for tracking

**Outcome**: Successful purchase in 5 minutes

---

### Journey 2: Returning Customer - Bulk Purchase with Discount

**Persona**: Michael, 35, wholesale buyer for retail store

**Goal**: Purchase 10 rings at discounted price

**Steps**:
1. **Login** → Clicks "Login" in navbar → Enters credentials
2. **Browse** → Navigates to Products → Filters by "Rings"
3. **Pagination** → Browses through pages to compare options
4. **Select Product** → Opens "Classic Diamond Ring" detail page
5. **Quantity Selection** → Increases quantity to 10
6. **Discount Display** → Sees:
   - Original: ₦2,999.99 each
   - Discounted: ₦2,549.99 each (15% off)
   - Total: ₦25,499.90
   - Discount badge: "15% OFF - You saved ₦4,499.90!"
7. **Add to Cart** → Adds 10 items to cart
8. **Continue Shopping** → Returns to products, adds 5 necklaces
9. **Cart Review** → Cart shows both items with individual discounts
10. **Checkout** → Completes shipping (saved from profile) and payment
11. **Order Confirmation** → Receives order number and email confirmation
12. **Profile View** → Navigates to Profile → Orders tab to view status

**Outcome**: Saved ₦4,499.90 with bulk discount, streamlined checkout with saved profile

---

### Journey 3: Engaged Couple - Custom Engagement Ring

**Persona**: David & Lisa, planning wedding, want personalized rings

**Goal**: Create matching custom engagement rings with engraved message

**Steps**:
1. **Research** → Arrives from Google search "custom engagement rings Nigeria"
2. **Homepage** → Reads about "Custom Design" feature
3. **Customization Hub** → Clicks "Start Customizing"
4. **Step 1 - Select Product**:
   - Searches for "engagement ring"
   - Selects "Classic Diamond Ring" (₦2,999.99)
   - Clicks "Customize This Item"
5. **Step 2 - Add Media**:
   - Selects "Text" tab
   - Enters: "Together Forever - D&L - March 6, 2026"
   - Previews engraving
6. **Step 3 - Special Notes**:
   - Adds: "Please engrave on inside of band. Font: Elegant script"
7. **Step 4 - Review**:
   - Reviews all customization details
   - Sees product image, customization summary
8. **Save Options**:
   - Clicks "Save Only" (to discuss with Lisa later)
9. **Return Later** → Logs in next day
10. **Customization Hub** → Views saved customizations
11. **Edit & Finalize**:
    - Opens saved customization
    - Updates quantity to 2 (matching rings)
    - Clicks "Save & Add to Cart"
12. **Checkout** → Proceeds to purchase
13. **Confirmation** → Order includes "Customized" badge

**Outcome**: Successfully created personalized engagement rings with saved customization workflow

---

### Journey 4: First-Time Visitor - Pre-Launch Waitlist

**Persona**: Jennifer, 25, discovered NINO before launch date

**Goal**: Join waitlist for early access and discounts

**Steps**:
1. **Discovery** → Sees NINO advertised on Instagram
2. **Homepage** → Sees launch countdown: "Launching in 18 days, 5 hours, 32 minutes"
3. **Waitlist Prompt** → Sees "Join Waitlist" call-to-action
4. **Waitlist Form** → Clicks "Join Our Waitlist"
5. **Form Completion**:
   - Name: Jennifer Okonkwo
   - Phone: +234 915 576 6040
   - Email: jennifer@example.com
6. **Benefits Display** → Reads benefits:
   - Early Bird Prices (exclusive discounts)
   - First Access to Launch
   - VIP Updates
   - Special Promotions
7. **Submit** → Submits form
8. **Confirmation** → Success message: "Thank you for joining our waitlist. You'll receive exclusive updates and early-bird discounts!"
9. **WhatsApp Follow** → Clicks WhatsApp button to stay connected
10. **Launch Day** → Receives notification when site goes live
11. **Early Access** → Uses special discount code from waitlist

**Outcome**: Successfully joined waitlist, positioned for launch-day discounts

---

### Journey 5: Regular Customer - Order Tracking

**Persona**: Ahmed, 40, purchased jewelry 3 days ago

**Goal**: Track delivery status of recent order

**Steps**:
1. **Homepage** → Returns to NINO website
2. **Navigation** → Clicks "Track Order" in navbar
3. **View Options** → Sees two tabs: "My Orders" (logged in) and "Track Order"
4. **My Orders Tab**:
   - Views all orders automatically
   - Sees order NNO-123456789 with status "In Transit"
5. **Order Details**:
   - Order Date: Nov 20, 2025
   - Estimated Delivery: Nov 25, 2025
   - Items: Classic Diamond Ring (1x)
6. **Timeline View**:
   - ✅ Order Placed - Nov 20, 10:30 AM
   - ✅ Payment Confirmed - Nov 20, 10:35 AM
   - ✅ Processing - Nov 21, 09:00 AM
   - ✅ Shipped - Nov 22, 08:00 AM
   - 🚚 **In Transit - Nov 22, 02:00 PM** (Current)
   - ⏳ Out for Delivery - Nov 25, 08:00 AM
   - ⏳ Delivered - Nov 25, TBD
7. **Contact Support** → If needed, uses "Contact Us" for inquiries

**Alternative - Guest Tracking**:
- Uses "Track Order" tab
- Enters order number: NNO-123456789
- Enters email: ahmed@example.com
- Views same timeline

**Outcome**: Clear visibility into order status, expected delivery date

---

### Journey 6: Profile Management

**Persona**: Grace, 32, wants to update account information

**Goal**: Update phone number and add bio to profile

**Steps**:
1. **Login** → Logs in with credentials
2. **Profile Access** → Clicks profile icon/name in navbar → "Profile"
3. **Settings Tab** → Navigates to "Settings" tab (default tabs: Orders, Settings)
4. **View Current Info**:
   - Name: Grace Akinola
   - Email: grace@example.com (read-only)
   - Phone: +234
   - Bio: "bio" (default)
5. **Edit Information**:
   - Updates Phone: +234 915 576 6040
   - Updates Bio: "Jewelry enthusiast and collector. Love unique pieces!"
6. **Save Changes** → Clicks "Save Changes" button
7. **Confirmation** → Toast notification: "Profile updated successfully!"
8. **Order History** → Switches to "Orders" tab
9. **View Past Purchases**:
   - Order 1: NNO-123456789 - In Transit - ₦2,999.99
   - Order 2: NNO-987654321 - Delivered - ₦5,499.99
10. **Logout** → Clicks "Logout" when done

**Outcome**: Successfully updated profile information, reviewed order history

---

### Journey 7: Browse Without Purchase - Research Phase

**Persona**: Chioma, 27, browsing for future purchase

**Goal**: Explore product catalog and save favorites for later

**Steps**:
1. **Homepage** → Lands on homepage, reads about NINO
2. **Category Exploration**:
   - Clicks "Rings" category card
   - Views 9 rings on page 1
   - Clicks pagination to page 2, 3, 4
3. **Search Test**:
   - Searches "diamond"
   - Views 20+ results
   - Refines: searches "gold diamond"
4. **Product Details**:
   - Opens "Three Stone Diamond Ring"
   - Views product specifications:
     - Material: Platinum
     - Weight: 4.5g
     - SKU: RNG-006
   - Uses image zoom to examine details
5. **Price Comparison**:
   - Tests quantity selector (1, 3, 5, 10)
   - Observes discount tiers:
     - 1 item: ₦5,999.99
     - 3 items: ₦5,699.99 each (5% off)
     - 5 items: ₦5,399.99 each (10% off)
     - 10 items: ₦5,099.99 each (15% off)
6. **Customization Check**:
   - Sees "Customize This Product" button
   - Clicks to explore customization workflow
   - Views Step 1 (product selection) interface
   - Does not complete customization
7. **Other Categories**:
   - Returns to Products
   - Filters by "Necklaces"
   - Views several necklace options
8. **Contact Information**:
   - Navigates to "Contact Us"
   - Notes phone numbers and location for future reference
9. **Exit** → Leaves site without purchase, plans to return later

**Outcome**: Gained familiarity with product range and pricing, ready for future purchase

---

### Journey 8: Mobile Shopping Experience

**Persona**: Tunde, 33, browsing on smartphone during commute

**Goal**: Quick mobile shopping experience

**Steps**:
1. **Mobile Access** → Opens ninohub.com on mobile browser
2. **Responsive Navigation** → Hamburger menu shows all navigation options
3. **Category Browsing** → Taps "Bracelets" from homepage categories
4. **Scrolling** → Swipes through product cards (3 per row on mobile)
5. **Product Selection** → Taps "Gold Tennis Bracelet"
6. **Mobile Image Zoom** → Pinch-to-zoom on product image
7. **Quantity Adjustment** → Uses + / - buttons (mobile-friendly)
8. **Add to Cart** → Taps large "Add to Cart" button
9. **Cart Badge** → Sees (1) badge on mobile navbar
10. **Continue Shopping** → Taps back button
11. **Search** → Uses search bar: "earrings"
12. **Filter** → Taps filter dropdown, selects "Earrings"
13. **Checkout Later** → Exits, cart state preserved

**Outcome**: Smooth mobile experience with responsive design

---

## User Personas

### 1. Sarah - The Gift Buyer
- **Age**: 28
- **Occupation**: Marketing Manager
- **Tech Savvy**: High
- **Shopping Behavior**: Occasional, event-driven
- **Needs**: Quick browsing, reliable delivery, quality assurance
- **Pain Points**: Time-constrained, needs gift wrapping options
- **Preferred Features**: Search, express checkout, order tracking

### 2. Michael - The Wholesale Buyer
- **Age**: 35
- **Occupation**: Retail Store Owner
- **Tech Savvy**: Medium
- **Shopping Behavior**: Regular bulk purchases
- **Needs**: Competitive pricing, bulk discounts, reliable supply
- **Pain Points**: Needs invoice/receipt for business records
- **Preferred Features**: Quantity discounts, saved payment info, order history

### 3. David & Lisa - The Engaged Couple
- **Age**: 30 & 28
- **Occupation**: Software Engineer & Teacher
- **Tech Savvy**: High
- **Shopping Behavior**: One-time significant purchase
- **Needs**: Customization, quality, romantic presentation
- **Pain Points**: Want unique, personalized items
- **Preferred Features**: Customization workflow, save for later, clear pricing

### 4. Jennifer - The Early Adopter
- **Age**: 25
- **Occupation**: Fashion Blogger
- **Tech Savvy**: Very High
- **Shopping Behavior**: Trend-follower, values exclusivity
- **Needs**: Early access, special discounts, shareable content
- **Pain Points**: FOMO, wants to be first
- **Preferred Features**: Waitlist, social sharing, new arrivals

### 5. Ahmed - The Regular Customer
- **Age**: 40
- **Occupation**: Business Executive
- **Tech Savvy**: Medium
- **Shopping Behavior**: Periodic purchases for family
- **Needs**: Account management, order history, tracking
- **Pain Points**: Wants seamless repeat purchases
- **Preferred Features**: Profile, saved addresses, loyalty tracking

### 6. Grace - The Profile Manager
- **Age**: 32
- **Occupation**: HR Professional
- **Tech Savvy**: Medium
- **Shopping Behavior**: Selective, quality-focused
- **Needs**: Account security, profile customization, order visibility
- **Pain Points**: Wants control over personal information
- **Preferred Features**: Profile settings, order history, password management

### 7. Chioma - The Researcher
- **Age**: 27
- **Occupation**: Graduate Student
- **Tech Savvy**: High
- **Shopping Behavior**: Extensive research before purchase
- **Needs**: Detailed product information, comparison, reviews
- **Pain Points**: Budget-constrained, needs to ensure value
- **Preferred Features**: Search, filtering, product details, zoom

### 8. Tunde - The Mobile Shopper
- **Age**: 33
- **Occupation**: Sales Representative
- **Tech Savvy**: High
- **Shopping Behavior**: On-the-go mobile shopping
- **Needs**: Fast loading, mobile-optimized UI, simple checkout
- **Pain Points**: Poor mobile experiences on other sites
- **Preferred Features**: Responsive design, touch-friendly controls

---

## Feature Details

### Authentication System

**Registration**
- Required fields: Name, Email, Password, Confirm Password
- Password validation: Minimum 6 characters
- Email validation: Regex pattern matching
- Password hashing: bcrypt (pre-save hook)
- Auto-login after registration
- Default profile values: Photo (avatar URL), Phone (+234), Bio ("bio")

**Login**
- Required fields: Email, Password
- JWT token generation with 1-day expiry
- Refresh token with 30-day expiry
- HttpOnly cookie storage (security best practice)
- Redirect to intended page after login

**Session Management**
- Protected routes check for valid token
- Auto-redirect to login for unauthorized access
- Logout clears cookies and Redux state
- Refresh token endpoint for silent renewal

**API Endpoints**
```
POST   /api/users/register        - Create new account
POST   /api/users/login           - Authenticate user
POST   /api/users/refresh         - Refresh access token
GET    /api/users/logout          - Clear session
GET    /api/users/getuser         - Get current user (protected)
GET    /api/users/loggedin        - Check login status
PATCH  /api/users/updateuser      - Update profile (protected)
PATCH  /api/users/changepassword  - Change password (protected)
```

---

### Pricing & Discount System

**Discount Tiers**
```javascript
Quantity 1-2:   0% discount  (full price)
Quantity 3-4:   5% discount  
Quantity 5-9:   10% discount
Quantity 10+:   15% discount
```

**Calculation Logic**
```javascript
// Example: Diamond Ring at ₦2,999.99
Quantity 1:  ₦2,999.99 each = ₦2,999.99 total
Quantity 3:  ₦2,849.99 each = ₦8,549.97 total (save ₦450)
Quantity 5:  ₦2,699.99 each = ₦13,499.95 total (save ₦1,500)
Quantity 10: ₦2,549.99 each = ₦25,499.90 total (save ₦4,500)
```

**Display Components**
1. **Product Detail Page**:
   - Base price (strikethrough if discounted)
   - Discounted unit price
   - Discount percentage badge
   - Total price for selected quantity
   - Savings amount

2. **Cart Page**:
   - Per-item unit price with discount
   - Line total per item
   - Discount badges
   - Subtotal with all discounts applied

3. **Discount Info Component**:
   - Current tier status
   - Next tier threshold ("Add 2 more for 10% off!")
   - All available tiers reference

---

### Customization Workflow

**Step 1: Product Selection**
- **UI Components**:
  - Search bar (filter products)
  - Product grid (5 items per page)
  - Pagination controls
  - "Customize This Item" button (only for customizable products)
- **State Management**:
  - Selected product stored in Redux
  - Product details (id, name, price, image, category)
- **Validation**: Must select a product to proceed

**Step 2: Add Media**
- **Tabs**: Text, Image, Video, Audio
- **Text Tab**:
  - Text area input
  - Character count
  - Font preview (future enhancement)
- **Image Tab**:
  - File upload button
  - Image preview
  - Supported formats: JPG, PNG, SVG
  - Base64 encoding for storage
- **Video Tab**:
  - File upload button
  - Video preview
  - Supported formats: MP4, MOV
- **Audio Tab**:
  - File upload button
  - Audio player preview
  - Supported formats: MP3, WAV
- **State**: Media stored as base64 in Redux
- **Validation**: Optional (can skip)

**Step 3: Special Notes**
- **UI**: Text area for additional instructions
- **Examples**: "Engrave on back", "Gift wrap please", "Rush order"
- **Character limit**: No limit (future: 500 chars)
- **Validation**: Optional

**Step 4: Review**
- **Display**:
  - Product image and name
  - Selected media preview
  - Special notes
  - Total customization summary
- **Actions**:
  - "Save Only" → Saves to customization library
  - "Save & Add to Cart" → Saves + adds to cart as custom item
  - "Back" → Return to previous step
- **State**: Saved customizations persist in Redux

**Customization Library**
- View all saved customizations
- Edit existing customizations
- Delete customizations
- Add saved customization to cart
- Grid display with thumbnails

---

### Waitlist System

**Data Collection**
- Name (required)
- Phone (required)
- Email (optional)
- Timestamp (auto)
- Status: pending | contacted | converted

**User Benefits Display**
1. 🎁 Early Bird Prices
2. ⏰ First Access to Launch
3. ⭐ Exclusive Updates
4. 🔔 Launch Notifications
5. 🚀 VIP Treatment
6. 💎 Special Promotions

**Backend Management**
```
POST   /api/waitlist/join         - Add to waitlist
GET    /api/waitlist/             - Get all waitlist entries (admin)
PATCH  /api/waitlist/:id/status   - Update status (admin)
```

**Validation**
- Phone: Required, trimmed
- Email: Optional, regex validation if provided
- Duplicate prevention: By phone number (future enhancement)

**Admin Features** (Future)
- View waitlist dashboard
- Filter by status
- Export to CSV
- Bulk email campaigns
- Conversion tracking

---

### Cart Management

**Redux State Structure**
```javascript
{
  items: [
    {
      id: number,
      name: string,
      category: string,
      image: string,
      quantity: number,
      basePrice: number,        // Original price
      unitPrice: number,        // Price after discount
      totalPrice: number,       // unitPrice × quantity
      discountPercent: number,  // 0, 5, 10, or 15
      isCustom: boolean,        // Custom item flag
      customizationId: number   // Link to customization
    }
  ],
  totalQuantity: number,
  totalAmount: number
}
```

**Actions**
1. **addToCart**:
   - Check if item exists (by id)
   - If exists: increment quantity, recalculate pricing
   - If new: add with initial quantity
   - Recalculate totals

2. **removeFromCart**:
   - Filter out item by id
   - Recalculate totals
   - Show confirmation toast

3. **updateQuantity**:
   - Find item by id
   - Update quantity
   - Recalculate pricing with new discount tier
   - Update totals

4. **clearCart**:
   - Empty items array
   - Reset totals to 0
   - Called after successful checkout

**Persistence**
- Redux state persists during browser session
- Lost on page refresh (future: localStorage)
- Cart badge always shows current totalQuantity

---

### Order Tracking System

**Order Number Format**: `NNO-XXXXXXXXX` (9 digits)

**Order Status Timeline**
1. **Order Placed** - Initial order submission
2. **Payment Confirmed** - Payment processed successfully
3. **Processing** - Order being prepared
4. **Shipped** - Order dispatched from warehouse
5. **In Transit** - En route to customer
6. **Out for Delivery** - Final delivery stage
7. **Delivered** - Successfully delivered

**Tracking Methods**
1. **Authenticated Users**:
   - View all orders in "My Orders" tab
   - Automatic display, no input needed
   - Sorted by date (newest first)

2. **Guest Users**:
   - Enter order number + email
   - Validation against database
   - Display matching order

**Order Data Structure**
```javascript
{
  orderNumber: string,
  status: string,
  estimatedDelivery: string,
  items: [
    {
      name: string,
      quantity: number,
      price: number
    }
  ],
  timeline: [
    {
      status: string,
      date: string,
      time: string,
      completed: boolean,
      current: boolean  // Active stage
    }
  ]
}
```

**Future Enhancements**
- Real-time tracking updates
- SMS/Email notifications
- Delivery agent contact
- Photo proof of delivery
- Return/exchange initiation

---

## Business Logic

### Launch Strategy

**Pre-Launch Phase** (Current - March 6, 2026)
- Countdown timer on homepage
- Waitlist collection
- Marketing content preparation
- Social media teasers
- WhatsApp community building

**Launch Date**: March 6, 2026, 8:00 PM WAT
- Countdown reaches zero
- Full site access unlocked
- Waitlist members receive notifications
- Special launch day discounts
- Email campaign to waitlist

**Post-Launch**
- Remove countdown
- Full e-commerce functionality
- Order fulfillment begins
- Customer support activation

### Revenue Model

**Primary Revenue Streams**
1. **Direct Sales**: Individual consumer purchases
2. **Wholesale**: Bulk orders from retailers (10+ items)
3. **Customization Premium**: Custom items (future: additional fee)
4. **Shipping Fees**: Flat ₦15 per order

**Pricing Strategy**
- Competitive base pricing for individual items
- Aggressive quantity discounts encourage bulk buying
- Customization as value-add (currently no extra charge)
- Shipping cost covers logistics

**Target Customer Mix**
- 40% Individual consumers (1-2 items)
- 30% Small bulk buyers (3-9 items)
- 30% Wholesale partners (10+ items)

### Customer Acquisition

**Channels**
1. **Organic Search**: SEO optimization for "jewelry Nigeria"
2. **Social Media**: Instagram, Facebook, WhatsApp
3. **Waitlist**: Pre-launch momentum
4. **Word of Mouth**: Referral program (future)
5. **Paid Ads**: Google, Facebook (post-launch)

**Conversion Funnel**
1. Awareness (Social media, ads)
2. Interest (Visit website, view products)
3. Consideration (Search, compare, customize)
4. Intent (Add to cart)
5. Purchase (Checkout)
6. Loyalty (Repeat purchases, referrals)

---

## Future Enhancements

### High Priority

1. **Payment Gateway Integration**
   - Paystack integration
   - Flutterwave as alternative
   - Multiple payment methods
   - Installment plans for high-value items

2. **Inventory Management**
   - Real-time stock tracking
   - Low stock alerts
   - Out-of-stock handling
   - Restock notifications

3. **Product Reviews & Ratings**
   - Customer reviews
   - 5-star rating system
   - Photo uploads in reviews
   - Verified purchase badges

4. **Wishlist Functionality**
   - Save favorite items
   - Share wishlist
   - Price drop alerts
   - Move to cart

5. **Advanced Search & Filters**
   - Price range filter
   - Material filter (Gold, Silver, Platinum)
   - Gemstone type filter
   - Sort by (price, popularity, newest)

### Medium Priority

6. **Email Notifications**
   - Order confirmation
   - Shipping updates
   - Delivery confirmation
   - Abandoned cart recovery

7. **Admin Dashboard**
   - Order management
   - Inventory control
   - Waitlist viewer
   - Analytics dashboard
   - Customer management

8. **Mobile App**
   - iOS app
   - Android app
   - Push notifications
   - Mobile-first features

9. **Loyalty Program**
   - Points for purchases
   - Referral rewards
   - Birthday discounts
   - VIP tiers

10. **Live Chat Support**
    - Real-time customer support
    - Chatbot for FAQs
    - WhatsApp Business integration

### Low Priority

11. **Virtual Try-On**
    - AR technology for rings/bracelets
    - Photo upload + overlay
    - Size recommendation

12. **Gift Registry**
    - Wedding registry
    - Anniversary registry
    - Shareable registry links

13. **Subscription Service**
    - Monthly jewelry box
    - Curated collections
    - Exclusive designs

14. **Blog & Content**
    - Jewelry care tips
    - Style guides
    - Trend articles
    - SEO content

15. **Multi-Language Support**
    - English (default)
    - Yoruba
    - Igbo
    - Hausa

---

## Analytics & Metrics

### Key Performance Indicators (KPIs)

**E-Commerce Metrics**
- Conversion Rate: (Orders / Visitors) × 100
- Average Order Value (AOV): Total Revenue / Number of Orders
- Cart Abandonment Rate: (Carts Created - Completed Orders) / Carts Created
- Customer Lifetime Value (CLV): Average purchase frequency × AOV
- Return Customer Rate: Repeat Customers / Total Customers

**Product Metrics**
- Most viewed products
- Most purchased products
- Category performance
- Customization adoption rate
- Average items per order

**User Metrics**
- New vs. returning visitors
- Registration conversion rate
- Waitlist conversion rate
- Profile completion rate
- Order tracking usage

**Technical Metrics**
- Page load time
- Mobile vs. desktop traffic
- Browser compatibility
- Error rates
- API response times

### Recommended Tools
- **Google Analytics 4**: User behavior tracking
- **Hotjar**: Heatmaps and session recordings
- **Mixpanel**: Product analytics
- **Sentry**: Error monitoring
- **MongoDB Atlas Monitoring**: Database performance

---

## Security Considerations

### Current Implementation
1. **Authentication**:
   - JWT with short expiry (1 day)
   - Refresh tokens (30 days)
   - HttpOnly cookies (XSS protection)

2. **Password Security**:
   - bcrypt hashing (salt rounds: 10)
   - Minimum 6 characters
   - No plain text storage

3. **CORS Protection**:
   - Whitelist specific origins
   - Credentials required
   - Pre-flight options handling

4. **Input Validation**:
   - Email regex validation
   - Required field enforcement
   - Mongoose schema validation

### Recommended Additions
1. **Rate Limiting**: Prevent brute force attacks
2. **HTTPS Only**: SSL certificate for production
3. **Input Sanitization**: Prevent XSS/injection
4. **CSRF Tokens**: Cross-site request forgery protection
5. **Two-Factor Authentication**: Optional 2FA for accounts
6. **PCI Compliance**: When payment gateway integrated
7. **Data Encryption**: Encrypt sensitive data at rest
8. **Audit Logging**: Track admin actions
9. **Regular Updates**: Keep dependencies updated
10. **Penetration Testing**: Periodic security audits

---

## Deployment Guide

### Development Environment
```bash
# Backend
cd /path/to/NINO
npm install
npm run dev  # Runs nodemon server.js on port 5000

# Frontend
cd client
npm install
npm start    # Runs CRA dev server on port 3000
```

### Production Deployment
```bash
# Build frontend
cd client
npm run build

# Build output: client/build/

# Start production server
cd ..
npm start    # Runs node server.js
```

### Environment Variables
```
# Required
MONGO_URI=mongodb+srv://...
JWT_SECRET=your-secret-key
REFRESH_SECRET=your-refresh-secret

# Optional
NODE_ENV=production|staging|development
PORT=5000
CLIENT_ORIGIN=https://www.ninohub.com,https://staging.ninohub.com
```

### Production Checklist
- [ ] Set NODE_ENV=production
- [ ] Configure MONGO_URI to production database
- [ ] Generate strong JWT_SECRET and REFRESH_SECRET
- [ ] Build React app (`npm run build` in client/)
- [ ] Configure domain DNS
- [ ] Set up SSL certificate
- [ ] Configure CORS for production domain
- [ ] Set up monitoring (error tracking, analytics)
- [ ] Configure backup strategy
- [ ] Test payment gateway in production
- [ ] Set up email service
- [ ] Configure CDN for static assets (optional)

---

## Support & Maintenance

### Customer Support Channels
1. **Phone**: +234 915 576 6040 (Mon-Sat: 8:30AM - 5:30PM)
2. **Email**: support@ninohub.com
3. **WhatsApp**: Business account linked
4. **Contact Form**: On-site form submission
5. **Social Media**: Instagram, Facebook DMs

### Maintenance Windows
- Scheduled: Sunday 2:00 AM - 4:00 AM WAT
- Emergency: As needed with user notification

### Backup Strategy
- **Database**: Daily automated backups (MongoDB Atlas)
- **User Uploads**: Cloud storage with versioning
- **Code**: Git version control
- **Retention**: 30 days rolling backups

### Monitoring
- **Uptime**: 99.9% SLA target
- **Response Time**: < 2 seconds average
- **Error Rate**: < 0.1% target
- **Database**: Monitor connections, query performance

---

## Glossary

**AOV**: Average Order Value - Total revenue divided by number of orders

**Base Price**: Original price before quantity discounts

**Customization**: Personalization of jewelry with text, images, videos, or audio

**Discount Tier**: Quantity threshold that triggers a specific discount percentage

**HttpOnly Cookie**: Cookie that cannot be accessed via JavaScript (security feature)

**JWT**: JSON Web Token - Authentication token format

**Pre-Launch**: Period before official product launch (countdown phase)

**Redux**: State management library for React

**SKU**: Stock Keeping Unit - Unique product identifier

**Unit Price**: Price per item after discounts applied

**Waitlist**: List of users who registered before launch

---

## Appendix

### API Reference

**User Endpoints**
```
POST   /api/users/register
Body: { name, email, password }
Response: { user object, token }

POST   /api/users/login
Body: { email, password }
Response: { user object, token }

GET    /api/users/logout
Response: { message }

GET    /api/users/getuser
Headers: { Cookie: token }
Response: { user object }

PATCH  /api/users/updateuser
Headers: { Cookie: token }
Body: { name?, phone?, bio? }
Response: { updated user object }

PATCH  /api/users/changepassword
Headers: { Cookie: token }
Body: { oldPassword, newPassword }
Response: { message }
```

**Waitlist Endpoints**
```
POST   /api/waitlist/join
Body: { name, phone, email? }
Response: { message, waitlist entry }

GET    /api/waitlist/
Response: { waitlist array }

PATCH  /api/waitlist/:id/status
Body: { status: 'pending'|'contacted'|'converted' }
Response: { updated entry }
```

### Database Schema

**User Model**
```javascript
{
  name: String (required),
  email: String (required, unique),
  password: String (required, hashed),
  photo: String (default: avatar URL),
  phone: String (default: "+234"),
  bio: String (max 250 chars),
  refreshToken: String,
  createdAt: Date,
  updatedAt: Date
}
```

**Waitlist Model**
```javascript
{
  name: String (required),
  phone: String (required),
  email: String (optional),
  status: String (enum: pending, contacted, converted),
  createdAt: Date,
  updatedAt: Date
}
```

### Product Categories & Count

- **Rings**: 34 products (20 customizable, 14 standard)
- **Necklaces**: 28 products (various styles)
- **Bracelets**: 20 products (tennis, charm, bangles)
- **Earrings**: 18 products (studs, hoops, drops)
- **Total**: 100+ products

### Contact Information

**Business Location**
Lafe Junction Bus Shelter
Akure, Ondo State
Nigeria

**Phone Numbers**
+234 915 576 6040 (Primary)
+234 915 576 6040 (Secondary)

**Business Hours**
Monday - Saturday: 8:30 AM - 5:30 PM WAT
Sunday: Closed

**Website**
https://www.ninohub.com

---

**Document Version**: 1.0  
**Last Updated**: February 16, 2026  
**Prepared For**: Product Management Team  
**Prepared By**: Technical Documentation Team
