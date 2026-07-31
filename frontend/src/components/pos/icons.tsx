import {
  Activity, Apple, Armchair, Baby, Backpack, Banana, Bandage, BatteryCharging,
  Bed, Beer, Bird, BookOpen, Bone, Cable, CakeSlice, Calculator, Camera, Candy,
  Car, Cat, Citrus, Coffee, Cookie, Container, Croissant, CupSoda, Disc, Dog,
  DoorOpen, Droplets, Drumstick, Egg, Fish, Flower, Footprints, Gauge, Glasses,
  Grid3x3, Hammer, Headphones, Images, KeyRound, Laptop, Layers, Lightbulb,
  Link, Luggage, Martini, Milk, Monitor, Mouse, Notebook, Package, Paintbrush,
  PawPrint, Pencil, Pill, Plug, Printer, Radio, Ruler, Salad, Scissors, Shirt,
  ShoppingBasket, Smartphone, Snowflake, Soup, Sparkles, SprayCan, Square,
  Stethoscope, StickyNote, Syringe, Volume2, Wheat, Wine, Wrench,
} from "lucide-react";

import type { Product } from "./types";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const PICKABLE = [
  Activity, Apple, Armchair, Baby, Backpack, Banana, Bandage, BatteryCharging,
  Bed, Beer, Bird, BookOpen, Bone, Cable, CakeSlice, Calculator, Camera, Candy,
  Car, Cat, Citrus, Coffee, Cookie, Container, Croissant, CupSoda, Disc, Dog,
  DoorOpen, Droplets, Drumstick, Egg, Fish, Flower, Footprints, Gauge, Glasses,
  Grid3x3, Hammer, Headphones, Images, KeyRound, Laptop, Layers, Lightbulb,
  Link, Luggage, Martini, Milk, Monitor, Mouse, Notebook, Package, Paintbrush,
  PawPrint, Pencil, Pill, Plug, Printer, Radio, Ruler, Salad, Scissors, Shirt,
  ShoppingBasket, Smartphone, Snowflake, Soup, Sparkles, SprayCan, Square,
  Stethoscope, StickyNote, Syringe, Volume2, Wheat, Wine, Wrench,
] as const;

export type IconComponent = (typeof PICKABLE)[number];

const EMOJI_ICON: Record<string, IconComponent> = {
  "🍚": Wheat, "🫙": Container, "🍬": Candy, "🌽": Wheat, "🍞": Croissant,
  "🥛": Milk, "🥤": CupSoda, "💧": Droplets, "🧴": SprayCan, "🧻": Container,
  "🧊": Snowflake, "🍵": Coffee, "🍅": Citrus, "🧅": Citrus, "🍌": Banana,
  "🥑": Citrus, "🥚": Egg, "🧂": Sparkles, "🍪": Cookie, "🔌": Plug,
  "🔋": BatteryCharging, "🎧": Headphones, "🔊": Volume2, "📺": Monitor,
  "🖱️": Mouse, "💻": Laptop, "📱": Smartphone, "🔗": Link, "👕": Shirt,
  "👖": Shirt, "👚": Shirt, "👗": Shirt, "🩱": Shirt, "🧥": Shirt,
  "🪢": Link, "🧣": Shirt, "🧢": Shirt, "🕶️": Glasses, "👟": Footprints,
  "👞": Footprints, "🥿": Footprints, "👠": Footprints, "🩴": Footprints,
  "🥾": Footprints, "🩰": Footprints, "⚽": Disc, "🔨": Hammer, "🪛": Wrench,
  "📏": Ruler, "🔒": KeyRound, "💡": Lightbulb, "🚰": Droplets, "🔩": Wrench,
  "🎨": Paintbrush, "🖌️": Paintbrush, "💊": Pill, "🍊": Citrus, "🍯": Coffee,
  "😷": Syringe, "🩹": Bandage, "🍼": Baby, "🩺": Stethoscope, "📓": Notebook,
  "🖊️": Pencil, "📖": BookOpen, "🗒️": StickyNote, "🖍️": Pencil,
  "🖨️": Printer, "📐": Ruler, "🎒": Backpack, "🧮": Calculator, "🪑": Armchair,
  "🛋️": Armchair, "🪵": Layers, "🛏️": Bed, "🛌": Bed, "🚪": DoorOpen,
  "🗄️": Container, "📚": BookOpen, "🪞": Images, "💄": Sparkles, "✏️": Pencil,
  "💇": Scissors, "💅": Sparkles, "🌸": Flower, "🔲": Square, "📶": Radio,
  "🚗": Car, "🤳": Camera, "🐶": Dog, "🐱": Cat, "🐦": Bird, "🐟": Fish,
  "🐾": PawPrint, "🦴": Bone, "🐕": Dog, "🧳": Luggage, "🥐": Croissant,
  "🍩": Candy, "🧁": CakeSlice, "🥯": Croissant, "🥧": CakeSlice, "🎂": CakeSlice,
  "🥟": Soup, "🧋": CupSoda, "🍺": Beer, "🍻": Beer, "🍷": Wine, "🍾": Wine,
  "🥃": Martini, "🍸": Martini, "🧃": CupSoda, "🐔": Drumstick, "🍗": Drumstick,
  "🪣": Container, "🍟": Soup, "🥗": Salad,
};

export function getProductIcon(product: Pick<Product, "emoji">): IconComponent {
  return EMOJI_ICON[product.emoji ?? ""] ?? Package;
}

const TILE_COLORS = [
  "#6f1a07", "#0f766e", "#b45309", "#1d4ed8", "#be185d", "#7c3aed",
  "#059669", "#b91c1c", "#4338ca", "#0e7490", "#a16207", "#be123c",
];

export function productAccent(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return TILE_COLORS[hash % TILE_COLORS.length];
}

interface IconBadgeProps {
  Icon: IconComponent;
  size?: number;
  color: string;
  bg?: string;
  rounded?: string;
  className?: string;
}

export function IconBadge({ Icon, size = 16, color, bg, rounded = "rounded-xl", className = "" }: IconBadgeProps) {
  return (
    <div
      className={`flex items-center justify-center flex-shrink-0 ${rounded} ${className}`}
      style={{ backgroundColor: bg ?? `${color}18` }}
    >
      <Icon size={size} style={{ color }} strokeWidth={1.8} />
    </div>
  );
}
