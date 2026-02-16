# Copilot Instructions

## Architecture Overview
- Monorepo with Node/Express API at repo root and CRA React app in client/.
- Backend entrypoint is server.js: Express 5 + Mongoose, serves /api/users routes and static /uploads.
- In production/staging, server.js serves client/build for all non-API routes.
- Auth is cookie-based JWT: controllers in controllers/userController.js set httpOnly token cookie; middleware/authMiddleware.js reads req.cookies.token and populates req.user.

## Frontend Patterns
- React Router routes live in client/src/App.js; add new pages under client/src/pages and wire routes here.
- Product catalog is seeded from the large sampleProducts array in client/src/App.js and dispatched via setProducts in useEffect on app load.
- Global state is Redux Toolkit in client/src/redux/store.js with slices in client/src/redux/slices/ (products, cart, customization, user).
- Styling is per-component/page CSS files in client/src/components and client/src/pages; keep styles colocated.

## API Surface
- User endpoints are under /api/users in routes/userRoutes.js (register, login, logout, getuser, loggedin, updateuser, changepassword).
- Models use Mongoose schemas in models/; userModel.js hashes passwords via a pre-save hook.

## Local Development
- Backend: npm run dev (nodemon server.js) from repo root.
- Frontend: npm start from client/ (CRA dev server on :3000).
- Required env vars for backend: MONGO_URI and JWT_SECRET (see server.js and controllers/userController.js).

## Integration Notes
- API auth relies on cookies; ensure requests include credentials if wiring frontend API calls.
- The backend currently exposes only user routes; product data is local to the frontend.
