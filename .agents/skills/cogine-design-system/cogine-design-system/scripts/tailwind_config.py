#!/usr/bin/env python3
"""
Generate Tailwind CSS theme configuration for Cogine Design System.
Usage: python3 tailwind_config.py
"""

import json

cogine_theme = {
    "theme": {
        "extend": {
            "colors": {
                "brand": {
                    "DEFAULT": "hsl(195 100% 60%)",
                    "light": "hsl(195 100% 45%)",
                    "hover": "hsl(195 100% 65%)",
                    "active": "hsl(195 100% 55%)",
                },
                "background": {
                    "DEFAULT": "hsl(0 0% 0%)",
                    "void": "hsl(0 0% 0%)",
                    "subtle": "hsl(0 0% 5%)",
                    "muted": "hsl(0 0% 10%)",
                },
                "foreground": {
                    "DEFAULT": "hsl(0 0% 100%)",
                    "muted": "hsl(0 0% 55%)",
                },
                "border": {
                    "DEFAULT": "hsl(0 0% 15%)",
                },
                "gray": {
                    "50": "hsl(0 0% 98%)",
                    "100": "hsl(0 0% 96%)",
                    "200": "hsl(0 0% 90%)",
                    "300": "hsl(0 0% 80%)",
                    "400": "hsl(0 0% 65%)",
                    "500": "hsl(0 0% 50%)",
                    "600": "hsl(0 0% 35%)",
                    "700": "hsl(0 0% 25%)",
                    "800": "hsl(0 0% 15%)",
                    "900": "hsl(0 0% 10%)",
                    "950": "hsl(0 0% 5%)",
                },
                "success": {
                    "DEFAULT": "hsl(142 70% 45%)",
                    "fg": "hsl(142 70% 45%)",
                    "bg": "hsl(142 70% 45% / 0.15)",
                },
                "warning": {
                    "DEFAULT": "hsl(38 92% 50%)",
                    "fg": "hsl(38 92% 50%)",
                    "bg": "hsl(38 92% 50% / 0.15)",
                },
                "error": {
                    "DEFAULT": "hsl(0 84% 60%)",
                    "fg": "hsl(0 84% 60%)",
                    "bg": "hsl(0 84% 60% / 0.15)",
                },
            },
            "fontFamily": {
                "sans": [
                    "Inter",
                    "-apple-system",
                    "BlinkMacSystemFont",
                    "Segoe UI",
                    "sans-serif",
                ],
                "mono": [
                    "JetBrains Mono",
                    "Fira Code",
                    "monospace",
                ],
            },
            "fontSize": {
                "xs": ["0.75rem", { "lineHeight": "1rem" }],
                "sm": ["0.875rem", { "lineHeight": "1.25rem" }],
                "base": ["1rem", { "lineHeight": "1.5rem" }],
                "lg": ["1.125rem", { "lineHeight": "1.75rem" }],
                "xl": ["1.25rem", { "lineHeight": "1.75rem" }],
                "2xl": ["1.5rem", { "lineHeight": "2rem" }],
                "3xl": ["1.875rem", { "lineHeight": "2.25rem" }],
                "4xl": ["2.25rem", { "lineHeight": "2.5rem" }],
                "5xl": ["3rem", { "lineHeight": "3rem" }],
                "6xl": ["3.75rem", { "lineHeight": "3.75rem" }],
            },
            "spacing": {
                "1": "0.25rem",   // 4px
                "2": "0.5rem",    // 8px
                "3": "0.75rem",   // 12px
                "4": "1rem",      // 16px
                "5": "1.25rem",   // 20px
                "6": "1.5rem",    // 24px
                "8": "2rem",      // 32px
                "10": "2.5rem",   // 40px
                "12": "3rem",     // 48px
                "16": "4rem",     // 64px
                "20": "5rem",     // 80px
                "24": "6rem",     // 96px
            },
            "borderRadius": {
                "sm": "0.25rem",
                "md": "0.375rem",
                "DEFAULT": "0.5rem",
                "lg": "0.75rem",
                "xl": "1rem",
                "2xl": "1.25rem",
                "full": "9999px",
            },
            "boxShadow": {
                "sm": "0 1px 2px hsl(0 0% 0% / 0.05)",
                "md": "0 4px 6px -1px hsl(0 0% 0% / 0.1)",
                "lg": "0 10px 15px -3px hsl(0 0% 0% / 0.1)",
                "xl": "0 20px 25px -5px hsl(0 0% 0% / 0.15)",
                "glow": "0 0 20px -5px hsl(195 100% 60% / 0.4)",
            },
            "transitionTimingFunction": {
                "out": "cubic-bezier(0.33, 1, 0.68, 1)",
                "in-out": "cubic-bezier(0.65, 0, 0.35, 1)",
                "spring": "cubic-bezier(0.34, 1.56, 0.64, 1)",
            },
            "transitionDuration": {
                "instant": "50ms",
                "fast": "150ms",
                "DEFAULT": "300ms",
                "slow": "500ms",
            },
            "animation": {
                "fade-in": "fadeIn 300ms cubic-bezier(0.33, 1, 0.68, 1)",
                "fade-in-up": "fadeInUp 500ms cubic-bezier(0.33, 1, 0.68, 1)",
                "scale-in": "scaleIn 300ms cubic-bezier(0.33, 1, 0.68, 1)",
            },
            "keyframes": {
                "fadeIn": {
                    "0%": { "opacity": "0" },
                    "100%": { "opacity": "1" },
                },
                "fadeInUp": {
                    "0%": {
                        "opacity": "0",
                        "transform": "translateY(8px)",
                    },
                    "100%": {
                        "opacity": "1",
                        "transform": "translateY(0)",
                    },
                },
                "scaleIn": {
                    "0%": {
                        "opacity": "0",
                        "transform": "scale(0.95)",
                    },
                    "100%": {
                        "opacity": "1",
                        "transform": "scale(1)",
                    },
                },
            },
            "zIndex": {
                "dropdown": "100",
                "sticky": "200",
                "modal": "300",
                "popover": "400",
                "tooltip": "500",
            },
        }
    },
    "darkMode": "class",
}

if __name__ == "__main__":
    print(json.dumps(cogine_theme, indent=2))
