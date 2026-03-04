import { getSocket, initializeSocket } from "../services/socket";

export const useCartSocket = () => {
  const resolveSocket = () => getSocket() || initializeSocket();

  const addToCartSocket = (product, quantity = 1, onResult) => {
    const socket = resolveSocket();
    if (socket && socket.connected) {
      socket.emit("cart:add", {
        product: {
          id: product.id,
          name: product.name,
          price: product.price,
          image: product.image,
          selectedImage: product.selectedImage || product.image,
          listingId: product.listingId || product.parentGroupId || product.id,
          listingType: product.listingType || "single",
          variantId: product.variantId || null,
          variantName: product.variantName || null,
          parentGroupId: product.parentGroupId || null,
          groupName: product.groupName || null,
          originalPrice: Number(product.originalPrice || product.price || 0),
          discountPercent: Number(product.discountPercent || 0),
        },
        quantity,
      }, (response = {}) => {
        if (typeof onResult === "function") {
          onResult(response);
        }
      });
      return true;
    }

    if (typeof onResult === "function") {
      onResult({ ok: false, message: "Connection unavailable. Please retry." });
    }

    return false;
  };

  const removeFromCartSocket = (lineKey, productId, variantId = null) => {
    const socket = resolveSocket();
    if (socket) {
      socket.emit("cart:remove", {
        lineKey,
        productId,
        variantId,
      });
      return true;
    }

    return false;
  };

  const updateQuantitySocket = (lineKey, quantity, productId, variantId = null) => {
    const socket = resolveSocket();
    if (socket) {
      socket.emit("cart:updateQuantity", {
        lineKey,
        productId,
        variantId,
        quantity,
      });
      return true;
    }

    return false;
  };

  const updateVariantSocket = ({
    lineKey,
    productId,
    currentVariantId = null,
    nextVariantId,
    nextVariantName,
    nextPrice,
    nextImage,
  }) => {
    const socket = resolveSocket();
    if (socket) {
      socket.emit("cart:updateVariant", {
        current: {
          lineKey,
          productId,
          variantId: currentVariantId,
        },
        nextVariantId,
        nextVariantName,
        nextPrice,
        nextImage,
      });
      return true;
    }

    return false;
  };

  const addCustomizationSocket = (customization) => {
    const socket = resolveSocket();
    if (socket) {
      socket.emit("cart:addCustomization", { customization });
      return true;
    }

    return false;
  };

  const syncCartSocket = () => {
    const socket = resolveSocket();
    if (socket) {
      socket.emit("cart:sync", { sessionId: localStorage.getItem("sessionId") });
      return true;
    }

    return false;
  };

  return {
    addToCartSocket,
    removeFromCartSocket,
    updateQuantitySocket,
    updateVariantSocket,
    addCustomizationSocket,
    syncCartSocket,
  };
};

export default useCartSocket;
