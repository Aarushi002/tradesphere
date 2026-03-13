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
