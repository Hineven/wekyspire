// Simple global registry mapping card uniqueID -> DOM element
const registry = new Map();

export function registerCardEl(id, el) {
  if (id == null || !el) return;
  registry.set(id, el);
}

export function unregisterCardEl(id, el) {
  if (id == null) return;
  const current = registry.get(id);
  if (!current || (el && current !== el)) return;
  registry.delete(id);
}

export function getCardEl(id) {
  return registry.get(id) || null;
}

export default { registerCardEl, unregisterCardEl, getCardEl };

