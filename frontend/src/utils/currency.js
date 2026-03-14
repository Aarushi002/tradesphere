/**
 * Format number as Indian Rupees (INR).
 * e.g. 125000 -> "₹1,25,000" ; 1234.56 -> "₹1,234.56"
 */
export function formatINR(value) {
  if (value == null || Number.isNaN(value)) return '₹0';
  const num = Number(value);
  const fixed = Number.isInteger(num) ? num : num.toFixed(2);
  const formatted = Number(fixed).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(num) ? 0 : 2,
  });
  return `₹${formatted}`;
}

/** Compact format for dashboard: 156000 -> "1.56L", 6690 -> "6.69k", 467 -> "467" */
export function formatINRCompact(value) {
  if (value == null || Number.isNaN(value)) return '0';
  const num = Number(value);
  if (num >= 1e7) return (num / 1e7).toFixed(2) + 'Cr';
  if (num >= 1e5) return (num / 1e5).toFixed(2) + 'L';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'k';
  return num.toFixed(0);
}
