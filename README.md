# Vector — Real-Time Multi-File Code Syncing

Vector is a production-quality, real-time, multi-file code sharing tool that lets peers collaborate instantly without any sign-up or accounts. One developer creates a workspace session, gets a unique 6-digit room code, and instantly shares that code with a peer on a different network or device. Both clients are kept in near real-time synchronization with fully integrated Monaco Code Editors, custom throttled typing broadcasts, automatic network recovery, and in-session presence tracking.

## Prerequisites

To run this application, ensure you have the following installed on your system:
- **Node.js**: Version `18.x` or later (verify with `node -v`).
- **MongoDB**: A running local MongoDB instance (defaulting to `mongodb://localhost:27017`) or a remote connection string.

---

## Environment Variables

### Backend Server (`/server/.env`)
Create a `.env` file in the `server` directory. The following variable is supported:
- `MONGODB_URI`: The MongoDB connection string (e.g. `mongodb://localhost:27017/vector`). If unset, it defaults to the local MongoDB daemon.
- `PORT`: The server port. Defaults to `5001`.

---

## Installation & Setup

Vector uses a monorepo layout with separate `/client` and `/server` folders. Follow these steps to set up both directories.

### 1. Set Up the Server
Navigate to the `server` folder, install the backend node modules, and configure environment keys:
```bash
cd server
npm install
```

### 2. Set Up the Client
Navigate to the `client` folder and install the frontend packages:
```bash
cd ../client
npm install
```

---

## Running the Application

To test real-time collaboration locally, run both the backend server and client server concurrently.

### Step 1: Start the Backend Server
From the `server` directory, spin up the Node Express server in development mode:
```bash
cd server
npm run dev
```
*Note: The server will verify its connection to MongoDB and print: `Successfully connected to MongoDB.` on port 5001.*

### Step 2: Start the Client Server
From the `client` directory, spin up the Vite React server in a separate terminal:
```bash
cd client
npm run dev
```
*Note: The React client will launch on `http://localhost:5173/` and automatically proxy all `/api` requests to the port 5001 server.*
