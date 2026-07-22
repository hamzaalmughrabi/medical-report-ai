/**
 * js/utils.js
 * Pure utility functions with no dependencies on app state.
 */

export const byId = (id) => document.getElementById(id);
export const qs = (selector) => document.querySelector(selector);
export const qsa = (selector) => document.querySelectorAll(selector);

/**
 * Escapes HTML characters to prevent XSS.
 */
export const esc = (s) => {
    if (s === null || s === undefined) return "";
    return String(s)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
};

/**
 * Formats a date string or object into a localized string.
 */
export const formatDate = (dateInput) => {
    if (!dateInput) return "—";
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString();
};

/**
 * Debounce function for ensuring expensive operations don't run too often
 */
export const debounce = (func, wait) => {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
};

/**
 * Extracts initials from a name string.
 * Example: "Hamza Al-Mughrabi" -> "HA"
 */
export const getInitials = (name) => {
    if (!name || typeof name !== "string") return "?";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};
