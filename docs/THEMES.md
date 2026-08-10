### Adding a Theme to Alethe

Adding a custom theme is a great first contribution—it's visual, self-contained, and satisfying. However, because Alethe splits its interface layout and terminal panes, a theme actually touches **seven different files**. 

If you miss a step, things fail quietly. For example, skipping the CSS tokens means your theme appears in the picker but renders with the old layout's colors. Skipping the xterm object means your application container updates but the text inside the terminal window stays exactly the same. 

Follow this checklist from top to bottom to make sure your theme integrates cleanly. 

### The 7 Touchpoints

### 1. Register the Theme ID

Add your theme's unique identifier string to the central type union. 

* **File:** src/lib/types.ts

typescript

// Look near line 61 and append your string key:
export type Theme = 'dark' | 'light' | 'nord' | 'your-theme-id';

Use code with caution.

### 2. Configure the Swatch Preview

Add an entry to the THEME_OPTIONS array. This controls the 3-color circular badge displayed inside the settings dropdown container. 

* **File:** src/lib/themes.ts

typescript

{ id: 'nord', colors: ['#2e3440', '#88c0d0', '#eceff4'] },

Use code with caution.

* **Swatch Rules:** The array format maps strictly to [Background, Accent, Foreground]. Select values that capture the primary characteristics of your palette.

### 3. Implement the UI Token Variables

This block controls the actual CSS custom variables for the interface frame, panels, and borders. 

* **File:** src/styles/theme.css
* **Action:** Wrap your variables inside a [data-theme='<id>'] structural block using the nord setup as an accurate implementation template:

css

[data-theme='nord'] {
  --bg: #2e3440;
  --bg-elevated: #3b4252;
  --bg-sunken: #242933;
  --panel: #434c5e;
  --panel-hover: #4c566a;
  --border: #4c566a;
  --border-strong: rgba(236, 239, 244, 0.24);
  --fg: #eceff4;
  /* ... copy other theme custom tokens here ... */
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.54);
}

Use code with caution.

* **Note on Inheritance:** Read through the global :root block at the top of the file. If certain secondary or fallback tokens fit your design perfectly, you can safely omit them here because they inherit from :root automatically.

### 4. English Localization

Add the user-facing name and description string keys to the flat dictionary. 

* **File:** src/lib/i18n/messages/en.ts

typescript

/* ---- theme labels ---- */
'theme.nord.label': 'Nord',
'theme.nord.desc': 'Cool blues and soft contrast.',

Use code with caution.

### 5. Portuguese (pt-BR) Localization

Duplicate the keys in the Portuguese file to ensure regional users don't see broken layout tags. If you do not speak Portuguese, use a machine translation tool or mirror the English label text for the maintainers to adjust later. 

* **File:** src/lib/i18n/messages/pt-BR.ts

typescript

/* ---- theme labels ---- */
'theme.nord.label': 'Nord',
'theme.nord.desc': 'Azuis frios e contraste suave.',

Use code with caution.

### 6. Map the Terminal Palette Profile

Because terminal pane components rely on an isolated rendering module (xterm.js), they cannot read standard CSS variables. You must explicitly define your console variables here. 

* **File:** src/components/XTermView/xtermThemes.ts
* **Action:** Define your constant profile object at the top, then register it with a conditional handler switch inside the getXtermTheme utility function:

typescript

const NORD_THEME = {
  background: '#2e3440',
  foreground: '#eceff4',
  cursor: '#eceff4',
  selectionBackground: '#4c566a',
  // Note: Optional ANSI overrides (black, red, green, etc.) can be included here
} as const;

export function getXtermTheme(theme: Theme) {
  // Add your target check branch here:
  if (theme === 'nord') return NORD_THEME;
  /* ... existing theme conditions ... */
  return DARK_THEME;
}

Use code with caution.

### 7. Link App Graphic Icon Variants

Add structural support properties mapping icon variations. 

* **Asset Location:** src/assets/theme-icons/<your-theme-id>.png
* **File Linker:** src/lib/themeIcons.ts
* **Asset Rules:** Save your asset strictly as a transparent .png. Ensure your dimensions mirror the existing nord.png profile constraints perfectly.

### Contrast & Design Guidelines

Developers rely on Alethe for hours at a time during intense work sessions. 

* **Avoid Eye-Strain:** Refrain from incorporating highly abrasive, over-saturated neon contrast pairs.
* **Verify Clarity:** Make sure text elements pass clear readability evaluations over their relative background panels.

### How to Test Your Local Changes

The best way to verify your work end-to-end is to build a dummy throwaway theme file block: 

1. Run npm run dev to start the local developer runtime engine.
2. Go to **Preferences > Appearance** inside your browser view.
3. Switch to your new theme. Check both the overall UI layout containers *and* an open terminal panel.
4. Confirm everything transitions smoothly without color bleeding, then delete your scratch work before pushing your PR updates!
