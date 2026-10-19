# Local application fonts

Geist and Geist Mono variable fonts (weights 100–900) are bundled so development and production builds do not depend on Google Fonts network access. The root layout loads them with `next/font/local`, retaining the existing CSS variables.

Official sources:
- https://github.com/google/fonts/tree/main/ofl/geist
- https://github.com/google/fonts/tree/main/ofl/geistmono

Both fonts use the SIL Open Font License in `OFL.txt`. Keep that license with redistributed font files. Update font binaries deliberately rather than downloading them during a build.
