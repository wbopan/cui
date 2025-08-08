import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'

// Set initial theme before React mounts to avoid FOUC
(() => {
  try {
    const storageKey = 'cui-theme';
    const stored = localStorage.getItem(storageKey);
    const colorScheme = (stored === 'light' || stored === 'dark' || stored === 'system') ? stored : 'system';
    const systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const mode = colorScheme === 'system' ? (systemDark ? 'dark' : 'light') : colorScheme;
    document.documentElement.setAttribute('data-theme', mode);
    if (mode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch {}
})();

// Update theme color meta tag based on CSS variables
const updateThemeColor = () => {
  const computedStyle = getComputedStyle(document.documentElement);
  const bgColor = computedStyle.getPropertyValue('--color-bg-primary').trim();
  const themeColorMeta = document.getElementById('theme-color-meta') as HTMLMetaElement;
  if (themeColorMeta && bgColor) {
    themeColorMeta.content = bgColor;
  }
};

// Watch for theme changes
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
      setTimeout(updateThemeColor, 0); // Let CSS update first
    }
  });
});

observer.observe(document.documentElement, { attributes: true });

// Initial update
document.addEventListener('DOMContentLoaded', updateThemeColor);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Register Service Worker for PWA & Push
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}