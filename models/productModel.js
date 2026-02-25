const mongoose = require("mongoose");

const reservationSchema = mongoose.Schema({
  cartId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Cart",
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  sessionId: {
    type: String,
    default: null,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ["active", "checkout", "expired", "completed"],
    default: "active",
  },
}, {
  timestamps: true,
});

const productSchema = mongoose.Schema(
  {
    productId: {
      type: String,
      required: true,
      unique: true,
    },
    totalStock: {
      type: Number,
      default: 100,
    },
    availableStock: {
      type: Number,
      default: 100,
    },
    reservedStock: {
      type: Number,
      default: 0,
    },
    reservations: [reservationSchema],
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
productSchema.index({ productId: 1 });

// Method to get available quantity
productSchema.methods.getAvailableQuantity = function() {
  return this.totalStock - this.reservedStock;
};

// Method to reserve quantity
productSchema.methods.reserveQuantity = async function(cartId, userId, sessionId, quantity, expiryMinutes = 5) {
  const availableQty = this.getAvailableQuantity();
  
  if (availableQty < quantity) {
    throw new Error(`Only ${availableQty} items available for this product`);
  }

  // Check if reservation already exists for this cart
  const existingReservation = this.reservations.find(
    r => r.cartId.toString() === cartId.toString() && r.status === "active"
  );

  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  if (existingReservation) {
    // Update existing reservation
    this.reservedStock -= existingReservation.quantity;
    existingReservation.quantity = quantity;
    existingReservation.expiresAt = expiresAt;
    this.reservedStock += quantity;
  } else {
    // Create new reservation
    this.reservations.push({
      cartId,
      userId,
      sessionId,
      quantity,
      expiresAt,
      status: "active",
    });
    this.reservedStock += quantity;
  }

  this.availableStock = this.totalStock - this.reservedStock;
  await this.save();
  return this;
};

// Method to release reservation
productSchema.methods.releaseReservation = async function(cartId) {
  const reservationIndex = this.reservations.findIndex(
    r => r.cartId.toString() === cartId.toString()
  );

  if (reservationIndex > -1) {
    const reservation = this.reservations[reservationIndex];
    this.reservedStock -= reservation.quantity;
    this.reservations.splice(reservationIndex, 1);
    this.availableStock = this.totalStock - this.reservedStock;
    await this.save();
  }
  
  return this;
};

// Method to update reservation to checkout status
productSchema.methods.updateReservationStatus = async function(cartId, status) {
  const reservation = this.reservations.find(
    r => r.cartId.toString() === cartId.toString()
  );

  if (reservation) {
    reservation.status = status;
    
    // If moving to checkout, extend expiry to 3 minutes
    if (status === "checkout") {
      reservation.expiresAt = new Date(Date.now() + 3 * 60 * 1000);
    }
    
    await this.save();
  }
  
  return this;
};

// Static method to clean up expired reservations
productSchema.statics.cleanupExpiredReservations = async function() {
  const now = new Date();
  const products = await this.find({
    "reservations.expiresAt": { $lt: now },
    "reservations.status": { $in: ["active", "checkout"] }
  });

  const expiredReservations = [];

  for (const product of products) {
    const expiredForProduct = product.reservations.filter(
      r => r.expiresAt < now && (r.status === "active" || r.status === "checkout")
    );

    for (const reservation of expiredForProduct) {
      product.reservedStock -= reservation.quantity;
      reservation.status = "expired";
      expiredReservations.push({
        cartId: reservation.cartId,
        productId: product.productId,
        quantity: reservation.quantity,
      });
    }

    product.availableStock = product.totalStock - product.reservedStock;
    await product.save();
  }

  return expiredReservations;
};

const Product = mongoose.model("Product", productSchema);
module.exports = Product;
