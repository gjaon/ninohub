# Login Debug - What to Do Next

## Summary of Changes

I've added **console logging** at every step of the login flow to help us identify exactly where the data changes from your real name to "User".

## Test the Login Flow

### 1. Start Both Servers

**Backend:**
```bash
cd /Users/macbook/Desktop/Coding/NINO
npm run dev
```

**Frontend:**
```bash
cd /Users/macbook/Desktop/Coding/NINO/client
npm start
```

### 2. Open Browser Console

- Open your browser to http://localhost:3000
- Press **F12** (or Cmd+Option+I on Mac)
- Go to the **Console** tab
- **Clear** the console (click the 🚫 icon)

### 3. Login

1. Go to /login page
2. Enter your email and password
3. Click "Login"

### 4. Watch the Logs

You'll see logs in **two places**:

#### Backend Terminal (server logs):
```
POST /api/users/login
LOGIN - User from DB: { _id: '...', name: '???', email: '...' }
LOGIN - Sending response: { _id: '...', name: '???', ... }
```

#### Browser Console (frontend logs):
```
LOGIN - Response from backend: { _id: '...', name: '???', ... }
LOGIN - Dispatched setUser with: { ... }
REDUX setUser - Received payload: { name: '???', ... }
REDUX setUser - New state.currentUser: { name: '???', ... }
NAVBAR - currentUser updated: { name: '???', ... }
```

## What to Look For

The `???` in the logs will show you the actual name value at each step. One of these will happen:

### Case 1: Database has "User"
```
Backend: LOGIN - User from DB: { name: 'User' }
```
**This means:** Your user document in the database literally has "User" as the name.
**Fix:** Update the user in the database with your real name.

### Case 2: Backend receives correct name but sends "User"
```
Backend: LOGIN - User from DB: { name: 'John Doe' }
Backend: LOGIN - Sending response: { name: 'User' }
```
**This means:** Backend logic has an issue.

### Case 3: Frontend receives "User" from backend
```
Browser: LOGIN - Response from backend: { name: 'User' }
```
**This means:** The backend is sending "User" in the API response.

### Case 4: Redux doesn't store the name correctly
```
Browser: LOGIN - Response: { name: 'John Doe' }
Browser: REDUX - Received: { name: 'User' }
```
**This means:** Something is modifying the data before it goes into Redux.

## After Testing

Please share with me:

1. **Backend terminal logs** (the "LOGIN -" lines)
2. **Browser console logs** (all the LOGIN/REDUX/NAVBAR lines)  
3. What the navbar actually displays

This will tell us exactly where the problem is!

## If You Get "Not Authorized" on Profile

This is a **different issue** - it means cookies aren't being sent from frontend to backend. We'll fix this **after** we solve the "User" name issue.

The symptoms:
- Login succeeds
- Navbar might show name correctly
- But when you go to /profile → "Not authorized" error

This happens because the authentication cookies set during login aren't being included in subsequent API requests.

---

**Ready to test!** Just login and copy-paste the console logs from both places.
