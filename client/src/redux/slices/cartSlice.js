import { createSlice } from "@reduxjs/toolkit";
import { calculatePrice, getProductDiscountPercent } from "../../utils/pricing";

const cloneCartSnapshot = (state) => ({
  cartId: state.cartId,
  items: JSON.parse(JSON.stringify(state.items || [])),
  customizations: JSON.parse(JSON.stringify(state.customizations || [])),
  totalQuantity: state.totalQuantity,
  totalAmount: state.totalAmount,
  totalPrice: state.totalPrice,
  reservationExpiry: state.reservationExpiry,
  reservationStatus: state.reservationStatus,
  remainingTime: state.remainingTime,
  isExpired: state.isExpired,
});

const restoreCartSnapshot = (state, snapshot = {}) => {
  state.cartId = snapshot.cartId || null;
  state.items = Array.isArray(snapshot.items) ? snapshot.items : [];
  state.customizations = Array.isArray(snapshot.customizations) ? snapshot.customizations : [];
  state.totalQuantity = Number(snapshot.totalQuantity || 0);
  state.totalAmount = Number(snapshot.totalAmount || 0);
  state.totalPrice = Number(snapshot.totalPrice || 0);
  state.reservationExpiry = snapshot.reservationExpiry || null;
  state.reservationStatus = snapshot.reservationStatus || "active";
  state.remainingTime = Number(snapshot.remainingTime || 0);
  state.isExpired = Boolean(snapshot.isExpired);
};

const resetOptimisticState = (state) => {
  state.optimistic = {
    pendingByOperationId: {},
    operationOrder: [],
  };
};

const initialState = {
  cartId: null,
  items: [],
  customizations: [],
  totalQuantity: 0,
  totalAmount: 0,
  totalPrice: 0,
  reservationExpiry: null,
  reservationStatus: "active",
  remainingTime: 0,
  isExpired: false,
  optimistic: {
    pendingByOperationId: {},
    operationOrder: [],
  },
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
      state.cartId = null;
      state.items = [];
      state.customizations = [];
      state.totalQuantity = 0;
      state.totalAmount = 0;
      state.totalPrice = 0;
      state.reservationExpiry = null;
      state.reservationStatus = "active";
      state.remainingTime = 0;
      state.isExpired = false;
      resetOptimisticState(state);
    },
    markExpired: (state) => {
      state.isExpired = true;
      state.reservationStatus = "expired";
      state.remainingTime = 0;
    },
    // Sync cart from backend
    syncCart: (state, action) => {
      const backendCart = action.payload;
      state.cartId = backendCart?._id || backendCart?.id || null;
      
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
      resetOptimisticState(state);
    },
    // Update cart from WebSocket
    updateCartFromSocket: (state, action) => {
      const backendCart = action.payload;
      state.cartId = backendCart?._id || backendCart?.id || null;
      
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
      resetOptimisticState(state);
    },
    beginOptimisticOperation: (state, action) => {
      const operationId = String(action.payload?.operationId || "").trim();
      if (!operationId || state.optimistic.pendingByOperationId[operationId]) {
        return;
      }

      state.optimistic.pendingByOperationId[operationId] = cloneCartSnapshot(state);
      state.optimistic.operationOrder.push(operationId);
    },
    rollbackOptimisticOperation: (state, action) => {
      const requestedOperationId = String(action.payload?.operationId || "").trim();
      const fallbackOperationId = state.optimistic.operationOrder[state.optimistic.operationOrder.length - 1] || "";
      const operationId = requestedOperationId || fallbackOperationId;

      if (!operationId) {
        return;
      }

      const snapshot = state.optimistic.pendingByOperationId[operationId];
      if (!snapshot) {
        return;
      }

      restoreCartSnapshot(state, snapshot);
      delete state.optimistic.pendingByOperationId[operationId];
      state.optimistic.operationOrder = state.optimistic.operationOrder.filter((entry) => entry !== operationId);
    },
    commitOptimisticOperation: (state, action) => {
      const requestedOperationId = String(action.payload?.operationId || "").trim();
      const fallbackOperationId = state.optimistic.operationOrder[0] || "";
      const operationId = requestedOperationId || fallbackOperationId;

      if (!operationId) {
        return;
      }

      delete state.optimistic.pendingByOperationId[operationId];
      state.optimistic.operationOrder = state.optimistic.operationOrder.filter((entry) => entry !== operationId);
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

export const {
  addToCart,
  removeFromCart,
  updateQuantity,
  clearCart,
  markExpired,
  syncCart,
  updateCartFromSocket,
  beginOptimisticOperation,
  rollbackOptimisticOperation,
  commitOptimisticOperation,
  addCustomization,
  removeCustomization,
} =
  cartSlice.actions;
export default cartSlice.reducer;
