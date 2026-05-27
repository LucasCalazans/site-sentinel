/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{ts,tsx}'],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
                mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
            },
            colors: {
                // Aliases pra identidade visual (zinc-950 base, cyan accent).
                surface: {
                    base: 'rgb(9 9 11)',         // zinc-950
                    panel: 'rgb(24 24 27 / 0.5)', // zinc-900/50
                    border: 'rgb(39 39 42)',      // zinc-800
                },
            },
            keyframes: {
                'fade-in': {
                    '0%': { opacity: '0', transform: 'translateY(2px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
            },
            animation: {
                'fade-in': 'fade-in 200ms ease-out',
            },
        },
    },
    plugins: [],
};
