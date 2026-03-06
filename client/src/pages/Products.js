import React, { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useSearchParams } from "react-router-dom";
import {
  filterByCategory,
  searchProducts,
  setProducts,
  setLoading,
  setRefreshing,
  setError,
} from "../redux/slices/productsSlice";
import ProductCard from "../components/ProductCard";
import { fetchProducts } from "../services/products";
import "./Products.css";

const Products = () => {
  const dispatch = useDispatch();
  const [searchParams] = useSearchParams();
  const { filteredItems, categories, selectedCategory, loading } = useSelector(
    (state) => state.products
  );
  const [searchTerm, setSearchTerm] = React.useState("");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const itemsPerPage = 9;

  // Calculate pagination
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentProducts = filteredItems.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory, searchTerm]);

  useEffect(() => {
    const category = searchParams.get("category");
    if (category) {
      dispatch(filterByCategory(category));
    }
  }, [searchParams, dispatch]);

  const handleCategoryChange = (category) => {
    dispatch(filterByCategory(category));
  };

  const handleSearch = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    dispatch(searchProducts(value));
  };

  const handleRefreshListings = async () => {
    if (isRefreshing) {
      return;
    }

    setIsRefreshing(true);
    if (filteredItems.length) {
      dispatch(setRefreshing(true));
    } else {
      dispatch(setLoading(true));
    }
    try {
      const latestProducts = await fetchProducts();
      dispatch(setProducts(latestProducts));
      setCurrentPage(1);
    } catch (error) {
      dispatch(setError(error.message || "Unable to refresh listings"));
    } finally {
      setIsRefreshing(false);
      dispatch(setLoading(false));
      dispatch(setRefreshing(false));
    }
  };

  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const getPaginationItems = () => {
    if (totalPages <= 1) {
      return [1];
    }

    const basePages = [
      1,
      Math.max(1, currentPage - 1),
      currentPage,
      Math.min(totalPages, currentPage + 1),
      totalPages,
    ];

    const uniqueSortedPages = Array.from(
      new Set(basePages.filter((page) => page >= 1 && page <= totalPages))
    ).sort((a, b) => a - b);

    const items = [];
    uniqueSortedPages.forEach((page, index) => {
      if (index > 0) {
        const previousPage = uniqueSortedPages[index - 1];
        if (page - previousPage > 1) {
          items.push("...");
        }
      }
      items.push(page);
    });

    return items;
  };


  return (
    <div className="products-page">
      <div className="products-header">
        <h1>House of Jewelry</h1>
        <p>Wholesale and Retail - Premium Quality Jewelry</p>
        {/* <div className="products-highlight-strip">
          <span>Bulk Discounts: 3+ items (5% off)</span>
          <span>5+ items (10% off)</span>
          <span>10+ items (15% off)</span>
        </div> */}
      </div>

      <div className="search-bar-container">
        <div className="search-bar">
          <svg
            className="search-icon"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
          <input
            type="text"
            placeholder="Search jewelry by name or description..."
            value={searchTerm}
            onChange={handleSearch}
          />
        </div>
        {/* <button
          type="button"
          className="refresh-listings-btn"
          onClick={handleRefreshListings}
          disabled={isRefreshing}
        >
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </button> */}
      </div>

      <div className="category-filters-container">
        <div className="category-filters">
          <button
            className={`category-chip ${
              selectedCategory === "All" ? "active" : ""
            }`}
            onClick={() => handleCategoryChange("All")}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              key={category}
              className={`category-chip ${
                selectedCategory === category ? "active" : ""
              }`}
              onClick={() => handleCategoryChange(category)}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* <div className="results-info">
        <span>
          Showing {filteredItems.length > 0 ? startIndex + 1 : 0}-
          {Math.min(endIndex, filteredItems.length)} of {filteredItems.length}{" "}
          {filteredItems.length === 1 ? "product" : "products"}
        </span>
      </div> */}

      <div className="products-grid">
        {loading && currentProducts.length === 0 ? (
          <div className="loading-state">
            <p>Loading products...</p>
          </div>
        ) : currentProducts.length > 0 ? (
          currentProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))
        ) : (
          <div className="no-products">
            <div className="empty-state">
              <svg
                className="empty-icon"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M16 16s-1.5-2-4-2-4 2-4 2"></path>
                <line x1="9" y1="9" x2="9.01" y2="9"></line>
                <line x1="15" y1="9" x2="15.01" y2="9"></line>
              </svg>
              <h3>No products found</h3>
              <p>Try adjusting your search or category filter</p>
            </div>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="pagination-btn"
            onClick={handlePrevPage}
            disabled={currentPage === 1}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>

          <div className="pagination-numbers">
            {getPaginationItems().map((item, index) => {
              if (item === "...") {
                return (
                  <span key={`ellipsis-${index}`} className="pagination-ellipsis">
                    ...
                  </span>
                );
              }

              return (
                <button
                  key={item}
                  className={`pagination-number ${
                    currentPage === item ? "active" : ""
                  }`}
                  onClick={() => handlePageChange(item)}
                >
                  {item}
                </button>
              );
            })}
          </div>

          <button
            className="pagination-btn"
            onClick={handleNextPage}
            disabled={currentPage === totalPages}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

export default Products;
