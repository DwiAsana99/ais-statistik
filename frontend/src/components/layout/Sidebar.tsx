import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Ship,
  TrendingUp,
  Map as MapIcon,
  BarChart3,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Router,
  ShieldCheck,
  Route,
  Anchor,
  Gauge,
  ListChecks,
  CalendarDays,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH, NAV_GROUPS } from "../../utils/constants";

const ICONS: Record<string, LucideIcon> = {
  Dashboard: LayoutDashboard,
  DirectionsBoat: Ship,
  TrendingUp: TrendingUp,
  Map: MapIcon,
  Assessment: BarChart3,
  Sync: RefreshCw,
  Message: MessageSquare,
  Router: Router,
  VerifiedUser: ShieldCheck,
  Route: Route,
  Anchor: Anchor,
  Speed: Gauge,
  Rule: ListChecks,
  CalendarMonth: CalendarDays,
  Settings: Settings,
};

interface SidebarProps {
  open: boolean;
  onToggle: () => void;
  mobile?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ open, onToggle, mobile = false, onClose }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const expanded = mobile ? true : open;
  const width = expanded ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH;

  const handleNavigate = (path: string) => {
    navigate(path);
    if (mobile && onClose) onClose();
  };

  const panel = (
    <nav
      className="flex h-full flex-col overflow-hidden border-r border-base-300 bg-base-100 transition-[width] duration-200 ease-in-out"
      style={{ width: mobile ? SIDEBAR_WIDTH : width }}
    >
      <div
        className={`flex h-16 shrink-0 items-center border-b border-base-300 ${expanded ? "justify-between px-4" : "justify-center"}`}
      >
        {expanded && (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-content">
              U
            </div>
            <div>
              <p className="text-sm font-bold leading-tight text-base-content">UVMS</p>
              <p className="text-[10px] text-base-content/60">Modul Statistik AIS</p>
            </div>
          </div>
        )}
        {!mobile && (
          <button onClick={onToggle} className="btn btn-ghost btn-square btn-sm text-base-content/60">
            {open ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
        )}
      </div>

      <ul className="menu w-full flex-1 flex-nowrap gap-0.5 overflow-y-auto overflow-x-hidden px-2 pt-2">
        {NAV_GROUPS.map((group, gi) => (
          <li key={gi} className="w-full">
            {group.groupLabel && expanded && (
              <span className={`px-2 text-[10px] font-bold tracking-wider text-base-content/50 ${gi === 0 ? "pt-1" : "pt-2"} pb-0.5`}>
                {group.groupLabel}
              </span>
            )}
            <ul className="w-full">
              {group.items.map((item) => {
                const Icon = ICONS[item.icon];
                const isActive = !item.disabled && location.pathname === item.path;
                return (
                  <li key={item.path} className="w-full">
                    <button
                      disabled={item.disabled}
                      onClick={() => !item.disabled && handleNavigate(item.path)}
                      title={!expanded ? item.label : undefined}
                      className={`flex w-full items-center gap-3 rounded-lg py-2 text-[13px] transition-colors ${expanded ? "justify-start px-3" : "justify-center px-0"} ${
                        isActive
                          ? "border-l-[3px] border-secondary bg-base-200 font-semibold text-base-content"
                          : "border-l-[3px] border-transparent text-base-content/60 hover:bg-base-200 disabled:opacity-40 disabled:hover:bg-transparent"
                      }`}
                    >
                      <Icon size={19} className={isActive ? "text-secondary" : "text-base-content/60"} />
                      {expanded && <span className="truncate">{item.label}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );

  if (mobile) {
    return (
      <>
        {open && <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />}
        <div
          className={`fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-in-out ${open ? "translate-x-0" : "-translate-x-full"}`}
        >
          {panel}
        </div>
      </>
    );
  }

  return <div className="fixed inset-y-0 left-0 z-30">{panel}</div>;
}
