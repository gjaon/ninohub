import React from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import useCartSocket from "../hooks/useCartSocket";
import { getProductImageUrl } from "../utils/image";
import { getProductDiscountPercent } from "../utils/pricing";
import "./ProductCard.css";

const ProductCard = ({ product }) => {
  const navigate = useNavigate();
  const { addToCartSocket } = useCartSocket();
  const displayImage =
    product.primaryImage
    || product.selectedImage
    || (Array.isArray(product.images) ? product.images[0] : "")
    || product.image;
  const productDiscountPercent = getProductDiscountPercent(product);
  const listingTitle = product.listingType === "group"
    ? (product.groupName || product.name)
    : product.name;

  const handleAddToCart = (e) => {
    e.stopPropagation();
    if (product.listingType === "group" && Array.isArray(product.variants) && product.variants.length > 0) {
      navigate(`/products/${product.id}`, {
        state: { scrollToVariants: true },
      });
      toast.info("Please select a variant before adding to cart");
      return;
    }
    // Only emit to socket - let socket response update Redux
    const sent = addToCartSocket(product, 1, (result) => {
      if (result?.ok) {
        toast.success("Product added to cart!");
        return;
      }

      toast.error(result?.message || "Unable to add product to cart. Please try again.");
    });
    if (sent) {
      return;
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

        <div className="product-card-footer">
          <div className="product-card-pricing">
            <span className="product-card-price">₦{product.price.toLocaleString()}</span>
            {/* {!hasIntrinsicDiscount && starterDiscount.discountPercent > 0 && (
              <span className="product-card-discount-note">
                Buy 3+ for ₦{starterDiscount.unitPrice.toLocaleString()} each
              </span>
            )} */}
          </div>
          <button className="add-to-cart-btn" onClick={handleAddToCart}>
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductCard;
