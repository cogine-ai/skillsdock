---
name: cogine-design-system
description: Cogine Design Language v2.1 for frontend interfaces. Use for Next.js/React projects, Tailwind configs, or UI component development. Provides brand colors (H=195 sky blue), design tokens, visual signatures (deep space background, blue glow, glass morphism), and component contracts.
---

# Cogine Design System

## Overview

Cogine Design Language v2.1 provides the unified design specification for all Cogine products. When building any Cogine frontend interface, component, or styling, follow this design system to ensure visual consistency and brand alignment.

**Core Brand DNA (immutable):**
- Primary color hue: **195** (sky blue) - never change
- Font: Inter (sans-serif), JetBrains Mono (monospace)
- Base radius: 0.5rem (8px)
- Animation curves: ease-out, ease-in-out, ease-spring

## Quick Start

### For Immediate Use

**Essential CSS tokens:**
```css
:root {
  --brand-hue: 195;
  --color-primary: hsl(195 100% 60%);  /* Dark mode */
  --color-primary-light: hsl(195 100% 45%);  /* Light mode */
  --bg-void: hsl(0 0% 0%);  /* Deep space black */
  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --radius-base: 0.5rem;
}
```

**Tailwind config (CSS variables):**
```js
// tailwind.config.js
{
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: 'hsl(195 100% 60%)',
          light: 'hsl(195 100% 45%)',
        },
        background: {
          void: 'hsl(0 0% 0%)',
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        base: '0.5rem',
        full: '9999px',
      }
    }
  }
}
```

## Visual Signatures (Apply These)

### 1. Deep Space Background + Blue Glow

Always use pure black for dark mode backgrounds with sky blue glow accents:

```css
background: hsl(0 0% 0%);  /* Pure black */

/* Primary elements with glow */
box-shadow: 0 0 20px -5px hsl(195 100% 60% / 0.4);
```

### 2. White → Blue Gradient

Brand gradient for emphasis:

```css
background: linear-gradient(to right, #fff, hsl(195 100% 70%));

/* Gradient text */
background: linear-gradient(to right, #fff, hsl(195 100% 70%));
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
```

### 3. Glass Morphism

For overlays, modals, or navigation:

```css
background: hsl(0 0% 0% / 0.85);
backdrop-filter: blur(12px);
border: 1px solid hsl(0 0% 100% / 0.08);
```

### 4. Pill-Shaped Interactive Elements

Primary buttons, badges, search inputs:

```css
border-radius: 9999px;
```

## Component Contracts

### Button

- Primary: gradient fill (white → blue)
- Secondary: outline or weak fill
- Radius: 9999px (pill shape)
- Hover: translateY(-1px) with ease-out

### Card

- Border: use --border color
- Background: slightly brighter than page background
- Hover: optional border highlight / lift / shadow
- Padding: follow spacing system

### Input

- Focus: brand color highlight with soft shadow
- Error: destructive color (hsl(0 84% 60%))
- Radius: base (0.5rem) or pill for search

## Design Tokens Reference

For complete design token specifications (colors, spacing, typography, shadows, animations), see [references/tokens.md](references/tokens.md).

## CSS Component Examples

For ready-to-use CSS snippets for common components (buttons, cards, inputs, navbar, badges), see [references/components.css](references/components.css).

## Visual Consistency Checklist

Every Cogine product must satisfy **at least 4** of these:

| # | Requirement | Description |
|---|-------------|-------------|
| 1 | Brand color H=195 | Primary hue in both modes |
| 2 | Gradient elements | Titles, buttons, or accents |
| 3 | Pure black dark mode | #000000 background |
| 4 | Pill-shaped buttons | 9999px border-radius |
| 5 | Inter font | Modern sans-serif |
| 6 | Glass morphism | Navigation, modals, overlays |
| 7 | Ease-out animations | No linear for micro-interactions |

## Usage Patterns

### For Next.js + Tailwind Projects

1. Add brand colors to tailwind.config.js
2. Use `bg-background-void` for page backgrounds
3. Apply `bg-gradient-to-r from-white to-brand` for primary actions
4. Use `rounded-full` for buttons and badges
5. Add `shadow-[0_0_20px_-5px_hsl(195_100%_60%/_0.4)]` for glow effects

### For CSS-Only Projects

1. Include CSS variables in :root
2. Use HSL(195, 100%, 60%) for primary color
3. Apply glass morphism to overlays
4. Use ease-out curves for all transitions

## Resources

### scripts/

This skill includes a Tailwind config generator script for quick project setup.

Run: `python3 scripts/tailwind_config.py`

### references/

- `tokens.md` - Complete design token specifications
- `components.css` - Ready-to-use CSS component snippets

### assets/

- `tailwind-theme.js` - Example Tailwind theme extension
