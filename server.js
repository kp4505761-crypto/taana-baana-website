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
const PRODUCTS_FILE = path.join(__dirname, "products.json");
const SETTINGS_FILE = path.join(__dirname, "settings.json");

const DEFAULT_SETTINGS = {
  brandName: "Saree Khazana",
  tagline: "Guledgudda Khana & Ilkal",
  heroEyebrow: "Since 1952 · Guledgudda",
  heroText: "Started by Takusha Pawar in 1952 in the small town of Guledgudda, our family has been weaving and selling Khana and Ilkal sarees for over seven decades — offline, from the same shop, for most of those years. Now, that same trust comes straight to your phone.",
  footerStory: "Started by Takusha Pawar in 1952 in Guledgudda, home of the Khana and Ilkal weave — decades of offline trade, now finally online.",
  ownerName: "Kirankumar Pawar",
  address: "Guledgudda, Bagalkot, Karnataka – 587203",
  phone: "+91 99163 17235",
  copyright: "© 2026 Saree Khazana.",
  footerTagline: "Guledgudda Khana & Ilkal, since 1952.",
  weaveSteps: [
    { title:"Dyeing", text:"Raw silk skeins are hand-dipped in natural and reactive dyes, batch by batch, so no two lots match exactly." },
    { title:"Warping", text:"Thousands of warp threads are stretched and aligned on the loom frame — the saree's length, decided by hand." },
    { title:"Weaving", text:"The weaver throws the shuttle, thread by thread, for up to three weeks on a single elaborate saree." },
    { title:"Zari Work", text:"Real gold and silver-coated thread is woven into the border and pallu, motif by motif." },
    { title:"Finishing", text:"Edges are hand-checked, starched lightly, and folded the traditional way before it ever reaches you." }
  ],
  testimonials: [
    { text:"I wore my grandmother's weaving technique — just from a different loom. The zari border alone was worth the wait.", who:"Ananya R., Chennai" },
    { text:"Ordered a Banarasi for my sister's wedding. The colour in person was even richer than the photos.", who:"Priya M., Pune" },
    { text:"You can feel the difference between this and a printed saree the moment you touch it.", who:"Lakshmi S., Hyderabad" }
  ]
};

const DEFAULT_PRODUCTS = [
  { id:1, name:"Radha Red Kanjivaram", cat:"Kanjivaram Silk", price:18500, was:22000, stock:5, image:"", gradient:"linear-gradient(160deg,#7A1830,#4A0E1F 70%)" },
  { id:2, name:"Kashi Gold Banarasi", cat:"Banarasi Silk", price:24500, was:null, stock:5, image:"", gradient:"linear-gradient(160deg,#B8863B,#7A5A22 70%)" },
  { id:3, name:"Monsoon Teal Chiffon", cat:"Chiffon", price:6200, was:7800, stock:5, image:"", gradient:"linear-gradient(160deg,#1E6B63,#0F3733 70%)" },
  { id:4, name:"Ivory Mist Organza", cat:"Organza", price:8900, was:null, stock:5, image:"", gradient:"linear-gradient(160deg,#E9D9C8,#B79C7E 70%)" },
  { id:5, name:"Maheshwari Cotton Check", cat:"Handloom Cotton", price:4400, was:5200, stock:5, image:"", gradient:"linear-gradient(160deg,#C9722C,#7A431A 70%)" },
  { id:6, name:"Zardozi Bridal Maroon", cat:"Bridal", price:38000, was:45000, stock:5, image:"", gradient:"linear-gradient(160deg,#5C0E22,#2C0912 70%)" },
  { id:7, name:"Wildwood Tussar", cat:"Tussar Silk", price:9800, was:null, stock:5, image:"", gradient:"linear-gradient(160deg,#8A6B3A,#4E3C1E 70%)" },
  { id:8, name:"Powder Blue Linen Drape", cat:"Linen", price:5100, was:6000, stock:5, image:"", gradient:"linear-gradient(160deg,#3D5A6C,#1E2E38 70%)" }
];

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

function readProducts() {
  if (!fs.existsSync(PRODUCTS_FILE)) {
    writeProducts(DEFAULT_PRODUCTS);
    return DEFAULT_PRODUCTS;
  }
  try {
    return JSON.parse(fs.readFileSync(PRODUCTS_FILE, "utf-8"));
  } catch {
    return DEFAULT_PRODUCTS;
  }
}
function writeProducts(products) {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2));
}
function nextProductId(products) {
  return products.reduce((max, p) => Math.max(max, p.id), 0) + 1;
}

function readSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) {
    writeSettings(DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8")) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
function writeSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
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

function validateProduct(body, { partial = false } = {}) {
  const errors = [];
  if (!body || typeof body !== "object") return ["Invalid request body"];

  if (!partial || body.name !== undefined) {
    if (!body.name || typeof body.name !== "string" || body.name.trim().length < 2)
      errors.push("A saree name is required");
  }
  if (!partial || body.cat !== undefined) {
    if (!body.cat || typeof body.cat !== "string" || body.cat.trim().length < 2)
      errors.push("A category is required");
  }
  if (!partial || body.price !== undefined) {
    if (typeof body.price !== "number" || body.price <= 0)
      errors.push("Price must be a number greater than 0");
  }
  if (body.was !== undefined && body.was !== null) {
    if (typeof body.was !== "number" || body.was <= 0)
      errors.push("Strikethrough price must be a number greater than 0, or left blank");
  }
  if (!partial || body.stock !== undefined) {
    if (typeof body.stock !== "number" || body.stock < 0 || !Number.isInteger(body.stock))
      errors.push("Stock must be a whole number, 0 or more");
  }
  if (body.image !== undefined && typeof body.image !== "string")
    errors.push("Image must be a URL (text)");

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

  // Reserve stock so the same saree isn't requested more times than we have.
  const products = readProducts();
  req.body.items.forEach(item => {
    const p = products.find(pr => pr.id === item.id);
    if (p && typeof p.stock === "number") {
      p.stock = Math.max(0, p.stock - item.qty);
    }
  });
  writeProducts(products);

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

// Public: list all sarees — used by the storefront to build the collection grid.
app.get("/api/products", (req, res) => {
  res.json({ success: true, products: readProducts() });
});

// Admin: add a new saree (name, category, price, optional discount price,
// stock count, and an image URL — paste a photo link, no file upload needed).
app.post("/api/products", checkAdmin, (req, res) => {
  const errors = validateProduct(req.body);
  if (errors.length) {
    return res.status(400).json({ success: false, message: errors.join(". ") });
  }
  const products = readProducts();
  const product = {
    id: nextProductId(products),
    name: req.body.name.trim(),
    cat: req.body.cat.trim(),
    price: req.body.price,
    was: req.body.was || null,
    stock: req.body.stock,
    image: (req.body.image || "").trim(),
    gradient: (req.body.gradient || "").trim() || "linear-gradient(160deg,#7A1830,#4A0E1F 70%)"
  };
  products.push(product);
  writeProducts(products);
  res.status(201).json({ success: true, product });
});

// Admin: edit an existing saree — send only the fields you want to change.
app.put("/api/products/:id", checkAdmin, (req, res) => {
  const errors = validateProduct(req.body, { partial: true });
  if (errors.length) {
    return res.status(400).json({ success: false, message: errors.join(". ") });
  }
  const products = readProducts();
  const product = products.find(p => p.id === Number(req.params.id));
  if (!product) return res.status(404).json({ success: false, message: "Saree not found" });

  ["name", "cat", "price", "stock", "image", "gradient"].forEach(field => {
    if (req.body[field] !== undefined) product[field] = req.body[field];
  });
  if (req.body.was !== undefined) product.was = req.body.was || null;

  writeProducts(products);
  res.json({ success: true, product });
});

// Admin: remove a saree from the collection entirely.
app.delete("/api/products/:id", checkAdmin, (req, res) => {
  const products = readProducts();
  const exists = products.some(p => p.id === Number(req.params.id));
  if (!exists) return res.status(404).json({ success: false, message: "Saree not found" });
  writeProducts(products.filter(p => p.id !== Number(req.params.id)));
  res.json({ success: true });
});

// Public: site text (brand name, story, contact info) — used by the storefront.
app.get("/api/settings", (req, res) => {
  res.json({ success: true, settings: readSettings() });
});

// Admin: update site text. Send only the fields you want to change.
app.put("/api/settings", checkAdmin, (req, res) => {
  const current = readSettings();
  const allowedFields = [
    "brandName", "tagline", "heroEyebrow", "heroText", "footerStory",
    "ownerName", "address", "phone", "copyright", "footerTagline"
  ];
  allowedFields.forEach(field => {
    if (typeof req.body[field] === "string") current[field] = req.body[field].trim();
  });

  if (Array.isArray(req.body.weaveSteps)) {
    const valid = req.body.weaveSteps.every(s => s && typeof s.title === "string" && typeof s.text === "string");
    if (!valid) return res.status(400).json({ success: false, message: "Each weave step needs a title and text" });
    current.weaveSteps = req.body.weaveSteps.map(s => ({ title: s.title.trim(), text: s.text.trim() }));
  }
  if (Array.isArray(req.body.testimonials)) {
    const valid = req.body.testimonials.every(t => t && typeof t.text === "string" && typeof t.who === "string");
    if (!valid) return res.status(400).json({ success: false, message: "Each testimonial needs a quote and a name" });
    current.testimonials = req.body.testimonials.map(t => ({ text: t.text.trim(), who: t.who.trim() }));
  }

  writeSettings(current);
  res.json({ success: true, settings: current });
});

app.listen(PORT, () => {
  console.log(`Taana Baana server running at http://localhost:${PORT}`);
  console.log(`Admin dashboard at http://localhost:${PORT}/admin.html (key: ${ADMIN_KEY})`);
});
