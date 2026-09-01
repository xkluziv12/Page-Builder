import { useState, type ReactNode } from "react";
import { DATASETS, DEFAULT_DATASET_ID, getDataset } from "@/data/datasets";
import { DatasetContext } from "@/contexts/dataset-context";

export function DatasetProvider({ children }: { children: ReactNode }) {
  const [activeId, setActiveId] = useState<string>(DEFAULT_DATASET_ID);
  const value = {
    activeId,
    setActiveId,
    dataset: getDataset(activeId),
    datasets: DATASETS,
  };
  return <DatasetContext.Provider value={value}>{children}</DatasetContext.Provider>;
}