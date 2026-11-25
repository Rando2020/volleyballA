import { create } from "zustand";
import { Filter } from "../api/client";
export const empty: Filter = {
  include: [],
  exclude: [],
  logic: "any",
  min: 0,
  max: null,
  low: 0,
  high: 100,
  star: false,
  player: 0,
  search: "",
};
export const useStudio = create<{
  filter: Filter;
  setFilter: (v: Filter) => void;
}>((set) => ({ filter: empty, setFilter: (filter) => set({ filter }) }));
