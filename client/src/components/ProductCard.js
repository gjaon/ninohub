import React from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { toast } from "sonner";
import useCartSocket from "../hooks/useCartSocket";
import {
  addToCart,
  beginOptimisticOperation,
  rollbackOptimisticOperation,
} from "../redux/slices/cartSlice";
import { marketplaceRealtimeFlags } from "../config/marketplaceRealtimeFlags";
import { getProductImageUrl } from "../utils/image";
import { getProductDiscountPercent } from "../utils/pricing";
import "./ProductCard.css";

const ProductCard = ({ product }) => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { addToCartSocket } = useCartSocket();
  const [isAdding, setIsAdding] = React.useState(false);
  const displayImage =
    product.primaryImage
    || product.selectedImage
    || (Array.isArray(product.images) ? product.images[0] : "")
    || product.image;
  const productDiscountPercent = getProductDiscountPercent(product);
  const listingTitle = product.listingType === "group"
    ? (product.groupName || product.name)
    : product.name;
  const remainingQuantity = Math.max(0, Number(product?.availableQuantity || 0));

  const createOperationId = React.useCallback(
    () => `cart-add-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    []
  );

  const handleAddToCart = (e) => {
    e.stopPropagation();
    if (isAdding) {
      return;
    }

    if (remainingQuantity < 1) {
      toast.error("This product is currently unavailable");
      return;
    }

    if (product.listingType === "group" && Array.isArray(product.variants) && product.variants.length > 0) {
      navigate(`/products/${product.id}`, {
        state: { scrollToVariants: true },
      });
      toast.info("Please select a variant before adding to cart");
      return;
    }
    setIsAdding(true);
    const failSafeTimer = setTimeout(() => {
      setIsAdding(false);
    }, 8000);

    const operationId = createOperationId();
    if (marketplaceRealtimeFlags.optimisticCartEnabled) {
      dispatch(beginOptimisticOperation({ operationId }));
      dispatch(
        addToCart({
          id: `${product.id || ""}::${product.variantId || ""}`,
          lineKey: `${product.id || ""}::${product.variantId || ""}`,
          productId: product.id,
          listingId: product.listingId || product.parentGroupId || product.id,
          name: product.name,
          price: Number(product.price || 0),
          image: product.image,
          selectedImage: product.selectedImage || product.image,
          variantId: product.variantId || null,
          variantName: product.variantName || null,
          parentGroupId: product.parentGroupId || null,
          groupName: product.groupName || null,
          originalPrice: Number(product.originalPrice || product.price || 0),
          discountPercent: Number(product.discountPercent || 0),
          category: product.category || "",
          quantity: 1,
        })
      );
    }

    const sent = addToCartSocket(product, 1, (result) => {
      clearTimeout(failSafeTimer);
      setIsAdding(false);

      if (result?.ok) {
        toast.success("Product added to cart!");
        return;
      }

      if (marketplaceRealtimeFlags.optimisticCartEnabled) {
        dispatch(rollbackOptimisticOperation({ operationId }));
      }

      toast.error(result?.message || "Unable to add product to cart. Please try again.");
    }, { operationId });
    if (sent) {
      return;
    }

    clearTimeout(failSafeTimer);
    setIsAdding(false);
    if (marketplaceRealtimeFlags.optimisticCartEnabled) {
      dispatch(rollbackOptimisticOperation({ operationId }));
    }
    toast.error("Unable to add product to cart. Please try again.");
  };

  const handleCardClick = () => {
    navigate(`/products/${product.id}`, {
      state: { scrollToVariants: product.listingType === "group" },
    });
  };

  return (
    <div className="product-card" onClick={handleCardClick}>
      <div className="product-card-image">
        {productDiscountPercent > 0 && (
          <span className="discount-badge">
            {`${productDiscountPercent}% OFF`}
          </span>
        )}
        {displayImage ? (
          <img src={getProductImageUrl(displayImage)} alt={listingTitle} />
        ) : (
          <span>{product.category}</span>
        )}
      </div>

      <div className="product-card-content">
        <h3>{listingTitle}</h3>
        <p className="product-card-category">{product.category}</p>
        <p className="product-card-description">{product.description}</p>
        <p className="product-card-availability">
          {remainingQuantity > 0 ? `${remainingQuantity} available` : "Out of stock"}
        </p>

        <div className="product-card-footer">
          <div className="product-card-pricing">
            <span className="product-card-price">₦{product.price.toLocaleString()}</span>
            {/* {!hasIntrinsicDiscount && starterDiscount.discountPercent > 0 && (
              <span className="product-card-discount-note">
                Buy 3+ for ₦{starterDiscount.unitPrice.toLocaleString()} each
              </span>
            )} */}
          </div>
          <button
            className="add-to-cart-btn"
            onClick={handleAddToCart}
            disabled={remainingQuantity < 1 || isAdding}
          >
            {isAdding ? "Adding..." : "Add to Cart"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductCard;
