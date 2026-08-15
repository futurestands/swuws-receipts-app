"use client"

import {
  LayoutDashboard,
  Users,
  BarChart3,
  Wallet,
  ListChecks,
  AlertTriangle,
  Gauge,
  FileBarChart,
  ShieldCheck,
  Receipt,
  Search,
  History,
  Activity,
  Upload,
  CheckSquare,
  ShieldAlert,
  FileText,
  User,
  Database,
  Calendar,
  TrendingUp,
  Calculator,
  AlertCircle,
  WifiOff,
  Printer,
  Usb,
  Bluetooth,
  Settings2,
  type LucideIcon
} from "lucide-react"

export const ICON_MAP = {
  LayoutDashboard,
  Users,
  BarChart3,
  Wallet,
  ListChecks,
  AlertTriangle,
  Gauge,
  FileBarChart,
  ShieldCheck,
  Receipt,
  Search,
  History,
  Activity,
  Upload,
  CheckSquare,
  ShieldAlert,
  FileText,
  User,
  Database,
  Calendar,
  TrendingUp,
  Calculator,
  AlertCircle,
  WifiOff,
  Printer,
  Usb,
  Bluetooth,
  Settings2,
} as const

export type IconName = keyof typeof ICON_MAP

export function DynamicIcon({ name, ...props }: { name: IconName } & React.ComponentProps<LucideIcon>) {
  const Icon = ICON_MAP[name]
  if (!Icon) return null
  return <Icon {...props} />
}
