"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Trademark = {
  name: string; number: string; owner: string; status: string;
  classes: string; jurisdiction: string; filingDate: string;
};
type SearchResponse = {
  records: Trademark[]; page: number; totalPages: number; totalElements: number;
  mode: "live" | "demo"; message?: string;
};
const PAGE_SIZE = 10;

export default function Home() {
  const [term, setTerm] = useState("");
  const [submittedTerm, setSubmittedTerm] = useState("");
  const [page, setPage] = useState(0);
  const [searchRun, setSearchRun] = useState(0);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!submittedTerm) return;
    const controller = new AbortController();
    async function search() {
      setLoading(true); setError("");
      try {
        const response = await fetch("/api/trademarks?name=" + encodeURIComponent(submittedTerm) + "&page=" + page, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Search could not be completed. Please try again.");
        setData(body as SearchResponse);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.");
        setData(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void search();
    return () => controller.abort();
  }, [submittedTerm, page, searchRun]);

  const range = useMemo(() => {
    if (!data?.totalElements) return "";
    const first = page * PAGE_SIZE + 1;
    const last = Math.min((page + 1) * PAGE_SIZE, data.totalElements);
    return first.toLocaleString() + "–" + last.toLocaleString() + " of " + data.totalElements.toLocaleString();
  }, [data, page]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = term.trim();
    if (!clean) return;
    setPage(0); setData(null); setSubmittedTerm(clean); setSearchRun((run) => run + 1);
  }
  function clear() { setTerm(""); setSubmittedTerm(""); setData(null); setPage(0); setError(""); }

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Himanshu Trademark Search home">
          <span className="brand-mark" aria-hidden="true">H</span>
          <span>Himanshu <strong>Trademark Search</strong></span>
        </a>
        <a className="source-link" href="https://www.euipo.europa.eu/en/trade-marks/before-applying/availability" target="_blank" rel="noreferrer">About trademark searches <span aria-hidden="true">↗</span></a>
      </header>

      <section className={"search-area " + (submittedTerm ? "has-results" : "")} id="top">
        <div className="eyebrow"><span className="eyebrow-dot" /> EUIPO TRADEMARK DATABASE</div>
        <h1>Find a mark.<br /><span>Know what’s there.</span></h1>
        <p className="intro">Search trademark names across the European Union Intellectual Property Office register.</p>
        <form className="search-form" onSubmit={submit}>
          <label className="sr-only" htmlFor="trademark-name">Trademark or brand name</label>
          <span className="search-icon" aria-hidden="true" />
          <input id="trademark-name" value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Enter trademark or brand name" autoComplete="off" />
          {term && <button className="clear-button" type="button" onClick={clear} aria-label="Clear search">×</button>}
          <button className="submit-button" type="submit" disabled={!term.trim() || loading}>
            {loading ? <><span className="spinner" /> Searching</> : <>Search <span aria-hidden="true">→</span></>}
          </button>
        </form>
        <div className="search-note"><span aria-hidden="true">↳</span> Search matches words in trademark names. Results are for reference and may not include every national register.</div>
      </section>

      {error && <div className="error-banner" role="alert"><strong>Search unavailable</strong><span>{error}</span></div>}
      {submittedTerm && !error && <section className="results" aria-live="polite">
        <div className="results-heading">
          <div><div className="eyebrow">SEARCH RESULTS</div><h2>“{submittedTerm}”</h2></div>
          {data && <div className="result-meta"><span className={"mode-pill " + data.mode}>{data.mode === "live" ? "LIVE · EUIPO" : "DEMO DATA"}</span>{data.totalElements > 0 && <span className="result-count">{range}</span>}</div>}
        </div>
        {data?.mode === "demo" && <div className="demo-notice"><strong>Demo mode</strong> — no EUIPO credentials are configured. These illustrative sample rows are synthetic and are not real trademark records.</div>}
        {loading && !data ? <div className="loading-row"><span className="spinner dark" /> Retrieving trademark records…</div> : data && data.records.length === 0 ? <div className="empty-state"><span className="empty-symbol">⌕</span><strong>No matches found</strong><span>Try a different spelling or a shorter search term.</span></div> : data && <>
          <div className="table-wrap"><table>
            <thead><tr><th>TRADEMARK</th><th>APPLICATION / REGISTRATION</th><th>OWNER / APPLICANT</th><th>STATUS</th><th>NICE CLASS</th><th>JURISDICTION</th><th>FILING DATE</th></tr></thead>
            <tbody>{data.records.map((row, index) => <tr key={row.number + "-" + index}>
              <td className="mark-cell">{row.name}</td><td className="number-cell">{row.number}</td><td>{row.owner}</td>
              <td><span className="status"><i />{row.status}</span></td><td>{row.classes}</td><td>{row.jurisdiction}</td><td>{row.filingDate}</td>
            </tr>)}</tbody>
          </table></div>
          {data.totalPages > 1 && <nav className="pagination" aria-label="Search result pages">
            <button onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0 || loading}>← <span>Previous</span></button>
            <span>Page {page + 1} <span className="page-divider">/</span> {data.totalPages}</span>
            <button onClick={() => setPage((current) => Math.min(data.totalPages - 1, current + 1))} disabled={page + 1 >= data.totalPages || loading}><span>Next</span> →</button>
          </nav>}
          {data.mode === "live" && <p className="data-note">Records returned by the EUIPO Trademark Search API. Always check the official register for current details.</p>}
        </>}
      </section>}
      <footer className="footer"><span>Himanshu Trademark Search</span><span>Trademark data provided by EUIPO when live access is configured.</span><a href="https://dev.euipo.europa.eu/" target="_blank" rel="noreferrer">EUIPO API Portal ↗</a></footer>
    </main>
  );
}
