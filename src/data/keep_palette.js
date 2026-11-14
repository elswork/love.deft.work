/**
 * Paleta de colores estilo Google Keep Moderno (adaptativa Light / Dark)
 * e iconos predefinidos para las Tarjetas de Categoría y Mini-Tarjetas.
 */

export const KEEP_COLORS = [
  {
    key: 'emerald',
    label: 'Esmeralda',
    accent: '#10b981',
    bgLight: '#ecfdf5',
    bgDark: '#063326',
    borderLight: '#a7f3d0',
    borderDark: '#0f5c43',
  },
  {
    key: 'cobalt',
    label: 'Cobalto',
    accent: '#3b82f6',
    bgLight: '#eff6ff',
    bgDark: '#0f2447',
    borderLight: '#bfdbfe',
    borderDark: '#1e3a8a',
  },
  {
    key: 'amber',
    label: 'Ámbar',
    accent: '#f59e0b',
    bgLight: '#fffbeb',
    bgDark: '#3b2506',
    borderLight: '#fde68a',
    borderDark: '#78350f',
  },
  {
    key: 'violet',
    label: 'Violeta',
    accent: '#8b5cf6',
    bgLight: '#f5f3ff',
    bgDark: '#261447',
    borderLight: '#ddd6fe',
    borderDark: '#4c1d95',
  },
  {
    key: 'rose',
    label: 'Rubí',
    accent: '#f43f5e',
    bgLight: '#fff1f2',
    bgDark: '#3f111d',
    borderLight: '#fecdd3',
    borderDark: '#881337',
  },
  {
    key: 'cyan',
    label: 'Cian',
    accent: '#06b6d4',
    bgLight: '#ecfeff',
    bgDark: '#083344',
    borderLight: '#a5f3fc',
    borderDark: '#155e75',
  },
  {
    key: 'coral',
    label: 'Coral',
    accent: '#f97316',
    bgLight: '#fff7ed',
    bgDark: '#3b1a08',
    borderLight: '#fed7aa',
    borderDark: '#7c2d12',
  },
  {
    key: 'lime',
    label: 'Lima',
    accent: '#84cc16',
    bgLight: '#f7fee7',
    bgDark: '#1f2e08',
    borderLight: '#d9f99d',
    borderDark: '#3f6212',
  },
  {
    key: 'indigo',
    label: 'Índigo',
    accent: '#6366f1',
    bgLight: '#eef2ff',
    bgDark: '#1b1d47',
    borderLight: '#c7d2fe',
    borderDark: '#3730a3',
  },
  {
    key: 'slate',
    label: 'Pizarra',
    accent: '#64748b',
    bgLight: '#f8fafc',
    bgDark: '#1e293b',
    borderLight: '#cbd5e1',
    borderDark: '#334155',
  },
];

export const CATEGORY_PRESETS = {
  'Tecnología': { colorKey: 'cyan', icon: '⚡' },
  'Ciencia y Tecnología': { colorKey: 'cyan', icon: '⚡' },
  'IA & Código': { colorKey: 'cobalt', icon: '🤖' },
  'Motor': { colorKey: 'emerald', icon: '🏎️' },
  'Vehículos y Transporte': { colorKey: 'emerald', icon: '🏎️' },
  'Gastro': { colorKey: 'amber', icon: '🍷' },
  'Vino': { colorKey: 'rose', icon: '🍇' },
  'Gastronomía y Alimentación': { colorKey: 'amber', icon: '🍷' },
  'Cultura': { colorKey: 'violet', icon: '🎬' },
  'Arte y Cultura': { colorKey: 'violet', icon: '🎭' },
  'Libros & Frases': { colorKey: 'indigo', icon: '📖' },
  'Palabras & Léxico': { colorKey: 'lime', icon: '🔤' },
  'Ideas & Citas': { colorKey: 'coral', icon: '💡' },
  'Herramientas': { colorKey: 'emerald', icon: '🛠️' },
  'Relojería': { colorKey: 'amber', icon: '⌚' },
  'Anticitera': { colorKey: 'violet', icon: '🏛️' },
  'General': { colorKey: 'slate', icon: '📌' },
};

export function getColorConfig(colorKeyOrCategory) {
  const byKey = KEEP_COLORS.find((c) => c.key === colorKeyOrCategory);
  if (byKey) return byKey;

  const preset = CATEGORY_PRESETS[colorKeyOrCategory];
  if (preset) {
    return KEEP_COLORS.find((c) => c.key === preset.colorKey) || KEEP_COLORS[0];
  }

  // Deterministic color based on string hash
  const str = String(colorKeyOrCategory || 'General');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return KEEP_COLORS[hash % KEEP_COLORS.length];
}

export function getCategoryIcon(categoryName, customIcon) {
  if (customIcon) return customIcon;
  if (CATEGORY_PRESETS[categoryName]?.icon) {
    return CATEGORY_PRESETS[categoryName].icon;
  }
  const lower = String(categoryName || '').toLowerCase();
  if (lower.includes('ia') || lower.includes('tech') || lower.includes('tecno')) return '⚡';
  if (lower.includes('cine') || lower.includes('pel') || lower.includes('serie')) return '🎬';
  if (lower.includes('músic') || lower.includes('music') || lower.includes('audio')) return '🎧';
  if (lower.includes('vino') || lower.includes('gastro') || lower.includes('rest')) return '🍷';
  if (lower.includes('motor') || lower.includes('coche') || lower.includes('auto')) return '🏎️';
  if (lower.includes('libro') || lower.includes('lectura') || lower.includes('cita')) return '📖';
  if (lower.includes('palabra') || lower.includes('vocab') || lower.includes('dicc')) return '🔤';
  if (lower.includes('link') || lower.includes('web') || lower.includes('url')) return '🔗';
  if (lower.includes('idea') || lower.includes('frase')) return '💡';
  return '📌';
}
