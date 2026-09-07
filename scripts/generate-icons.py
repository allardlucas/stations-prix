#!/usr/bin/env python3
"""Rasterize the app pump mark into PNG icons (192 / 512 / apple 180)."""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "icons"

BG = (11, 13, 16, 255)
FG = (243, 243, 244, 255)
WINDOW = (11, 13, 16, 255)
PRICE = (245, 158, 11, 255)


def png_rgba(width: int, height: int, pixels: bytearray) -> bytes:
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)
        raw.extend(pixels[y * stride : (y + 1) * stride])

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    return b"".join(
        [
            b"\x89PNG\r\n\x1a\n",
            chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)),
            chunk(b"IDAT", zlib.compress(bytes(raw), 9)),
            chunk(b"IEND", b""),
        ]
    )


def set_px(buf: bytearray, n: int, x: int, y: int, color: tuple[int, int, int, int]) -> None:
    if 0 <= x < n and 0 <= y < n:
        i = (y * n + x) * 4
        buf[i : i + 4] = bytes(color)


def fill_rect(
    buf: bytearray,
    n: int,
    x0: float,
    y0: float,
    x1: float,
    y1: float,
    color: tuple[int, int, int, int],
) -> None:
    for y in range(max(0, int(math.floor(y0))), min(n, int(math.ceil(y1)))):
        for x in range(max(0, int(math.floor(x0))), min(n, int(math.ceil(x1)))):
            set_px(buf, n, x, y, color)


def fill_circle(
    buf: bytearray,
    n: int,
    cx: float,
    cy: float,
    r: float,
    color: tuple[int, int, int, int],
) -> None:
    r2 = r * r
    y0 = max(0, int(cy - r - 1))
    y1 = min(n, int(cy + r + 2))
    x0 = max(0, int(cx - r - 1))
    x1 = min(n, int(cx + r + 2))
    for y in range(y0, y1):
        for x in range(x0, x1):
            if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r2:
                set_px(buf, n, x, y, color)


def fill_round_rect(
    buf: bytearray,
    n: int,
    x: float,
    y: float,
    w: float,
    h: float,
    r: float,
    color: tuple[int, int, int, int],
) -> None:
    r = min(r, w / 2, h / 2)
    fill_rect(buf, n, x + r, y, x + w - r, y + h, color)
    fill_rect(buf, n, x, y + r, x + w, y + h - r, color)
    fill_circle(buf, n, x + r, y + r, r, color)
    fill_circle(buf, n, x + w - r, y + r, r, color)
    fill_circle(buf, n, x + r, y + h - r, r, color)
    fill_circle(buf, n, x + w - r, y + h - r, r, color)


def stroke_bezier(
    buf: bytearray,
    n: int,
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
    width: float,
    color: tuple[int, int, int, int],
) -> None:
    steps = max(48, n // 4)
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        x = (
            u**3 * p0[0]
            + 3 * u**2 * t * p1[0]
            + 3 * u * t**2 * p2[0]
            + t**3 * p3[0]
        )
        y = (
            u**3 * p0[1]
            + 3 * u**2 * t * p1[1]
            + 3 * u * t**2 * p2[1]
            + t**3 * p3[1]
        )
        fill_circle(buf, n, x, y, width / 2, color)


def paint_mark(buf: bytearray, n: int) -> None:
    fill_rect(buf, n, 0, 0, n, n, BG)
    s = n / 512
    fill_round_rect(buf, n, 168 * s, 140 * s, 150 * s, 210 * s, 22 * s, FG)
    fill_round_rect(buf, n, 196 * s, 172 * s, 94 * s, 64 * s, 10 * s, WINDOW)
    fill_round_rect(buf, n, 210 * s, 196 * s, 66 * s, 16 * s, 4 * s, PRICE)
    stroke_bezier(
        buf,
        n,
        (318 * s, 176 * s),
        (398 * s, 178 * s),
        (408 * s, 268 * s),
        (348 * s, 298 * s),
        28 * s,
        FG,
    )
    fill_round_rect(buf, n, 328 * s, 286 * s, 36 * s, 22 * s, 5 * s, FG)
    fill_round_rect(buf, n, 196 * s, 350 * s, 94 * s, 36 * s, 6 * s, FG)


def downsample(src: bytearray, src_n: int, factor: int) -> bytearray:
    out_n = src_n // factor
    out = bytearray(out_n * out_n * 4)
    area = factor * factor
    for y in range(out_n):
        for x in range(out_n):
            acc = [0, 0, 0, 0]
            for dy in range(factor):
                for dx in range(factor):
                    i = ((y * factor + dy) * src_n + (x * factor + dx)) * 4
                    acc[0] += src[i]
                    acc[1] += src[i + 1]
                    acc[2] += src[i + 2]
                    acc[3] += src[i + 3]
            o = (y * out_n + x) * 4
            out[o] = acc[0] // area
            out[o + 1] = acc[1] // area
            out[o + 2] = acc[2] // area
            out[o + 3] = acc[3] // area
    return out


def draw_icon(n: int) -> bytes:
    factor = 4
    hi = n * factor
    buf = bytearray(hi * hi * 4)
    paint_mark(buf, hi)
    return png_rgba(n, n, downsample(buf, hi, factor))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "icon-192.png").write_bytes(draw_icon(192))
    (OUT / "icon-512.png").write_bytes(draw_icon(512))
    (OUT / "apple-touch-icon.png").write_bytes(draw_icon(180))
    print(f"wrote {OUT}/icon-192.png, icon-512.png, apple-touch-icon.png")


if __name__ == "__main__":
    main()
