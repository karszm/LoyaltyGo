---
version: alpha
name: "Linear Dark System"
description: "Linear is a dark-first product development tool with a near-black (#08090a) base surface, a cool off-white (#f7f8f8) primary text color, and a muted blue-violet (#5e6ad2) brand accent used on the primary CTA. The type system is built entirely on Inter Variable with Berkeley Mono as a secondary monospace face for code tokens. Spacing follows a strict 4/8/12/24/32px rhythm. Border radii are small and utilitarian (2–12px) with pill shapes (9999px) reserved for badges and tags. The UI shell shown in the hero screenshot features a three-column app layout (sidebar nav, issue list, detail panel) that communicates the product's information density directly on the marketing page."
colors:
  brand-accent-cta: "#5e6ad2"
  status-red: "#eb5757"
  background-primary: "#08090a"
  status-green: "#27a644"
  surface-white: "#ffffff"
  text-primary: "#f7f8f8"
  text-quaternary: "#62666d"
  text-secondary: "#d0d6e0"
  text-tertiary: "#8a8f98"
  border-muted: "#23252a"
  border-subtle: "#e2e4e7"
typography:
  hero-heading:
    fontFamily: "Inter Variable"
    fontSize: "64px"
    fontWeight: "700"
    lineHeight: "1.1"
    letterSpacing: "-0.02em"
  body-default:
    fontFamily: "Inter Variable"
    fontSize: "16px"
    fontWeight: "400"
    lineHeight: "24px"
  body-small:
    fontFamily: "Inter Variable"
    fontSize: "15px"
    fontWeight: "400"
    lineHeight: "24px"
    letterSpacing: "-0.165px"
  label-default:
    fontFamily: "Inter Variable"
    fontSize: "13px"
    fontWeight: "400"
    lineHeight: "19.5px"
    letterSpacing: "-0.13px"
  label-medium:
    fontFamily: "Inter Variable"
    fontSize: "13px"
    fontWeight: "510"
  caption:
    fontFamily: "Inter Variable"
    fontSize: "12px"
    fontWeight: "400"
    lineHeight: "16.8px"
  caption-bold:
    fontFamily: "Inter Variable"
    fontSize: "12px"
    fontWeight: "510"
    lineHeight: "16.8px"
  micro-label:
    fontFamily: "Inter Variable"
    fontSize: "10px"
    fontWeight: "510"
    lineHeight: "15px"
  code-inline:
    fontFamily: "Berkeley Mono"
    fontSize: "14px"
    fontWeight: "400"
    lineHeight: "24px"
  nav-item:
    fontFamily: "Inter Variable"
    fontSize: "13px"
    fontWeight: "400"
    lineHeight: "19.5px"
    letterSpacing: "-0.13px"
rounded:
  radius-xs: "2px"
  radius-sm: "4px"
  radius-md: "6px"
  radius-lg: "8px"
  radius-xl: "12px"
  radius-2xl: "16px"
  radius-pill: "9999px"
spacing:
  space-1: "2px"
  space-2: "4px"
  space-3: "6px"
  space-4: "8px"
  space-5: "12px"
  space-6: "16px"
  space-7: "20px"
  space-8: "24px"
  space-9: "32px"
  space-10: "48px"
  space-11: "128px"
---

## Overview

Linear is a dark-first product development tool with a near-black (#08090a) base surface, a cool off-white (#f7f8f8) primary text color, and a muted blue-violet (#5e6ad2) brand accent used on the primary CTA. The type system is built entirely on Inter Variable with Berkeley Mono as a secondary monospace face for code tokens. Spacing follows a strict 4/8/12/24/32px rhythm. Border radii are small and utilitarian (2–12px) with pill shapes (9999px) reserved for badges and tags. The UI shell shown in the hero screenshot features a three-column app layout (sidebar nav, issue list, detail panel) that communicates the product's information density directly on the marketing page.

**Signature traits:**
- Dual typeface system: Pairs Inter Variable and Berkeley Mono across the type hierarchy.
- Soft, rounded geometry: Generous corner rounding up to 9999px.

## Colors

The palette uses 17 validated color tokens across 2 theme profiles. Semantic roles stay attached to observed usage so generation agents can choose accents without inventing new color meaning.

**Semantic naming:**
- **surface-background** maps to `background-primary`: Role "background" is grounded by usage context "Page and app shell base surface; near-black dark background".
- **surface-text** maps to `text-primary`: Role "text" is grounded by usage context "Primary heading and body text on dark surfaces; highest contrast foreground".
- **content-text** maps to `text-secondary`: Role "text" is grounded by usage context "Secondary labels, nav items, and supporting body text".
- **action-primary** maps to `brand-accent-cta`: Role "primary" is grounded by usage context "Primary CTA button (Sign up), links, and interactive highlights".

### Dark Theme

### Primary Brand
- **Brand Accent / CTA** (#5e6ad2): Primary CTA button (Sign up), links, and interactive highlights. Role: primary. {authored: rgb(94, 106, 210), space: rgb}
- **Status Red** (#eb5757): Error and destructive action indicators. Role: accent. {authored: rgb(235, 87, 87), space: rgb}

### Text Scale
- **Text Primary** (#f7f8f8): Primary heading and body text on dark surfaces; highest contrast foreground. Role: text. {authored: rgb(247, 248, 248), space: rgb, alpha: 0.05}
- **Text Quaternary** (#62666d): Quaternary text, code comments, and disabled states. Role: text. {authored: rgb(98, 102, 109), space: rgb}
- **Text Secondary** (#d0d6e0): Secondary labels, nav items, and supporting body text. Role: text. {authored: rgb(208, 214, 224), space: rgb}
- **Text Tertiary** (#8a8f98): Tertiary metadata, timestamps, and muted labels. Role: text. {authored: rgb(138, 143, 152), space: rgb}

### Interactive
- **Border Muted** (#23252a): Dark-mode inset ring borders on interactive elements. Role: border. {authored: rgb(35, 37, 42), space: rgb}
- **Border Subtle** (#e2e4e7): Hairline dividers and subtle panel borders. Role: border. {authored: rgb(226, 228, 231), space: rgb}

### Surface & Shadows
- **Background Primary** (#08090a): Page and app shell base surface; near-black dark background. Role: background. {authored: rgb(8, 9, 10), space: rgb}
- **Status Green** (#27a644): Success states and active/in-progress status indicators. Role: background. {authored: rgb(39, 166, 68), space: rgb, alpha: 0.07}
- **Surface White** (#ffffff): Card surfaces, modal backgrounds, and elevated panel fills. Role: background. {authored: rgb(255, 255, 255), space: rgb, alpha: 0.01}

### Light Theme

### Primary Brand
- **Brand Accent / CTA** (#5e6ad2): Primary CTA button and interactive highlights in light mode. Role: primary. {authored: rgb(94, 106, 210), space: rgb}

### Text Scale
- **Text Primary** (#08090a): Primary heading and body text on light surfaces. Role: text. {authored: rgb(8, 9, 10), space: rgb}
- **Text Secondary** (#62666d): Secondary labels and supporting body text in light mode. Role: text. {authored: rgb(98, 102, 109), space: rgb}

### Interactive
- **Border Subtle** (#e2e4e7): Hairline dividers in light mode. Role: border. {authored: rgb(226, 228, 231), space: rgb}

### Surface & Shadows
- **Background Primary** (#f7f8f8): Page base surface in light mode. Role: background. {authored: rgb(247, 248, 248), space: rgb, alpha: 0.05}
- **Surface White** (#ffffff): Card and panel surfaces in light mode. Role: background. {authored: rgb(255, 255, 255), space: rgb, alpha: 0.01}

## Typography

Typography uses Inter Variable, Berkeley Mono across extracted hierarchy roles. Keep hierarchy mapped to these token rows before adding decorative type styles.

Mixes Inter Variable and Berkeley Mono for visual contrast. Weight range spans bold, regular, semi-bold. Sizes range from 10px to 64px.

### Type Scale Evidence
| Role | Font | Size | Weight | Line Height | Letter Spacing | Stack / Features | Notes |
|------|------|------|--------|-------------|----------------|------------------|-------|
| Hero H1 — large marketing headline on dark background | Inter Variable | 64px | 700 | 1.1 | -0.02em | Inter Variable, SF Pro Display, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Open Sans, Helvetica Neue, sans-serif; features: "cv01", "ss03" | Extracted token |
| Default body text, nav items, and general UI prose | Inter Variable | 16px | 400 | 24px | normal | Inter Variable, SF Pro Display, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Open Sans, Helvetica Neue, sans-serif; features: "cv01", "ss03" | Extracted token |
| Subheadings, secondary body, and feature descriptions | Inter Variable | 15px | 400 | 24px | -0.165px | Inter Variable, SF Pro Display, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Open Sans, Helvetica Neue, sans-serif; features: "cv01", "ss03" | Extracted token |
| UI labels, sidebar nav items, and metadata | Inter Variable | 13px | 400 | 19.5px | -0.13px | Inter Variable, SF Pro Display, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Open Sans, Helvetica Neue, sans-serif; features: "cv01", "ss03" | Extracted token |
| Semi-bold labels, button text, and active nav items | Inter Variable | 13px | 510 | normal | normal | Inter Variable, SF Pro Display, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Open Sans, Helvetica Neue, sans-serif; features: "cv01", "ss03" | Extracted token |
| Captions, timestamps, and micro-labels | Inter Variable | 12px | 400 | 16.8px | normal | Inter Variable, SF Pro Display, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Open Sans, Helvetica Neue, sans-serif; features: "cv01", "ss03" | Extracted token |
| Bold captions and badge text | Inter Variable | 12px | 510 | 16.8px | normal | Inter Variable, SF Pro Display, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Open Sans, Helvetica Neue, sans-serif; features: "cv01", "ss03" | Extracted token |
| Micro labels, status chips, and icon tooltips | Inter Variable | 10px | 510 | 15px | normal | Inter Variable, SF Pro Display, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Open Sans, Helvetica Neue, sans-serif; features: "cv01", "ss03" | Extracted token |
| Inline code tokens, syntax highlighting, and monospace identifiers | Berkeley Mono | 14px | 400 | 24px | normal | Berkeley Mono, ui-monospace, SF Mono, Menlo, monospace | Extracted token |
| Top navigation and sidebar navigation items | Inter Variable | 13px | 400 | 19.5px | -0.13px | Inter Variable, SF Pro Display, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Open Sans, Helvetica Neue, sans-serif; features: "cv01", "ss03" | Extracted token |

## Layout

Responsive system uses 3 breakpoint tier(s): mobile, desktop, wide.

This system uses a 8px base grid with scale values 2, 4, 6, 8, 12, 16, 20, 24, 32, 48, 128.

### Responsive Strategy
- **mobile (<= 1280px)**: Constrain layout for small viewports and prioritize vertical stacking.
- **desktop (Unknown)**: Expand layout density and horizontal composition for wide viewports.
- **wide (>= 1536px)**: Stretch composition with generous gutters and wider layout spans.

### Spacing System
| Token | Value | Px | Notes |
|------|-------|----|-------|
| space-1 | 2px | 2 | Extracted spacing token |
| space-2 | 4px | 4 | Extracted spacing token |
| space-3 | 6px | 6 | Extracted spacing token |
| space-4 | 8px | 8 | Mapped to --block-spacing-small |
| space-5 | 12px | 12 | Extracted spacing token |
| space-6 | 16px | 16 | Mapped to --padding |
| space-7 | 20px | 20 | Mapped to --block-spacing |
| space-8 | 24px | 24 | Extracted spacing token |
| space-9 | 32px | 32 | Extracted spacing token |
| space-10 | 48px | 48 | Extracted spacing token |
| space-11 | 128px | 128 | Extracted spacing token |

## Elevation & Depth

Keep depth flat unless validated shadow or interaction evidence appears in the extraction payload. Do not invent shadows beyond this evidence boundary.

### Shadow Evidence
| Shadow Token | Layers | Details |
|--------------|--------|---------|
| n/a | 0 | No validated shadow payload |

### Interaction Signals
| Theme | Signal | Evidence |
|-------|--------|----------|
| Light | backdrop-filter | blur(4px) ; blur(20px) |
| Light | outline-color | rgba(0, 0, 0, 0) ; rgb(247, 248, 248) ; rgb(208, 214, 224) |
| Light | outline-width | 3px |
| Light | outline-offset | 0px |
| Light | transform | matrix(1, 0, 0, 1, 0, 0) ; matrix(0, 0, 0, 0, 0, 0) ; matrix(1, 0, 0, 1, -200, -200) |
| Dark | backdrop-filter | blur(4px) ; blur(20px) |
| Dark | outline-color | rgba(0, 0, 0, 0) ; rgb(247, 248, 248) ; rgb(208, 214, 224) |
| Dark | outline-width | 3px |
| Dark | outline-offset | 0px |
| Dark | transform | matrix(1, 0, 0, 1, 0, 0) ; matrix(0, 0, 0, 0, 0, 0) ; matrix(1, 0, 0, 1, -200, -200) |

## Shapes

Shape language maps directly to rounded tokens. Keep component corners consistent with the role mapping below before introducing bespoke geometry.

### Radius Roles
| Token | Value | Px | Role Mapping |
|------|-------|----|--------------|
| radius-xs | 2px | 2 | Hairline corner |
| radius-sm | 4px | 4 | Subtle corner |
| radius-md | 6px | 6 | Subtle corner |
| radius-lg | 8px | 8 | Control corner |
| radius-xl | 12px | 12 | Control corner |
| radius-2xl | 16px | 16 | Card corner |
| radius-pill | 9999px | 9999 | Large surface corner |

### Geometry Evidence
| Radius Token | Shape | Units |
|--------------|-------|-------|
| radius-xs | 2px | px |
| radius-sm | 4px | px |
| radius-md | 6px | px |
| radius-lg | 8px | px |
| radius-xl | 12px | px |
| radius-2xl | 16px | px |
| radius-pill | 9999px | px |

## Components

(none detected)

## Do's and Don'ts

Guardrails protect Dual typeface system, Soft, rounded geometry without adding unsupported visual claims.

| Do | Don't |
|----|---------|
| Do maintain consistent spacing using the base grid | Don't make unsupported claims about absent visual features |
| Do maintain WCAG AA contrast ratios (4.5:1 for normal text) | Don't mix rounded and sharp corners in the same view |
| Do use the primary color only for the single most important action per screen |  |
| Do verify evidence before writing new design-system guidance |  |

## Responsive Evidence

### Breakpoints
| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile | <= 560px | (max-width: 560px) |
| Mobile | <= 600px | (max-width: 600px) |
| Mobile | <= 640px | (max-width: 640px) |
| Breakpoint 4 | <= 768px | (max-width: 768px) |
| Breakpoint 5 | <= 1024px | (max-width: 1024px) |
| Breakpoint 6 | <= 1280px | (max-width: 1280px) |
| Desktop | >= 1536px | (min-width: 1536px) |
| Breakpoint 8 | Unknown | (any-hover: hover) |

## Agent Prompt Guide

### Example Component Prompts
- Create button component using validated primary color role and spacing tokens.
- Create card component with mapped radius role and evidence-backed elevation.
- Create form input component using inferred typography hierarchy and border roles.

### Iteration Guide
1. Start with extracted palette and typography roles only.
2. Map spacing and radius directly from token tables before visual polish.
3. Apply component patterns one section at a time and compare against source intent.
4. Keep elevation claims tied to explicit evidence in output.
5. Iterate with smallest diffs and re-check section hierarchy after each change.
