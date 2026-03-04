import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { getProductImageUrl } from "../utils/image";
import "./Home.css";

const Home = () => {
  const products = useSelector((state) => state.products.items || []);

  const topCategories = useMemo(() => {
    const categoryMap = new Map();

    products.forEach((product) => {
      const category = String(product?.category || "").trim();
      if (!category) return;

      const current = categoryMap.get(category) || {
        name: category,
        count: 0,
        image:
          product.primaryImage
          || product.selectedImage
          || (Array.isArray(product.images) ? product.images[0] : "")
          || product.image
          || "",
      };

      current.count += 1;

      if (!current.image) {
        current.image =
          product.primaryImage
          || product.selectedImage
          || (Array.isArray(product.images) ? product.images[0] : "")
          || product.image
          || "";
      }

      categoryMap.set(category, current);
    });

    return Array.from(categoryMap.values())
      .sort((first, second) => {
        if (second.count !== first.count) {
          return second.count - first.count;
        }
        return first.name.localeCompare(second.name);
      })
      .slice(0, 4);
  }, [products]);

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-content">
          <h1>Discover Jewelry That Speaks Your Style.</h1>
          <p>
            From timeless classics to personalized pieces; experience elegance
            made just for you.
          </p>
          <div className="hero-buttons">
            <Link to="/products" className="btn btn-primary">
              Shop Now
            </Link>
            {/* <Link to="/customization" className="btn btn-secondary">
              Customize Jewelry
            </Link> */}
          </div>
        </div>
      </section>

      <section className="features">
        <div className="feature-card">
          <h3>Wholesale & Retail</h3>
          <p>
            Browse our extensive collection of fine jewelry at competitive
            prices
          </p>
          <Link to="/products">Explore Products</Link>
        </div>
        <div className="feature-card">
          <h3>Custom Design</h3>
          <p>Create unique, personalized jewelry with text, images, and more</p>
          {/* <Link to="/customization">Start Customizing</Link> */}
          <span className="coming-soon">Coming Soon</span>
        </div>
        <div className="feature-card">
          <h3>Quality Guaranteed</h3>
          <p>All our pieces are crafted with precision and care</p>
        </div>
      </section>

      <section className="categories">
        <h2>Shop by Category</h2>
        <div className="category-grid">
          {topCategories.map((category) => (
            <Link
              key={category.name}
              to={`/products?category=${encodeURIComponent(category.name)}`}
              className="category-item"
            >
              <div className="category-image">
                {category.image ? (
                  <img src={getProductImageUrl(category.image)} alt={category.name} />
                ) : (
                  <span>{category.name}</span>
                )}
              </div>
              <h4>{category.name}</h4>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
};

export default Home;
