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
        // Neutros — driven por CSS vars (definidas en index.css). NO cambian por cliente.
        // El sufijo `/ <alpha-value>` es OBLIGATORIO para que funcionen los modificadores
        // de opacidad (bg-background/50, border-border/50, ring-ring/20, etc.).
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        // primary = negro casi puro. Botones, nav activo, focus, controles. Fijo.
        primary: { DEFAULT: "#1a1a1a", foreground: "#fafafa" },
        // brand = EL COLOR DEL CLIENTE. Único token que se reemplaza por empresa.
        brand: { DEFAULT: "hsl(var(--brand) / <alpha-value>)", foreground: "hsl(var(--brand-foreground) / <alpha-value>)" },
        // Neutros y semánticos fijos:
        secondary: { DEFAULT: "#f4f4f5", foreground: "#18181b" },
        destructive: { DEFAULT: "#ef4444", foreground: "#fafafa" },
        muted: { DEFAULT: "#f4f4f5", foreground: "#71717a" },
        accent: { DEFAULT: "#f4f4f5", foreground: "#18181b" },
        popover: { DEFAULT: "#ffffff", foreground: "#09090b" },
        card: { DEFAULT: "#ffffff", foreground: "#09090b" },
      },
      borderRadius: { lg: "0.5rem", md: "calc(0.5rem - 2px)", sm: "calc(0.5rem - 4px)" },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
