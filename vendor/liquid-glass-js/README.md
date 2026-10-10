# Liquid Glass JS source

Source: https://github.com/dashersw/liquid-glass-js (main, fetched October 8, 2026).
Original button.js, container.js, glass.css and MIT license are retained here.

ClientDesk uses the container's refraction shaders under public/effects/glass.*
through src/components/liquid-effects.tsx and glass-buttons.tsx. A shared rendered
texture, translucent CSS backdrop and rim highlights style native buttons/links.
The original DOM-generating classes are retained for reference, not injected into
React-managed forms. The app does not capture document screenshots; the shader
samples a decorative texture. No html2canvas dependency or external runtime CDN
is required. Source copyright is retained in LICENSE and public/licenses/.
