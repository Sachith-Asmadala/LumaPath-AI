# DOC-F34 governed market taxonomy ingestion

This worker accepts **aggregate observations only**. It does not scrape individual job descriptions or the open web.

Provider adapters must:

1. map every batch to a `market_sources` record already approved for licensing, trust, bias review and region scope;
2. submit aggregate role/skill shares, dates, sample sizes, methodology and provenance URLs only;
3. never store applicant identities, student data, individual job-description bodies, private recruiter content or copyrighted full text;
4. preserve source retention and max-age policies;
5. fail closed when a source is blocked, stale, low-trust, outside its approved region, or awaiting bias review;
6. use `MarketTaxonomyService.ingest()` so governance rules cannot be bypassed;
7. keep signal calculation separate from taxonomy proposals;
8. never publish a taxonomy change. Publication is a separate human `taxonomy_reviewer` action.

The fixture runner is for controlled development and competition demonstrations only.
