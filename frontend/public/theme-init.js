// Applies the saved theme before first paint to avoid a flash of the wrong theme.
// Kept as a separate file so the Content-Security-Policy can forbid inline scripts.
try {
  var saved = localStorage.getItem('lockscope.theme');
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
} catch (e) {
  /* storage unavailable: follow the OS preference */
}
