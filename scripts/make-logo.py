"""
HESERIA — Íconos y pantallas de inicio a partir del logo oficial.

    python3 scripts/make-logo.py

Lee docs/marca/logo-heseria.png (marca oscura con línea turquesa sobre gris claro), separa el
símbolo del fondo y genera:
  · PWA: public/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png,
    badge-96.png (silueta blanca para la barra de estado) y logo-mark*.png (para la app).
  · Android: mipmaps del ícono (normal, redondo y capa adaptable) y pantallas de inicio.
  · iOS: AppIcon 1024 y Splash 2732.
Si cambia el logo, se reemplaza el PNG y se vuelve a ejecutar.
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs/marca/logo-heseria.png"
LIGHT_BG = (234, 234, 234)  # fondo del logo
DARK_BG = (15, 17, 23)      # fondo de la app (#0F1117)
INK = (42, 50, 53)          # trazo oscuro del logo
TEAL = (98, 163, 181)       # línea turquesa
SNOW = (241, 243, 245)      # trazo claro para fondos oscuros


def mark(ink=INK):
    """Símbolo sin fondo (RGBA), colores planos y bordes suavizados."""
    im = np.asarray(Image.open(SRC).convert("RGB")).astype(float)
    bg = np.array(LIGHT_BG, float)
    dist = np.linalg.norm(im - bg, axis=2)
    teal = (im[..., 2] - im[..., 0]) > 35
    full = np.where(teal, np.linalg.norm(np.array(TEAL) - bg), np.linalg.norm(np.array(INK) - bg))
    alpha = np.clip(dist / full, 0, 1)
    alpha[alpha < 0.12] = 0  # ruido del fondo
    rgb = np.where(teal[..., None], np.array(TEAL, float), np.array(ink, float))
    out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    img = Image.fromarray(out, "RGBA")
    # Solo el símbolo: la palabra HESERIA queda debajo (y > 1240).
    top = img.crop((0, 0, img.width, 1240))
    return top.crop(top.getbbox())


def square(sym, size, bg, scale, radius=0):
    """Símbolo centrado ocupando `scale` del lado, sobre `bg` (None = transparente)."""
    canvas = Image.new("RGBA", (size, size), (*bg, 255) if bg else (0, 0, 0, 0))
    w = int(size * scale)
    h = int(sym.height * w / sym.width)
    s = sym.resize((w, h), Image.LANCZOS)
    canvas.alpha_composite(s, ((size - w) // 2, (size - h) // 2))
    if radius:
        m = Image.new("L", (size, size), 0)
        ImageDraw.Draw(m).rounded_rectangle((0, 0, size - 1, size - 1), radius, fill=255)
        canvas.putalpha(m)
    return canvas


def save(img, path, rgb=False):
    path = ROOT / path
    path.parent.mkdir(parents=True, exist_ok=True)
    (img.convert("RGB") if rgb else img).save(path, optimize=True)


def main():
    dark, light = mark(), mark(SNOW)
    white = Image.new("RGBA", dark.size, (255, 255, 255, 0))
    white.putalpha(dark.getchannel("A"))

    # PWA
    save(square(dark, 192, LIGHT_BG, 0.72), "public/icon-192.png")
    save(square(dark, 512, LIGHT_BG, 0.72), "public/icon-512.png")
    save(square(dark, 512, LIGHT_BG, 0.58), "public/icon-maskable-512.png")
    save(square(dark, 180, LIGHT_BG, 0.68), "public/apple-touch-icon.png", rgb=True)
    save(square(white, 96, None, 0.9), "public/badge-96.png")
    save(square(dark, 256, None, 1), "public/logo-mark.png")
    save(square(light, 256, None, 1), "public/logo-mark-light.png")

    # Android: ícono clásico (cuadrado redondeado y círculo) y capa adaptable 108dp.
    res = "android/app/src/main/res"
    for d, px in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
        save(square(dark, px, LIGHT_BG, 0.7, radius=px // 6), f"{res}/mipmap-{d}/ic_launcher.png")
        save(square(dark, px, LIGHT_BG, 0.66, radius=px // 2), f"{res}/mipmap-{d}/ic_launcher_round.png")
        fg = px * 9 // 4
        save(square(dark, fg, None, 0.46), f"{res}/mipmap-{d}/ic_launcher_foreground.png")
    # Ícono de la barra de estado para los avisos (silueta blanca, Android lo tiñe).
    for d, px in {"mdpi": 24, "hdpi": 36, "xhdpi": 48, "xxhdpi": 72, "xxxhdpi": 96}.items():
        save(square(white, px, None, 0.92), f"{res}/drawable-{d}/ic_stat_notify.png")
    # Pantalla de inicio de Android 12+: símbolo claro sobre el fondo de la app.
    save(square(light, 432, None, 0.5), f"{res}/drawable/splash_icon.png")
    for f in sorted((ROOT / res).glob("drawable*/splash.png")):
        w, h = Image.open(f).size
        img = Image.new("RGBA", (w, h), (*DARK_BG, 255))
        side = int(min(w, h) * 0.32)
        s = square(light, side, None, 1)
        img.alpha_composite(s, ((w - side) // 2, (h - side) // 2))
        save(img, f.relative_to(ROOT), rgb=True)

    # iOS (sin transparencia, la App Store la rechaza)
    ios = "ios/App/App/Assets.xcassets"
    save(square(dark, 1024, LIGHT_BG, 0.68), f"{ios}/AppIcon.appiconset/AppIcon-512@2x.png", rgb=True)
    splash = square(light, 2732, DARK_BG, 0.26)
    for name in ("splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"):
        save(splash, f"{ios}/Splash.imageset/{name}", rgb=True)
    print("listo")


if __name__ == "__main__":
    main()
