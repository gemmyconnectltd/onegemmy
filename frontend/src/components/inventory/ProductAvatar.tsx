"use client";

import { useState } from "react";

const COLORS: [string, string][] = [
  ["#fde68a", "#92400e"],
  ["#bbf7d0", "#065f46"],
  ["#bfdbfe", "#1e40af"],
  ["#e9d5ff", "#6b21a8"],
  ["#fecaca", "#991b1b"],
  ["#fed7aa", "#9a3412"],
  ["#99f6e4", "#134e4a"],
  ["#f5d0fe", "#86198f"],
];

function colorFor(name: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

function initials(name: string) {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

interface ProductAvatarProps {
  name: string;
  imageUrl?: string | null;
  size?: number;
  className?: string;
}

export function ProductAvatar({ name, imageUrl, size = 32, className = "" }: ProductAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const showImage = imageUrl && !imgError;
  const [bg, text] = colorFor(name);
  const fontSize = size <= 28 ? 10 : size <= 40 ? 12 : 14;

  if (showImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={name}
        onError={() => setImgError(true)}
        className={`object-cover flex-shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center flex-shrink-0 font-bold select-none ${className}`}
      style={{ width: size, height: size, background: bg, color: text, fontSize }}
    >
      {initials(name)}
    </span>
  );
}
