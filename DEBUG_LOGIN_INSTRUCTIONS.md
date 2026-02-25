# Login Issue Debugging

## What I've Done

Added comprehensive logging to trace the data flow:

### Backend (controllers/userController.js)
- Logs raw user data from database
- Logs the response being sent

### Frontend (Login.js)
- Logs response received from backend
- Logs data being dispatched to Redux

### Frontend (Redux userSlice.js)
- Logs data received in setUser action
- Logs new Redux state after update

### Frontend (Navbar.js)
- Logs currentUser whenever it changes
- Shows name, email, and authentication status

## How to Test

### Step 1: Make sure both servers are running

**Terminal 1 - Backend:**
```bash
cd /Users/macbook/Desktop/Coding/NINO
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd /Users/macbook/Desktop/Coding/NINO/client
npm start
```

### Step 2: Open Browser DevTools
- Press F12 or Cmd+Option+I
- Go to Console tab
- Clear console (click 🚫 icon or Cmd+K)

### Step 3: Attempt Login
1. Navigate to http://localhost:3000/login
2. Enter your credentials
3. Click Login

### Step 4: Check Console Logs

You should see a sequence of logs:

**Backend Terminal:** 
```
POST /api/users/login
LOGIN - User from DB: { _id: '...', name: 'John Doe', email: 'user@example.com' }
LOGIN - Sending response: { _id: '...', name: 'John Doe', email: '...', ... }
```

**Browser Console:**
```
LOGIN - Response from backend: { _id: '...', name: 'John Doe', ... }
LOGIN - Dispatched setUser with: { _id: '...', name: 'John Doe', ... }
REDUX setUser - Received payload: { _id: '...', name: 'John Doe', ... }
REDUX setUser - New state.currentUser: { _id: '...', name: 'John Doe', ... }
NAVBAR - currentUser updated: { isAuthenticated: true, name: 'John Doe', ... }
```

### Step 5: Identify the Issue

**Scenario A: Backend shows "User" in name field**
```
LOGIN - User from DB: { _id: '...', name: 'User', ... }
```
→ **Problem: Database has "User" as the name**
→ **Solution: Update user document in database**

**Scenario B: Backend shows real name, but response shows "User"**
```
LOGIN - User from DB: { _id: '...', name: 'John Doe', ... }
LOGIN - Sending response: { _id: '...', name: 'User', ... }
```
→ **Problem: Backend controller logic error**
→ **Solution: Check destructuring and response building**

**Scenario C: Backend shows real name, frontend receives "User"**
```
Backend: name: 'John Doe'
Browser: name: 'User'
```
→ **Problem: Network/axios interceptor issue**
→ **Solution: Check API interceptors and middleware**

**Scenario D: Frontend receives real name, Redux stores "User"**
```
LOGIN - Response: { name: 'John Doe' }
REDUX setUser: { name: 'User' }
```
→ **Problem: Redux reducer or middleware issue**
→ **Solution: Check userSlice reducer**

**Scenario E: Redux stores real name, Navbar shows "User"**
```
REDUX: currentUser.name = 'John Doe'
NAVBAR: displays 'User'
```
→ **Problem: Component prop access issue**
→ **Solution: Check Navbar component logic**

## Manual Database Check

If backend shows name as "User", check the database:

```bash
cd /Users/macbook/Desktop/Coding/NINO
node test-users.js
```

This will show actual user documents from the database.

## Manual API Test

Test the login API directly:

1. Edit `test-login-flow.js` - replace email and password with your test user
2. Run:
```bash
node test-login-flow.js
```

This will show exactly what the API returns.

## Next Steps

After you run the test and see the console logs, share:
1. The backend terminal log (LOGIN - lines)
2. The browser console log (all LOGIN/REDUX/NAVBAR lines)
3. Screenshot if possible

This will tell us exactly where the data is being changed from the real name to "User".
