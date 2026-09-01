import { createContext } from "react";
import type { Dataset } from "@/data/datasets";

export interface DatasetContextValue {
  activeId: string;
  setActiveId: (id: string) => void;
  dataset: Dataset;
  datasets: Dataset[];
}

/** Kept in a dependency-free module so data/provider HMR cannot replace it. */
export const DatasetContext = createContext<DatasetContextValue | null>(null);
