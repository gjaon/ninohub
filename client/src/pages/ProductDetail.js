import React, { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { toast } from "sonner";
import { startCustomization } from "../redux/slices/customizationSlice";
import { calculatePrice, getProductDiscountPercent, resolveOriginalPrice } from "../utils/pricing";
import useCartSocket from "../hooks/useCartSocket";
import { getProductImageUrl } from "../utils/image";
import ImageZoom from "../components/ImageZoom";
import "./ProductDetail.css";

const collectImageValues = (value, collector = []) => {
  if (!value) {
    return collector;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const normalized = String(value).trim();
    if (normalized) {
      collector.push(normalized);
    }
    return collector;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => collectImageValues(entry, collector));
    return collector;
  }

  if (typeof value === "object") {
    ["url", "filePath", "secure_url", "src", "image"].forEach((key) => {
      collectImageValues(value?.[key], collector);
    });
  }

  return collector;
};

const normalizeImageList = (...values) => {
  const images = [];
  values.forEach((value) => collectImageValues(value, images));
  return Array.from(new Set(images.filter(Boolean)));
};

const formatVariantLabel = (value) => {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  const hyphenIndex = text.indexOf("-");
  if (hyphenIndex < 0) {
    return text;
  }

  const trimmed = text.slice(hyphenIndex + 1).trim();
  return trimmed || text;
};

const ProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const { items: products, loading: productsLoading } = useSelector(
    (state) => state.products
  );
  const product = products.find((p) => String(p.id) === String(id));
  const [quantity, setQuantity] = useState(1);
  const [variantQuantities, setVariantQuantities] = useState({});
  const [focusedVariantId, setFocusedVariantId] = useState("");
  const [selectedImage, setSelectedImage] = useState("");
  const [isMobileViewport, setIsMobileViewport] = useState(() => window.innerWidth <= 768);
  const [isMobilePreviewOpen, setIsMobilePreviewOpen] = useState(false);
  const variantSectionRef = useRef(null);
  const { addToCartSocket } = useCartSocket();
  const detailTitle = product?.listingType === "group"
    ? (product?.groupName || product?.name)
    : product?.name;

  const availableVariants = Array.isArray(product?.variants) ? product.variants : [];
  const selectedVariant =
    availableVariants.find(
      (variant) => String(variant?.variantId || variant?.id) === String(focusedVariantId)
    ) || null;
  const selectedVariantEntries = useMemo(
    () => Object.entries(variantQuantities).filter(([, qty]) => Number(qty) > 0),
    [variantQuantities]
  );
  const productAvailableQuantity = Math.max(0, Number(product?.availableQuantity || 0));
  const selectedVariantAvailableQuantity = Math.max(0, Number(selectedVariant?.availableQuantity || 0));

  useEffect(() => {
    setVariantQuantities({});
    setFocusedVariantId("");
    setQuantity(1);
    setIsMobilePreviewOpen(false);
  }, [id]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 768px)");
    const updateMatch = (event) => {
      setIsMobileViewport(event.matches);
    };

    setIsMobileViewport(media.matches);
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", updateMatch);
      return () => media.removeEventListener("change", updateMatch);
    }

    media.addListener(updateMatch);
    return () => media.removeListener(updateMatch);
  }, []);

  useEffect(() => {
    if (product?.listingType !== "group" || !availableVariants.length) {
      return;
    }

    if (!location.state?.scrollToVariants) {
      return;
    }

    const timer = setTimeout(() => {
      if (variantSectionRef.current) {
        variantSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [location.state, product?.listingType, availableVariants.length]);

  const productImages = useMemo(() => {
    if (!product) return [];
    return normalizeImageList(
      product.images,
      product.primaryImage,
      product.selectedImage,
      product.image
    );
  }, [product]);

  const selectedVariantImages = useMemo(() => {
    if (!selectedVariant) return [];
    return normalizeImageList(
      selectedVariant.images,
      selectedVariant.image,
      selectedVariant.imageUrl
    );
  }, [selectedVariant]);

  const allVariantImages = useMemo(() => {
    if (!availableVariants.length) return [];
    return normalizeImageList(
      availableVariants.map((variant) => [variant?.images, variant?.image, variant?.imageUrl])
    );
  }, [availableVariants]);

  const galleryImages = useMemo(() => {
    if (selectedVariantImages.length) {
      return Array.from(new Set([...selectedVariantImages, ...productImages]));
    }
    if (product?.listingType === "group" && allVariantImages.length) {
      return Array.from(new Set([...productImages, ...allVariantImages]));
    }
    return productImages;
  }, [allVariantImages, product?.listingType, productImages, selectedVariantImages]);

  useEffect(() => {
    if (!galleryImages.length) {
      setSelectedImage("");
      return;
    }

    setSelectedImage((current) => {
      if (current && galleryImages.includes(current)) {
        return current;
      }
      return galleryImages[0];
    });
  }, [galleryImages]);

  useEffect(() => {
    if (selectedVariantImages.length) {
      setSelectedImage(selectedVariantImages[0]);
    }
  }, [selectedVariantImages]);

  const productDiscountPercent = useMemo(() => getProductDiscountPercent(product), [product]);
  const selectedVariantDiscountPercent = useMemo(
    () => getProductDiscountPercent(selectedVariant),
    [selectedVariant]
  );
  const intrinsicDiscountPercent = selectedVariantDiscountPercent || productDiscountPercent;
  const originalPrice = Number(
    resolveOriginalPrice(selectedVariant || product)
    || selectedVariant?.price
    || product.price
    || 0
  );
  const effectivePrice = Number(selectedVariant?.price || product.price || 0);

  // Calculate pricing based on quantity
  const pricing = useMemo(() => {
    if (!product) return null;
    const hasIntrinsicDiscount = Number(selectedVariantDiscountPercent || productDiscountPercent) > 0;
    const previewQuantity = product?.listingType === "group" ? 1 : quantity;
    return calculatePrice(effectivePrice, previewQuantity, {
      disableBulkDiscount: hasIntrinsicDiscount,
    });
  }, [product, quantity, selectedVariantDiscountPercent, productDiscountPercent, effectivePrice]);

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

  const updateVariantQuantity = (variantId, nextQuantity) => {
    const normalizedVariantId = String(variantId || "");
    const targetVariant = availableVariants.find(
      (entry) => String(entry?.variantId || entry?.id) === normalizedVariantId
    );
    const maxAvailable = Math.max(0, Number(targetVariant?.availableQuantity || 0));
    const safeQty = Math.max(0, Math.min(maxAvailable, Number(nextQuantity) || 0));

    if ((Number(nextQuantity) || 0) > maxAvailable) {
      toast.error(`Only ${maxAvailable} available for this variant`);
    }

    setVariantQuantities((current) => {
      const next = { ...current };
      if (safeQty <= 0) {
        delete next[normalizedVariantId];
        return next;
      }
      next[normalizedVariantId] = safeQty;
      return next;
    });
  };

  const toggleVariantSelection = (variantId, isChecked) => {
    const normalizedVariantId = String(variantId || "");
    if (isChecked) {
      const variant = availableVariants.find(
        (entry) => String(entry?.variantId || entry?.id) === normalizedVariantId
      );
      const maxAvailable = Math.max(0, Number(variant?.availableQuantity || 0));
      if (maxAvailable < 1) {
        toast.error("Selected variant is currently unavailable");
        return;
      }

      updateVariantQuantity(normalizedVariantId, Math.max(1, Number(variantQuantities[normalizedVariantId]) || 1));
      setFocusedVariantId(normalizedVariantId);
      return;
    }

    updateVariantQuantity(normalizedVariantId, 0);
    if (String(focusedVariantId) === normalizedVariantId) {
      setFocusedVariantId("");
    }
  };

  const emitAddToCart = (cartProduct, itemQuantity) =>
    new Promise((resolve) => {
      const sent = addToCartSocket(cartProduct, itemQuantity, (result) => {
        resolve(result || { ok: false, message: "Unable to add item to cart. Please try again." });
      });

      if (!sent) {
        resolve({ ok: false, message: "Unable to add item to cart. Please try again." });
      }
    });

  const handleAddToCart = async () => {
    if (product.listingType === "group" && availableVariants.length > 0) {
      if (!selectedVariantEntries.length) {
        toast.error("Please select at least one variant before adding to cart");
        if (variantSectionRef.current) {
          variantSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return;
      }

      let successCount = 0;
      const errors = [];

      for (const [variantId, selectedQty] of selectedVariantEntries) {
        const variant = availableVariants.find(
          (entry) => String(entry?.variantId || entry?.id) === String(variantId)
        );
        if (!variant) {
          errors.push("A selected variant is no longer available.");
          continue;
        }

        const variantAvailable = Math.max(0, Number(variant?.availableQuantity || 0));
        if ((Number(selectedQty) || 0) > variantAvailable) {
          errors.push(`Only ${variantAvailable} available for ${formatVariantLabel(variant?.name || variantId)}.`);
          continue;
        }

        const variantDiscountPercent = getProductDiscountPercent(variant);
        const variantImage =
          variant?.image
          || variant?.imageUrl
          || (Array.isArray(variant?.images) ? variant.images[0] : "")
          || selectedImage
          || product.selectedImage
          || product.primaryImage
          || product.image;

        const cartProduct = {
          ...product,
          listingId: product.listingId || product.parentGroupId || product.id,
          variantId: variant?.variantId || variant?.id || null,
          variantName: variant?.name || null,
          parentGroupId: product.parentGroupId || product.groupId || null,
          groupName: product.groupName || product.name || null,
          price: Number(variant?.price || product.price || 0),
          originalPrice: Number(
            variant?.originalPrice
            || product.originalPrice
            || variant?.price
            || product.price
            || 0
          ),
          discountPercent: Number(variantDiscountPercent || productDiscountPercent || 0),
          selectedImage: variantImage,
        };

        const result = await emitAddToCart(cartProduct, Number(selectedQty) || 1);
        if (result?.ok) {
          successCount += 1;
        } else {
          errors.push(result?.message || "Unable to add some variants to cart.");
        }
      }

      if (successCount > 0) {
        toast.success(
          `${successCount} ${successCount > 1 ? "variants" : "variant"} added to cart!`
        );
      }
      if (errors.length) {
        toast.error(errors[0]);
      }
      return;
    }

    if (quantity > productAvailableQuantity) {
      toast.error(`Only ${productAvailableQuantity} available for this product`);
      return;
    }

    const cartProduct = {
      ...product,
      listingId: product.listingId || product.parentGroupId || product.id,
      variantId: selectedVariant?.variantId || selectedVariant?.id || product.variantId || null,
      variantName: selectedVariant?.name || product.variantName || null,
      parentGroupId: product.parentGroupId || product.groupId || null,
      groupName: product.groupName || null,
      price: Number(selectedVariant?.price || product.price || 0),
      originalPrice: Number(selectedVariant?.originalPrice || product.originalPrice || selectedVariant?.price || product.price || 0),
      discountPercent: Number(selectedVariantDiscountPercent || productDiscountPercent || 0),
      selectedImage:
        selectedImage
        || selectedVariant?.image
        || selectedVariant?.imageUrl
        || product.selectedImage
        || product.primaryImage
        || product.image,
    };

    const result = await emitAddToCart(cartProduct, quantity);
    if (result?.ok) {
      toast.success(
        `${quantity} ${quantity > 1 ? "items" : "item"} added to cart!`
      );
      return;
    }

    toast.error(result?.message || "Unable to add item to cart. Please try again.");
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
          {selectedImage ? (
            <>
              <ImageZoom
                src={getProductImageUrl(selectedImage)}
                alt={detailTitle}
                zoomLevel={3.5}
                onImageClick={isMobileViewport ? () => setIsMobilePreviewOpen(true) : undefined}
              />
              {galleryImages.length > 0 && (
                <div className="product-thumbnail-rail" role="tablist" aria-label="Product images">
                  {galleryImages.map((imageUrl, index) => (
                    <button
                      key={`${imageUrl}-${index}`}
                      type="button"
                      className={`product-thumbnail ${selectedImage === imageUrl ? "active" : ""}`}
                      onClick={() => setSelectedImage(imageUrl)}
                      aria-label={`View product image ${index + 1}`}
                      aria-pressed={selectedImage === imageUrl}
                    >
                      <img src={getProductImageUrl(imageUrl)} alt={`${detailTitle} ${index + 1}`} />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="product-image-placeholder">
              <span>{product.category}</span>
            </div>
          )}
        </div>

        <div className="product-info-section">
          <h1>{detailTitle}</h1>
          <p className="product-category">{product.category}</p>

          <div className="pricing-section">
            <p className="product-price">
              {intrinsicDiscountPercent > 0 ? (
                <>
                  <span className="original-price">
                    ₦{originalPrice.toLocaleString()}
                  </span>
                  <span className="discounted-price">
                    ₦{effectivePrice.toLocaleString()}
                  </span>
                  <span className="discount-badge">
                    {intrinsicDiscountPercent}% OFF
                  </span>
                </>
              ) : pricing.discountPercent > 0 ? (
                <>
                  <span className="original-price">
                    ₦{effectivePrice.toLocaleString()}
                  </span>
                  <span className="discounted-price">
                    ₦{Math.round(pricing.unitPrice).toLocaleString()}
                  </span>
                  <span className="discount-badge">
                    {pricing.discountPercent}% OFF
                  </span>
                </>
              ) : (
                <span>₦{effectivePrice.toLocaleString()}</span>
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
            <p className="availability-text">
              {product.listingType === "group"
                ? selectedVariant
                  ? `${selectedVariantAvailableQuantity} available for selected variant`
                  : "Select a variant to view quantity available"
                : `${productAvailableQuantity} available`}
            </p>
          </div>

          <div className="product-description">
            <h3>Description</h3>
            <p>{product.description}</p>
          </div>

          {product.listingType === "group" && availableVariants.length > 0 && (
            <div className="quantity-selector" ref={variantSectionRef}>
              <label>Variants:</label>
              <p className="variant-scroll-hint">Scroll horizontally to see more variants</p>
              <div className="variant-checkbox-list">
                {availableVariants.map((variant) => {
                  const variantId = String(variant?.variantId || variant?.id || "");
                  const variantPrice = Number(variant?.price || product.price || 0);
                  const variantAvailable = Math.max(0, Number(variant?.availableQuantity || 0));
                  const checked = Number(variantQuantities[variantId] || 0) > 0;
                  const selectedQty = Number(variantQuantities[variantId] || 1);
                  const remainingWhenSelected = Math.max(0, variantAvailable - selectedQty);

                  return (
                    <div
                      key={variantId || variant?.name}
                      className={`variant-checkbox-item ${checked ? "selected" : ""}`}
                      onClick={() => setFocusedVariantId(variantId)}
                    >
                      <label>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={variantAvailable < 1}
                          onChange={(event) => toggleVariantSelection(variantId, event.target.checked)}
                        />
                        <span>{formatVariantLabel(variant?.name || variantId)}</span>
                      </label>
                      <span className="variant-checkbox-price">
                        ₦{variantPrice.toLocaleString()}
                      </span>

                      {!checked && (
                        <span className="variant-availability-copy">
                          {variantAvailable > 0 ? `${variantAvailable} available` : "Unavailable"}
                        </span>
                      )}

                      {checked && (
                        <div className="variant-qty-controls">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              updateVariantQuantity(variantId, Math.max(1, selectedQty - 1));
                            }}
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            max={variantAvailable}
                            value={selectedQty}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => {
                              event.stopPropagation();
                              updateVariantQuantity(variantId, Math.max(1, Number(event.target.value) || 1));
                            }}
                          />
                          <button
                            type="button"
                            disabled={selectedQty >= variantAvailable}
                            onClick={(event) => {
                              event.stopPropagation();
                              updateVariantQuantity(variantId, selectedQty + 1);
                            }}
                          >
                            +
                          </button>
                          <span className="variant-remaining-copy">
                            {remainingWhenSelected} remaining
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="product-details">
            <h3>Details</h3>
            <ul>
              <li>
                <strong>SKU:</strong> {product.sku || `JWL-${product.id}`}
              </li>
            </ul>
          </div>

          {product.listingType !== "group" && (
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
                    setQuantity(Math.max(1, Math.min(productAvailableQuantity, parseInt(e.target.value, 10) || 1)))
                  }
                  min="1"
                  max={productAvailableQuantity}
                />
                <button
                  onClick={() => setQuantity(Math.min(productAvailableQuantity, quantity + 1))}
                  disabled={quantity >= productAvailableQuantity}
                >
                  +
                </button>
              </div>
            </div>
          )}

          <div className="product-actions">
            <button className="btn-add-cart" onClick={handleAddToCart} disabled={product.listingType !== "group" && productAvailableQuantity < 1}>
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

      {isMobilePreviewOpen && selectedImage && (
        <div className="mobile-image-preview-overlay" role="dialog" aria-modal="true" onClick={() => setIsMobilePreviewOpen(false)}>
          <button
            type="button"
            className="mobile-image-preview-close"
            onClick={() => setIsMobilePreviewOpen(false)}
            aria-label="Close image preview"
          >
            ×
          </button>
          <div className="mobile-image-preview-body" onClick={(event) => event.stopPropagation()}>
            <img src={getProductImageUrl(selectedImage)} alt={detailTitle} />
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductDetail;
