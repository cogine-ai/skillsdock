# Cogine Design Tokens

Complete token specifications for Cogine Design Language v2.1.

## Table of Contents

1. [Color System](#color-system)
2. [Typography](#typography)
3. [Spacing](#spacing)
4. [Border Radius](#border-radius)
5. [Shadows](#shadows)
6. [Animations](#animations)
7. [Z-Index Layers](#z-index-layers)

---

## Color System

### Brand Colors (Immutable)

| Token | Value | Usage |
|--------|--------|-------|
| `--brand-hue` | 195 | Base hue - never change |
| `--brand-saturation` | 100% | Brand saturation |
| `--brand-lightness-dark` | 60% | Primary in dark mode |
| `--brand-lightness-light` | 45% | Primary in light mode |

```css
:root {
  --brand-hue: 195;
  --color-primary: hsl(var(--brand-hue) var(--brand-saturation) var(--brand-lightness-dark));
  --color-primary-hover: hsl(var(--brand-hue) var(--brand-saturation) 65%);
  --color-primary-active: hsl(var(--brand-hue) var(--brand-saturation) 55%);
}

.light {
  --color-primary: hsl(var(--brand-hue) var(--brand-saturation) var(--brand-lightness-light));
}
```

### Semantic Colors

| Token | Value | Usage |
|--------|--------|-------|
| `--color-success` | hsl(142 70% 45%) | Success states |
| `--color-warning` | hsl(38 92% 50%) | Warning states |
| `--color-error` | hsl(0 84% 60%) | Error states |
| `--color-info` | hsl(195 100% 60%) | Info messages |

### Neutral Scale (Gray)

| Token | Value |
|--------|--------|
| `--gray-50` | hsl(0 0% 98%) |
| `--gray-100` | hsl(0 0% 96%) |
| `--gray-200` | hsl(0 0% 90%) |
| `--gray-300` | hsl(0 0% 80%) |
| `--gray-400` | hsl(0 0% 65%) |
| `--gray-500` | hsl(0 0% 50%) |
| `--gray-600` | hsl(0 0% 35%) |
| `--gray-700` | hsl(0 0% 25%) |
| `--gray-800` | hsl(0 0% 15%) |
| `--gray-900` | hsl(0 0% 10%) |
| `--gray-950` | hsl(0 0% 5%) |

### Dark Mode Semantics

| Token | Value | Usage |
|--------|--------|-------|
| `--bg` | hsl(0 0% 0%) | Page background |
| `--bg-subtle` | hsl(0 0% 5%) | Card/surface background |
| `--bg-muted` | hsl(0 0% 10%) | Disabled/weak elements |
| `--fg` | hsl(0 0% 100%) | Primary text |
| `--fg-muted` | hsl(0 0% 55%) | Secondary text |
| `--border` | hsl(0 0% 15%) | Borders/dividers |

### Light Mode Semantics

```css
.light {
  --bg: hsl(0 0% 100%);
  --bg-subtle: hsl(0 0% 98%);
  --bg-muted: hsl(0 0% 96%);
  --fg: hsl(0 0% 5%);
  --fg-muted: hsl(0 0% 45%);
  --border: hsl(0 0% 90%);
}
```

---

## Typography

### Font Families

```css
:root {
  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", "Fira Code", monospace;
}
```

### Font Sizes

| Token | Value | Pixels | Usage |
|--------|--------|---------|-------|
| `--text-xs` | 0.75rem | 12px | Labels, tags |
| `--text-sm` | 0.875rem | 14px | Buttons, meta |
| `--text-base` | 1rem | 16px | Body text |
| `--text-lg` | 1.125rem | 18px | Small headings |
| `--text-xl` | 1.25rem | 20px | Card titles |
| `--text-2xl` | 1.5rem | 24px | Section titles |
| `--text-3xl` | 1.875rem | 30px | Page titles (mobile) |
| `--text-4xl` | 2.25rem | 36px | Page titles (tablet) |
| `--text-5xl` | 3rem | 48px | Page titles (desktop) |
| `--text-6xl` | 3.75rem | 60px | Hero titles |

### Line Height

| Token | Value | Usage |
|--------|--------|-------|
| `--leading-tight` | 1.15 | Headings, tight text |
| `--leading-normal` | 1.5 | Body text |
| `--leading-relaxed` | 1.75 | Comfortable reading |

### Letter Spacing

| Token | Value | Usage |
|--------|--------|-------|
| `--tracking-tight` | -0.02em | Compact headings |
| `--tracking-normal` | 0 | Normal text |
| `--tracking-wide` | 0.02em | Emphasis, labels |

---

## Spacing

Based on 4px grid system.

| Token | Value | Pixels |
|--------|--------|---------|
| `--space-1` | 0.25rem | 4px |
| `--space-2` | 0.5rem | 8px |
| `--space-3` | 0.75rem | 12px |
| `--space-4` | 1rem | 16px |
| `--space-5` | 1.25rem | 20px |
| `--space-6` | 1.5rem | 24px |
| `--space-8` | 2rem | 32px |
| `--space-10` | 2.5rem | 40px |
| `--space-12` | 3rem | 48px |
| `--space-16` | 4rem | 64px |
| `--space-20` | 5rem | 80px |
| `--space-24` | 6rem | 96px |

---

## Border Radius

| Token | Value | Pixels | Usage |
|--------|--------|---------|-------|
| `--radius-sm` | 0.25rem | 4px | Small elements |
| `--radius-md` | 0.375rem | 6px | Inputs |
| `--radius-base` | 0.5rem | 8px | Cards, buttons |
| `--radius-xl` | 0.75rem | 12px | Large cards |
| `--radius-2xl` | 1rem | 16px | Containers |
| `--radius-full` | 9999px | Pills, badges |

---

## Shadows

| Token | Value | Usage |
|--------|--------|-------|
| `--shadow-sm` | 0 1px 2px hsl(0 0% 0% / 0.05) | Subtle elevation |
| `--shadow-md` | 0 4px 6px -1px hsl(0 0% 0% / 0.1) | Cards |
| `--shadow-lg` | 0 10px 15px -3px hsl(0 0% 0% / 0.1) | Modals |
| `--shadow-xl` | 0 20px 25px -5px hsl(0 0% 0% / 0.15) | Popovers |
| `--shadow-glow` | 0 0 20px -5px hsl(195 100% 60% / 0.4) | Brand glow accent |

---

## Animations

### Easing Curves

| Token | Value | Usage |
|--------|--------|-------|
| `--ease-out` | cubic-bezier(0.33, 1, 0.68, 1) | Micro-interactions |
| `--ease-in-out` | cubic-bezier(0.65, 0, 0.35, 1) | Enter/exit |
| `--ease-spring` | cubic-bezier(0.34, 1.56, 0.64, 1) | Bouncy effects |

### Durations

| Token | Value | Usage |
|--------|--------|-------|
| `--duration-instant` | 50ms | Click feedback |
| `--duration-fast` | 150ms | Hover states |
| `--duration-normal` | 300ms | Standard transitions |
| `--duration-slow` | 500ms | Entry animations |

### Keyframes

```css
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
```

---

## Z-Index Layers

| Token | Value | Usage |
|--------|--------|-------|
| `--z-dropdown` | 100 | Dropdowns |
| `--z-sticky` | 200 | Sticky headers |
| `--z-modal` | 300 | Modals |
| `--z-popover` | 400 | Tooltips, popovers |
| `--z-tooltip` | 500 | Tooltips |
