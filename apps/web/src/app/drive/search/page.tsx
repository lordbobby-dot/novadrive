import { Suspense } from "react";
import { SearchResults } from "@/components/search/search-results";

export default function SearchResultsPage() {
  return (
    <Suspense fallback={<div className="flex-1 p-6" />}>
      <SearchResults />
    </Suspense>
  );
}
