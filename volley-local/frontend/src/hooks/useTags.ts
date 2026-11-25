import { Tag } from "../api/client";
import { useList } from "./useClips";
export const useTags = () => useList<Tag>("/tags");
