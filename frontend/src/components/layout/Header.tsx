import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, Sun, Moon, Menu, Search } from "lucide-react";
import { HEADER_HEIGHT } from "../../utils/constants";

interface HeaderProps {
  sidebarWidth: number;
  darkMode: boolean;
  onToggleTheme: () => void;
  onMenuClick?: () => void;
}

export default function Header({ sidebarWidth, darkMode, onToggleTheme, onMenuClick }: HeaderProps) {
  const navigate = useNavigate();
  const [searchQ, setSearchQ] = useState("");

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQ.trim();
    if (q) {
      navigate(`/vessels?search=${encodeURIComponent(q)}`);
      setSearchQ("");
    }
  };

  return (
    <header
      className="fixed top-0 z-20 flex items-center gap-2 border-b border-base-300 bg-base-100 px-3 transition-[width,margin-left] duration-200 ease-in-out md:px-4"
      style={{
        height: HEADER_HEIGHT,
        width: `calc(100% - ${sidebarWidth}px)`,
        marginLeft: sidebarWidth,
      }}
    >
      {onMenuClick && (
        <button onClick={onMenuClick} className="btn btn-ghost btn-square btn-sm text-base-content/60">
          <Menu size={18} />
        </button>
      )}

      <div className="flex shrink-0 items-center gap-2">
        <h1 className="whitespace-nowrap text-base font-semibold text-base-content sm:text-lg">
          Statistik AIS
        </h1>
        <span className="badge badge-success badge-sm hidden font-semibold sm:inline-flex">Live</span>
      </div>

      <form
        onSubmit={handleSearchSubmit}
        className="mx-0 hidden max-w-[360px] flex-1 items-center gap-1.5 rounded-lg border border-base-300 bg-base-200 px-3 py-1.5 focus-within:border-secondary sm:mx-2 sm:flex"
      >
        <Search size={18} className="shrink-0 text-base-content/60" />
        <input
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          placeholder="Cari MMSI, nama kapal..."
          aria-label="cari kapal"
          className="w-full flex-1 bg-transparent text-[13px] text-base-content placeholder:text-base-content/60 focus:outline-none"
        />
      </form>

      <div className="ml-auto flex gap-1">
        <button className="btn btn-ghost btn-square btn-sm text-base-content/60">
          <RefreshCw size={18} />
        </button>
        <button onClick={onToggleTheme} className="btn btn-ghost btn-square btn-sm text-base-content/60">
          {darkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
}
