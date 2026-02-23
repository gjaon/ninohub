import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { setError, setLoading, setUser } from "../redux/slices/userSlice";
import { registerUser, loginUser } from "../services/auth";
import "./Login.css";

const Login = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { loading } = useSelector((state) => state.user);
  const [isSignup, setIsSignup] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: "",
    confirmPassword: "",
  });

  const from = location.state?.from?.pathname || location.state?.redirectTo || "/";
  const checkoutState = location.state?.fromCheckout
    ? {
        formData: location.state.formData,
        step: location.state.step,
      }
    : null;

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    dispatch(setLoading(true));
    dispatch(setError(null));

    if (isSignup) {
      // Signup validation
      if (
        !formData.name ||
        !formData.email ||
        !formData.password ||
        !formData.confirmPassword
      ) {
        toast.error("Please fill in all fields");
        dispatch(setLoading(false));
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        toast.error("Passwords do not match");
        dispatch(setLoading(false));
        return;
      }
      if (formData.password.length < 6) {
        toast.error("Password must be at least 6 characters");
        dispatch(setLoading(false));
        return;
      }

      try {
        const response = await registerUser({
          name: formData.name,
          email: formData.email,
          password: formData.password,
        });
        dispatch(setUser(response));
        toast.success(
          `Welcome, ${response.name}! Account created successfully.`
        );
        // Navigate with checkout state if coming from checkout
        if (checkoutState) {
          navigate(from, { replace: true, state: checkoutState });
        } else {
          navigate(from, { replace: true });
        }
      } catch (error) {
        const message = error.message || "Signup failed. Please try again.";
        dispatch(setError(message));
        toast.error(message);
      } finally {
        dispatch(setLoading(false));
      }
    } else {
      // Login validation
      if (!formData.email || !formData.password) {
        toast.error("Please enter email and password");
        dispatch(setLoading(false));
        return;
      }

      try {
        const response = await loginUser({
          email: formData.email,
          password: formData.password,
        });
        dispatch(setUser(response));
        toast.success("Logged in successfully!");
        // Navigate with checkout state if coming from checkout
        if (checkoutState) {
          navigate(from, { replace: true, state: checkoutState });
        } else {
          navigate(from, { replace: true });
        }
      } catch (error) {
        const message = error.message || "Login failed. Please try again.";
        dispatch(setError(message));
        toast.error(message);
      } finally {
        dispatch(setLoading(false));
      }
    }
  };

  const toggleMode = () => {
    setIsSignup(!isSignup);
    setFormData({
      email: "",
      password: "",
      name: "",
      confirmPassword: "",
    });
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <h1>{isSignup ? "Create Account" : "Welcome Back"}</h1>
          <p>
            {isSignup
              ? "Sign up to start customizing your jewelry"
              : "Login to access your customizations"}
          </p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {isSignup && (
            <div className="form-group">
              <label htmlFor="name">Full Name</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Enter your full name"
                required={isSignup}
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="Enter your email"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Enter your password"
              required
            />
          </div>

          {isSignup && (
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Confirm your password"
                required={isSignup}
              />
            </div>
          )}

          <button type="submit" className="btn-submit" disabled={loading}>
            {loading ? "Processing..." : isSignup ? "Sign Up" : "Login"}
          </button>
        </form>

        <div className="login-toggle">
          <p>
            {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
            <button type="button" onClick={toggleMode} className="toggle-btn">
              {isSignup ? "Login" : "Sign Up"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
