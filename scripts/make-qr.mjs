// Generate a QR code PNG (and SVG) for the pitch slide.
// Usage: node scripts/make-qr.mjs <url> [outfile-base]
// Example: node scripts/make-qr.mjs https://visitpulse.vercel.app visitpulse-qr
import QRCode from "qrcode";

const url = process.argv[2];
if (!url) {
  console.error("Usage: node scripts/make-qr.mjs <url> [outfile-base]");
  process.exit(1);
}
const base = process.argv[3] || "visitpulse-qr";
const opts = { margin: 2, color: { dark: "#0f766e", light: "#ffffff" } };

await QRCode.toFile(`${base}.png`, url, { ...opts, width: 1000 });
await QRCode.toFile(`${base}.svg`, url, { ...opts, type: "svg" });
console.log(`Wrote ${base}.png and ${base}.svg for ${url}`);
