import {
  Activity,
  BarChart3,
  Bot,
  Building2,
  CheckCircle2,
  ClipboardList,
  Home,
  History,
  ListTodo,
  PoundSterling,
  Radio,
  Settings,
  ShoppingBag,
  Youtube,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Which snapshot counter, if any, renders as a badge. */
  badge?: 'approvals';
  section?: string;
}

export const NAVIGATION: NavItem[] = [
  { href: '/', label: 'Universe', icon: Home },
  { href: '/command', label: 'Command Centre', icon: Radio },
  { href: '/command/history', label: 'History', icon: History, section: 'Command Centre' },
  { href: '/businesses', label: 'Businesses', icon: Building2 },
  { href: '/youtube', label: 'YouTube', icon: Youtube, section: 'Businesses' },
  { href: '/etsy', label: 'Etsy', icon: ShoppingBag, section: 'Businesses' },
  { href: '/agents', label: 'Agents', icon: Bot, section: 'Workforce' },
  { href: '/missions', label: 'Missions', icon: ClipboardList, section: 'Workforce' },
  { href: '/queue', label: 'Work queue', icon: ListTodo, section: 'Workforce' },
  { href: '/tasks', label: 'Tasks', icon: ListTodo, section: 'Workforce' },
  { href: '/approvals', label: 'Approvals', icon: CheckCircle2, badge: 'approvals', section: 'Workforce' },
  { href: '/analytics', label: 'Analytics', icon: BarChart3, section: 'Insight' },
  { href: '/finance', label: 'Finance', icon: PoundSterling, section: 'Insight' },
  { href: '/activity', label: 'Activity', icon: Activity, section: 'Insight' },
  { href: '/settings', label: 'Settings', icon: Settings, section: 'Insight' },
];

/** Bottom navigation on mobile — the areas worth a thumb. */
export const MOBILE_NAVIGATION: NavItem[] = [
  { href: '/', label: 'Universe', icon: Home },
  { href: '/missions', label: 'Missions', icon: ClipboardList },
  { href: '/approvals', label: 'Approvals', icon: CheckCircle2, badge: 'approvals' },
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/settings', label: 'Settings', icon: Settings },
];
