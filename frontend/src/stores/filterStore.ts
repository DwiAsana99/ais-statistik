import { create } from "zustand";
import dayjs, { Dayjs } from "dayjs";

interface FilterState {
  dateFrom: Dayjs;
  dateTo: Dayjs;
  period: string;
  shipType: string | null;
  searchQuery: string;
  setPeriod: (period: string) => void;
  setDateRange: (from: Dayjs, to: Dayjs) => void;
  setShipType: (type: string | null) => void;
  setSearchQuery: (query: string) => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  dateFrom: dayjs().subtract(7, "day"),
  dateTo: dayjs(),
  period: "7d",
  shipType: null,
  searchQuery: "",

  setPeriod: (period: string) => {
    const now = dayjs();
    const ranges: Record<string, [Dayjs, Dayjs]> = {
      today: [now.startOf("day"), now],
      yesterday: [now.subtract(1, "day").startOf("day"), now.subtract(1, "day").endOf("day")],
      "7d": [now.subtract(7, "day"), now],
      "30d": [now.subtract(30, "day"), now],
    };
    const [from, to] = ranges[period] || [now.subtract(7, "day"), now];
    set({ period, dateFrom: from, dateTo: to });
  },

  setDateRange: (from: Dayjs, to: Dayjs) =>
    set({ dateFrom: from, dateTo: to, period: "custom" }),

  setShipType: (type: string | null) => set({ shipType: type }),

  setSearchQuery: (query: string) => set({ searchQuery: query }),
}));
