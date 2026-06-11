const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "www");
const assets = [
  "index.html",
  "style.css",
  "app.js",
  "sync-config.js",
  "service-worker.js",
  "manifest.webmanifest",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "legal.css",
  "privacy.html",
  "terms.html",
  "support.html",
  "account-deletion.html",
];

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

assets.forEach((asset) => {
  fs.copyFileSync(path.join(root, asset), path.join(output, asset));
});

console.log(`Built ${assets.length} web assets in ${output}`);
