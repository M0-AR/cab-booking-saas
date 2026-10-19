import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  Car,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock,
  Command,
  Download,
  Gauge,
  Inbox,
  Info,
  LogOut,
  MapPin,
  Menu,
  Monitor,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Route,
  Search,
  Settings,
  Shield,
  Sun,
  Trash2,
  TrendingUp,
  User,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function wrap(Icon: LucideIcon) {
  function Wrapped({ size = 20, ...props }: IconProps) {
    return <Icon size={size} strokeWidth={1.8} aria-hidden="true" {...props} />;
  }
  return Wrapped;
}

/* Legacy export names (existing imports keep working). */
export const CarIcon = wrap(Car);
export const GaugeIcon = wrap(Gauge);
export const CalendarIcon = wrap(CalendarDays);
export const UsersIcon = wrap(Users);
export const UserIcon = wrap(User);
export const ChartIcon = wrap(BarChart3);
export const SettingsIcon = wrap(Settings);
export const LogOutIcon = wrap(LogOut);
export const PlusIcon = wrap(Plus);
export const SearchIcon = wrap(Search);
export const MenuIcon = wrap(Menu);
export const XIcon = wrap(X);
export const CheckIcon = wrap(Check);
export const ClockIcon = wrap(Clock);
export const MapPinIcon = wrap(MapPin);
export const PhoneIcon = wrap(Phone);
export const PencilIcon = wrap(Pencil);
export const TrashIcon = wrap(Trash2);
export const ChevronLeftIcon = wrap(ChevronLeft);
export const ChevronRightIcon = wrap(ChevronRight);
export const ShieldIcon = wrap(Shield);
export const BuildingIcon = wrap(Building2);
export const DollarIcon = wrap(CircleDollarSign);
export const RefreshIcon = wrap(RefreshCw);

/* Additions for the refreshed shell and kit. */
export const ChevronDownIcon = wrap(ChevronDown);
export const ArrowRightIcon = wrap(ArrowRight);
export const ArrowLeftIcon = wrap(ArrowLeft);
export const MoreIcon = wrap(MoreHorizontal);
export const SunIcon = wrap(Sun);
export const MoonIcon = wrap(Moon);
export const MonitorIcon = wrap(Monitor);
export const CommandIcon = wrap(Command);
export const InfoIcon = wrap(Info);
export const AlertIcon = wrap(AlertTriangle);
export const CheckCircleIcon = wrap(CheckCircle2);
export const InboxIcon = wrap(Inbox);
export const RouteIcon = wrap(Route);
export const WalletIcon = wrap(Wallet);
export const TrendingUpIcon = wrap(TrendingUp);
export const PanelCollapseIcon = wrap(PanelLeftClose);
export const PanelExpandIcon = wrap(PanelLeftOpen);
export const DownloadIcon = wrap(Download);
