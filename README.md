# Taana Baana — website + call-only order backend

No online payment is processed anywhere in this project. A customer fills in
the checkout form on the site, the backend saves it as an order request, and
your team calls them to confirm the order and take payment (cash/UPI on call).

## What's inside

```
taana-baana-website/
├── server.js          # Express backend — receives & stores order requests
├── package.json
├── .env.example        # copy to .env and set a real admin key
├── orders.json          # created automatically once the first order comes in
└── public/
    ├── index.html      # the storefront (frontend)
    └── admin.html       # dashboard to view & update order requests
```

## Run it locally

```bash
cd taana-baana-website
npm install
npm start
```

Then open:
- **Storefront:** http://localhost:4000
- **Admin dashboard:** http://localhost:4000/admin.html (admin key: `changeme` unless you set one — see below)

The frontend and backend are served from the **same Node process**, on the
same port — no separate frontend hosting needed.

## Set a real admin key

Anyone who knows the admin key can see customer names, phone numbers and
addresses, so don't leave it as `changeme`.

```bash
cp .env.example .env
# edit .env and set ADMIN_KEY to something private
```

Then start the server with that variable loaded, e.g.:
```bash
ADMIN_KEY=your-real-key npm start
```
(Or use a process manager / hosting platform's environment variable settings — see below.)

## How an order flows

1. Customer adds sarees to the bag and clicks **Request a Callback**.
2. They fill in name, phone, address, city, and an optional note.
3. The frontend sends this to `POST /api/orders`.
4. The backend validates it, saves it to `orders.json` with a unique order ID
   and status `new`, and returns that ID to the customer.
5. You open `/admin.html`, enter your admin key, and see the request.
6. You call the customer, confirm the order, then update its status
   (`new` → `called` → `confirmed` → `delivered`) from the dropdown.

## Deploying for real

Any Node-friendly host works — **Render**, **Railway**, **Fly.io**, or a
small VPS are all good free/cheap options:

1. Push this folder to a GitHub repo.
2. Connect the repo on your chosen platform, set the **start command** to
   `npm start`, and add an `ADMIN_KEY` environment variable in their dashboard.
3. Once deployed you'll get a live URL (e.g. `taana-baana.onrender.com`) —
   that's your real website, storefront and admin dashboard included.
4. Point a custom domain at it if you have one.

### A note on `orders.json`
This stores orders in a flat file next to the server. It's fine for a small
shop getting started, but most free hosting platforms wipe local files on
redeploy or restart. Once you're past the early stage, swap `readOrders()` /
`writeOrders()` in `server.js` for a real database (Postgres via Supabase or
Railway is a solid free option) — the API routes don't need to change.

## Notifying yourself of new orders

Right now a new order just sits in `orders.json` until you check the admin
page. To get pinged immediately, add a notification inside the
`POST /api/orders` handler in `server.js` — e.g. an SMS/WhatsApp message via
Twilio, or an email via Resend/SendGrid. There's a comment marking exactly
where to add it.
