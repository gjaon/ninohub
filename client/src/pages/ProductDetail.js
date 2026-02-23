import React, { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { toast } from "sonner";
import { startCustomization } from "../redux/slices/customizationSlice";
import { calculatePrice, getDiscountInfo } from "../utils/pricing";
import useCartSocket from "../hooks/useCartSocket";
import { getProductImageUrl } from "../utils/image";
import ImageZoom from "../components/ImageZoom";
import "./ProductDetail.css";

const ProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { items: products, loading: productsLoading } = useSelector(
    (state) => state.products
  );
  const product = products.find((p) => p.id === parseInt(id));
  const [quantity, setQuantity] = useState(1);
  const { addToCartSocket } = useCartSocket();

  // Calculate pricing based on quantity
  const pricing = useMemo(() => {
    if (!product) return null;
    return calculatePrice(product.price, quantity);
  }, [product, quantity]);

  const discountInfo = useMemo(() => {
    return getDiscountInfo(quantity);
  }, [quantity]);

  if (!product && productsLoading) {
    return (
      <div className="product-detail">
        <h2>Loading product...</h2>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="product-detail">
        <h2>Product not found</h2>
        <button onClick={() => navigate("/products")}>Back to Products</button>
      </div>
    );
  }

  const handleAddToCart = () => {
    // Only emit to socket - let socket response update Redux
    addToCartSocket(product, quantity);
    toast.success(
      `${quantity} ${quantity > 1 ? "items" : "item"} added to cart!`
    );
  };

  const handleCustomize = () => {
    if (product.customizable) {
      dispatch(startCustomization(product));
      navigate("/customization/create");
    } else {
      toast.info("This item is not customizable");
    }
  };

  return (
    <div className="product-detail">
      <button className="back-btn" onClick={() => navigate("/products")}>
        ← Back to Products
      </button>

      <div className="product-detail-content">
        <div className="product-image-section">
          {product.image ? (
            <ImageZoom
              src={getProductImageUrl(product.image)}
              alt={product.name}
              zoomLevel={3.5}
            />
          ) : (
            <div className="product-image-placeholder">
              <span>{product.category}</span>
            </div>
          )}
        </div>

        <div className="product-info-section">
          <h1>{product.name}</h1>
          <p className="product-category">{product.category}</p>

          <div className="pricing-section">
            <p className="product-price">
              {pricing.discountPercent > 0 ? (
                <>
                  <span className="original-price">
                    ₦{product.price.toLocaleString()}
                  </span>
                  <span className="discounted-price">
                    ₦{Math.round(pricing.unitPrice).toLocaleString()}
                  </span>
                  <span className="discount-badge">
                    {pricing.discountPercent}% OFF
                  </span>
                </>
              ) : (
                <span>₦{product.price.toLocaleString()}</span>
              )}
            </p>
            {quantity > 1 && (
              <p className="total-price-display">
                Total:{" "}
                <strong>
                  ₦{Math.round(pricing.totalPrice).toLocaleString()}
                </strong>
              </p>
            )}
          </div>

          <div className="product-description">
            <h3>Description</h3>
            <p>{product.description}</p>
          </div>

          <div className="product-details">
            <h3>Details</h3>
            <ul>
              <li>
                <strong>Material:</strong> {product.material || "Premium Metal"}
              </li>
              <li>
                <strong>Weight:</strong> {product.weight || "N/A"}
              </li>
              <li>
                <strong>SKU:</strong> {product.sku || `JWL-${product.id}`}
              </li>
            </ul>
          </div>

          <div className="discount-tiers">
            <h4>Bulk Discounts Available:</h4>
            <ul>
              {discountInfo.allTiers.map((tier, index) => (
                <li
                  key={index}
                  className={
                    discountInfo.currentTier?.min === tier.min
                      ? "active-tier"
                      : ""
                  }
                >
                  {tier.label}
                </li>
              ))}
            </ul>
            {discountInfo.nextTier && (
              <p className="next-discount-hint">
                Add {discountInfo.nextTier.min - quantity} more to get{" "}
                {discountInfo.nextTier.discount}% off!
              </p>
            )}
          </div>

          <div className="quantity-selector">
            <label>Quantity:</label>
            <div className="quantity-controls">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))}>
                -
              </button>
              <input
                type="number"
                value={quantity}
                onChange={(e) =>
                  setQuantity(Math.max(1, parseInt(e.target.value) || 1))
                }
                min="1"
              />
              <button onClick={() => setQuantity(quantity + 1)}>+</button>
            </div>
          </div>

          <div className="product-actions">
            <button className="btn-add-cart" onClick={handleAddToCart}>
              Add to Cart
            </button>
            <button
              className={`btn-customize ${
                !product.customizable ? "disabled" : ""
              }`}
              onClick={handleCustomize}
              disabled={!product.customizable}
              title={
                !product.customizable
                  ? "Not Customizable"
                  : "Customize This Item"
              }
            >
              Customize This Item
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetail;
