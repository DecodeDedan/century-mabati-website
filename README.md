# Century Mabati LTD — website

One-page site for Century Mabati LTD, Nakuru: the product range (C-868, Wavetile, C-800, C-840, Stone Coated,
Box Profile, Corrugated, Aluzinc, Curved Mabati, Canopy), the factory and fittings, real roofs, and a quote form that
goes straight to the sales WhatsApp line (0718 035 476). A roof planner turns building measurements into sheet cut length,
roof area and ridge/hip lengths and sends them to sales on WhatsApp. The phone number stays on screen while scrolling: in the
header on desktop, in a bottom call bar on phones.

## Commands

```bash
npm install
npm run dev      # http://localhost:5173
npm run check    # unit tests + production build
npm run build    # outputs static files to dist/
```

## Deploying

`dist/` is plain static files. Upload it to any static host (Netlify, Vercel, Cloudflare Pages, or a cPanel
`public_html` folder). Asset paths are root-relative, so serve the site from the domain root.
After choosing a domain, set `og:image` in `index.html` to the absolute URL so link previews show the photo.

## Where things live

| File | Purpose |
| --- | --- |
| `index.html` | All page content; each product card's `data-quote-product` must match `PRODUCTS` in `src/quote.js` (tested) |
| `src/motion.js` | Lenis smooth scroll + GSAP reveals, split headings, gallery parallax, pinned factory strip |
| `src/quote.js` / `src/form.js` | WhatsApp quote builder + form UI |
| `src/estimate.js` / `src/estimator.js` | Roof planner maths (tested) + its form UI and the product filter chips |
| `src/theme.js` / `src/nav.js` | Light/dark/system theme switch, mobile menu |
| `public/img/` | Client photos, resized for web (`p-*` products, `home-*` roofs, factory and delivery shots) |

Photos come from the client's "New Batch" folder, named after the product in each file name, exported as WebP with
the phone-camera (vivo) stamp cropped off the bottom.
