import React from "react";
import { Link } from "react-router-dom";
import { getProductImageUrl } from "../utils/image";
import "./Home.css";

const Home = () => {
  // Category images - random selections from each category
  const categoryImages = {
    Rings: getProductImageUrl("rings-15.jpg"),
    Necklaces: getProductImageUrl("necklaces-20.jpg"),
    Bracelets: getProductImageUrl("bracelets-10.jpg"),
    Earrings: getProductImageUrl("earrings-02.jpg"),
  };

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
          <Link to="/customization">Start Customizing</Link>
        </div>
        <div className="feature-card">
          <h3>Quality Guaranteed</h3>
          <p>All our pieces are crafted with precision and care</p>
        </div>
      </section>

      <section className="categories">
        <h2>Shop by Category</h2>
        <div className="category-grid">
          <Link to="/products?category=Rings" className="category-item">
            <div className="category-image">
              <img src={categoryImages.Rings} alt="Rings" />
            </div>
            <h4>Rings</h4>
          </Link>
          <Link to="/products?category=Necklaces" className="category-item">
            <div className="category-image">
              <img src={categoryImages.Necklaces} alt="Necklaces" />
            </div>
            <h4>Necklaces</h4>
          </Link>
          <Link to="/products?category=Bracelets" className="category-item">
            <div className="category-image">
              <img src={categoryImages.Bracelets} alt="Bracelets" />
            </div>
            <h4>Bracelets</h4>
          </Link>
          <Link to="/products?category=Earrings" className="category-item">
            <div className="category-image">
              <img src={categoryImages.Earrings} alt="Earrings" />
            </div>
            <h4>Earrings</h4>
          </Link>
        </div>
      </section>
    </div>
  );
};

export default Home;
