/**
 * Taana Baana — backend
 * ----------------------
 * Handles "call-only" order requests: no online payment is processed.
 * A customer submits their details + cart from the site, we save it as
 * an order request, and a human calls them to confirm and take payment.
 *
 * Storage: a local orders.json file (no database server required).
 * Good enough for a small shop; swap the storage functions for a real
 * database (Postgres, MongoDB, etc.) later without touching the routes.
 */

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 4000;
const ADMIN_KEY = process.env.ADMIN_KEY || "changeme"; // set a real one via env var in production
const ORDERS_FILE = path.join(__dirname, "orders.json");

app.use(cors());
app.use(express.json({ limit: "200kb" }));
app.use(express.static(path.join(__dirname, "public")));

/* ---------- tiny file-backed "database" ---------- */
function readOrders() {
  if (!fs.existsSync(ORDERS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(ORDERS_FILE, "utf-8"));
  } catch {
    return [];
  }
}
function writeOrders(orders) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

function makeOrderId() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TB-${stamp}-${rand}`;
}

/* ---------- validation ---------- */
function validateOrder(body) {
  const errors = [];
  if (!body || typeof body !== "object") return ["Invalid request body"];

  if (!body.name || typeof body.name !== "string" || body.name.trim().length < 2)
    errors.push("A valid name is required");

  const phoneDigits = (body.phone || "").replace(/[^\d]/g, "");
  if (phoneDigits.length < 7 || phoneDigits.length > 15)
    errors.push("A valid phone number is required");

  if (!body.address || typeof body.address !== "string" || body.address.trim().length < 5)
    errors.push("A delivery address is required");

  if (!body.city || typeof body.city !== "string" || body.city.trim().length < 2)
    errors.push("City is required");

  if (!Array.isArray(body.items) || body.items.length === 0)
    errors.push("Your bag is empty");

  if (typeof body.total !== "number" || body.total <= 0)
    errors.push("Order total is invalid");

  return errors;
}

/* ---------- routes ---------- */

// Customer submits an order request from the checkout modal.
app.post("/api/orders", (req, res) => {
  const errors = validateOrder(req.body);
  if (errors.length) {
    return res.status(400).json({ success: false, message: errors.join(". ") });
  }

  const order = {
    orderId: makeOrderId(),
    name: req.body.name.trim(),
    phone: req.body.phone.trim(),
    address: req.body.address.trim(),
    city: req.body.city.trim(),
    note: (req.body.note || "").trim(),
    items: req.body.items,
    total: req.body.total,
    status: "new", // new -> called -> confirmed -> delivered -> cancelled
    createdAt: new Date().toISOString()
  };

  const orders = readOrders();
  orders.unshift(order);
  writeOrders(orders);

  // Hook point: send yourself an SMS/WhatsApp/email notification here, e.g.
  // via Twilio, so you know to call the customer right away.

  res.status(201).json({
    success: true,
    orderId: order.orderId,
    message: "Order request received. We'll call you shortly."
  });
});

// Simple admin auth: pass the key as ?key=... or header x-admin-key.
function checkAdmin(req, res, next) {
  const key = req.headers["x-admin-key"] || req.query.key;
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  next();
}

// Admin: list all order requests, newest first.
app.get("/api/orders", checkAdmin, (req, res) => {
  res.json({ success: true, orders: readOrders() });
});

// Admin: update an order's status once you've called the customer.
app.patch("/api/orders/:orderId", checkAdmin, (req, res) => {
  const { status } = req.body;
  const allowed = ["new", "called", "confirmed", "delivered", "cancelled"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ success: false, message: `Status must be one of: ${allowed.join(", ")}` });
  }
  const orders = readOrders();
  const order = orders.find(o => o.orderId === req.params.orderId);
  if (!order) return res.status(404).json({ success: false, message: "Order not found" });
  order.status = status;
  writeOrders(orders);
  res.json({ success: true, order });
});

app.listen(PORT, () => {
  console.log(`Taana Baana server running at http://localhost:${PORT}`);
  console.log(`Admin dashboard at http://localhost:${PORT}/admin.html (key: ${ADMIN_KEY})`);
});
