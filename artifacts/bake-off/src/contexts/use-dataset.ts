import { useContext } from "react";
import { DatasetContext, type DatasetContextValue } from "@/contexts/dataset-context";

export function useDataset(): DatasetContextValue {
  const ctx = useContext(DatasetContext);
  if (!ctx) throw new Error("useDataset must be used within a DatasetProvider");
  return ctx;
}