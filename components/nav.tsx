import {
  LayoutDashboard,
  LineChart,
  Zap,
  Store,
  SlidersHorizontal,
  Landmark,
  Newspaper,
  Bell,
  ListOrdered,
  Wallet,
  Activity,
  Flame,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** href relative to /app; trade points at a default symbol */
  href: string;
}

export const NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/app/dashboard" },
  { id: "trade", label: "Trade", icon: LineChart, href: "/app/trade/RELIANCE" },
  { id: "pulse", label: "Pulse", icon: Zap, href: "/app/pulse" },
  { id: "markets", label: "Markets", icon: Store, href: "/app/markets" },
  { id: "movers", label: "Movers", icon: Flame, href: "/app/movers" },
  { id: "options", label: "Options", icon: SlidersHorizontal, href: "/app/options" },
  { id: "buildup", label: "Buildup", icon: Activity, href: "/app/buildup" },
  { id: "fiidii", label: "FII/DII", icon: Landmark, href: "/app/fiidii" },
  { id: "news", label: "News", icon: Newspaper, href: "/app/news" },
  { id: "alerts", label: "Alerts", icon: Bell, href: "/app/alerts" },
  { id: "orders", label: "Orders", icon: ListOrdered, href: "/app/orders" },
  { id: "portfolio", label: "Portfolio", icon: Wallet, href: "/app/portfolio" },
];
