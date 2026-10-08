// ---- template renderer (SPEC 5.11)
const escapeHtml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function render(template, values) {
  const missing = new Set();
  const text = String(template ?? '').replace(/\{\{\s*(\w+)\s*\}\}/g, (token, key) => {
    if (values[key] === undefined || values[key] === null || String(values[key]).trim() === '') { missing.add(key); return token; }
    return String(values[key]);
  });
  return { text, missing: [...missing] };
}
