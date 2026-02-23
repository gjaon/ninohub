import React from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import useCartSocket from "../hooks/useCartSocket";
import { getProductImageUrl } from "../utils/image";
import "./ProductCard.css";

const ProductCard = ({ product }) => {
  const navigate = useNavigate();
  const { addToCartSocket } = useCartSocket();

  const handleAddToCart = (e) => {
    e.stopPropagation();
    // Only emit to socket - let socket response update Redux
    addToCartSocket(product, 1);
    toast.success("Product added to cart!");
  };

  const handleCardClick = () => {
    navigate(`/products/${product.id}`);
  };

  return (
    <div className="product-card" onClick={handleCardClick}>
      <div className="product-card-image">
        {product.image ? (
          <img src={getProductImageUrl(product.image)} alt={product.name} />
        ) : (
          <span>{product.category}</span>
        )}
      </div>

      <div className="product-card-content">
        <h3>{product.name}</h3>
        <p className="product-card-category">{product.category}</p>
        <p className="product-card-description">{product.description}</p>

        <div className="product-card-footer">
          <span className="product-card-price">
            ₦{product.price.toLocaleString()}
          </span>
          <button className="add-to-cart-btn" onClick={handleAddToCart}>
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductCard;
