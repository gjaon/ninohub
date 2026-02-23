import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { getSocket } from "../services/socket";
import { updateCartFromSocket } from "../redux/slices/cartSlice";

export const useCartSocket = () => {
  const dispatch = useDispatch();
  const socket = getSocket();

  const addToCartSocket = (product, quantity = 1) => {
    if (socket) {
      socket.emit("cart:add", {
        product: {
          id: product.id,
          name: product.name,
          price: product.price,
          image: product.image,
        },
        quantity,
      });
    }
  };

  const removeFromCartSocket = (productId) => {
    if (socket) {
      socket.emit("cart:remove", { productId });
    }
  };

  const updateQuantitySocket = (productId, quantity) => {
    if (socket) {
      socket.emit("cart:updateQuantity", { productId, quantity });
    }
  };

  const addCustomizationSocket = (customization) => {
    if (socket) {
      socket.emit("cart:addCustomization", { customization });
    }
  };

  const syncCartSocket = () => {
    if (socket) {
      socket.emit("cart:sync", { sessionId: localStorage.getItem("sessionId") });
    }
  };

  return {
    addToCartSocket,
    removeFromCartSocket,
    updateQuantitySocket,
    addCustomizationSocket,
    syncCartSocket,
  };
};

export default useCartSocket;
