# Distributed Rate Limiter — Token Bucket with Atomic Redis Lua Scripting

**Live Dashboard Demo:** `http://localhost:8080` (Docker Container) or `http://localhost:5173` (Dev Server)

> **Key Feature:** Proving **shared state and atomicity across multiple servers**. Use the **"Burst"** button on any client card to fire 20 concurrent requests across 3 stateless backend servers (`Instance-3001`, `Instance-3002`, `Instance-3003`) and watch the single shared rate limit hold exactly without race conditions.

---

## 1. The Core Distributed Systems Problem

In a naive rate limiter implementation, each server performs a non-atomic read-then-write:
```js
// ❌ Naive implementation vulnerable to race conditions
const count = await redis.get(`ratelimit:${clientId}`);
if (count < maxCapacity) {
  // RACE CONDITION: Server A and Server B both read count = 9 at the exact same millisecond.
  // Both see room, both allow the request, and 2 requests get served when only 1 token remained!
  await redis.incr(`ratelimit:${clientId}`);
}
```

### The Fix: Atomic Redis Lua Script (`EVAL`)
Redis executes Lua scripts **single-threaded and atomically**. No other Redis command can interleave mid-execution. 
By placing the Token Bucket refill calculation, capacity check, and token deduction inside [token_bucket.lua](file:///Users/madhavsharma/RateLIMITER/backend/src/redis/token_bucket.lua), whichever server handles a request delegates the state mutation to Redis atomically.

---

## 2. System Architecture

```
                                  ┌───────────────────────────┐
                                  │   Vite React Dashboard    │
                                  │ (Port 8080 / Docker 80)   │
                                  └─────────────┬─────────────┘
                                                │
                                                ▼
                                  ┌───────────────────────────┐
                                  │    Load Balancer Proxy    │
                                  │   (http://127.0.0.1:3000) │
                                  └─────────────┬─────────────┘
                                                │ (Round-Robin)
                   ┌────────────────────────────┼────────────────────────────┐
                   ▼                            ▼                            ▼
      ┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────┐
      │   Backend Instance A    │  │   Backend Instance B    │  │   Backend Instance C    │
      │   (http://127.0.0.1:3001)│  │   (http://127.0.0.1:3002)│  │   (http://127.0.0.1:3003)│
      │  servedBy: Instance-3001│  │  servedBy: Instance-3002│  │  servedBy: Instance-3003│
      └────────────┬────────────┘  └────────────┬────────────┘  └────────────┬────────────┘
                   │                            │                            │
                   └────────────────────────────┼────────────────────────────┘
                                                ▼
                                  ┌───────────────────────────┐
                                  │      Redis Key-Store      │
                                  │   Atomic Lua Executions   │
                                  │        (Port 6380)        │
                                  └─────────────┬─────────────┘
```

---

## 3. Deployment Guide

### Option 1: 1-Click Deployment on Render.com (Recommended)
This repository includes a pre-configured `render.yaml` Infrastructure-as-Code blueprint file.

1. Push your repository to GitHub.
2. Log into [Render.com](https://dashboard.render.com/) and click **New +** -> **Blueprint**.
3. Select your GitHub repository. Render will automatically detect [render.yaml](file:///Users/madhavsharma/RateLIMITER/render.yaml) and provision:
   - **Managed Redis** (Internal free instance)
   - **Backend Web Service** (Express cluster + Load Balancer)
   - **Frontend Static Site** (React dashboard)
4. Click **Apply**. Render handles building and deploying all 3 services automatically!

---

### Option 2: Local Docker Compose Deployment
Spins up Redis 7, 3 backend workers, Load Balancer, and Nginx frontend in containerized isolation:

```bash
# Build and launch full container stack
docker compose up -d --build
```
- **Dashboard UI:** `http://localhost:8080`
- **Load Balancer Proxy:** `http://localhost:3000`

---

## 4. How to Run Locally

### Prerequisites
- Node.js v20+
- Local Redis running on port `6379` (`redis-server`)

### Step 1: Start Backend Cluster & Load Balancer
```bash
cd backend
npm install
npm run cluster
```
*Starts 3 stateless backend instances on ports 3001, 3002, 3003 + Load Balancer on port 3000.*

### Step 2: Start Frontend Dashboard
```bash
cd frontend
npm install
npm run dev
```
*Opens dashboard at `http://localhost:5173`.*

---

## 5. API Reference

### `POST /api/check`
Check rate limit for a client bucket.
- **Body:** `{ "clientId": "client-a", "cost": 1 }`
- **Response (200 OK):**
```json
{
  "allowed": true,
  "remaining": 9.0,
  "resetInMs": 2000,
  "capacity": 10,
  "refillRate": 0.5,
  "servedBy": "Instance-3001",
  "clientId": "client-a",
  "timestamp": 1720000000000
}
```
- **Response (429 Rate Limited):**
```json
{
  "allowed": false,
  "remaining": 0,
  "resetInMs": 1850,
  "capacity": 10,
  "refillRate": 0.5,
  "servedBy": "Instance-3002",
  "clientId": "client-a",
  "error": "Too Many Requests"
}
```

### `POST /api/config`
Dynamically update capacity and refill rate for a client in real-time.

---

## 6. Automated Testing

```bash
cd backend
npm test
```
- Runs Node.js test runner validating single-server accuracy and 30-request parallel atomicity across 3 backend instances.
