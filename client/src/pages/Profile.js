import React, { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import { logout, setUser } from "../redux/slices/userSlice";
import { logoutUser, updateUser } from "../services/auth";
import { fetchUserOrders } from "../services/orders";
import { toast } from "sonner";
import "./Profile.css";

const Profile = () => {
  const { currentUser } = useSelector((state) => state.user);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("orders");
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: currentUser?.name || "",
    phone: currentUser?.phone || "+234",
    bio: currentUser?.bio || "",
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch (error) {
      toast.error("Logout failed. Please try again.");
      return;
    }

    localStorage.removeItem("accessToken");
    dispatch(logout());
    toast.success("Logged out successfully");
    navigate("/");
  };

  // Update form data when currentUser changes
  React.useEffect(() => {
    if (currentUser) {
      setFormData({
        name: currentUser.name || "",
        phone: currentUser.phone || "+234",
        bio: currentUser.bio || "",
      });
    }
  }, [currentUser]);

  React.useEffect(() => {
    const loadOrders = async () => {
      setOrdersLoading(true);
      try {
        const response = await fetchUserOrders();
        setOrders(response || []);
      } catch (error) {
        toast.error(error.message || "Failed to load orders");
      } finally {
        setOrdersLoading(false);
      }
    };

    if (currentUser) {
      loadOrders();
    }
  }, [currentUser]);

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);

    try {
      const response = await updateUser(formData);
      dispatch(setUser(response));
      toast.success("Profile updated successfully!");
    } catch (error) {
      const message =
        error.response?.data?.message ||
        "Failed to update profile. Please try again.";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!currentUser) {
    navigate("/login");
    return null;
  }

  return (
    <div className="profile-page">
      <div className="profile-container">
        <div className="profile-sidebar">
          <div className="profile-header">
            <div className="profile-avatar">
              {currentUser.photo ? (
                <img src={currentUser.photo} alt={currentUser.name} />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              )}
            </div>
            <h2>{currentUser.name}</h2>
            <p>{currentUser.email}</p>
          </div>

          <nav className="profile-nav">
            <button
              className={`nav-item ${activeTab === "orders" ? "active" : ""}`}
              onClick={() => setActiveTab("orders")}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              </svg>
              My Orders
            </button>

            <Link to="/track-order" className="nav-item">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="1" y="3" width="15" height="13" />
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                <circle cx="5.5" cy="18.5" r="2.5" />
                <circle cx="18.5" cy="18.5" r="2.5" />
              </svg>
              Track Order
            </Link>

            <button
              className={`nav-item ${activeTab === "settings" ? "active" : ""}`}
              onClick={() => setActiveTab("settings")}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v6m0 6v6m9-9h-6M7 12H1m15.364-6.364l-4.243 4.243m-6.364 0L1.636 5.636m16.728 12.728l-4.243-4.243m-6.364 0l-4.242 4.243" />
              </svg>
              Settings
            </button>

            <button className="nav-item logout" onClick={handleLogout}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Logout
            </button>
          </nav>
        </div>

        <div className="profile-content">
          {activeTab === "orders" && (
            <div className="orders-section">
              <h2>My Orders</h2>
              {ordersLoading ? (
                <p>Loading orders...</p>
              ) : orders.length > 0 ? (
                <div className="orders-list">
                  {orders.map((order) => (
                    <div key={order._id} className="order-card">
                      <div className="order-header">
                        <div className="order-info">
                          <h3>Order #{order.orderNumber}</h3>
                          <p className="order-date">
                            {new Date(order.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div
                          className={`order-status status-${order.status
                            .toLowerCase()
                            .replace(" ", "-")}`}
                        >
                          {order.status}
                        </div>
                      </div>

                      <div className="order-items">
                        {order.items.map((item, index) => (
                          <div key={index} className="order-item">
                            <div className="item-details">
                              <h4>{item.productName || item.name}</h4>
                              <p>Quantity: {item.quantity}</p>
                            </div>
                            <div className="item-price">
                              ₦{item.price.toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="order-footer">
                        <div className="order-total">
                          <span>Total:</span>
                          <span className="total-amount">
                            ₦{order.totalAmount.toLocaleString()}
                          </span>
                        </div>
                        <Link
                          to={`/track-order?order=${order.orderNumber}`}
                          className="btn-track-order"
                        >
                          Track Order
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-orders">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="9" cy="21" r="1" />
                    <circle cx="20" cy="21" r="1" />
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                  </svg>
                  <h3>No orders yet</h3>
                  <p>Start shopping to see your orders here</p>
                  <Link to="/products" className="btn-shop-now">
                    Shop Now
                  </Link>
                </div>
              )}
            </div>
          )}

          {activeTab === "settings" && (
            <div className="settings-section">
              <h2>Account Settings</h2>
              <div className="settings-form">
                <div className="form-group">
                  <label>Full Name</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleFormChange}
                  />
                </div>
                <div className="form-group">
                  <label>Email Address</label>
                  <input
                    type="email"
                    value={currentUser?.email || ""}
                    disabled
                  />
                </div>
                <div className="form-group">
                  <label>Phone Number</label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleFormChange}
                  />
                </div>
                <div className="form-group">
                  <label>Bio</label>
                  <textarea
                    name="bio"
                    value={formData.bio}
                    onChange={handleFormChange}
                  ></textarea>
                </div>
                <button
                  className="btn-save"
                  onClick={handleSaveSettings}
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Profile;
