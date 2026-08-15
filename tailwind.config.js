/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html', './index.tsx', './App.tsx',
    './components/**/*.{ts,tsx}', './contexts/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}', './config/**/*.{ts,tsx}', './utils/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    container: { center: true, padding: "2rem", screens: { "2xl": "1400px" } },
    extend: {
      colors: {
        // TODOS los tokens semánticos van por CSS vars (definidas en index.css, con override `.dark`).
        // El sufijo `/ <alpha-value>` es OBLIGATORIO para que funcionen los modificadores de opacidad
        // (bg-background/50, border-border/50, ring-ring/20, bg-primary/40, etc.).
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        // primary = negro casi puro en claro, se invierte a blanco en oscuro (botones/nav activo/focus).
        primary: { DEFAULT: "hsl(var(--primary) / <alpha-value>)", foreground: "hsl(var(--primary-foreground) / <alpha-value>)" },
        // brand = EL COLOR DEL CLIENTE. Único token que se reemplaza por empresa (en oscuro se aclara para verse).
        brand: { DEFAULT: "hsl(var(--brand) / <alpha-value>)", foreground: "hsl(var(--brand-foreground) / <alpha-value>)" },
        // Neutros y semánticos (claro/oscuro por variable):
        secondary: { DEFAULT: "hsl(var(--secondary) / <alpha-value>)", foreground: "hsl(var(--secondary-foreground) / <alpha-value>)" },
        destructive: { DEFAULT: "hsl(var(--destructive) / <alpha-value>)", foreground: "hsl(var(--destructive-foreground) / <alpha-value>)" },
        muted: { DEFAULT: "hsl(var(--muted) / <alpha-value>)", foreground: "hsl(var(--muted-foreground) / <alpha-value>)" },
        accent: { DEFAULT: "hsl(var(--accent) / <alpha-value>)", foreground: "hsl(var(--accent-foreground) / <alpha-value>)" },
        popover: { DEFAULT: "hsl(var(--popover) / <alpha-value>)", foreground: "hsl(var(--popover-foreground) / <alpha-value>)" },
        card: { DEFAULT: "hsl(var(--card) / <alpha-value>)", foreground: "hsl(var(--card-foreground) / <alpha-value>)" },
      },
      borderRadius: { lg: "0.5rem", md: "calc(0.5rem - 2px)", sm: "calc(0.5rem - 4px)" },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
