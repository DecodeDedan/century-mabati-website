// Builds the WhatsApp quote request. There is no backend: the enquiry is sent
// straight to the sales line, which is how Century Mabati already takes orders.

export const SALES_WHATSAPP = '254718035476'

export const PRODUCTS = ['C-868 Tile', 'Wavetile', 'C-800 Tile', 'C-840 Tile', 'Stone Coated Mabati', 'Box Profile', 'Corrugated', 'Aluzinc', 'Curved Mabati', 'Canopy', 'Translucent sheets', 'Ridges & valleys', 'Roofing washers & nails', 'Not sure yet']

export const COLOURS = ['Maroon', 'Tile red', 'Terracotta', 'Forest green', 'Royal blue', 'Charcoal', 'Coffee brown', 'Not sure yet']

const LIMITS = { name: [2, 60], town: [0, 60], notes: [0, 300], length: [0.5, 12], quantity: [1, 5000] }

const KENYAN_MOBILE = /^(?:\+?254|0)[17]\d{8}$/

const text = (v) => (typeof v === 'string' ? v.trim() : '')

/**
 * @param {Record<string, string>} raw form values
 * @returns {{ok:true, message:string, url:string} | {ok:false, errors:Record<string,string>}}
 */
export function buildQuote(raw) {
  const v = {
    name: text(raw.name),
    phone: text(raw.phone).replace(/[\s-]/g, ''),
    product: text(raw.product),
    colour: text(raw.colour),
    length: Number(text(raw.length)),
    quantity: Number(text(raw.quantity)),
    town: text(raw.town),
    notes: text(raw.notes),
  }
  const errors = {}
  if (v.name.length < LIMITS.name[0] || v.name.length > LIMITS.name[1]) errors.name = 'Enter your name (2–60 characters).'
  if (v.phone && !KENYAN_MOBILE.test(v.phone)) errors.phone = 'Use a Kenyan mobile number, e.g. 0712 345 678.'
  if (!PRODUCTS.includes(v.product)) errors.product = 'Choose a product.'
  if (!COLOURS.includes(v.colour)) errors.colour = 'Choose a colour.'
  if (!Number.isFinite(v.length) || v.length < LIMITS.length[0] || v.length > LIMITS.length[1]) errors.length = 'Sheet length must be between 0.5 and 12 metres.'
  if (!Number.isInteger(v.quantity) || v.quantity < LIMITS.quantity[0] || v.quantity > LIMITS.quantity[1]) errors.quantity = 'Quantity must be a whole number from 1 to 5000.'
  if (v.town.length > LIMITS.town[1]) errors.town = 'Keep the location under 60 characters.'
  if (v.notes.length > LIMITS.notes[1]) errors.notes = 'Keep notes under 300 characters.'
  if (Object.keys(errors).length) return { ok: false, errors }

  const lines = [
    'Hello Century Mabati, I would like a quote.',
    `Name: ${v.name}`,
    v.phone && `Phone: ${v.phone}`,
    `Product: ${v.product}`,
    `Colour: ${v.colour}`,
    `Sheet length: ${v.length.toFixed(1)} m`,
    `Quantity: ${v.quantity} sheets`,
    v.town && `Delivery to: ${v.town}`,
    v.notes && `Notes: ${v.notes}`,
  ].filter(Boolean)
  const message = lines.join('\n')
  return { ok: true, message, url: `https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent(message)}` }
}
