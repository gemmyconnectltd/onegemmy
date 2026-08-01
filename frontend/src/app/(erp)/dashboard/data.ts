export type Period = "today" | "week" | "month" | "last_month" | "year" | `year_${number}`;

const THIS_YEAR = new Date().getFullYear();

export const PERIODS: { key: Period; label: string }[] = [
  { key: "today",      label: "Today" },
  { key: "week",       label: "This Week" },
  { key: "month",      label: "This Month" },
  { key: "last_month", label: "Last Month" },
  { key: "year",       label: "This Year" },
];

// Past 4 years dynamically
export const PAST_YEARS: { key: Period; label: string }[] = Array.from({ length: 4 }, (_, i) => {
  const y = THIS_YEAR - 1 - i;
  return { key: `year_${y}` as Period, label: String(y) };
});

export type PeriodData = {
  sales: number; expenses: number; profit: number; cash: number;
  customers: number; target: number;
  salesChange: string; expChange: string; profitChange: string; customersChange: string;
  salesUp: boolean; expUp: boolean; profitUp: boolean; customersUp: boolean;
  chartTitle: string; chartSub: string;
  chart: { label: string; sales: number; expenses: number }[];
};

// Mock multiplier per past year (relative to "this year" data)
const YEAR_SCALE: Record<number, number> = { 1: 0.82, 2: 0.67, 3: 0.51, 4: 0.38 };

function pastYearData(year: number, offset: number): PeriodData {
  const scale = YEAR_SCALE[offset] ?? 0.3;
  const sales = Math.round(38500000 * scale);
  const expenses = Math.round(9200000 * scale);
  return {
    sales, expenses, profit: sales - expenses,
    cash: 892000, customers: Math.round(4820 * scale), target: Math.round(50000000 * scale),
    salesChange: "-", expChange: "-", profitChange: "-", customersChange: "-",
    salesUp: false, expUp: false, profitUp: false, customersUp: false,
    chartTitle: `${year} Sales`, chartSub: "Monthly revenue vs expenses",
    chart: [
      "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec",
    ].map((label, i) => {
      const base = [2800000,2600000,3100000,3400000,3200000,3600000,3800000,3500000,3300000,3700000,3900000,1600000][i];
      return { label, sales: Math.round(base * scale), expenses: Math.round(base * scale * 0.24) };
    }),
  };
}

export function getPeriodData(period: Period): PeriodData {
  if (period.startsWith("year_")) {
    const year = Number(period.replace("year_", ""));
    const offset = THIS_YEAR - year;
    return pastYearData(year, offset);
  }
  return PERIOD_DATA[period as keyof typeof PERIOD_DATA];
}

export const PERIOD_DATA: Record<string, PeriodData> = {
  today: {
    sales: 156000, expenses: 45000, profit: 111000, cash: 892000, customers: 48, target: 200000,
    salesChange: "+12%", expChange: "+5%", profitChange: "+18%", customersChange: "+3",
    salesUp: true, expUp: false, profitUp: true, customersUp: true,
    chartTitle: "Today's Sales", chartSub: "Hourly revenue vs expenses",
    chart: [
      { label: "8am",  sales: 12000, expenses: 3000 },
      { label: "10am", sales: 18000, expenses: 5000 },
      { label: "12pm", sales: 32000, expenses: 9000 },
      { label: "2pm",  sales: 28000, expenses: 8000 },
      { label: "4pm",  sales: 41000, expenses: 12000 },
      { label: "6pm",  sales: 25000, expenses: 8000 },
    ],
  },
  week: {
    sales: 843000, expenses: 210000, profit: 633000, cash: 892000, customers: 214, target: 1000000,
    salesChange: "+8%", expChange: "+3%", profitChange: "+11%", customersChange: "+18",
    salesUp: true, expUp: false, profitUp: true, customersUp: true,
    chartTitle: "This Week's Sales", chartSub: "Daily revenue vs expenses",
    chart: [
      { label: "Mon", sales: 45000, expenses: 12000 },
      { label: "Tue", sales: 38000, expenses: 8000  },
      { label: "Wed", sales: 52000, expenses: 15000 },
      { label: "Thu", sales: 41000, expenses: 9000  },
      { label: "Fri", sales: 67000, expenses: 22000 },
      { label: "Sat", sales: 73000, expenses: 18000 },
      { label: "Sun", sales: 29000, expenses: 6000  },
    ],
  },
  month: {
    sales: 3420000, expenses: 890000, profit: 2530000, cash: 892000, customers: 876, target: 4000000,
    salesChange: "+15%", expChange: "+7%", profitChange: "+21%", customersChange: "+64",
    salesUp: true, expUp: false, profitUp: true, customersUp: true,
    chartTitle: "This Month's Sales", chartSub: "Weekly revenue vs expenses",
    chart: [
      { label: "Wk 1", sales: 720000, expenses: 180000 },
      { label: "Wk 2", sales: 850000, expenses: 220000 },
      { label: "Wk 3", sales: 940000, expenses: 250000 },
      { label: "Wk 4", sales: 910000, expenses: 240000 },
    ],
  },
  last_month: {
    sales: 2980000, expenses: 830000, profit: 2150000, cash: 892000, customers: 812, target: 3500000,
    salesChange: "-5%", expChange: "-2%", profitChange: "-6%", customersChange: "-12",
    salesUp: false, expUp: true, profitUp: false, customersUp: false,
    chartTitle: "Last Month's Sales", chartSub: "Weekly revenue vs expenses",
    chart: [
      { label: "Wk 1", sales: 680000, expenses: 190000 },
      { label: "Wk 2", sales: 790000, expenses: 210000 },
      { label: "Wk 3", sales: 820000, expenses: 220000 },
      { label: "Wk 4", sales: 690000, expenses: 210000 },
    ],
  },
  year: {
    sales: 38500000, expenses: 9200000, profit: 29300000, cash: 892000, customers: 4820, target: 50000000,
    salesChange: "+32%", expChange: "+12%", profitChange: "+44%", customersChange: "+340",
    salesUp: true, expUp: false, profitUp: true, customersUp: true,
    chartTitle: "This Year's Sales", chartSub: "Monthly revenue vs expenses",
    chart: [
      { label: "Jan", sales: 2800000, expenses: 700000 },
      { label: "Feb", sales: 2600000, expenses: 650000 },
      { label: "Mar", sales: 3100000, expenses: 780000 },
      { label: "Apr", sales: 3400000, expenses: 820000 },
      { label: "May", sales: 3200000, expenses: 800000 },
      { label: "Jun", sales: 3600000, expenses: 900000 },
      { label: "Jul", sales: 3800000, expenses: 950000 },
      { label: "Aug", sales: 3500000, expenses: 870000 },
      { label: "Sep", sales: 3300000, expenses: 830000 },
      { label: "Oct", sales: 3700000, expenses: 920000 },
      { label: "Nov", sales: 3900000, expenses: 980000 },
      { label: "Dec", sales: 1600000, expenses: 400000 },
    ],
  },
};

export const RECENT_SALES = [
  { id: 1, customer: "Walk-in",  items: 3, total: 12500, time: "2 min ago",  method: "cash"   },
  { id: 2, customer: "Jean P.",  items: 1, total: 8500,  time: "18 min ago", method: "mobile" },
  { id: 3, customer: "Walk-in",  items: 5, total: 24000, time: "1 hr ago",   method: "cash"   },
  { id: 4, customer: "Marie C.", items: 2, total: 6000,  time: "2 hrs ago",  method: "card"   },
  { id: 5, customer: "David K.", items: 4, total: 18000, time: "3 hrs ago",  method: "mobile" },
];

export const TOP_PRODUCTS = [
  { name: "Phone Case - iPhone", sold: 24, revenue: 48000 },
  { name: "USB-C Cable 2m",      sold: 18, revenue: 27000 },
  { name: "Screen Protector",    sold: 15, revenue: 15000 },
  { name: "Wireless Earbuds",    sold: 9,  revenue: 81000 },
];

export const METHOD_COLOR: Record<string, string> = {
  cash:   "text-emerald-600 dark:text-emerald-400",
  mobile: "text-blue-600 dark:text-blue-400",
  card:   "text-purple-600 dark:text-purple-400",
};
