import { createSlice } from "@reduxjs/toolkit";
import { calculatePrice, getProductDiscountPercent } from "../../utils/pricing";

const initialState = {
  items: [],
  customizations: [],
  totalQuantity: 0,
  totalAmount: 0,
  totalPrice: 0,
  reservationExpiry: null,
  reservationStatus: "active",
  remainingTime: 0,
  isExpired: false,
};

const cartSlice = createSlice({
  name: "cart",
  initialState,
  reducers: {
    addToCart: (state, action) => {
      const intrinsicDiscountPercent = getProductDiscountPercent(action.payload);
      const disableBulkDiscount = intrinsicDiscountPercent > 0;
      const existingItem = state.items.find(
        (item) => item.id === action.payload.id
      );

      if (existingItem) {
        existingItem.quantity += action.payload.quantity || 1;
        const pricing = calculatePrice(
          existingItem.basePrice,
          existingItem.quantity,
          {
            disableBulkDiscount: Number(existingItem.intrinsicDiscountPercent || 0) > 0,
          }
        );
        existingItem.unitPrice = pricing.unitPrice;
        existingItem.totalPrice = pricing.totalPrice;
        existingItem.discountPercent = pricing.discountPercent;
      } else {
        const qty = action.payload.quantity || 1;
        const pricing = calculatePrice(action.payload.price, qty, {
          disableBulkDiscount,
        });
        state.items.push({
          ...action.payload,
          quantity: qty,
          basePrice: action.payload.price,
          originalPrice: Number(action.payload.originalPrice || action.payload.price || 0),
          intrinsicDiscountPercent,
          unitPrice: pricing.unitPrice,
          totalPrice: pricing.totalPrice,
          discountPercent: pricing.discountPercent,
        });
      }

      state.totalQuantity = state.items.reduce(
        (total, item) => total + item.quantity,
        0
      );
      state.totalAmount = state.items.reduce(
        (total, item) => total + item.totalPrice,
        0
      );
    },
    removeFromCart: (state, action) => {
      state.items = state.items.filter((item) => item.id !== action.payload);
      state.totalQuantity = state.items.reduce(
        (total, item) => total + item.quantity,
        0
      );
      state.totalAmount = state.items.reduce(
        (total, item) => total + item.totalPrice,
        0
      );
    },
    updateQuantity: (state, action) => {
      const { id, quantity } = action.payload;
      const item = state.items.find((item) => item.id === id);

      if (item) {
        item.quantity = quantity;
        const pricing = calculatePrice(item.basePrice, quantity, {
          disableBulkDiscount: Number(item.intrinsicDiscountPercent || 0) > 0,
        });
        item.unitPrice = pricing.unitPrice;
        item.totalPrice = pricing.totalPrice;
        item.discountPercent = pricing.discountPercent;
      }

      state.totalQuantity = state.items.reduce(
        (total, item) => total + item.quantity,
        0
      );
      state.totalAmount = state.items.reduce(
        (total, item) => total + item.totalPrice,
        0
      );
    },
    clearCart: (state) => {
      state.items = [];
      state.customizations = [];
      state.totalQuantity = 0;
      state.totalAmount = 0;
      state.totalPrice = 0;
      state.reservationExpiry = null;
      state.reservationStatus = "active";
      state.remainingTime = 0;
      state.isExpired = false;
    },
    markExpired: (state) => {
      state.isExpired = true;
      state.reservationStatus = "expired";
      state.remainingTime = 0;
    },
    // Sync cart from backend
    syncCart: (state, action) => {
      const backendCart = action.payload;
      
      // Transform backend cart items to frontend format with pricing calculations
      state.items = (backendCart.items || []).map(item => {
        const intrinsicDiscountPercent = getProductDiscountPercent({
          price: item.price,
          originalPrice: item.originalPrice,
          discountPercent: item.intrinsicDiscountPercent,
        });
        const pricing = calculatePrice(item.price, item.quantity, {
          disableBulkDiscount: intrinsicDiscountPercent > 0,
        });
        const lineKey = item.lineKey || `${item.productId || ""}::${item.variantId || ""}`;
        return {
          id: lineKey,
          lineKey,
          productId: item.productId,
          listingId: item.listingId || item.parentGroupId || item.productId || null,
          name: item.productName,
          price: item.price,
          quantity: item.quantity,
          image: item.image,
          selectedImage: item.selectedImage || item.image,
          variantId: item.variantId || null,
          variantName: item.variantName || null,
          parentGroupId: item.parentGroupId || null,
          groupName: item.groupName || null,
          basePrice: item.price,
          originalPrice: Number(item.originalPrice || item.price || 0),
          intrinsicDiscountPercent,
          unitPrice: pricing.unitPrice,
          totalPrice: pricing.totalPrice,
          discountPercent: pricing.discountPercent,
          category: item.category || "",
          isCustom: item.isCustom || false,
        };
      });
      
      state.customizations = backendCart.customizations || [];
      state.totalQuantity = state.items.reduce(
        (total, item) => total + item.quantity,
        0
      );
      state.totalAmount = state.items.reduce(
        (total, item) => total + item.totalPrice,
        0
      );
      
      // Update reservation data
      state.reservationExpiry = backendCart.reservationExpiry || null;
      state.reservationStatus = backendCart.reservationStatus || "active";
      state.remainingTime = backendCart.remainingTime || 0;
      state.isExpired = backendCart.reservationStatus === "expired";
    },
    // Update cart from WebSocket
    updateCartFromSocket: (state, action) => {
      const backendCart = action.payload;
      
      // Transform backend cart items to frontend format with pricing calculations
      state.items = (backendCart.items || []).map(item => {
        const intrinsicDiscountPercent = getProductDiscountPercent({
          price: item.price,
          originalPrice: item.originalPrice,
          discountPercent: item.intrinsicDiscountPercent,
        });
        const pricing = calculatePrice(item.price, item.quantity, {
          disableBulkDiscount: intrinsicDiscountPercent > 0,
        });
        const lineKey = item.lineKey || `${item.productId || ""}::${item.variantId || ""}`;
        return {
          id: lineKey,
          lineKey,
          productId: item.productId,
          listingId: item.listingId || item.parentGroupId || item.productId || null,
          name: item.productName,
          price: item.price,
          quantity: item.quantity,
          image: item.image,
          selectedImage: item.selectedImage || item.image,
          variantId: item.variantId || null,
          variantName: item.variantName || null,
          parentGroupId: item.parentGroupId || null,
          groupName: item.groupName || null,
          basePrice: item.price,
          originalPrice: Number(item.originalPrice || item.price || 0),
          intrinsicDiscountPercent,
          unitPrice: pricing.unitPrice,
          totalPrice: pricing.totalPrice,
          discountPercent: pricing.discountPercent,
          category: item.category || "",
          isCustom: item.isCustom || false,
        };
      });
      
      state.customizations = backendCart.customizations || [];
      state.totalQuantity = state.items.reduce(
        (total, item) => total + item.quantity,
        0
      );
      state.totalAmount = state.items.reduce(
        (total, item) => total + item.totalPrice,
        0
      );
      
      // Update reservation data
      state.reservationExpiry = backendCart.reservationExpiry || null;
      state.reservationStatus = backendCart.reservationStatus || "active";
      state.remainingTime = backendCart.remainingTime || 0;
      state.isExpired = backendCart.reservationStatus === "expired";
    },
    addCustomization: (state, action) => {
      state.customizations.push(action.payload);
      state.totalQuantity = state.items.reduce((total, item) => total + item.quantity, 0) +
                           state.customizations.reduce((total, c) => total + (c.quantity || 1), 0);
      state.totalPrice = state.items.reduce((total, item) => total + (item.price * item.quantity), 0) +
                         state.customizations.reduce((total, c) => total + (c.price * (c.quantity || 1)), 0);
    },
    removeCustomization: (state, action) => {
      state.customizations = state.customizations.filter(
        (c) => c.customizationId !== action.payload
      );
      state.totalQuantity = state.items.reduce((total, item) => total + item.quantity, 0) +
                           state.customizations.reduce((total, c) => total + (c.quantity || 1), 0);
      state.totalPrice = state.items.reduce((total, item) => total + (item.price * item.quantity), 0) +
                         state.customizations.reduce((total, c) => total + (c.price * (c.quantity || 1)), 0);
    },
  },
});

export const { addToCart, removeFromCart, updateQuantity, clearCart, markExpired, syncCart, updateCartFromSocket, addCustomization, removeCustomization } =
  cartSlice.actions;
export default cartSlice.reducer;
