import React, { useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { setProducts, setLoading, setError } from "./redux/slices/productsSlice";
import { setUser } from "./redux/slices/userSlice";
import { updateCartFromSocket } from "./redux/slices/cartSlice";
import { getUser } from "./services/auth";
import { fetchProducts } from "./services/products";
import { initializeSocket } from "./services/socket";
import { LaunchProvider } from "./context/LaunchContext";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Products from "./pages/Products";
import ProductDetail from "./pages/ProductDetail";
import Customization from "./pages/Customization";
import CreateCustomization from "./pages/CreateCustomization";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import TrackOrder from "./pages/TrackOrder";
import ContactUs from "./pages/ContactUs";
import Profile from "./pages/Profile";
import WaitlistForm from "./pages/WaitlistForm";
import "./App.css";

// Scroll to top on route change
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}


function App() {
  const dispatch = useDispatch();
  const { currentUser } = useSelector((state) => state.user);
  const products = useSelector((state) => state.products.items);

  useEffect(() => {
    let didCancel = false;
    let fallbackTimer = null;

    const loadProducts = async () => {
      dispatch(setLoading(true));
      try {
        const response = await fetchProducts();
        if (!didCancel) {
          dispatch(setProducts(response));
        }
      } catch (error) {
        if (!didCancel) {
          dispatch(setError(error.message));
        }
      } finally {
        if (!didCancel) {
          dispatch(setLoading(false));
        }
      }
    };

    if (!products.length) {
      fallbackTimer = setTimeout(loadProducts, 1500);
    }

    return () => {
      didCancel = true;
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
      }
    };
  }, [dispatch, products.length]);

  // Restore user session on app load
  useEffect(() => {
    const restoreUserSession = async () => {
      try {
        const response = await getUser();
        if (response) {
          dispatch(setUser(response));
        }
      } catch (error) {
        // User not logged in or session expired, this is expected
        console.log("User not authenticated");
      }
    };

    restoreUserSession();
  }, [dispatch]);

  // Initialize WebSocket connection
  useEffect(() => {
    const socket = initializeSocket(currentUser?.token);

    // Listen for cart updates from backend
    socket.on("cart:updated", (cart) => {
      dispatch(updateCartFromSocket(cart));
    });

    // Listen for cart sync response
    socket.on("cart:synced", (cart) => {
      dispatch(updateCartFromSocket(cart));
    });

    socket.on("cart:error", (error) => {
      console.error("Cart error:", error.message);
    });

    socket.on("products:synced", (productsPayload) => {
      dispatch(setProducts(productsPayload));
    });

    socket.on("products:error", (error) => {
      console.error("Products error:", error.message);
    });

    // Sync cart and products when component mounts
    socket.emit("cart:sync", { sessionId: localStorage.getItem("sessionId") });
    socket.emit("products:sync");

    return () => {
      // Cleanup: remove listeners (but keep socket connected)
      socket.off("cart:updated");
      socket.off("cart:synced");
      socket.off("cart:error");
      socket.off("products:synced");
      socket.off("products:error");
    };
  }, [dispatch, currentUser?.token]);

  return (
    <LaunchProvider>
      <Router>
        <ScrollToTop />
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/products" element={<Products />} />
            <Route path="/products/:id" element={<ProductDetail />} />
            <Route path="/customization" element={<Customization />}>
              <Route path="create" element={<CreateCustomization />} />
            </Route>
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/login" element={<Login />} />
            <Route path="/track-order" element={<TrackOrder />} />
            <Route path="/contact" element={<ContactUs />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/waitlist" element={<WaitlistForm />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      </Router>
    </LaunchProvider>
  );
}

export default App;
