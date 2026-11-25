import React from "react";
import { createRoot } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
} from "@tanstack/react-query";
import { toast } from "sonner";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-600.css";
import "./style.css";
import Studio from "./App";
import { Toast } from "./components/Toast";
const client = new QueryClient({
  queryCache: new QueryCache({ onError: (e) => toast.error(e.message) }),
  defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false } },
});
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <Studio />
      <Toast />
    </QueryClientProvider>
  </React.StrictMode>,
);
