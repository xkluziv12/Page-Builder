import { createContext, useContext, useState, type ReactNode } from "react";
import { DATASETS, DEFAULT_DATASET_ID, getDataset, type Dataset } from "@/data/datasets";

interface DatasetContextValue {
  activeId: string;
  setActiveId: (id: string) => void;
  dataset: Dataset;
  datasets: Dataset[];
}

const DatasetContext = createContext<DatasetContextValue | null>(null);

export function DatasetProvider({ children }: { children: ReactNode }) {
  const [activeId, setActiveId] = useState<string>(DEFAULT_DATASET_ID);
  const value: DatasetContextValue = {
    activeId,
    setActiveId,
    dataset: getDataset(activeId),
    datasets: DATASETS,
  };
  return <DatasetContext.Provider value={value}>{children}</DatasetContext.Provider>;
}

export function useDataset(): DatasetContextValue {
  const ctx = useContext(DatasetContext);
  if (!ctx) throw new Error("useDataset must be used within a DatasetProvider");
  return ctx;
}
