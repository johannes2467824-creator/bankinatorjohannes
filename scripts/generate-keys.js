
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const file = path.join(__dirname, '..', 'license-keys.txt');

const count = Number(process.argv[2] || 20);

if (!Number.isInteger(count) || count < 1 || count > 10000) {
  console.error('Ange ett antal mellan 1 och 10000.');
  process.exit(1);
}

const existing = fs.existsSync(file)
  ? fs.readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map(key => key.trim())
      .filter(Boolean)
  : [];

const keys = new Set(existing);
const generated = [];

while (generated.length < count) {
  const hex = crypto.randomBytes(8)
    .toString('hex')
    .toUpperCase();

  const key = 'BLY-' + hex.match(/.{1,4}/g).join('-');

  if (keys.has(key)) continue;

  keys.add(key);
  generated.push(key);
}

fs.writeFileSync(
  file,
  [...keys].join('\n') + '\n',
  { mode: 0o600 }
);

console.log(`Generated ${generated.length} new license keys.`);
console.log(`Total license keys: ${keys.size}`);
console.log('Saved to license-keys.txt');
