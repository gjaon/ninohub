import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  currentUser: null,
  isAuthenticated: false,
  loading: false,
  error: null,
};

const userSlice = createSlice({
  name: "user",
  initialState,
  reducers: {
    setUser: (state, action) => {
      console.log("REDUX setUser - Received payload:", action.payload);
      state.currentUser = action.payload;
      state.isAuthenticated = true;
      console.log("REDUX setUser - New state.currentUser:", state.currentUser);
    },
    logout: (state) => {
      state.currentUser = null;
      state.isAuthenticated = false;
    },
    setLoading: (state, action) => {
      state.loading = action.payload;
    },
    setError: (state, action) => {
      state.error = action.payload;
    },
  },
});

export const { setUser, logout, setLoading, setError } = userSlice.actions;
export default userSlice.reducer;
